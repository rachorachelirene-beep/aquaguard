import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatLevel(value) {
  return `${toNumber(value).toFixed(2)} m`;
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

function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatus(level, warning, critical) {
  if (level >= critical) {
    return {
      key: "critical",
      label: "CRITICAL",
      className: "red",
      sub: `THRESHOLD: ${critical.toFixed(2)}M`,
    };
  }

  if (level >= warning) {
    return {
      key: "warning",
      label: "WARNING",
      className: "orange",
      sub: `THRESHOLD: ${warning.toFixed(2)}M`,
    };
  }

  return {
    key: "normal",
    label: "NORMAL",
    className: "green",
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

function getAdvisoryClass(level) {
  if (level === "mandatory") {
    return "badge-red";
  }

  if (level === "warning") {
    return "badge-orange";
  }

  return "badge-green";
}

function buildLatestReadings(stations, readings) {
  const latestByStation = new Map();

  readings.forEach((reading) => {
    const key = String(reading.station_id);

    if (!latestByStation.has(key)) {
      latestByStation.set(key, reading);
    }
  });

  return stations
    .map((station) => ({
      ...latestByStation.get(String(station.id)),
      station,
    }))
    .filter((reading) => reading.id);
}

function OfficerDashboardContent() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [flash, setFlash] = useState(null);
  const [stations, setStations] = useState([]);
  const [latestReadings, setLatestReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [weather, setWeather] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [advisories, setAdvisories] = useState([]);
  const [modal, setModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    body: "",
  });
  const [advisoryForm, setAdvisoryForm] = useState({
    title: "",
    area: "",
    level: "advisory",
    details: "",
  });

  const loadDashboard = useCallback(async () => {
    setLoadError("");

    const [
      stationsResult,
      readingsResult,
      alertsResult,
      weatherResult,
      announcementsResult,
      advisoriesResult,
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
        .from("weather_readings")
        .select(
          "id, station_id, temperature, precipitation, rain_6h, wind_speed, weather_code, condition_text, flood_risk, recorded_at"
        )
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("announcements")
        .select("id, title, body, created_at, created_by")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("evacuation_advisories")
        .select("id, title, area, level, details, is_active, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const firstError = [
      stationsResult.error,
      readingsResult.error,
      alertsResult.error,
      weatherResult.error,
      announcementsResult.error,
      advisoriesResult.error,
    ].find(Boolean);

    if (firstError) {
      throw firstError;
    }

    const nextStations = stationsResult.data ?? [];
    const nextReadings = readingsResult.data ?? [];
    const nextLatestReadings = buildLatestReadings(
      nextStations,
      nextReadings
    );
    const primaryStation =
      nextLatestReadings[0]?.station ?? nextStations[0];
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
    setLatestReadings(nextLatestReadings);
    setAlerts(alertsResult.data ?? []);
    setWeather(weatherResult.data ?? null);
    setAnnouncements(announcementsResult.data ?? []);
    setAdvisories(advisoriesResult.data ?? []);
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
        console.error("Officer dashboard load error:", error);

        if (active) {
          setLoadError(
            error.message || "Unable to load officer dashboard data."
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

  useEffect(() => {
    if (!flash) {
      return undefined;
    }

    const timer = window.setTimeout(() => setFlash(null), 5000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const primary = latestReadings[0] ?? null;
  const primaryStation = primary?.station ?? stations[0] ?? null;
  const currentLevel = toNumber(primary?.level_m);
  const criticalLevel = toNumber(primaryStation?.critical_level, 2.5);
  const warningLevel = toNumber(primaryStation?.warning_level, 2);
  const status = getStatus(currentLevel, warningLevel, criticalLevel);
  const activeAlerts = alerts.filter(
    (alert) =>
      !alert.is_resolved &&
      ["critical", "warning"].includes(alert.type)
  ).length;
  const stationName = primaryStation?.name ?? "No Station";
  const historyMax = Math.max(criticalLevel, 1);

  const stationSummary = stations.map((station) => {
    const reading = latestReadings.find(
      (item) => String(item.station?.id) === String(station.id)
    );
    const level = toNumber(reading?.level_m);
    const stationStatus = getStatus(
      level,
      toNumber(station.warning_level, warningLevel),
      toNumber(station.critical_level, criticalLevel)
    );

    return {
      station,
      reading,
      status: stationStatus,
    };
  });

  async function handleAnnouncementSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFlash(null);

    const { error } = await supabase.from("announcements").insert({
      title: announcementForm.title.trim(),
      body: announcementForm.body.trim(),
      created_by: profile?.id ?? null,
    });

    setSubmitting(false);

    if (error) {
      setFlash({ type: "error", text: error.message });
      return;
    }

    setAnnouncementForm({ title: "", body: "" });
    setModal(null);
    setFlash({ type: "success", text: "Announcement published." });
    await loadDashboard();
  }

  async function handleAdvisorySubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFlash(null);

    const { error } = await supabase
      .from("evacuation_advisories")
      .insert({
        title: advisoryForm.title.trim(),
        area: advisoryForm.area.trim(),
        level: advisoryForm.level,
        details: advisoryForm.details.trim(),
        is_active: true,
      });

    setSubmitting(false);

    if (error) {
      setFlash({ type: "error", text: error.message });
      return;
    }

    setAdvisoryForm({
      title: "",
      area: "",
      level: "advisory",
      details: "",
    });
    setModal(null);
    setFlash({ type: "success", text: "Evacuation advisory issued." });
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
            Loading officer dashboard data...
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
                <span className="stat-icon blue">~</span>
              </div>
              <div className="stat-value blue">
                {primary ? formatLevel(currentLevel) : "No data"}
              </div>
              <div className="stat-sub">STATION: {stationName}</div>
            </div>

            <div className="stat-card warning-card">
              <div className="stat-header">
                <span className="stat-label">FLOOD STATUS</span>
                <span className={`stat-icon ${status.className}`}>!</span>
              </div>
              <div className={`stat-value ${status.className} big`}>
                {primary ? status.label : "NO DATA"}
              </div>
              <div className="stat-sub">
                {primary ? status.sub : "WAITING FOR READING"}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-label">ACTIVE ALERTS</span>
                <span className="stat-icon orange">!</span>
              </div>
              <div className="stat-value orange">{activeAlerts}</div>
              <div className="stat-sub">UNRESOLVED WARNING/CRITICAL</div>
            </div>

            <div className="stat-card weather-card">
              <div className="stat-header">
                <span className="stat-label">WEATHER</span>
                <span className="stat-icon blue">~</span>
              </div>
              <div className="stat-value compact">
                {weather?.condition_text ?? "No data"}
              </div>
              <div className="stat-sub">
                {weather?.temperature ?? "--"}C | Rain:{" "}
                {weather ? toNumber(weather.precipitation).toFixed(1) : "--"}
                mm
              </div>
            </div>
          </section>

          <section className="mid-row">
            <div className="chart-card">
              <div className="panel-header">
                <span>WATER LEVEL HISTORY (24H)</span>
                <span className="legend">
                  <span className="dot-crit" />
                  Threshold
                  <span className="dot-trend" />
                  Reading
                </span>
              </div>
              <div className="bar-chart">
                {history.length === 0 && (
                  <div className="dashboard-empty">No history.</div>
                )}

                {history.map((reading) => {
                  const level = toNumber(reading.level_m);
                  const pct = Math.min(100, (level / historyMax) * 100);
                  const barStatus = getStatus(
                    level,
                    warningLevel,
                    criticalLevel
                  );

                  return (
                    <div
                      key={reading.id}
                      className="bar"
                      title={`${formatLevel(level)} @ ${formatTime(
                        reading.recorded_at
                      )}`}
                      style={{
                        height: `${Math.max(4, pct)}%`,
                        background:
                          barStatus.key === "critical"
                            ? "#d84a4a"
                            : barStatus.key === "warning"
                              ? "#c77b2a"
                              : "#1f6f8b",
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

            <div className="alerts-panel">
              <div className="panel-header">
                <span>RECENT ALERTS</span>
                <span className="badge-active">{activeAlerts} ACTIVE</span>
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
                      {alert.message?.slice(0, 75)}
                      {alert.message?.length > 75 ? "..." : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="bottom-row">
            <div className="section-card">
              <div className="section-title">
                <span>Announcements</span>
                <button
                  className="btn-submit"
                  type="button"
                  onClick={() => setModal("announcement")}
                >
                  New
                </button>
              </div>

              {announcements.length === 0 && (
                <div className="dashboard-empty">No announcements yet.</div>
              )}

              {announcements.slice(0, 4).map((announcement) => (
                <div className="officer-list-item" key={announcement.id}>
                  <strong>{announcement.title}</strong>
                  <span>{announcement.body?.slice(0, 100)}</span>
                  <small>{formatDateTime(announcement.created_at)}</small>
                </div>
              ))}
            </div>

            <div className="section-card">
              <div className="section-title">
                <span>Evacuation Advisories</span>
                <button
                  className="btn-submit"
                  type="button"
                  onClick={() => setModal("advisory")}
                >
                  Issue
                </button>
              </div>

              {advisories.length === 0 && (
                <div className="dashboard-empty">
                  No advisories issued.
                </div>
              )}

              {advisories.slice(0, 4).map((advisory) => (
                <div className="officer-list-item" key={advisory.id}>
                  <div className="officer-list-heading">
                    <strong>{advisory.title}</strong>
                    <span className={`badge ${getAdvisoryClass(advisory.level)}`}>
                      {advisory.level}
                    </span>
                  </div>
                  <span>{advisory.area}</span>
                  <small>
                    {advisory.is_active ? "Active" : "Inactive"} |{" "}
                    {formatDateTime(advisory.created_at)}
                  </small>
                </div>
              ))}
            </div>

            <div className="activity-card">
              <div className="panel-header">
                <span>STATION STATUS</span>
              </div>
              <div className="activity-list">
                {stationSummary.length === 0 && (
                  <div className="dashboard-empty">
                    No stations configured.
                  </div>
                )}

                {stationSummary.slice(0, 6).map((item) => (
                  <div className="activity-item" key={item.station.id}>
                    <span
                      className={`dot ${
                        item.status.key === "normal" ? "green" : "blue-dot"
                      }`}
                    />
                    {item.station.name}
                    <span className={`act-status ${item.status.className}`}>
                      {item.reading
                        ? formatLevel(item.reading.level_m)
                        : "No data"}
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
                <span>+</span>
                ISSUE PUBLIC
                <br />
                ANNOUNCEMENT
              </button>

              <button
                className="action-btn dark-btn"
                type="button"
                onClick={() => setModal("advisory")}
              >
                <span>!</span>
                ISSUE EVACUATION
                <br />
                ADVISORY
              </button>

              <Link className="action-btn dark-btn" to="/officer/reports">
                <span>~</span>
                VIEW INCIDENT
                <br />
                REPORTS
              </Link>
            </div>
          </section>
        </>
      )}

      {modal === "announcement" && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <span>Issue Announcement</span>
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

      {modal === "advisory" && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <span>Issue Evacuation Advisory</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setModal(null)}
              >
                x
              </button>
            </div>
            <form onSubmit={handleAdvisorySubmit}>
              <label className="form-label" htmlFor="advisory-title">
                Title
              </label>
              <input
                id="advisory-title"
                type="text"
                className="form-input"
                value={advisoryForm.title}
                onChange={(event) =>
                  setAdvisoryForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                required
              />

              <label className="form-label" htmlFor="advisory-area">
                Affected Area
              </label>
              <input
                id="advisory-area"
                type="text"
                className="form-input"
                value={advisoryForm.area}
                onChange={(event) =>
                  setAdvisoryForm((current) => ({
                    ...current,
                    area: event.target.value,
                  }))
                }
                required
              />

              <label className="form-label" htmlFor="advisory-level">
                Level
              </label>
              <select
                id="advisory-level"
                className="form-input"
                value={advisoryForm.level}
                onChange={(event) =>
                  setAdvisoryForm((current) => ({
                    ...current,
                    level: event.target.value,
                  }))
                }
              >
                <option value="advisory">Advisory</option>
                <option value="warning">Warning</option>
                <option value="mandatory">Mandatory</option>
              </select>

              <label className="form-label" htmlFor="advisory-details">
                Details
              </label>
              <textarea
                id="advisory-details"
                className="form-input"
                rows="4"
                value={advisoryForm.details}
                onChange={(event) =>
                  setAdvisoryForm((current) => ({
                    ...current,
                    details: event.target.value,
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
                  {submitting ? "Issuing..." : "Issue Advisory"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default function OfficerDashboard() {
  return (
    <DashboardLayout
      title="Barangay Officer Dashboard"
      description="Monitor water levels, alerts, announcements and advisories."
    >
      <OfficerDashboardContent />
    </DashboardLayout>
  );
}
