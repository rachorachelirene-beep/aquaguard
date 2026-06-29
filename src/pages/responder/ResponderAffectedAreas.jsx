import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";
import {
  formatDateTime,
  getWaterStatus,
  toNumber,
} from "./responderUtils";

function buildLatestReadings(stations, readings) {
  const latestByStation = new Map();

  readings.forEach((reading) => {
    const key = String(reading.station_id);

    if (!latestByStation.has(key)) {
      latestByStation.set(key, reading);
    }
  });

  return stations.map((station) => {
    const reading = latestByStation.get(String(station.id)) ?? null;

    return {
      station,
      reading,
      status: reading
        ? getWaterStatus(reading.level_m, station)
        : {
            key: "unknown",
            label: "No data",
            className: "gray",
            badge: "badge-gray",
          },
    };
  });
}

export default function ResponderAffectedAreas() {
  const [stations, setStations] = useState([]);
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setFlash(null);

      const [stationsResult, readingsResult] = await Promise.all([
        supabase
          .from("stations")
          .select(
            "id, name, location, station_code, status, warning_level, critical_level, normal_level"
          )
          .order("name", { ascending: true }),
        supabase
          .from("water_levels")
          .select("id, station_id, level_m, rainfall_mm, recorded_at")
          .order("recorded_at", { ascending: false })
          .limit(600),
      ]);

      const firstError = [stationsResult.error, readingsResult.error].find(
        Boolean
      );

      if (firstError) {
        throw firstError;
      }

      setStations(stationsResult.data ?? []);
      setReadings(readingsResult.data ?? []);
    } catch (error) {
      console.error("Responder affected areas error:", error);
      setFlash({
        type: "error",
        text: error.message || "Unable to load affected areas.",
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

  const stationCards = useMemo(
    () => buildLatestReadings(stations, readings),
    [stations, readings]
  );

  const historyByStation = useMemo(() => {
    const map = new Map();

    readings.forEach((reading) => {
      const key = String(reading.station_id);
      const rows = map.get(key) ?? [];

      if (rows.length < 24) {
        rows.push(reading);
      }

      map.set(key, rows);
    });

    map.forEach((rows, key) => {
      map.set(key, [...rows].reverse());
    });

    return map;
  }, [readings]);

  return (
    <DashboardLayout
      title="Affected Areas"
      description="Real-time station status and water-level trends."
    >
      {flash && (
        <div className={`flash ${flash.type}`}>{flash.text}</div>
      )}

      <main className="page-content officer-page">
        <section className="section-card">
          <div className="section-title">
            <span>Station Status</span>
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

          <div className="resident-station-grid">
            {loading ? (
              <div className="dashboard-empty">Loading stations...</div>
            ) : stationCards.length === 0 ? (
              <div className="dashboard-empty">
                No monitoring stations configured.
              </div>
            ) : (
              stationCards.map((item) => (
                <article
                  className="lm-station-card resident-station-card"
                  key={item.station.id}
                >
                  <div className="lm-station-top">
                    <div className="lm-station-name">
                      {item.station.name}
                    </div>
                    <span className={`lm-dot ${item.status.className}`} />
                  </div>
                  <strong className={`stat-value ${item.status.className}`}>
                    {item.reading
                      ? `${toNumber(item.reading.level_m).toFixed(2)} m`
                      : "No data"}
                  </strong>
                  <span>{item.station.location ?? item.station.station_code}</span>
                  <span className={`badge ${item.status.badge}`}>
                    {item.status.label}
                  </span>
                  <small className="officer-table-subtext">
                    Updated {formatDateTime(item.reading?.recorded_at)}
                  </small>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="responder-chart-grid">
          {stationCards.map((item) => {
            const history = historyByStation.get(String(item.station.id)) ?? [];
            const critical = toNumber(item.station.critical_level, 2.5);
            const maxLevel = Math.max(critical, 1);

            return (
              <article className="section-card" key={item.station.id}>
                <div className="section-title">
                  <span>{item.station.name}</span>
                  <span className={`badge ${item.status.badge}`}>
                    {item.status.label}
                  </span>
                </div>
                <div className="bar-chart responder-mini-chart">
                  {history.length === 0 ? (
                    <div className="dashboard-empty">No trend data.</div>
                  ) : (
                    history.map((reading) => {
                      const level = toNumber(reading.level_m);
                      const status = getWaterStatus(level, item.station);
                      const pct = Math.min(100, (level / maxLevel) * 100);

                      return (
                        <div
                          key={reading.id}
                          className="bar"
                          title={`${level.toFixed(2)} m`}
                          style={{
                            height: `${Math.max(4, pct)}%`,
                            background:
                              status.key === "critical"
                                ? "#d84a4a"
                                : status.key === "warning"
                                  ? "#c77b2a"
                                  : "#1f6f8b",
                          }}
                        />
                      );
                    })
                  )}
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </DashboardLayout>
  );
}
