import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardPlus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { formatDateTime, getResponseStatus } from "./responderUtils";

export default function ResponderCoordinate() {
  const { profile } = useAuth();
  const responderId = profile?.id ?? "";
  const [logs, setLogs] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [stations, setStations] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadCoordination = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const [logsResult, announcementsResult, stationsResult, profilesResult] =
        await Promise.all([
          supabase
            .from("response_logs")
            .select(
              "id, alert_id, station_id, responder_id, status, notes, created_at, updated_at"
            )
            .order("updated_at", { ascending: false })
            .limit(100),
          supabase
            .from("announcements")
            .select("id, title, body, created_at, created_by")
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("stations")
            .select("id, name, location, station_code")
            .order("name", { ascending: true }),
          supabase.rpc("get_profile_directory"),
        ]);

      const requiredError = [logsResult.error, stationsResult.error].find(Boolean);

      if (requiredError) {
        throw requiredError;
      }

      if (announcementsResult.error) {
        console.warn(
          "Responder coordination announcements unavailable:",
          announcementsResult.error
        );
      }

      if (profilesResult.error) {
        console.warn(
          "Responder coordination profiles unavailable:",
          profilesResult.error
        );
      }

      setLogs(logsResult.data ?? []);
      setStations(stationsResult.data ?? []);
      setAnnouncements(
        announcementsResult.error ? [] : announcementsResult.data ?? []
      );
      setProfiles(profilesResult.error ? [] : profilesResult.data ?? []);
    } catch (error) {
      console.error("Responder coordination loading error:", error);
      setLoadError(
        "Unable to load response coordination. Check your connection and access permissions, then try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(loadCoordination, 0);
    return () => window.clearTimeout(timeout);
  }, [loadCoordination]);

  const stationMap = useMemo(
    () => new Map(stations.map((station) => [String(station.id), station])),
    [stations]
  );
  const profileMap = useMemo(
    () => new Map(profiles.map((item) => [String(item.id), item])),
    [profiles]
  );
  const myLogCount = logs.filter(
    (log) => String(log.responder_id) === String(responderId)
  ).length;
  const ongoingCount = logs.filter((log) => log.status === "ongoing").length;

  return (
    <DashboardLayout
      title="Response / Coordination"
      description="Follow recent field activity and officer communications."
    >
      <main className="page-content officer-page">
        <section className="stat-cards officer-stat-strip">
          <div className="stat-card warning-card">
            <div className="stat-label">ONGOING RESPONSES</div>
            <div className="stat-value orange">{ongoingCount}</div>
            <div className="stat-sub">VISIBLE TO YOUR ROLE</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">MY ACTIVITY</div>
            <div className="stat-value blue">{myLogCount}</div>
            <div className="stat-sub">RECENT LOGS</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">TEAM ACTIVITY</div>
            <div className="stat-value green">{logs.length}</div>
            <div className="stat-sub">RECENT VISIBLE ENTRIES</div>
          </div>
        </section>

        <section className="officer-coordinate-grid">
          <div className="section-card">
            <div className="section-title">
              <span>Recent Response Activity</span>
              <div className="officer-table-actions">
                <button
                  className="btn-cancel officer-icon-button"
                  type="button"
                  onClick={loadCoordination}
                  disabled={loading}
                >
                  <RefreshCw
                    size={16}
                    className={loading ? "officer-spin" : ""}
                  />
                  Refresh
                </button>
                <Link
                  className="btn-submit officer-icon-button"
                  to="/responder/response-logs"
                >
                  <ClipboardPlus size={16} />
                  Record my response
                </Link>
              </div>
            </div>

            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Responder</th>
                    <th>Station</th>
                    <th>Status</th>
                    <th>Field Update</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="officer-table-empty">
                        Loading response activity...
                      </td>
                    </tr>
                  ) : loadError ? (
                    <tr>
                      <td colSpan="5" className="officer-table-empty error">
                        {loadError}
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="officer-table-empty">
                        No response activity is available.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const isMine =
                        String(log.responder_id) === String(responderId);
                      const responder = profileMap.get(String(log.responder_id));
                      const station = stationMap.get(String(log.station_id));
                      const status = getResponseStatus(log.status);

                      return (
                        <tr key={log.id}>
                          <td>
                            {isMine ? "You" : responder?.name ?? "Responder"}{" "}
                            {isMine && <span className="badge badge-blue">Mine</span>}
                          </td>
                          <td>{station?.name ?? "General response"}</td>
                          <td>
                            <span className={`badge ${status.badge}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="officer-table-message">
                            {log.notes || "No field notes provided."}
                          </td>
                          <td>
                            {formatDateTime(log.updated_at ?? log.created_at)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="section-card">
            <div className="section-title">Officer Announcements</div>
            <div className="resident-list">
              {loading ? (
                <div className="dashboard-empty">Loading announcements...</div>
              ) : announcements.length === 0 ? (
                <div className="dashboard-empty">No announcements available.</div>
              ) : (
                announcements.map((announcement) => (
                  <article className="officer-list-item" key={announcement.id}>
                    <strong>{announcement.title}</strong>
                    <span>{announcement.body || "No message provided."}</span>
                    <small>{formatDateTime(announcement.created_at)}</small>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}
