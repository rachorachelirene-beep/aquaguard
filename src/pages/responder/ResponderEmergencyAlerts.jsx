import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, RefreshCw, Search, X } from "lucide-react";
import { Link } from "react-router-dom";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { notifyAlertsUpdated } from "../../lib/alertEvents";
import { supabase } from "../../lib/supabase";
import { formatDateTime, getAlertBadge } from "./responderUtils";

function getAlertCardClass(type) {
  if (type === "critical") {
    return "red";
  }

  if (type === "warning") {
    return "orange-card";
  }

  return "blue-card";
}

export default function ResponderEmergencyAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [flash, setFlash] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("unresolved");

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setLoadError("");

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
      console.error("Responder alerts loading error:", error);
      setLoadError(
        "Unable to load alerts. Check your connection and access permissions, then try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(loadAlerts, 0);
    return () => window.clearTimeout(timeout);
  }, [loadAlerts]);

  useEffect(() => {
    if (!flash) {
      return undefined;
    }

    const timer = window.setTimeout(() => setFlash(null), 5000);
    return () => window.clearTimeout(timer);
  }, [flash]);

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
        station?.station_code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !keyword || searchableText.includes(keyword);
      const matchesType = typeFilter === "all" || alert.type === typeFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "unread" && !alert.is_read) ||
        (statusFilter === "unresolved" && !alert.is_resolved) ||
        (statusFilter === "resolved" && alert.is_resolved);

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [alerts, searchText, stationMap, statusFilter, typeFilter]);

  const activeCount = alerts.filter((alert) => !alert.is_resolved).length;
  const unreadCount = alerts.filter((alert) => !alert.is_read).length;
  const criticalCount = alerts.filter(
    (alert) => alert.type === "critical" && !alert.is_resolved
  ).length;
  const warningCount = alerts.filter(
    (alert) => alert.type === "warning" && !alert.is_resolved
  ).length;

  async function acknowledgeAlert(alert) {
    if (alert.is_read) {
      return;
    }

    setActionLoading(String(alert.id));
    setFlash(null);

    const { error } = await supabase
      .from("alerts")
      .update({ is_read: true })
      .eq("id", alert.id);

    setActionLoading("");

    if (error) {
      setFlash({
        type: "error",
        text:
          error.message ||
          "Unable to acknowledge the alert. Your responder RLS policy may be read-only.",
      });
      return;
    }

    setAlerts((current) =>
      current.map((item) =>
        item.id === alert.id ? { ...item, is_read: true } : item
      )
    );
    notifyAlertsUpdated();
    setFlash({ type: "success", text: "Alert acknowledged." });
  }

  function clearFilters() {
    setSearchText("");
    setTypeFilter("all");
    setStatusFilter("unresolved");
  }

  const hasFilters =
    searchText || typeFilter !== "all" || statusFilter !== "unresolved";

  return (
    <DashboardLayout
      title="Alerts"
      description="Review flood alerts, acknowledge receipt, and begin a field response."
    >
      {flash && <div className={`flash ${flash.type}`}>{flash.text}</div>}

      <main className="page-content officer-page">
        <section className="stat-cards officer-stat-strip officer-alert-stats">
          <div className="stat-card warning-card">
            <div className="stat-label">ACTIVE ALERTS</div>
            <div className="stat-value red">{activeCount}</div>
            <div className="stat-sub">UNRESOLVED</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">CRITICAL</div>
            <div className="stat-value red">{criticalCount}</div>
            <div className="stat-sub">NEEDS ATTENTION</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">WARNINGS</div>
            <div className="stat-value orange">{warningCount}</div>
            <div className="stat-sub">MONITOR CLOSELY</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">UNREAD</div>
            <div className="stat-value blue">{unreadCount}</div>
            <div className="stat-sub">NOT ACKNOWLEDGED</div>
          </div>
        </section>

        <section className="section-card">
          <div className="section-title">
            <span>Alert Records</span>
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

          <div className="officer-toolbar">
            <label className="officer-search">
              <Search size={17} />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search alert, station, or message..."
              />
            </label>

            <select
              className="form-input officer-filter-select"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              aria-label="Alert severity"
            >
              <option value="all">All Types</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
            </select>

            <select
              className="form-input officer-filter-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Alert status"
            >
              <option value="unresolved">Unresolved</option>
              <option value="all">All Alerts</option>
              <option value="unread">Unread</option>
              <option value="resolved">Resolved</option>
            </select>

            {hasFilters && (
              <button
                className="btn-cancel officer-icon-button"
                type="button"
                onClick={clearFilters}
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
            <div className="dashboard-empty">Loading alerts...</div>
          ) : loadError ? (
            <div className="dashboard-empty error">
              <strong>{loadError}</strong>
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
              No alerts match the selected filters.
            </div>
          ) : (
            <div className="resident-card-grid">
              {filteredAlerts.map((alert) => {
                const station = stationMap.get(String(alert.station_id));
                const isBusy = actionLoading === String(alert.id);
                const responseQuery = new URLSearchParams({
                  alert_id: String(alert.id),
                  ...(alert.station_id
                    ? { station_id: String(alert.station_id) }
                    : {}),
                });

                return (
                  <article
                    className={`alert-card ${getAlertCardClass(alert.type)}`}
                    key={alert.id}
                  >
                    <div className="alert-time">
                      {formatDateTime(alert.created_at)}
                    </div>
                    <div className="officer-alert-badges">
                      <span className={`badge ${getAlertBadge(alert.type)}`}>
                        {alert.type ?? "Alert"}
                      </span>
                      <span
                        className={`badge ${
                          alert.is_read ? "badge-gray" : "badge-blue"
                        }`}
                      >
                        {alert.is_read ? "Acknowledged" : "Unread"}
                      </span>
                      <span
                        className={`badge ${
                          alert.is_resolved ? "badge-green" : "badge-orange"
                        }`}
                      >
                        {alert.is_resolved ? "Resolved" : "Unresolved"}
                      </span>
                    </div>
                    <div className="alert-title">
                      {alert.title || `${alert.type ?? "Flood"} alert`}
                    </div>
                    <div className="alert-body">
                      {alert.message || "No alert message provided."}
                    </div>
                    <div className="officer-table-subtext">
                      {station?.name ?? "General alert"}
                      {station?.location ? ` · ${station.location}` : ""}
                    </div>
                    <div className="officer-table-actions officer-alert-actions">
                      <button
                        className="btn-cancel officer-icon-button"
                        type="button"
                        onClick={() => acknowledgeAlert(alert)}
                        disabled={alert.is_read || isBusy}
                      >
                        <Eye size={15} />
                        {alert.is_read ? "Acknowledged" : "Acknowledge"}
                      </button>
                      <Link
                        className="btn-submit officer-icon-button"
                        to={`/responder/response-logs?${responseQuery.toString()}`}
                      >
                        Record response
                      </Link>
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
