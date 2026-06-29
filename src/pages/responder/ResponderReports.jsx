import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import {
  downloadCsv,
  formatDateTime,
  getResponseStatus,
  getWaterStatus,
  toNumber,
} from "./responderUtils";

export default function ResponderReports() {
  const { profile } = useAuth();
  const responderId = profile?.id ?? "";
  const [stations, setStations] = useState([]);
  const [readings, setReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setFlash(null);

      const [stationsResult, readingsResult, alertsResult, logsResult] =
        await Promise.all([
          supabase
            .from("stations")
            .select("id, name, location, station_code, warning_level, critical_level")
            .order("name", { ascending: true }),
          supabase
            .from("water_levels")
            .select("id, station_id, level_m, rainfall_mm, recorded_at")
            .order("recorded_at", { ascending: false })
            .limit(500),
          supabase
            .from("alerts")
            .select("id, station_id, type, title, message, is_resolved, created_at")
            .in("type", ["critical", "warning"])
            .order("created_at", { ascending: false })
            .limit(500),
          supabase
            .from("response_logs")
            .select("id, alert_id, station_id, responder_id, status, notes, created_at, updated_at")
            .eq("responder_id", responderId)
            .order("updated_at", { ascending: false })
            .limit(500),
        ]);

      const firstError = [
        stationsResult.error,
        readingsResult.error,
        alertsResult.error,
        logsResult.error,
      ].find(Boolean);

      if (firstError) {
        throw firstError;
      }

      setStations(stationsResult.data ?? []);
      setReadings(readingsResult.data ?? []);
      setAlerts(alertsResult.data ?? []);
      setLogs(logsResult.data ?? []);
    } catch (error) {
      console.error("Responder reports error:", error);
      setFlash({
        type: "error",
        text: error.message || "Unable to load reports.",
      });
    } finally {
      setLoading(false);
    }
  }, [responderId]);

  useEffect(() => {
    async function boot() {
      await loadReports();
    }

    boot();
  }, [loadReports]);

  const stationMap = useMemo(() => {
    const map = new Map();

    stations.forEach((station) => map.set(String(station.id), station));
    return map;
  }, [stations]);

  const alertMap = useMemo(() => {
    const map = new Map();

    alerts.forEach((alert) => map.set(String(alert.id), alert));
    return map;
  }, [alerts]);

  const latestRows = useMemo(() => {
    const latestByStation = new Map();

    readings.forEach((reading) => {
      const key = String(reading.station_id);

      if (!latestByStation.has(key)) {
        latestByStation.set(key, reading);
      }
    });

    return stations.map((station) => ({
      station,
      reading: latestByStation.get(String(station.id)) ?? null,
    }));
  }, [stations, readings]);

  const activeEmergencies = alerts.filter((alert) => !alert.is_resolved).length;
  const cleared = logs.filter((log) => log.status === "cleared").length;

  function exportLevels() {
    downloadCsv(
      `responder-levels-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        ["Station", "Level (m)", "Rainfall (mm)", "Last Reading", "Status"],
        ...latestRows.map((row) => {
          const status = row.reading
            ? getWaterStatus(row.reading.level_m, row.station)
            : { label: "No data" };

          return [
            row.station.name,
            row.reading ? toNumber(row.reading.level_m).toFixed(2) : "",
            row.reading ? toNumber(row.reading.rainfall_mm).toFixed(1) : "",
            row.reading ? formatDateTime(row.reading.recorded_at) : "",
            status.label,
          ];
        }),
      ]
    );
  }

  function exportLogs() {
    downloadCsv(
      `responder-logs-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        ["Date", "Alert", "Station", "Status", "Notes"],
        ...logs.map((log) => {
          const alert = alertMap.get(String(log.alert_id));
          const station = stationMap.get(String(log.station_id));
          const status = getResponseStatus(log.status);

          return [
            formatDateTime(log.updated_at ?? log.created_at),
            alert?.title ?? "General response",
            station?.name ?? "",
            status.label,
            log.notes ?? "",
          ];
        }),
      ]
    );
  }

  return (
    <DashboardLayout
      title="Emergency Reports"
      description="Water-level data and response history."
    >
      {flash && (
        <div className={`flash ${flash.type}`}>{flash.text}</div>
      )}

      <main className="page-content officer-page">
        <section className="stat-cards officer-stat-strip">
          <div className="stat-card warning-card">
            <div className="stat-label">ACTIVE EMERGENCIES</div>
            <div className="stat-value red">{activeEmergencies}</div>
            <div className="stat-sub">CRITICAL/WARNING</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">MY RESPONSES</div>
            <div className="stat-value blue">{logs.length}</div>
            <div className="stat-sub">TOTAL LOGS</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">CLEARED</div>
            <div className="stat-value green">{cleared}</div>
            <div className="stat-sub">COMPLETED RESPONSES</div>
          </div>
        </section>

        <section className="section-card">
          <div className="section-title">
            <span>Current Water Levels</span>
            <div className="officer-table-actions">
              <button
                className="btn-cancel officer-icon-button"
                type="button"
                onClick={loadReports}
                disabled={loading}
              >
                <RefreshCw size={16} className={loading ? "officer-spin" : ""} />
                Refresh
              </button>
              <button
                className="btn-submit officer-icon-button"
                type="button"
                onClick={exportLevels}
              >
                <Download size={16} />
                Export CSV
              </button>
            </div>
          </div>

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Station</th>
                  <th>Level</th>
                  <th>Rainfall</th>
                  <th>Last Reading</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {latestRows.map((row) => {
                  const status = row.reading
                    ? getWaterStatus(row.reading.level_m, row.station)
                    : { label: "No data", badge: "badge-gray" };

                  return (
                    <tr key={row.station.id}>
                      <td>{row.station.name}</td>
                      <td>{row.reading ? `${toNumber(row.reading.level_m).toFixed(2)} m` : "--"}</td>
                      <td>{row.reading ? `${toNumber(row.reading.rainfall_mm).toFixed(1)} mm` : "--"}</td>
                      <td>{formatDateTime(row.reading?.recorded_at)}</td>
                      <td>
                        <span className={`badge ${status.badge}`}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section-card">
          <div className="section-title">
            <span>My Response History</span>
            <button
              className="btn-submit officer-icon-button"
              type="button"
              onClick={exportLogs}
              disabled={logs.length === 0}
            >
              <Download size={16} />
              Export CSV
            </button>
          </div>

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Alert</th>
                  <th>Station</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="officer-table-empty">
                      No response logs yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const alert = alertMap.get(String(log.alert_id));
                    const station = stationMap.get(String(log.station_id));
                    const status = getResponseStatus(log.status);

                    return (
                      <tr key={log.id}>
                        <td>{formatDateTime(log.updated_at ?? log.created_at)}</td>
                        <td>{alert?.title ?? "General response"}</td>
                        <td>{station?.name ?? "--"}</td>
                        <td>
                          <span className={`badge ${status.badge}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="officer-table-message">{log.notes}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}
