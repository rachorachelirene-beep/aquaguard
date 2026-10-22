import { useEffect, useState } from "react";
import {
  Check,
  Crop,
  Layers,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";

export default function WaterRoiSettingsCard({
  apiBaseUrl,
  selectedStationId,
  requestAdminCameraApi,
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [roiEnabled, setRoiEnabled] = useState(true);
  const [activeRoiPoints, setActiveRoiPoints] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Load existing ROI configuration from backend
  useEffect(() => {
    let active = true;
    async function loadRoi() {
      if (!apiBaseUrl) return;
      try {
        setLoading(true);
        const data = await requestAdminCameraApi(
          apiBaseUrl,
          `/roi_config?station_id=${encodeURIComponent(selectedStationId || "1")}`
        );
        if (active && data) {
          setRoiEnabled(Boolean(data.roi_enabled));
          setActiveRoiPoints(data.active_roi_points || "");
        }
      } catch (err) {
        // Silently ignore if camera agent is offline
      } finally {
        if (active) setLoading(false);
      }
    }
    loadRoi();
    return () => {
      active = false;
    };
  }, [apiBaseUrl, selectedStationId, requestAdminCameraApi]);

  async function handleToggleRoi() {
    const nextState = !roiEnabled;
    setRoiEnabled(nextState);
    try {
      await requestAdminCameraApi(apiBaseUrl, "/roi_config", {
        method: "PUT",
        body: {
          station_id: selectedStationId || "default",
          roi_points: activeRoiPoints,
          roi_enabled: nextState,
        },
      });
      setMessage({
        type: "success",
        text: `Water ROI filter ${nextState ? "enabled" : "disabled"}.`,
      });
    } catch (err) {
      setRoiEnabled(!nextState);
      setMessage({
        type: "error",
        text: `Failed to update ROI: ${err.message}`,
      });
    }
  }

  async function handleSavePoints(newPointsStr) {
    try {
      setLoading(true);
      const res = await requestAdminCameraApi(apiBaseUrl, "/roi_config", {
        method: "PUT",
        body: {
          station_id: selectedStationId || "default",
          roi_points: newPointsStr,
          roi_enabled: roiEnabled,
        },
      });
      setActiveRoiPoints(newPointsStr);
      setMessage({
        type: "success",
        text: "Water ROI saved and activated live!",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: `Error saving ROI: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleClearRoi() {
    if (!window.confirm("Are you sure you want to clear the ROI for this station?")) {
      return;
    }
    await handleSavePoints("");
  }

  return (
    <section className="camera-card">
      <header className="camera-card-header">
        <div>
          <span className="camera-eyebrow">False Alarm Prevention</span>
          <h3>Water Region of Interest (ROI)</h3>
          <p>
            Constrain YOLO water detection to the physical tank or channel. Detections
            outside this polygon are discarded.
          </p>
        </div>

        <div className="camera-gauge-header-actions">
          <button
            type="button"
            className="camera-secondary-button"
            onClick={() => setPanelOpen((open) => !open)}
            disabled={loading}
          >
            <Crop size={16} />
            {panelOpen ? "Close ROI Canvas" : "Draw Water Region"}
          </button>

          <button
            type="button"
            role="switch"
            aria-label="Enable Water ROI filter"
            aria-checked={roiEnabled}
            className={`camera-toggle ${roiEnabled ? "camera-toggle-enabled" : ""}`}
            onClick={handleToggleRoi}
            disabled={loading}
          >
            <span />
          </button>
        </div>
      </header>

      {message && (
        <div
          style={{
            margin: "0.75rem 1.5rem",
            padding: "0.6rem 1rem",
            borderRadius: "6px",
            fontSize: "0.875rem",
            backgroundColor:
              message.type === "success"
                ? "rgba(34, 197, 94, 0.15)"
                : "rgba(239, 68, 68, 0.15)",
            color: message.type === "success" ? "#4ade80" : "#f87171",
            border: `1px solid ${
              message.type === "success" ? "#22c55e" : "#ef4444"
            }`,
          }}
        >
          {message.text}
        </div>
      )}

      {panelOpen && (
        <RoiCalibrationCanvas
          apiBaseUrl={apiBaseUrl}
          selectedStationId={selectedStationId}
          initialPointsStr={activeRoiPoints}
          onSave={handleSavePoints}
          onClear={handleClearRoi}
        />
      )}

      <div className="camera-form-grid" style={{ padding: "0 1.5rem 1.5rem 1.5rem" }}>
        <label className="camera-field camera-field-full">
          <span>Active ROI Points (Normalized 0..1)</span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              readOnly
              value={activeRoiPoints || "None configured (Detecting full frame)"}
              style={{
                fontFamily: "monospace",
                color: activeRoiPoints ? "inherit" : "#888",
              }}
            />
            {activeRoiPoints && (
              <button
                type="button"
                className="camera-secondary-button"
                title="Clear ROI"
                onClick={handleClearRoi}
              >
                <Trash2 size={16} />
                Clear
              </button>
            )}
          </div>
        </label>
      </div>
    </section>
  );
}

function RoiCalibrationCanvas({
  apiBaseUrl,
  selectedStationId,
  initialPointsStr,
  onSave,
  onClear,
}) {
  const [snapshotVersion, setSnapshotVersion] = useState(() => Date.now());
  const [snapshotState, setSnapshotState] = useState("loading");
  const [points, setPoints] = useState(() => {
    if (!initialPointsStr) return [];
    try {
      return initialPointsStr
        .split(";")
        .map((pair) => pair.split(",").map(Number))
        .filter((coords) => coords.length === 2 && !coords.some(isNaN));
    } catch {
      return [];
    }
  });

  const params = new URLSearchParams();
  if (selectedStationId) params.set("station_id", selectedStationId);
  params.set("v", String(snapshotVersion));
  const snapshotUrl = `${apiBaseUrl.replace(/\/+$/, "")}/snapshot?${params}`;

  function handleCanvasClick(event) {
    if (snapshotState !== "ready" || points.length >= 12) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.min(
      1,
      Math.max(0, (event.clientX - bounds.left) / bounds.width)
    );
    const y = Math.min(
      1,
      Math.max(0, (event.clientY - bounds.top) / bounds.height)
    );

    setPoints((prev) => [...prev, [x, y]]);
  }

  function handleUndo() {
    setPoints((prev) => prev.slice(0, -1));
  }

  function handleReset() {
    setPoints([]);
  }

  function handleSave() {
    if (points.length < 3) {
      alert("Please select at least 3 points to form a closed polygon boundary.");
      return;
    }
    const pointsStr = points
      .map(([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`)
      .join(";");
    onSave(pointsStr);
  }

  const polygonPoints = points
    .map(([x, y]) => `${x * 100},${y * 100}`)
    .join(" ");

  return (
    <div className="camera-calibration-panel" style={{ margin: "1rem 1.5rem" }}>
      <div className="camera-calibration-heading">
        <div>
          <span>Polygon Region Calibration</span>
          <strong>Click perimeter vertices (3 to 12 points) around the water area</strong>
        </div>

        <div className="camera-calibration-actions">
          <button
            type="button"
            className="camera-secondary-button"
            onClick={() => {
              setSnapshotState("loading");
              setSnapshotVersion(Date.now());
            }}
          >
            <RefreshCw size={14} /> Refresh Frame
          </button>
          <button
            type="button"
            className="camera-secondary-button"
            onClick={handleUndo}
            disabled={points.length === 0}
          >
            <RotateCcw size={14} /> Undo Point
          </button>
          <button
            type="button"
            className="camera-secondary-button"
            onClick={handleReset}
            disabled={points.length === 0}
          >
            <Trash2 size={14} /> Reset
          </button>
          <button
            type="button"
            className="camera-primary-button"
            onClick={handleSave}
            disabled={points.length < 3}
            style={{
              backgroundColor: points.length >= 3 ? "#0ea5e9" : undefined,
              color: "#fff",
            }}
          >
            <Check size={14} /> Save ROI ({points.length} pts)
          </button>
        </div>
      </div>

      <div
        className="camera-calibration-viewport"
        style={{
          position: "relative",
          cursor: points.length < 12 ? "crosshair" : "default",
          userSelect: "none",
          border: "2px solid #334155",
          borderRadius: "8px",
          overflow: "hidden",
          maxHeight: "500px",
          display: "flex",
          justifyContent: "center",
          backgroundColor: "#020617",
        }}
        onClick={handleCanvasClick}
      >
        <img
          src={snapshotUrl}
          alt="Camera snapshot for ROI calibration"
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            objectFit: "contain",
          }}
          onLoad={() => setSnapshotState("ready")}
          onError={() => setSnapshotState("error")}
        />

        {snapshotState === "ready" && (
          <svg
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {/* Draw Polygon fill and boundary */}
            {points.length >= 3 && (
              <polygon
                points={polygonPoints}
                fill="rgba(14, 165, 233, 0.25)"
                stroke="#0ea5e9"
                strokeWidth="0.75"
                strokeDasharray="2,1"
              />
            )}

            {/* Draw connecting lines if less than 3 points */}
            {points.length > 1 && points.length < 3 && (
              <polyline
                points={polygonPoints}
                fill="none"
                stroke="#0ea5e9"
                strokeWidth="0.75"
              />
            )}

            {/* Draw vertices */}
            {points.map(([x, y], idx) => (
              <g key={idx}>
                <circle
                  cx={x * 100}
                  cy={y * 100}
                  r="1.2"
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth="0.3"
                />
                <text
                  x={x * 100 + 1.5}
                  y={y * 100 - 1.5}
                  fill="#ffffff"
                  fontSize="3"
                  fontWeight="bold"
                >
                  {idx + 1}
                </text>
              </g>
            ))}
          </svg>
        )}

        {snapshotState === "loading" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(0,0,0,0.6)",
              color: "#94a3b8",
            }}
          >
            Loading camera frame...
          </div>
        )}
      </div>

      <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#94a3b8" }}>
        💡 <strong>Tip:</strong> Click in sequential perimeter order (clockwise or
        counter-clockwise) around the water channel. Points: {points.length}/12.
      </p>
    </div>
  );
}

