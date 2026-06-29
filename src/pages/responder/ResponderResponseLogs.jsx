import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, Trash2, X } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import {
  formatDateTime,
  getResponseStatus,
} from "./responderUtils";

export default function ResponderResponseLogs() {
  const { profile } = useAuth();
  const responderId = profile?.id ?? "";
  const [logs, setLogs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [logToDelete, setLogToDelete] = useState(null);
  const [form, setForm] = useState({
    id: "",
    alert_id: "",
    station_id: "",
    status: "ongoing",
    notes: "",
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setFlash(null);

      const [logsResult, alertsResult, stationsResult] = await Promise.all([
        supabase
          .from("response_logs")
          .select(
            "id, alert_id, station_id, responder_id, status, notes, created_at, updated_at"
          )
          .eq("responder_id", responderId)
          .order("updated_at", { ascending: false })
          .limit(300),
        supabase
          .from("alerts")
          .select("id, station_id, type, title, message, is_resolved, created_at")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("stations")
          .select("id, name, location, station_code")
          .order("name", { ascending: true }),
      ]);

      const firstError = [logsResult.error, alertsResult.error, stationsResult.error].find(
        Boolean
      );

      if (firstError) {
        throw firstError;
      }

      setLogs(logsResult.data ?? []);
      setAlerts(alertsResult.data ?? []);
      setStations(stationsResult.data ?? []);
    } catch (error) {
      console.error("Responder response logs error:", error);
      setFlash({
        type: "error",
        text: error.message || "Unable to load response logs.",
      });
    } finally {
      setLoading(false);
    }
  }, [responderId]);

  useEffect(() => {
    async function boot() {
      await loadData();
    }

    boot();
  }, [loadData]);

  const stationMap = useMemo(() => {
    const map = new Map();

    stations.forEach((station) => {
      map.set(String(station.id), station);
    });

    return map;
  }, [stations]);

  const alertMap = useMemo(() => {
    const map = new Map();

    alerts.forEach((alert) => {
      map.set(String(alert.id), alert);
    });

    return map;
  }, [alerts]);

  const filteredLogs = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return logs.filter((log) => {
      const alert = alertMap.get(String(log.alert_id));
      const station = stationMap.get(String(log.station_id));
      const searchableText = [
        alert?.title,
        station?.name,
        station?.location,
        log.status,
        log.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !keyword || searchableText.includes(keyword);
      const matchesStatus =
        statusFilter === "all" || log.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [logs, searchText, statusFilter, alertMap, stationMap]);

  function openCreateModal() {
    setForm({
      id: "",
      alert_id: "",
      station_id: "",
      status: "ongoing",
      notes: "",
    });
    setModal("create");
  }

  function openUpdateModal(log) {
    setForm({
      id: String(log.id),
      alert_id: log.alert_id ? String(log.alert_id) : "",
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

    const payload = {
      alert_id: form.alert_id || null,
      station_id: form.station_id || null,
      responder_id: profile?.id ?? null,
      status: form.status,
      notes: form.notes.trim(),
    };

    const result =
      modal === "update"
        ? await supabase
            .from("response_logs")
            .update({
              status: payload.status,
              notes: payload.notes,
            })
            .eq("id", form.id)
        : await supabase.from("response_logs").insert(payload);

    setSubmitting(false);

    if (result.error) {
      setFlash({
        type: "error",
        text: result.error.message || "Unable to save response log.",
      });
      return;
    }

    setModal(null);
    setFlash({
      type: "success",
      text:
        modal === "update"
          ? "Response status updated."
          : "Response log created.",
    });
    await loadData();
  }

  async function deleteLog() {
    if (!logToDelete) {
      return;
    }

    setSubmitting(true);
    setFlash(null);

    const { error } = await supabase
      .from("response_logs")
      .delete()
      .eq("id", logToDelete.id);

    setSubmitting(false);

    if (error) {
      setFlash({
        type: "error",
        text: error.message || "Unable to delete response log.",
      });
      return;
    }

    setLogs((current) => current.filter((log) => log.id !== logToDelete.id));
    setLogToDelete(null);
    setFlash({ type: "success", text: "Response log deleted." });
  }

  const hasFilters = searchText || statusFilter !== "all";

  return (
    <DashboardLayout
      title="Response Logs"
      description="Track and update your emergency response activity."
    >
      {flash && (
        <div className={`flash ${flash.type}`}>{flash.text}</div>
      )}

      <main className="page-content officer-page">
        <section className="section-card">
          <div className="section-title">
            <span>My Response Logs</span>

            <button
              className="btn-submit officer-title-action"
              type="button"
              onClick={openCreateModal}
            >
              <Plus size={16} />
              New Log
            </button>
          </div>

          <div className="officer-toolbar">
            <label className="officer-search">
              <Search size={17} />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search response logs..."
              />
            </label>

            <select
              className="form-input officer-filter-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All Status</option>
              <option value="ongoing">On-going</option>
              <option value="rescued">Rescued</option>
              <option value="cleared">Cleared</option>
            </select>

            {hasFilters && (
              <button
                className="btn-cancel officer-icon-button"
                type="button"
                onClick={() => {
                  setSearchText("");
                  setStatusFilter("all");
                }}
              >
                <X size={16} />
                Clear
              </button>
            )}

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
                  <th>Date</th>
                  <th>Alert</th>
                  <th>Station</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="officer-table-empty">
                      Loading response logs...
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="officer-table-empty">
                      No response logs found.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const alert = alertMap.get(String(log.alert_id));
                    const station = stationMap.get(String(log.station_id));
                    const status = getResponseStatus(log.status);

                    return (
                      <tr key={log.id}>
                        <td>{formatDateTime(log.updated_at ?? log.created_at)}</td>
                        <td>{alert?.title ?? "General response"}</td>
                        <td>{station?.name ?? "No station"}</td>
                        <td>
                          <span className={`badge ${status.badge}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="officer-table-message">
                          {log.notes || "--"}
                        </td>
                        <td>
                          <div className="officer-table-actions">
                            <button
                              className="btn-submit officer-icon-button"
                              type="button"
                              onClick={() => openUpdateModal(log)}
                            >
                              Update
                            </button>
                            <button
                              className="btn-danger officer-icon-button"
                              type="button"
                              onClick={() => setLogToDelete(log)}
                            >
                              <Trash2 size={15} />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
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
                  <label className="form-label" htmlFor="log-alert">
                    Alert
                  </label>
                  <select
                    id="log-alert"
                    className="form-input"
                    value={form.alert_id}
                    onChange={(event) =>
                      setForm((current) => {
                        const selectedAlert = alerts.find(
                          (alert) => String(alert.id) === event.target.value
                        );

                        return {
                          ...current,
                          alert_id: event.target.value,
                          station_id: selectedAlert?.station_id
                            ? String(selectedAlert.station_id)
                            : current.station_id,
                        };
                      })
                    }
                  >
                    <option value="">-- General response --</option>
                    {alerts.map((alert) => (
                      <option key={alert.id} value={alert.id}>
                        {alert.title}
                      </option>
                    ))}
                  </select>

                  <label className="form-label" htmlFor="log-station">
                    Station
                  </label>
                  <select
                    id="log-station"
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

              <label className="form-label" htmlFor="log-status">
                Status
              </label>
              <select
                id="log-status"
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

              <label className="form-label" htmlFor="log-notes">
                Notes
              </label>
              <textarea
                id="log-notes"
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

      {logToDelete && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <span>Delete Response Log</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setLogToDelete(null)}
              >
                x
              </button>
            </div>
            <div className="officer-confirm-body">
              <p>Delete this response log?</p>
              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  type="button"
                  onClick={() => setLogToDelete(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-danger"
                  type="button"
                  onClick={deleteLog}
                  disabled={submitting}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
