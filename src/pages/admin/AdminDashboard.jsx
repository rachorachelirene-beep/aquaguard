import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

const cameraApiUrl =
  import.meta.env.VITE_CAMERA_API_URL ?? "http://localhost:5000";

const weatherIcons = {
  0: "☀",
  1: "☀",
  2: "☁",
  3: "☁",
  45: "☁",
  51: "☂",
  61: "☂",
  71: "☁",
  80: "☂",
  95: "⚡",
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatLevel(value) {
  return `${toNumber(value).toFixed(2)} m`;
}

function formatOneDecimal(value) {
  return toNumber(value).toFixed(1);
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
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState({});
  const [uptimeDays, setUptimeDays] = useState(null);
  const [weather, setWeather] = useState(null);
  const [yolo, setYolo] = useState(null);
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

  const loadDashboard = useCallback(async () => {
    setLoadError("");

    const [
      stationsResult,
      readingsResult,
      alertsResult,
      settingsResult,
      weatherResult,
      yoloResult,
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
      supabase.from("settings").select("key, value"),
      supabase
        .from("weather_readings")
        .select(
          "id, station_id, temperature, precipitation, rain_1h, rain_6h, wind_speed, weather_code, condition_text, flood_risk, recorded_at"
        )
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("yolo_detections")
        .select(
          "id, station_id, water_coverage, level_m, confidence, weather_risk, flood_risk, detected_at"
        )
        .order("detected_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const firstError = [
      stationsResult.error,
      readingsResult.error,
      alertsResult.error,
      settingsResult.error,
      weatherResult.error,
      yoloResult.error,
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
      .filter((reading) => reading.id);

    const primaryStation = nextLatest[0]?.station ?? nextStations[0];
    let nextHistory = [];

    if (primaryStation?.id) {
      const historyResult = await supabase
        .from("water_levels")
        .select("id, station_id, level_m, rainfall_mm, recorded_at")
        .eq("station_id", primaryStation.id)
        .order("recorded_at", { ascending: false })
        .limit(24);

      if (historyResult.error) {
        throw historyResult.error;
      }

      nextHistory = (historyResult.data ?? []).reverse();
    }

    setStations(nextStations);
    setLatestReadings(nextLatest);
    setAlerts(alertsResult.data ?? []);
    const nextSettings = buildSettingsMap(settingsResult.data);

    setSettings(nextSettings);
    setUptimeDays(computeUptimeDays(nextSettings.uptime_start));
    setWeather(weatherResult.data ?? null);
    setYolo(yoloResult.data ?? null);
    setHistory(nextHistory);
  }, []);

  useEffect(() => {
    let active = true;

    async function boot({ initial = false } = {}) {
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
  const currentLevel = toNumber(primary?.level_m);
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
  const rainfall24 = toNumber(primary?.rainfall_mm);
  const status = getStatus(
    currentLevel,
    warningLevel,
    criticalLevel
  );
  const activeAlerts = alerts.filter(
    (alert) =>
      !alert.is_resolved &&
      ["critical", "warning"].includes(alert.type)
  ).length;

  const historyMax = Math.max(criticalLevel, normalLevel, 1);
  const yoloRisk = yolo ? Math.round(toNumber(yolo.flood_risk) * 100) : null;
  const weatherRisk = weather
    ? Math.round(toNumber(weather.flood_risk) * 100)
    : null;
  const stationName = primaryStation?.name ?? "No Station";
  const waterPct = Math.min(
    100,
    criticalLevel > 0 ? (currentLevel / criticalLevel) * 100 : 0
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
                <span className="stat-icon blue">≈</span>
              </div>
              <div className="stat-value blue">
                {primary ? formatLevel(currentLevel) : "No data"}
              </div>
              <div className="stat-sub">STATION: {stationName}</div>
            </div>

            <div className="stat-card warning-card">
              <div className="stat-header">
                <span className="stat-label">
                  STATUS: {status.header}
                </span>
                <span
                  className={`stat-icon ${status.className}`}
                >
                  !
                </span>
              </div>
              <div
                className={`stat-value ${status.className} big`}
              >
                {primary ? status.label : "NO DATA"}
              </div>
              <div className="stat-sub">
                {primary ? status.sub : "WAITING FOR READING"}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-label">RAINFALL (24H)</span>
                <span className="stat-icon blue">≋</span>
              </div>
              <div className="stat-value blue">
                {primary ? `${formatOneDecimal(rainfall24)} mm` : "No data"}
              </div>
              <div className="stat-sub">LATEST READING</div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-label">SYSTEM UPTIME</span>
                <span className="stat-icon green">⚡</span>
              </div>
              <div className="stat-value green">
                {uptimeDays == null ? "No data" : "Online"}
              </div>
              <div className="stat-sub">
                {uptimeDays == null
                  ? "UPTIME START NOT SET"
                  : `OPERATIONAL (${uptimeDays} DAYS)`}
              </div>
            </div>
          </section>

          <section className="stat-cards dashboard-secondary-cards">
            <div className="stat-card weather-card">
              <div className="stat-header">
                <span className="stat-label">WEATHER</span>
                <span className="weather-icon">
                  {weatherIcons[Number(weather?.weather_code)] ?? "☁"}
                </span>
              </div>
              <div className="stat-value compact">
                {weather?.condition_text ?? "No data"}
              </div>
              <div className="stat-sub">
                {weather?.temperature ?? "—"}°C |{" "}
                {weather?.wind_speed ?? "—"} km/h
              </div>
            </div>

            <div className="stat-card rain-card">
              <div className="stat-header">
                <span className="stat-label">RAIN NOW</span>
                <span className="stat-icon rain">≋</span>
              </div>
              <div className="stat-value rain">
                {weather
                  ? `${formatOneDecimal(weather.precipitation)} mm`
                  : "No data"}
              </div>
              <div className="stat-sub">
                6h forecast:{" "}
                {weather?.rain_6h == null
                  ? "—"
                  : `${formatOneDecimal(weather.rain_6h)} mm`}
              </div>
            </div>

            <div className="stat-card weather-risk-card">
              <div className="stat-header">
                <span className="stat-label">WEATHER RISK</span>
                <span className="stat-icon orange">!</span>
              </div>
              <div className="stat-value orange">
                {weatherRisk == null ? "No data" : `${weatherRisk}%`}
              </div>
              <div className="stat-sub">Weather contribution</div>
            </div>

            <div className="stat-card yolo-card">
              <div className="stat-header">
                <span className="stat-label">YOLO FLOOD RISK</span>
                <span className="stat-icon red">AI</span>
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
                {yoloRisk == null ? "No data" : `${yoloRisk}%`}
              </div>
              <div className="stat-sub">
                {yolo
                  ? `Water: ${formatOneDecimal(
                      yolo.water_coverage
                    )}% | ${formatTime(yolo.detected_at)}`
                  : "Start YOLO detector"}
              </div>
            </div>
          </section>

          <section className="mid-row">
            <div className="live-feed-card">
              <div className="live-badge">
                <span className="live-dot" />
                LIVE
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
                    ▶ View Live
                  </Link>
                </div>
              </div>
            </div>

            <div className="alerts-panel">
              <div className="panel-header">
                <span>RECENT ALERTS</span>
                <span className="badge-active">
                  {activeAlerts} ACTIVE
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
                        VIEW DATA →
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
                <span>▱ History (24h)</span>
                <span className="legend">
                  <span className="dot-crit" />
                  Crit
                  <span className="dot-trend" />
                  Trend
                </span>
              </div>
              <div className="bar-chart">
                {history.length === 0 && (
                  <div className="dashboard-empty">No history.</div>
                )}

                {history.map((reading) => {
                  const level = toNumber(reading.level_m);
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
                <span>▱ Station Info</span>
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
                <span>▣</span>
                ISSUE PUBLIC
                <br />
                ANNOUNCEMENT
              </button>

              <button
                className="action-btn dark-btn"
                type="button"
                onClick={() => setModal("maintenance")}
              >
                <span>⚙</span>
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
          <div className="modal-box">
            <div className="modal-header">
              <span>Issue Public Announcement</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setModal(null)}
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
          <div className="modal-box">
            <div className="modal-header">
              <span>Dispatch Maintenance</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setModal(null)}
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

      <span className="dashboard-camera-url" hidden>
        {cameraApiUrl}
      </span>
    </>
  );
}

export default function AdminDashboard() {
  return (
    <DashboardLayout
      title="Dashboard"
      description="AquaGuard administrative control center."
    >
      <AdminDashboardContent />
    </DashboardLayout>
  );
}
