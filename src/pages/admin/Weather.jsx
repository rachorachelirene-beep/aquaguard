import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  Droplets,
  Gauge,
  RefreshCw,
  Sun,
  Thermometer,
  TriangleAlert,
  Wind,
} from "lucide-react";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { cameraAgentBaseUrl as cameraApiBaseUrl } from "../../lib/cameraAgent";
import { fetchJsonWithTimeout } from "../../lib/fetchJson";
import { supabase } from "../../lib/supabase";

import "./Weather.css";


const weatherStaleAfterMs = 30 * 60 * 1000;


function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

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


function formatMetric(value, decimalPlaces, unit) {
  const number = toNumber(value, null);

  return number == null
    ? "--"
    : `${number.toFixed(decimalPlaces)}${unit}`;
}


function isStaleReading(value) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();

  return (
    Number.isFinite(timestamp) &&
    Date.now() - timestamp > weatherStaleAfterMs
  );
}


function isCoordinateInRange(
  value,
  minimum,
  maximum
) {
  if (value == null || value === "") {
    return false;
  }

  const coordinate = Number(value);

  return (
    Number.isFinite(coordinate) &&
    coordinate >= minimum &&
    coordinate <= maximum
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


function getWeatherDetails(
  weatherCode,
  conditionText
) {
  const code = toNumber(
    weatherCode,
    -1
  );

  const condition =
    conditionText
      ?.trim()
      .toLowerCase() ?? "";

  if (code < 0 && !condition) {
    return {
      icon: Cloud,
      label: "Condition unavailable",
      className: "weather-condition-cloudy",
    };
  }

  if (
    code >= 95 ||
    condition.includes("thunder") ||
    condition.includes("storm")
  ) {
    return {
      icon: CloudLightning,
      label:
        conditionText ||
        "Thunderstorm",
      className:
        "weather-condition-storm",
    };
  }

  if (
    (code >= 51 && code <= 82) ||
    condition.includes("rain") ||
    condition.includes("drizzle") ||
    condition.includes("shower")
  ) {
    return {
      icon: CloudRain,
      label:
        conditionText ||
        "Rainy",
      className:
        "weather-condition-rain",
    };
  }

  if (
    (code >= 45 && code <= 48) ||
    condition.includes("fog") ||
    condition.includes("mist")
  ) {
    return {
      icon: CloudFog,
      label:
        conditionText ||
        "Foggy",
      className:
        "weather-condition-fog",
    };
  }

  if (
    code >= 1 &&
    code <= 3
  ) {
    return {
      icon: Cloud,
      label:
        conditionText ||
        "Cloudy",
      className:
        "weather-condition-cloudy",
    };
  }

  return {
    icon: Sun,
    label:
      conditionText ||
      "Clear",
    className:
      "weather-condition-clear",
  };
}


function getRiskDetails(riskValue) {
  const numericRisk = toNumber(riskValue, null);

  if (numericRisk == null) {
    return {
      percentage: null,
      label: "Not assessed",
      description: "No weather-risk assessment is stored for this reading.",
      className: "weather-risk-low",
      isNeutral: true,
    };
  }

  const risk = clamp(
    numericRisk,
    0,
    1
  );

  const percentage = Math.round(
    risk * 100
  );

  if (percentage === 0) {
    return {
      percentage,
      label: "Not assessed",
      description:
        "A combined weather and YOLO flood-risk model has not been configured.",
      className:
        "weather-risk-low",
      isNeutral: true,
    };
  }

  if (percentage >= 75) {
    return {
      percentage,
      label: "Critical",
      description:
        "Weather conditions present a serious flood risk.",
      className:
        "weather-risk-critical",
    };
  }

  if (percentage >= 50) {
    return {
      percentage,
      label: "High",
      description:
        "The stored weather-risk input is elevated and needs monitoring.",
      className:
        "weather-risk-high",
    };
  }

  if (percentage >= 25) {
    return {
      percentage,
      label: "Moderate",
      description:
        "Continue monitoring rainfall and water levels.",
      className:
        "weather-risk-moderate",
    };
  }

  return {
    percentage,
    label: "Low",
    description:
      "The stored weather-risk input is in its lowest assessed band.",
    className:
      "weather-risk-low",
  };
}


function getCombinedRiskDetails(risk) {
  const score = toNumber(risk?.score, null);

  if (
    !risk?.assessed ||
    !Number.isFinite(score)
  ) {
    return {
      score: null,
      label: "Not assessed",
      description:
        risk?.primary_reason ||
        "Insufficient monitoring data.",
      className: "weather-risk-neutral",
      isNeutral: true,
    };
  }

  const classNames = {
    normal: "weather-risk-low",
    moderate: "weather-risk-moderate",
    high: "weather-risk-high",
    critical: "weather-risk-critical",
  };

  return {
    score: clamp(score, 0, 100),
    label: risk.label || "Assessed",
    description:
      risk.primary_reason ||
      "Combined monitoring inputs were assessed.",
    className:
      classNames[risk.level] ||
      "weather-risk-low",
    isNeutral: false,
  };
}


export default function Weather() {
  const [stations, setStations] =
    useState([]);

  const [
    selectedStationId,
    setSelectedStationId,
  ] = useState("");

  const [weatherRows, setWeatherRows] =
    useState([]);

  const [combinedRisk, setCombinedRisk] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [
    lastUpdated,
    setLastUpdated,
  ] = useState(null);
  const riskWarningShownRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const inFlightStationRef = useRef("");


  const selectedStation = useMemo(
    () =>
      stations.find(
        (station) =>
          String(station.id) ===
          String(selectedStationId)
      ) ?? null,
    [stations, selectedStationId]
  );


  const stationHasCoordinates =
    isCoordinateInRange(
      selectedStation?.latitude,
      -90,
      90
    ) &&
    isCoordinateInRange(
      selectedStation?.longitude,
      -180,
      180
    );


  const latestWeather =
    weatherRows[0] ?? null;


  const loadStations =
    useCallback(async () => {
      try {
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
                "latitude",
                "longitude",
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
            const stillExists =
              rows.some(
                (station) =>
                  String(
                    station.id
                  ) ===
                  String(
                    currentValue
                  )
              );

            if (
              currentValue &&
              stillExists
            ) {
              return currentValue;
            }

            return rows[0]?.id
              ? String(rows[0].id)
              : "";
          }
        );

        if (rows.length === 0) {
          setLoading(false);
        }
      } catch (error) {
        console.error(
          "Weather station error:",
          error
        );

        setErrorMessage(
          error.message ||
            "Unable to load monitoring stations."
        );

        setLoading(false);
      }
    }, []);


  const loadWeather =
    useCallback(async () => {
      if (!selectedStationId) {
        requestSequenceRef.current += 1;
        setWeatherRows([]);
        setCombinedRisk(null);
        setLoading(false);
        return;
      }

      const stationId = selectedStationId;

      if (inFlightStationRef.current === stationId) {
        return;
      }

      inFlightStationRef.current = stationId;
      const requestId = ++requestSequenceRef.current;

      try {
        setLoading(true);
        setErrorMessage("");

        const weatherPromise =
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
                "weather_code",
                "condition_text",
                "flood_risk",
                "recorded_at",
              ].join(",")
            )
            .eq(
              "station_id",
              stationId
            )
            .order("recorded_at", {
              ascending: false,
            })
            .limit(72);

        const riskPromise = fetchJsonWithTimeout(
          `${cameraApiBaseUrl}/flood_risk?station_id=${encodeURIComponent(
            stationId
          )}`
        )
          .then((payload) => {
            riskWarningShownRef.current = false;
            return payload;
          })
          .catch((error) => {
            if (!riskWarningShownRef.current) {
              console.warn(
                "Combined risk unavailable:",
                error
              );
              riskWarningShownRef.current = true;
            }
            return null;
          });

        const [
          { data, error },
          riskPayload,
        ] = await Promise.all([
          weatherPromise,
          riskPromise,
        ]);

        if (error) {
          throw error;
        }

        if (requestId !== requestSequenceRef.current) {
          return;
        }

        setWeatherRows(
          data ?? []
        );

        setCombinedRisk(
          riskPayload?.combined_risk ??
            null
        );

        setLastUpdated(
          new Date().toISOString()
        );
      } catch (error) {
        if (requestId === requestSequenceRef.current) {
          console.error(
            "Weather loading error:",
            error
          );

          setErrorMessage(
            error.message ||
              "Unable to load weather data."
          );
        }
      } finally {
        if (inFlightStationRef.current === stationId) {
          inFlightStationRef.current = "";
        }

        if (requestId === requestSequenceRef.current) {
          setLoading(false);
        }
      }
    }, [selectedStationId]);


  useEffect(() => {
    const initialLoad =
      window.setTimeout(
        loadStations,
        0
      );

    return () =>
      window.clearTimeout(
        initialLoad
      );
  }, [loadStations]);


  useEffect(() => {
    if (!selectedStationId) {
      return undefined;
    }

    const initialLoad =
      window.setTimeout(
        loadWeather,
        0
      );

    const interval =
      window.setInterval(
        loadWeather,
        60000
      );

    return () => {
      requestSequenceRef.current += 1;
      window.clearTimeout(
        initialLoad
      );

      window.clearInterval(interval);
    };
  }, [
    selectedStationId,
    loadWeather,
  ]);


  const weatherDetails =
    getWeatherDetails(
      latestWeather?.weather_code,
      latestWeather?.condition_text
    );

  const WeatherIcon =
    weatherDetails.icon;


  const combinedRiskDetails =
    getCombinedRiskDetails(
      combinedRisk
    );

  const combinedRiskFactors =
    Array.isArray(
      combinedRisk?.factors
    )
      ? combinedRisk.factors.slice(
          0,
          6
        )
      : [];


  const temperature = toNumber(
    latestWeather?.temperature,
    null
  );

  const precipitation = toNumber(
    latestWeather?.precipitation,
    null
  );

  const rainOneHour = toNumber(
    latestWeather?.rain_1h,
    null
  );

  const rainSixHours = toNumber(
    latestWeather?.rain_6h,
    null
  );

  const windSpeed = toNumber(
    latestWeather?.wind_speed,
    null
  );
  const weatherIsStale = isStaleReading(latestWeather?.recorded_at);


  const chartData = useMemo(
    () =>
      [...weatherRows]
        .reverse()
        .map((row) => ({
          id: row.id,

          time: formatChartTime(
            row.recorded_at
          ),

          recordedAt:
            row.recorded_at,

          temperature: toNumber(
            row.temperature,
            null
          ),

          rainfall: toNumber(
            row.rain_1h ??
              row.precipitation,
            null
          ),

          windSpeed: toNumber(
            row.wind_speed,
            null
          ),

          floodRisk: toNumber(row.flood_risk, null),
        })),
    [weatherRows]
  );


  const summary = useMemo(() => {
    if (weatherRows.length === 0) {
      return {
        highestTemperature: null,
        highestWind: null,
        highestRisk: null,
      };
    }

    const temperatures =
      weatherRows
        .map((row) => toNumber(row.temperature, null))
        .filter((value) => value != null);

    const windValues =
      weatherRows
        .map((row) => toNumber(row.wind_speed, null))
        .filter((value) => value != null);

    const riskValues =
      weatherRows
        .map((row) => toNumber(row.flood_risk, null))
        .filter((value) => value != null)
        .map((value) => clamp(value, 0, 1));

    const assessedRiskValues =
      riskValues.filter(
        (value) => value > 0
      );

    return {
      highestTemperature:
        temperatures.length > 0 ? Math.max(...temperatures) : null,

      highestWind:
        windValues.length > 0 ? Math.max(...windValues) : null,

      highestRisk:
        assessedRiskValues.length > 0
          ? Math.round(
              Math.max(
                ...assessedRiskValues
              ) * 100
            )
          : null,
    };
  }, [weatherRows]);


  return (
    <DashboardLayout
      title="Weather Monitoring"
      description="Rainfall, temperature, wind and weather-related flood risk"
    >
      <main className="weather-page">
        {errorMessage && (
          <div className="weather-error">
            <TriangleAlert
              size={18}
            />

            <span>
              {errorMessage}
            </span>
          </div>
        )}

        <section className="weather-toolbar">
          <label>
            <span className="weather-eyebrow">
              Monitoring station
            </span>

            <select
              value={
                selectedStationId
              }
              onChange={(event) => {
                setCombinedRisk(null);
                setSelectedStationId(
                  event.target.value
                );
              }}
            >
              {stations.length ===
                0 && (
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
          </label>

          <div className="weather-station-info">
            <strong>
              {selectedStation?.name ??
                "No station selected"}
            </strong>

            <span>
              {selectedStation?.location ??
                "Location unavailable"}
            </span>

            {selectedStation &&
              !stationHasCoordinates && (
                <span className="weather-coordinate-note">
                  Add station coordinates to enable automatic weather updates.
                </span>
              )}

            <a
              className="weather-source-link"
              href="https://open-meteo.com/"
              target="_blank"
              rel="noreferrer"
            >
              Weather data by Open-Meteo.com
            </a>
          </div>

          <div className="weather-toolbar-actions">
            <span>
              Page refreshed:{" "}
              {formatDateTime(
                lastUpdated
              )}
            </span>

            <button
              type="button"
              onClick={loadWeather}
              disabled={loading}
            >
              <RefreshCw
                size={16}
                className={
                  loading
                    ? "weather-spin"
                    : ""
                }
              />

              {loading
                ? "Loading..."
                : "Refresh"}
            </button>
          </div>
        </section>

        {weatherIsStale && (
          <div className="weather-stale-notice" role="status">
            <TriangleAlert size={18} />
            <span>
              This weather reading is more than 30 minutes old. The values
              below are the latest saved data, not current conditions.
            </span>
          </div>
        )}

        <section
          className={`weather-current-card ${weatherDetails.className}`}
        >
          <div className="weather-current-icon">
            <WeatherIcon
              size={58}
            />
          </div>

          <div className="weather-current-info">
            <span className="weather-eyebrow">
              Current condition
            </span>

            <h2>
              {latestWeather
                ? weatherDetails.label
                : "No weather data"}
            </h2>

            <p>
              {selectedStation?.location ??
                "Monitoring station"}
            </p>

            <small>
              Last reading:{" "}
              {formatDateTime(
                latestWeather
                  ?.recorded_at
              )}
            </small>
          </div>

          <div className="weather-current-temperature">
            <strong>
              {formatMetric(temperature, 1, " °C")}
            </strong>

            <span>Temperature</span>
          </div>
        </section>

        <section className="weather-stat-grid">
          <article className="weather-stat-card">
            <div className="weather-stat-icon">
              <Thermometer
                size={21}
              />
            </div>

            <div>
              <span>Temperature</span>

              <strong>
                {formatMetric(temperature, 1, " °C")}
              </strong>

              <small>
                Highest:{" "}
                {formatMetric(summary.highestTemperature, 1, " °C")}
              </small>
            </div>
          </article>

          <article className="weather-stat-card">
            <div className="weather-stat-icon">
              <Droplets size={21} />
            </div>

            <div>
              <span>
                Rainfall 1 hour
              </span>

              <strong>
                {formatMetric(rainOneHour, 1, " mm")}
              </strong>

              <small>
                Precipitation:{" "}
                {formatMetric(precipitation, 1, " mm")}
              </small>
            </div>
          </article>

          <article className="weather-stat-card">
            <div className="weather-stat-icon">
              <CloudRain size={21} />
            </div>

            <div>
              <span>
                Rainfall 6 hours
              </span>

              <strong>
                {formatMetric(rainSixHours, 1, " mm")}
              </strong>

              <small>
                Recorded rainfall
              </small>
            </div>
          </article>

          <article className="weather-stat-card">
            <div className="weather-stat-icon">
              <Wind size={21} />
            </div>

            <div>
              <span>Wind speed</span>

              <strong>
                {formatMetric(windSpeed, 1, " km/h")}
              </strong>

              <small>
                Highest:{" "}
                {formatMetric(summary.highestWind, 1, " km/h")}
              </small>
            </div>
          </article>
        </section>

        <section
          className={`weather-risk-card ${combinedRiskDetails.className}`}
        >
          <div className="weather-risk-icon">
            <Gauge size={31} />
          </div>

          <div>
            <span className="weather-eyebrow">
              AquaGuard flood risk
            </span>

            <h3>
              {combinedRiskDetails.label}
            </h3>

            <p>
              {
                combinedRiskDetails.description
              }
            </p>
          </div>

          <div className="weather-risk-percentage">
            <strong>
              {combinedRiskDetails.isNeutral
                ? "--"
                : `${Math.round(
                    combinedRiskDetails.score
                  )}/100`}
            </strong>

            <span>
              {combinedRiskDetails.isNeutral
                ? "Insufficient monitoring data"
                : "Rule-based assessment score"}
            </span>
          </div>

          {combinedRiskFactors.length > 0 && (
            <div className="weather-risk-factors">
              <strong>
                Contributing factors
              </strong>

              <div>
                {combinedRiskFactors.map(
                  (factor) => (
                    <span key={factor.name}>
                      <b>{factor.name}</b>
                      <em>
                        {factor.value}
                      </em>
                    </span>
                  )
                )}
              </div>
            </div>
          )}

          <small className="weather-risk-method">
            AquaGuard rule-based flood-risk heuristic · monitoring indicator,
            not a scientifically validated prediction model
          </small>
        </section>

        <section className="weather-chart-card">
          <header className="weather-section-header">
            <div>
              <span className="weather-eyebrow">
                Weather history
              </span>

              <h3>
                Temperature and rainfall
              </h3>
            </div>

            <div className="weather-chart-summary">
              <span>
                Latest 6H rainfall:{" "}
                {formatMetric(rainSixHours, 1, " mm")}
              </span>

              <span>
                Highest risk:{" "}
                {summary.highestRisk == null
                  ? "--"
                  : `${summary.highestRisk}%`}
              </span>
            </div>
          </header>

          <div className="weather-chart">
            {loading ? (
              <div className="weather-empty">
                <RefreshCw
                  size={28}
                  className="weather-spin"
                />

                <strong>
                  Loading weather...
                </strong>
              </div>
            ) : chartData.length ===
              0 ? (
              <div className="weather-empty">
                <CloudRain
                  size={38}
                />

                <strong>
                  No weather readings
                </strong>

                <span>
                  Weather data has not
                  been recorded for this
                  station.
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
                    minTickGap={25}
                    tick={{
                      fontSize: 11,
                    }}
                  />

                  <YAxis
                    yAxisId="temperature"
                    orientation="left"
                    tick={{
                      fontSize: 11,
                    }}
                    tickFormatter={(
                      value
                    ) => `${value}°`}
                  />

                  <YAxis
                    yAxisId="rainfall"
                    orientation="right"
                    tick={{
                      fontSize: 11,
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
                        "Temperature"
                      ) {
                        return [
                          `${toNumber(
                            value
                          ).toFixed(
                            1
                          )} °C`,
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
                    yAxisId="temperature"
                    type="monotone"
                    dataKey="temperature"
                    name="Temperature"
                    stroke="#f97316"
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

        <section className="weather-table-card">
          <header className="weather-section-header">
            <div>
              <span className="weather-eyebrow">
                Recorded conditions
              </span>

              <h3>
                Recent weather readings
              </h3>
            </div>

            <span className="weather-record-count">
              {weatherRows.length} records
            </span>
          </header>

          <div className="weather-table-wrapper">
            <table className="weather-table">
              <thead>
                <tr>
                  <th>Date and time</th>
                  <th>Condition</th>
                  <th>Temperature</th>
                  <th>Rain 1h</th>
                  <th>Rain 6h</th>
                  <th>Wind</th>
                  <th>Flood risk</th>
                </tr>
              </thead>

              <tbody>
                {weatherRows.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan="7"
                      className="weather-table-empty"
                    >
                      No weather records
                      found.
                    </td>
                  </tr>
                ) : (
                  weatherRows
                    .slice(0, 30)
                    .map((row) => {
                      const rowWeather =
                        getWeatherDetails(
                          row.weather_code,
                          row.condition_text
                        );

                      const RowIcon =
                        rowWeather.icon;

                      const rowRisk =
                        getRiskDetails(
                          row.flood_risk
                        );

                      return (
                        <tr key={row.id}>
                          <td>
                            {formatDateTime(
                              row.recorded_at
                            )}
                          </td>

                          <td>
                            <span className="weather-table-condition">
                              <RowIcon
                                size={16}
                              />

                              {
                                rowWeather.label
                              }
                            </span>
                          </td>

                          <td>
                            <strong>
                              {toNumber(
                                row.temperature,
                                null
                              ) == null
                                ? "--"
                                : formatMetric(row.temperature, 1, " °C")}
                            </strong>
                          </td>

                          <td>
                            {formatMetric(row.rain_1h, 1, " mm")}
                          </td>

                          <td>
                            {formatMetric(row.rain_6h, 1, " mm")}
                          </td>

                          <td>
                            {formatMetric(row.wind_speed, 1, " km/h")}
                          </td>

                          <td>
                            <span
                              className={`weather-risk-badge ${rowRisk.className}`}
                            >
                              {rowRisk.isNeutral
                                ? "Not assessed"
                                : `${rowRisk.percentage}%`}
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
