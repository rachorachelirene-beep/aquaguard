import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import {
  formatDateTime,
  getAlertBadge,
  getResponseStatus,
  getWaterStatus,
  toNumber,
} from "./responderUtils";

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

    return {
      station,
      reading,
      status: reading
        ? getWaterStatus(reading.level_m, station)
        : {
            key: "unknown",
            label: "No data",
            className: "gray",
            badge: "badge-gray",
          },
    };
  });
}

export default function ResponderDashboard() {
  const { profile } = useAuth();
  const responderId = profile?.id ?? "";
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [stations, setStations] = useState([]);
  const [readings, setReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [weather, setWeather] = useState(null);

  const loadDashboard = useCallback(async () => {
    try {
      setLoadError("");

      const [
        stationsResult,
        readingsResult,
        alertsResult,
        logsResult,
        weatherResult,
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
          .limit(500),
        supabase
          .from("alerts")
          .select("id, station_id, type, title, message, is_resolved, created_at")
          .eq("is_resolved", false)
          .in("type", ["critical", "warning"])
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("response_logs")
          .select("id, alert_id, station_id, responder_id, status, notes, created_at, updated_at")
          .eq("responder_id", responderId)
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase
          .from("weather_readings")
          .select("temperature, precipitation, condition_text, flood_risk, recorded_at")
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const firstError = [
        stationsResult.error,
        readingsResult.error,
        alertsResult.error,
        logsResult.error,
        weatherResult.error,
      ].find(Boolean);

      if (firstError) {
        throw firstError;
      }

      setStations(stationsResult.data ?? []);
      setReadings(readingsResult.data ?? []);
      setAlerts(alertsResult.data ?? []);
      setLogs(logsResult.data ?? []);
      setWeather(weatherResult.data ?? null);
    } catch (error) {
      console.error("Responder dashboard error:", error);
      setLoadError(error.message || "Unable to load responder dashboard.");
    } finally {
      setLoading(false);
    }
  }, [responderId]);

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
    () => buildLatestReadings(stations, readings),
    [stations, readings]
  );
  const primary = stationCards.find((item) => item.reading) ?? stationCards[0];
  const currentLevel = toNumber(primary?.reading?.level_m);
  const primaryStatus = primary?.reading
    ? getWaterStatus(currentLevel, primary.station)
    : { label: "No data", className: "gray", badge: "badge-gray" };
  const criticalStations = stationCards.filter(
    (item) => item.status.key === "critical"
  ).length;
  const warningStations = stationCards.filter(
    (item) => item.status.key === "warning"
  ).length;
  const clearedLogs = logs.filter((log) => log.status === "cleared").length;

  return (
    <DashboardLayout
      title="Responder Dashboard"
      description="Emergency alerts, affected areas, and response coordination."
    >
      {loading && (
        <div className="page-content">
          <div className="section-card dashboard-empty">
            Loading responder dashboard...
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
        <main className="page-content officer-page">
          <section className="stat-cards dashboard-secondary-cards">
            <div className="stat-card warning-card">
              <div className="stat-header">
                <span className="stat-label">FLOOD STATUS</span>
                <span className={`stat-icon ${primaryStatus.className}`}>!</span>
              </div>
              <div className={`stat-value ${primaryStatus.className} big`}>
                {primaryStatus.label}
              </div>
              <div className="stat-sub">{primary?.station?.name ?? "No station"}</div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-label">CURRENT LEVEL</span>
                <span className="stat-icon blue">~</span>
              </div>
              <div className="stat-value blue">
                {primary?.reading ? `${currentLevel.toFixed(2)} m` : "No data"}
              </div>
              <div className="stat-sub">
                Updated {formatDateTime(primary?.reading?.recorded_at)}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span className="stat-label">EMERGENCY ALERTS</span>
                <span className="stat-icon red">!</span>
              </div>
              <div className="stat-value red">{alerts.length}</div>
              <div className="stat-sub">REQUIRE RESPONSE</div>
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
                {weather?.temperature ?? "--"}C | Risk{" "}
                {Math.round(toNumber(weather?.flood_risk) * 100)}%
              </div>
            </div>
          </section>

          <section className="resident-dashboard-grid">
            <div className="section-card">
              <div className="section-title">
                <span>Affected Areas</span>
                <span className="badge badge-red">
                  {criticalStations} critical
                </span>
              </div>
              <div className="resident-station-grid responder-dashboard-stations">
                {stationCards.slice(0, 6).map((item) => (
                  <article
                    className="lm-station-card resident-station-card"
                    key={item.station.id}
                  >
                    <div className="lm-station-top">
                      <div className="lm-station-name">{item.station.name}</div>
                      <span className={`lm-dot ${item.status.className}`} />
                    </div>
                    <strong className={`stat-value ${item.status.className}`}>
                      {item.reading
                        ? `${toNumber(item.reading.level_m).toFixed(2)} m`
                        : "No data"}
                    </strong>
                    <span>{item.station.location}</span>
                    <span className={`badge ${item.status.badge}`}>
                      {item.status.label}
                    </span>
                  </article>
                ))}
              </div>
              <Link className="resident-view-link" to="/responder/affected-areas">
                View all affected areas ({warningStations} warning)
              </Link>
            </div>

            <div className="section-card">
              <div className="section-title">
                <span>Emergency Alerts</span>
                <Link className="resident-view-link" to="/responder/emergency-alerts">
                  Open alerts
                </Link>
              </div>
              <div className="resident-list">
                {alerts.length === 0 ? (
                  <div className="dashboard-empty">
                    No active critical or warning alerts.
                  </div>
                ) : (
                  alerts.slice(0, 6).map((alert) => (
                    <article className="officer-list-item" key={alert.id}>
                      <div className="officer-list-heading">
                        <strong>{alert.title}</strong>
                        <span className={`badge ${getAlertBadge(alert.type)}`}>
                          {alert.type}
                        </span>
                      </div>
                      <span>{alert.message?.slice(0, 120)}</span>
                      <small>{formatDateTime(alert.created_at)}</small>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="section-card">
            <div className="section-title">
              <span>My Response Logs</span>
              <span className="badge badge-green">{clearedLogs} cleared</span>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Updated</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="officer-table-empty">
                        No response logs yet.
                      </td>
                    </tr>
                  ) : (
                    logs.slice(0, 8).map((log) => {
                      const status = getResponseStatus(log.status);

                      return (
                        <tr key={log.id}>
                          <td>{formatDateTime(log.updated_at ?? log.created_at)}</td>
                          <td>
                            <span className={`badge ${status.badge}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="officer-table-message">
                            {log.notes || "--"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <Link className="resident-view-link" to="/responder/response-logs">
              Manage response logs
            </Link>
          </section>
        </main>
      )}
    </DashboardLayout>
  );
}
