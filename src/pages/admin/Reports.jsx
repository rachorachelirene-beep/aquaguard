import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  BellRing,
  CalendarDays,
  CloudRain,
  Download,
  FileBarChart2,
  Gauge,
  Printer,
  RefreshCw,
  TriangleAlert,
  Waves,
  X,
} from "lucide-react";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";

import "./Reports.css";


function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function clamp(value, minimum, maximum) {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  );
}


function getDateInputValue(offsetDays = 0) {
  const date = new Date();

  date.setDate(
    date.getDate() + offsetDays
  );

  return date
    .toISOString()
    .slice(0, 10);
}


function getDateBoundary(
  dateValue,
  endOfDay = false
) {
  if (!dateValue) {
    return null;
  }

  const time = endOfDay
    ? "23:59:59.999"
    : "00:00:00.000";

  return new Date(
    `${dateValue}T${time}`
  ).toISOString();
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


function getWaterStatus(
  level,
  station
) {
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
      label: "Critical",
      key: "critical",
    };
  }

  if (numericLevel >= warningLevel) {
    return {
      label: "Warning",
      key: "warning",
    };
  }

  return {
    label: "Normal",
    key: "normal",
  };
}


function getRiskStatus(value) {
  const risk = clamp(
    toNumber(value),
    0,
    1
  );

  const percentage = Math.round(
    risk * 100
  );

  if (percentage >= 75) {
    return {
      label: "Critical",
      key: "critical",
      percentage,
    };
  }

  if (percentage >= 50) {
    return {
      label: "High",
      key: "high",
      percentage,
    };
  }

  if (percentage >= 25) {
    return {
      label: "Moderate",
      key: "warning",
      percentage,
    };
  }

  return {
    label: "Low",
    key: "normal",
    percentage,
  };
}


function escapeCsvValue(value) {
  const text = String(
    value ?? ""
  ).replaceAll('"', '""');

  return `"${text}"`;
}


export default function Reports() {
  const [stations, setStations] =
    useState([]);

  const [
    selectedStationId,
    setSelectedStationId,
  ] = useState("all");

  const [startDate, setStartDate] =
    useState(() =>
      getDateInputValue(-6)
    );

  const [endDate, setEndDate] =
    useState(() =>
      getDateInputValue(0)
    );

  const [reportType, setReportType] =
    useState("all");

  const [waterRows, setWaterRows] =
    useState([]);

  const [alertRows, setAlertRows] =
    useState([]);

  const [weatherRows, setWeatherRows] =
    useState([]);

  const [yoloRows, setYoloRows] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [
    generatedAt,
    setGeneratedAt,
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


  const selectedStation = useMemo(
    () =>
      stations.find(
        (station) =>
          String(station.id) ===
          String(selectedStationId)
      ) ?? null,
    [
      stations,
      selectedStationId,
    ]
  );


  const loadStations =
    useCallback(async () => {
      const { data, error } =
        await supabase
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

      setStations(data ?? []);
    }, []);


  const loadReportData =
    useCallback(async () => {
      try {
        setLoading(true);
        setErrorMessage("");

        const startBoundary =
          getDateBoundary(startDate);

        const endBoundary =
          getDateBoundary(
            endDate,
            true
          );

        let waterQuery = supabase
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
          .gte(
            "recorded_at",
            startBoundary
          )
          .lte(
            "recorded_at",
            endBoundary
          )
          .order("recorded_at", {
            ascending: false,
          })
          .limit(1000);

        let alertQuery = supabase
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
          .gte(
            "created_at",
            startBoundary
          )
          .lte(
            "created_at",
            endBoundary
          )
          .order("created_at", {
            ascending: false,
          })
          .limit(1000);

        let weatherQuery = supabase
          .from("weather_readings")
          .select(
            [
              "id",
              "station_id",
              "temperature",
              "precipitation",
              "rain_1h",
              "rain_6h",
              "wind_speed",
              "condition_text",
              "flood_risk",
              "recorded_at",
            ].join(",")
          )
          .gte(
            "recorded_at",
            startBoundary
          )
          .lte(
            "recorded_at",
            endBoundary
          )
          .order("recorded_at", {
            ascending: false,
          })
          .limit(1000);

        let yoloQuery = supabase
          .from("yolo_detections")
          .select(
            [
              "id",
              "station_id",
              "water_coverage",
              "level_m",
              "confidence",
              "weather_risk",
              "flood_risk",
              "detected_at",
            ].join(",")
          )
          .gte(
            "detected_at",
            startBoundary
          )
          .lte(
            "detected_at",
            endBoundary
          )
          .order("detected_at", {
            ascending: false,
          })
          .limit(1000);

        if (
          selectedStationId !== "all"
        ) {
          waterQuery = waterQuery.eq(
            "station_id",
            selectedStationId
          );

          alertQuery = alertQuery.eq(
            "station_id",
            selectedStationId
          );

          weatherQuery =
            weatherQuery.eq(
              "station_id",
              selectedStationId
            );

          yoloQuery = yoloQuery.eq(
            "station_id",
            selectedStationId
          );
        }

        const [
          waterResult,
          alertResult,
          weatherResult,
          yoloResult,
        ] = await Promise.all([
          waterQuery,
          alertQuery,
          weatherQuery,
          yoloQuery,
        ]);

        const firstError = [
          waterResult.error,
          alertResult.error,
          weatherResult.error,
          yoloResult.error,
        ].find(Boolean);

        if (firstError) {
          throw firstError;
        }

        setWaterRows(
          waterResult.data ?? []
        );

        setAlertRows(
          alertResult.data ?? []
        );

        setWeatherRows(
          weatherResult.data ?? []
        );

        setYoloRows(
          yoloResult.data ?? []
        );

        setGeneratedAt(
          new Date().toISOString()
        );
      } catch (error) {
        console.error(
          "Report loading error:",
          error
        );

        setErrorMessage(
          error.message ||
            "Unable to generate report."
        );
      } finally {
        setLoading(false);
      }
    }, [
      selectedStationId,
      startDate,
      endDate,
    ]);


  useEffect(() => {
    async function initialize() {
      try {
        await loadStations();
      } catch (error) {
        console.error(
          "Report station error:",
          error
        );

        setErrorMessage(
          error.message ||
            "Unable to load stations."
        );
      }
    }

    initialize();
  }, [loadStations]);


  useEffect(() => {
    loadReportData();
  }, [loadReportData]);


  const statistics = useMemo(() => {
    const levels = waterRows.map(
      (row) =>
        toNumber(row.level_m)
    );

    const rainfallValues =
      waterRows.map((row) =>
        toNumber(
          row.rainfall_mm
        )
      );

    const averageLevel =
      levels.length > 0
        ? levels.reduce(
            (total, level) =>
              total + level,
            0
          ) / levels.length
        : 0;

    const highestLevel =
      levels.length > 0
        ? Math.max(...levels)
        : 0;

    const totalRainfall =
      rainfallValues.reduce(
        (total, rainfall) =>
          total + rainfall,
        0
      );

    const activeAlerts =
      alertRows.filter(
        (alert) =>
          !alert.is_resolved
      ).length;

    const criticalReadings =
      waterRows.filter((row) => {
        const station =
          stationMap.get(
            String(row.station_id)
          );

        return (
          getWaterStatus(
            row.level_m,
            station
          ).key === "critical"
        );
      }).length;

    const risks =
      yoloRows.map((row) =>
        clamp(
          toNumber(
            row.flood_risk
          ),
          0,
          1
        )
      );

    const weatherRisks =
      weatherRows.map((row) =>
        clamp(
          toNumber(
            row.flood_risk
          ),
          0,
          1
        )
      );

    const combinedRisks = [
      ...risks,
      ...weatherRisks,
    ];

    const averageRisk =
      combinedRisks.length > 0
        ? combinedRisks.reduce(
            (total, risk) =>
              total + risk,
            0
          ) /
          combinedRisks.length
        : 0;

    return {
      readingCount:
        waterRows.length,

      averageLevel,

      highestLevel,

      totalRainfall,

      activeAlerts,

      criticalReadings,

      averageRisk:
        Math.round(
          averageRisk * 100
        ),
    };
  }, [
    waterRows,
    alertRows,
    weatherRows,
    yoloRows,
    stationMap,
  ]);


  const chartData = useMemo(
    () =>
      [...waterRows]
        .reverse()
        .slice(-100)
        .map((row) => ({
          id: row.id,

          time: formatChartTime(
            row.recorded_at
          ),

          recordedAt:
            row.recorded_at,

          level: toNumber(
            row.level_m
          ),

          rainfall: toNumber(
            row.rainfall_mm
          ),
        })),
    [waterRows]
  );


  const alertBreakdown = useMemo(() => {
    const counts = {
      critical: 0,
      warning: 0,
      system: 0,
      info: 0,
    };

    alertRows.forEach((alert) => {
      const type = String(
        alert.type ?? "info"
      ).toLowerCase();

      if (
        Object.hasOwn(
          counts,
          type
        )
      ) {
        counts[type] += 1;
      } else {
        counts.info += 1;
      }
    });

    const total = Math.max(
      1,
      alertRows.length
    );

    return Object.entries(counts).map(
      ([type, count]) => ({
        type,
        count,
        percentage:
          count / total * 100,
      })
    );
  }, [alertRows]);


  const reportRows = useMemo(() => {
    const waterReportRows =
      waterRows.map((row) => {
        const station =
          stationMap.get(
            String(row.station_id)
          );

        const status =
          getWaterStatus(
            row.level_m,
            station
          );

        return {
          key: `water-${row.id}`,
          date: row.recorded_at,
          type: "Water Level",
          station:
            station?.name ??
            "Unknown station",
          primary:
            `${toNumber(
              row.level_m
            ).toFixed(2)} m`,
          secondary:
            `Rainfall: ${toNumber(
              row.rainfall_mm
            ).toFixed(1)} mm`,
          status: status.label,
          statusKey: status.key,
        };
      });

    const alertReportRows =
      alertRows.map((row) => {
        const station =
          stationMap.get(
            String(row.station_id)
          );

        return {
          key: `alert-${row.id}`,
          date: row.created_at,
          type: "Alert",
          station:
            station?.name ??
            "General alert",
          primary:
            row.title ??
            "Untitled alert",
          secondary:
            row.message ??
            "No message",
          status: row.is_resolved
            ? "Resolved"
            : String(
                row.type ?? "Info"
              ),
          statusKey:
            row.is_resolved
              ? "normal"
              : String(
                  row.type ??
                    "info"
                ).toLowerCase(),
        };
      });

    const weatherReportRows =
      weatherRows.map((row) => {
        const station =
          stationMap.get(
            String(row.station_id)
          );

        const risk =
          getRiskStatus(
            row.flood_risk
          );

        return {
          key: `weather-${row.id}`,
          date: row.recorded_at,
          type: "Weather",
          station:
            station?.name ??
            "Unknown station",
          primary:
            row.condition_text ??
            "Weather reading",
          secondary:
            `${toNumber(
              row.temperature
            ).toFixed(1)}°C • Rain: ${toNumber(
              row.rain_1h ??
                row.precipitation
            ).toFixed(1)} mm`,
          status:
            `${risk.label} Risk`,
          statusKey: risk.key,
        };
      });

    const yoloReportRows =
      yoloRows.map((row) => {
        const station =
          stationMap.get(
            String(row.station_id)
          );

        const risk =
          getRiskStatus(
            row.flood_risk
          );

        return {
          key: `yolo-${row.id}`,
          date: row.detected_at,
          type: "AI Detection",
          station:
            station?.name ??
            "Unknown station",
          primary:
            `Flood risk: ${risk.percentage}%`,
          secondary:
            `Coverage: ${toNumber(
              row.water_coverage
            ).toFixed(1)}% • Confidence: ${Math.round(
              toNumber(
                row.confidence
              ) * 100
            )}%`,
          status: risk.label,
          statusKey: risk.key,
        };
      });

    let rows = [];

    if (reportType === "water") {
      rows = waterReportRows;
    } else if (
      reportType === "alerts"
    ) {
      rows = alertReportRows;
    } else if (
      reportType === "weather"
    ) {
      rows = weatherReportRows;
    } else if (
      reportType === "ai"
    ) {
      rows = yoloReportRows;
    } else {
      rows = [
        ...waterReportRows,
        ...alertReportRows,
        ...weatherReportRows,
        ...yoloReportRows,
      ];
    }

    return rows.sort(
      (firstRow, secondRow) =>
        new Date(
          secondRow.date
        ).getTime() -
        new Date(
          firstRow.date
        ).getTime()
    );
  }, [
    reportType,
    waterRows,
    alertRows,
    weatherRows,
    yoloRows,
    stationMap,
  ]);


  const warningLevel = toNumber(
    selectedStation?.warning_level,
    2
  );

  const criticalLevel = toNumber(
    selectedStation?.critical_level,
    2.5
  );


  function resetDateRange() {
    setStartDate(
      getDateInputValue(-6)
    );

    setEndDate(
      getDateInputValue(0)
    );
  }


  function exportCsv() {
    if (reportRows.length === 0) {
      setErrorMessage(
        "There are no report records to export."
      );

      return;
    }

    const headers = [
      "Date and Time",
      "Record Type",
      "Station",
      "Primary Information",
      "Additional Information",
      "Status",
    ];

    const csvRows = reportRows.map(
      (row) => [
        formatDateTime(row.date),
        row.type,
        row.station,
        row.primary,
        row.secondary,
        row.status,
      ]
    );

    const csvContent = [
      headers,
      ...csvRows,
    ]
      .map((row) =>
        row
          .map(escapeCsvValue)
          .join(",")
      )
      .join("\n");

    const blob = new Blob(
      [
        "\ufeff",
        csvContent,
      ],
      {
        type:
          "text/csv;charset=utf-8;",
      }
    );

    const downloadUrl =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    const stationName =
      selectedStation?.name ??
      "all-stations";

    const safeStationName =
      stationName
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          "-"
        )
        .replace(
          /^-|-$/g,
          ""
        );

    link.href = downloadUrl;

    link.download =
      `aquaguard-report-${safeStationName}-${startDate}-to-${endDate}.csv`;

    document.body.appendChild(
      link
    );

    link.click();
    link.remove();

    URL.revokeObjectURL(
      downloadUrl
    );
  }


  function printReport() {
    window.print();
  }


  return (
    <DashboardLayout
      title="Reports"
      description="Generate and export flood monitoring reports"
    >
      <main className="reports-page">
        {errorMessage && (
          <div className="reports-error">
            <TriangleAlert
              size={18}
            />

            <span>
              {errorMessage}
            </span>

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

        <section className="reports-heading-card">
          <div className="reports-heading-icon">
            <FileBarChart2
              size={29}
            />
          </div>

          <div>
            <span className="reports-eyebrow">
              AquaGuard reporting
            </span>

            <h2>
              Flood Monitoring Report
            </h2>

            <p>
              Review water levels,
              alerts, weather conditions
              and AI flood detections.
            </p>
          </div>

          <div className="reports-generated">
            <span>
              Last generated
            </span>

            <strong>
              {formatDateTime(
                generatedAt
              )}
            </strong>
          </div>
        </section>

        <section className="reports-toolbar">
          <label className="reports-field">
            <span>Station</span>

            <select
              value={
                selectedStationId
              }
              onChange={(event) =>
                setSelectedStationId(
                  event.target.value
                )
              }
            >
              <option value="all">
                All monitoring stations
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

          <label className="reports-field">
            <span>Report type</span>

            <select
              value={reportType}
              onChange={(event) =>
                setReportType(
                  event.target.value
                )
              }
            >
              <option value="all">
                Complete report
              </option>

              <option value="water">
                Water-level report
              </option>

              <option value="alerts">
                Alert report
              </option>

              <option value="weather">
                Weather report
              </option>

              <option value="ai">
                AI detection report
              </option>
            </select>
          </label>

          <label className="reports-field">
            <span>Start date</span>

            <div className="reports-date-field">
              <CalendarDays
                size={16}
              />

              <input
                type="date"
                value={startDate}
                max={
                  endDate ||
                  undefined
                }
                onChange={(event) =>
                  setStartDate(
                    event.target.value
                  )
                }
              />
            </div>
          </label>

          <label className="reports-field">
            <span>End date</span>

            <div className="reports-date-field">
              <CalendarDays
                size={16}
              />

              <input
                type="date"
                value={endDate}
                min={
                  startDate ||
                  undefined
                }
                onChange={(event) =>
                  setEndDate(
                    event.target.value
                  )
                }
              />
            </div>
          </label>

          <div className="reports-toolbar-actions">
            <button
              type="button"
              className="reports-secondary-button"
              onClick={resetDateRange}
            >
              Reset
            </button>

            <button
              type="button"
              className="reports-primary-button"
              onClick={loadReportData}
              disabled={loading}
            >
              <RefreshCw
                size={16}
                className={
                  loading
                    ? "reports-spin"
                    : ""
                }
              />

              {loading
                ? "Generating..."
                : "Generate"}
            </button>
          </div>
        </section>

        <section className="reports-stat-grid">
          <article className="reports-stat-card">
            <div className="reports-stat-icon reports-icon-blue">
              <Waves size={21} />
            </div>

            <div>
              <span>
                Water readings
              </span>

              <strong>
                {
                  statistics.readingCount
                }
              </strong>

              <small>
                Average:{" "}
                {statistics.averageLevel.toFixed(
                  2
                )}{" "}
                m
              </small>
            </div>
          </article>

          <article className="reports-stat-card">
            <div className="reports-stat-icon reports-icon-purple">
              <Gauge size={21} />
            </div>

            <div>
              <span>
                Highest level
              </span>

              <strong>
                {statistics.highestLevel.toFixed(
                  2
                )}{" "}
                m
              </strong>

              <small>
                {
                  statistics.criticalReadings
                }{" "}
                critical readings
              </small>
            </div>
          </article>

          <article className="reports-stat-card">
            <div className="reports-stat-icon reports-icon-orange">
              <BellRing size={21} />
            </div>

            <div>
              <span>
                Active alerts
              </span>

              <strong>
                {
                  statistics.activeAlerts
                }
              </strong>

              <small>
                {alertRows.length} total
                alerts
              </small>
            </div>
          </article>

          <article className="reports-stat-card">
            <div className="reports-stat-icon reports-icon-cyan">
              <CloudRain size={21} />
            </div>

            <div>
              <span>
                Total rainfall
              </span>

              <strong>
                {statistics.totalRainfall.toFixed(
                  1
                )}{" "}
                mm
              </strong>

              <small>
                Selected period
              </small>
            </div>
          </article>

          <article className="reports-stat-card">
            <div className="reports-stat-icon reports-icon-red">
              <Activity size={21} />
            </div>

            <div>
              <span>
                Average flood risk
              </span>

              <strong>
                {
                  statistics.averageRisk
                }
                %
              </strong>

              <small>
                Weather and AI risk
              </small>
            </div>
          </article>
        </section>

        <section className="reports-chart-card">
          <header className="reports-section-header">
            <div>
              <span className="reports-eyebrow">
                Water-level analysis
              </span>

              <h3>
                Water level and rainfall
              </h3>
            </div>

            <div className="reports-report-actions">
              <button
                type="button"
                onClick={exportCsv}
              >
                <Download size={16} />
                Export CSV
              </button>

              <button
                type="button"
                onClick={printReport}
              >
                <Printer size={16} />
                Print report
              </button>
            </div>
          </header>

          <div className="reports-chart">
            {loading ? (
              <div className="reports-empty">
                <RefreshCw
                  size={30}
                  className="reports-spin"
                />

                <strong>
                  Generating report...
                </strong>
              </div>
            ) : chartData.length ===
              0 ? (
              <div className="reports-empty">
                <FileBarChart2
                  size={40}
                />

                <strong>
                  No chart data
                </strong>

                <span>
                  No water-level readings
                  were found for the
                  selected period.
                </span>
              </div>
            ) : (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <ComposedChart
                  data={chartData}
                  margin={{
                    top: 20,
                    right: 25,
                    bottom: 5,
                    left: 0,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="4 4"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="time"
                    minTickGap={30}
                    tick={{
                      fontSize: 10,
                    }}
                  />

                  <YAxis
                    yAxisId="level"
                    orientation="left"
                    tick={{
                      fontSize: 10,
                    }}
                    tickFormatter={(
                      value
                    ) => `${value}m`}
                  />

                  <YAxis
                    yAxisId="rainfall"
                    orientation="right"
                    tick={{
                      fontSize: 10,
                    }}
                    tickFormatter={(
                      value
                    ) => `${value}mm`}
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
                    formatter={(
                      value,
                      name
                    ) => {
                      if (
                        name ===
                        "Water Level"
                      ) {
                        return [
                          `${toNumber(
                            value
                          ).toFixed(
                            2
                          )} m`,
                          name,
                        ];
                      }

                      return [
                        `${toNumber(
                          value
                        ).toFixed(
                          1
                        )} mm`,
                        name,
                      ];
                    }}
                  />

                  <Legend />

                  <ReferenceLine
                    yAxisId="level"
                    y={warningLevel}
                    stroke="#f97316"
                    strokeDasharray="4 4"
                  />

                  <ReferenceLine
                    yAxisId="level"
                    y={criticalLevel}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                  />

                  <Bar
                    yAxisId="rainfall"
                    dataKey="rainfall"
                    name="Rainfall"
                    fill="#60a5fa"
                    radius={[
                      4,
                      4,
                      0,
                      0,
                    ]}
                  />

                  <Line
                    yAxisId="level"
                    type="monotone"
                    dataKey="level"
                    name="Water Level"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{
                      r: 5,
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="reports-secondary-grid">
          <article className="reports-breakdown-card">
            <header className="reports-section-header">
              <div>
                <span className="reports-eyebrow">
                  Alert distribution
                </span>

                <h3>
                  Alerts by type
                </h3>
              </div>
            </header>

            <div className="reports-breakdown-list">
              {alertBreakdown.map(
                (item) => (
                  <div
                    key={item.type}
                    className="reports-breakdown-item"
                  >
                    <div>
                      <strong>
                        {item.type}
                      </strong>

                      <span>
                        {item.count} alert
                        {item.count === 1
                          ? ""
                          : "s"}
                      </span>
                    </div>

                    <div className="reports-progress">
                      <span
                        className={`reports-progress-${item.type}`}
                        style={{
                          width: `${item.percentage}%`,
                        }}
                      />
                    </div>
                  </div>
                )
              )}
            </div>
          </article>

          <article className="reports-information-card">
            <header className="reports-section-header">
              <div>
                <span className="reports-eyebrow">
                  Report information
                </span>

                <h3>
                  Current selection
                </h3>
              </div>
            </header>

            <dl className="reports-information-list">
              <div>
                <dt>Station</dt>

                <dd>
                  {selectedStation?.name ??
                    "All monitoring stations"}
                </dd>
              </div>

              <div>
                <dt>Location</dt>

                <dd>
                  {selectedStation?.location ??
                    "All locations"}
                </dd>
              </div>

              <div>
                <dt>Date range</dt>

                <dd>
                  {startDate} to{" "}
                  {endDate}
                </dd>
              </div>

              <div>
                <dt>Report type</dt>

                <dd>
                  {reportType === "all"
                    ? "Complete report"
                    : reportType ===
                      "water"
                    ? "Water-level report"
                    : reportType ===
                      "alerts"
                    ? "Alert report"
                    : reportType ===
                      "weather"
                    ? "Weather report"
                    : "AI detection report"}
                </dd>
              </div>

              <div>
                <dt>Total records</dt>

                <dd>
                  {reportRows.length}
                </dd>
              </div>
            </dl>
          </article>
        </section>

        <section className="reports-table-card">
          <header className="reports-section-header">
            <div>
              <span className="reports-eyebrow">
                Report preview
              </span>

              <h3>
                Detailed records
              </h3>
            </div>

            <span className="reports-record-count">
              {reportRows.length} records
            </span>
          </header>

          <div className="reports-table-wrapper">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Date and time</th>
                  <th>Record type</th>
                  <th>Station</th>
                  <th>Information</th>
                  <th>Additional details</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {reportRows.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="reports-table-empty"
                    >
                      No report records
                      found.
                    </td>
                  </tr>
                ) : (
                  reportRows
                    .slice(0, 150)
                    .map((row) => (
                      <tr key={row.key}>
                        <td>
                          {formatDateTime(
                            row.date
                          )}
                        </td>

                        <td>
                          <span className="reports-type-badge">
                            {row.type}
                          </span>
                        </td>

                        <td>
                          <strong>
                            {row.station}
                          </strong>
                        </td>

                        <td>
                          {row.primary}
                        </td>

                        <td>
                          {row.secondary}
                        </td>

                        <td>
                          <span
                            className={`reports-status reports-status-${row.statusKey}`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>

          {reportRows.length > 150 && (
            <div className="reports-table-note">
              Showing the first 150
              records. Export the CSV to
              view all{" "}
              {reportRows.length} records.
            </div>
          )}
        </section>
      </main>
    </DashboardLayout>
  );
}