export default function GaugeSettingsCard({
  settings,
  updateSetting,
  updateBooleanSetting,
  toBoolean,
}) {
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

        <button
          type="button"
          role="switch"
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
      </header>

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
