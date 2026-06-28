import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BrainCircuit,
  Camera,
  Check,
  Clipboard,
  Database,
  Eye,
  Gauge,
  Monitor,
  Radio,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  TriangleAlert,
  Video,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";

import "./CameraSettings.css";


const cameraApiUrl =
  import.meta.env.VITE_CAMERA_API_URL ??
  "http://localhost:5000";


const defaultSettings = {
  camera_source: "webcam",
  camera_index: "0",
  camera_ip: "",
  camera_stream_path: "/stream1",

  camera_width: "1280",
  camera_height: "720",
  camera_fps: "30",
  jpeg_quality: "80",

  yolo_enabled: "true",
  yolo_model_path:
    "models/flood_best.pt",
  yolo_confidence: "0.35",
  yolo_frame_interval: "3",

  min_level_m: "0.00",
  max_level_m: "3.00",

  default_station_id: "1",
  supabase_write_interval: "5",
};


function toBoolean(value, fallback = false) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  return [
    "true",
    "1",
    "yes",
    "on",
  ].includes(
    String(value)
      .trim()
      .toLowerCase()
  );
}


function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
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
    second: "2-digit",
  });
}


function cleanBaseUrl(value) {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
}


function Toggle({
  checked,
  onChange,
  disabled = false,
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`camera-toggle ${
        checked
          ? "camera-toggle-enabled"
          : ""
      }`}
      onClick={() =>
        onChange(!checked)
      }
      disabled={disabled}
    >
      <span />
    </button>
  );
}


function StatusCard({
  icon: Icon,
  title,
  connected,
  connectedText,
  disconnectedText,
  description,
}) {
  return (
    <article className="camera-status-card">
      <div
        className={`camera-status-icon ${
          connected
            ? "camera-status-icon-online"
            : "camera-status-icon-offline"
        }`}
      >
        <Icon size={21} />
      </div>

      <div>
        <span>{title}</span>

        <strong>
          {connected
            ? connectedText
            : disconnectedText}
        </strong>

        <small>{description}</small>
      </div>
    </article>
  );
}


export default function CameraSettings() {
  const [settings, setSettings] =
    useState(defaultSettings);

  const [stations, setStations] =
    useState([]);

  const [
    selectedStationId,
    setSelectedStationId,
  ] = useState("");

  const [health, setHealth] =
    useState(null);

  const [detection, setDetection] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [checking, setChecking] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [
    streamVersion,
    setStreamVersion,
  ] = useState(1);

  const [
    streamState,
    setStreamState,
  ] = useState("loading");

  const [errorMessage, setErrorMessage] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    copiedMessage,
    setCopiedMessage,
  ] = useState("");


  const apiBaseUrl = useMemo(
    () => cleanBaseUrl(cameraApiUrl),
    []
  );


  const streamUrl = useMemo(() => {
    const params =
      new URLSearchParams();

    if (selectedStationId) {
      params.set(
        "station_id",
        selectedStationId
      );
    }

    params.set(
      "v",
      String(streamVersion)
    );

    return `${apiBaseUrl}/video_feed?${params.toString()}`;
  }, [
    apiBaseUrl,
    selectedStationId,
    streamVersion,
  ]);


  const healthUrl = useMemo(() => {
    const params =
      new URLSearchParams();

    if (selectedStationId) {
      params.set(
        "station_id",
        selectedStationId
      );
    }

    const query =
      params.toString();

    return `${apiBaseUrl}/health${
      query ? `?${query}` : ""
    }`;
  }, [
    apiBaseUrl,
    selectedStationId,
  ]);


  const detectionUrl = useMemo(() => {
    const params =
      new URLSearchParams();

    if (selectedStationId) {
      params.set(
        "station_id",
        selectedStationId
      );
    }

    const query =
      params.toString();

    return `${apiBaseUrl}/latest_detection${
      query ? `?${query}` : ""
    }`;
  }, [
    apiBaseUrl,
    selectedStationId,
  ]);


  const loadSettings =
    useCallback(async () => {
      try {
        const [
          settingsResult,
          stationsResult,
        ] = await Promise.all([
          supabase
            .from("settings")
            .select("key, value"),

          supabase
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
            }),
        ]);

        const firstError = [
          settingsResult.error,
          stationsResult.error,
        ].find(Boolean);

        if (firstError) {
          throw firstError;
        }

        const loadedSettings = {
          ...defaultSettings,
        };

        (
          settingsResult.data ?? []
        ).forEach((row) => {
          if (
            Object.hasOwn(
              loadedSettings,
              row.key
            )
          ) {
            loadedSettings[row.key] =
              String(
                row.value ??
                  loadedSettings[row.key]
              );
          }
        });

        const stationRows =
          stationsResult.data ?? [];

        setSettings(
          loadedSettings
        );

        setStations(
          stationRows
        );

        setSelectedStationId(
          (currentValue) => {
            if (
              currentValue &&
              stationRows.some(
                (station) =>
                  String(
                    station.id
                  ) ===
                  String(
                    currentValue
                  )
              )
            ) {
              return currentValue;
            }

            const savedStationId =
              loadedSettings
                .default_station_id;

            if (
              stationRows.some(
                (station) =>
                  String(
                    station.id
                  ) ===
                  String(
                    savedStationId
                  )
              )
            ) {
              return String(
                savedStationId
              );
            }

            return stationRows[0]?.id
              ? String(
                  stationRows[0].id
                )
              : "";
          }
        );
      } catch (error) {
        console.error(
          "Camera settings loading error:",
          error
        );

        setErrorMessage(
          error.message ||
            "Unable to load camera settings."
        );
      }
    }, []);


  const checkService =
    useCallback(async () => {
      try {
        setChecking(true);
        setErrorMessage("");

        const [
          healthResponse,
          detectionResponse,
        ] = await Promise.all([
          fetch(healthUrl, {
            cache: "no-store",
          }),

          fetch(detectionUrl, {
            cache: "no-store",
          }),
        ]);

        if (!healthResponse.ok) {
          throw new Error(
            `Camera API returned HTTP ${healthResponse.status}.`
          );
        }

        if (
          !detectionResponse.ok
        ) {
          throw new Error(
            `Detection API returned HTTP ${detectionResponse.status}.`
          );
        }

        const healthData =
          await healthResponse.json();

        const detectionData =
          await detectionResponse.json();

        setHealth(healthData);
        setDetection(
          detectionData
        );
      } catch (error) {
        console.error(
          "Camera API check error:",
          error
        );

        setHealth(null);
        setDetection(null);

        setErrorMessage(
          "Unable to connect to the camera service. Start detector/stream_api.py and try again."
        );
      } finally {
        setChecking(false);
      }
    }, [
      healthUrl,
      detectionUrl,
    ]);


  useEffect(() => {
    async function initialize() {
      setLoading(true);

      await loadSettings();

      setLoading(false);
    }

    initialize();
  }, [loadSettings]);


  useEffect(() => {
    if (!selectedStationId) {
      return undefined;
    }

    checkService();

    const interval =
      window.setInterval(
        checkService,
        10000
      );

    return () =>
      window.clearInterval(interval);
  }, [
    selectedStationId,
    checkService,
  ]);


  useEffect(() => {
    if (
      !errorMessage &&
      !successMessage &&
      !copiedMessage
    ) {
      return undefined;
    }

    const timer =
      window.setTimeout(() => {
        setErrorMessage("");
        setSuccessMessage("");
        setCopiedMessage("");
      }, 5000);

    return () =>
      window.clearTimeout(timer);
  }, [
    errorMessage,
    successMessage,
    copiedMessage,
  ]);


  function updateSetting(
    key,
    value
  ) {
    setSettings(
      (currentSettings) => ({
        ...currentSettings,
        [key]: String(value),
      })
    );
  }


  function updateBooleanSetting(
    key,
    value
  ) {
    updateSetting(
      key,
      value ? "true" : "false"
    );
  }


  function validateSettings() {
    const width = toNumber(
      settings.camera_width,
      -1
    );

    const height = toNumber(
      settings.camera_height,
      -1
    );

    const fps = toNumber(
      settings.camera_fps,
      -1
    );

    const jpegQuality = toNumber(
      settings.jpeg_quality,
      -1
    );

    const confidence = toNumber(
      settings.yolo_confidence,
      -1
    );

    const interval = toNumber(
      settings.yolo_frame_interval,
      -1
    );

    const minLevel = toNumber(
      settings.min_level_m,
      -1
    );

    const maxLevel = toNumber(
      settings.max_level_m,
      -1
    );

    if (
      settings.camera_source ===
        "rtsp" &&
      !settings.camera_ip.trim()
    ) {
      return "Camera IP address is required for RTSP mode.";
    }

    if (
      width < 320 ||
      height < 240
    ) {
      return "Camera resolution is too small.";
    }

    if (fps < 1 || fps > 120) {
      return "Camera FPS must be between 1 and 120.";
    }

    if (
      jpegQuality < 10 ||
      jpegQuality > 100
    ) {
      return "JPEG quality must be between 10 and 100.";
    }

    if (
      confidence <= 0 ||
      confidence > 1
    ) {
      return "YOLO confidence must be greater than 0 and not more than 1.";
    }

    if (interval < 1) {
      return "YOLO frame interval must be at least 1.";
    }

    if (
      minLevel < 0 ||
      maxLevel <= minLevel
    ) {
      return "Maximum water level must be greater than minimum water level.";
    }

    return null;
  }


  async function saveSettings(
    event
  ) {
    event.preventDefault();

    const validationError =
      validateSettings();

    if (validationError) {
      setErrorMessage(
        validationError
      );

      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      const nextSettings = {
        ...settings,
        default_station_id:
          selectedStationId ||
          settings.default_station_id,
      };

      const rows = Object.entries(
        nextSettings
      ).map(([key, value]) => ({
        key,
        value: String(value),
      }));

      const { error } = await supabase
        .from("settings")
        .upsert(rows, {
          onConflict: "key",
        });

      if (error) {
        throw error;
      }

      setSettings(
        nextSettings
      );

      setSuccessMessage(
        "Camera settings saved. Copy the generated .env configuration and restart the detector to apply camera hardware changes."
      );
    } catch (error) {
      console.error(
        "Camera settings save error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to save camera settings."
      );
    } finally {
      setSaving(false);
    }
  }


  const envConfiguration =
    useMemo(() => {
      const lines = [
        `CAMERA_SOURCE=${settings.camera_source}`,
        `CAMERA_INDEX=${settings.camera_index}`,
        `CAMERA_WIDTH=${settings.camera_width}`,
        `CAMERA_HEIGHT=${settings.camera_height}`,
        `CAMERA_FPS=${settings.camera_fps}`,
        `JPEG_QUALITY=${settings.jpeg_quality}`,
        "",
        `CAMERA_IP=${settings.camera_ip}`,
        `CAMERA_STREAM_PATH=${settings.camera_stream_path}`,
        "CAMERA_USERNAME=YOUR_CAMERA_USERNAME",
        "CAMERA_PASSWORD=YOUR_CAMERA_PASSWORD",
        "",
        `YOLO_ENABLED=${settings.yolo_enabled}`,
        `YOLO_MODEL_PATH=${settings.yolo_model_path}`,
        `YOLO_CONFIDENCE=${settings.yolo_confidence}`,
        `YOLO_FRAME_INTERVAL=${settings.yolo_frame_interval}`,
        "",
        `MIN_LEVEL_M=${settings.min_level_m}`,
        `MAX_LEVEL_M=${settings.max_level_m}`,
        `DEFAULT_STATION_ID=${
          selectedStationId ||
          settings.default_station_id
        }`,
        `SUPABASE_WRITE_INTERVAL=${settings.supabase_write_interval}`,
      ];

      return lines.join("\n");
    }, [
      settings,
      selectedStationId,
    ]);


  async function copyEnvironment() {
    try {
      await navigator.clipboard.writeText(
        envConfiguration
      );

      setCopiedMessage(
        "Detector .env configuration copied."
      );
    } catch (error) {
      console.error(
        "Clipboard error:",
        error
      );

      setErrorMessage(
        "Unable to copy automatically. Select and copy the configuration manually."
      );
    }
  }


  function refreshStream() {
    setStreamState("loading");

    setStreamVersion(
      (currentVersion) =>
        currentVersion + 1
    );

    checkService();
  }


  const selectedStation =
    stations.find(
      (station) =>
        String(station.id) ===
        String(selectedStationId)
    ) ?? null;


  const cameraConnected =
    Boolean(
      health?.camera_connected
    );

  const yoloLoaded =
    Boolean(health?.yolo_loaded);

  const supabaseConnected =
    Boolean(
      health?.supabase_connected
    );

  const serviceRunning =
    Boolean(health?.running);


  return (
    <DashboardLayout
      title="Camera Settings"
      description="Configure and test the AquaGuard camera and AI detector service"
    >
      <main className="camera-settings-page">
        {errorMessage && (
          <div className="camera-message camera-message-error">
            <TriangleAlert
              size={18}
            />

            <span>
              {errorMessage}
            </span>

            <button
              type="button"
              onClick={() =>
                setErrorMessage("")
              }
            >
              <X size={16} />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="camera-message camera-message-success">
            <Check size={18} />

            <span>
              {successMessage}
            </span>

            <button
              type="button"
              onClick={() =>
                setSuccessMessage("")
              }
            >
              <X size={16} />
            </button>
          </div>
        )}

        {copiedMessage && (
          <div className="camera-message camera-message-info">
            <Clipboard size={18} />

            <span>
              {copiedMessage}
            </span>

            <button
              type="button"
              onClick={() =>
                setCopiedMessage("")
              }
            >
              <X size={16} />
            </button>
          </div>
        )}

        <section className="camera-page-heading">
          <div className="camera-heading-icon">
            <Camera size={30} />
          </div>

          <div>
            <span className="camera-eyebrow">
              Camera and AI detector
            </span>

            <h2>
              AquaGuard Camera Service
            </h2>

            <p>
              Test the live feed, inspect
              detector health and prepare
              the camera configuration.
            </p>
          </div>

          <div className="camera-api-address">
            <span>Camera API</span>

            <strong>
              {apiBaseUrl}
            </strong>
          </div>
        </section>

        <section className="camera-status-grid">
          <StatusCard
            icon={Server}
            title="Flask service"
            connected={serviceRunning}
            connectedText="Running"
            disconnectedText="Offline"
            description={
              checking
                ? "Checking service..."
                : "Camera API status"
            }
          />

          <StatusCard
            icon={
              cameraConnected
                ? Wifi
                : WifiOff
            }
            title="Camera"
            connected={
              cameraConnected
            }
            connectedText="Connected"
            disconnectedText="Disconnected"
            description={
              health?.camera_source
                ? `Source: ${health.camera_source}`
                : "No camera connection"
            }
          />

          <StatusCard
            icon={BrainCircuit}
            title="YOLO model"
            connected={yoloLoaded}
            connectedText="Loaded"
            disconnectedText="Not loaded"
            description={
              health?.yolo_enabled
                ? "Detection enabled"
                : "Detection disabled"
            }
          />

          <StatusCard
            icon={Database}
            title="Supabase"
            connected={
              supabaseConnected
            }
            connectedText="Connected"
            disconnectedText="Disconnected"
            description="Detector database connection"
          />
        </section>

        <section className="camera-preview-card">
          <header className="camera-card-header">
            <div>
              <span className="camera-eyebrow">
                Live camera preview
              </span>

              <h3>
                {selectedStation?.name ??
                  "Monitoring camera"}
              </h3>

              <p>
                {selectedStation?.location ??
                  "Select a monitoring station"}
              </p>
            </div>

            <div className="camera-preview-actions">
              <label>
                <span>Station</span>

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
                      No stations
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

              <button
                type="button"
                onClick={
                  refreshStream
                }
                disabled={checking}
              >
                <RefreshCw
                  size={16}
                  className={
                    checking
                      ? "camera-spin"
                      : ""
                  }
                />

                Refresh
              </button>
            </div>
          </header>

          <div className="camera-preview">
            {streamState !==
              "ready" && (
              <div className="camera-preview-placeholder">
                {streamState ===
                "error" ? (
                  <Video size={38} />
                ) : (
                  <Camera size={38} />
                )}

                <strong>
                  {streamState ===
                  "error"
                    ? "Camera feed unavailable"
                    : "Connecting to camera"}
                </strong>

                <span>
                  {streamState ===
                  "error"
                    ? "Start the Python detector service and refresh the stream."
                    : "Opening the live MJPEG feed..."}
                </span>
              </div>
            )}

            <img
              key={streamVersion}
              src={streamUrl}
              alt="AquaGuard live camera feed"
              className={
                streamState ===
                "ready"
                  ? "camera-preview-visible"
                  : ""
              }
              onLoad={() =>
                setStreamState(
                  "ready"
                )
              }
              onError={() =>
                setStreamState(
                  "error"
                )
              }
            />
          </div>

          <div className="camera-detection-summary">
            <div>
              <Eye size={18} />

              <span>
                Detection
              </span>

              <strong>
                {detection?.detected
                  ? "Flood detected"
                  : "No flood detected"}
              </strong>
            </div>

            <div>
              <Gauge size={18} />

              <span>
                Water level
              </span>

              <strong>
                {detection?.level_m !==
                null
                  ? `${toNumber(
                      detection?.level_m
                    ).toFixed(2)} m`
                  : "--"}
              </strong>
            </div>

            <div>
              <BrainCircuit
                size={18}
              />

              <span>
                AI confidence
              </span>

              <strong>
                {Math.round(
                  toNumber(
                    detection?.confidence
                  ) * 100
                )}
                %
              </strong>
            </div>

            <div>
              <Radio size={18} />

              <span>
                Last frame
              </span>

              <strong>
                {formatDateTime(
                  health?.latest_frame_at
                )}
              </strong>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="camera-loading">
            <RefreshCw
              size={30}
              className="camera-spin"
            />

            <strong>
              Loading camera settings...
            </strong>
          </section>
        ) : (
          <form
            className="camera-settings-form"
            onSubmit={saveSettings}
          >
            <section className="camera-card">
              <header className="camera-card-header">
                <div>
                  <span className="camera-eyebrow">
                    Camera source
                  </span>

                  <h3>
                    Connection settings
                  </h3>

                  <p>
                    Choose a laptop webcam
                    or Tapo RTSP camera.
                  </p>
                </div>
              </header>

              <div className="camera-form-grid">
                <label className="camera-field">
                  <span>
                    Camera source
                  </span>

                  <select
                    value={
                      settings.camera_source
                    }
                    onChange={(event) =>
                      updateSetting(
                        "camera_source",
                        event.target.value
                      )
                    }
                  >
                    <option value="webcam">
                      Laptop webcam
                    </option>

                    <option value="rtsp">
                      Tapo / RTSP camera
                    </option>
                  </select>
                </label>

                <label className="camera-field">
                  <span>
                    Webcam index
                  </span>

                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={
                      settings.camera_index
                    }
                    onChange={(event) =>
                      updateSetting(
                        "camera_index",
                        event.target.value
                      )
                    }
                    disabled={
                      settings.camera_source !==
                      "webcam"
                    }
                  />
                </label>

                <label className="camera-field">
                  <span>
                    Camera IP address
                  </span>

                  <input
                    type="text"
                    value={
                      settings.camera_ip
                    }
                    onChange={(event) =>
                      updateSetting(
                        "camera_ip",
                        event.target.value
                      )
                    }
                    placeholder="192.168.254.100"
                    disabled={
                      settings.camera_source !==
                      "rtsp"
                    }
                  />
                </label>

                <label className="camera-field">
                  <span>
                    RTSP stream path
                  </span>

                  <input
                    type="text"
                    value={
                      settings.camera_stream_path
                    }
                    onChange={(event) =>
                      updateSetting(
                        "camera_stream_path",
                        event.target.value
                      )
                    }
                    placeholder="/stream1"
                    disabled={
                      settings.camera_source !==
                      "rtsp"
                    }
                  />
                </label>
              </div>

              <div className="camera-security-note">
                <ShieldCheck
                  size={21}
                />

                <div>
                  <strong>
                    Camera credentials are
                    protected
                  </strong>

                  <span>
                    Camera username and
                    password are not stored
                    in the browser or
                    Supabase. Keep them only
                    inside detector/.env.
                  </span>
                </div>
              </div>
            </section>

            <section className="camera-card">
              <header className="camera-card-header">
                <div>
                  <span className="camera-eyebrow">
                    Video stream
                  </span>

                  <h3>
                    Resolution and quality
                  </h3>

                  <p>
                    Configure the camera
                    capture size, frame rate
                    and JPEG quality.
                  </p>
                </div>
              </header>

              <div className="camera-form-grid camera-form-grid-four">
                <label className="camera-field">
                  <span>Width</span>

                  <div className="camera-unit-field">
                    <input
                      type="number"
                      min="320"
                      value={
                        settings.camera_width
                      }
                      onChange={(event) =>
                        updateSetting(
                          "camera_width",
                          event.target.value
                        )
                      }
                    />

                    <b>px</b>
                  </div>
                </label>

                <label className="camera-field">
                  <span>Height</span>

                  <div className="camera-unit-field">
                    <input
                      type="number"
                      min="240"
                      value={
                        settings.camera_height
                      }
                      onChange={(event) =>
                        updateSetting(
                          "camera_height",
                          event.target.value
                        )
                      }
                    />

                    <b>px</b>
                  </div>
                </label>

                <label className="camera-field">
                  <span>
                    Frame rate
                  </span>

                  <div className="camera-unit-field">
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={
                        settings.camera_fps
                      }
                      onChange={(event) =>
                        updateSetting(
                          "camera_fps",
                          event.target.value
                        )
                      }
                    />

                    <b>FPS</b>
                  </div>
                </label>

                <label className="camera-field">
                  <span>
                    JPEG quality
                  </span>

                  <div className="camera-unit-field">
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={
                        settings.jpeg_quality
                      }
                      onChange={(event) =>
                        updateSetting(
                          "jpeg_quality",
                          event.target.value
                        )
                      }
                    />

                    <b>%</b>
                  </div>
                </label>
              </div>
            </section>

            <section className="camera-card">
              <header className="camera-card-header">
                <div>
                  <span className="camera-eyebrow">
                    Artificial intelligence
                  </span>

                  <h3>
                    YOLO detector settings
                  </h3>

                  <p>
                    Configure the flood
                    segmentation model and
                    detection frequency.
                  </p>
                </div>

                <Toggle
                  checked={toBoolean(
                    settings.yolo_enabled,
                    true
                  )}
                  onChange={(value) =>
                    updateBooleanSetting(
                      "yolo_enabled",
                      value
                    )
                  }
                />
              </header>

              <div className="camera-form-grid">
                <label className="camera-field camera-field-full">
                  <span>
                    YOLO model path
                  </span>

                  <input
                    type="text"
                    value={
                      settings.yolo_model_path
                    }
                    onChange={(event) =>
                      updateSetting(
                        "yolo_model_path",
                        event.target.value
                      )
                    }
                    placeholder="models/flood_best.pt"
                    disabled={
                      !toBoolean(
                        settings.yolo_enabled
                      )
                    }
                  />
                </label>

                <label className="camera-field">
                  <span>
                    Confidence threshold
                  </span>

                  <input
                    type="number"
                    min="0.01"
                    max="1"
                    step="0.01"
                    value={
                      settings.yolo_confidence
                    }
                    onChange={(event) =>
                      updateSetting(
                        "yolo_confidence",
                        event.target.value
                      )
                    }
                    disabled={
                      !toBoolean(
                        settings.yolo_enabled
                      )
                    }
                  />
                </label>

                <label className="camera-field">
                  <span>
                    Frame interval
                  </span>

                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={
                      settings.yolo_frame_interval
                    }
                    onChange={(event) =>
                      updateSetting(
                        "yolo_frame_interval",
                        event.target.value
                      )
                    }
                    disabled={
                      !toBoolean(
                        settings.yolo_enabled
                      )
                    }
                  />
                </label>
              </div>
            </section>

            <section className="camera-card">
              <header className="camera-card-header">
                <div>
                  <span className="camera-eyebrow">
                    Water-level conversion
                  </span>

                  <h3>
                    Measurement settings
                  </h3>

                  <p>
                    Configure the minimum
                    and maximum estimated
                    water level.
                  </p>
                </div>
              </header>

              <div className="camera-form-grid camera-form-grid-three">
                <label className="camera-field">
                  <span>
                    Minimum level
                  </span>

                  <div className="camera-unit-field">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        settings.min_level_m
                      }
                      onChange={(event) =>
                        updateSetting(
                          "min_level_m",
                          event.target.value
                        )
                      }
                    />

                    <b>m</b>
                  </div>
                </label>

                <label className="camera-field">
                  <span>
                    Maximum level
                  </span>

                  <div className="camera-unit-field">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={
                        settings.max_level_m
                      }
                      onChange={(event) =>
                        updateSetting(
                          "max_level_m",
                          event.target.value
                        )
                      }
                    />

                    <b>m</b>
                  </div>
                </label>

                <label className="camera-field">
                  <span>
                    Database interval
                  </span>

                  <div className="camera-unit-field">
                    <input
                      type="number"
                      min="1"
                      max="3600"
                      value={
                        settings.supabase_write_interval
                      }
                      onChange={(event) =>
                        updateSetting(
                          "supabase_write_interval",
                          event.target.value
                        )
                      }
                    />

                    <b>sec</b>
                  </div>
                </label>
              </div>
            </section>

            <section className="camera-env-card">
              <header className="camera-card-header">
                <div>
                  <span className="camera-eyebrow">
                    Detector configuration
                  </span>

                  <h3>
                    Generated .env settings
                  </h3>

                  <p>
                    Copy this configuration
                    into detector/.env, add
                    the private camera
                    credentials and restart
                    stream_api.py.
                  </p>
                </div>

                <button
                  type="button"
                  className="camera-copy-button"
                  onClick={
                    copyEnvironment
                  }
                >
                  <Clipboard
                    size={16}
                  />

                  Copy
                </button>
              </header>

              <textarea
                value={envConfiguration}
                readOnly
                spellCheck="false"
              />
            </section>

            <div className="camera-save-bar">
              <div>
                <strong>
                  Camera configuration
                </strong>

                <span>
                  Hardware changes require
                  restarting the Python
                  detector service.
                </span>
              </div>

              <div>
                <button
                  type="button"
                  className="camera-secondary-button"
                  onClick={
                    checkService
                  }
                  disabled={checking}
                >
                  <Radio size={16} />

                  Test service
                </button>

                <button
                  type="submit"
                  className="camera-primary-button"
                  disabled={saving}
                >
                  {saving ? (
                    <RefreshCw
                      size={16}
                      className="camera-spin"
                    />
                  ) : (
                    <Save size={16} />
                  )}

                  {saving
                    ? "Saving..."
                    : "Save settings"}
                </button>
              </div>
            </div>
          </form>
        )}
      </main>
    </DashboardLayout>
  );
}