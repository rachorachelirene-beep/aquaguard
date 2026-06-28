import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CalendarDays,
  Droplets,
  RefreshCw,
  Search,
  TrendingUp,
  TriangleAlert,
  Waves,
  X,
} from "lucide-react";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";

import "./WaterLevelHistory.css";


function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function formatLevel(value) {
  return `${toNumber(value).toFixed(2)} m`;
}


function formatRainfall(value) {
  return `${toNumber(value).toFixed(1)} mm`;
}


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


function formatChartTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


function getReadingStatus(level, station) {
  const numericLevel = toNumber(level);

  const warningLevel = toNumber(
    station?.warning_level,
    2
  );

  const criticalLevel = toNumber(
    station?.critical_level,
    2.5
  );

  if (numericLevel >= criticalLevel) {
    return {
      key: "critical",
      label: "Critical",
      className: "history-status-critical",
    };
  }

  if (numericLevel >= warningLevel) {
    return {
      key: "warning",
      label: "Warning",
      className: "history-status-warning",
    };
  }

  return {
    key: "normal",
    label: "Normal",
    className: "history-status-normal",
  };
}


function getDateBoundary(dateValue, endOfDay = false) {
  if (!dateValue) {
    return null;
  }

  const suffix = endOfDay
    ? "T23:59:59.999"
    : "T00:00:00.000";

  return new Date(
    `${dateValue}${suffix}`
  ).toISOString();
}


export default function WaterLevelHistory() {
  const [stations, setStations] = useState([]);
  const [selectedStationId, setSelectedStationId] =
    useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [readings, setReadings] = useState([]);
  const [stationLoading, setStationLoading] =
    useState(true);

  const [historyLoading, setHistoryLoading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [searchText, setSearchText] =
    useState("");


  const selectedStation = useMemo(
    () =>
      stations.find(
        (station) =>
          String(station.id) ===
          String(selectedStationId)
      ) ?? null,
    [stations, selectedStationId]
  );


  const filteredStations = useMemo(() => {
    const keyword = searchText
      .trim()
      .toLowerCase();

    if (!keyword) {
      return stations;
    }

    return stations.filter((station) => {
      const searchableText = [
        station.name,
        station.location,
        station.station_code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(keyword);
    });
  }, [stations, searchText]);


  const loadStations = useCallback(async () => {
    try {
      setStationLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("stations")
        .select(
          [
            "id",
            "name",
            "location",
            "station_code",
            "status",
            "normal_level",
            "warning_level",
            "critical_level",
          ].join(",")
        )
        .order("name", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      const stationRows = data ?? [];

      setStations(stationRows);

      setSelectedStationId((currentValue) => {
        if (
          currentValue &&
          stationRows.some(
            (station) =>
              String(station.id) ===
              String(currentValue)
          )
        ) {
          return currentValue;
        }

        return stationRows[0]?.id
          ? String(stationRows[0].id)
          : "";
      });
    } catch (error) {
      console.error(
        "Station loading error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to load monitoring stations."
      );
    } finally {
      setStationLoading(false);
    }
  }, []);


  const loadHistory = useCallback(async () => {
    if (!selectedStationId) {
      setReadings([]);
      return;
    }

    try {
      setHistoryLoading(true);
      setErrorMessage("");

      let query = supabase
        .from("water_levels")
        .select(
          [
            "id",
            "station_id",
            "level_m",
            "rainfall_mm",
            "recorded_at",
          ].join(",")
        )
        .eq(
          "station_id",
          selectedStationId
        )
        .order("recorded_at", {
          ascending: false,
        })
        .limit(500);

      if (startDate) {
        query = query.gte(
          "recorded_at",
          getDateBoundary(startDate)
        );
      }

      if (endDate) {
        query = query.lte(
          "recorded_at",
          getDateBoundary(endDate, true)
        );
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      setReadings(data ?? []);
    } catch (error) {
      console.error(
        "Water history loading error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to load water-level history."
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [
    selectedStationId,
    startDate,
    endDate,
  ]);


  useEffect(() => {
    loadStations();
  }, [loadStations]);


  useEffect(() => {
    loadHistory();
  }, [loadHistory]);


  const statistics = useMemo(() => {
    if (readings.length === 0) {
      return {
        latest: 0,
        average: 0,
        highest: 0,
        rainfall: 0,
        trend: 0,
      };
    }

    const levels = readings.map(
      (reading) =>
        toNumber(reading.level_m)
    );

    const rainfallValues = readings.map(
      (reading) =>
        toNumber(reading.rainfall_mm)
    );

    const totalLevel = levels.reduce(
      (sum, level) => sum + level,
      0
    );

    const latestLevel = levels[0] ?? 0;

    const previousLevel =
      levels.length > 1
        ? levels[1]
        : latestLevel;

    return {
      latest: latestLevel,
      average:
        totalLevel /
        Math.max(1, levels.length),
      highest: Math.max(...levels),
      rainfall:
        rainfallValues[0] ?? 0,
      trend: latestLevel - previousLevel,
    };
  }, [readings]);


  const chartData = useMemo(
    () =>
      [...readings]
        .reverse()
        .map((reading) => ({
          id: reading.id,
          level: toNumber(
            reading.level_m
          ),
          rainfall: toNumber(
            reading.rainfall_mm
          ),
          recordedAt:
            reading.recorded_at,
          time: formatChartTime(
            reading.recorded_at
          ),
        })),
    [readings]
  );


  const currentStatus = getReadingStatus(
    statistics.latest,
    selectedStation
  );

  const normalLevel = toNumber(
    selectedStation?.normal_level,
    1
  );

  const warningLevel = toNumber(
    selectedStation?.warning_level,
    2
  );

  const criticalLevel = toNumber(
    selectedStation?.critical_level,
    2.5
  );


  function clearFilters() {
    setStartDate("");
    setEndDate("");
  }


  return (
    <DashboardLayout
      title="Water Level History"
      description="Historical water-level readings and station trends"
    >
      <main className="history-page">
        {errorMessage && (
          <div className="history-error">
            <TriangleAlert size={18} />

            <span>{errorMessage}</span>
          </div>
        )}

        <section className="history-toolbar">
          <div className="history-station-search">
            <Search size={17} />

            <input
              type="search"
              value={searchText}
              onChange={(event) =>
                setSearchText(
                  event.target.value
                )
              }
              placeholder="Search stations..."
            />
          </div>

          <label className="history-field">
            <span>Monitoring station</span>

            <select
              value={selectedStationId}
              onChange={(event) =>
                setSelectedStationId(
                  event.target.value
                )
              }
              disabled={stationLoading}
            >
              {filteredStations.length ===
                0 && (
                <option value="">
                  No stations found
                </option>
              )}

              {filteredStations.map(
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

          <label className="history-field">
            <span>Start date</span>

            <div className="history-date-input">
              <CalendarDays size={16} />

              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) =>
                  setStartDate(
                    event.target.value
                  )
                }
              />
            </div>
          </label>

          <label className="history-field">
            <span>End date</span>

            <div className="history-date-input">
              <CalendarDays size={16} />

              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) =>
                  setEndDate(
                    event.target.value
                  )
                }
              />
            </div>
          </label>

          <div className="history-toolbar-actions">
            {(startDate || endDate) && (
              <button
                type="button"
                className="history-secondary-button"
                onClick={clearFilters}
              >
                <X size={16} />
                Clear
              </button>
            )}

            <button
              type="button"
              className="history-primary-button"
              onClick={loadHistory}
              disabled={historyLoading}
            >
              <RefreshCw
                size={16}
                className={
                  historyLoading
                    ? "history-spin"
                    : ""
                }
              />

              {historyLoading
                ? "Loading..."
                : "Refresh"}
            </button>
          </div>
        </section>

        <section className="history-station-summary">
          <div>
            <span className="history-eyebrow">
              Selected station
            </span>

            <h2>
              {selectedStation?.name ??
                "No station selected"}
            </h2>

            <p>
              {selectedStation?.location ??
                "Station location unavailable"}
            </p>
          </div>

          <div>
            <span className="history-station-code">
              {selectedStation?.station_code ??
                "--"}
            </span>

            <span
              className={`history-status ${currentStatus.className}`}
            >
              {currentStatus.label}
            </span>
          </div>
        </section>

        <section className="history-stat-grid">
          <article className="history-stat-card">
            <div className="history-stat-icon">
              <Waves size={21} />
            </div>

            <div>
              <span>Latest level</span>
              <strong>
                {formatLevel(
                  statistics.latest
                )}
              </strong>

              <small>
                {readings[0]
                  ? formatDateTime(
                      readings[0]
                        .recorded_at
                    )
                  : "No reading"}
              </small>
            </div>
          </article>

          <article className="history-stat-card">
            <div className="history-stat-icon">
              <TrendingUp size={21} />
            </div>

            <div>
              <span>Average level</span>
              <strong>
                {formatLevel(
                  statistics.average
                )}
              </strong>

              <small>
                {readings.length} reading
                {readings.length === 1
                  ? ""
                  : "s"}
              </small>
            </div>
          </article>

          <article className="history-stat-card">
            <div className="history-stat-icon">
              <TriangleAlert size={21} />
            </div>

            <div>
              <span>Highest level</span>
              <strong>
                {formatLevel(
                  statistics.highest
                )}
              </strong>

              <small>
                Critical at{" "}
                {criticalLevel.toFixed(2)} m
              </small>
            </div>
          </article>

          <article className="history-stat-card">
            <div className="history-stat-icon">
              <Droplets size={21} />
            </div>

            <div>
              <span>Latest rainfall</span>
              <strong>
                {formatRainfall(
                  statistics.rainfall
                )}
              </strong>

              <small>
                Trend{" "}
                {statistics.trend >= 0
                  ? "+"
                  : ""}
                {statistics.trend.toFixed(
                  2
                )}{" "}
                m
              </small>
            </div>
          </article>
        </section>

        <section className="history-chart-card">
          <header className="history-section-header">
            <div>
              <span className="history-eyebrow">
                Water-level trend
              </span>

              <h3>
                Historical readings
              </h3>
            </div>

            <div className="history-chart-legend">
              <span>
                <i className="legend-level" />
                Water level
              </span>

              <span>
                <i className="legend-warning" />
                Warning
              </span>

              <span>
                <i className="legend-critical" />
                Critical
              </span>
            </div>
          </header>

          <div className="history-chart">
            {historyLoading ? (
              <div className="history-empty-state">
                <RefreshCw
                  size={28}
                  className="history-spin"
                />
                <strong>
                  Loading history...
                </strong>
              </div>
            ) : chartData.length === 0 ? (
              <div className="history-empty-state">
                <Waves size={34} />

                <strong>
                  No water-level history
                </strong>

                <span>
                  No readings match the
                  selected station and date.
                </span>
              </div>
            ) : (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <AreaChart
                  data={chartData}
                  margin={{
                    top: 20,
                    right: 20,
                    bottom: 10,
                    left: 0,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="historyLevelGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#2563eb"
                        stopOpacity={0.35}
                      />

                      <stop
                        offset="95%"
                        stopColor="#2563eb"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="4 4"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="time"
                    minTickGap={28}
                    tick={{
                      fontSize: 11,
                    }}
                  />

                  <YAxis
                    domain={[
                      0,
                      Math.max(
                        3,
                        criticalLevel + 0.5
                      ),
                    ]}
                    tick={{
                      fontSize: 11,
                    }}
                    tickFormatter={(value) =>
                      `${value}m`
                    }
                  />

                  <Tooltip
                    labelFormatter={(
                      _label,
                      entries
                    ) =>
                      formatDateTime(
                        entries?.[0]
                          ?.payload
                          ?.recordedAt
                      )
                    }
                    formatter={(value) => [
                      `${toNumber(
                        value
                      ).toFixed(2)} m`,
                      "Water level",
                    ]}
                  />

                  <ReferenceLine
                    y={normalLevel}
                    stroke="#14b8a6"
                    strokeDasharray="4 4"
                    label={{
                      value: "Normal",
                      position: "insideTopRight",
                      fill: "#0f766e",
                      fontSize: 11,
                    }}
                  />

                  <ReferenceLine
                    y={warningLevel}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{
                      value: "Warning",
                      position: "insideTopRight",
                      fill: "#b45309",
                      fontSize: 11,
                    }}
                  />

                  <ReferenceLine
                    y={criticalLevel}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={{
                      value: "Critical",
                      position: "insideTopRight",
                      fill: "#b91c1c",
                      fontSize: 11,
                    }}
                  />

                  <Area
                    type="monotone"
                    dataKey="level"
                    stroke="#2563eb"
                    strokeWidth={3}
                    fill="url(#historyLevelGradient)"
                    activeDot={{
                      r: 5,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="history-table-card">
          <header className="history-section-header">
            <div>
              <span className="history-eyebrow">
                Reading records
              </span>

              <h3>
                Water-level history
              </h3>
            </div>

            <span className="history-record-count">
              {readings.length} records
            </span>
          </header>

          <div className="history-table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date and time</th>
                  <th>Water level</th>
                  <th>Rainfall</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {readings.length === 0 ? (
                  <tr>
                    <td
                      colSpan="4"
                      className="history-table-empty"
                    >
                      No history records found.
                    </td>
                  </tr>
                ) : (
                  readings.map((reading) => {
                    const status =
                      getReadingStatus(
                        reading.level_m,
                        selectedStation
                      );

                    return (
                      <tr key={reading.id}>
                        <td>
                          {formatDateTime(
                            reading.recorded_at
                          )}
                        </td>

                        <td>
                          <strong>
                            {formatLevel(
                              reading.level_m
                            )}
                          </strong>
                        </td>

                        <td>
                          {formatRainfall(
                            reading.rainfall_mm
                          )}
                        </td>

                        <td>
                          <span
                            className={`history-status ${status.className}`}
                          >
                            {status.label}
                          </span>
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
    </DashboardLayout>
  );
}