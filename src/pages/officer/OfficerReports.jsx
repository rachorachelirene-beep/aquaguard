import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search, X } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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

function getStatus(level, station) {
  const numericLevel = toNumber(level);
  const warningLevel = toNumber(station?.warning_level, 2);
  const criticalLevel = toNumber(station?.critical_level, 2.5);

  if (numericLevel >= criticalLevel) {
    return {
      key: "critical",
      label: "Critical",
      badge: "badge-red",
    };
  }

  if (numericLevel >= warningLevel) {
    return {
      key: "warning",
      label: "Warning",
      badge: "badge-orange",
    };
  }

  return {
    key: "normal",
    label: "Normal",
    badge: "badge-green",
  };
}

function escapeCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export default function OfficerReports() {
  const [stations, setStations] = useState([]);
  const [readings, setReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setFlash(null);

      const [stationsResult, readingsResult, alertsResult] =
        await Promise.all([
          supabase
            .from("stations")
            .select(
              "id, name, location, station_code, status, warning_level, critical_level"
            )
            .order("name", { ascending: true }),
          supabase
            .from("water_levels")
            .select("id, station_id, level_m, rainfall_mm, recorded_at")
            .order("recorded_at", { ascending: false })
            .limit(500),
          supabase
            .from("alerts")
            .select("id, type, is_resolved, created_at")
            .order("created_at", { ascending: false })
            .limit(1000),
        ]);

      const firstError = [
        stationsResult.error,
        readingsResult.error,
        alertsResult.error,
      ].find(Boolean);

      if (firstError) {
        throw firstError;
      }

      setStations(stationsResult.data ?? []);
      setReadings(readingsResult.data ?? []);
      setAlerts(alertsResult.data ?? []);
    } catch (error) {
      console.error("Officer reports loading error:", error);
      setFlash({
        type: "error",
        text: error.message || "Unable to load reports.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function boot() {
      await loadReports();
    }

    boot();
  }, [loadReports]);

  const reportRows = useMemo(() => {
    const latestByStation = new Map();

    readings.forEach((reading) => {
      const key = String(reading.station_id);

      if (!latestByStation.has(key)) {
        latestByStation.set(key, reading);
      }
    });

    return stations.map((station) => {
      const reading = latestByStation.get(String(station.id)) ?? null;
      const status = getStatus(reading?.level_m, station);

      return {
        station,
        reading,
        status,
      };
    });
  }, [stations, readings]);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return reportRows.filter((row) => {
      const searchableText = [
        row.station.name,
        row.station.location,
        row.station.station_code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !keyword || searchableText.includes(keyword);

      const matchesStatus =
        statusFilter === "all" || row.status.key === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [reportRows, searchText, statusFilter]);

  const activeAlerts = alerts.filter((alert) => !alert.is_resolved).length;

  function clearFilters() {
    setSearchText("");
    setStatusFilter("all");
  }

  function exportCsv() {
    const headers = [
      "Station",
      "Level (m)",
      "Rainfall (mm)",
      "Last Reading",
      "Status",
    ];
    const csvRows = filteredRows.map((row) => [
      row.station.name,
      row.reading ? toNumber(row.reading.level_m).toFixed(2) : "",
      row.reading ? toNumber(row.reading.rainfall_mm).toFixed(1) : "",
      row.reading ? formatDateTime(row.reading.recorded_at) : "",
      row.status.label,
    ]);

    const csv = [headers, ...csvRows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff", csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `aquaguard-officer-report-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const hasFilters = searchText || statusFilter !== "all";

  return (
    <DashboardLayout
      title="Reports"
      description="Flood monitoring summary for your barangay."
    >
      {flash && (
        <div className={`flash ${flash.type}`}>{flash.text}</div>
      )}

      <main className="page-content officer-page">
        <section className="stat-cards officer-stat-strip">
          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">TOTAL STATIONS</span>
              <span className="stat-icon blue">#</span>
            </div>
            <div className="stat-value blue">{stations.length}</div>
            <div className="stat-sub">MONITORING LOCATIONS</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">TOTAL ALERTS</span>
              <span className="stat-icon orange">!</span>
            </div>
            <div className="stat-value orange">{alerts.length}</div>
            <div className="stat-sub">RECORDED ALERTS</div>
          </div>

          <div className="stat-card warning-card">
            <div className="stat-header">
              <span className="stat-label">ACTIVE ALERTS</span>
              <span className="stat-icon red">!</span>
            </div>
            <div className="stat-value red">{activeAlerts}</div>
            <div className="stat-sub">UNRESOLVED</div>
          </div>
        </section>

        <section className="section-card">
          <div className="section-title">
            <span>Current Water Levels</span>

            <button
              className="btn-submit officer-title-action"
              type="button"
              onClick={exportCsv}
              disabled={filteredRows.length === 0}
            >
              <Download size={16} />
              Export CSV
            </button>
          </div>

          <div className="officer-toolbar">
            <label className="officer-search">
              <Search size={17} />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search station..."
              />
            </label>

            <select
              className="form-input officer-filter-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All Status</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="normal">Normal</option>
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

            <button
              className="btn-cancel officer-icon-button"
              type="button"
              onClick={loadReports}
              disabled={loading}
            >
              <RefreshCw
                size={16}
                className={loading ? "officer-spin" : ""}
              />
              Refresh
            </button>

            <span className="officer-count">
              {filteredRows.length} station
              {filteredRows.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Station</th>
                  <th>Level (m)</th>
                  <th>Rainfall (mm)</th>
                  <th>Last Reading</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="officer-table-empty">
                      Loading report...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="officer-table-empty">
                      No report records found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.station.id}>
                      <td>
                        <strong>{row.station.name}</strong>
                        <small className="officer-table-subtext">
                          {row.station.location ?? row.station.station_code}
                        </small>
                      </td>
                      <td>
                        {row.reading
                          ? toNumber(row.reading.level_m).toFixed(2)
                          : "--"}
                      </td>
                      <td>
                        {row.reading
                          ? toNumber(row.reading.rainfall_mm).toFixed(1)
                          : "--"}
                      </td>
                      <td>
                        {row.reading
                          ? formatDateTime(row.reading.recorded_at)
                          : "No data"}
                      </td>
                      <td>
                        <span className={`badge ${row.status.badge}`}>
                          {row.status.label}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}
