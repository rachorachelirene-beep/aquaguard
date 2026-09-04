import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, RefreshCw, Search, X } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { notifyAlertsUpdated } from "../../lib/alertEvents";
import { supabase } from "../../lib/supabase";
import {
  formatDateTime,
  getAlertCardClass,
  getSeverityBadge,
} from "./residentUtils";

export default function ResidentAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState("active");

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const [alertsResult, stationsResult] = await Promise.all([
        supabase
          .from("alerts")
          .select(
            "id, station_id, type, title, message, is_read, is_resolved, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("stations")
          .select("id, name, location, station_code")
          .order("name", { ascending: true }),
      ]);

      const firstError = [alertsResult.error, stationsResult.error].find(Boolean);

      if (firstError) {
        throw firstError;
      }

      setAlerts(alertsResult.data ?? []);
      setStations(stationsResult.data ?? []);
    } catch (error) {
      console.error("Resident alerts loading error:", error);
      setErrorMessage(
        "Unable to load flood alerts. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(loadAlerts, 0);
    return () => window.clearTimeout(timeout);
  }, [loadAlerts]);

  const stationMap = useMemo(
    () => new Map(stations.map((station) => [String(station.id), station])),
    [stations]
  );

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
      const matchesSearch = !keyword || searchableText.includes(keyword);
      const matchesFilter =
        filter === "all" ||
        (filter === "active" && !alert.is_resolved) ||
        alert.type === filter;

      return matchesSearch && matchesFilter;
    });
  }, [alerts, filter, searchText, stationMap]);

  const hasFilters = searchText || filter !== "active";
  const unreadCount = alerts.filter((alert) => !alert.is_read).length;

  async function markAllAsRead() {
    const unreadIds = alerts
      .filter((alert) => !alert.is_read)
      .map((alert) => alert.id);

    if (unreadIds.length === 0) {
      setSuccessMessage("All alerts are already marked as read.");
      return;
    }

    try {
      setActionLoading("mark-all");
      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase
        .from("alerts")
        .update({ is_read: true })
        .in("id", unreadIds);

      if (error) {
        throw error;
      }

      setAlerts((current) =>
        current.map((alert) => ({ ...alert, is_read: true }))
      );

      notifyAlertsUpdated();
      setSuccessMessage("All alerts marked as read.");

      window.setTimeout(() => setSuccessMessage(""), 4000);
    } catch (error) {
      console.error("Mark-all-read error:", error);
      setErrorMessage(error.message || "Unable to mark all alerts as read.");
    } finally {
      setActionLoading("");
    }
  }

  return (
    <DashboardLayout
      title="Flood Alerts"
      description="Official warning and critical flood updates for residents."
    >
      <main className="page-content officer-page">
        {successMessage && (
          <div className="flash success">{successMessage}</div>
        )}
        {errorMessage && (
          <div className="flash error">{errorMessage}</div>
        )}
        <section className="section-card">
          <div className="section-title">
            <span>Flood Alerts</span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {unreadCount > 0 && (
                <button
                  className="btn-submit officer-icon-button"
                  type="button"
                  onClick={markAllAsRead}
                  disabled={actionLoading === "mark-all"}
                  title={`Mark all ${unreadCount} unread alerts as read`}
                >
                  <CheckCheck size={16} />
                  Mark All Read
                  {unreadCount > 0 && (
                    <span
                      style={{
                        background: "#dc2626",
                        color: "#fff",
                        borderRadius: "9px",
                        padding: "1px 6px",
                        fontSize: "11px",
                        fontWeight: 700,
                        marginLeft: "2px",
                      }}
                    >
                      {unreadCount}
                    </span>
                  )}
                </button>
              )}
              <button
                className="btn-cancel officer-icon-button"
                type="button"
                onClick={loadAlerts}
                disabled={loading}
              >
                <RefreshCw
                  size={16}
                  className={loading ? "officer-spin" : ""}
                />
                Refresh
              </button>
            </div>
          </div>

          <div className="officer-toolbar resident-toolbar">
            <label className="officer-search">
              <Search size={17} />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search alerts or locations..."
              />
            </label>

            <select
              className="form-input officer-filter-select"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter flood alerts"
            >
              <option value="active">Active</option>
              <option value="all">All</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>

            {hasFilters && (
              <button
                className="btn-cancel officer-icon-button"
                type="button"
                onClick={() => {
                  setSearchText("");
                  setFilter("active");
                }}
              >
                <X size={16} />
                Clear
              </button>
            )}

            <span className="officer-count">
              {filteredAlerts.length} alert
              {filteredAlerts.length === 1 ? "" : "s"}
            </span>
          </div>

          {loading ? (
            <div className="dashboard-empty">Loading flood alerts...</div>
          ) : errorMessage ? (
            <div className="dashboard-empty error">
              <strong>{errorMessage}</strong>
              <button
                className="btn-submit officer-icon-button"
                type="button"
                onClick={loadAlerts}
              >
                Try again
              </button>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="dashboard-empty">
              No alerts match the selected filter.
            </div>
          ) : (
            <div className="resident-card-grid">
              {filteredAlerts.map((alert) => {
                const station = stationMap.get(String(alert.station_id));

                return (
                  <article
                    className={`alert-card ${getAlertCardClass(alert.type)}`}
                    key={alert.id}
                  >
                    <div className="officer-alert-badges">
                      <span className={`badge ${getSeverityBadge(alert.type)}`}>
                        {alert.type ?? "Alert"}
                      </span>
                      <span
                        className={`badge ${
                          alert.is_resolved ? "badge-gray" : "badge-orange"
                        }`}
                      >
                        {alert.is_resolved ? "Resolved" : "Active"}
                      </span>
                    </div>
                    <div className="alert-title">
                      {alert.title || "Flood alert"}
                    </div>
                    <div className="alert-body">
                      {alert.message || "No additional details were provided."}
                    </div>
                    <div className="officer-table-subtext">
                      {station?.name ?? "Community alert"}
                      {station?.location ? ` | ${station.location}` : ""}
                    </div>
                    <div className="alert-time">
                      {formatDateTime(alert.created_at)}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </DashboardLayout>
  );
}
