import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bell,
  Camera,
  ExternalLink,
  FileText,
  Gauge,
  History,
  Maximize2,
  RefreshCw,
  ShieldAlert,
  Video,
  Waves,
} from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";

const cameraApiUrl =
  import.meta.env.VITE_CAMERA_API_URL ?? "http://localhost:5000";

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function normalizePercent(value) {
  const numeric = toNumber(value);

  if (numeric == null) {
    return null;
  }

  return clamp(numeric <= 1 ? numeric * 100 : numeric);
}

function formatPercent(value) {
  const percent = normalizePercent(value);
  return percent == null ? "--" : `${Math.round(percent)}%`;
}

function formatLevel(value) {
  const level = toNumber(value);
  return level == null ? "--" : `${level.toFixed(2)} m`;
}

function formatOneDecimal(value, suffix = "") {
  const numeric = toNumber(value);
  return numeric == null ? "--" : `${numeric.toFixed(1)}${suffix}`;
}

function formatTime(value) {
  if (!value) {
    return "--:--";
  }

  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function minutesAgo(value, now) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
}

function getWaterStatus(level, warningLevel, criticalLevel) {
  if (level == null) {
    return {
      key: "unknown",
      label: "No Data",
      tone: "gray",
      badge: "lm-badge-gray",
      note: "Waiting for live reading",
    };
  }

  if (level >= criticalLevel) {
    return {
      key: "critical",
      label: "Critical",
      tone: "red",
      badge: "lm-badge-red",
      note: `At or above ${criticalLevel.toFixed(2)} m`,
    };
  }

  if (level >= warningLevel) {
    return {
      key: "warning",
      label: "Warning",
      tone: "orange",
      badge: "lm-badge-orange",
      note: `Approaching ${criticalLevel.toFixed(2)} m`,
    };
  }

  return {
    key: "normal",
    label: "Normal",
    tone: "teal",
    badge: "lm-badge-teal",
    note: "Within safe range",
  };
}

function buildLatestByStation(readings) {
  return (readings ?? []).reduce((latest, reading) => {
    const key = String(reading.station_id);

    if (!latest.has(key)) {
      latest.set(key, reading);
    }

    return latest;
  }, new Map());
}

function buildStreamUrl(baseUrl, stationId, version) {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const params = new URLSearchParams();

  if (stationId) {
    params.set("station_id", stationId);
  }

  params.set("v", String(version));

  return `${cleanBase}/video_feed?${params.toString()}`;
}

function pickSelectedStation(stations, requestedStationId) {
  if (requestedStationId) {
    const requested = stations.find(
      (station) => String(station.id) === String(requestedStationId)
    );

    if (requested) {
      return requested;
    }
  }

  return stations[0] ?? null;
}

function StreamPlaceholder({ streamState }) {
  const isOffline = streamState === "offline";

  return (
    <div className="lm-stream-state">
      {isOffline ? <Video size={34} /> : <Camera size={34} />}
      <strong>{isOffline ? "Camera Offline" : "Connecting Camera"}</strong>
      <span>
        {isOffline
          ? "Start the Flask camera service to restore the live feed."
          : "Opening the AI detector stream."}
      </span>
    </div>
  );
}

function LiveMonitoringContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStationId = searchParams.get("station_id");
  const feedRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [flash, setFlash] = useState(null);
  const [stations, setStations] = useState([]);
  const [stationReadings, setStationReadings] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [weather, setWeather] = useState(null);
  const [yolo, setYolo] = useState(null);
  const [detector, setDetector] = useState(null);
  const [cameraSources, setCameraSources] = useState([]);
  const [streamStatus, setStreamStatus] = useState({
    key: "",
    state: "loading",
  });
  const [streamVersion, setStreamVersion] = useState(1);
  const [sendingAlert, setSendingAlert] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const loadMonitoring = useCallback(async () => {
    const [stationsResult, readingsResult] = await Promise.all([
      supabase
        .from("stations")
        .select(
          "id, name, location, station_code, status, critical_level, warning_level, normal_level"
        )
        .order("name", { ascending: true }),
      supabase
        .from("water_levels")
        .select("id, station_id, level_m, rainfall_mm, recorded_at")
        .order("recorded_at", { ascending: false })
        .limit(300),
    ]);

    const firstError = [stationsResult.error, readingsResult.error].find(
      Boolean
    );

    if (firstError) {
      throw firstError;
    }

    const nextStations = stationsResult.data ?? [];
    const latestByStation = buildLatestByStation(readingsResult.data);
    const selectedStation = pickSelectedStation(
      nextStations,
      requestedStationId
    );
    const stationId = selectedStation?.id ?? "";

    const historyPromise = stationId
      ? supabase
          .from("water_levels")
          .select("id, station_id, level_m, rainfall_mm, recorded_at")
          .eq("station_id", stationId)
          .order("recorded_at", { ascending: false })
          .limit(18)
      : Promise.resolve({ data: [], error: null });

    const weatherPromise = stationId
      ? supabase
          .from("weather_readings")
          .select(
            "id, station_id, temperature, precipitation, rain_1h, rain_6h, wind_speed, weather_code, condition_text, flood_risk, recorded_at"
          )
          .eq("station_id", stationId)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const yoloPromise = stationId
      ? supabase
          .from("yolo_detections")
          .select(
            "id, station_id, water_coverage, level_m, confidence, weather_risk, flood_risk, detected_at"
          )
          .eq("station_id", stationId)
          .order("detected_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const alertsPromise = stationId
      ? supabase
          .from("alerts")
          .select("id, station_id, type, title, message, is_resolved, created_at")
          .eq("station_id", stationId)
          .eq("is_resolved", false)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null });

    const detectorPromise = stationId
      ? supabase
          .from("detector_results")
          .select(
            "id, station_id, level_m, confidence, waterline_y, frame_width, frame_height, status, snapshot_path, detected_at"
          )
          .eq("station_id", stationId)
          .order("detected_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const camerasPromise = stationId
      ? supabase
          .from("camera_sources")
          .select("id, station_id, cam_label, stream_type, stream_url, is_active")
          .eq("station_id", stationId)
          .order("cam_label", { ascending: true })
      : Promise.resolve({ data: [], error: null });

    const [
      historyResult,
      weatherResult,
      yoloResult,
      alertsResult,
      detectorResult,
      camerasResult,
    ] = await Promise.all([
      historyPromise,
      weatherPromise,
      yoloPromise,
      alertsPromise,
      detectorPromise,
      camerasPromise,
    ]);

    const detailError = [
      historyResult.error,
      weatherResult.error,
      yoloResult.error,
      alertsResult.error,
    ].find(Boolean);

    if (detailError) {
      throw detailError;
    }

    if (detectorResult.error) {
      console.warn("Detector result table unavailable:", detectorResult.error);
    }

    if (camerasResult.error) {
      console.warn("Camera sources table unavailable:", camerasResult.error);
    }

    return {
      stations: nextStations,
      stationReadings: nextStations.map((station) => ({
        station,
        reading: latestByStation.get(String(station.id)) ?? null,
      })),
      historyRows: historyResult.data ?? [],
      weather: weatherResult.data ?? null,
      yolo: yoloResult.data ?? null,
      alerts: alertsResult.data ?? [],
      detector: detectorResult.error ? null : detectorResult.data ?? null,
      cameraSources: camerasResult.error ? [] : camerasResult.data ?? [],
    };
  }, [requestedStationId]);

  useEffect(() => {
    let active = true;

    async function boot(initial = false) {
      if (initial) {
        setLoading(true);
      }

      setLoadError("");

      try {
        const nextState = await loadMonitoring();

        if (!active) {
          return;
        }

        setStations(nextState.stations);
        setStationReadings(nextState.stationReadings);
        setHistoryRows(nextState.historyRows);
        setWeather(nextState.weather);
        setYolo(nextState.yolo);
        setAlerts(nextState.alerts);
        setDetector(nextState.detector);
        setCameraSources(nextState.cameraSources);
      } catch (error) {
        console.error("Live monitoring load error:", error);

        if (active) {
          setLoadError(
            error.message || "Unable to load live monitoring data."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    boot(true);
    const interval = window.setInterval(() => boot(), 7000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [loadMonitoring]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  const selectedStation = pickSelectedStation(stations, requestedStationId);
  const selectedStationId = selectedStation?.id
    ? String(selectedStation.id)
    : "";
  const selectedReading =
    stationReadings.find(
      (row) => String(row.station.id) === selectedStationId
    )?.reading ?? historyRows[0] ?? null;

  const criticalLevel = toNumber(selectedStation?.critical_level, 2.5);
  const warningLevel = toNumber(selectedStation?.warning_level, 2);
  const normalLevel = toNumber(selectedStation?.normal_level, 1);
  const detectedLevel = toNumber(
    detector?.level_m,
    toNumber(yolo?.level_m, toNumber(selectedReading?.level_m))
  );
  const status = getWaterStatus(
    detectedLevel,
    warningLevel,
    criticalLevel
  );
  const waterPct =
    detectedLevel == null || criticalLevel <= 0
      ? 0
      : clamp((detectedLevel / criticalLevel) * 100);
  const previousLevel = toNumber(historyRows[1]?.level_m);
  const trend =
    detectedLevel == null || previousLevel == null
      ? null
      : detectedLevel - previousLevel;
  const activeCamera =
    cameraSources.find((source) => source.is_active) ?? cameraSources[0] ?? null;
  const detectorAge = minutesAgo(
    detector?.detected_at ?? yolo?.detected_at,
    now
  );
  const detectorFresh = detectorAge != null && detectorAge <= 5;
  const streamUrl = useMemo(
    () => buildStreamUrl(cameraApiUrl, selectedStationId, streamVersion),
    [selectedStationId, streamVersion]
  );
  const streamKey = `${selectedStationId}:${streamVersion}`;
  const streamState =
    streamStatus.key === streamKey ? streamStatus.state : "loading";
  const showWeatherBanner =
    toNumber(weather?.rain_6h, 0) >= 20 ||
    toNumber(weather?.rain_1h, 0) >= 8 ||
    normalizePercent(weather?.flood_risk) >= 45 ||
    Number(weather?.weather_code) >= 95;

  function handleStationSelect(stationId) {
    setSearchParams({ station_id: String(stationId) });
  }

  function handleRetryStream() {
    setStreamVersion((version) => version + 1);
  }

  function handleFullscreen() {
    feedRef.current?.requestFullscreen?.();
  }

  async function handleSendAlert() {
    if (!selectedStation || detectedLevel == null) {
      setFlash({
        type: "error",
        text: "Select a station with a current reading before sending an alert.",
      });
      return;
    }

    setSendingAlert(true);
    setFlash(null);

    const alertType = status.key === "critical" ? "critical" : "warning";
    const { error } = await supabase.from("alerts").insert({
      station_id: selectedStation.id,
      type: alertType,
      title: `${status.label} water level at ${selectedStation.name}`,
      message: `Live monitoring reports ${formatLevel(
        detectedLevel
      )}. Latest AI confidence: ${formatPercent(
        detector?.confidence ?? yolo?.confidence
      )}.`,
    });

    setSendingAlert(false);

    if (error) {
      setFlash({ type: "error", text: error.message });
      return;
    }

    setFlash({ type: "success", text: "Alert dispatched." });

    try {
      const nextState = await loadMonitoring();
      setAlerts(nextState.alerts);
    } catch (error) {
      console.error("Alert refresh error:", error);
    }
  }

  return (
    <>
      {flash && <div className={`flash ${flash.type}`}>{flash.text}</div>}

      {loading && (
        <div className="page-content">
          <div className="section-card dashboard-empty">
            Loading live monitoring data...
          </div>
        </div>
      )}

      {!loading && loadError && (
        <div className="page-content">
          <div className="section-card dashboard-empty error">
            {loadError}
          </div>
        </div>
      )}

      {!loading && !loadError && (
        <div className="page-content lm-page">
          {stations.length === 0 && (
            <div className="section-card dashboard-empty">
              No monitoring stations configured.
            </div>
          )}

          {stations.length > 0 && (
            <>
              <section className="lm-station-cards" aria-label="Stations">
                {stationReadings.map(({ station, reading }) => {
                  const stationLevel = toNumber(reading?.level_m);
                  const stationStatus = getWaterStatus(
                    stationLevel,
                    toNumber(station.warning_level, warningLevel),
                    toNumber(station.critical_level, criticalLevel)
                  );
                  const isActive =
                    String(station.id) === String(selectedStation?.id);

                  return (
                    <button
                      className={`lm-station-card ${
                        isActive ? "active" : ""
                      }`}
                      key={station.id}
                      type="button"
                      onClick={() => handleStationSelect(station.id)}
                    >
                      <span className="lm-station-top">
                        <span className="lm-station-name">
                          {station.name}
                        </span>
                        <span className={`lm-dot ${stationStatus.tone}`} />
                      </span>
                      <strong>{formatLevel(stationLevel)}</strong>
                      <span>{station.location ?? "No location"}</span>
                      <span className={`lm-status-badge ${stationStatus.badge}`}>
                        {stationStatus.label}
                      </span>
                    </button>
                  );
                })}
              </section>

              {showWeatherBanner && (
                <section className="lm-weather-banner">
                  <ShieldAlert size={18} />
                  <div>
                    <strong>Weather risk elevated</strong>
                    <span>
                      Rainfall and forecast risk are high for{" "}
                      {selectedStation?.name}.
                    </span>
                  </div>
                </section>
              )}

              <section className="lm-grid">
                <div className="lm-left">
                  <div className="lm-feed-wrap" ref={feedRef}>
                    <div className="lm-feed-topbar">
                      <span
                        className={`lm-live-badge ${
                          streamState === "connected" ? "online" : "offline"
                        }`}
                      >
                        <span className="live-dot" />
                        {streamState === "connected"
                          ? "LIVE FEED"
                          : streamState === "offline"
                            ? "CAMERA OFF"
                            : "CONNECTING"}
                      </span>
                      <span className="lm-timestamp">
                        Updated {formatTime(selectedReading?.recorded_at)}
                      </span>
                      <span className="lm-cam-badge">
                        {activeCamera?.cam_label ?? "Default Camera"}
                      </span>
                      <span
                        className={`lm-cam-badge ${
                          detectorFresh ? "good" : "muted"
                        }`}
                      >
                        {detectorFresh ? "AI Active" : "AI Waiting"}
                      </span>
                    </div>

                    <div className="lm-viewport">
                      <img
                        className={`lm-stream-img ${
                          streamState === "connected" ? "visible" : ""
                        }`}
                        src={streamUrl}
                        alt="AquaGuard live AI camera feed"
                        onLoad={() =>
                          setStreamStatus({
                            key: streamKey,
                            state: "connected",
                          })
                        }
                        onError={() =>
                          setStreamStatus({
                            key: streamKey,
                            state: "offline",
                          })
                        }
                      />

                      {streamState !== "connected" && (
                        <StreamPlaceholder streamState={streamState} />
                      )}

                      <div className="lm-yolo-stats" aria-label="AI stats">
                        <span>
                          Water <strong>{formatLevel(detectedLevel)}</strong>
                        </span>
                        <span>
                          Coverage{" "}
                          <strong>{formatPercent(yolo?.water_coverage)}</strong>
                        </span>
                        <span>
                          AI Conf{" "}
                          <strong>
                            {formatPercent(detector?.confidence ?? yolo?.confidence)}
                          </strong>
                        </span>
                        <span>
                          Risk <strong>{formatPercent(yolo?.flood_risk)}</strong>
                        </span>
                      </div>

                      <div className={`lm-detected-box ${status.tone}`}>
                        <span>{status.label}</span>
                        <strong>{formatLevel(detectedLevel)}</strong>
                        <small>{status.note}</small>
                      </div>

                      <div className="lm-water-bar-wrap">
                        <span className="lm-bar-label lm-bar-crit">
                          Critical
                        </span>
                        <span className="lm-bar-label lm-bar-warn">
                          Warning
                        </span>
                        <span className="lm-bar-label lm-bar-norm">
                          Normal
                        </span>
                        <div
                          className={`lm-water-bar-fill ${status.tone}`}
                          style={{ height: `${waterPct}%` }}
                        />
                      </div>

                      {streamState === "connected" && (
                        <span className="lm-scanline" aria-hidden="true" />
                      )}
                    </div>

                    <div className="lm-feed-footer">
                      <div>
                        <strong>{selectedStation?.name}</strong>
                        <span>
                          {activeCamera?.stream_type ?? "Flask MJPEG"} |{" "}
                          {selectedStation?.station_code ?? "No code"}
                        </span>
                      </div>
                      <div className="lm-feed-actions">
                        <button
                          className="icon-btn-sm lm-icon-button"
                          type="button"
                          onClick={handleRetryStream}
                          title="Retry stream"
                        >
                          <RefreshCw size={15} />
                          Retry
                        </button>
                        <a
                          className="icon-btn-sm lm-icon-button"
                          href={streamUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open stream"
                        >
                          <ExternalLink size={15} />
                          Open
                        </a>
                        <button
                          className="icon-btn-sm lm-icon-button"
                          type="button"
                          onClick={handleFullscreen}
                          title="Fullscreen"
                        >
                          <Maximize2 size={15} />
                          Full
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="lm-detection-log">
                    <div className="panel-header">
                      <span>Detection Log</span>
                      <span>{historyRows.length} recent readings</span>
                    </div>

                    <div className="data-table-wrap">
                      <table className="data-table lm-ai-log">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Water Level</th>
                            <th>Rainfall</th>
                            <th>Status</th>
                            <th>AI Conf</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyRows.length === 0 && (
                            <tr>
                              <td colSpan="5">No recent detections.</td>
                            </tr>
                          )}

                          {historyRows.map((row, index) => {
                            const rowLevel = toNumber(row.level_m);
                            const rowStatus = getWaterStatus(
                              rowLevel,
                              warningLevel,
                              criticalLevel
                            );

                            return (
                              <tr key={row.id}>
                                <td>{formatDateTime(row.recorded_at)}</td>
                                <td>{formatLevel(rowLevel)}</td>
                                <td>
                                  {formatOneDecimal(row.rainfall_mm, " mm")}
                                </td>
                                <td>
                                  <span
                                    className={`badge ${rowStatus.badge.replace(
                                      "lm-",
                                      ""
                                    )}`}
                                  >
                                    {rowStatus.label}
                                  </span>
                                </td>
                                <td>
                                  {index === 0
                                    ? formatPercent(
                                        detector?.confidence ?? yolo?.confidence
                                      )
                                    : "--"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <aside className="lm-right">
                  <div className="lm-info-card primary">
                    <div className="lm-info-heading">
                      <Waves size={18} />
                      <span>Current Water Level</span>
                    </div>
                    <strong className={`lm-info-value ${status.tone}`}>
                      {formatLevel(detectedLevel)}
                    </strong>
                    <span className={`lm-status-badge ${status.badge}`}>
                      {status.label}
                    </span>
                    <p>{status.note}</p>
                  </div>

                  <div className="lm-info-card">
                    <div className="lm-info-heading">
                      <Gauge size={18} />
                      <span>Trend And Thresholds</span>
                    </div>
                    <div className="lm-health-grid">
                      <div className="lm-health-item">
                        <span>1 reading trend</span>
                        <strong>
                          {trend == null
                            ? "--"
                            : `${trend >= 0 ? "+" : ""}${trend.toFixed(2)} m`}
                        </strong>
                      </div>
                      <div className="lm-health-item">
                        <span>Normal</span>
                        <strong>{normalLevel.toFixed(2)} m</strong>
                      </div>
                      <div className="lm-health-item">
                        <span>Warning</span>
                        <strong>{warningLevel.toFixed(2)} m</strong>
                      </div>
                      <div className="lm-health-item">
                        <span>Critical</span>
                        <strong>{criticalLevel.toFixed(2)} m</strong>
                      </div>
                    </div>
                  </div>

                  <div className="lm-info-card">
                    <div className="lm-info-heading">
                      <Camera size={18} />
                      <span>Camera Health</span>
                    </div>
                    <div className="lm-health-grid">
                      <div className="lm-health-item">
                        <span>Stream</span>
                        <strong>{streamState}</strong>
                      </div>
                      <div className="lm-health-item">
                        <span>Detector</span>
                        <strong>{detectorFresh ? "active" : "waiting"}</strong>
                      </div>
                      <div className="lm-health-item">
                        <span>Last AI hit</span>
                        <strong>
                          {detectorAge == null ? "--" : `${detectorAge}m ago`}
                        </strong>
                      </div>
                      <div className="lm-health-item">
                        <span>Source</span>
                        <strong>
                          {activeCamera?.cam_label ?? "default"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="lm-info-card">
                    <div className="lm-info-heading">
                      <ShieldAlert size={18} />
                      <span>Weather And AI Risk</span>
                    </div>
                    <div className="lm-weather-lines">
                      <span>{weather?.condition_text ?? "No weather data"}</span>
                      <span>
                        {formatOneDecimal(weather?.temperature, " C")} | Wind{" "}
                        {formatOneDecimal(weather?.wind_speed, " km/h")}
                      </span>
                      <span>
                        Rain 1h {formatOneDecimal(weather?.rain_1h, " mm")} |
                        6h {formatOneDecimal(weather?.rain_6h, " mm")}
                      </span>
                    </div>
                    <div className="lm-risk-track">
                      <span
                        className="lm-risk-fill"
                        style={{
                          width: `${normalizePercent(
                            yolo?.flood_risk ?? weather?.flood_risk
                          ) ?? 0}%`,
                        }}
                      />
                    </div>
                    <div className="lm-risk-meta">
                      <span>Flood risk</span>
                      <strong>
                        {formatPercent(yolo?.flood_risk ?? weather?.flood_risk)}
                      </strong>
                    </div>
                  </div>

                  <div className="lm-info-card">
                    <div className="lm-info-heading">
                      <Bell size={18} />
                      <span>Quick Actions</span>
                    </div>
                    <div className="lm-action-list">
                      <button
                        className="lm-action-btn lm-action-alert"
                        type="button"
                        onClick={handleSendAlert}
                        disabled={sendingAlert}
                      >
                        <Bell size={16} />
                        {sendingAlert ? "Sending..." : "Send Alert"}
                      </button>
                      <Link
                        className="lm-action-btn lm-action-report"
                        to="/admin/reports"
                      >
                        <FileText size={16} />
                        Generate Report
                      </Link>
                      <Link
                        className="lm-action-btn lm-action-history"
                        to={`/admin/water-level-history?station_id=${selectedStationId}`}
                      >
                        <History size={16} />
                        View History
                      </Link>
                    </div>
                  </div>

                  <div className="lm-info-card">
                    <div className="lm-info-heading">
                      <Video size={18} />
                      <span>Active Alerts</span>
                    </div>
                    <div className="lm-alert-list">
                      {alerts.length === 0 && (
                        <span className="dashboard-empty">No active alerts.</span>
                      )}

                      {alerts.map((alert) => (
                        <div className="lm-alert-item" key={alert.id}>
                          <strong>{alert.title}</strong>
                          <span>{alert.message}</span>
                          <small>{formatDateTime(alert.created_at)}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>
              </section>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default function LiveMonitoring() {
  return (
    <DashboardLayout
      title="Live Monitoring"
      description="Real-time webcam feed with AI waterline detection"
    >
      <LiveMonitoringContent />
    </DashboardLayout>
  );
}
