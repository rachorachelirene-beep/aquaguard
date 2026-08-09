import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BrainCircuit,
  Camera,
  Check,
  Database,
  Eye,
  Gauge,
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
import { cameraAgentBaseUrl as apiBaseUrl } from "../../lib/cameraAgent";
import { supabase } from "../../lib/supabase";
import GaugeSettingsCard from "./GaugeSettingsCard";
import { hasValidGaugePoints } from "./cameraSettingsUtils";

import "./CameraSettings.css";


const cameraUnavailableMessage =
  "AquaGuard Camera Agent is not running on this computer. Live camera features are available on the monitoring computer.";
const AGENT_HEALTH_INTERVAL_MS = 10000;
const AGENT_OFFLINE_BACKOFF_MS = [5000, 15000, 30000, 60000];


const defaultCameraConfiguration = {
  source_type: "rtsp",
  camera_ip: "",
  camera_username: "",
  camera_password: "",
  stream_path: "/stream2",
  webcam_index: "0",
};


const defaultSettings = {
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
  normal_level_m: "1.00",
  warning_level_m: "2.00",
  critical_level_m: "2.50",

  gauge_enabled: "true",
  gauge_points:
    "0.70,0.12;0.80,0.13;0.75,0.88;0.64,0.87",
  gauge_tick_interval_m: "0.25",
  gauge_label_interval_m: "0.50",
  waterline_row_coverage: "0.30",
  waterline_fallback_row_coverage:
    "0.08",

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


async function requestAdminCameraApi(
  apiBaseUrl,
  path,
  options = {}
) {
  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(
      "Unable to verify your administrator session."
    );
  }

  const accessToken =
    sessionData.session?.access_token;

  if (!accessToken) {
    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeout ?? 12000
  );

  try {
    const response = await fetch(
      `${apiBaseUrl}${path}`,
      {
        method: options.method ?? "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(options.body
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body: options.body
          ? JSON.stringify(options.body)
          : undefined,
      }
    );

    const responseData = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        responseData.error ||
          "The camera service could not complete the request."
      );
    }

    return responseData;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "The camera request timed out. Please check the connection.",
        { cause: error }
      );
    }

    if (error instanceof TypeError) {
      throw new Error(cameraUnavailableMessage, {
        cause: error,
      });
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
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

  const [agentState, setAgentState] =
    useState("checking");

  const [detection, setDetection] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [checking, setChecking] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [cameraConfiguration, setCameraConfiguration] =
    useState(defaultCameraConfiguration);

  const [cameraConfigurationStatus, setCameraConfigurationStatus] =
    useState(null);

  const [cameraDevices, setCameraDevices] =
    useState([]);

  const [cameraAction, setCameraAction] =
    useState("");

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

  const serviceRequestRef = useRef(null);
  const serviceWarningShownRef = useRef(false);
  const detectionWarningShownRef = useRef(false);
  const cameraConnectionRef = useRef(false);
  const cameraConfigurationLoadedRef = useRef(false);
  const cameraConfigurationLoadInFlightRef = useRef(false);

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


  const loadCameraConfiguration =
    useCallback(async () => {
      if (cameraConfigurationLoadInFlightRef.current) {
        return;
      }

      cameraConfigurationLoadInFlightRef.current = true;

      try {
        const configuration =
          await requestAdminCameraApi(
            apiBaseUrl,
            "/camera_config"
          );

        setCameraConfigurationStatus(
          configuration
        );
        cameraConfigurationLoadedRef.current = true;

        if (configuration.configured) {
          setCameraConfiguration(
            (currentConfiguration) => ({
              ...currentConfiguration,
              source_type:
                configuration.source_type,
              camera_ip:
                configuration.camera_ip ?? "",
              camera_username:
                configuration.camera_username ?? "",
              camera_password: "",
              stream_path:
                configuration.stream_path ?? "/stream2",
              webcam_index: String(
                configuration.webcam_index ?? 0
              ),
            })
          );
        }

        if (configuration.configuration_warning) {
          setErrorMessage(
            configuration.configuration_warning
          );
        }
      } catch (error) {
        cameraConfigurationLoadedRef.current = false;
        setCameraConfigurationStatus(null);
        setErrorMessage(
          error.message ||
            "Unable to load the saved camera configuration."
        );
      } finally {
        cameraConfigurationLoadInFlightRef.current = false;
      }
    }, []);


  const checkService =
    useCallback(async () => {
      const previousController = serviceRequestRef.current;
      serviceRequestRef.current = null;
      previousController?.abort();

      const controller = new AbortController();
      serviceRequestRef.current = controller;
      let timedOut = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 8000);

      try {
        setChecking(true);

        const healthResponse = await fetch(healthUrl, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!healthResponse.ok) {
          throw new Error(
            `Camera Agent returned HTTP ${healthResponse.status}.`
          );
        }

        const healthData =
          await healthResponse.json();

        if (healthData?.running !== true) {
          throw new Error(
            "The Camera Agent is not ready."
          );
        }

        const nextCameraConnected = Boolean(
          healthData.camera_connected
        );

        if (nextCameraConnected && !cameraConnectionRef.current) {
          setStreamState("loading");
          setStreamVersion((currentVersion) => currentVersion + 1);
        }

        cameraConnectionRef.current = nextCameraConnected;

        setHealth(healthData);
        setAgentState("online");
        setErrorMessage((currentMessage) =>
          currentMessage === cameraUnavailableMessage ? "" : currentMessage
        );
        serviceWarningShownRef.current = false;

        if (!cameraConfigurationLoadedRef.current) {
          loadCameraConfiguration();
        }

        try {
          const detectionResponse = await fetch(detectionUrl, {
            cache: "no-store",
            signal: controller.signal,
          });

          if (!detectionResponse.ok) {
            throw new Error(
              `Detection API returned HTTP ${detectionResponse.status}.`
            );
          }

          const detectionData = await detectionResponse.json();
          setDetection(detectionData);
          detectionWarningShownRef.current = false;
        } catch (error) {
          if (serviceRequestRef.current !== controller) {
            return null;
          }

          setDetection(null);

          if (
            error.name !== "AbortError" &&
            !detectionWarningShownRef.current
          ) {
            console.warn(
              "Latest Camera Agent detection unavailable:",
              error
            );
            detectionWarningShownRef.current = true;
          }
        }

        return true;
      } catch (error) {
        if (serviceRequestRef.current !== controller) {
          return null;
        }

        if (!serviceWarningShownRef.current) {
          console.error(
            "Camera API check error:",
            timedOut
              ? new Error("Camera API request timed out.")
              : error
          );
          serviceWarningShownRef.current = true;
        }

        setHealth(null);
        setDetection(null);
        setAgentState("offline");
        cameraConnectionRef.current = false;

        return false;
      } finally {
        window.clearTimeout(timeout);

        if (serviceRequestRef.current === controller) {
          serviceRequestRef.current = null;
          setChecking(false);
        }
      }
    }, [
      healthUrl,
      detectionUrl,
      loadCameraConfiguration,
    ]);


  useEffect(() => {
    async function initialize() {
      setLoading(true);

      await Promise.all([
        loadSettings(),
        loadCameraConfiguration(),
      ]);

      setLoading(false);
    }

    initialize();
  }, [
    loadSettings,
    loadCameraConfiguration,
  ]);


  useEffect(() => {
    let active = true;
    let nextCheck = null;
    let offlineFailureCount = 0;

    async function runCheck() {
      const online = await checkService();

      if (!active) {
        return;
      }

      let delay = AGENT_HEALTH_INTERVAL_MS;

      if (online === false) {
        delay = AGENT_OFFLINE_BACKOFF_MS[
          Math.min(
            offlineFailureCount,
            AGENT_OFFLINE_BACKOFF_MS.length - 1
          )
        ];
        offlineFailureCount += 1;
      } else if (online === true) {
        offlineFailureCount = 0;
      }

      nextCheck = window.setTimeout(runCheck, delay);
    }

    nextCheck = window.setTimeout(runCheck, 0);

    return () => {
      active = false;
      window.clearTimeout(nextCheck);

      const controller = serviceRequestRef.current;
      serviceRequestRef.current = null;
      controller?.abort();
    };
  }, [
    checkService,
  ]);


  useEffect(() => {
    if (
      !errorMessage &&
      !successMessage
    ) {
      return undefined;
    }

    const timer =
      window.setTimeout(() => {
        setErrorMessage("");
        setSuccessMessage("");
      }, 5000);

    return () =>
      window.clearTimeout(timer);
  }, [
    errorMessage,
    successMessage,
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

    const normalLevel = toNumber(
      settings.normal_level_m,
      -1
    );

    const warningLevel = toNumber(
      settings.warning_level_m,
      -1
    );

    const criticalLevel = toNumber(
      settings.critical_level_m,
      -1
    );

    const gaugeTick = toNumber(
      settings.gauge_tick_interval_m,
      -1
    );

    const gaugeLabel = toNumber(
      settings.gauge_label_interval_m,
      -1
    );

    const rowCoverage = toNumber(
      settings.waterline_row_coverage,
      -1
    );

    const fallbackCoverage = toNumber(
      settings.waterline_fallback_row_coverage,
      -1
    );

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

    if (
      normalLevel < minLevel ||
      warningLevel < normalLevel ||
      criticalLevel < warningLevel ||
      criticalLevel > maxLevel
    ) {
      return "Water thresholds must stay between minimum and maximum level.";
    }

    if (
      toBoolean(
        settings.gauge_enabled,
        true
      ) &&
      !hasValidGaugePoints(
        settings.gauge_points
      )
    ) {
      return "Gauge points must contain four x,y pairs.";
    }

    if (
      gaugeTick <= 0 ||
      gaugeLabel < gaugeTick
    ) {
      return "Gauge label interval must be greater than or equal to tick interval.";
    }

    if (
      rowCoverage <= 0 ||
      rowCoverage > 1 ||
      fallbackCoverage <= 0 ||
      fallbackCoverage > rowCoverage
    ) {
      return "Waterline coverage must be greater than 0 and not more than 1.";
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
        "Detector and gauge settings saved."
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


  function updateCameraConfiguration(
    key,
    value
  ) {
    setCameraConfiguration(
      (currentConfiguration) => ({
        ...currentConfiguration,
        [key]: String(value),
      })
    );
  }


  function selectCameraSource(sourceType) {
    setCameraConfiguration(
      (currentConfiguration) => ({
        ...currentConfiguration,
        source_type: sourceType,
        camera_password: "",
      })
    );
    setSuccessMessage("");
    setErrorMessage("");
  }


  function validateCameraConfiguration() {
    if (
      cameraConfiguration.source_type === "usb"
    ) {
      const webcamIndex = Number(
        cameraConfiguration.webcam_index
      );

      if (
        !Number.isInteger(webcamIndex) ||
        webcamIndex < 0 ||
        webcamIndex > 5
      ) {
        return "USB webcam index must be between 0 and 5.";
      }

      return null;
    }

    if (
      cameraConfiguration.source_type !== "rtsp"
    ) {
      return "Select a valid camera source type.";
    }

    if (!cameraConfiguration.camera_ip.trim()) {
      return "Camera IP or host is required.";
    }

    if (!cameraConfiguration.camera_username.trim()) {
      return "Camera username is required.";
    }

    if (!cameraConfiguration.stream_path.trim()) {
      return "RTSP stream path is required.";
    }

    const canKeepSavedPassword =
      cameraConfigurationStatus?.source_type === "rtsp" &&
      cameraConfigurationStatus?.password_saved;

    if (
      !cameraConfiguration.camera_password &&
      !canKeepSavedPassword
    ) {
      return "Camera password is required.";
    }

    return null;
  }


  function buildCameraConfigurationPayload() {
    if (
      cameraConfiguration.source_type === "usb"
    ) {
      return {
        source_type: "usb",
        webcam_index: Number(
          cameraConfiguration.webcam_index
        ),
      };
    }

    return {
      source_type: "rtsp",
      camera_ip:
        cameraConfiguration.camera_ip.trim(),
      camera_username:
        cameraConfiguration.camera_username.trim(),
      camera_password:
        cameraConfiguration.camera_password,
      stream_path:
        cameraConfiguration.stream_path.trim(),
    };
  }


  async function testSelectedCamera() {
    const validationError =
      validateCameraConfiguration();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    try {
      setCameraAction("testing");
      setErrorMessage("");
      setSuccessMessage("");

      const result = await requestAdminCameraApi(
        apiBaseUrl,
        "/camera_config/test",
        {
          method: "POST",
          body: buildCameraConfigurationPayload(),
        }
      );

      setSuccessMessage(
        result.message ||
          "Camera connection successful."
      );
    } catch (error) {
      setErrorMessage(
        error.message ||
          "Unable to test the camera connection."
      );
    } finally {
      setCameraAction("");
    }
  }


  async function detectUsbCameras() {
    try {
      setCameraAction("detecting");
      setErrorMessage("");
      setSuccessMessage("");

      const result = await requestAdminCameraApi(
        apiBaseUrl,
        "/camera_devices",
        { timeout: 30000 }
      );
      const detectedDevices =
        Array.isArray(result.devices)
          ? result.devices
          : [];

      setCameraDevices(detectedDevices);

      if (detectedDevices.length === 0) {
        setErrorMessage(
          "No available USB webcam was detected. Check that it is connected and not in use."
        );
        return;
      }

      const selectedIndex = Number(
        cameraConfiguration.webcam_index
      );
      const selectedStillAvailable =
        detectedDevices.some(
          (device) =>
            Number(device.index) === selectedIndex
        );

      if (!selectedStillAvailable) {
        updateCameraConfiguration(
          "webcam_index",
          detectedDevices[0].index
        );
      }

      setSuccessMessage(
        `${detectedDevices.length} USB webcam${
          detectedDevices.length === 1 ? "" : "s"
        } detected.`
      );
    } catch (error) {
      setErrorMessage(
        error.message ||
          "Unable to detect connected USB webcams."
      );
    } finally {
      setCameraAction("");
    }
  }


  async function saveCameraConfiguration() {
    const validationError =
      validateCameraConfiguration();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    try {
      setCameraAction("saving");
      setErrorMessage("");
      setSuccessMessage("");

      const result = await requestAdminCameraApi(
        apiBaseUrl,
        "/camera_config",
        {
          method: "PUT",
          body: buildCameraConfigurationPayload(),
        }
      );

      setCameraConfigurationStatus(result);
      cameraConfigurationLoadedRef.current = true;
      setCameraConfiguration(
        (currentConfiguration) => ({
          ...currentConfiguration,
          camera_password: "",
        })
      );
      setSuccessMessage(
        `${
          result.message ||
          "Camera configuration saved."
        } Changing the camera source or position may require recalibrating the water-level gauge.`
      );
      setStreamState("loading");
      setStreamVersion(
        (currentVersion) => currentVersion + 1
      );
      await checkService();
    } catch (error) {
      setErrorMessage(
        error.message ||
          "Unable to save the camera configuration."
      );
    } finally {
      setCameraAction("");
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
    agentState === "online" && Boolean(
      health?.camera_connected
    );

  const yoloLoaded =
    Boolean(health?.yolo_loaded);

  const supabaseConnected =
    Boolean(
      health?.supabase_connected
    );

  const serviceRunning =
    agentState === "online" && Boolean(health?.running);

  const cameraState =
    agentState === "online"
      ? health?.camera_state ||
        cameraConfigurationStatus?.camera_state ||
        (cameraConnected ? "connected" : "disconnected")
      : "disconnected";

  const cameraStateLabel =
    cameraState === "reconnecting"
      ? "Reconnecting"
      : cameraState === "connected"
      ? "Connected"
       : "Disconnected";

  const configuredCameraSource =
    health?.configured_camera_source ??
    health?.camera_source ??
    cameraConfigurationStatus?.source_type;

  const activeCameraSource =
    health?.active_camera_source;

  const displayedCameraSource =
    activeCameraSource ?? configuredCameraSource;

  const displayedCameraSourceLabel =
    displayedCameraSource === "rtsp"
      ? "IP Camera / RTSP"
      : displayedCameraSource === "usb" || displayedCameraSource === "webcam"
        ? "USB Webcam"
        : "No camera source";

  const configurationOrigin =
    cameraConfigurationStatus?.configuration_source ===
    "runtime_config"
      ? "Saved Configuration"
      : cameraConfigurationStatus?.configuration_source ===
        "environment"
      ? "Environment Default"
      : "Not Configured";

  const configuredSourceLabel =
    cameraConfigurationStatus?.source_type === "rtsp"
      ? "IP Camera / RTSP"
      : cameraConfigurationStatus?.source_type === "usb"
      ? "USB Webcam"
      : "No camera source";

  const usbCameraOptions =
    cameraDevices.length > 0
      ? cameraDevices
      : [
          {
            index: Number(
              cameraConfiguration.webcam_index || 0
            ),
            label: `USB Camera ${
              cameraConfiguration.webcam_index || 0
            }`,
          },
        ];

  const previewTitle =
    agentState === "offline"
      ? "Camera Agent Offline"
      : agentState === "checking"
        ? "Checking Camera Agent"
        : !cameraConnected && cameraState === "reconnecting"
          ? "Reconnecting Camera"
          : !cameraConnected
            ? "Camera Disconnected"
            : streamState === "error"
              ? "Camera Feed Unavailable"
              : "Connecting to Camera";

  const previewMessage =
    agentState === "offline"
      ? "Camera Settings are available on the AquaGuard monitoring computer."
      : agentState === "checking"
        ? "Checking the local AquaGuard Camera Agent."
        : !cameraConnected && cameraState === "reconnecting"
          ? "The Camera Agent is reconnecting the selected camera source."
          : !cameraConnected
            ? "The Camera Agent is online, but the selected camera is unavailable."
            : streamState === "error"
              ? "The camera is connected, but the live feed could not be opened."
              : "Opening the live MJPEG feed...";


  return (
    <DashboardLayout
      title="Camera Settings"
      description="Configure and test the local AquaGuard Camera Agent"
    >
      <main className="camera-settings-page">
        {errorMessage && (
          <div className="camera-message camera-message-error" role="alert">
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
              aria-label="Dismiss camera settings error"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="camera-message camera-message-success" role="status">
            <Check size={18} />

            <span>
              {successMessage}
            </span>

            <button
              type="button"
              onClick={() =>
                setSuccessMessage("")
              }
              aria-label="Dismiss camera settings message"
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
              AquaGuard Camera Agent
            </h2>

            <p>
              Configure the monitoring
              camera, test the live feed
              and review detector health.
            </p>
          </div>
        </section>

        <section className="camera-status-grid">
          <StatusCard
            icon={Server}
            title="Camera Agent"
            connected={serviceRunning}
            connectedText="Online"
            disconnectedText={
              agentState === "checking" ? "Checking" : "Offline"
            }
            description={
              checking
                ? "Checking this computer..."
                : "Local monitoring service"
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
            disconnectedText={cameraStateLabel}
            description={
              activeCameraSource
                ? `Active: ${displayedCameraSourceLabel}`
                : configuredCameraSource
                ? `Configured: ${displayedCameraSourceLabel}`
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
            {(!cameraConnected || streamState !== "ready") && (
              <div className="camera-preview-placeholder">
                {agentState === "offline" ||
                (!cameraConnected && agentState === "online") ||
                streamState === "error" ? (
                  <Video size={38} />
                ) : (
                  <Camera size={38} />
                )}

                <strong>{previewTitle}</strong>

                <span>{previewMessage}</span>
              </div>
            )}

            {cameraConnected && (
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
            )}
          </div>

          <div className="camera-detection-summary">
            <div>
              <Eye size={18} />

              <span>
                Detection
              </span>

              <strong>
                {detection?.detected === true
                  ? "Flood detected"
                  : detection?.detected === false
                    ? "No flood detected"
                    : "No detection data"}
              </strong>
            </div>

            <div>
              <Gauge size={18} />

              <span>
                Water level
              </span>

              <strong>
                {toNumber(detection?.level_m, null) == null
                  ? "--"
                  : `${toNumber(
                      detection.level_m,
                      null
                    ).toFixed(2)} m`}
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
                {toNumber(detection?.confidence, null) == null
                  ? "--"
                  : `${Math.round(
                      toNumber(
                        detection.confidence,
                        null
                      ) * 100
                    )}%`}
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
                    Monitoring camera
                  </h3>

                  <p>
                    Use an IP camera for
                    permanent monitoring or
                    a USB webcam for testing
                    and local monitoring.
                  </p>
                </div>

                <div className="camera-source-summary">
                  <span>
                    {configurationOrigin} · {configuredSourceLabel}
                  </span>

                  <strong
                    className={`camera-connection-state camera-connection-${cameraState}`}
                  >
                    {cameraStateLabel}
                  </strong>
                </div>
              </header>

              <div
                className="camera-source-options"
                aria-label="Camera source type"
              >
                <button
                  type="button"
                  className={
                    cameraConfiguration.source_type === "rtsp"
                      ? "camera-source-option camera-source-option-active"
                      : "camera-source-option"
                  }
                  onClick={() =>
                    selectCameraSource("rtsp")
                  }
                  disabled={Boolean(cameraAction)}
                >
                  <Video size={19} />

                  <span>
                    <strong>IP Camera / RTSP</strong>
                    <small>
                      Installed network camera
                    </small>
                  </span>
                </button>

                <button
                  type="button"
                  className={
                    cameraConfiguration.source_type === "usb"
                      ? "camera-source-option camera-source-option-active"
                      : "camera-source-option"
                  }
                  onClick={() =>
                    selectCameraSource("usb")
                  }
                  disabled={Boolean(cameraAction)}
                >
                  <Camera size={19} />

                  <span>
                    <strong>USB Webcam</strong>
                    <small>
                      Testing or local monitoring
                    </small>
                  </span>
                </button>
              </div>

              {cameraConfiguration.source_type === "rtsp" ? (
                <div className="camera-form-grid">
                  <label className="camera-field">
                    <span>
                      Camera IP / Host
                    </span>

                    <input
                      type="text"
                      value={cameraConfiguration.camera_ip}
                      onChange={(event) =>
                        updateCameraConfiguration(
                          "camera_ip",
                          event.target.value
                        )
                      }
                      placeholder="192.168.1.20"
                      autoComplete="off"
                      disabled={Boolean(cameraAction)}
                    />
                  </label>

                  <label className="camera-field">
                    <span>
                      Camera Username
                    </span>

                    <input
                      type="text"
                      value={cameraConfiguration.camera_username}
                      onChange={(event) =>
                        updateCameraConfiguration(
                          "camera_username",
                          event.target.value
                        )
                      }
                      placeholder="camera-user"
                      autoComplete="off"
                      disabled={Boolean(cameraAction)}
                    />
                  </label>

                  <label className="camera-field">
                    <span>
                      Camera Password
                    </span>

                    <input
                      type="password"
                      value={cameraConfiguration.camera_password}
                      onChange={(event) =>
                        updateCameraConfiguration(
                          "camera_password",
                          event.target.value
                        )
                      }
                      placeholder={
                        cameraConfigurationStatus?.password_saved
                          ? "Saved password"
                          : "Enter camera password"
                      }
                      autoComplete="new-password"
                      disabled={Boolean(cameraAction)}
                    />

                    {cameraConfigurationStatus?.source_type === "rtsp" &&
                      cameraConfigurationStatus?.password_saved && (
                        <small className="camera-field-helper">
                          Camera password is saved. Leave blank to keep the current password.
                        </small>
                      )}
                  </label>

                  <label className="camera-field">
                    <span>
                      RTSP Stream Path
                    </span>

                    <input
                      type="text"
                      value={cameraConfiguration.stream_path}
                      onChange={(event) =>
                        updateCameraConfiguration(
                          "stream_path",
                          event.target.value
                        )
                      }
                      placeholder="/stream2"
                      autoComplete="off"
                      disabled={Boolean(cameraAction)}
                    />
                  </label>
                </div>
              ) : (
                <div className="camera-usb-controls">
                  <label className="camera-field">
                    <span>USB Webcam</span>

                    <select
                      value={cameraConfiguration.webcam_index}
                      disabled={Boolean(cameraAction)}
                      onChange={(event) =>
                        updateCameraConfiguration(
                          "webcam_index",
                          event.target.value
                        )
                      }
                    >
                      {usbCameraOptions.map((device) => (
                        <option
                          key={device.index}
                          value={String(device.index)}
                        >
                          {device.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    className="camera-secondary-button"
                    onClick={detectUsbCameras}
                    disabled={Boolean(cameraAction)}
                  >
                    {cameraAction === "detecting" ? (
                      <RefreshCw
                        size={16}
                        className="camera-spin"
                      />
                    ) : (
                      <RefreshCw size={16} />
                    )}

                    {cameraAction === "detecting"
                      ? "Detecting..."
                      : "Detect Connected Webcams"}
                  </button>
                </div>
              )}

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
                    The password is sent only
                    to the protected camera
                    service and is never
                    returned to the browser.
                  </span>
                </div>
              </div>

              <div className="camera-source-actions">
                <span>
                  Changing the camera source or position may require recalibrating the water-level gauge.
                </span>

                <div>
                  <button
                    type="button"
                    className="camera-secondary-button"
                    onClick={testSelectedCamera}
                    disabled={Boolean(cameraAction)}
                  >
                    {cameraAction === "testing" ? (
                      <RefreshCw
                        size={16}
                        className="camera-spin"
                      />
                    ) : (
                      <Wifi size={16} />
                    )}

                    {cameraAction === "testing"
                      ? "Testing..."
                      : "Test Connection"}
                  </button>

                  <button
                    type="button"
                    className="camera-primary-button"
                    onClick={saveCameraConfiguration}
                    disabled={Boolean(cameraAction)}
                  >
                    {cameraAction === "saving" ? (
                      <RefreshCw
                        size={16}
                        className="camera-spin"
                      />
                    ) : (
                      <Save size={16} />
                    )}

                    {cameraAction === "saving"
                      ? "Saving..."
                      : "Save Configuration"}
                  </button>
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
                    Normal level
                  </span>

                  <div className="camera-unit-field">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        settings.normal_level_m
                      }
                      onChange={(event) =>
                        updateSetting(
                          "normal_level_m",
                          event.target.value
                        )
                      }
                    />

                    <b>m</b>
                  </div>
                </label>

                <label className="camera-field">
                  <span>
                    Warning level
                  </span>

                  <div className="camera-unit-field">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        settings.warning_level_m
                      }
                      onChange={(event) =>
                        updateSetting(
                          "warning_level_m",
                          event.target.value
                        )
                      }
                    />

                    <b>m</b>
                  </div>
                </label>

                <label className="camera-field">
                  <span>
                    Critical level
                  </span>

                  <div className="camera-unit-field">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        settings.critical_level_m
                      }
                      onChange={(event) =>
                        updateSetting(
                          "critical_level_m",
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
            <GaugeSettingsCard
              settings={settings}
              updateSetting={updateSetting}
              updateBooleanSetting={
                updateBooleanSetting
              }
              toBoolean={toBoolean}
              apiBaseUrl={apiBaseUrl}
              selectedStationId={
                selectedStationId
              }
            />

            <div className="camera-save-bar">
              <div>
                <strong>
                  Detector and gauge settings
                </strong>

                <span>
                  Save monitoring thresholds,
                  processing settings and
                  gauge calibration. Camera
                  source changes are saved
                  separately above.
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

                  Check Camera Agent
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
