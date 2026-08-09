# AquaGuard role access matrix

This document describes the browser permissions implemented by
`20260809000000_aquaguard_rls_policies.sql`. Frontend route guards improve the
user experience, but Supabase RLS is the authorization boundary.

`public.current_user_role()` reads the signed-in user's `profiles.role` without
recursing through profile policies. Accounts whose profile status is
not exactly `active` receive no operational role. The trusted Python
detector/weather process continues to use a backend-only service-role key and
is not granted browser write policies.

## Permissions

| Resource | Admin | Barangay Officer | Disaster Responder | Resident |
| --- | --- | --- | --- | --- |
| `profiles` | Read, Create, Update, Delete | Read own | Read own | Read own |
| `get_profile_directory()` RPC | Read display fields | Read relevant display fields | Read relevant display fields | Read own and advisory issuer display fields |
| `profile_directory` compatibility view | Read display fields | Read relevant display fields | Read relevant display fields | Read own and advisory issuer display fields |
| `stations` | Read, Create, Update, Delete | Read | Read | Read |
| `water_levels` | Read | Read | Read | Read |
| `alerts` | Read, Create, Update, Delete | Read, acknowledge, resolve/reopen | Read, acknowledge | Read |
| `settings` | Read, Create, Update, Delete | None | None | None |
| `weather_readings` | Read | Read | Read | Read |
| `yolo_detections` | Read | Read | Read | Read |
| `announcements` | Read, Create, Update, Delete | Read, Create Own, Update Own, Delete Own | Read | Read |
| `camera_sources` | None (service role only) | None | None | None |
| `get_camera_source_status(text)` RPC | Read sanitized fields | Read sanitized fields | Read sanitized fields | None |
| `camera_source_status` compatibility view | Read sanitized fields | Read sanitized fields | Read sanitized fields | None |
| `detector_results` | Read | Read | Read | None |
| `evacuation_advisories` | Read, Create, Update, Delete | Read, Create Own, toggle status, Delete Own | Read | Read |
| `maintenance_logs` | Read | None | None | None |
| `response_logs` | Read | Read, Create Own, Update Own | Read, Create Own, Update Own | None |
| `safety_reminders` | Read | None | None | Read |

`water_levels`, `weather_readings`, `yolo_detections`, and `detector_results`
have no authenticated browser write policy. `maintenance_logs` and
`safety_reminders` also have no current browser mutation, so they remain
browser read-only for the roles that use them.

## Current client mutations

- Admin Users creates/upserts and updates `profiles`; user deletion is
  represented by profile status changes in the current UI. Admin Settings
  updates the signed-in Admin's profile details.
- Admin Monitoring Stations creates, updates, enables/disables, and deletes
  `stations`.
- Admin Settings and Camera Settings upsert `settings`.
- Admin Dashboard and Admin Live Monitoring create `alerts`; Admin Alerts
  updates and deletes alerts.
- Admin Dashboard creates `announcements`.
- Officer Alerts changes only `is_read` and `is_resolved`.
- Officer Dashboard, Officer Announcements, and Officer Coordinate create
  announcements with `created_by = auth.uid()`; Officer Announcements updates
  or deletes only owned rows.
- Officer Dashboard and Officer Evacuation Advisories create advisories with
  `issued_by = auth.uid()`. Officer Evacuation Advisories toggles `is_active`
  and deletes only owned rows.
- Officer Coordinate creates or updates owned `response_logs` with
  `responder_id = auth.uid()`.
- Responder Emergency Alerts changes only the shared `alerts.is_read` flag.
- Responder Response Logs creates or updates only rows whose `responder_id`
  matches the signed-in user.
- Resident pages perform no Supabase insert, update, upsert, or delete.

Trigger guards enforce the alert and advisory column restrictions because RLS
controls rows, not which columns within an admitted row may change.

## Important security behavior

- Public registration creates Resident accounts only. A profile trigger forces
  untrusted sign-up metadata to `resident`; only an existing Admin or the
  service role can assign another role.
- Non-Admin users can read their complete own profile, but display-name lookups
  use `get_profile_directory()`, which exposes only `id`, `name`, and `role`.
- Live Monitoring uses `get_camera_source_status(text)`, which exposes only
  `id`, `station_id`, `cam_label`, `stream_type`, and `is_active`. The base
  `camera_sources` table and `stream_url` are not available to browser roles.
- Both narrow cross-row reads use audited `SECURITY DEFINER` RPCs with a
  `pg_catalog`-only search path, fully qualified table references, fixed return
  columns, and no dynamic SQL. Their legacy relation names are retained only as
  `security_invoker`/`security_barrier` compatibility views; the view owner does
  not provide table privileges.
- `alerts.is_read` is global. An Officer or Responder acknowledgement changes
  the shared alert row for everyone. Residents cannot change it. Per-user read
  receipts require a separate schema design and are not claimed here.
- Officers may toggle any advisory so an on-duty officer can activate or
  deactivate current guidance, but may delete only advisories they issued.
- No policy is added for `anon`. Trusted backend writes rely on the Supabase
  service role's `BYPASSRLS` behavior; the service key must remain server-side.

## Route audit

All `/admin/*`, `/officer/*`, `/responder/*`, and `/resident/*` routes in
`src/App.jsx` use `ProtectedRoute` with exactly the matching role. The generic
`/supabase-test` route remains authenticated-only and can read only what RLS
allows. Route checks are not a substitute for the policies above.

## Required deployed tests

Run these with real test users and JWTs after applying the migration to a
staging Supabase project:

1. Confirm each role can load its own profile and every routed page.
2. Attempt direct REST writes (not just UI actions) for every `None` or `Read`
   matrix cell and confirm PostgreSQL rejects them.
3. As a Resident, attempt to set `profiles.role`, `alerts.is_read`, and every
   operational table mutation; all must fail.
4. As a Responder, acknowledge an alert, then attempt to change
   `is_resolved`, alert content, another user's response log, and any advisory;
   only `is_read` on alerts and owned response updates must pass.
5. As an Officer, resolve/reopen an alert, manage an owned announcement, toggle
   an advisory, and manage an owned response log. Attempts to spoof
   `created_by`, `issued_by`, or `responder_id`, delete another officer's rows,
   or modify settings/stations/camera sources must fail.
6. As Admin, exercise Users, Monitoring Stations, Settings, Camera Settings,
   Alerts, announcements, and advisories. Confirm direct SELECT on
   `camera_sources` fails while `get_camera_source_status(text)` succeeds
   without a `stream_url` field. Confirm the compatibility view returns the
   same five safe fields and no others.
7. Register through the public form and by a crafted Supabase Auth request that
   supplies privileged role metadata; both resulting profiles must remain
   `resident` until an Admin changes them.
8. Run one detector write cycle and one weather synchronization using the
   backend service key; monitoring inserts must still succeed.
9. Verify Realtime `INSERT` and `UPDATE` delivery exposes only rows the same
   user's SELECT policy permits. Supabase Postgres Changes cannot apply RLS to
   `DELETE` events; inspect the `supabase_realtime` publication and do not
   publish role-restricted tables for delete notifications unless exposing the
   deleted primary key is acceptable. Use an authorized Broadcast design when
   delete-event privacy is required.

Also inspect deployed objects that are not represented by this repository's
older migrations:

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select c.relname, c.reloptions
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profile_directory', 'camera_source_status');

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by schemaname, tablename;

select n.nspname, p.proname, p.prosecdef,
       has_function_privilege('anon', p.oid, 'execute') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname;
```

Any legacy `SECURITY DEFINER` RPC callable by `anon` or `authenticated` must be
reviewed independently; such a function can become an authorization bypass
even when table RLS is correct. The three intentional authenticated functions
are `current_user_role()`, `get_profile_directory()`, and
`get_camera_source_status(text)`. They take no dynamic SQL input and return only
the caller's role or explicitly listed display-safe columns.

The Flask CCTV/SSE endpoints are a separate authorization boundary and are not
protected by Supabase RLS. If those endpoints are reachable outside the trusted
deployment network, backend authentication and network controls require a
separate stabilization pass.
