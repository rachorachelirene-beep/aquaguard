-- AquaGuard alert_events Audit Table
-- Captures automated critical water level snapshots, thresholds, and storage references.

CREATE TABLE IF NOT EXISTS public.alert_events (
    id BIGSERIAL PRIMARY KEY,
    station_id BIGINT REFERENCES public.stations(id) ON DELETE CASCADE,
    water_level NUMERIC(5,2) NOT NULL,
    threshold NUMERIC(5,2) NOT NULL,
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index for quick lookup by station and time
CREATE INDEX IF NOT EXISTS idx_alert_events_station_created
    ON public.alert_events (station_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view alert events
CREATE POLICY alert_events_authenticated_select
    ON public.alert_events
    FOR SELECT
    TO authenticated
    USING (true);

-- Allow anon users to view alert events for public safety transparency
CREATE POLICY alert_events_anon_select
    ON public.alert_events
    FOR SELECT
    TO anon
    USING (true);

-- Allow service_role to insert audit records
CREATE POLICY alert_events_service_insert
    ON public.alert_events
    FOR INSERT
    TO service_role
    WITH CHECK (true);

