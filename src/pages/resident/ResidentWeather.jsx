import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  Droplets,
  RefreshCw,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";
import {
  formatDateTime,
  formatMeasurement,
  getAgeMinutes,
  toNullableNumber,
} from "./residentUtils";

import "../admin/Weather.css";

function getWeatherAppearance(weatherCode, conditionText) {
  const code = toNullableNumber(weatherCode);
  const condition = String(conditionText ?? "").toLowerCase();

  if (
    (code != null && code >= 95) ||
    condition.includes("thunder") ||
    condition.includes("storm")
  ) {
    return { icon: CloudLightning, className: "weather-condition-storm" };
  }

  if (
    (code != null && code >= 51 && code <= 82) ||
    condition.includes("rain") ||
    condition.includes("drizzle") ||
    condition.includes("shower")
  ) {
    return { icon: CloudRain, className: "weather-condition-rain" };
  }

  if (
    (code != null && code >= 45 && code <= 48) ||
    condition.includes("fog") ||
    condition.includes("mist")
  ) {
    return { icon: CloudFog, className: "weather-condition-fog" };
  }

  if ((code != null && code >= 1 && code <= 3) || condition.includes("cloud")) {
    return { icon: Cloud, className: "weather-condition-cloudy" };
  }

  return { icon: Sun, className: "weather-condition-clear" };
}

export default function ResidentWeather() {
  const [stations, setStations] = useState([]);
  const [selectedStationId, setSelectedStationId] = useState("");
  const [weatherRows, setWeatherRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadStations = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("stations")
        .select("id, name, location, station_code, status")
        .order("name", { ascending: true });

      if (error) {
        throw error;
      }

      const rows = data ?? [];
      setStations(rows);
      setSelectedStationId((current) => {
        if (
          current &&
          rows.some((station) => String(station.id) === String(current))
        ) {
          return current;
        }

        return rows[0]?.id ? String(rows[0].id) : "";
      });

      if (rows.length === 0) {
        setLoading(false);
      }
    } catch (error) {
      console.error("Resident weather station loading error:", error);
      setErrorMessage(
        "Unable to load monitoring stations. Check your connection and try again."
      );
      setLoading(false);
    }
  }, []);

  const loadWeather = useCallback(async () => {
    if (!selectedStationId) {
      setWeatherRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("weather_readings")
        .select(
          "id, station_id, temperature, precipitation, rain_1h, rain_6h, wind_speed, weather_code, condition_text, recorded_at"
        )
        .eq("station_id", selectedStationId)
        .order("recorded_at", { ascending: false })
        .limit(12);

      if (error) {
        throw error;
      }

      setWeatherRows(data ?? []);
    } catch (error) {
      console.error("Resident weather loading error:", error);
      setErrorMessage(
        "Unable to load current weather information. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, [selectedStationId]);

  useEffect(() => {
    const timeout = window.setTimeout(loadStations, 0);
    return () => window.clearTimeout(timeout);
  }, [loadStations]);

  useEffect(() => {
    if (!selectedStationId) {
      return undefined;
    }

    const initialLoad = window.setTimeout(loadWeather, 0);
    const interval = window.setInterval(loadWeather, 300000);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadWeather, selectedStationId]);

  const selectedStation = useMemo(
    () =>
      stations.find(
        (station) => String(station.id) === String(selectedStationId)
      ) ?? null,
    [selectedStationId, stations]
  );
  const latestWeather =
    weatherRows.find(
      (weather) => String(weather.station_id) === String(selectedStationId)
    ) ?? null;
  const weatherAppearance = getWeatherAppearance(
    latestWeather?.weather_code,
    latestWeather?.condition_text
  );
  const WeatherIcon = weatherAppearance.icon;
  const readingAge = getAgeMinutes(latestWeather?.recorded_at);
  const isStale = readingAge != null && readingAge > 30;

  return (
    <DashboardLayout
      title="Weather"
      description="Current rain and weather conditions near AquaGuard stations."
    >
      <main className="weather-page resident-weather-page">
        <section className="weather-toolbar resident-weather-toolbar">
          <label>
            <span className="weather-eyebrow">Monitoring station</span>
            <select
              value={selectedStationId}
              onChange={(event) => setSelectedStationId(event.target.value)}
              disabled={stations.length === 0}
            >
              {stations.length === 0 && (
                <option value="">No stations available</option>
              )}
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          </label>

          <div className="weather-station-info">
            <span className="weather-eyebrow">Location</span>
            <strong>{selectedStation?.location ?? "Location unavailable"}</strong>
            <span>{selectedStation?.station_code ?? "No station code"}</span>
          </div>

          <div className="weather-toolbar-actions">
            <button type="button" onClick={loadWeather} disabled={loading}>
              <RefreshCw
                size={16}
                className={loading ? "weather-spin" : ""}
              />
              Refresh
            </button>
          </div>
        </section>

        {errorMessage && (
          <div className="weather-error">
            <span>{errorMessage}</span>
            <button
              className="btn-submit officer-icon-button"
              type="button"
              onClick={selectedStationId ? loadWeather : loadStations}
            >
              Try again
            </button>
          </div>
        )}

        {loading && !latestWeather ? (
          <section className="section-card dashboard-empty">
            Loading weather information...
          </section>
        ) : !errorMessage && !latestWeather ? (
          <section className="section-card dashboard-empty">
            No weather readings are available for this station.
          </section>
        ) : latestWeather ? (
          <>
            {isStale && (
              <div className="resident-stale-notice">
                This weather reading may be out of date. Last updated{" "}
                {formatDateTime(latestWeather.recorded_at)}.
              </div>
            )}

            <section
              className={`weather-current-card ${weatherAppearance.className}`}
            >
              <div className="weather-current-icon">
                <WeatherIcon size={58} />
              </div>
              <div className="weather-current-info">
                <span className="weather-eyebrow">Current condition</span>
                <h2>{latestWeather.condition_text || "Condition unavailable"}</h2>
                <p>{selectedStation?.location ?? "Monitoring station"}</p>
                <small>
                  Last updated: {formatDateTime(latestWeather.recorded_at)}
                </small>
              </div>
              <div className="weather-current-temperature">
                <strong>
                  {formatMeasurement(latestWeather.temperature, "\u00b0C")}
                </strong>
                <span>Temperature</span>
              </div>
            </section>

            <section className="weather-stat-grid">
              <article className="weather-stat-card">
                <div className="weather-stat-icon">
                  <Thermometer size={21} />
                </div>
                <div>
                  <span>Temperature</span>
                  <strong>
                    {formatMeasurement(latestWeather.temperature, "\u00b0C")}
                  </strong>
                  <small>Current station reading</small>
                </div>
              </article>

              <article className="weather-stat-card">
                <div className="weather-stat-icon">
                  <Droplets size={21} />
                </div>
                <div>
                  <span>Rainfall 1 hour</span>
                  <strong>{formatMeasurement(latestWeather.rain_1h, "mm")}</strong>
                  <small>
                    Current precipitation:{" "}
                    {formatMeasurement(latestWeather.precipitation, "mm")}
                  </small>
                </div>
              </article>

              <article className="weather-stat-card">
                <div className="weather-stat-icon">
                  <CloudRain size={21} />
                </div>
                <div>
                  <span>Rainfall 6 hours</span>
                  <strong>{formatMeasurement(latestWeather.rain_6h, "mm")}</strong>
                  <small>Latest six-hour rainfall total</small>
                </div>
              </article>

              <article className="weather-stat-card">
                <div className="weather-stat-icon">
                  <Wind size={21} />
                </div>
                <div>
                  <span>Wind speed</span>
                  <strong>
                    {formatMeasurement(latestWeather.wind_speed, "km/h")}
                  </strong>
                  <small>Current station reading</small>
                </div>
              </article>
            </section>

            <section className="section-card resident-weather-source">
              <strong>Weather source</strong>
              <span>
                AquaGuard stores weather readings from Open-Meteo. This page
                reads the saved station data and does not request a new forecast
                from your browser.
              </span>
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                Open-Meteo
              </a>
            </section>
          </>
        ) : null}
      </main>
    </DashboardLayout>
  );
}
