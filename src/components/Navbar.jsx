import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Cloud,
  CloudRain,
  Clock,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  Umbrella,
  User,
  Zap,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const roleLabels = {
  admin: "ADMIN",
  barangay_officer: "BARANGAY OFFICER",
  disaster_responder: "RESPONDER",
  resident: "RESIDENT",
};

const themeStorageKey = "aquaguard.theme";

function getStoredDarkMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(themeStorageKey) === "dark";
}

function renderWeatherIcon(code) {
  switch (Number(code)) {
    case 0:
    case 1:
      return <Sun size={17} />;
    case 2:
    case 3:
    case 45:
    case 71:
      return <Cloud size={17} />;
    case 51:
      return <Umbrella size={17} />;
    case 95:
      return <Zap size={17} />;
    case 61:
    case 80:
    default:
      return <CloudRain size={17} />;
  }
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
  const [isDarkMode, setIsDarkMode] = useState(getStoredDarkMode);

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

  useEffect(() => {
    const theme = isDarkMode ? "dark" : "light";

    document.documentElement.dataset.aqTheme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [isDarkMode]);

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
        <Menu size={21} />
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
          <span className="search-icon">
            <Search size={17} />
          </span>
        </div>
      )}

      <div className="topbar-right">
        <span className="topbar-status-icon" title="System time">
          <Clock size={19} />
        </span>

        {showWeather && (
          <Link
            to="/admin/weather"
            className="weather-pill"
            title="Weather Forecast"
          >
            {renderWeatherIcon(weather?.weather_code)}
            <span>
              {weather?.temperature == null
                ? "-- C"
                : `${weather.temperature} C`}
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
          <Bell size={19} />
          {unreadAlerts > 0 && <span className="notif-dot" />}
        </Link>

        {profile?.role === "admin" && (
          <Link
            to="/admin/settings"
            className="icon-btn"
            title="Settings"
          >
            <Settings size={19} />
          </Link>
        )}

        <button
          className="topbar-status-icon"
          type="button"
          title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={
            isDarkMode ? "Switch to light mode" : "Switch to dark mode"
          }
          aria-pressed={isDarkMode}
          onClick={() => setIsDarkMode((currentValue) => !currentValue)}
        >
          {isDarkMode ? <Sun size={19} /> : <Moon size={19} />}
        </button>

        <div className="user-pill">
          <div className="user-info">
            <span className="user-name">{displayName}</span>
            <span className="user-role">{roleLabel}</span>
          </div>
          <div className="avatar" aria-label={displayName}>
            {avatarLetter || <User size={16} />}
          </div>
        </div>
      </div>
    </header>
  );
}
