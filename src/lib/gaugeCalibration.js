export const gaugeKeys = [
  "gauge_enabled", "gauge_points", "min_level_m", "max_level_m",
  "normal_level_m", "warning_level_m", "critical_level_m",
  "gauge_tick_interval_m", "gauge_label_interval_m",
  "waterline_row_coverage", "waterline_fallback_row_coverage",
];

export function gaugeForm(response) {
  if (!response?.settings || gaugeKeys.some((key) => response.settings[key] == null)) {
    throw new Error("Camera Agent returned incomplete calibration settings.");
  }
  return Object.fromEntries(gaugeKeys.map((key) => [key, String(response.settings[key])]));
}

export function gaugeEdits(settings, active) {
  return !active || gaugeKeys.some((key) => String(settings[key]) !== String(active[key]));
}

export async function saveGaugeCalibration(request, settings) {
  const body = Object.fromEntries(gaugeKeys.map((key) => [key, settings[key]]));
  return gaugeForm(await request("/gauge_config", { method: "PUT", body }));
}

export function validatedLevel(detection) {
  const value = detection?.level_m;
  if (detection?.detected !== true || detection.camera_connected !== true || detection.calibration_valid !== true
      || detection.measurement_validated !== true || value == null || value === "") return null;
  const level = Number(value);
  return Number.isFinite(level) ? level : null;
}

// Historical records are never a fallback for an unavailable live measurement.
export function currentLiveLevel(detection, stationId, transport, now = Date.now()) {
  if (!['live', 'polling'].includes(transport) || stationId == null
      || String(detection?.station_id) !== String(stationId)) return null;
  const timestamp = Date.parse(detection?.detected_at);
  if (!Number.isFinite(timestamp) || now - timestamp > 30000 || timestamp > now + 5000) return null;
  return validatedLevel(detection);
}
