import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import {
  formatDateTime,
  getResponseStatus,
} from "./responderUtils";

export default function ResponderCoordinate() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [stations, setStations] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({
    id: "",
    station_id: "",
    status: "ongoing",
    notes: "",
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setFlash(null);

      const [logsResult, announcementsResult, stationsResult, profilesResult] =
        await Promise.all([
          supabase
            .from("response_logs")
            .select("id, alert_id, station_id, responder_id, status, notes, created_at, updated_at")
            .order("updated_at", { ascending: false })
            .limit(80),
          supabase
            .from("announcements")
            .select("id, title, body, created_at, created_by")
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("stations")
            .select("id, name, location, station_code")
            .order("name", { ascending: true }),
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

      setLogs(logsResult.data ?? []);
      setAnnouncements(announcementsResult.data ?? []);
      setStations(stationsResult.data ?? []);
      setProfiles(profilesResult.data ?? []);
    } catch (error) {
      console.error("Responder coordinate error:", error);
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
      await loadData();
    }

    boot();
  }, [loadData]);

  const stationMap = useMemo(() => {
    const map = new Map();

    stations.forEach((station) => map.set(String(station.id), station));
    return map;
  }, [stations]);

  const profileMap = useMemo(() => {
    const map = new Map();

    profiles.forEach((item) => map.set(String(item.id), item));
    return map;
  }, [profiles]);

  const myLogs = logs.filter(
    (log) => String(log.responder_id) === String(profile?.id)
  );

  function openCreateModal() {
    setForm({
      id: "",
      station_id: "",
      status: "ongoing",
      notes: "",
    });
    setModal("create");
  }

  function openUpdateModal(log) {
    setForm({
      id: String(log.id),
      station_id: log.station_id ? String(log.station_id) : "",
      status: log.status ?? "ongoing",
      notes: log.notes ?? "",
    });
    setModal("update");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFlash(null);

    const result =
      modal === "update"
        ? await supabase
            .from("response_logs")
            .update({
              status: form.status,
              notes: form.notes.trim(),
            })
            .eq("id", form.id)
        : await supabase.from("response_logs").insert({
            station_id: form.station_id || null,
            responder_id: profile?.id ?? null,
            status: form.status,
            notes: form.notes.trim(),
          });

    setSubmitting(false);

    if (result.error) {
      setFlash({
        type: "error",
        text: result.error.message || "Unable to save response log.",
      });
      return;
    }

    setModal(null);
    setFlash({ type: "success", text: "Response log saved." });
    await loadData();
  }

  return (
    <DashboardLayout
      title="Coordinate"
      description="Responder activity and officer communications."
    >
      {flash && (
        <div className={`flash ${flash.type}`}>{flash.text}</div>
      )}

      <main className="page-content officer-page">
        <section className="officer-coordinate-grid">
          <div className="section-card">
            <div className="section-title">
              <span>All Responder Activity</span>
              <button
                className="btn-cancel officer-icon-button"
                type="button"
                onClick={loadData}
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
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="officer-table-empty">
                        No activity yet.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const responder = profileMap.get(String(log.responder_id));
                      const station = stationMap.get(String(log.station_id));
                      const status = getResponseStatus(log.status);

                      return (
                        <tr key={log.id}>
                          <td>{responder?.name ?? "Responder"}</td>
                          <td>{station?.name ?? "General"}</td>
                          <td>
                            <span className={`badge ${status.badge}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="officer-table-message">
                            {log.notes || "--"}
                          </td>
                          <td>{formatDateTime(log.updated_at ?? log.created_at)}</td>
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
              {announcements.length === 0 ? (
                <div className="dashboard-empty">No announcements.</div>
              ) : (
                announcements.map((announcement) => (
                  <article
                    className="officer-list-item"
                    key={announcement.id}
                  >
                    <strong>{announcement.title}</strong>
                    <span>{announcement.body?.slice(0, 130)}</span>
                    <small>{formatDateTime(announcement.created_at)}</small>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="section-card">
          <div className="section-title">
            <span>Update My Response Status</span>
            <button
              className="btn-submit officer-title-action"
              type="button"
              onClick={openCreateModal}
            >
              <Plus size={16} />
              New Log
            </button>
          </div>

          <div className="resident-list">
            {myLogs.length === 0 ? (
              <div className="dashboard-empty">
                No active responses. Use New Log to start one.
              </div>
            ) : (
              myLogs.slice(0, 6).map((log) => {
                const station = stationMap.get(String(log.station_id));
                const status = getResponseStatus(log.status);

                return (
                  <article className="officer-list-item" key={log.id}>
                    <div className="officer-list-heading">
                      <strong>{station?.name ?? "General response"}</strong>
                      <span className={`badge ${status.badge}`}>
                        {status.label}
                      </span>
                    </div>
                    <span>{log.notes || "No notes"}</span>
                    <button
                      className="btn-submit officer-icon-button responder-inline-button"
                      type="button"
                      onClick={() => openUpdateModal(log)}
                    >
                      Update
                    </button>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </main>

      {modal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <span>{modal === "update" ? "Update Status" : "New Response Log"}</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setModal(null)}
              >
                x
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              {modal !== "update" && (
                <>
                  <label className="form-label" htmlFor="coordinate-station">
                    Station
                  </label>
                  <select
                    id="coordinate-station"
                    className="form-input"
                    value={form.station_id}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        station_id: event.target.value,
                      }))
                    }
                  >
                    <option value="">-- None --</option>
                    {stations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <label className="form-label" htmlFor="coordinate-status">
                Status
              </label>
              <select
                id="coordinate-status"
                className="form-input"
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
              >
                <option value="ongoing">On-going Response</option>
                <option value="rescued">Rescued</option>
                <option value="cleared">Cleared</option>
              </select>

              <label className="form-label" htmlFor="coordinate-notes">
                Notes
              </label>
              <textarea
                id="coordinate-notes"
                className="form-input"
                rows="3"
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />

              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-submit"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
