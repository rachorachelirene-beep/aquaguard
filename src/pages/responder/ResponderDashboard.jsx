import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  ClipboardList,
  FileText,
  History,
  RadioTower,
  ShieldAlert,
} from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import {
  cameraAgentBaseUrl as cameraApiBaseUrl,
  isCameraAgentReachable,
} from "../../lib/cameraAgent";
import { fetchJsonWithTimeout } from "../../lib/fetchJson";
import { supabase } from "../../lib/supabase";
import {
  formatDateTime,
  getResponseStatus,
  getWaterStatus,
} from "./responderUtils";

function numberOrNull(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildStationRows(stations, readings) {
  const latestByStation = new Map();

  readings.forEach((reading) => {
    const key = String(reading.station_id);

    if (!latestByStation.has(key)) {
      latestByStation.set(key, reading);
    }
  });

  return stations.map((station) => {
    const reading = latestByStation.get(String(station.id)) ?? null;
    const level = numberOrNull(reading?.level_m);

    return {
      station,
      reading,
      status: level != null
        ? getWaterStatus(level, station)
        : {
            key: "unknown",
            label: "No data",
            className: "gray",
            badge: "badge-gray",
          },
    };
  });
}

function QuickAction({ to, icon: Icon, title, description }) {
  return (
    <Link className="officer-quick-card" to={to}>
      <span className="officer-quick-icon">
        <Icon size={21} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </Link>
  );
}

export default function ResponderDashboard() {
  const { profile } = useAuth();
  const responderId = profile?.id ?? "";
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [stations, setStations] = useState([]);
  const [readings, setReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [advisories, setAdvisories] = useState([]);
  const [logs, setLogs] = useState([]);
  const [latestDetection, setLatestDetection] = useState(null);
  const [combinedRisk, setCombinedRisk] = useState(null);
  const [riskUnavailable, setRiskUnavailable] = useState(false);
  const loadInFlightRef = useRef(false);
  const riskWarningShownRef = useRef(false);

  const loadDashboard = useCallback(async ({ showLoading = true } = {}) => {
    if (loadInFlightRef.current) {
      return;
    }

    loadInFlightRef.current = true;

    if (showLoading) {
      setLoading(true);
    }

    setLoadError("");

    try {
      const [
        stationsResult,
        readingsResult,
        alertsResult,
        advisoriesResult,
        logsResult,
      ] = await Promise.all([
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
          .limit(80),
        supabase
          .from("alerts")
          .select(
            "id, station_id, type, title, message, is_read, is_resolved, created_at"
          )
          .eq("is_resolved", false)
          .in("type", ["warning", "critical"])
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("evacuation_advisories")
          .select(
            "id, title, area, level, details, is_active, issued_by, created_at"
          )
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("response_logs")
          .select(
            "id, alert_id, station_id, responder_id, status, notes, created_at, updated_at"
          )
          .order("updated_at", { ascending: false })
          .limit(20),
      ]);

      const firstError = [
        stationsResult.error,
        readingsResult.error,
        alertsResult.error,
        advisoriesResult.error,
        logsResult.error,
      ].find(Boolean);

      if (firstError) {
        throw firstError;
      }

      const nextStations = stationsResult.data ?? [];
      const nextReadings = readingsResult.data ?? [];
      const newestValidReading = nextReadings.find(
        (reading) => numberOrNull(reading.level_m) != null
      );
      const primaryStationId =
        newestValidReading?.station_id ?? nextStations[0]?.id ?? null;
      let nextRisk = null;
      let nextRiskUnavailable = false;
      let nextDetection = null;

      if (primaryStationId != null) {
        const detectionResult = await supabase
          .from("yolo_detections")
          .select(
            "id, station_id, level_m, confidence, water_coverage, detected_at"
          )
          .eq("station_id", primaryStationId)
          .order("detected_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (detectionResult.error) {
          throw detectionResult.error;
        }

        nextDetection = detectionResult.data ?? null;

        if (isCameraAgentReachable()) {
          try {
            const payload = await fetchJsonWithTimeout(
              `${cameraApiBaseUrl}/flood_risk?station_id=${encodeURIComponent(
                primaryStationId
              )}`
            );
            nextRisk = payload?.combined_risk ?? null;
            riskWarningShownRef.current = false;
          } catch (error) {
            if (!riskWarningShownRef.current) {
              console.warn(
                "Responder dashboard combined risk unavailable:",
                error
              );
              riskWarningShownRef.current = true;
            }
            nextRiskUnavailable = true;
          }
        } else {
          nextRiskUnavailable = true;
        }
      }

      setStations(nextStations);
      setReadings(nextReadings);
      setAlerts(alertsResult.data ?? []);
      setAdvisories(advisoriesResult.data ?? []);
      setLogs(logsResult.data ?? []);
      setLatestDetection(nextDetection);
      setCombinedRisk(nextRisk);
      setRiskUnavailable(nextRiskUnavailable);
    } catch (error) {
      console.error("Responder dashboard loading error:", error);
      setLoadError(
        "Unable to load the responder dashboard. Check your connection and access permissions, then try again."
      );
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => loadDashboard(), 0);
    const interval = window.setInterval(
      () => loadDashboard({ showLoading: false }),
      30000
    );

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadDashboard]);

  const stationRows = useMemo(
    () => buildStationRows(stations, readings),
    [readings, stations]
  );
  const latestReading =
    readings.find((reading) => numberOrNull(reading.level_m) != null) ?? null;
  const primary =
    stationRows.find(
      (item) => String(item.station.id) === String(latestReading?.station_id)
    ) ?? stationRows[0] ?? null;
  const currentLevel = numberOrNull(primary?.reading?.level_m);
  const waterStatus = primary?.reading
    ? primary.status
    : {
        key: "unknown",
        label: "No data",
        className: "gray",
        badge: "badge-gray",
      };
  const riskScore =
    combinedRisk?.assessed === true ? numberOrNull(combinedRisk.score) : null;
  const riskLabel =
    riskScore == null ? "Not assessed" : combinedRisk?.label ?? "Assessed";
  const riskTone =
    combinedRisk?.level === "critical"
      ? "red"
      : combinedRisk?.level === "high" || combinedRisk?.level === "elevated"
        ? "orange"
        : riskScore == null
          ? "gray"
          : "green";
  const latestAlert = alerts[0] ?? null;
  const activeAdvisory = advisories[0] ?? null;
  const latestResponse = logs[0] ?? null;
  const responseStatus = getResponseStatus(latestResponse?.status);
  const responseIsMine =
    latestResponse &&
    String(latestResponse.responder_id) === String(responderId);
  const stationMap = useMemo(
    () => new Map(stations.map((station) => [String(station.id), station])),
    [stations]
  );

  return (
    <DashboardLayout
      title="Responder Dashboard"
      description="Live flood conditions, emergency guidance, and field response activity."
    >
      {loading && (
        <div className="page-content">
          <div className="section-card dashboard-empty">
            Loading responder dashboard...
          </div>
        </div>
      )}

      {!loading && loadError && (
        <div className="page-content">
          <div className="section-card dashboard-empty error">
            <strong>{loadError}</strong>
            <button className="btn-submit" type="button" onClick={loadDashboard}>
              Try again
            </button>
          </div>
        </div>
      )}

      {!loading && !loadError && (
        <main className="page-content officer-page">
          <section className="stat-cards dashboard-secondary-cards">
            <div className="stat-card">
              <div className="stat-label">CURRENT WATER LEVEL</div>
              <div className="stat-value blue">
                {currentLevel == null ? "No data" : `${currentLevel.toFixed(2)} m`}
              </div>
              <div className="stat-sub">
                {primary?.station?.name ?? "No station reading available"}
              </div>
            </div>

            <div className="stat-card warning-card">
              <div className="stat-label">LATEST STATION STATUS</div>
              <div className={`stat-value ${waterStatus.className} big`}>
                {waterStatus.label}
              </div>
              <div className="stat-sub">
                {primary?.station?.location ?? "Station location unavailable"}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">COMBINED FLOOD RISK</div>
              <div className={`stat-value ${riskTone}`}>
                {riskScore == null ? "--" : `${Math.round(riskScore)}/100`}
              </div>
              <div className="stat-sub">
                {riskLabel} · Rule-based monitoring assessment
              </div>
            </div>

            <div className="stat-card weather-card">
              <div className="stat-label">LATEST DETECTION</div>
              <div className="stat-value compact">
                {formatDateTime(latestDetection?.detected_at)}
              </div>
              <div className="stat-sub">
                {latestDetection
                  ? `AI confidence ${
                      numberOrNull(latestDetection.confidence) == null
                        ? "--"
                        : `${Math.round(
                            numberOrNull(latestDetection.confidence) <= 1
                              ? numberOrNull(latestDetection.confidence) * 100
                              : numberOrNull(latestDetection.confidence)
                          )}%`
                    }`
                  : "No detection available"}
              </div>
            </div>
          </section>

          <section className="officer-monitoring-summary">
            <article className="officer-summary-card">
              <span>Monitoring station</span>
              <strong>{primary?.station?.name ?? "No station selected"}</strong>
              <small>
                {primary?.station?.location ?? "Location unavailable"} ·{" "}
                {primary?.station?.station_code ?? "No station code"}
              </small>
              <small>
                Station connection: {primary?.station?.status ?? "unknown"} ·
                Reading updated {formatDateTime(primary?.reading?.recorded_at)}
              </small>
            </article>

            <article className="officer-summary-card officer-summary-alert">
              <span>Latest warning / critical alert</span>
              <strong>{latestAlert?.title ?? "No active alerts"}</strong>
              <small>
                {latestAlert?.message ??
                  "There are no unresolved warning or critical alerts."}
              </small>
              {latestAlert && (
                <small>
                  {stationMap.get(String(latestAlert.station_id))?.name ??
                    "General alert"}{" "}
                  · {formatDateTime(latestAlert.created_at)}
                </small>
              )}
            </article>

            <article className="officer-summary-card">
              <span>Combined flood risk detail</span>
              <strong>{riskLabel}</strong>
              <small>
                {combinedRisk?.primary_reason ??
                  (riskUnavailable
                    ? "Detector risk service is offline or unreachable."
                    : "Insufficient monitoring data for an assessment.")}
              </small>
              <small>Monitoring score, not flood probability.</small>
            </article>
          </section>

          <section className="resident-dashboard-grid">
            <div className="section-card">
              <div className="section-title">
                <span>Active Evacuation Advisory</span>
                <Link
                  className="resident-view-link"
                  to="/responder/evacuation-advisories"
                >
                  View all
                </Link>
              </div>
              {activeAdvisory ? (
                <article className="officer-list-item resident-advisory-item">
                  <div className="officer-list-heading">
                    <strong>{activeAdvisory.title}</strong>
                    <span
                      className={`badge ${
                        activeAdvisory.level === "mandatory"
                          ? "badge-red"
                          : activeAdvisory.level === "warning"
                            ? "badge-orange"
                            : "badge-blue"
                      }`}
                    >
                      {activeAdvisory.level ?? "Advisory"}
                    </span>
                  </div>
                  <span>Affected area: {activeAdvisory.area || "Not specified"}</span>
                  <p>{activeAdvisory.details || "No instructions provided."}</p>
                  <small>{formatDateTime(activeAdvisory.created_at)}</small>
                </article>
              ) : (
                <div className="dashboard-empty">
                  No active evacuation advisories.
                </div>
              )}
            </div>

            <div className="section-card">
              <div className="section-title">
                <span>Latest Response Activity</span>
                <Link className="resident-view-link" to="/responder/coordinate">
                  Coordinate
                </Link>
              </div>
              {latestResponse ? (
                <article className="officer-list-item">
                  <div className="officer-list-heading">
                    <strong>{responseIsMine ? "Your response" : "Team response"}</strong>
                    <span className={`badge ${responseStatus.badge}`}>
                      {responseStatus.label}
                    </span>
                  </div>
                  <span>{latestResponse.notes || "No field notes provided."}</span>
                  <small>
                    {stationMap.get(String(latestResponse.station_id))?.name ??
                      "General response"}{" "}
                    ·{" "}
                    {formatDateTime(
                      latestResponse.updated_at ?? latestResponse.created_at
                    )}
                  </small>
                </article>
              ) : (
                <div className="dashboard-empty">No response activity yet.</div>
              )}
            </div>
          </section>

          <section className="section-card">
            <div className="section-title">
              <span>Quick Actions</span>
              <small>Responder monitoring and field tools</small>
            </div>
            <div className="officer-quick-grid">
              <QuickAction
                to="/responder/live-monitoring"
                icon={RadioTower}
                title="View Live Monitoring"
                description="Open CCTV, AI detections, and live risk"
              />
              <QuickAction
                to="/responder/alerts"
                icon={Bell}
                title="View Alerts"
                description="Acknowledge active flood alerts"
              />
              <QuickAction
                to="/responder/evacuation-advisories"
                icon={ShieldAlert}
                title="Evacuation Advisories"
                description="Read active evacuation instructions"
              />
              <QuickAction
                to="/responder/response-logs"
                icon={ClipboardList}
                title="Record Response"
                description="Create or update your field activity"
              />
              <QuickAction
                to="/responder/coordinate"
                icon={FileText}
                title="View Response Logs"
                description="Follow recent team response activity"
              />
              <QuickAction
                to="/responder/water-level-history"
                icon={History}
                title="Water Level History"
                description="Review station readings and trends"
              />
            </div>
          </section>
        </main>
      )}
    </DashboardLayout>
  );
}
