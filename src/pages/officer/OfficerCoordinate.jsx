import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

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

function getStatusBadge(status) {
  if (status === "ongoing") {
    return "badge-orange";
  }

  if (status === "rescued") {
    return "badge-blue";
  }

  if (status === "cleared") {
    return "badge-green";
  }

  return "badge-gray";
}

function formatStatus(status) {
  if (!status) {
    return "Unknown";
  }

  if (status === "ongoing") {
    return "On-going";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function OfficerCoordinate() {
  const { profile } = useAuth();
  const [responseLogs, setResponseLogs] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [stations, setStations] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    body: "",
  });

  const loadCoordinateData = useCallback(async () => {
    try {
      setLoading(true);
      setFlash(null);

      const [
        logsResult,
        announcementsResult,
        stationsResult,
        profilesResult,
      ] = await Promise.all([
        supabase
          .from("response_logs")
          .select(
            "id, alert_id, station_id, responder_id, status, notes, updated_at, created_at"
          )
          .order("updated_at", { ascending: false })
          .limit(50),
        supabase
          .from("announcements")
          .select("id, title, body, created_at, created_by")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("stations")
          .select("id, name, location, station_code"),
        supabase
          .from("profiles")
          .select("id, name, role"),
      ]);

      const firstError = [
        logsResult.error,
        announcementsResult.error,
        stationsResult.error,
        profilesResult.error,
      ].find(Boolean);

      if (firstError) {
        throw firstError;
      }

      setResponseLogs(logsResult.data ?? []);
      setAnnouncements(announcementsResult.data ?? []);
      setStations(stationsResult.data ?? []);
      setProfiles(profilesResult.data ?? []);
    } catch (error) {
      console.error("Coordinate loading error:", error);
      setFlash({
        type: "error",
        text: error.message || "Unable to load coordination data.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function boot() {
      await loadCoordinateData();
    }

    boot();
  }, [loadCoordinateData]);

  useEffect(() => {
    if (!flash) {
      return undefined;
    }

    const timer = window.setTimeout(() => setFlash(null), 5000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const stationMap = useMemo(() => {
    const map = new Map();

    stations.forEach((station) => {
      map.set(String(station.id), station);
    });

    return map;
  }, [stations]);

  const profileMap = useMemo(() => {
    const map = new Map();

    profiles.forEach((item) => {
      map.set(String(item.id), item);
    });

    return map;
  }, [profiles]);

  async function handleAnnouncementSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFlash(null);

    const { error } = await supabase.from("announcements").insert({
      title: form.title.trim(),
      body: form.body.trim(),
      created_by: profile?.id ?? null,
    });

    setSubmitting(false);

    if (error) {
      setFlash({
        type: "error",
        text: error.message || "Unable to publish announcement.",
      });
      return;
    }

    setForm({ title: "", body: "" });
    setModalOpen(false);
    setFlash({ type: "success", text: "Announcement published." });
    await loadCoordinateData();
  }

  return (
    <DashboardLayout
      title="Coordinate with Responders"
      description="View responder activity and share community updates."
    >
      {flash && (
        <div className={`flash ${flash.type}`}>{flash.text}</div>
      )}

      <main className="page-content officer-page">
        <section className="officer-coordinate-grid">
          <div className="section-card">
            <div className="section-title">
              <span>Responder Activity</span>

              <button
                className="btn-cancel officer-icon-button"
                type="button"
                onClick={loadCoordinateData}
                disabled={loading}
              >
                <RefreshCw
                  size={16}
                  className={loading ? "officer-spin" : ""}
                />
                Refresh
              </button>
            </div>

            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Responder</th>
                    <th>Station</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Updated</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="officer-table-empty">
                        Loading responder activity...
                      </td>
                    </tr>
                  ) : responseLogs.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="officer-table-empty">
                        No response activity yet.
                      </td>
                    </tr>
                  ) : (
                    responseLogs.map((log) => {
                      const responder = profileMap.get(
                        String(log.responder_id)
                      );
                      const station = stationMap.get(String(log.station_id));

                      return (
                        <tr key={log.id}>
                          <td>
                            <strong>
                              {responder?.name ?? "Responder"}
                            </strong>
                          </td>
                          <td>
                            {station?.name ?? "General response"}
                          </td>
                          <td>
                            <span
                              className={`badge ${getStatusBadge(
                                log.status
                              )}`}
                            >
                              {formatStatus(log.status)}
                            </span>
                          </td>
                          <td className="officer-table-message">
                            {log.notes || "--"}
                          </td>
                          <td>{formatDateTime(log.updated_at)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="section-card">
            <div className="section-title">
              <span>Recent Announcements</span>

              <button
                className="btn-submit officer-title-action"
                type="button"
                onClick={() => setModalOpen(true)}
              >
                <Plus size={16} />
                New
              </button>
            </div>

            {announcements.length === 0 ? (
              <div className="dashboard-empty">
                No announcements yet.
              </div>
            ) : (
              announcements.map((announcement) => (
                <div
                  className="officer-list-item"
                  key={announcement.id}
                >
                  <strong>{announcement.title}</strong>
                  <span>{announcement.body?.slice(0, 120)}</span>
                  <small>{formatDateTime(announcement.created_at)}</small>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <span>New Announcement</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setModalOpen(false)}
              >
                x
              </button>
            </div>

            <form onSubmit={handleAnnouncementSubmit}>
              <label className="form-label" htmlFor="coordinate-title">
                Title
              </label>
              <input
                id="coordinate-title"
                className="form-input"
                type="text"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                required
              />

              <label className="form-label" htmlFor="coordinate-body">
                Message
              </label>
              <textarea
                id="coordinate-body"
                className="form-input"
                rows="4"
                value={form.body}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
                required
              />

              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  type="button"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn-submit"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "Publishing..." : "Publish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
