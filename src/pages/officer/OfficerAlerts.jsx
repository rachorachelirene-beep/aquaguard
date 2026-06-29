import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, Eye, EyeOff, RefreshCw, Search, X } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";

function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getAlertClass(type) {
  if (type === "critical") {
    return "red";
  }

  if (type === "warning") {
    return "orange-card";
  }

  if (type === "system") {
    return "blue-card";
  }

  return "yellow-card";
}

export default function OfficerAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [flash, setFlash] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setFlash(null);

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

      const firstError = [alertsResult.error, stationsResult.error].find(
        Boolean
      );

      if (firstError) {
        throw firstError;
      }

      setAlerts(alertsResult.data ?? []);
      setStations(stationsResult.data ?? []);
    } catch (error) {
      console.error("Officer alerts loading error:", error);
      setFlash({
        type: "error",
        text: error.message || "Unable to load alerts.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function boot() {
      await loadAlerts();
    }

    boot();
  }, [loadAlerts]);

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

      const matchesSearch =
        !keyword || searchableText.includes(keyword);
      const matchesType =
        typeFilter === "all" || alert.type === typeFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && !alert.is_resolved) ||
        (statusFilter === "resolved" && alert.is_resolved) ||
        (statusFilter === "unread" && !alert.is_read);

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [alerts, searchText, typeFilter, statusFilter, stationMap]);

  const activeCount = alerts.filter((alert) => !alert.is_resolved).length;
  const unreadCount = alerts.filter((alert) => !alert.is_read).length;
  const criticalCount = alerts.filter(
    (alert) => !alert.is_resolved && alert.type === "critical"
  ).length;
  const warningCount = alerts.filter(
    (alert) => !alert.is_resolved && alert.type === "warning"
  ).length;

  async function updateAlert(alert, changes, successText) {
    setActionLoading(String(alert.id));
    setFlash(null);

    const { error } = await supabase
      .from("alerts")
      .update(changes)
      .eq("id", alert.id);

    setActionLoading("");

    if (error) {
      setFlash({
        type: "error",
        text: error.message || "Unable to update alert.",
      });
      return;
    }

    setAlerts((current) =>
      current.map((item) =>
        item.id === alert.id ? { ...item, ...changes } : item
      )
    );
    setFlash({ type: "success", text: successText });
  }

  function clearFilters() {
    setSearchText("");
    setTypeFilter("all");
    setStatusFilter("active");
  }

  const hasFilters =
    searchText || typeFilter !== "all" || statusFilter !== "active";

  return (
    <DashboardLayout
      title="Alerts"
      description="Review active flood and system alerts for the barangay."
    >
      {flash && (
        <div className={`flash ${flash.type}`}>{flash.text}</div>
      )}

      <main className="page-content officer-page">
        <section className="stat-cards officer-stat-strip officer-alert-stats">
          <div className="stat-card warning-card">
            <div className="stat-header">
              <span className="stat-label">ACTIVE ALERTS</span>
              <span className="stat-icon red">!</span>
            </div>
            <div className="stat-value red">{activeCount}</div>
            <div className="stat-sub">UNRESOLVED</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">CRITICAL</span>
              <span className="stat-icon red">!</span>
            </div>
            <div className="stat-value red">{criticalCount}</div>
            <div className="stat-sub">NEEDS ATTENTION</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">WARNINGS</span>
              <span className="stat-icon orange">!</span>
            </div>
            <div className="stat-value orange">{warningCount}</div>
            <div className="stat-sub">MONITOR CLOSELY</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">UNREAD</span>
              <span className="stat-icon blue">#</span>
            </div>
            <div className="stat-value blue">{unreadCount}</div>
            <div className="stat-sub">NEW ITEMS</div>
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
                placeholder="Search alerts..."
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
              <option value="system">System</option>
              <option value="info">Info</option>
            </select>

            <select
              className="form-input officer-filter-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="active">Active</option>
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
              {filteredAlerts.length} record
              {filteredAlerts.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="resident-card-grid">
            {loading ? (
              <div className="dashboard-empty">Loading alerts...</div>
            ) : filteredAlerts.length === 0 ? (
              <div className="dashboard-empty">No alerts found.</div>
            ) : (
              filteredAlerts.map((alert) => {
                const station = stationMap.get(String(alert.station_id));
                const isBusy = actionLoading === String(alert.id);

                return (
                  <article
                    className={`alert-card ${getAlertClass(alert.type)}`}
                    key={alert.id}
                  >
                    <div className="alert-time">
                      {formatDateTime(alert.created_at)}
                    </div>
                    <div className="alert-title">{alert.title}</div>
                    <div className="alert-body">{alert.message}</div>
                    <div className="officer-table-subtext">
                      {station?.name ?? "General alert"}
                    </div>
                    <div className="officer-table-actions officer-alert-actions">
                      <button
                        className="btn-cancel officer-icon-button"
                        type="button"
                        onClick={() =>
                          updateAlert(
                            alert,
                            { is_read: !alert.is_read },
                            alert.is_read
                              ? "Alert marked as unread."
                              : "Alert marked as read."
                          )
                        }
                        disabled={isBusy}
                      >
                        {alert.is_read ? (
                          <EyeOff size={15} />
                        ) : (
                          <Eye size={15} />
                        )}
                        {alert.is_read ? "Unread" : "Read"}
                      </button>

                      <button
                        className="btn-submit officer-icon-button"
                        type="button"
                        onClick={() =>
                          updateAlert(
                            alert,
                            {
                              is_resolved: !alert.is_resolved,
                              is_read: true,
                            },
                            alert.is_resolved
                              ? "Alert reopened."
                              : "Alert resolved."
                          )
                        }
                        disabled={isBusy}
                      >
                        <CheckCheck size={15} />
                        {alert.is_resolved ? "Reopen" : "Resolve"}
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}
