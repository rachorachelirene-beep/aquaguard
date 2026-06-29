import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";

const fallbackTips = [
  {
    id: "fallback-1",
    icon: "!",
    title: "Prepare an emergency bag",
    body: "Keep water, food, flashlight, medicine, power bank, and important documents ready.",
  },
  {
    id: "fallback-2",
    icon: "~",
    title: "Avoid floodwater",
    body: "Do not walk or drive through floodwater. It may be deeper or faster than it looks.",
  },
  {
    id: "fallback-3",
    icon: "^",
    title: "Move to higher ground",
    body: "If water level rises quickly, move your family to a safe elevated area immediately.",
  },
];

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatLevel(value) {
  return `${toNumber(value).toFixed(2)} m`;
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

function decodeIcon(value) {
  if (!value) {
    return "!";
  }

  return String(value)
    .replace(/&#(\d+);/g, (_match, code) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    );
}

function getStatus(level, warning, critical) {
  if (level >= critical) {
    return {
      key: "critical",
      label: "CRITICAL",
      residentLabel: "DANGER - EVACUATE NOW",
      className: "red",
      badge: "badge-red",
      icon: "!",
    };
  }

  if (level >= warning) {
    return {
      key: "warning",
      label: "WARNING",
      residentLabel: "WARNING - STAY ALERT",
      className: "orange",
      badge: "badge-orange",
      icon: "!",
    };
  }

  return {
    key: "normal",
    label: "NORMAL",
    residentLabel: "SAFE - NO FLOOD THREAT",
    className: "green",
    badge: "badge-green",
    icon: "✓",
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

function getAdvisoryBadge(level) {
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

  return stations.map((station) => {
    const reading = latestByStation.get(String(station.id)) ?? null;
    const level = toNumber(reading?.level_m);
    const warning = toNumber(station.warning_level, 2);
    const critical = toNumber(station.critical_level, 2.5);

    return {
      station,
      reading,
      status: reading
        ? getStatus(level, warning, critical)
        : {
            key: "unknown",
            label: "NO DATA",
            residentLabel: "NO CURRENT READING",
            className: "gray",
            badge: "badge-gray",
            icon: "?",
          },
    };
  });
}

export default function ResidentDashboard() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [stations, setStations] = useState([]);
  const [latestReadings, setLatestReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [advisories, setAdvisories] = useState([]);
  const [tips, setTips] = useState([]);

  const loadDashboard = useCallback(async () => {
    try {
      setLoadError("");

      const [
        stationsResult,
        readingsResult,
        alertsResult,
        announcementsResult,
        advisoriesResult,
        tipsResult,
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
          .from("alerts")
          .select(
            "id, station_id, type, title, message, is_resolved, created_at"
          )
          .eq("is_resolved", false)
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("announcements")
          .select("id, title, body, created_at, created_by")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("evacuation_advisories")
          .select("id, title, area, level, details, is_active, created_at")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("safety_reminders")
          .select("id, title, body, icon, is_active")
          .eq("is_active", true)
          .order("id", { ascending: true }),
      ]);

      const firstError = [
        stationsResult.error,
        readingsResult.error,
        alertsResult.error,
        announcementsResult.error,
        advisoriesResult.error,
      ].find(Boolean);

      if (firstError) {
        throw firstError;
      }

      setStations(stationsResult.data ?? []);
      setLatestReadings(readingsResult.data ?? []);
      setAlerts(alertsResult.data ?? []);
      setAnnouncements(announcementsResult.data ?? []);
      setAdvisories(advisoriesResult.data ?? []);
      setTips(tipsResult.error ? fallbackTips : tipsResult.data ?? []);
    } catch (error) {
      console.error("Resident dashboard loading error:", error);
      setLoadError(
        error.message || "Unable to load resident dashboard data."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function boot({ initial = false } = {}) {
      if (initial) {
        setLoading(true);
      }

      await loadDashboard();

      if (!active) {
        return;
      }
    }

    boot({ initial: true });
    const interval = window.setInterval(() => boot(), 30000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [loadDashboard]);

  const stationCards = useMemo(
    () => buildLatestReadings(stations, latestReadings),
    [stations, latestReadings]
  );

  const primary = stationCards.find((item) => item.reading) ?? stationCards[0];
  const currentLevel = toNumber(primary?.reading?.level_m);
  const warningLevel = toNumber(primary?.station?.warning_level, 2);
  const criticalLevel = toNumber(primary?.station?.critical_level, 2.5);
  const primaryStatus = primary?.reading
    ? getStatus(currentLevel, warningLevel, criticalLevel)
    : {
        key: "unknown",
        residentLabel: "NO CURRENT READING",
        className: "gray",
        icon: "?",
      };
  const activeAlerts = alerts.filter((alert) =>
    ["critical", "warning"].includes(alert.type)
  );

  return (
    <DashboardLayout
      title="Flood Status"
      description="Stay informed about flood conditions in your area."
    >
      {loading && (
        <div className="page-content">
          <div className="section-card dashboard-empty">
            Loading resident dashboard...
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
        <main className="page-content resident-dashboard">
          <section
            className={`resident-status-banner resident-status-${primaryStatus.key}`}
          >
            <div className="resident-status-icon">
              {primaryStatus.icon}
            </div>
            <div>
              <h2>{primaryStatus.residentLabel}</h2>
              <p>
                Water Level: <strong>{formatLevel(currentLevel)}</strong>{" "}
                | Warning: {warningLevel.toFixed(2)} m | Critical:{" "}
                {criticalLevel.toFixed(2)} m
              </p>
              <span>
                {primary?.station?.name ?? "No station"} · Updated{" "}
                {formatDateTime(primary?.reading?.recorded_at)}
              </span>
            </div>
          </section>

          <section className="resident-station-grid">
            {stationCards.length === 0 ? (
              <div className="section-card dashboard-empty">
                No monitoring stations configured.
              </div>
            ) : (
              stationCards.map((item) => (
                <article
                  className="lm-station-card resident-station-card"
                  key={item.station.id}
                >
                  <div className="lm-station-top">
                    <div className="lm-station-name">
                      {item.station.name}
                    </div>
                    <span className={`lm-dot ${item.status.className}`} />
                  </div>
                  <strong className={`stat-value ${item.status.className}`}>
                    {item.reading
                      ? formatLevel(item.reading.level_m)
                      : "No data"}
                  </strong>
                  <span>{item.station.location ?? item.station.station_code}</span>
                  <span className={`badge ${item.status.badge}`}>
                    {item.status.label}
                  </span>
                </article>
              ))
            )}
          </section>

          {advisories.length > 0 && (
            <section className="section-card resident-advisory-card">
              <div className="section-title">
                <span>Active Evacuation Advisories</span>
                <span className="badge badge-red">
                  {advisories.length} ACTIVE
                </span>
              </div>

              <div className="resident-list">
                {advisories.map((advisory) => (
                  <article
                    className="officer-list-item resident-advisory-item"
                    key={advisory.id}
                  >
                    <div className="officer-list-heading">
                      <strong>{advisory.title}</strong>
                      <span
                        className={`badge ${getAdvisoryBadge(
                          advisory.level
                        )}`}
                      >
                        {advisory.level}
                      </span>
                    </div>
                    <span>{advisory.area}</span>
                    <p>{advisory.details}</p>
                    <small>{formatDateTime(advisory.created_at)}</small>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="resident-dashboard-grid">
            <div className="section-card">
              <div className="section-title">
                <span>Active Alerts</span>
                {activeAlerts.length > 0 && (
                  <span className="badge badge-red">
                    {activeAlerts.length}
                  </span>
                )}
              </div>

              <div className="alert-grid resident-alert-grid">
                {alerts.length === 0 ? (
                  <div className="dashboard-empty">
                    No active alerts at this time.
                  </div>
                ) : (
                  alerts.slice(0, 6).map((alert) => (
                    <article
                      className={`alert-card ${getAlertClass(alert.type)}`}
                      key={alert.id}
                    >
                      <div className="alert-time">
                        {formatDateTime(alert.created_at)}
                      </div>
                      <div className="alert-title">{alert.title}</div>
                      <div className="alert-body">{alert.message}</div>
                    </article>
                  ))
                )}
              </div>

              <Link className="resident-view-link" to="/resident/alerts">
                View all alerts
              </Link>
            </div>

            <div className="section-card">
              <div className="section-title">Announcements</div>

              <div className="resident-list">
                {announcements.length === 0 ? (
                  <div className="dashboard-empty">
                    No announcements at this time.
                  </div>
                ) : (
                  announcements.slice(0, 5).map((announcement) => (
                    <article
                      className="officer-list-item resident-list-item"
                      key={announcement.id}
                    >
                      <strong>{announcement.title}</strong>
                      <span>{announcement.body?.slice(0, 140)}</span>
                      <small>{formatDateTime(announcement.created_at)}</small>
                    </article>
                  ))
                )}
              </div>

              <Link
                className="resident-view-link"
                to="/resident/announcements"
              >
                View all announcements
              </Link>
            </div>
          </section>

          <section className="section-card">
            <div className="section-title">Safety Reminders</div>

            <div className="resident-tip-grid">
              {(tips.length > 0 ? tips : fallbackTips)
                .slice(0, 6)
                .map((tip) => (
                  <article className="resident-tip-card" key={tip.id}>
                    <div className="resident-tip-icon">
                      {decodeIcon(tip.icon)}
                    </div>
                    <strong>{tip.title}</strong>
                    <span>{tip.body}</span>
                  </article>
                ))}
            </div>

            <Link className="resident-view-link" to="/resident/safety-tips">
              View all safety tips
            </Link>
          </section>
        </main>
      )}
    </DashboardLayout>
  );
}
