import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, X } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { notifyAlertsUpdated } from "../../lib/alertEvents";
import { supabase } from "../../lib/supabase";
import {
  formatDateTime,
  getAlertBadge,
} from "./responderUtils";

export default function ResponderEmergencyAlerts() {
  const { profile } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    alert_id: "",
    station_id: "",
    status: "ongoing",
    notes: "",
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setFlash(null);

      const [alertsResult, stationsResult] = await Promise.all([
        supabase
          .from("alerts")
          .select(
            "id, station_id, type, title, message, is_resolved, created_at"
          )
          .eq("is_resolved", false)
          .in("type", ["critical", "warning"])
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("stations")
          .select("id, name, location, station_code")
          .order("name", { ascending: true }),
      ]);

      const firstError = [alertsResult.error, stationsResult.error].find(
        Boolean
      );

      if (firstError) {
        throw firstError;
      }

      setAlerts(alertsResult.data ?? []);
      setStations(stationsResult.data ?? []);
    } catch (error) {
      console.error("Responder emergency alerts error:", error);
      setFlash({
        type: "error",
        text: error.message || "Unable to load emergency alerts.",
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

    stations.forEach((station) => {
      map.set(String(station.id), station);
    });

    return map;
  }, [stations]);

  const filteredAlerts = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return alerts.filter((alert) => {
      const station = stationMap.get(String(alert.station_id));
      const searchableText = [
        alert.title,
        alert.message,
        alert.type,
        station?.name,
        station?.location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !keyword || searchableText.includes(keyword);
      const matchesType =
        typeFilter === "all" || alert.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [alerts, searchText, typeFilter, stationMap]);

  function openLogModal(alert = null) {
    setForm({
      alert_id: alert?.id ? String(alert.id) : "",
      station_id: alert?.station_id ? String(alert.station_id) : "",
      status: "ongoing",
      notes: "",
    });
    setModalOpen(true);
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

    const { error } = await supabase.from("response_logs").insert(payload);

    setSubmitting(false);

    if (error) {
      setFlash({
        type: "error",
        text: error.message || "Unable to create response log.",
      });
      return;
    }

    setModalOpen(false);
    setFlash({ type: "success", text: "Response log created." });
  }

  async function resolveAlert(alert) {
    setFlash(null);

    const { error } = await supabase
      .from("alerts")
      .update({ is_resolved: true, is_read: true })
      .eq("id", alert.id);

    if (error) {
      setFlash({
        type: "error",
        text: error.message || "Unable to resolve alert.",
      });
      return;
    }

    setAlerts((current) => current.filter((item) => item.id !== alert.id));
    notifyAlertsUpdated();
    setFlash({ type: "success", text: "Alert resolved." });
  }

  const hasFilters = searchText || typeFilter !== "all";

  return (
    <DashboardLayout
      title="Emergency Alerts"
      description="Critical and warning alerts requiring response."
    >
      {flash && (
        <div className={`flash ${flash.type}`}>{flash.text}</div>
      )}

      <main className="page-content officer-page">
        <section className="section-card">
          <div className="section-title">
            <span>
              Emergency Alerts{" "}
              <span className="badge badge-red">
                {alerts.length} ACTIVE
              </span>
            </span>

            <button
              className="btn-submit officer-title-action"
              type="button"
              onClick={() => openLogModal()}
            >
              <Plus size={16} />
              Log Response
            </button>
          </div>

          <div className="officer-toolbar">
            <label className="officer-search">
              <Search size={17} />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search title, station, or message..."
              />
            </label>

            <select
              className="form-input officer-filter-select"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="all">All Types</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
            </select>

            {hasFilters && (
              <button
                className="btn-cancel officer-icon-button"
                type="button"
                onClick={() => {
                  setSearchText("");
                  setTypeFilter("all");
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
                  <th>Time</th>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Station</th>
                  <th>Message</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="officer-table-empty">
                      Loading emergency alerts...
                    </td>
                  </tr>
                ) : filteredAlerts.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="officer-table-empty">
                      No active emergency alerts.
                    </td>
                  </tr>
                ) : (
                  filteredAlerts.map((alert) => {
                    const station = stationMap.get(String(alert.station_id));

                    return (
                      <tr key={alert.id}>
                        <td>{formatDateTime(alert.created_at)}</td>
                        <td>
                          <span className={`badge ${getAlertBadge(alert.type)}`}>
                            {alert.type}
                          </span>
                        </td>
                        <td>
                          <strong>{alert.title}</strong>
                        </td>
                        <td>{station?.name ?? "General alert"}</td>
                        <td className="officer-table-message">
                          {alert.message}
                        </td>
                        <td>
                          <div className="officer-table-actions">
                            <button
                              className="btn-submit officer-icon-button"
                              type="button"
                              onClick={() => openLogModal(alert)}
                            >
                              Respond
                            </button>
                            <button
                              className="btn-cancel officer-icon-button"
                              type="button"
                              onClick={() => resolveAlert(alert)}
                            >
                              Resolve
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

      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <span>Log Response</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setModalOpen(false)}
              >
                x
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <label className="form-label" htmlFor="response-alert">
                Alert
              </label>
              <select
                id="response-alert"
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

              <label className="form-label" htmlFor="response-station">
                Station
              </label>
              <select
                id="response-station"
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

              <label className="form-label" htmlFor="response-status">
                Response Status
              </label>
              <select
                id="response-status"
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

              <label className="form-label" htmlFor="response-notes">
                Notes
              </label>
              <textarea
                id="response-notes"
                className="form-input"
                rows="3"
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Describe the situation and actions taken..."
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
                  {submitting ? "Submitting..." : "Submit Log"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
