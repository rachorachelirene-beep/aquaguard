import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";

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

export default function ResidentAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const [alertsResult, stationsResult] = await Promise.all([
        supabase
          .from("alerts")
          .select(
            "id, station_id, type, title, message, is_resolved, created_at"
          )
          .eq("is_resolved", false)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("stations")
          .select("id, name, location, station_code"),
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
      console.error("Resident alerts loading error:", error);
      setErrorMessage(error.message || "Unable to load alerts.");
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

  const hasFilters = searchText || typeFilter !== "all";

  return (
    <DashboardLayout
      title="Alerts"
      description="Active flood and safety alerts in your area."
    >
      <main className="page-content officer-page">
        {errorMessage && (
          <div className="flash error">{errorMessage}</div>
        )}

        <section className="section-card">
          <div className="section-title">
            <span>Active Alerts</span>

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

            <span className="officer-count">
              {filteredAlerts.length} alert
              {filteredAlerts.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="resident-card-grid">
            {loading ? (
              <div className="dashboard-empty">Loading alerts...</div>
            ) : filteredAlerts.length === 0 ? (
              <div className="dashboard-empty">
                No active alerts at this time.
              </div>
            ) : (
              filteredAlerts.map((alert) => {
                const station = stationMap.get(String(alert.station_id));

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
