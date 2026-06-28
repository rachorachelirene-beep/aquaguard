import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  BrainCircuit,
  CloudRain,
  Droplets,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Waves,
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

import "./Prediction.css";


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

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}


function getRiskDetails(riskPercent) {
  if (riskPercent >= 80) {
    return {
      key: "critical",
      label: "Critical Risk",
      description:
        "Immediate flooding is highly possible.",
      className: "prediction-risk-critical",
      icon: TriangleAlert,
    };
  }

  if (riskPercent >= 55) {
    return {
      key: "high",
      label: "High Risk",
      description:
        "Flooding may occur if conditions continue.",
      className: "prediction-risk-high",
      icon: TriangleAlert,
    };
  }

  if (riskPercent >= 30) {
    return {
      key: "moderate",
      label: "Moderate Risk",
      description:
        "Monitor water and weather conditions.",
      className: "prediction-risk-moderate",
      icon: Activity,
    };
  }

  return {
    key: "low",
    label: "Low Risk",
    description:
      "Current conditions remain within a safe range.",
    className: "prediction-risk-low",
    icon: ShieldCheck,
  };
}


function calculateTrend(readings) {
  if (readings.length < 2) {
    return 0;
  }

  const newest = readings[0];
  const oldest =
    readings[
      Math.min(
        readings.length - 1,
        9
      )
    ];

  const newestLevel = toNumber(
    newest.level_m
  );

  const oldestLevel = toNumber(
    oldest.level_m
  );

  const newestTime = new Date(
    newest.recorded_at
  ).getTime();

  const oldestTime = new Date(
    oldest.recorded_at
  ).getTime();

  const elapsedHours =
    Math.abs(newestTime - oldestTime) /
    3600000;

  if (
    !Number.isFinite(elapsedHours) ||
    elapsedHours <= 0
  ) {
    return 0;
  }

  return clamp(
    (newestLevel - oldestLevel) /
      elapsedHours,
    -1,
    1
  );
}


function calculatePrediction({
  currentLevel,
  trendPerHour,
  horizonHours,
  criticalLevel,
  warningLevel,
  rainfall,
  weatherRisk,
  yoloRisk,
}) {
  const rainfallIncrease =
    rainfall > 0
      ? rainfall *
        0.003 *
        horizonHours
      : 0;

  const predictedLevel = clamp(
    currentLevel +
      trendPerHour *
        horizonHours +
      rainfallIncrease,
    0,
    Math.max(
      criticalLevel + 1,
      4
    )
  );

  const levelRisk =
    criticalLevel > 0
      ? clamp(
          predictedLevel /
            criticalLevel,
          0,
          1
        )
      : 0;

  const trendRisk =
    trendPerHour > 0
      ? clamp(
          trendPerHour / 0.5,
          0,
          1
        )
      : 0;

  const combinedRisk =
    levelRisk * 0.45 +
    weatherRisk * 0.2 +
    yoloRisk * 0.25 +
    trendRisk * 0.1;

  const horizonAdjustment =
    horizonHours * 0.012;

  const riskPercent = Math.round(
    clamp(
      combinedRisk +
        horizonAdjustment,
      0,
      1
    ) * 100
  );

  let predictedStatus = "Normal";

  if (
    predictedLevel >= criticalLevel
  ) {
    predictedStatus = "Critical";
  } else if (
    predictedLevel >= warningLevel
  ) {
    predictedStatus = "Warning";
  }

  return {
    horizonHours,
    predictedLevel,
    riskPercent,
    predictedStatus,
  };
}


export default function Prediction() {
  const [stations, setStations] =
    useState([]);

  const [
    selectedStationId,
    setSelectedStationId,
  ] = useState("");

  const [readings, setReadings] =
    useState([]);

  const [weather, setWeather] =
    useState(null);

  const [yolo, setYolo] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [
    lastUpdated,
    setLastUpdated,
  ] = useState(null);


  const selectedStation = useMemo(
    () =>
      stations.find(
        (station) =>
          String(station.id) ===
          String(selectedStationId)
      ) ?? null,
    [stations, selectedStationId]
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

      const rows = data ?? [];

      setStations(rows);

      setSelectedStationId(
        (currentValue) => {
          if (
            currentValue &&
            rows.some(
              (station) =>
                String(
                  station.id
                ) ===
                String(
                  currentValue
                )
            )
          ) {
            return currentValue;
          }

          return rows[0]?.id
            ? String(rows[0].id)
            : "";
        }
      );
    }, []);


  const loadPredictionData =
    useCallback(async () => {
      if (!selectedStationId) {
        return;
      }

      try {
        setLoading(true);
        setErrorMessage("");

        const [
          readingsResult,
          weatherResult,
          yoloResult,
        ] = await Promise.all([
          supabase
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
            .limit(50),

          supabase
            .from(
              "weather_readings"
            )
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
            .eq(
              "station_id",
              selectedStationId
            )
            .order("recorded_at", {
              ascending: false,
            })
            .limit(1)
            .maybeSingle(),

          supabase
            .from(
              "yolo_detections"
            )
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
            .eq(
              "station_id",
              selectedStationId
            )
            .order("detected_at", {
              ascending: false,
            })
            .limit(1)
            .maybeSingle(),
        ]);

        const firstError = [
          readingsResult.error,
          weatherResult.error,
          yoloResult.error,
        ].find(Boolean);

        if (firstError) {
          throw firstError;
        }

        setReadings(
          readingsResult.data ?? []
        );

        setWeather(
          weatherResult.data ?? null
        );

        setYolo(
          yoloResult.data ?? null
        );

        setLastUpdated(
          new Date().toISOString()
        );
      } catch (error) {
        console.error(
          "Prediction loading error:",
          error
        );

        setErrorMessage(
          error.message ||
            "Unable to load prediction data."
        );
      } finally {
        setLoading(false);
      }
    }, [selectedStationId]);


  useEffect(() => {
    async function initialize() {
      try {
        setLoading(true);
        setErrorMessage("");

        await loadStations();
      } catch (error) {
        console.error(
          "Station loading error:",
          error
        );

        setErrorMessage(
          error.message ||
            "Unable to load stations."
        );

        setLoading(false);
      }
    }

    initialize();
  }, [loadStations]);


  useEffect(() => {
    if (!selectedStationId) {
      return undefined;
    }

    loadPredictionData();

    const interval =
      window.setInterval(
        loadPredictionData,
        30000
      );

    return () =>
      window.clearInterval(interval);
  }, [
    selectedStationId,
    loadPredictionData,
  ]);


  const currentLevel = toNumber(
    readings[0]?.level_m ??
      yolo?.level_m
  );

  const rainfall = toNumber(
    weather?.rain_1h ??
      readings[0]?.rainfall_mm
  );

  const warningLevel = toNumber(
    selectedStation?.warning_level,
    2
  );

  const criticalLevel = toNumber(
    selectedStation?.critical_level,
    2.5
  );

  const normalLevel = toNumber(
    selectedStation?.normal_level,
    1
  );

  const trendPerHour = useMemo(
    () =>
      calculateTrend(readings),
    [readings]
  );

  const weatherRisk = clamp(
    toNumber(
      weather?.flood_risk
    ),
    0,
    1
  );

  const yoloRisk = clamp(
    toNumber(
      yolo?.flood_risk
    ),
    0,
    1
  );


  const predictions = useMemo(
    () =>
      [0, 1, 3, 6].map(
        (horizonHours) =>
          calculatePrediction({
            currentLevel,
            trendPerHour,
            horizonHours,
            criticalLevel,
            warningLevel,
            rainfall,
            weatherRisk,
            yoloRisk,
          })
      ),
    [
      currentLevel,
      trendPerHour,
      criticalLevel,
      warningLevel,
      rainfall,
      weatherRisk,
      yoloRisk,
    ]
  );


  const currentPrediction =
    predictions[0];

  const currentRisk =
    getRiskDetails(
      currentPrediction
        ?.riskPercent ?? 0
    );

  const RiskIcon = currentRisk.icon;


  const chartData = useMemo(() => {
    const historicalRows = [
      ...readings,
    ]
      .reverse()
      .slice(-20)
      .map((reading) => ({
        name: formatChartTime(
          reading.recorded_at
        ),
        level: toNumber(
          reading.level_m
        ),
        type: "Historical",
      }));

    const predictionRows =
      predictions
        .filter(
          (prediction) =>
            prediction.horizonHours > 0
        )
        .map((prediction) => ({
          name: `+${prediction.horizonHours}h`,
          level:
            prediction.predictedLevel,
          type: "Prediction",
        }));

    return [
      ...historicalRows,
      ...predictionRows,
    ];
  }, [readings, predictions]);


  const trendDirection =
    trendPerHour > 0.01
      ? "rising"
      : trendPerHour < -0.01
      ? "falling"
      : "stable";


  return (
    <DashboardLayout
      title="Flood Prediction"
      description="AI-assisted flood risk and water-level forecasting"
    >
      <main className="prediction-page">
        {errorMessage && (
          <div className="prediction-error">
            <TriangleAlert size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        <section className="prediction-toolbar">
          <div>
            <span className="prediction-eyebrow">
              Monitoring station
            </span>

            <select
              value={selectedStationId}
              onChange={(event) =>
                setSelectedStationId(
                  event.target.value
                )
              }
            >
              {stations.length === 0 && (
                <option value="">
                  No stations available
                </option>
              )}

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
          </div>

          <div className="prediction-location">
            <strong>
              {selectedStation?.name ??
                "No station"}
            </strong>

            <span>
              {selectedStation?.location ??
                "Location unavailable"}
            </span>
          </div>

          <div className="prediction-toolbar-actions">
            <span>
              Updated:{" "}
              {formatDateTime(
                lastUpdated
              )}
            </span>

            <button
              type="button"
              onClick={
                loadPredictionData
              }
              disabled={loading}
            >
              <RefreshCw
                size={16}
                className={
                  loading
                    ? "prediction-spin"
                    : ""
                }
              />

              {loading
                ? "Loading..."
                : "Refresh"}
            </button>
          </div>
        </section>

        <section
          className={`prediction-main-risk ${currentRisk.className}`}
        >
          <div className="prediction-risk-icon">
            <RiskIcon size={34} />
          </div>

          <div>
            <span className="prediction-eyebrow">
              Current flood prediction
            </span>

            <h2>
              {currentRisk.label}
            </h2>

            <p>
              {currentRisk.description}
            </p>
          </div>

          <div className="prediction-risk-score">
            <strong>
              {currentPrediction
                ?.riskPercent ?? 0}
              %
            </strong>

            <span>Flood risk score</span>
          </div>
        </section>

        <section className="prediction-stat-grid">
          <article className="prediction-stat-card">
            <div className="prediction-stat-icon">
              <Waves size={21} />
            </div>

            <div>
              <span>
                Current water level
              </span>

              <strong>
                {currentLevel.toFixed(2)} m
              </strong>

              <small>
                Critical at{" "}
                {criticalLevel.toFixed(
                  2
                )}{" "}
                m
              </small>
            </div>
          </article>

          <article className="prediction-stat-card">
            <div className="prediction-stat-icon">
              {trendDirection ===
              "rising" ? (
                <TrendingUp size={21} />
              ) : trendDirection ===
                "falling" ? (
                <TrendingDown
                  size={21}
                />
              ) : (
                <Activity size={21} />
              )}
            </div>

            <div>
              <span>Water trend</span>

              <strong>
                {trendDirection}
              </strong>

              <small>
                {trendPerHour >= 0
                  ? "+"
                  : ""}
                {trendPerHour.toFixed(
                  3
                )}{" "}
                m/hour
              </small>
            </div>
          </article>

          <article className="prediction-stat-card">
            <div className="prediction-stat-icon">
              <CloudRain size={21} />
            </div>

            <div>
              <span>Rainfall</span>

              <strong>
                {rainfall.toFixed(1)} mm
              </strong>

              <small>
                {weather?.condition_text ??
                  "No weather data"}
              </small>
            </div>
          </article>

          <article className="prediction-stat-card">
            <div className="prediction-stat-icon">
              <BrainCircuit size={21} />
            </div>

            <div>
              <span>
                YOLO detection risk
              </span>

              <strong>
                {Math.round(
                  yoloRisk * 100
                )}
                %
              </strong>

              <small>
                Confidence{" "}
                {Math.round(
                  toNumber(
                    yolo?.confidence
                  ) * 100
                )}
                %
              </small>
            </div>
          </article>
        </section>

        <section className="prediction-horizon-grid">
          {predictions.map(
            (prediction) => {
              const risk =
                getRiskDetails(
                  prediction.riskPercent
                );

              return (
                <article
                  key={
                    prediction.horizonHours
                  }
                  className={`prediction-horizon-card ${risk.className}`}
                >
                  <header>
                    <span>
                      {prediction.horizonHours ===
                      0
                        ? "Now"
                        : `+${prediction.horizonHours} Hour${
                            prediction.horizonHours ===
                            1
                              ? ""
                              : "s"
                          }`}
                    </span>

                    <strong>
                      {
                        prediction.riskPercent
                      }
                      %
                    </strong>
                  </header>

                  <div className="prediction-level-value">
                    <Droplets size={19} />

                    <strong>
                      {prediction.predictedLevel.toFixed(
                        2
                      )}{" "}
                      m
                    </strong>
                  </div>

                  <footer>
                    <span>
                      Predicted status
                    </span>

                    <b>
                      {
                        prediction.predictedStatus
                      }
                    </b>
                  </footer>
                </article>
              );
            }
          )}
        </section>

        <section className="prediction-chart-card">
          <header className="prediction-section-header">
            <div>
              <span className="prediction-eyebrow">
                Water-level forecast
              </span>

              <h3>
                Historical and predicted
                levels
              </h3>
            </div>

            <div className="prediction-thresholds">
              <span>
                Normal{" "}
                {normalLevel.toFixed(2)}
                m
              </span>

              <span>
                Warning{" "}
                {warningLevel.toFixed(2)}
                m
              </span>

              <span>
                Critical{" "}
                {criticalLevel.toFixed(
                  2
                )}
                m
              </span>
            </div>
          </header>

          <div className="prediction-chart">
            {chartData.length === 0 ? (
              <div className="prediction-empty">
                <Waves size={36} />

                <strong>
                  No prediction data
                </strong>

                <span>
                  Run the detector to
                  record water-level data.
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
                    right: 25,
                    left: 0,
                    bottom: 5,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="predictionGradient"
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
                    dataKey="name"
                    minTickGap={20}
                    tick={{
                      fontSize: 11,
                    }}
                  />

                  <YAxis
                    domain={[
                      0,
                      Math.max(
                        3,
                        criticalLevel +
                          0.5
                      ),
                    ]}
                    tick={{
                      fontSize: 11,
                    }}
                    tickFormatter={(
                      value
                    ) => `${value}m`}
                  />

                  <Tooltip
                    formatter={(
                      value,
                      name,
                      entry
                    ) => [
                      `${toNumber(
                        value
                      ).toFixed(2)} m`,
                      entry.payload
                        .type,
                    ]}
                  />

                  <ReferenceLine
                    y={normalLevel}
                    stroke="#22c55e"
                    strokeDasharray="4 4"
                  />

                  <ReferenceLine
                    y={warningLevel}
                    stroke="#f97316"
                    strokeDasharray="4 4"
                  />

                  <ReferenceLine
                    y={criticalLevel}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                  />

                  <Area
                    type="monotone"
                    dataKey="level"
                    stroke="#2563eb"
                    strokeWidth={3}
                    fill="url(#predictionGradient)"
                    activeDot={{
                      r: 5,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="prediction-note">
          <BrainCircuit size={20} />

          <div>
            <strong>
              Prediction information
            </strong>

            <p>
              Forecasts are estimates
              based on recent water-level
              trends, rainfall, weather
              risk, and YOLO flood
              detection. Emergency
              decisions should still use
              verified field observations.
            </p>
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}