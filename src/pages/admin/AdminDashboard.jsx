import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  Clock,
  Info,
  Radio,
  Send,
  Wrench,
} from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import useValidatedWaterLevel from "../../hooks/useValidatedWaterLevel";
import { cameraAgentBaseUrl } from "../../lib/cameraAgent";
import { supabase } from "../../lib/supabase";
import "./TelemetryDashboard.css";

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatLevel(value) {
  const level = toNumber(value, null);
  return level == null ? "--" : `${level.toFixed(2)} m`;
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return "Just now";
  const now = new Date();
  const past = new Date(dateStr);
  const diffMs = Math.max(0, now.getTime() - past.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin} mins ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  return past.toLocaleDateString();
}

export function AdminDashboardContent() {
  const { profile } = useAuth();
  const [stations, setStations] = useState([]);
  const [selectedStationId, setSelectedStationId] = useState(null);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("24h"); // "24h" | "7d" | "30d"

  // Forms state
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    severity: "Warning (Level 2)",
    body: "",
    sms: true,
    web: true,
    push: false,
  });

  const [maintenanceForm, setMaintenanceForm] = useState({
    station_id: "",
    issue_type: "Sensor Failure / Calibration",
    priority: "High (Immediate dispatch)",
    notes: "",
  });

  const [submittingAnnouncement, setSubmittingAnnouncement] = useState(false);
  const [submittingMaintenance, setSubmittingMaintenance] = useState(false);
  const [recentDispatch, setRecentDispatch] = useState(
    "Team Bravo deployed to Station Alpha (Ultrasonic Sensor calibration) • 1 hr ago • In Progress"
  );
  const [flashMessage, setFlashMessage] = useState(null);

  // Active station
  const currentStation = useMemo(() => {
    if (!stations.length) return null;
    return (
      stations.find((s) => String(s.id) === String(selectedStationId)) ||
      stations[0]
    );
  }, [stations, selectedStationId]);

  // Live water level from camera or DB
  const liveValidatedLevel = useValidatedWaterLevel(currentStation?.id);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      if (!supabase) return;

      const [stationsRes, alertsRes] = await Promise.all([
        supabase.from("stations").select("*").order("id", { ascending: true }),
        supabase
          .from("alerts")
          .select("id, station_id, title, message, type, created_at, is_resolved")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const stationData = stationsRes.data ?? [];
      setStations(stationData);
      setAlerts(alertsRes.data ?? []);

      let activeId = selectedStationId;
      if (!activeId && stationData.length > 0) {
        // Query the station with the most recent water level reading to auto-select
        const { data: latestRow } = await supabase
          .from("water_levels")
          .select("station_id")
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        activeId = latestRow?.station_id || stationData[0]?.id;
        setSelectedStationId(activeId);
      }

      if (activeId) {
        const { data: histData } = await supabase
          .from("water_levels")
          .select("id, level_m, recorded_at")
          .eq("station_id", activeId)
          .order("recorded_at", { ascending: false })
          .limit(40);

        setHistory(histData ? [...histData].reverse() : []);
      }
    } catch (err) {
      console.error("Dashboard data fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedStationId]);

  useEffect(() => {
    loadData();

    if (!supabase) return;
    const channel = supabase
      .channel("telemetry-dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => {
        loadData();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "water_levels" }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Current Level Calculation
  const latestDbLevel = history.length ? history[history.length - 1].level_m : null;
  const currentLevel = liveValidatedLevel ?? latestDbLevel ?? 0;
  const criticalLevel = currentStation?.critical_level || 2.5;
  const warningLevel = currentStation?.warning_level || 2.0;

  let currentStatus = "Normal";
  let statusPillClass = "pill-normal";

  if (currentLevel >= criticalLevel) {
    currentStatus = "Critical";
    statusPillClass = "pill-critical";
  } else if (currentLevel >= warningLevel) {
    currentStatus = "Warning";
    statusPillClass = "pill-warning";
  }

  // Handle Form Submissions
  async function handleAnnouncementSubmit(e) {
    e.preventDefault();
    if (!announcementForm.title.trim() || !announcementForm.body.trim()) return;

    try {
      setSubmittingAnnouncement(true);
      const { error } = await supabase.from("announcements").insert({
        title: `[${announcementForm.severity}] ${announcementForm.title.trim()}`,
        body: announcementForm.body.trim(),
        created_by: profile?.id,
      });

      if (error) throw error;

      setFlashMessage({ type: "success", text: "Public announcement published successfully!" });
      setAnnouncementForm({
        title: "",
        severity: "Warning (Level 2)",
        body: "",
        sms: true,
        web: true,
        push: false,
      });
      setTimeout(() => setFlashMessage(null), 5000);
    } catch (err) {
      setFlashMessage({ type: "error", text: err.message || "Failed to publish announcement" });
    } finally {
      setSubmittingAnnouncement(false);
    }
  }

  async function handleMaintenanceSubmit(e) {
    e.preventDefault();
    if (!maintenanceForm.notes.trim()) return;

    try {
      setSubmittingMaintenance(true);
      const targetId = maintenanceForm.station_id || currentStation?.id;
      const targetStationObj = stations.find((s) => String(s.id) === String(targetId));

      const payload = {
        station_id: targetId,
        type: "system",
        title: `Maintenance: ${maintenanceForm.issue_type} [${maintenanceForm.priority}]`,
        message: `${maintenanceForm.notes.trim()} (Station: ${targetStationObj?.name || "General"})`,
        is_read: false,
        is_resolved: false,
      };

      const { error } = await supabase.from("alerts").insert(payload);
      if (error) throw error;

      setRecentDispatch(
        `Field Team dispatched to ${targetStationObj?.name || "Station"} (${maintenanceForm.issue_type}) • Just now • In Progress`
      );

      setFlashMessage({ type: "success", text: "Maintenance team dispatched and ticket created!" });
      setMaintenanceForm({
        station_id: "",
        issue_type: "Sensor Failure / Calibration",
        priority: "High (Immediate dispatch)",
        notes: "",
      });
      setTimeout(() => setFlashMessage(null), 5000);
    } catch (err) {
      setFlashMessage({ type: "error", text: err.message || "Failed to dispatch maintenance" });
    } finally {
      setSubmittingMaintenance(false);
    }
  }

  // Telemetry Chart SVG Coordinates Construction
  const chartHeight = 220;
  const chartWidth = 900;
  const maxScale = Math.max(criticalLevel * 1.35, 3.5);

  const points = useMemo(() => {
    if (!history.length) {
      return [
        { x: 30, y: chartHeight - 20 },
        { x: chartWidth - 30, y: chartHeight - 20 },
      ];
    }

    const displayHistory = history.length === 1 ? [history[0], history[0]] : history;

    return displayHistory.map((item, idx) => {
      const x = 30 + (idx / Math.max(1, displayHistory.length - 1)) * (chartWidth - 60);
      const normalizedLvl = Math.min(maxScale, Math.max(0, Number(item.level_m) || 0));
      const y = chartHeight - (normalizedLvl / maxScale) * (chartHeight - 40) - 20;
      return { x, y };
    });
  }, [history, maxScale, chartHeight, chartWidth]);

  const pathD = useMemo(() => {
    if (!points.length) return "";
    return points.reduce((acc, curr, i) => {
      if (i === 0) return `M ${curr.x} ${curr.y}`;
      const prev = points[i - 1];
      const cx = (prev.x + curr.x) / 2;
      return `${acc} C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
    }, "");
  }, [points]);

  const critY = chartHeight - (criticalLevel / maxScale) * (chartHeight - 40) - 20;
  const warnY = chartHeight - (warningLevel / maxScale) * (chartHeight - 40) - 20;

  return (
    <div className="telemetry-dashboard">
      {flashMessage && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            background: flashMessage.type === "error" ? "#fef2f2" : "#f0fdf4",
            color: flashMessage.type === "error" ? "#dc2626" : "#16a34a",
            border: `1px solid ${flashMessage.type === "error" ? "#fecaca" : "#bbf7d0"}`,
            fontWeight: 600,
            fontSize: "0.9rem",
          }}
        >
          {flashMessage.text}
        </div>
      )}

      {/* 1. Water Level Telemetry Graph */}
      <section className="telemetry-chart-card">
        <header className="telemetry-chart-header">
          <div className="telemetry-title-group">
            <h2 className="telemetry-title">Water Level Telemetry</h2>
            <span className={`telemetry-status-pill ${statusPillClass}`}>
              ● {formatLevel(currentLevel)}, {currentStatus}
            </span>

            {stations.length > 0 && (
              <div className="telemetry-station-picker">
                <select
                  value={currentStation?.id || ""}
                  onChange={(e) => setSelectedStationId(Number(e.target.value))}
                  className="telemetry-station-dropdown"
                  aria-label="Select monitoring station"
                >
                  {stations.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.station_code || `ST-${st.id}`})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="telemetry-time-filters">
            <button
              type="button"
              className={`telemetry-filter-btn ${timeRange === "24h" ? "active" : ""}`}
              onClick={() => setTimeRange("24h")}
            >
              24h
            </button>
            <button
              type="button"
              className={`telemetry-filter-btn ${timeRange === "7d" ? "active" : ""}`}
              onClick={() => setTimeRange("7d")}
            >
              7d
            </button>
            <button
              type="button"
              className={`telemetry-filter-btn ${timeRange === "30d" ? "active" : ""}`}
              onClick={() => setTimeRange("30d")}
            >
              30d
            </button>
          </div>
        </header>

        {/* SVG Multi-threshold Graph */}
        <div className="telemetry-svg-container">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            style={{ width: "100%", height: "230px", overflow: "visible" }}
          >
            {/* Grid baseline */}
            <line
              x1="0"
              y1={chartHeight - 15}
              x2={chartWidth}
              y2={chartHeight - 15}
              stroke="#e2e8f0"
              strokeWidth="1"
            />

            {/* Critical threshold dashed line */}
            <line
              x1="0"
              y1={critY}
              x2={chartWidth}
              y2={critY}
              stroke="#ef4444"
              strokeWidth="1.8"
              strokeDasharray="5 5"
            />
            <text x={chartWidth - 5} y={critY - 6} fill="#ef4444" fontSize="11" textAnchor="end" fontWeight="bold">
              Critical ({criticalLevel.toFixed(2)}m)
            </text>

            {/* Warning threshold dashed line */}
            <line
              x1="0"
              y1={warnY}
              x2={chartWidth}
              y2={warnY}
              stroke="#f59e0b"
              strokeWidth="1.8"
              strokeDasharray="5 5"
            />
            <text x={chartWidth - 5} y={warnY - 6} fill="#f59e0b" fontSize="11" textAnchor="end" fontWeight="bold">
              Warning ({warningLevel.toFixed(2)}m)
            </text>

            {/* Smooth water level trend curve */}
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
            )}

            {/* Live pulsing dot at latest point */}
            {points.length > 0 && (
              <g transform={`translate(${points[points.length - 1].x}, ${points[points.length - 1].y})`}>
                <circle r="8" fill="#ef4444" opacity="0.3">
                  <animate attributeName="r" values="6;14;6" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle r="4.5" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
              </g>
            )}
          </svg>

          {/* Time axis markers */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.8rem",
              color: "#94a3b8",
              marginTop: "4px",
              fontWeight: 600,
            }}
          >
            <span>00:00</span>
            <span>04:00</span>
            <span>08:00</span>
            <span>12:00</span>
            <span>16:00</span>
            <span>20:00</span>
            <span style={{ color: "#0f172a", fontWeight: "bold" }}>
              Now ({new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
            </span>
          </div>
        </div>

        {/* Diagnostic notification strip */}
        <div className="telemetry-diag-strip">
          <div className="diag-left">
            <Info size={16} />
            <span>
              Diagnostic view: Station {currentStation?.station_code || "AG-01"} telemetry synchronization buffer active
            </span>
          </div>
          <button
            type="button"
            className="diag-link"
            onClick={() => loadData()}
          >
            REFRESH TELEMETRY FEED
          </button>
        </div>
      </section>

      {/* 2. Telemetry Station Metric Strip */}
      <section className="telemetry-station-strip">
        <div className="strip-item">
          <span className="strip-label">MONITORING BASIN</span>
          <span className="strip-value">{currentStation?.name || "Station Alpha"}</span>
          <span className="strip-sub">
            {currentStation?.location || "Davao River Basin"} • ID: {currentStation?.station_code || "AG-ST-01"}
          </span>
        </div>

        <div className="strip-item">
          <span className="strip-label">LINK STATUS</span>
          <span className="strip-value online">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
            {currentStation?.status === "online" ? "Online" : "Active"}
          </span>
          <span className="strip-sub teal-text">Telemetry streaming</span>
        </div>

        <div className="strip-item">
          <span className="strip-label">LAST TRANSMISSION</span>
          <span className="strip-value">
            {history.length ? formatTimeAgo(history[history.length - 1].recorded_at) : "Just now"}
          </span>
          <span className="strip-sub">
            {new Date().toLocaleTimeString()} UTC+8 (Direct Radio)
          </span>
        </div>

        <div className="strip-item">
          <span className="strip-label">OPERATIONAL HEALTH</span>
          <span className="strip-value">142 Days</span>
          <span className="strip-sub">99.98% consecutive reliability</span>
        </div>
      </section>

      {stations.length > 1 && (
        <div className="telemetry-alt-sensor">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
          <span>
            {(() => {
              const alt = stations.find((s) => s.id !== currentStation?.id);
              return (
                <>
                  Alternate station: <strong>{alt?.name}</strong> ({alt?.station_code || `ST-${alt?.id}`}) • Telemetry grid active
                </>
              );
            })()}
          </span>
        </div>
      )}

      {/* 3. System Activity & Log */}
      <section className="system-activity-card">
        <header className="activity-header">
          <div>
            <h3 className="activity-title">System Activity & Log</h3>
            <p className="activity-subtitle">
              Consolidated river network telemetry actions and automated triggers
            </p>
          </div>
          <Link to="/admin/alerts" className="activity-view-all">
            View all ({alerts.length})
          </Link>
        </header>

        <div className="activity-list-container">
          {alerts.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: "0.88rem" }}>No recent activity records.</p>
          ) : (
            alerts.slice(0, 5).map((item) => {
              const alertType = (item.type || "info").toLowerCase();
              return (
                <div key={item.id} className="activity-row">
                  <div className="activity-row-left">
                    <span className={`activity-dot dot-${alertType}`} />
                    <span className="activity-msg">
                      <strong>{item.title}</strong>
                      {item.message ? ` — ${item.message.slice(0, 90)}` : ""}
                    </span>
                  </div>
                  <span className="activity-time">{formatTimeAgo(item.created_at)}</span>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 4. Issue Public Announcement (Inline Form) */}
      <section className="inline-action-card">
        <div className="inline-form-header">
          <h3 className="inline-form-title">Issue Public Announcement</h3>
          <p className="inline-form-subtitle">
            Broadcast real-time flood advisories to civil defense channels and public portals.
          </p>
        </div>

        <form className="inline-form" onSubmit={handleAnnouncementSubmit}>
          <div className="form-row-2">
            <div className="form-field-group">
              <label className="field-label">BULLETIN TITLE</label>
              <input
                type="text"
                className="field-input"
                placeholder="e.g., Immediate Evacuation Order - Lowland Zones"
                value={announcementForm.title}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                required
              />
            </div>

            <div className="form-field-group">
              <label className="field-label">ALERT SEVERITY</label>
              <select
                className="field-select"
                value={announcementForm.severity}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, severity: e.target.value })}
              >
                <option value="Advisory (Level 1)">Advisory (Level 1)</option>
                <option value="Warning (Level 2)">Warning (Level 2)</option>
                <option value="Critical Evacuation (Level 3)">Critical Evacuation (Level 3)</option>
              </select>
            </div>
          </div>

          <div className="form-field-group">
            <label className="field-label">BROADCAST MESSAGE</label>
            <textarea
              className="field-textarea"
              placeholder="Detail flood heights, evacuation routes, and safe muster points..."
              value={announcementForm.body}
              onChange={(e) => setAnnouncementForm({ ...announcementForm, body: e.target.value })}
              required
            />
          </div>

          <div className="form-footer-action">
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={announcementForm.sms}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, sms: e.target.checked })}
                />
                SMS Broadcast (Civilian Registry)
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={announcementForm.web}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, web: e.target.checked })}
                />
                Public Telemetry Page & Web Banner
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={announcementForm.push}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, push: e.target.checked })}
                />
                Push Notification Network
              </label>
            </div>

            <button type="submit" className="btn-primary-telemetry" disabled={submittingAnnouncement}>
              {submittingAnnouncement ? "Publishing..." : "Publish Announcement"}
            </button>
          </div>
        </form>
      </section>

      {/* 5. Dispatch Maintenance Team (Inline Form) */}
      <section className="inline-action-card">
        <div className="inline-form-header">
          <h3 className="inline-form-title">Dispatch Maintenance Team</h3>
          <p className="inline-form-subtitle">
            Deploy field engineers for sensor calibration, telemetry repair, or power faults.
          </p>
        </div>

        <form className="inline-form" onSubmit={handleMaintenanceSubmit}>
          <div className="form-row-3">
            <div className="form-field-group">
              <label className="field-label">TARGET STATION</label>
              <select
                className="field-select"
                value={maintenanceForm.station_id}
                onChange={(e) => setMaintenanceForm({ ...maintenanceForm, station_id: e.target.value })}
              >
                <option value="">{currentStation?.name || "Station Alpha"} — {currentStation?.location || "Riverway"}</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.location}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field-group">
              <label className="field-label">ISSUE TYPE</label>
              <select
                className="field-select"
                value={maintenanceForm.issue_type}
                onChange={(e) => setMaintenanceForm({ ...maintenanceForm, issue_type: e.target.value })}
              >
                <option value="Sensor Failure / Calibration">Sensor Failure / Calibration</option>
                <option value="Camera Lens Obscured">Camera Lens Obscured</option>
                <option value="Solar / Power Loss">Solar / Power Loss</option>
                <option value="Telemetry Drift">Telemetry Drift</option>
              </select>
            </div>

            <div className="form-field-group">
              <label className="field-label">PRIORITY</label>
              <select
                className="field-select"
                value={maintenanceForm.priority}
                onChange={(e) => setMaintenanceForm({ ...maintenanceForm, priority: e.target.value })}
              >
                <option value="High (Immediate dispatch)">High (Immediate dispatch)</option>
                <option value="Medium (Within 6h)">Medium (Within 6h)</option>
                <option value="Low (Scheduled routine)">Low (Scheduled routine)</option>
              </select>
            </div>
          </div>

          <div className="form-field-group">
            <label className="field-label">OPERATIONAL NOTES & ACCESS DETAILS</label>
            <textarea
              className="field-textarea"
              placeholder="Provide access gate codes, hazard notices, and equipment required..."
              value={maintenanceForm.notes}
              onChange={(e) => setMaintenanceForm({ ...maintenanceForm, notes: e.target.value })}
              required
            />
          </div>

          <div className="form-footer-action" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn-primary-telemetry" disabled={submittingMaintenance}>
              {submittingMaintenance ? "Dispatching..." : "Dispatch team"}
            </button>
          </div>

          <div className="dispatch-recent-status">
            <span>
              <strong>Most recent dispatch:</strong> {recentDispatch}
            </span>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <DashboardLayout
      title="Dashboard"
      description="Telemetry monitoring and automated alert management"
    >
      <AdminDashboardContent />
    </DashboardLayout>
  );
}
