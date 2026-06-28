import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  CircleAlert,
  Eye,
  EyeOff,
  Info,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";

import "./Alerts.css";


function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


function getAlertDetails(type) {
  const normalizedType = String(
    type ?? "info"
  ).toLowerCase();

  if (normalizedType === "critical") {
    return {
      label: "Critical",
      icon: CircleAlert,
      className: "alert-type-critical",
    };
  }

  if (normalizedType === "warning") {
    return {
      label: "Warning",
      icon: TriangleAlert,
      className: "alert-type-warning",
    };
  }

  if (normalizedType === "system") {
    return {
      label: "System",
      icon: ShieldCheck,
      className: "alert-type-system",
    };
  }

  return {
    label: "Information",
    icon: Info,
    className: "alert-type-info",
  };
}


export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [stations, setStations] = useState([]);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [searchText, setSearchText] =
    useState("");

  const [typeFilter, setTypeFilter] =
    useState("all");

  const [statusFilter, setStatusFilter] =
    useState("active");

  const [stationFilter, setStationFilter] =
    useState("all");

  const [
    alertToDelete,
    setAlertToDelete,
  ] = useState(null);


  const stationMap = useMemo(() => {
    const map = new Map();

    stations.forEach((station) => {
      map.set(
        String(station.id),
        station
      );
    });

    return map;
  }, [stations]);


  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const [
        alertsResult,
        stationsResult,
      ] = await Promise.all([
        supabase
          .from("alerts")
          .select(
            [
              "id",
              "station_id",
              "type",
              "title",
              "message",
              "is_read",
              "is_resolved",
              "created_at",
            ].join(",")
          )
          .order("created_at", {
            ascending: false,
          })
          .limit(500),

        supabase
          .from("stations")
          .select(
            [
              "id",
              "name",
              "location",
              "station_code",
              "status",
            ].join(",")
          )
          .order("name", {
            ascending: true,
          }),
      ]);

      const firstError = [
        alertsResult.error,
        stationsResult.error,
      ].find(Boolean);

      if (firstError) {
        throw firstError;
      }

      setAlerts(
        alertsResult.data ?? []
      );

      setStations(
        stationsResult.data ?? []
      );
    } catch (error) {
      console.error(
        "Alerts loading error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to load alerts."
      );
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    loadData();
  }, [loadData]);


  useEffect(() => {
    const channel = supabase
      .channel("admin-alerts-page")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alerts",
        },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);


  useEffect(() => {
    if (
      !errorMessage &&
      !successMessage
    ) {
      return undefined;
    }

    const timer = window.setTimeout(
      () => {
        setErrorMessage("");
        setSuccessMessage("");
      },
      5000
    );

    return () =>
      window.clearTimeout(timer);
  }, [
    errorMessage,
    successMessage,
  ]);


  const statistics = useMemo(() => {
    const activeAlerts = alerts.filter(
      (alert) => !alert.is_resolved
    );

    return {
      total: alerts.length,

      active: activeAlerts.length,

      critical: activeAlerts.filter(
        (alert) =>
          alert.type === "critical"
      ).length,

      warning: activeAlerts.filter(
        (alert) =>
          alert.type === "warning"
      ).length,

      unread: alerts.filter(
        (alert) => !alert.is_read
      ).length,
    };
  }, [alerts]);


  const filteredAlerts = useMemo(() => {
    const keyword = searchText
      .trim()
      .toLowerCase();

    return alerts.filter((alert) => {
      const station = stationMap.get(
        String(alert.station_id)
      );

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
        !keyword ||
        searchableText.includes(keyword);

      const matchesType =
        typeFilter === "all" ||
        alert.type === typeFilter;

      const matchesStation =
        stationFilter === "all" ||
        String(alert.station_id) ===
          stationFilter;

      let matchesStatus = true;

      if (statusFilter === "active") {
        matchesStatus =
          !alert.is_resolved;
      }

      if (statusFilter === "resolved") {
        matchesStatus =
          alert.is_resolved;
      }

      if (statusFilter === "unread") {
        matchesStatus =
          !alert.is_read;
      }

      if (statusFilter === "read") {
        matchesStatus =
          alert.is_read;
      }

      return (
        matchesSearch &&
        matchesType &&
        matchesStation &&
        matchesStatus
      );
    });
  }, [
    alerts,
    searchText,
    typeFilter,
    statusFilter,
    stationFilter,
    stationMap,
  ]);


  async function updateAlert(
    alert,
    changes,
    successText
  ) {
    try {
      setActionLoading(
        String(alert.id)
      );

      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase
        .from("alerts")
        .update(changes)
        .eq("id", alert.id);

      if (error) {
        throw error;
      }

      setAlerts((currentAlerts) =>
        currentAlerts.map(
          (currentAlert) =>
            currentAlert.id ===
            alert.id
              ? {
                  ...currentAlert,
                  ...changes,
                }
              : currentAlert
        )
      );

      setSuccessMessage(successText);
    } catch (error) {
      console.error(
        "Alert update error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to update alert."
      );
    } finally {
      setActionLoading("");
    }
  }


  async function markAllAsRead() {
    const unreadIds = alerts
      .filter(
        (alert) => !alert.is_read
      )
      .map((alert) => alert.id);

    if (unreadIds.length === 0) {
      setSuccessMessage(
        "All alerts are already marked as read."
      );

      return;
    }

    try {
      setActionLoading("mark-all");
      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase
        .from("alerts")
        .update({
          is_read: true,
        })
        .in("id", unreadIds);

      if (error) {
        throw error;
      }

      setAlerts((currentAlerts) =>
        currentAlerts.map((alert) => ({
          ...alert,
          is_read: true,
        }))
      );

      setSuccessMessage(
        "All alerts were marked as read."
      );
    } catch (error) {
      console.error(
        "Mark-all-read error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to mark all alerts as read."
      );
    } finally {
      setActionLoading("");
    }
  }


  async function deleteAlert() {
    if (!alertToDelete) {
      return;
    }

    try {
      setActionLoading(
        `delete-${alertToDelete.id}`
      );

      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase
        .from("alerts")
        .delete()
        .eq(
          "id",
          alertToDelete.id
        );

      if (error) {
        throw error;
      }

      setAlerts((currentAlerts) =>
        currentAlerts.filter(
          (alert) =>
            alert.id !==
            alertToDelete.id
        )
      );

      setAlertToDelete(null);

      setSuccessMessage(
        "Alert deleted successfully."
      );
    } catch (error) {
      console.error(
        "Alert deletion error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to delete alert."
      );
    } finally {
      setActionLoading("");
    }
  }


  function clearFilters() {
    setSearchText("");
    setTypeFilter("all");
    setStatusFilter("active");
    setStationFilter("all");
  }


  const hasActiveFilters =
    searchText ||
    typeFilter !== "all" ||
    statusFilter !== "active" ||
    stationFilter !== "all";


  return (
    <DashboardLayout
      title="Alerts"
      description="Review and manage flood, weather and system alerts"
    >
      <main className="alerts-page">
        {errorMessage && (
          <div className="alerts-message alerts-message-error">
            <TriangleAlert size={18} />

            <span>{errorMessage}</span>

            <button
              type="button"
              onClick={() =>
                setErrorMessage("")
              }
              aria-label="Close error"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="alerts-message alerts-message-success">
            <Check size={18} />

            <span>{successMessage}</span>

            <button
              type="button"
              onClick={() =>
                setSuccessMessage("")
              }
              aria-label="Close message"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <section className="alerts-stat-grid">
          <article className="alerts-stat-card">
            <div className="alerts-stat-icon alerts-icon-blue">
              <Bell size={21} />
            </div>

            <div>
              <span>Total alerts</span>
              <strong>
                {statistics.total}
              </strong>
              <small>
                All recorded alerts
              </small>
            </div>
          </article>

          <article className="alerts-stat-card">
            <div className="alerts-stat-icon alerts-icon-orange">
              <BellRing size={21} />
            </div>

            <div>
              <span>Active alerts</span>
              <strong>
                {statistics.active}
              </strong>
              <small>
                Requires monitoring
              </small>
            </div>
          </article>

          <article className="alerts-stat-card">
            <div className="alerts-stat-icon alerts-icon-red">
              <CircleAlert size={21} />
            </div>

            <div>
              <span>Critical</span>
              <strong>
                {statistics.critical}
              </strong>
              <small>
                Immediate attention
              </small>
            </div>
          </article>

          <article className="alerts-stat-card">
            <div className="alerts-stat-icon alerts-icon-yellow">
              <TriangleAlert size={21} />
            </div>

            <div>
              <span>Warnings</span>
              <strong>
                {statistics.warning}
              </strong>
              <small>
                Possible danger
              </small>
            </div>
          </article>

          <article className="alerts-stat-card">
            <div className="alerts-stat-icon alerts-icon-purple">
              <EyeOff size={21} />
            </div>

            <div>
              <span>Unread</span>
              <strong>
                {statistics.unread}
              </strong>
              <small>
                Not yet reviewed
              </small>
            </div>
          </article>
        </section>

        <section className="alerts-toolbar">
          <div className="alerts-search">
            <Search size={17} />

            <input
              type="search"
              value={searchText}
              onChange={(event) =>
                setSearchText(
                  event.target.value
                )
              }
              placeholder="Search alerts..."
            />
          </div>

          <label className="alerts-filter">
            <span>Type</span>

            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(
                  event.target.value
                )
              }
            >
              <option value="all">
                All types
              </option>

              <option value="critical">
                Critical
              </option>

              <option value="warning">
                Warning
              </option>

              <option value="system">
                System
              </option>

              <option value="info">
                Information
              </option>
            </select>
          </label>

          <label className="alerts-filter">
            <span>Status</span>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value
                )
              }
            >
              <option value="all">
                All alerts
              </option>

              <option value="active">
                Active
              </option>

              <option value="resolved">
                Resolved
              </option>

              <option value="unread">
                Unread
              </option>

              <option value="read">
                Read
              </option>
            </select>
          </label>

          <label className="alerts-filter">
            <span>Station</span>

            <select
              value={stationFilter}
              onChange={(event) =>
                setStationFilter(
                  event.target.value
                )
              }
            >
              <option value="all">
                All stations
              </option>

              {stations.map(
                (station) => (
                  <option
                    key={station.id}
                    value={station.id}
                  >
                    {station.name}
                  </option>
                )
              )}
            </select>
          </label>

          <div className="alerts-toolbar-actions">
            {hasActiveFilters && (
              <button
                type="button"
                className="alerts-button-secondary"
                onClick={clearFilters}
              >
                <X size={16} />
                Clear
              </button>
            )}

            <button
              type="button"
              className="alerts-button-secondary"
              onClick={markAllAsRead}
              disabled={
                actionLoading ===
                "mark-all"
              }
            >
              <CheckCheck size={16} />

              Mark all read
            </button>

            <button
              type="button"
              className="alerts-button-primary"
              onClick={loadData}
              disabled={loading}
            >
              <RefreshCw
                size={16}
                className={
                  loading
                    ? "alerts-spin"
                    : ""
                }
              />

              Refresh
            </button>
          </div>
        </section>

        <section className="alerts-list-card">
          <header className="alerts-section-header">
            <div>
              <span className="alerts-eyebrow">
                Alert records
              </span>

              <h2>
                System notifications
              </h2>
            </div>

            <span className="alerts-record-count">
              {filteredAlerts.length} record
              {filteredAlerts.length === 1
                ? ""
                : "s"}
            </span>
          </header>

          <div className="alerts-list">
            {loading ? (
              <div className="alerts-empty">
                <RefreshCw
                  size={30}
                  className="alerts-spin"
                />

                <strong>
                  Loading alerts...
                </strong>
              </div>
            ) : filteredAlerts.length ===
              0 ? (
              <div className="alerts-empty">
                <ShieldCheck size={40} />

                <strong>
                  No alerts found
                </strong>

                <span>
                  There are no alerts
                  matching the selected
                  filters.
                </span>
              </div>
            ) : (
              filteredAlerts.map(
                (alert) => {
                  const details =
                    getAlertDetails(
                      alert.type
                    );

                  const AlertIcon =
                    details.icon;

                  const station =
                    stationMap.get(
                      String(
                        alert.station_id
                      )
                    );

                  const isBusy =
                    actionLoading ===
                    String(alert.id);

                  return (
                    <article
                      key={alert.id}
                      className={[
                        "alerts-item",
                        details.className,
                        alert.is_read
                          ? "alerts-item-read"
                          : "alerts-item-unread",
                        alert.is_resolved
                          ? "alerts-item-resolved"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className="alerts-item-icon">
                        <AlertIcon
                          size={23}
                        />
                      </div>

                      <div className="alerts-item-content">
                        <div className="alerts-item-heading">
                          <div>
                            <div className="alerts-item-labels">
                              <span className="alerts-type-badge">
                                {
                                  details.label
                                }
                              </span>

                              {!alert.is_read && (
                                <span className="alerts-unread-badge">
                                  Unread
                                </span>
                              )}

                              {alert.is_resolved && (
                                <span className="alerts-resolved-badge">
                                  Resolved
                                </span>
                              )}
                            </div>

                            <h3>
                              {alert.title ||
                                "Untitled alert"}
                            </h3>
                          </div>

                          <time>
                            {formatDateTime(
                              alert.created_at
                            )}
                          </time>
                        </div>

                        <p>
                          {alert.message ||
                            "No alert message available."}
                        </p>

                        <div className="alerts-item-station">
                          <strong>
                            {station?.name ??
                              "General system alert"}
                          </strong>

                          <span>
                            {station?.location ??
                              station?.station_code ??
                              "All monitoring stations"}
                          </span>
                        </div>
                      </div>

                      <div className="alerts-item-actions">
                        <button
                          type="button"
                          className="alerts-icon-button"
                          onClick={() =>
                            updateAlert(
                              alert,
                              {
                                is_read:
                                  !alert.is_read,
                              },
                              alert.is_read
                                ? "Alert marked as unread."
                                : "Alert marked as read."
                            )
                          }
                          disabled={isBusy}
                          title={
                            alert.is_read
                              ? "Mark as unread"
                              : "Mark as read"
                          }
                        >
                          {alert.is_read ? (
                            <EyeOff
                              size={17}
                            />
                          ) : (
                            <Eye
                              size={17}
                            />
                          )}
                        </button>

                        <button
                          type="button"
                          className="alerts-icon-button"
                          onClick={() =>
                            updateAlert(
                              alert,
                              {
                                is_resolved:
                                  !alert.is_resolved,
                                is_read: true,
                              },
                              alert.is_resolved
                                ? "Alert reopened."
                                : "Alert resolved."
                            )
                          }
                          disabled={isBusy}
                          title={
                            alert.is_resolved
                              ? "Reopen alert"
                              : "Resolve alert"
                          }
                        >
                          {alert.is_resolved ? (
                            <RotateCcw
                              size={17}
                            />
                          ) : (
                            <CheckCheck
                              size={17}
                            />
                          )}
                        </button>

                        <button
                          type="button"
                          className="alerts-icon-button alerts-delete-button"
                          onClick={() =>
                            setAlertToDelete(
                              alert
                            )
                          }
                          disabled={isBusy}
                          title="Delete alert"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </article>
                  );
                }
              )
            )}
          </div>
        </section>

        {alertToDelete && (
          <div
            className="alerts-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setAlertToDelete(null);
              }
            }}
          >
            <div
              className="alerts-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-alert-title"
            >
              <div className="alerts-modal-icon">
                <Trash2 size={24} />
              </div>

              <h3 id="delete-alert-title">
                Delete this alert?
              </h3>

              <p>
                The alert titled{" "}
                <strong>
                  “
                  {alertToDelete.title ||
                    "Untitled alert"}
                  ”
                </strong>{" "}
                will be permanently
                removed.
              </p>

              <div className="alerts-modal-actions">
                <button
                  type="button"
                  className="alerts-button-secondary"
                  onClick={() =>
                    setAlertToDelete(null)
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="alerts-confirm-delete"
                  onClick={deleteAlert}
                  disabled={
                    actionLoading ===
                    `delete-${alertToDelete.id}`
                  }
                >
                  <Trash2 size={16} />

                  {actionLoading ===
                  `delete-${alertToDelete.id}`
                    ? "Deleting..."
                    : "Delete alert"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}