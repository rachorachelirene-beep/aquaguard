import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import useEscapeKey from "../../hooks/useEscapeKey";
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
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [responseModalMode, setResponseModalMode] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    body: "",
  });
  const [responseForm, setResponseForm] = useState({
    id: "",
    station_id: "",
    status: "ongoing",
    notes: "",
  });

  useEscapeKey(() => {
    setResponseModalMode(null);
    setAnnouncementModalOpen(false);
  }, Boolean(responseModalMode || announcementModalOpen));

  const loadCoordinateData = useCallback(async () => {
    try {
      setLoading(true);

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
        supabase.rpc("get_profile_directory"),
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
        text: "Unable to load coordination activity. Check your connection and try again.",
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

    if (form.title.trim().length < 3 || form.body.trim().length < 10) {
      setFlash({
        type: "error",
        text: "Enter an announcement title of at least 3 characters and a message of at least 10 characters.",
      });
      return;
    }

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
    setAnnouncementModalOpen(false);
    setFlash({ type: "success", text: "Announcement published." });
    await loadCoordinateData();
  }

  function openResponseModal(log = null) {
    setResponseForm({
      id: log?.id ? String(log.id) : "",
      station_id: log?.station_id ? String(log.station_id) : "",
      status: log?.status ?? "ongoing",
      notes: log?.notes ?? "",
    });
    setResponseModalMode(log ? "edit" : "create");
  }

  async function handleResponseSubmit(event) {
    event.preventDefault();

    const notes = responseForm.notes.trim();

    if (notes.length < 5) {
      setFlash({
        type: "error",
        text: "Describe the coordination or response action in at least 5 characters.",
      });
      return;
    }

    setSubmitting(true);
    setFlash(null);

    const changes = {
      station_id: responseForm.station_id || null,
      status: responseForm.status,
      notes,
    };
    const result =
      responseModalMode === "edit"
        ? await supabase
            .from("response_logs")
            .update(changes)
            .eq("id", responseForm.id)
            .eq("responder_id", profile?.id)
        : await supabase.from("response_logs").insert({
            ...changes,
            responder_id: profile?.id ?? null,
          });

    setSubmitting(false);

    if (result.error) {
      setFlash({
        type: "error",
        text: result.error.message || "Unable to save response activity.",
      });
      return;
    }

    setResponseModalMode(null);
    setFlash({ type: "success", text: "Response activity saved." });
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
              <div className="officer-table-actions">
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
                <button
                  className="btn-submit officer-icon-button"
                  type="button"
                  onClick={() => openResponseModal()}
                >
                  <Plus size={16} />
                  Record action
                </button>
              </div>
            </div>

            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Recorded By</th>
                    <th>Station</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="officer-table-empty">
                        Loading responder activity...
                      </td>
                    </tr>
                  ) : responseLogs.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="officer-table-empty">
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
                              {responder?.name ?? "Response team member"}
                            </strong>
                            <small className="officer-table-subtext">
                              {responder?.role === "barangay_officer"
                                ? "Barangay Officer"
                                : responder?.role === "disaster_responder"
                                  ? "Disaster Responder"
                                  : "Response activity"}
                            </small>
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
                          <td>
                            {String(log.responder_id) ===
                            String(profile?.id) ? (
                              <button
                                className="btn-cancel officer-icon-button"
                                type="button"
                                onClick={() => openResponseModal(log)}
                              >
                                <Pencil size={15} />
                                Update
                              </button>
                            ) : (
                              <span className="officer-table-subtext">
                                Read only
                              </span>
                            )}
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
            <div className="section-title">
              <span>Recent Announcements</span>

              <button
                className="btn-submit officer-title-action"
                type="button"
                onClick={() => setAnnouncementModalOpen(true)}
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

      {responseModalMode && (
        <div className="modal-overlay">
          <div
            className="modal-box"
            role="dialog"
            aria-modal="true"
            aria-label="Record response activity"
          >
            <div className="modal-header">
              <span>
                {responseModalMode === "edit"
                  ? "Update Response Activity"
                  : "Record Response Activity"}
              </span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setResponseModalMode(null)}
                aria-label="Close response activity dialog"
              >
                x
              </button>
            </div>

            <form onSubmit={handleResponseSubmit}>
              <label className="form-label" htmlFor="response-station">
                Monitoring Station
              </label>
              <select
                id="response-station"
                className="form-input"
                value={responseForm.station_id}
                onChange={(event) =>
                  setResponseForm((current) => ({
                    ...current,
                    station_id: event.target.value,
                  }))
                }
              >
                <option value="">General barangay response</option>
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>

              <label className="form-label" htmlFor="response-status">
                Response Status
              </label>
              <select
                id="response-status"
                className="form-input"
                value={responseForm.status}
                onChange={(event) =>
                  setResponseForm((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
              >
                <option value="ongoing">On-going</option>
                <option value="rescued">Rescued</option>
                <option value="cleared">Cleared</option>
              </select>

              <label className="form-label" htmlFor="response-notes">
                Action Notes
              </label>
              <textarea
                id="response-notes"
                className="form-input"
                rows="5"
                value={responseForm.notes}
                onChange={(event) =>
                  setResponseForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                minLength="5"
                maxLength="2000"
                placeholder="Describe the coordination, assistance, or response action taken."
                required
              />

              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  type="button"
                  onClick={() => setResponseModalMode(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-submit"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Save activity"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {announcementModalOpen && (
        <div className="modal-overlay">
          <div
            className="modal-box"
            role="dialog"
            aria-modal="true"
            aria-label="New announcement"
          >
            <div className="modal-header">
              <span>New Announcement</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setAnnouncementModalOpen(false)}
                aria-label="Close announcement dialog"
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
                minLength="3"
                maxLength="160"
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
                minLength="10"
                maxLength="2000"
              />

              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  type="button"
                  onClick={() => setAnnouncementModalOpen(false)}
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
