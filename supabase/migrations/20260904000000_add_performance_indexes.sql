-- AquaGuard Performance Indexes
-- Accelerates dashboard and live monitoring queries on water_levels,
-- yolo_detections, weather_readings, and alerts.

-- Water Levels indexes
CREATE INDEX IF NOT EXISTS idx_water_levels_station_recorded 
  ON public.water_levels (station_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_water_levels_recorded 
  ON public.water_levels (recorded_at DESC);

-- YOLO Detections indexes
CREATE INDEX IF NOT EXISTS idx_yolo_detections_station_detected 
  ON public.yolo_detections (station_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_yolo_detections_detected 
  ON public.yolo_detections (detected_at DESC);

-- Detector Results indexes
CREATE INDEX IF NOT EXISTS idx_detector_results_station_detected 
  ON public.detector_results (station_id, detected_at DESC);

-- Weather Readings indexes
CREATE INDEX IF NOT EXISTS idx_weather_readings_station_recorded 
  ON public.weather_readings (station_id, recorded_at DESC);

-- Alerts indexes
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved 
  ON public.alerts (is_resolved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_station_created 
  ON public.alerts (station_id, created_at DESC);

-- Evacuation Advisories index
CREATE INDEX IF NOT EXISTS idx_advisories_active 
  ON public.evacuation_advisories (is_active, created_at DESC);

-- Announcements index
CREATE INDEX IF NOT EXISTS idx_announcements_created 
  ON public.announcements (created_at DESC);
