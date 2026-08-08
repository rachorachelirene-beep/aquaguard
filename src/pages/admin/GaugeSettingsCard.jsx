import { useState } from "react";
import {
  Check,
  Crosshair,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

import {
  formatGaugePoints,
  gaugePointLabels,
  isValidGaugeQuadrilateral,
} from "./cameraSettingsUtils";


export default function GaugeSettingsCard({
  settings,
  updateSetting,
  updateBooleanSetting,
  toBoolean,
  apiBaseUrl,
  selectedStationId,
}) {
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const enabled = toBoolean(
    settings.gauge_enabled,
    true
  );

  return (
    <section className="camera-card">
      <header className="camera-card-header">
        <div>
          <span className="camera-eyebrow">
            Gauge overlay
          </span>
          <h3>Virtual staff gauge</h3>
          <p>
            Draw a calibrated water ruler on
            the camera feed.
          </p>
        </div>

        <div className="camera-gauge-header-actions">
          <button
            type="button"
            className="camera-secondary-button"
            onClick={() =>
              setCalibrationOpen((isOpen) => !isOpen)
            }
            disabled={!enabled}
          >
            <Crosshair size={16} />
            {calibrationOpen
              ? "Close calibration"
              : "Auto Align Ruler"}
          </button>

          <button
            type="button"
            role="switch"
            aria-label="Enable virtual staff gauge"
            aria-checked={enabled}
            className={`camera-toggle ${
              enabled
                ? "camera-toggle-enabled"
                : ""
            }`}
            onClick={() =>
              updateBooleanSetting(
                "gauge_enabled",
                !enabled
              )
            }
          >
            <span />
          </button>
        </div>
      </header>

      {calibrationOpen && enabled && (
        <GaugeCalibrationPanel
          key={selectedStationId || "default"}
          apiBaseUrl={apiBaseUrl}
          selectedStationId={selectedStationId}
          onApply={(points) =>
            updateSetting(
              "gauge_points",
              formatGaugePoints(points)
            )
          }
        />
      )}

      <div className="camera-form-grid camera-form-grid-three">
        <label className="camera-field camera-field-full">
          <span>Gauge points</span>
          <input
            type="text"
            value={settings.gauge_points}
            onChange={(event) =>
              updateSetting(
                "gauge_points",
                event.target.value
              )
            }
            placeholder="0.70,0.12;0.80,0.13;0.75,0.88;0.64,0.87"
            disabled={!enabled}
          />
        </label>

        <IntervalField
          label="Tick interval"
          setting="gauge_tick_interval_m"
          value={settings.gauge_tick_interval_m}
          disabled={!enabled}
          updateSetting={updateSetting}
        />
        <IntervalField
          label="Label interval"
          setting="gauge_label_interval_m"
          value={settings.gauge_label_interval_m}
          disabled={!enabled}
          updateSetting={updateSetting}
        />
        <CoverageField
          label="Row coverage"
          setting="waterline_row_coverage"
          value={settings.waterline_row_coverage}
          updateSetting={updateSetting}
        />
        <CoverageField
          label="Fallback coverage"
          setting="waterline_fallback_row_coverage"
          value={settings.waterline_fallback_row_coverage}
          updateSetting={updateSetting}
        />
      </div>
    </section>
  );
}


function GaugeCalibrationPanel({
  apiBaseUrl,
  selectedStationId,
  onApply,
}) {
  const [snapshotVersion, setSnapshotVersion] = useState(() => Date.now());
  const [snapshotState, setSnapshotState] = useState("loading");
  const [points, setPoints] = useState([]);
  const [message, setMessage] = useState(null);

  const params = new URLSearchParams();

  if (selectedStationId) {
    params.set("station_id", selectedStationId);
  }

  params.set("v", String(snapshotVersion));
  const snapshotUrl = `${apiBaseUrl.replace(/\/+$/, "")}/snapshot?${params}`;
  const nextPointLabel = gaugePointLabels[points.length] ?? "Complete";
  const polygonPoints = points
    .map(([xValue, yValue]) => `${xValue * 100},${yValue * 100}`)
    .join(" ");
  const previewTicks =
    points.length === 4
      ? Array.from({ length: 13 }, (_, index) => {
          const ratio = index / 12;
          const [topLeft, topRight, bottomRight, bottomLeft] = points;

          return {
            ratio,
            left: [
              bottomLeft[0] + (topLeft[0] - bottomLeft[0]) * ratio,
              bottomLeft[1] + (topLeft[1] - bottomLeft[1]) * ratio,
            ],
            right: [
              bottomRight[0] + (topRight[0] - bottomRight[0]) * ratio,
              bottomRight[1] + (topRight[1] - bottomRight[1]) * ratio,
            ],
          };
        })
      : [];

  function captureNewSnapshot() {
    setSnapshotState("loading");
    setSnapshotVersion(Date.now());
    setPoints([]);
    setMessage(null);
  }

  function resetPoints() {
    setPoints([]);
    setMessage(null);
  }

  function selectPoint(event) {
    if (snapshotState !== "ready" || points.length >= 4) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const xValue = Math.min(
      1,
      Math.max(0, (event.clientX - bounds.left) / bounds.width)
    );
    const yValue = Math.min(
      1,
      Math.max(0, (event.clientY - bounds.top) / bounds.height)
    );

    setPoints((currentPoints) => [
      ...currentPoints,
      [xValue, yValue],
    ]);
    setMessage(null);
  }

  function applyCalibration() {
    if (points.length < 4) {
      setMessage({
        type: "error",
        text: `Select ${4 - points.length} more point${
          points.length === 3 ? "" : "s"
        } before applying the calibration.`,
      });
      return;
    }

    if (!isValidGaugeQuadrilateral(points)) {
      setMessage({
        type: "error",
        text: "The selected corners do not form a valid quadrilateral. Reset and select them again in the stated order.",
      });
      return;
    }

    onApply(points);
    setMessage({
      type: "success",
      text: "Calibration applied. Click Save settings below to persist the new gauge points.",
    });
  }

  return (
    <div className="camera-calibration-panel">
      <div className="camera-calibration-heading">
        <div>
          <span>4-point gauge calibration</span>
          <strong>
            Click the four corners of the real water-level marker in this
            order: top-left, top-right, bottom-right, bottom-left.
          </strong>
        </div>
        <div className="camera-calibration-actions">
          <button type="button" onClick={captureNewSnapshot}>
            <RefreshCw size={15} />
            New snapshot
          </button>
          <button type="button" onClick={resetPoints} disabled={!points.length}>
            <RotateCcw size={15} />
            Reset points
          </button>
        </div>
      </div>

      <ol className="camera-calibration-steps">
        {gaugePointLabels.map((label, index) => (
          <li
            key={label}
            className={
              index < points.length
                ? "complete"
                : index === points.length
                  ? "current"
                  : ""
            }
          >
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <div className="camera-calibration-workspace">
        {snapshotState !== "ready" && (
          <div className="camera-calibration-placeholder">
            {snapshotState === "error"
              ? "Snapshot unavailable. Make sure the detector is running, then retry."
              : "Capturing an unannotated camera frame..."}
          </div>
        )}

        <div
          className={`camera-calibration-image ${
            snapshotState === "ready" ? "ready" : ""
          }`}
          role="button"
          tabIndex={snapshotState === "ready" ? 0 : -1}
          aria-label={`Calibration snapshot. Next point: ${nextPointLabel}`}
          onClick={selectPoint}
        >
          <img
            src={snapshotUrl}
            alt="Current unannotated camera snapshot for ruler calibration"
            draggable="false"
            onLoad={() => setSnapshotState("ready")}
            onError={() => setSnapshotState("error")}
          />

          <svg
            className="camera-calibration-overlay"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {points.length >= 2 && (
              <polyline points={polygonPoints} />
            )}
            {points.length === 4 && (
              <polygon points={polygonPoints} />
            )}
            {previewTicks.map(({ ratio, left, right }, index) => {
              const isMajor = index % 2 === 0;
              const tickEnd = isMajor
                ? right
                : [
                    left[0] + (right[0] - left[0]) * 0.48,
                    left[1] + (right[1] - left[1]) * 0.48,
                  ];

              return (
                <line
                  key={ratio}
                  className={isMajor ? "major" : "minor"}
                  x1={left[0] * 100}
                  y1={left[1] * 100}
                  x2={tickEnd[0] * 100}
                  y2={tickEnd[1] * 100}
                />
              );
            })}
          </svg>

          {points.map(([xValue, yValue], index) => (
            <span
              className="camera-calibration-marker"
              key={`${xValue}-${yValue}`}
              style={{
                left: `${xValue * 100}%`,
                top: `${yValue * 100}%`,
              }}
            >
              {index + 1}
            </span>
          ))}
        </div>
      </div>

      <div className="camera-calibration-footer">
        <span>
          {points.length === 4
            ? "Four points selected. Review the green quadrilateral before applying."
            : `${points.length} of 4 points selected · Next: ${nextPointLabel}`}
        </span>
        <button type="button" onClick={applyCalibration}>
          <Check size={16} />
          Apply calibration
        </button>
      </div>

      {message && (
        <div className={`camera-calibration-message ${message.type}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}


function IntervalField({
  label,
  setting,
  value,
  disabled,
  updateSetting,
}) {
  return (
    <label className="camera-field">
      <span>{label}</span>
      <div className="camera-unit-field">
        <input
          type="number"
          min="0.05"
          step="0.05"
          value={value}
          onChange={(event) =>
            updateSetting(
              setting,
              event.target.value
            )
          }
          disabled={disabled}
        />
        <b>m</b>
      </div>
    </label>
  );
}


function CoverageField({
  label,
  setting,
  value,
  updateSetting,
}) {
  return (
    <label className="camera-field">
      <span>{label}</span>
      <input
        type="number"
        min="0.01"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) =>
          updateSetting(
            setting,
            event.target.value
          )
        }
      />
    </label>
  );
}
