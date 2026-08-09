import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  CloudRain,
  Megaphone,
  Play,
  Settings,
  TriangleAlert,
  Waves,
} from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import useEscapeKey from "../../hooks/useEscapeKey";
import { fetchJsonWithTimeout } from "../../lib/fetchJson";
import { supabase } from "../../lib/supabase";

const cameraApiBaseUrl = (
  import.meta.env.VITE_CAMERA_API_URL ?? "http://localhost:5000"
).replace(/\/+$/, "");

let dashboardRiskWarningShown = false;

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatLevel(value) {
  const level = toNumber(value, null);

  return level == null ? "--" : `${level.toFixed(2)} m`;
}

function formatOneDecimal(value) {
  const number = toNumber(value, null);

  return number == null ? "--" : number.toFixed(1);
}

function formatTime(value) {
  if (!value) {
    return "--:--";
  }

  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatus(level, warning, critical) {
  if (level == null) {
    return {
      key: "unknown",
      header: "UNAVAILABLE",
      label: "NO DATA",
      className: "blue",
      color: "#64748b",
      sub: "WAITING FOR READING",
    };
  }

  if (level >= critical) {
    return {
      key: "critical",
      header: "CRITICAL",
      label: "STAY ALERT",
      className: "red",
      color: "#d84a4a",
      sub: `THRESHOLD: ${critical.toFixed(2)}M`,
    };
  }

  if (level >= warning) {
    return {
      key: "warning",
      header: "WARNING",
      label: "WARNING",
      className: "orange",
      color: "#c77b2a",
      sub: `THRESHOLD: ${warning.toFixed(2)}M`,
    };
  }

  return {
    key: "normal",
    header: "NORMAL",
    label: "NORMAL",
    className: "green",
    color: "#2f9e69",
    sub: "WITHIN SAFE RANGE",
  };
}

function getCombinedRiskDetails(risk) {
  const score = toNumber(risk?.score, null);

  if (!risk?.assessed || score == null) {
    return {
      score: null,
      label: "Not assessed",
      color: "#64748b",
      reason: risk?.primary_reason ?? "Insufficient monitoring data",
    };
  }

  const colors = {
    normal: "#2f9e69",
    moderate: "#c77b2a",
    high: "#d84a4a",
    critical: "#b91c1c",
  };

  return {
    score: Math.round(Math.min(100, Math.max(0, score))),
    label: risk.label ?? "Assessed",
    color: colors[risk.level] ?? colors.normal,
    reason: risk.primary_reason ?? "Combined monitoring inputs assessed",
  };
}

function normalizeScore(value) {
  const number = toNumber(value, null);

  if (number == null) {
    return null;
  }

  return Math.round(
    Math.min(100, Math.max(0, number <= 1 ? number * 100 : number))
  );
}

function formatFreshness(value, staleAfterMs) {
  if (!value) {
    return "NO TIMESTAMP";
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "INVALID TIMESTAMP";
  }

  return `${Date.now() - timestamp > staleAfterMs ? "STALE" : "UPDATED"} ${formatTime(value)}`;
}

async function fetchCombinedRisk(stationId) {
  try {
    const payload = await fetchJsonWithTimeout(
      `${cameraApiBaseUrl}/flood_risk?station_id=${encodeURIComponent(
        stationId
      )}`
    );
    dashboardRiskWarningShown = false;
    return payload?.combined_risk ?? null;
  } catch (error) {
    if (!dashboardRiskWarningShown) {
      console.warn("Combined risk unavailable:", error);
      dashboardRiskWarningShown = true;
    }

    return null;
  }
}

function getAlertClass(type) {
  if (type === "critical") {
    return "red";
  }

  if (type === "warning") {
    return "orange-card";
  }

  if (type === "system") {
    return "blue-card";
  }

  return "yellow-card";
}

function buildSettingsMap(rows) {
  return (rows ?? []).reduce((settings, row) => {
    settings[row.key] = row.value;
    return settings;
  }, {});
}

function computeUptimeDays(uptimeStart) {
  if (!uptimeStart) {
    return null;
  }

  const start = new Date(uptimeStart);

  if (Number.isNaN(start.getTime())) {
    return null;
  }

  return Math.max(
    0,
    Math.floor((Date.now() - start.getTime()) / 86400000)
  );
}

function StationMap() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
    >
      <rect width="80" height="80" rx="8" fill="#0a0a0a" />
      <circle
        cx="40"
        cy="40"
        r="20"
        stroke="#1f6f8b"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <circle cx="40" cy="40" r="6" fill="#1f6f8b" />
      <line
        x1="40"
        y1="20"
        x2="40"
        y2="34"
        stroke="#1f6f8b"
      />
      <line
        x1="40"
        y1="46"
        x2="40"
        y2="60"
        stroke="#1f6f8b"
      />
      <line
        x1="20"
        y1="40"
        x2="34"
        y2="40"
        stroke="#1f6f8b"
      />
      <line
        x1="46"
        y1="40"
        x2="60"
        y2="40"
        stroke="#1f6f8b"
      />
    </svg>
  );
}

function LiveFeedIcon() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      opacity=".18"
      aria-hidden="true"
    >
      <rect width="80" height="80" rx="8" fill="#1f6f8b" />
      <path
        d="M10 55 Q20 35 40 40 Q60 45 70 25"
        stroke="#fff"
        strokeWidth="3"
        fill="none"
      />
    </svg>
  );
}

function AdminDashboardContent() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [flash, setFlash] = useState(null);
  const [stations, setStations] = useState([]);
  const [latestReadings, setLatestReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [activeAlertCount, setActiveAlertCount] = useState(0);
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState({});
  const [uptimeDays, setUptimeDays] = useState(null);
  const [weather, setWeather] = useState(null);
  const [yolo, setYolo] = useState(null);
  const [combinedRisk, setCombinedRisk] = useState(null);
  const [modal, setModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    body: "",
  });
  const [maintenanceForm, setMaintenanceForm] = useState({
    station_id: "",
    title: "",
    message: "",
  });

  useEscapeKey(() => setModal(null), Boolean(modal));

  const loadDashboard = useCallback(async () => {
    setLoadError("");

    const [
      stationsResult,
      readingsResult,
      alertsResult,
      activeAlertsResult,
      settingsResult,
    ] = await Promise.all([
      supabase
        .from("stations")
        .select(
          "id, name, location, station_code, status, critical_level, warning_level, normal_level"
        )
        .order("name", { ascending: true }),
      supabase
        .from("water_levels")
        .select("id, station_id, level_m, rainfall_mm, recorded_at")
        .order("recorded_at", { ascending: false })
        .limit(300),
      supabase
        .from("alerts")
        .select(
          "id, station_id, type, title, message, is_read, is_resolved, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("alerts")
        .select("id", { count: "exact", head: true })
        .eq("is_resolved", false)
        .in("type", ["critical", "warning"]),
      supabase.from("settings").select("key, value"),
    ]);

    const firstError = [
      stationsResult.error,
      readingsResult.error,
      alertsResult.error,
      activeAlertsResult.error,
      settingsResult.error,
    ].find(Boolean);

    if (firstError) {
      throw firstError;
    }

    const nextStations = stationsResult.data ?? [];
    const nextReadings = readingsResult.data ?? [];
    const latestByStation = new Map();

    nextReadings.forEach((reading) => {
      const key = String(reading.station_id);

      if (!latestByStation.has(key)) {
        latestByStation.set(key, reading);
      }
    });

    const nextLatest = nextStations
      .map((station) => ({
        ...latestByStation.get(String(station.id)),
        station,
      }))
      .filter((reading) => reading.id)
      .sort(
        (first, second) =>
          new Date(second.recorded_at).getTime() -
          new Date(first.recorded_at).getTime()
      );

    const primaryStation = nextLatest[0]?.station ?? nextStations[0];
    let nextHistory = [];
    let nextWeather = null;
    let nextYolo = null;
    let nextCombinedRisk = null;

    if (primaryStation?.id) {
      const [historyResult, weatherResult, yoloResult, riskResult] =
        await Promise.all([
          supabase
            .from("water_levels")
            .select("id, station_id, level_m, rainfall_mm, recorded_at")
            .eq("station_id", primaryStation.id)
            .order("recorded_at", { ascending: false })
            .limit(24),
          supabase
            .from("weather_readings")
            .select(
              "id, station_id, temperature, precipitation, rain_1h, rain_6h, wind_speed, weather_code, condition_text, flood_risk, recorded_at"
            )
            .eq("station_id", primaryStation.id)
            .order("recorded_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("yolo_detections")
            .select(
              "id, station_id, water_coverage, level_m, confidence, weather_risk, flood_risk, detected_at"
            )
            .eq("station_id", primaryStation.id)
            .order("detected_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          fetchCombinedRisk(primaryStation.id),
        ]);

      const detailError = [
        historyResult.error,
        weatherResult.error,
        yoloResult.error,
      ].find(Boolean);

      if (detailError) {
        throw detailError;
      }

      nextHistory = (historyResult.data ?? []).reverse();
      nextWeather = weatherResult.data ?? null;
      nextYolo = yoloResult.data ?? null;
      nextCombinedRisk = riskResult;
    }

    setStations(nextStations);
    setLatestReadings(nextLatest);
    setAlerts(alertsResult.data ?? []);
    setActiveAlertCount(activeAlertsResult.count ?? 0);
    const nextSettings = buildSettingsMap(settingsResult.data);

    setSettings(nextSettings);
    setUptimeDays(computeUptimeDays(nextSettings.uptime_start));
    setWeather(nextWeather);
    setYolo(nextYolo);
    setCombinedRisk(nextCombinedRisk);
    setHistory(nextHistory);
  }, []);

  useEffect(() => {
    let active = true;
    let loadInFlight = false;

    async function boot({ initial = false } = {}) {
      if (loadInFlight) {
        return;
      }

      loadInFlight = true;

      if (initial) {
        setLoading(true);
      }

      try {
        await loadDashboard();
      } catch (error) {
        console.error("Admin dashboard load error:", error);

        if (active) {
          setLoadError(
            error.message || "Unable to load dashboard data."
          );
        }
      } finally {
        loadInFlight = false;

        if (active) {
          setLoading(false);
        }
      }
    }

    boot({ initial: true });
    const interval = window.setInterval(() => boot(), 30000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [loadDashboard]);

  const primary = latestReadings[0] ?? null;
  const primaryStation = primary?.station ?? stations[0] ?? null;
  const currentLevel = toNumber(primary?.level_m, null);
  const hasCurrentReading = currentLevel != null;
  const criticalLevel = toNumber(
    primaryStation?.critical_level,
    toNumber(settings.critical_level, 2.5)
  );
  const warningLevel = toNumber(
    primaryStation?.warning_level,
    toNumber(settings.warning_level, 2)
  );
  const normalLevel = toNumber(
    primaryStation?.normal_level,
    toNumber(settings.normal_level, 1)
  );
  const latestRainfall = toNumber(primary?.rainfall_mm, null);
  const status = getStatus(
    currentLevel,
    warningLevel,
    criticalLevel
  );
  const historyMax = Math.max(criticalLevel, normalLevel, 1);
  const yoloRisk = normalizeScore(yolo?.flood_risk);
  const combinedRiskDetails = getCombinedRiskDetails(combinedRisk);
  const stationName = primaryStation?.name ?? "No Station";
  const waterPct = Math.min(
    100,
    hasCurrentReading && criticalLevel > 0
      ? (currentLevel / criticalLevel) * 100
      : 0
  );
  const validHistory = history.filter(
    (reading) => toNumber(reading.level_m, null) != null
  );

  async function handleAnnouncementSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFlash(null);

    const { error } = await supabase.from("announcements").insert({
      title: announcementForm.title.trim(),
      body: announcementForm.body.trim(),
      created_by: profile.id,
    });

    setSubmitting(false);

    if (error) {
      setFlash({ type: "error", text: error.message });
      return;
    }

    setAnnouncementForm({ title: "", body: "" });
    setModal(null);
    setFlash({
      type: "success",
      text: "Announcement published.",
    });
  }

  async function handleMaintenanceSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFlash(null);

    const payload = {
      station_id: maintenanceForm.station_id || null,
      type: "system",
      title: maintenanceForm.title.trim(),
      message: maintenanceForm.message.trim(),
    };

    const { error } = await supabase.from("alerts").insert(payload);

    setSubmitting(false);

    if (error) {
      setFlash({ type: "error", text: error.message });
      return;
    }

    setMaintenanceForm({
      station_id: "",
      title: "",
      message: "",
    });
    setModal(null);
    setFlash({ type: "success", text: "Maintenance alert dispatched." });
    await loadDashboard();
  }

  return (
    <>
      {flash && (
        <div className={`flash ${flash.type}`}>{flash.text}</div>
      )}

      {loading && (
        <div className="page-content">
          <div className="section-card dashboard-empty">
            Loading dashboard data...
          </div>
        </div>
      )}

      {!loading && loadError && (
        <div className="page-content">
          <div className="section-card dashboard-empty error">
            {loadError}
          </div>
        </div>
      )}

      {!loading && !loadError && (
        <>
          <section className="stat-cards">
            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-label">CURRENT WATER LEVEL</span>
                <span className="stat-icon blue">
                  <Waves size={22} />
                </span>
              </div>
              <div className="stat-value blue">
                {hasCurrentReading ? formatLevel(currentLevel) : "No data"}
              </div>
              <div className="stat-sub">
                {stationName} · {formatFreshness(primary?.recorded_at, 10 * 60 * 1000)}
              </div>
            </div>

            <div className="stat-card warning-card">
              <div className="stat-header">
                <span className="stat-label">
                  STATUS: {status.header}
                </span>
                <span
                  className={`stat-icon ${status.className}`}
                >
                  <TriangleAlert size={22} />
                </span>
              </div>
              <div
                className={`stat-value ${status.className} big`}
              >
                {status.label}
              </div>
              <div className="stat-sub">
                {status.sub}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-label">RAINFALL READING</span>
                <span className="stat-icon blue">
                  <CloudRain size={22} />
                </span>
              </div>
              <div className="stat-value blue">
                {latestRainfall == null
                  ? "No data"
                  : `${formatOneDecimal(latestRainfall)} mm`}
              </div>
              <div className="stat-sub">LATEST READING</div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-label">UPTIME TRACKING</span>
                <span className="stat-icon green">
                  <CheckCircle2 size={22} />
                </span>
              </div>
              <div className="stat-value green">
                {uptimeDays == null ? "No data" : `${uptimeDays} days`}
              </div>
              <div className="stat-sub">
                {uptimeDays == null
                  ? "UPTIME START NOT SET"
                  : "BASED ON CONFIGURED START DATE"}
              </div>
            </div>
          </section>

          <section className="stat-cards dashboard-secondary-cards">
            <div className="stat-card weather-card">
              <div className="stat-header">
                <span className="stat-label">WEATHER</span>
                <span className="weather-icon">
                  <CloudRain size={24} />
                </span>
              </div>
              <div className="stat-value compact">
                {weather?.condition_text || "No data"}
              </div>
              <div className="stat-sub">
                {formatOneDecimal(weather?.temperature)}°C |{" "}
                {formatOneDecimal(weather?.wind_speed)} km/h ·{" "}
                {formatFreshness(weather?.recorded_at, 30 * 60 * 1000)}
              </div>
            </div>

            <div className="stat-card rain-card">
              <div className="stat-header">
                <span className="stat-label">RAIN NOW</span>
                <span className="stat-icon rain">
                  <CloudRain size={22} />
                </span>
              </div>
              <div className="stat-value rain">
                {toNumber(weather?.precipitation, null) == null
                  ? "No data"
                  : `${formatOneDecimal(weather.precipitation)} mm`}
              </div>
              <div className="stat-sub">
                Latest 6h total:{" "}
                {weather?.rain_6h == null
                  ? "—"
                  : `${formatOneDecimal(weather.rain_6h)} mm`}
              </div>
            </div>

            <div className="stat-card weather-risk-card">
              <div className="stat-header">
                <span className="stat-label">COMBINED FLOOD RISK</span>
                <span className="stat-icon orange">
                  <TriangleAlert size={22} />
                </span>
              </div>
              <div
                className="stat-value"
                style={{ color: combinedRiskDetails.color }}
              >
                {combinedRiskDetails.score == null
                  ? "Not assessed"
                  : `${combinedRiskDetails.score}/100`}
              </div>
              <div className="stat-sub">
                {combinedRiskDetails.label} · {combinedRiskDetails.reason}
              </div>
            </div>

            <div className="stat-card yolo-card">
              <div className="stat-header">
                <span className="stat-label">CAMERA EVIDENCE SCORE</span>
                <span className="stat-icon red">
                  <Activity size={22} />
                </span>
              </div>
              <div
                className="stat-value"
                style={{
                  color:
                    yoloRisk == null
                      ? "#64748b"
                      : yoloRisk > 70
                        ? "#d84a4a"
                        : yoloRisk > 40
                          ? "#c77b2a"
                          : "#2f9e69",
                  fontSize: yoloRisk == null ? "1rem" : undefined,
                }}
              >
                {yoloRisk == null ? "No data" : `${yoloRisk}/100`}
              </div>
              <div className="stat-sub">
                {yolo
                  ? `Water: ${formatOneDecimal(
                      yolo.water_coverage
                    )}% | ${formatFreshness(yolo.detected_at, 5 * 60 * 1000)}`
                  : "Start YOLO detector"}
              </div>
            </div>
          </section>

          <section className="mid-row">
            <div className="live-feed-card">
              <div className="live-badge">
                <span className="live-dot" />
                LATEST
              </div>
              <div className="level-overlay">
                <div className="level-box">
                  LEVEL
                  <br />
                  <strong>{formatLevel(currentLevel)}</strong>
                </div>
                <div className="threshold-labels">
                  <span className="th-label critical">CRITICAL</span>
                  <span className="th-label warning">WARNING</span>
                  <span className="th-label normal">NORMAL</span>
                </div>
                <div className="water-bar-wrap">
                  <div
                    className="water-bar"
                    style={{ height: `${waterPct}%` }}
                  />
                </div>
              </div>
              <div className="feed-bg">
                <div className="feed-placeholder">
                  <LiveFeedIcon />
                  <p>Live Camera Feed</p>
                </div>
              </div>
              <div className="feed-footer">
                <span>⌖ {stationName}</span>
                <div className="feed-actions">
                  <Link
                    to="/admin/live-monitoring"
                    className="icon-btn-sm"
                  >
                    <Play size={15} />
                    View Live
                  </Link>
                </div>
              </div>
            </div>

            <div className="alerts-panel">
              <div className="panel-header">
                <span>RECENT ALERTS</span>
                <span className="badge-active">
                  {activeAlertCount} ACTIVE
                </span>
              </div>
              <div className="alert-grid">
                {alerts.length === 0 && (
                  <div className="dashboard-empty">No alerts.</div>
                )}

                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`alert-card ${getAlertClass(alert.type)}`}
                  >
                    <div className="alert-time">
                      {formatTime(alert.created_at)}
                    </div>
                    <div className="alert-title">{alert.title}</div>
                    <div className="alert-body">
                      {alert.message?.slice(0, 80)}
                      {alert.message?.length > 80 ? "..." : ""}
                    </div>
                    {alert.type === "critical" && (
                      <Link to="/admin/alerts" className="alert-link">
                        View Data
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="bottom-row">
            <div className="chart-card">
              <div className="panel-header">
                <span>History (24h)</span>
                <span className="legend">
                  <span className="dot-crit" />
                  Crit
                  <span className="dot-trend" />
                  Trend
                </span>
              </div>
              <div className="bar-chart">
                {validHistory.length === 0 && (
                  <div className="dashboard-empty">No history.</div>
                )}

                {validHistory.map((reading) => {
                  const level = toNumber(reading.level_m, null);
                  const pct = Math.min(
                    100,
                    (level / historyMax) * 100
                  );
                  const color =
                    level >= criticalLevel
                      ? "#d84a4a"
                      : level >= warningLevel
                        ? "#c77b2a"
                        : "#1f6f8b";

                  return (
                    <div
                      key={reading.id}
                      className="bar"
                      title={`${formatLevel(level)} @ ${formatTime(
                        reading.recorded_at
                      )}`}
                      style={{
                        height: `${Math.max(4, pct)}%`,
                        background: color,
                      }}
                    />
                  );
                })}
              </div>
              <div className="chart-labels">
                <span>-24h</span>
                <span>-12h</span>
                <span>Now</span>
              </div>
            </div>

            <div className="station-card">
              <div className="panel-header">
                <span>Station Info</span>
              </div>
              <div className="station-body">
                <div className="station-details">
                  <div className="station-name">
                    {primaryStation?.name ?? "N/A"}
                  </div>
                  <div className="station-loc">
                    {primaryStation?.location ?? ""}
                  </div>
                  <div className="station-meta">
                    <span>ID:</span>{" "}
                    {primaryStation?.station_code ?? ""}
                  </div>
                  <div className="station-meta">
                    <span>Status:</span>{" "}
                    <span className="teal">
                      {primaryStation?.status ?? "unknown"}
                    </span>
                  </div>
                </div>
                <div className="station-map">
                  <StationMap />
                </div>
              </div>
            </div>

            <div className="activity-card">
              <div className="panel-header">
                <span>SYSTEM ACTIVITY</span>
              </div>
              <div className="activity-list">
                {stations.length === 0 && (
                  <div className="dashboard-empty">
                    No stations configured.
                  </div>
                )}

                {stations.map((station) => (
                  <div className="activity-item" key={station.id}>
                    <span
                      className={`dot ${
                        station.status === "online"
                          ? "green"
                          : "blue-dot"
                      }`}
                    />
                    {station.name}
                    <span
                      className={`act-status ${
                        station.status === "online" ? "green" : "teal"
                      }`}
                    >
                      {station.status ?? "unknown"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="action-btns">
              <button
                className="action-btn teal-btn"
                type="button"
                onClick={() => setModal("announcement")}
              >
                <Megaphone size={23} />
                ISSUE PUBLIC
                <br />
                ANNOUNCEMENT
              </button>

              <button
                className="action-btn dark-btn"
                type="button"
                onClick={() => setModal("maintenance")}
              >
                <Settings size={23} />
                DISPATCH
                <br />
                MAINTENANCE
              </button>
            </div>
          </section>
        </>
      )}

      {modal === "announcement" && (
        <div className="modal-overlay">
          <div
            className="modal-box"
            role="dialog"
            aria-modal="true"
            aria-label="Issue public announcement"
          >
            <div className="modal-header">
              <span>Issue Public Announcement</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setModal(null)}
                aria-label="Close announcement dialog"
              >
                x
              </button>
            </div>
            <form onSubmit={handleAnnouncementSubmit}>
              <label className="form-label" htmlFor="announcement-title">
                Title
              </label>
              <input
                id="announcement-title"
                type="text"
                className="form-input"
                placeholder="Announcement title"
                value={announcementForm.title}
                onChange={(event) =>
                  setAnnouncementForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                required
              />

              <label className="form-label" htmlFor="announcement-body">
                Message
              </label>
              <textarea
                id="announcement-body"
                className="form-input"
                rows="4"
                placeholder="Write your announcement..."
                value={announcementForm.body}
                onChange={(event) =>
                  setAnnouncementForm((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
                required
              />

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={submitting}
                >
                  {submitting ? "Publishing..." : "Publish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === "maintenance" && (
        <div className="modal-overlay">
          <div
            className="modal-box"
            role="dialog"
            aria-modal="true"
            aria-label="Dispatch maintenance"
          >
            <div className="modal-header">
              <span>Dispatch Maintenance</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setModal(null)}
                aria-label="Close maintenance dialog"
              >
                x
              </button>
            </div>
            <form onSubmit={handleMaintenanceSubmit}>
              <label className="form-label" htmlFor="maintenance-station">
                Station
              </label>
              <select
                id="maintenance-station"
                className="form-input"
                value={maintenanceForm.station_id}
                onChange={(event) =>
                  setMaintenanceForm((current) => ({
                    ...current,
                    station_id: event.target.value,
                  }))
                }
              >
                <option value="">-- General --</option>
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>

              <label className="form-label" htmlFor="maintenance-title">
                Issue Title
              </label>
              <input
                id="maintenance-title"
                type="text"
                className="form-input"
                placeholder="e.g. Sensor calibration needed"
                value={maintenanceForm.title}
                onChange={(event) =>
                  setMaintenanceForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                required
              />

              <label className="form-label" htmlFor="maintenance-message">
                Description
              </label>
              <textarea
                id="maintenance-message"
                className="form-input"
                rows="3"
                placeholder="Describe the maintenance task..."
                value={maintenanceForm.message}
                onChange={(event) =>
                  setMaintenanceForm((current) => ({
                    ...current,
                    message: event.target.value,
                  }))
                }
                required
              />

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={submitting}
                >
                  {submitting ? "Dispatching..." : "Dispatch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </>
  );
}

export default function AdminDashboard() {
  return (
    <DashboardLayout
      title="Flood Monitoring Overview"
      description="Real-time water-level monitoring and AI-powered flood detection across active stations."
    >
      <AdminDashboardContent />
    </DashboardLayout>
  );
}
