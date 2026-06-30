import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const roleLabels = {
  admin: "ADMIN",
  barangay_officer: "BARANGAY OFFICER",
  disaster_responder: "RESPONDER",
  resident: "RESIDENT",
};

const weatherIcons = {
  0: "☀",
  1: "☀",
  2: "☁",
  3: "☁",
  45: "☁",
  51: "☂",
  61: "☂",
  71: "☁",
  80: "☂",
  95: "⚡",
};

function getWeatherIcon(code) {
  return weatherIcons[Number(code)] ?? "☁";
}

export default function Navbar({
  title,
  subtitle,
  onToggleSidebar,
  showSearch = true,
  showWeather = true,
  unreadAlerts = 0,
}) {
  const { profile } = useAuth();
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    if (!showWeather) {
      return undefined;
    }

    let active = true;

    async function loadWeather() {
      const { data, error } = await supabase
        .from("weather_readings")
        .select(
          "temperature, condition_text, weather_code, flood_risk, recorded_at"
        )
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) {
        return;
      }

      if (!error) {
        setWeather(data ?? null);
      }
    }

    loadWeather();
    const interval = window.setInterval(loadWeather, 300000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [showWeather]);

  const displayName = profile?.name ?? "AquaGuard User";
  const avatarLetter = displayName.slice(0, 1).toUpperCase() || "A";
  const roleLabel = roleLabels[profile?.role] ?? "USER";
  const weatherRisk = Number(weather?.flood_risk ?? 0);
  const weatherColor =
    weatherRisk > 0.6
      ? "#ef4444"
      : weatherRisk > 0.3
        ? "#f97316"
        : "#888888";

  return (
    <header className="topbar">
      <button
        className="hamburger"
        type="button"
        onClick={onToggleSidebar}
        aria-label="Toggle menu"
      >
        ☰
      </button>

      <div className="topbar-left">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>

      {showSearch && (
        <div className="search-wrap">
          <input
            type="text"
            placeholder="Search stations..."
            className="search-input"
            aria-label="Search stations"
          />
          <span className="search-icon">⌕</span>
        </div>
      )}

      <div className="topbar-right">
        {showWeather && (
          <Link
            to="/admin/weather"
            className="weather-pill"
            title="Weather Forecast"
          >
            <span>{getWeatherIcon(weather?.weather_code)}</span>
            <span>
              {weather?.temperature == null
                ? "—°C"
                : `${weather.temperature}°C`}
            </span>
            <span
              className="rain-badge"
              style={{ color: weatherColor }}
            >
              {weather?.condition_text ?? "No data"}
            </span>
          </Link>
        )}

        <Link
          to={
            profile?.role === "admin"
              ? "/admin/alerts"
              : profile?.role === "barangay_officer"
                ? "/officer/alerts"
              : profile?.role === "disaster_responder"
                ? "/responder/emergency-alerts"
                : "/resident/alerts"
          }
          className="icon-btn notif-btn"
          title="Alerts"
        >
          ⚠
          {unreadAlerts > 0 && <span className="notif-dot" />}
        </Link>

        {profile?.role === "admin" && (
          <Link
            to="/admin/settings"
            className="icon-btn"
            title="Settings"
          >
            ⚙
          </Link>
        )}

        <div className="user-pill">
          <div className="user-info">
            <span className="user-name">{displayName}</span>
            <span className="user-role">{roleLabel}</span>
          </div>
          <div className="avatar">{avatarLetter}</div>
        </div>
      </div>
    </header>
  );
}
