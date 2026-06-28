import {
  useCallback,
  useEffect,
  useMemo,
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
import { supabase } from "../../lib/supabase";

import "./Weather.css";


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
  const risk = clamp(
    toNumber(riskValue),
    0,
    1
  );

  const percentage = Math.round(
    risk * 100
  );

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
        "Heavy weather may increase the chance of flooding.",
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
      "Current weather conditions show minimal flood risk.",
    className:
      "weather-risk-low",
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
        setWeatherRows([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErrorMessage("");

        const { data, error } =
          await supabase
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
              selectedStationId
            )
            .order("recorded_at", {
              ascending: false,
            })
            .limit(72);

        if (error) {
          throw error;
        }

        setWeatherRows(
          data ?? []
        );

        setLastUpdated(
          new Date().toISOString()
        );
      } catch (error) {
        console.error(
          "Weather loading error:",
          error
        );

        setErrorMessage(
          error.message ||
            "Unable to load weather data."
        );
      } finally {
        setLoading(false);
      }
    }, [selectedStationId]);


  useEffect(() => {
    loadStations();
  }, [loadStations]);


  useEffect(() => {
    if (!selectedStationId) {
      return undefined;
    }

    loadWeather();

    const interval =
      window.setInterval(
        loadWeather,
        60000
      );

    return () =>
      window.clearInterval(interval);
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


  const riskDetails =
    getRiskDetails(
      latestWeather?.flood_risk
    );


  const temperature = toNumber(
    latestWeather?.temperature
  );

  const precipitation = toNumber(
    latestWeather?.precipitation
  );

  const rainOneHour = toNumber(
    latestWeather?.rain_1h
  );

  const rainSixHours = toNumber(
    latestWeather?.rain_6h
  );

  const windSpeed = toNumber(
    latestWeather?.wind_speed
  );


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
            row.temperature
          ),

          rainfall: toNumber(
            row.rain_1h ??
              row.precipitation
          ),

          windSpeed: toNumber(
            row.wind_speed
          ),

          floodRisk:
            Math.round(
              clamp(
                toNumber(
                  row.flood_risk
                ),
                0,
                1
              ) * 100
            ),
        })),
    [weatherRows]
  );


  const summary = useMemo(() => {
    if (weatherRows.length === 0) {
      return {
        highestTemperature: 0,
        totalRainfall: 0,
        highestWind: 0,
        highestRisk: 0,
      };
    }

    const temperatures =
      weatherRows.map((row) =>
        toNumber(
          row.temperature
        )
      );

    const rainValues =
      weatherRows.map((row) =>
        toNumber(
          row.rain_1h ??
            row.precipitation
        )
      );

    const windValues =
      weatherRows.map((row) =>
        toNumber(
          row.wind_speed
        )
      );

    const riskValues =
      weatherRows.map((row) =>
        clamp(
          toNumber(
            row.flood_risk
          ),
          0,
          1
        )
      );

    return {
      highestTemperature:
        Math.max(
          ...temperatures
        ),

      totalRainfall:
        rainValues.reduce(
          (total, value) =>
            total + value,
          0
        ),

      highestWind:
        Math.max(
          ...windValues
        ),

      highestRisk:
        Math.round(
          Math.max(
            ...riskValues
          ) * 100
        ),
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
              onChange={(event) =>
                setSelectedStationId(
                  event.target.value
                )
              }
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
          </div>

          <div className="weather-toolbar-actions">
            <span>
              Updated:{" "}
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
              {latestWeather
                ? temperature.toFixed(
                    1
                  )
                : "--"}
              °C
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
                {latestWeather
                  ? temperature.toFixed(
                      1
                    )
                  : "--"}
                °C
              </strong>

              <small>
                Highest:{" "}
                {summary.highestTemperature.toFixed(
                  1
                )}
                °C
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
                {rainOneHour.toFixed(
                  1
                )}{" "}
                mm
              </strong>

              <small>
                Precipitation:{" "}
                {precipitation.toFixed(
                  1
                )}{" "}
                mm
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
                {rainSixHours.toFixed(
                  1
                )}{" "}
                mm
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
                {windSpeed.toFixed(
                  1
                )}{" "}
                km/h
              </strong>

              <small>
                Highest:{" "}
                {summary.highestWind.toFixed(
                  1
                )}{" "}
                km/h
              </small>
            </div>
          </article>
        </section>

        <section
          className={`weather-risk-card ${riskDetails.className}`}
        >
          <div className="weather-risk-icon">
            <Gauge size={31} />
          </div>

          <div>
            <span className="weather-eyebrow">
              Weather flood risk
            </span>

            <h3>
              {riskDetails.label} Risk
            </h3>

            <p>
              {
                riskDetails.description
              }
            </p>
          </div>

          <div className="weather-risk-percentage">
            <strong>
              {
                riskDetails.percentage
              }
              %
            </strong>

            <span>
              Current risk score
            </span>
          </div>
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
                Total rainfall:{" "}
                {summary.totalRainfall.toFixed(
                  1
                )}{" "}
                mm
              </span>

              <span>
                Highest risk:{" "}
                {summary.highestRisk}%
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
                                row.temperature
                              ).toFixed(
                                1
                              )}
                              °C
                            </strong>
                          </td>

                          <td>
                            {toNumber(
                              row.rain_1h
                            ).toFixed(
                              1
                            )}{" "}
                            mm
                          </td>

                          <td>
                            {toNumber(
                              row.rain_6h
                            ).toFixed(
                              1
                            )}{" "}
                            mm
                          </td>

                          <td>
                            {toNumber(
                              row.wind_speed
                            ).toFixed(
                              1
                            )}{" "}
                            km/h
                          </td>

                          <td>
                            <span
                              className={`weather-risk-badge ${rowRisk.className}`}
                            >
                              {
                                rowRisk.percentage
                              }
                              %
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