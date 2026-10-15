import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Layers,
  Maximize2,
  Minimize2,
  Plus,
  Settings,
  Trash2,
  Video,
  X,
} from "lucide-react";
import "./CCTVMatrix.css";

function loadStationCameras(station) {
  try {
    const saved = localStorage.getItem(`aquaguard_station_cameras_${station.id}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return [
    {
      id: `${station.id}-primary`,
      name: station.name,
      location: station.location || "Main Channel",
      channel: "CAM 01",
      isPrimary: true,
      sourceType: "rtsp",
      cameraIp: "",
      cameraUsername: "",
      cameraPassword: "",
      streamPath: "/stream2",
      webcamIndex: "0",
    },
  ];
}

function formatCctvTimestamp(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

export default function CCTVMatrix({
  selectedStation,
  stations = [],
  stationReadings = [],
  selectedStationId,
  onSelectStation,
  onExitMatrix,
  cameraApiBaseUrl = "",
  streamVersion = 0,
  cameraConnected = false,
}) {
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cctvTime, setCctvTime] = useState(() => formatCctvTimestamp(new Date()));
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCamSourceType, setNewCamSourceType] = useState("rtsp");
  const [newCamName, setNewCamName] = useState("");
  const [newCamLocation, setNewCamLocation] = useState("");
  const [newCamIp, setNewCamIp] = useState("");
  const [newCamUsername, setNewCamUsername] = useState("");
  const [newCamPassword, setNewCamPassword] = useState("");
  const [newCamStreamPath, setNewCamStreamPath] = useState("/stream2");
  const [newCamWebcamIndex, setNewCamWebcamIndex] = useState("0");

  // Edit Camera Modal State
  const [editingCam, setEditingCam] = useState(null);
  const [editCamName, setEditCamName] = useState("");
  const [editCamLocation, setEditCamLocation] = useState("");
  const [editCamSourceType, setEditCamSourceType] = useState("rtsp");
  const [editCamIp, setEditCamIp] = useState("");
  const [editCamUsername, setEditCamUsername] = useState("");
  const [editCamPassword, setEditCamPassword] = useState("");
  const [editCamStreamPath, setEditCamStreamPath] = useState("/stream2");
  const [editCamWebcamIndex, setEditCamWebcamIndex] = useState("0");

  // Resolve current station
  const station = useMemo(() => {
    return (
      selectedStation ??
      stations.find((s) => String(s.id) === String(selectedStationId)) ??
      stations[0] ?? {
        id: "default",
        name: "Brgy Bucana Station",
        location: "Brgy. Bucana, Davao City",
        warning_level: 1.5,
        critical_level: 2.0,
      }
    );
  }, [selectedStation, stations, selectedStationId]);

  const storageKey = `aquaguard_station_cameras_${station.id}`;

  // Cameras assigned to this specific station
  const [prevStationId, setPrevStationId] = useState(station.id);
  const [cameras, setCameras] = useState(() => loadStationCameras(station));

  // Sync when selected station changes without using effect to avoid cascading render lint
  if (prevStationId !== station.id) {
    setPrevStationId(station.id);
    setCameras(loadStationCameras(station));
  }

  // Live CCTV Clock updates every 1000ms
  useEffect(() => {
    const timer = setInterval(() => {
      setCctvTime(formatCctvTimestamp(new Date()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Listen to fullscreen changes
  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  const handleAddCameraSubmit = (e) => {
    e.preventDefault();
    if (!newCamName.trim()) return;

    const channelNum = cameras.length + 1;
    const newCamera = {
      id: `${station.id}-cam-${Date.now()}`,
      name: newCamName.trim(),
      location: newCamLocation.trim() || station.location || "Sector Camera",
      channel: `CAM 0${channelNum}`,
      sourceType: newCamSourceType,
      cameraIp: newCamIp.trim(),
      cameraUsername: newCamUsername.trim(),
      cameraPassword: newCamPassword.trim(),
      streamPath: newCamStreamPath.trim() || "/stream2",
      webcamIndex: newCamWebcamIndex || "0",
      isPrimary: false,
    };

    const updated = [...cameras, newCamera];
    setCameras(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      // ignore
    }

    setNewCamName("");
    setNewCamLocation("");
    setNewCamIp("");
    setNewCamUsername("");
    setNewCamPassword("");
    setNewCamStreamPath("/stream2");
    setNewCamWebcamIndex("0");
    setIsAddModalOpen(false);
  };

  const handleOpenEditModal = (cam, e) => {
    e.stopPropagation();
    setEditingCam(cam);
    setEditCamName(cam.name || "");
    setEditCamLocation(cam.location || "");
    setEditCamSourceType(cam.sourceType || "rtsp");
    setEditCamIp(cam.cameraIp || "");
    setEditCamUsername(cam.cameraUsername || "");
    setEditCamPassword(cam.cameraPassword || "");
    setEditCamStreamPath(cam.streamPath || "/stream2");
    setEditCamWebcamIndex(cam.webcamIndex || "0");
  };

  const handleEditCameraSubmit = (e) => {
    e.preventDefault();
    if (!editingCam) return;

    const updated = cameras.map((c) => {
      if (c.id === editingCam.id) {
        return {
          ...c,
          name: editCamName.trim() || c.name,
          location: editCamLocation.trim() || c.location,
          sourceType: editCamSourceType,
          cameraIp: editCamIp.trim(),
          cameraUsername: editCamUsername.trim(),
          cameraPassword: editCamPassword.trim(),
          streamPath: editCamStreamPath.trim() || "/stream2",
          webcamIndex: editCamWebcamIndex || "0",
        };
      }
      return c;
    });

    setCameras(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      // ignore
    }
    setEditingCam(null);
  };

  const handleDeleteCamera = (camId) => {
    const updated = cameras.filter((c) => c.id !== camId);
    setCameras(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Lookup latest reading for this station
  const readingMap = useMemo(() => {
    const map = new Map();
    for (const item of stationReadings) {
      if (item?.station?.id != null) {
        map.set(String(item.station.id), item.reading);
      }
    }
    return map;
  }, [stationReadings]);

  const reading = readingMap.get(String(station.id));
  const level = reading?.level_m != null ? Number(reading.level_m) : null;
  const warningLevel = Number(station.warning_level ?? 1.5);
  const criticalLevel = Number(station.critical_level ?? 2.0);

  let riskState = "normal";
  let riskLabel = "NORMAL";
  if (level != null) {
    if (level >= criticalLevel) {
      riskState = "critical";
      riskLabel = "CRITICAL";
    } else if (level >= warningLevel) {
      riskState = "warning";
      riskLabel = "WARNING";
    }
  }

  return (
    <section
      className={`cctv-matrix-container ${isFullscreen ? "fullscreen-mode" : ""}`}
      ref={containerRef}
      aria-label={`CCTV Surveillance Matrix for ${station.name}`}
    >
      <header className="cctv-matrix-header">
        <div className="cctv-matrix-title-wrap">
          <span className="cctv-matrix-badge">
            <span className="cctv-rec-dot" />
            2x2 CCTV Matrix
          </span>
          <h2 className="cctv-matrix-title">
            {station.name.toUpperCase()} ({cameras.length} {cameras.length === 1 ? "CAM" : "CAMS"})
          </h2>
        </div>

        <div className="cctv-matrix-actions">
          {cameras.length < 4 && (
            <button
              type="button"
              className="cctv-btn cctv-btn-success"
              onClick={() => setIsAddModalOpen(true)}
              title="Add another CCTV camera to this station"
            >
              <Plus size={14} />
              Add Camera
            </button>
          )}

          <button
            type="button"
            className="cctv-btn"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Video Wall"}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>

          {onExitMatrix && (
            <button
              type="button"
              className="cctv-btn cctv-btn-primary"
              onClick={onExitMatrix}
              title="Return to Single Station Detailed View"
            >
              <Layers size={14} />
              Single Focus View
            </button>
          )}
        </div>
      </header>

      <div
        className="cctv-grid-2x2"
        style={{
          gridTemplateColumns:
            cameras.length <= 1
              ? "1fr"
              : "repeat(2, 1fr)",
        }}
      >
        {cameras.map((cam, index) => {
          // Live stream for the active primary camera
          const hasLiveStream =
            cameraConnected &&
            cameraApiBaseUrl &&
            index === 0;

          const streamUrl = hasLiveStream
            ? `${cameraApiBaseUrl.replace(/\/+$/, "")}/video_feed?station_id=${station.id}&v=${streamVersion}`
            : null;

          const locationBanner = cam.location || cam.name;

          return (
            <article
              key={cam.id}
              className="cctv-quadrant"
              onClick={() => onSelectStation && onSelectStation(station.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  onSelectStation && onSelectStation(station.id);
                }
              }}
              title={`Click to focus on ${cam.name}`}
            >
              <div className="cctv-scanlines" />

              {/* Top CCTV Overlay */}
              <div className="cctv-top-overlay">
                <span className="cctv-clock-text">{cctvTime}</span>

                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span className="cctv-channel-badge">{cam.channel || `CAM 0${index + 1}`}</span>

                  <button
                    type="button"
                    className="cctv-cam-action-btn cctv-edit-cam-btn"
                    onClick={(e) => handleOpenEditModal(cam, e)}
                    title={`Edit ${cam.channel || cam.name} settings`}
                    aria-label={`Edit ${cam.channel || cam.name} settings`}
                  >
                    <Settings size={11} />
                  </button>

                  {!cam.isPrimary && (
                    <button
                      type="button"
                      className="cctv-cam-action-btn cctv-delete-cam-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCamera(cam.id);
                      }}
                      title="Remove this camera from station"
                      aria-label="Remove this camera from station"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>

              {/* Feed Content */}
              {streamUrl ? (
                <img
                  src={streamUrl}
                  alt={`CCTV feed for ${cam.name}`}
                  className="cctv-feed-img"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <div className="cctv-dark-screen" />
              )}

              {/* Bottom CCTV Overlay */}
              <div className="cctv-bottom-overlay">
                <span className="cctv-location-banner" title={locationBanner}>
                  {locationBanner}
                </span>

                <span className={`cctv-water-pill ${riskState}`}>
                  <Video size={11} />
                  {level != null ? `${level.toFixed(2)}m` : "--"} {riskLabel}
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {/* Add Camera to Station Modal */}
      {isAddModalOpen && (
        <div className="cctv-modal-backdrop" onClick={() => setIsAddModalOpen(false)}>
          <div className="cctv-modal" onClick={(e) => e.stopPropagation()}>
            <header className="cctv-modal-header">
              <h3>
                <Camera size={18} />
                Add Camera to {station.name}
              </h3>
              <button
                type="button"
                className="cctv-modal-close"
                onClick={() => setIsAddModalOpen(false)}
              >
                <X size={16} />
              </button>
            </header>

            <form onSubmit={handleAddCameraSubmit}>
              <div className="cctv-modal-body">
                {/* Source Type Toggle */}
                <div className="cctv-source-toggle">
                  <button
                    type="button"
                    className={`cctv-source-btn ${newCamSourceType === "rtsp" ? "active" : ""}`}
                    onClick={() => setNewCamSourceType("rtsp")}
                  >
                    <Video size={16} />
                    IP Camera / RTSP
                  </button>
                  <button
                    type="button"
                    className={`cctv-source-btn ${newCamSourceType === "usb" ? "active" : ""}`}
                    onClick={() => setNewCamSourceType("usb")}
                  >
                    <Camera size={16} />
                    USB Webcam
                  </button>
                </div>

                <div className="cctv-input-group">
                  <label htmlFor="cam-name">Camera Name / Label</label>
                  <input
                    id="cam-name"
                    type="text"
                    required
                    placeholder="e.g. Bucana Seawall Camera"
                    value={newCamName}
                    onChange={(e) => setNewCamName(e.target.value)}
                  />
                  <small>Example: Coastal Seawall, Purok 5 Creek, Floodway Gate</small>
                </div>

                <div className="cctv-input-group">
                  <label htmlFor="cam-loc">Location / Landmark</label>
                  <input
                    id="cam-loc"
                    type="text"
                    placeholder="e.g. Coastal Seawall Outflow"
                    value={newCamLocation}
                    onChange={(e) => setNewCamLocation(e.target.value)}
                  />
                </div>

                {newCamSourceType === "rtsp" ? (
                  <>
                    <div className="cctv-grid-2col">
                      <div className="cctv-input-group">
                        <label htmlFor="cam-ip">Camera IP / Host</label>
                        <input
                          id="cam-ip"
                          type="text"
                          required
                          placeholder="e.g. 192.168.1.51"
                          value={newCamIp}
                          onChange={(e) => setNewCamIp(e.target.value)}
                        />
                      </div>

                      <div className="cctv-input-group">
                        <label htmlFor="cam-user">Camera Username</label>
                        <input
                          id="cam-user"
                          type="text"
                          required
                          placeholder="e.g. camera-user"
                          value={newCamUsername}
                          onChange={(e) => setNewCamUsername(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="cctv-grid-2col">
                      <div className="cctv-input-group">
                        <label htmlFor="cam-pass">Camera Password</label>
                        <input
                          id="cam-pass"
                          type="password"
                          required
                          placeholder="Enter camera password"
                          value={newCamPassword}
                          onChange={(e) => setNewCamPassword(e.target.value)}
                        />
                      </div>

                      <div className="cctv-input-group">
                        <label htmlFor="cam-path">RTSP Stream Path</label>
                        <input
                          id="cam-path"
                          type="text"
                          placeholder="/stream2"
                          value={newCamStreamPath}
                          onChange={(e) => setNewCamStreamPath(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="cctv-input-group">
                    <label htmlFor="cam-index">Webcam Device Index</label>
                    <input
                      id="cam-index"
                      type="number"
                      min="0"
                      max="9"
                      value={newCamWebcamIndex}
                      onChange={(e) => setNewCamWebcamIndex(e.target.value)}
                    />
                    <small>0 = Default webcam, 1 = Secondary USB camera</small>
                  </div>
                )}
              </div>

              <footer className="cctv-modal-footer">
                <button
                  type="button"
                  className="cctv-btn"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cctv-btn cctv-btn-primary"
                >
                  Add Camera Channel
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* Edit Camera Settings Modal */}
      {editingCam && (
        <div className="cctv-modal-backdrop" onClick={() => setEditingCam(null)}>
          <div className="cctv-modal" onClick={(e) => e.stopPropagation()}>
            <header className="cctv-modal-header">
              <h3>
                <Settings size={18} />
                Edit Settings: {editingCam.channel || "Camera"}
              </h3>
              <button
                type="button"
                className="cctv-modal-close"
                onClick={() => setEditingCam(null)}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </header>

            <form onSubmit={handleEditCameraSubmit}>
              <div className="cctv-modal-body">
                {/* Source Type Toggle */}
                <div className="cctv-source-toggle">
                  <button
                    type="button"
                    className={`cctv-source-btn ${editCamSourceType === "rtsp" ? "active" : ""}`}
                    onClick={() => setEditCamSourceType("rtsp")}
                  >
                    <Video size={16} />
                    IP Camera / RTSP
                  </button>
                  <button
                    type="button"
                    className={`cctv-source-btn ${editCamSourceType === "usb" ? "active" : ""}`}
                    onClick={() => setEditCamSourceType("usb")}
                  >
                    <Camera size={16} />
                    USB Webcam
                  </button>
                </div>

                <div className="cctv-input-group">
                  <label htmlFor="edit-cam-name">Camera Name / Label</label>
                  <input
                    id="edit-cam-name"
                    type="text"
                    required
                    placeholder="e.g. Bucana Main Pier Camera"
                    value={editCamName}
                    onChange={(e) => setEditCamName(e.target.value)}
                  />
                  <small>Identifier for this camera feed in the station matrix.</small>
                </div>

                <div className="cctv-input-group">
                  <label htmlFor="edit-cam-loc">Location / Landmark / Sector</label>
                  <input
                    id="edit-cam-loc"
                    type="text"
                    placeholder="e.g. Upstream Bridge Section"
                    value={editCamLocation}
                    onChange={(e) => setEditCamLocation(e.target.value)}
                  />
                </div>

                {editCamSourceType === "rtsp" ? (
                  <>
                    <div className="cctv-grid-2col">
                      <div className="cctv-input-group">
                        <label htmlFor="edit-cam-ip">Camera IP / Host</label>
                        <input
                          id="edit-cam-ip"
                          type="text"
                          required
                          placeholder="e.g. 192.168.1.50 or Tailscale IP"
                          value={editCamIp}
                          onChange={(e) => setEditCamIp(e.target.value)}
                        />
                      </div>

                      <div className="cctv-input-group">
                        <label htmlFor="edit-cam-user">Camera Username</label>
                        <input
                          id="edit-cam-user"
                          type="text"
                          required
                          placeholder="e.g. tapo-user"
                          value={editCamUsername}
                          onChange={(e) => setEditCamUsername(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="cctv-grid-2col">
                      <div className="cctv-input-group">
                        <label htmlFor="edit-cam-pass">Camera Password</label>
                        <input
                          id="edit-cam-pass"
                          type="password"
                          placeholder="Update password or leave current"
                          value={editCamPassword}
                          onChange={(e) => setEditCamPassword(e.target.value)}
                        />
                      </div>

                      <div className="cctv-input-group">
                        <label htmlFor="edit-cam-path">RTSP Stream Path</label>
                        <input
                          id="edit-cam-path"
                          type="text"
                          placeholder="/stream2"
                          value={editCamStreamPath}
                          onChange={(e) => setEditCamStreamPath(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="cctv-input-group">
                    <label htmlFor="edit-cam-index">Webcam Device Index</label>
                    <input
                      id="edit-cam-index"
                      type="number"
                      min="0"
                      max="9"
                      value={editCamWebcamIndex}
                      onChange={(e) => setEditCamWebcamIndex(e.target.value)}
                    />
                    <small>0 = Default webcam, 1 = Secondary USB camera</small>
                  </div>
                )}

                {editingCam.isPrimary && (
                  <div className="cctv-primary-hint">
                    <span>💡 This is the station's Primary AI Detector feed.</span>
                    <a href="/admin/camera-settings" className="cctv-direct-link">
                      Open Full AI Waterline Calibration & Controls →
                    </a>
                  </div>
                )}
              </div>

              <footer className="cctv-modal-footer">
                <button
                  type="button"
                  className="cctv-btn"
                  onClick={() => setEditingCam(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cctv-btn cctv-btn-primary"
                >
                  Save Camera Settings
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
