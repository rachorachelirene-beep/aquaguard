alter table public.stations
    add column if not exists latitude double precision,
    add column if not exists longitude double precision;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'stations_latitude_range'
          and conrelid = 'public.stations'::regclass
    ) then
        alter table public.stations
            add constraint stations_latitude_range
            check (
                latitude is null
                or latitude between -90 and 90
            );
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'stations_longitude_range'
          and conrelid = 'public.stations'::regclass
    ) then
        alter table public.stations
            add constraint stations_longitude_range
            check (
                longitude is null
                or longitude between -180 and 180
            );
    end if;
end
$$;

comment on column public.stations.latitude is
    'Optional WGS84 latitude used for station weather synchronization.';

comment on column public.stations.longitude is
    'Optional WGS84 longitude used for station weather synchronization.';
