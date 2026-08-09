begin;

-- AquaGuard browser authorization is derived from public.profiles. This
-- SECURITY DEFINER helper avoids recursive profiles RLS evaluation while
-- returning only the caller's role. Blocked accounts receive no operational
-- role and therefore cannot pass any role-based policy below.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog
set row_security = off
as $function$
    select p.role::text
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.role::text in (
          'admin',
          'barangay_officer',
          'disaster_responder',
          'resident'
      )
      and lower(coalesce(p.status::text, '')) = 'active'
    limit 1
$function$;

alter function public.current_user_role() owner to postgres;
revoke all on function public.current_user_role() from public, anon, authenticated, service_role;
grant execute on function public.current_user_role() to authenticated, service_role;

-- Public sign-up metadata is controlled by the person signing up. Never trust
-- a requested role from that metadata: only an existing Admin or a trusted
-- service-role request may assign a non-resident role.
create or replace function public.enforce_profile_role_security()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_role text := public.current_user_role();
    jwt_role text := coalesce((select auth.role()), '');
begin
    if tg_op = 'INSERT'
       and actor_role is distinct from 'admin'
       and jwt_role <> 'service_role'
       and current_user <> 'service_role' then
        new.role := 'resident';
        new.status := 'active';
    elsif tg_op = 'UPDATE'
          and actor_role is distinct from 'admin'
          and jwt_role <> 'service_role'
          and current_user <> 'service_role'
          and (
              new.role::text is distinct from old.role::text
              or new.status::text is distinct from old.status::text
          ) then
        raise exception 'Only an administrator may change profile role or status.'
            using errcode = '42501';
    end if;

    if new.role is null
       or new.role::text not in (
           'admin',
           'barangay_officer',
           'disaster_responder',
           'resident'
       ) then
        raise exception 'Invalid AquaGuard profile role.'
            using errcode = '22023';
    end if;

    return new;
end
$function$;

alter function public.enforce_profile_role_security() owner to postgres;
revoke all on function public.enforce_profile_role_security() from public, anon, authenticated, service_role;

drop trigger if exists aquaguard_profiles_role_guard on public.profiles;
create trigger aquaguard_profiles_role_guard
before insert or update on public.profiles
for each row
execute function public.enforce_profile_role_security();

-- RLS determines which alert rows may be updated, while this trigger limits
-- the columns each operational role may change. Without this guard, a
-- responder who can acknowledge an alert could also resolve or rewrite it by
-- issuing a direct REST request.
create or replace function public.enforce_alert_update_permissions()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_role text := public.current_user_role();
    jwt_role text := coalesce((select auth.role()), '');
begin
    if jwt_role = 'service_role'
       or current_user = 'service_role'
       or actor_role = 'admin' then
        return new;
    end if;

    if actor_role = 'barangay_officer' then
        if (
            to_jsonb(new) - array['is_read', 'is_resolved']::text[]
        ) is distinct from (
            to_jsonb(old) - array['is_read', 'is_resolved']::text[]
        ) then
            raise exception 'Barangay officers may only acknowledge or resolve alerts.'
                using errcode = '42501';
        end if;

        return new;
    end if;

    if actor_role = 'disaster_responder' then
        if (to_jsonb(new) - 'is_read') is distinct from
           (to_jsonb(old) - 'is_read') then
            raise exception 'Disaster responders may only acknowledge alerts.'
                using errcode = '42501';
        end if;

        if new.is_read is distinct from true then
            raise exception 'Disaster responders may mark alerts as read but not unread.'
                using errcode = '42501';
        end if;

        return new;
    end if;

    raise exception 'This role may not update alerts.'
        using errcode = '42501';
end
$function$;

alter function public.enforce_alert_update_permissions() owner to postgres;
revoke all on function public.enforce_alert_update_permissions() from public, anon, authenticated, service_role;

drop trigger if exists aquaguard_alerts_update_guard on public.alerts;
create trigger aquaguard_alerts_update_guard
before update on public.alerts
for each row
execute function public.enforce_alert_update_permissions();

-- Officers currently toggle advisory state but do not edit advisory content.
-- Admin retains full update authority. The service role remains available for
-- trusted backend work and is never exposed to browser clients.
create or replace function public.enforce_advisory_update_permissions()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
    actor_role text := public.current_user_role();
    jwt_role text := coalesce((select auth.role()), '');
begin
    if jwt_role = 'service_role'
       or current_user = 'service_role'
       or actor_role = 'admin' then
        return new;
    end if;

    if actor_role = 'barangay_officer' then
        if (to_jsonb(new) - 'is_active') is distinct from
           (to_jsonb(old) - 'is_active') then
            raise exception 'Barangay officers may only toggle advisory status.'
                using errcode = '42501';
        end if;

        if new.is_active is null then
            raise exception 'Advisory status must be active or inactive.'
                using errcode = '22004';
        end if;

        return new;
    end if;

    raise exception 'This role may not update evacuation advisories.'
        using errcode = '42501';
end
$function$;

alter function public.enforce_advisory_update_permissions() owner to postgres;
revoke all on function public.enforce_advisory_update_permissions() from public, anon, authenticated, service_role;

drop trigger if exists aquaguard_advisories_update_guard on public.evacuation_advisories;
create trigger aquaguard_advisories_update_guard
before update on public.evacuation_advisories
for each row
execute function public.enforce_advisory_update_permissions();

-- Replace any legacy/permissive policies on the audited user-facing tables so
-- an old USING (true) write policy cannot silently widen the rules below.
do $block$
declare
    existing_policy record;
begin
    for existing_policy in
        select schemaname, tablename, policyname
        from pg_policies
        where schemaname = 'public'
          and tablename::text = any (array[
              'profiles',
              'stations',
              'water_levels',
              'alerts',
              'settings',
              'weather_readings',
              'yolo_detections',
              'announcements',
              'camera_sources',
              'detector_results',
              'evacuation_advisories',
              'maintenance_logs',
              'response_logs',
              'safety_reminders'
          ]::text[])
    loop
        execute format(
            'drop policy if exists %I on %I.%I',
            existing_policy.policyname,
            existing_policy.schemaname,
            existing_policy.tablename
        );
    end loop;
end
$block$;

alter table public.profiles enable row level security;
alter table public.stations enable row level security;
alter table public.water_levels enable row level security;
alter table public.alerts enable row level security;
alter table public.settings enable row level security;
alter table public.weather_readings enable row level security;
alter table public.yolo_detections enable row level security;
alter table public.announcements enable row level security;
alter table public.camera_sources enable row level security;
alter table public.detector_results enable row level security;
alter table public.evacuation_advisories enable row level security;
alter table public.maintenance_logs enable row level security;
alter table public.response_logs enable row level security;
alter table public.safety_reminders enable row level security;

-- Remove inherited/browser grants before adding only the operations used by
-- AquaGuard. RLS then narrows each granted operation by application role.
revoke all on table
    public.profiles,
    public.stations,
    public.water_levels,
    public.alerts,
    public.settings,
    public.weather_readings,
    public.yolo_detections,
    public.announcements,
    public.camera_sources,
    public.detector_results,
    public.evacuation_advisories,
    public.maintenance_logs,
    public.response_logs,
    public.safety_reminders
from public, anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.stations to authenticated;
grant select on table public.water_levels to authenticated;
grant select, insert, update, delete on table public.alerts to authenticated;
grant select, insert, update, delete on table public.settings to authenticated;
grant select on table public.weather_readings to authenticated;
grant select on table public.yolo_detections to authenticated;
grant select, insert, update, delete on table public.announcements to authenticated;
grant select on table public.detector_results to authenticated;
grant select, insert, update, delete on table public.evacuation_advisories to authenticated;
grant select on table public.maintenance_logs to authenticated;
grant select, insert, update on table public.response_logs to authenticated;
grant select on table public.safety_reminders to authenticated;

-- BYPASSRLS does not replace SQL table privileges. Preserve explicit DML
-- access for the trusted server-side service role without creating any
-- equivalent browser policy.
grant select, insert, update, delete on table
    public.profiles,
    public.stations,
    public.water_levels,
    public.alerts,
    public.settings,
    public.weather_readings,
    public.yolo_detections,
    public.announcements,
    public.camera_sources,
    public.detector_results,
    public.evacuation_advisories,
    public.maintenance_logs,
    public.response_logs,
    public.safety_reminders
to service_role;

-- Profiles: every user can load only their own full profile. Admin is the only
-- browser role that can enumerate or mutate the base table.
create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (
    id = (select auth.uid())
    or public.current_user_role() = 'admin'
);

create policy profiles_admin_insert
on public.profiles
for insert
to authenticated
with check (public.current_user_role() = 'admin');

create policy profiles_admin_update
on public.profiles
for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy profiles_admin_delete
on public.profiles
for delete
to authenticated
using (public.current_user_role() = 'admin');

-- Stations are operational reference data for every signed-in role, but only
-- Admin may manage station records and thresholds.
create policy stations_authenticated_select
on public.stations
for select
to authenticated
using (
    public.current_user_role() in (
        'admin',
        'barangay_officer',
        'disaster_responder',
        'resident'
    )
);

create policy stations_admin_insert
on public.stations
for insert
to authenticated
with check (public.current_user_role() = 'admin');

create policy stations_admin_update
on public.stations
for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy stations_admin_delete
on public.stations
for delete
to authenticated
using (public.current_user_role() = 'admin');

-- Detector/weather measurements are written by the service-role backend and
-- are read-only for all browser roles.
create policy water_levels_authenticated_select
on public.water_levels
for select
to authenticated
using (
    public.current_user_role() in (
        'admin',
        'barangay_officer',
        'disaster_responder',
        'resident'
    )
);

create policy weather_readings_authenticated_select
on public.weather_readings
for select
to authenticated
using (
    public.current_user_role() in (
        'admin',
        'barangay_officer',
        'disaster_responder',
        'resident'
    )
);

create policy yolo_detections_authenticated_select
on public.yolo_detections
for select
to authenticated
using (
    public.current_user_role() in (
        'admin',
        'barangay_officer',
        'disaster_responder',
        'resident'
    )
);

create policy detector_results_operations_select
on public.detector_results
for select
to authenticated
using (
    public.current_user_role() in (
        'admin',
        'barangay_officer',
        'disaster_responder'
    )
);

-- Alerts use one shared is_read flag; this remains a global acknowledgement,
-- not a per-user read receipt. The update trigger above enforces role-specific
-- columns after this row-level policy admits the request.
create policy alerts_authenticated_select
on public.alerts
for select
to authenticated
using (
    public.current_user_role() in (
        'admin',
        'barangay_officer',
        'disaster_responder',
        'resident'
    )
);

create policy alerts_admin_insert
on public.alerts
for insert
to authenticated
with check (public.current_user_role() = 'admin');

create policy alerts_operations_update
on public.alerts
for update
to authenticated
using (
    public.current_user_role() in (
        'admin',
        'barangay_officer',
        'disaster_responder'
    )
)
with check (
    public.current_user_role() in (
        'admin',
        'barangay_officer',
        'disaster_responder'
    )
);

create policy alerts_admin_delete
on public.alerts
for delete
to authenticated
using (public.current_user_role() = 'admin');

-- Settings are Admin-only. Full camera-source records are backend-only because
-- stream_url may contain RTSP credentials; browser users receive only the
-- sanitized fields returned by get_camera_source_status() below.
create policy settings_admin_select
on public.settings
for select
to authenticated
using (public.current_user_role() = 'admin');

create policy settings_admin_insert
on public.settings
for insert
to authenticated
with check (public.current_user_role() = 'admin');

create policy settings_admin_update
on public.settings
for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy settings_admin_delete
on public.settings
for delete
to authenticated
using (public.current_user_role() = 'admin');

-- Announcements are visible to every role. Officers own their rows; Admin may
-- manage any row.
create policy announcements_authenticated_select
on public.announcements
for select
to authenticated
using (
    public.current_user_role() in (
        'admin',
        'barangay_officer',
        'disaster_responder',
        'resident'
    )
);

create policy announcements_admin_or_officer_insert
on public.announcements
for insert
to authenticated
with check (
    public.current_user_role() = 'admin'
    or (
        public.current_user_role() = 'barangay_officer'
        and created_by = (select auth.uid())
    )
);

create policy announcements_admin_or_owner_update
on public.announcements
for update
to authenticated
using (
    public.current_user_role() = 'admin'
    or (
        public.current_user_role() = 'barangay_officer'
        and created_by = (select auth.uid())
    )
)
with check (
    public.current_user_role() = 'admin'
    or (
        public.current_user_role() = 'barangay_officer'
        and created_by = (select auth.uid())
    )
);

create policy announcements_admin_or_owner_delete
on public.announcements
for delete
to authenticated
using (
    public.current_user_role() = 'admin'
    or (
        public.current_user_role() = 'barangay_officer'
        and created_by = (select auth.uid())
    )
);

-- Advisories are readable by all. Officers create owned rows, may toggle the
-- active state on any advisory for operational continuity, and may delete only
-- rows they issued. Admin retains full management.
create policy evacuation_advisories_authenticated_select
on public.evacuation_advisories
for select
to authenticated
using (
    public.current_user_role() in (
        'admin',
        'barangay_officer',
        'disaster_responder',
        'resident'
    )
);

create policy evacuation_advisories_admin_or_officer_insert
on public.evacuation_advisories
for insert
to authenticated
with check (
    public.current_user_role() = 'admin'
    or (
        public.current_user_role() = 'barangay_officer'
        and issued_by = (select auth.uid())
    )
);

create policy evacuation_advisories_admin_or_officer_update
on public.evacuation_advisories
for update
to authenticated
using (
    public.current_user_role() in ('admin', 'barangay_officer')
)
with check (
    public.current_user_role() in ('admin', 'barangay_officer')
);

create policy evacuation_advisories_admin_or_owner_delete
on public.evacuation_advisories
for delete
to authenticated
using (
    public.current_user_role() = 'admin'
    or (
        public.current_user_role() = 'barangay_officer'
        and issued_by = (select auth.uid())
    )
);

-- Coordination entries are visible to the operations team. Officers and
-- responders may create and update only rows whose existing responder_id owner
-- matches their authenticated user ID. No browser role may delete logs.
create policy response_logs_operations_select
on public.response_logs
for select
to authenticated
using (
    public.current_user_role() in (
        'admin',
        'barangay_officer',
        'disaster_responder'
    )
);

create policy response_logs_owner_insert
on public.response_logs
for insert
to authenticated
with check (
    public.current_user_role() in (
        'barangay_officer',
        'disaster_responder'
    )
    and responder_id = (select auth.uid())
);

create policy response_logs_owner_update
on public.response_logs
for update
to authenticated
using (
    public.current_user_role() in (
        'barangay_officer',
        'disaster_responder'
    )
    and responder_id = (select auth.uid())
)
with check (
    public.current_user_role() in (
        'barangay_officer',
        'disaster_responder'
    )
    and responder_id = (select auth.uid())
);

-- There is no current browser mutation for these tables. Admin can inspect
-- maintenance records; residents can read published safety reminders.
create policy maintenance_logs_admin_select
on public.maintenance_logs
for select
to authenticated
using (public.current_user_role() = 'admin');

create policy safety_reminders_admin_or_resident_select
on public.safety_reminders
for select
to authenticated
using (public.current_user_role() in ('admin', 'resident'));

-- Ordinary views can run with their owner's privileges and bypass base-table
-- RLS. Remove the earlier view names and expose the two narrow cross-row reads
-- only through audited SECURITY DEFINER RPCs with fixed return columns.
drop view if exists public.profile_directory;
drop view if exists public.camera_source_status;

drop function if exists public.get_profile_directory();
create function public.get_profile_directory()
returns table (
    id text,
    name text,
    role text
)
language sql
stable
security definer
set search_path = pg_catalog
set row_security = off
as $function$
    with viewer as (
        select
            public.current_user_role() as role,
            (select auth.uid()) as user_id
    )
    select
        profile.id::text,
        profile.name::text,
        profile.role::text
    from public.profiles as profile
    cross join viewer
    where profile.id = viewer.user_id
       or viewer.role = 'admin'
       or (
           viewer.role in ('barangay_officer', 'disaster_responder')
           and (
               exists (
                   select 1
                   from public.response_logs as log
                   where log.responder_id = profile.id
               )
               or exists (
                   select 1
                   from public.announcements as announcement
                   where announcement.created_by = profile.id
               )
               or exists (
                   select 1
                   from public.evacuation_advisories as advisory
                   where advisory.issued_by = profile.id
               )
           )
       )
       or (
           viewer.role = 'resident'
           and exists (
               select 1
               from public.evacuation_advisories as advisory
               where advisory.issued_by = profile.id
           )
       )
$function$;

alter function public.get_profile_directory() owner to postgres;
comment on function public.get_profile_directory() is
    'Returns only id, name, and role for profile rows relevant to the authenticated AquaGuard user.';

revoke all on function public.get_profile_directory() from public, anon, authenticated, service_role;
grant execute on function public.get_profile_directory() to authenticated;

create view public.profile_directory
with (security_invoker = true, security_barrier = true)
as
select
    directory.id,
    directory.name,
    directory.role
from public.get_profile_directory() as directory;

alter view public.profile_directory owner to postgres;
comment on view public.profile_directory is
    'SECURITY INVOKER compatibility view exposing only get_profile_directory() display fields.';

revoke all on table public.profile_directory from public, anon, authenticated, service_role;
grant select on table public.profile_directory to authenticated;

drop function if exists public.get_camera_source_status(text);
create function public.get_camera_source_status(
    requested_station_id text default null
)
returns table (
    id text,
    station_id text,
    cam_label text,
    stream_type text,
    is_active boolean
)
language sql
stable
security definer
set search_path = pg_catalog
set row_security = off
as $function$
    select
        source.id::text,
        source.station_id::text,
        source.cam_label::text,
        source.stream_type::text,
        source.is_active
    from public.camera_sources as source
    where public.current_user_role() in (
        'admin',
        'barangay_officer',
        'disaster_responder'
    )
      and (
          requested_station_id is null
          or source.station_id::text = requested_station_id
      )
    order by source.cam_label::text nulls last
$function$;

alter function public.get_camera_source_status(text) owner to postgres;
comment on function public.get_camera_source_status(text) is
    'Returns non-secret camera labels and status without exposing stream_url or credentials.';

revoke all on function public.get_camera_source_status(text) from public, anon, authenticated, service_role;
grant execute on function public.get_camera_source_status(text) to authenticated;

create view public.camera_source_status
with (security_invoker = true, security_barrier = true)
as
select
    source.id,
    source.station_id,
    source.cam_label,
    source.stream_type,
    source.is_active
from public.get_camera_source_status(null::text) as source;

alter view public.camera_source_status owner to postgres;
comment on view public.camera_source_status is
    'SECURITY INVOKER compatibility view exposing only non-secret camera status fields.';

revoke all on table public.camera_source_status from public, anon, authenticated, service_role;
grant select on table public.camera_source_status to authenticated;

commit;
