import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CloudRain, ShieldAlert, Waves } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import useRealtimeDetection from "../../hooks/useRealtimeDetection";
import { fetchJsonWithTimeout } from "../../lib/fetchJson";
import { supabase } from "../../lib/supabase";
import {
  decodeReminderIcon,
  formatDateTime,
  formatMeasurement,
  getAgeMinutes,
  getAlertCardClass,
  getCombinedRiskView,
  getSeverityBadge,
  getWaterStatus,
  toNullableNumber,
} from "./residentUtils";

const cameraApiBaseUrl = (
  import.meta.env.VITE_CAMERA_API_URL ?? "http://localhost:5000"
).replace(/\/+$/, "");

function pickNewestMeasurement(...candidates) {
  let newest = null;

  for (const candidate of candidates) {
    const value = toNullableNumber(candidate?.value);

    if (value == null) {
      continue;
    }

    const time = new Date(candidate?.recordedAt ?? 0).getTime();
    const normalizedTime = Number.isFinite(time) ? time : 0;

    if (!newest || normalizedTime > newest.time) {
      newest = {
        value,
        recordedAt: candidate?.recordedAt ?? null,
        time: normalizedTime,
      };
    }
  }

  return newest;
}

export default function ResidentDashboard() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [stations, setStations] = useState([]);
  const [readings, setReadings] = useState([]);
  const [detections, setDetections] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [advisories, setAdvisories] = useState([]);
  const [weatherRows, setWeatherRows] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [remindersUnavailable, setRemindersUnavailable] = useState(false);
  const [cachedRisk, setCachedRisk] = useState(null);
  const [riskServiceUnavailable, setRiskServiceUnavailable] = useState(false);
  const loadInFlightRef = useRef(false);
  const riskWarningShownRef = useRef(false);
  const remindersWarningShownRef = useRef(false);

  const loadDashboard = useCallback(async ({ showLoading = true } = {}) => {
    if (loadInFlightRef.current) {
      return;
    }

    loadInFlightRef.current = true;

    if (showLoading) {
      setLoading(true);
    }

    setLoadError("");

    try {
      const [
        stationsResult,
        readingsResult,
        detectionsResult,
        alertsResult,
        advisoriesResult,
        weatherResult,
        announcementsResult,
        remindersResult,
      ] = await Promise.all([
        supabase
          .from("stations")
          .select(
            "id, name, location, station_code, status, warning_level, critical_level, normal_level"
          )
          .order("name", { ascending: true }),
        supabase
          .from("water_levels")
          .select("id, station_id, level_m, rainfall_mm, recorded_at")
          .order("recorded_at", { ascending: false })
          .limit(300),
        supabase
          .from("yolo_detections")
          .select(
            "id, station_id, level_m, confidence, water_coverage, detected_at"
          )
          .order("detected_at", { ascending: false })
          .limit(100),
        supabase
          .from("alerts")
          .select(
            "id, station_id, type, title, message, is_resolved, created_at"
          )
          .eq("is_resolved", false)
          .in("type", ["warning", "critical"])
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("evacuation_advisories")
          .select(
            "id, title, area, level, details, is_active, issued_by, created_at"
          )
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("weather_readings")
          .select(
            "id, station_id, temperature, precipitation, rain_1h, rain_6h, wind_speed, weather_code, condition_text, recorded_at"
          )
          .order("recorded_at", { ascending: false })
          .limit(300),
        supabase
          .from("announcements")
          .select("id, title, body, created_at, created_by")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("safety_reminders")
          .select("id, title, body, icon, is_active")
          .eq("is_active", true)
          .order("id", { ascending: true }),
      ]);

      const requiredError = [
        stationsResult.error,
        readingsResult.error,
        detectionsResult.error,
        alertsResult.error,
        advisoriesResult.error,
        weatherResult.error,
        announcementsResult.error,
      ].find(Boolean);

      if (requiredError) {
        throw requiredError;
      }

      if (remindersResult.error) {
        if (!remindersWarningShownRef.current) {
          console.warn(
            "Resident safety reminders unavailable:",
            remindersResult.error
          );
          remindersWarningShownRef.current = true;
        }
      } else {
        remindersWarningShownRef.current = false;
      }

      const nextStations = stationsResult.data ?? [];
      const nextReadings = readingsResult.data ?? [];
      const nextDetections = detectionsResult.data ?? [];
      const nextWeatherRows = weatherResult.data ?? [];
      const validReading = nextReadings.find(
        (reading) => toNullableNumber(reading.level_m) != null
      );
      const validDetection = nextDetections.find(
        (detection) => toNullableNumber(detection.level_m) != null
      );
      const primaryStationId =
        validReading?.station_id ??
        validDetection?.station_id ??
        nextWeatherRows[0]?.station_id ??
        nextStations[0]?.id ??
        null;
      let nextRisk = null;
      let nextRiskUnavailable = false;

      if (primaryStationId != null) {
        try {
          const payload = await fetchJsonWithTimeout(
            `${cameraApiBaseUrl}/flood_risk?station_id=${encodeURIComponent(
              primaryStationId
            )}`
          );
          nextRisk = payload?.combined_risk ?? null;
          riskWarningShownRef.current = false;
        } catch (error) {
          if (!riskWarningShownRef.current) {
            console.warn("Resident combined flood risk unavailable:", error);
            riskWarningShownRef.current = true;
          }
          nextRiskUnavailable = true;
        }
      }

      setStations(nextStations);
      setReadings(nextReadings);
      setDetections(nextDetections);
      setAlerts(alertsResult.data ?? []);
      setAdvisories(advisoriesResult.data ?? []);
      setWeatherRows(nextWeatherRows);
      setAnnouncements(announcementsResult.data ?? []);
      setReminders(remindersResult.error ? [] : remindersResult.data ?? []);
      setRemindersUnavailable(Boolean(remindersResult.error));
      setCachedRisk(nextRisk);
      setRiskServiceUnavailable(nextRiskUnavailable);
    } catch (error) {
      console.error("Resident dashboard loading error:", error);
      setLoadError(
        "Unable to load current flood information. Check your connection and try again."
      );
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => loadDashboard(), 0);
    const interval = window.setInterval(
      () => loadDashboard({ showLoading: false }),
      30000
    );

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadDashboard]);

  const stationMap = useMemo(
    () => new Map(stations.map((station) => [String(station.id), station])),
    [stations]
  );
  const storedReading = readings.find(
    (reading) => toNullableNumber(reading.level_m) != null
  );
  const storedDetection = detections.find(
    (detection) => toNullableNumber(detection.level_m) != null
  );
  const primaryStationId =
    storedReading?.station_id ??
    storedDetection?.station_id ??
    weatherRows[0]?.station_id ??
    stations[0]?.id ??
    "";
  const primaryStation = stationMap.get(String(primaryStationId)) ?? null;
  const primaryReading = readings.find(
    (reading) =>
      String(reading.station_id) === String(primaryStationId) &&
      toNullableNumber(reading.level_m) != null
  );
  const primaryDetection = detections.find(
    (detection) => String(detection.station_id) === String(primaryStationId)
  );
  const currentWeather = weatherRows.find(
    (weather) => String(weather.station_id) === String(primaryStationId)
  );
  const selectedStationId = primaryStationId ? String(primaryStationId) : "";
  const { detection: realtimeDetection, transport } = useRealtimeDetection({
    cameraApiBaseUrl,
    stationId: selectedStationId,
  });
  const realtimeMatchesStation =
    realtimeDetection &&
    (!realtimeDetection.station_id ||
      String(realtimeDetection.station_id) === selectedStationId);
  const currentDetection = realtimeMatchesStation ? realtimeDetection : null;
  const currentMeasurement = pickNewestMeasurement(
    {
      value: currentDetection?.level_m,
      recordedAt: currentDetection?.detected_at,
    },
    {
      value: primaryDetection?.level_m,
      recordedAt: primaryDetection?.detected_at,
    },
    {
      value: primaryReading?.level_m,
      recordedAt: primaryReading?.recorded_at,
    }
  );
  const currentLevel = currentMeasurement?.value ?? null;
  const waterStatus = getWaterStatus(currentLevel, primaryStation);
  const combinedRisk = currentDetection?.combined_risk ?? cachedRisk;
  const riskView = getCombinedRiskView(combinedRisk);
  const latestAlert = alerts[0] ?? null;
  const latestAdvisory = advisories[0] ?? null;
  const lastUpdated = currentMeasurement?.recordedAt ?? null;
  const waterAge = getAgeMinutes(lastUpdated);
  const waterIsStale = waterAge != null && waterAge > 10;
  const weatherAge = getAgeMinutes(currentWeather?.recorded_at);
  const weatherIsStale = weatherAge != null && weatherAge > 30;
  const monitoringMessage =
    currentLevel == null
      ? "Current water-level monitoring is unavailable."
      : waterIsStale
        ? "The latest saved water-level reading is more than 10 minutes old."
        : transport === "live"
      ? "Live monitoring updates are connected."
      : transport === "polling"
        ? "Showing monitoring updates via fallback polling."
        : "Live updates are temporarily unavailable; showing the latest saved reading.";

  return (
    <DashboardLayout
      title="Resident Dashboard"
      description="Current flood conditions and official safety information for your area."
    >
      {loading && (
        <div className="page-content">
          <div className="section-card dashboard-empty">
            Loading current flood information...
          </div>
        </div>
      )}

      {!loading && loadError && (
        <div className="page-content">
          <div className="section-card dashboard-empty error">
            <strong>{loadError}</strong>
            <button
              className="btn-submit officer-icon-button"
              type="button"
              onClick={() => loadDashboard()}
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {!loading && !loadError && (
        <main className="page-content resident-dashboard">
          <section className="resident-priority-grid">
            <article
              className={`resident-status-banner resident-status-${waterStatus.key}`}
            >
              <div className="resident-status-icon">{waterStatus.icon}</div>
              <div>
                <span className="resident-card-eyebrow">
                  Current Flood Status
                </span>
                <h2>{waterStatus.label}</h2>
                <p>{waterStatus.message}</p>
                <span>
                  {primaryStation?.name ?? "No monitoring station available"}
                  {primaryStation?.location
                    ? ` | ${primaryStation.location}`
                    : ""}
                </span>
              </div>
            </article>

            <article className={`resident-risk-card ${riskView.className}`}>
              <span className="resident-card-eyebrow">Combined Flood Risk</span>
              <div className="resident-risk-heading">
                <strong>{riskView.label}</strong>
                <b>{riskView.scoreText}</b>
              </div>
              <p>{riskView.message}</p>
              <small>Rule-based monitoring assessment, not flood probability.</small>
            </article>
          </section>

          <section
            className={`section-card resident-emergency-card ${
              latestAlert?.type === "critical" ? "critical" : ""
            }`}
          >
            <div className="section-title">
              <span>
                <Bell size={18} /> Latest Flood Alert
              </span>
              <Link className="resident-view-link" to="/resident/alerts">
                View alerts
              </Link>
            </div>
            {latestAlert ? (
              <article className={`alert-card ${getAlertCardClass(latestAlert.type)}`}>
                <div className="officer-alert-badges">
                  <span className={`badge ${getSeverityBadge(latestAlert.type)}`}>
                    {latestAlert.type}
                  </span>
                  <span className="badge badge-orange">Active</span>
                </div>
                <div className="alert-title">{latestAlert.title}</div>
                <div className="alert-body">{latestAlert.message}</div>
                <small>
                  {stationMap.get(String(latestAlert.station_id))?.name ??
                    "Community alert"}{" "}
                  | {formatDateTime(latestAlert.created_at)}
                </small>
              </article>
            ) : (
              <div className="dashboard-empty">
                No active warning or critical alerts.
              </div>
            )}
          </section>

          <section
            className={`section-card resident-advisory-card ${
              latestAdvisory ? "active" : ""
            }`}
          >
            <div className="section-title">
              <span>
                <ShieldAlert size={18} /> Evacuation Advisory
              </span>
              <Link
                className="resident-view-link"
                to="/resident/evacuation-advisories"
              >
                View advisories
              </Link>
            </div>
            {latestAdvisory ? (
              <article className="officer-list-item resident-advisory-item">
                <div className="officer-list-heading">
                  <strong>{latestAdvisory.title}</strong>
                  <span
                    className={`badge ${getSeverityBadge(latestAdvisory.level)}`}
                  >
                    {latestAdvisory.level ?? "Advisory"}
                  </span>
                </div>
                <span>Affected area: {latestAdvisory.area || "Not specified"}</span>
                <p>{latestAdvisory.details || "No instructions provided."}</p>
                <small>{formatDateTime(latestAdvisory.created_at)}</small>
              </article>
            ) : (
              <div className="dashboard-empty">
                No active evacuation advisory.
              </div>
            )}
          </section>

          <section className="resident-dashboard-grid resident-condition-grid">
            <article className="section-card resident-condition-card">
              <div className="resident-condition-icon">
                <Waves size={24} />
              </div>
              <div>
                <span className="resident-card-eyebrow">Current Water Level</span>
                <strong>{formatMeasurement(currentLevel, "m", 2)}</strong>
                <p>{monitoringMessage}</p>
                <small>Last updated: {formatDateTime(lastUpdated)}</small>
              </div>
            </article>

            <article className="section-card resident-condition-card">
              <div className="resident-condition-icon weather">
                <CloudRain size={24} />
              </div>
              <div>
                <span className="resident-card-eyebrow">Current Weather</span>
                <strong>
                  {currentWeather?.condition_text || "Weather unavailable"}
                </strong>
                <p>
                  {formatMeasurement(currentWeather?.temperature, "\u00b0C")} | Rain
                  1h {formatMeasurement(currentWeather?.rain_1h, "mm")}
                </p>
                <small>
                  {weatherIsStale
                    ? "Weather reading may be out of date."
                    : `Last updated: ${formatDateTime(
                        currentWeather?.recorded_at
                      )}`}
                </small>
                <Link className="resident-view-link" to="/resident/weather">
                  View weather details
                </Link>
              </div>
            </article>
          </section>

          {riskServiceUnavailable && !riskView.assessed && (
            <div className="resident-monitoring-note">
              Combined flood risk is temporarily unavailable. Other saved safety
              information remains visible.
            </div>
          )}

          <section className="resident-dashboard-grid">
            <div className="section-card">
              <div className="section-title">
                <span>Safety Reminders</span>
                <Link
                  className="resident-view-link"
                  to="/resident/safety-reminders"
                >
                  View all
                </Link>
              </div>
              {remindersUnavailable ? (
                <div className="dashboard-empty">
                  Safety reminders are temporarily unavailable.
                </div>
              ) : reminders.length === 0 ? (
                <div className="dashboard-empty">
                  No safety reminders have been published.
                </div>
              ) : (
                <div className="resident-tip-grid resident-tip-grid-compact">
                  {reminders.slice(0, 3).map((reminder) => (
                    <article className="resident-tip-card" key={reminder.id}>
                      <div className="resident-tip-icon">
                        {decodeReminderIcon(reminder.icon)}
                      </div>
                      <strong>{reminder.title}</strong>
                      <span>{reminder.body}</span>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="section-card">
              <div className="section-title">
                <span>Community Announcements</span>
                <Link
                  className="resident-view-link"
                  to="/resident/announcements"
                >
                  View all
                </Link>
              </div>
              <div className="resident-list">
                {announcements.length === 0 ? (
                  <div className="dashboard-empty">
                    No announcements at this time.
                  </div>
                ) : (
                  announcements.slice(0, 3).map((announcement) => (
                    <article
                      className="officer-list-item resident-list-item"
                      key={announcement.id}
                    >
                      <strong>{announcement.title}</strong>
                      <span>{announcement.body}</span>
                      <small>{formatDateTime(announcement.created_at)}</small>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>
        </main>
      )}
    </DashboardLayout>
  );
}
