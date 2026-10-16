import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
// @ts-ignore - Side-effect CSS import
import "leaflet/dist/leaflet.css";

import { supabase } from "../lib/supabase";
// @ts-ignore - Side-effect CSS import
import "./FloodMap.css";

// Ensure Leaflet CJS/ESM interop compatibility across all Vite/Rollup bundlers
const leaflet: typeof L = ((L as any)?.default ?? L) as typeof L;

export interface StationData {
  id: number | string;
  name: string;
  location?: string;
  latitude: number;
  longitude: number;
  normal_level?: number;
  warning_level?: number;
  critical_level?: number;
  current_level?: number;
  status?: "normal" | "warning" | "critical" | string;
  latest_snapshot_url?: string;
  last_updated?: string;
}

export interface FloodMapProps {
  center?: [number, number];
  zoom?: number;
  height?: string;
  className?: string;
  selectedStationId?: number | string | null;
  onStationSelect?: (station: StationData | null) => void;
}

// Default regional center: Davao City
const DEFAULT_CENTER: [number, number] = [7.0707, 125.6087];
const DEFAULT_ZOOM = 13;

function createStationDivIcon(status: string) {
  const normalizedStatus = (status || "normal").toLowerCase();

  let statusClass = "flood-pin-normal";
  let pulseHtml = "";

  if (normalizedStatus === "critical") {
    statusClass = "flood-pin-critical";
    pulseHtml = `
      <div class="flood-pin-pulse"></div>
      <div class="flood-pin-pulse flood-pin-pulse-delayed"></div>
    `;
  } else if (normalizedStatus === "warning") {
    statusClass = "flood-pin-warning";
  }

  const iconSvg =
    normalizedStatus === "critical"
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
      : normalizedStatus === "warning"
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>`;

  const html = `
    <div class="flood-pin-wrapper ${statusClass}">
      ${pulseHtml}
      <div class="flood-pin-icon">
        ${iconSvg}
      </div>
    </div>
  `;

  return leaflet.divIcon({
    html,
    className: "custom-flood-pin-container",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

function MapController({
  activeStationId,
  stations,
  markerRefs,
}: {
  activeStationId: string;
  stations: StationData[];
  markerRefs: React.MutableRefObject<Record<string, any>>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!stations || stations.length === 0) return;

    if (activeStationId && activeStationId !== "all") {
      const target = stations.find(
        (s) => String(s.id) === String(activeStationId)
      );
      if (target) {
        map.flyTo([target.latitude, target.longitude], Math.max(map.getZoom(), 15), {
          duration: 1.0,
        });
        const marker = markerRefs.current?.[String(target.id)];
        if (marker && typeof marker.openPopup === "function") {
          setTimeout(() => {
            try {
              marker.openPopup();
            } catch {
              // ignore if unmounted
            }
          }, 350);
        }
        return;
      }
    }

    if (stations.length === 1) {
      map.flyTo([stations[0].latitude, stations[0].longitude], 14, { duration: 1.0 });
    } else if (stations.length > 1 && leaflet.latLngBounds) {
      const bounds = leaflet.latLngBounds(
        stations.map((s) => [s.latitude, s.longitude])
      );
      map.fitBounds(bounds, { padding: [55, 55], maxZoom: 14, animate: true });
    }
  }, [activeStationId, stations, map, markerRefs]);

  return null;
}

export const FloodMap: React.FC<FloodMapProps> = ({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  height = "520px",
  className = "",
  selectedStationId,
  onStationSelect,
}) => {
  const [stations, setStations] = useState<StationData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [internalStationId, setInternalStationId] = useState<string>("all");
  const markerRefs = useRef<Record<string, any>>({});

  const effectiveStationId =
    selectedStationId !== undefined && selectedStationId !== null && selectedStationId !== ""
      ? String(selectedStationId)
      : internalStationId;

  useEffect(() => {
    let isMounted = true;

    async function loadMapData() {
      try {
        setLoading(true);

        if (!supabase) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data: stationRows, error: stationError } = await supabase
          .from("stations")
          .select(
            "id, name, location, latitude, longitude, normal_level, warning_level, critical_level, status"
          )
          .order("id", { ascending: true });

        if (stationError) throw stationError;
        if (!stationRows || stationRows.length === 0) {
          if (isMounted) {
            setStations([]);
            setLoading(false);
          }
          return;
        }

        const stationIds = stationRows.map((s) => s.id);
        const { data: levelRows } = await supabase
          .from("water_levels")
          .select("station_id, level_m, recorded_at")
          .in("station_id", stationIds)
          .order("recorded_at", { ascending: false })
          .limit(100);

        const latestLevelsByStation: Record<
          number | string,
          { level_m: number; recorded_at: string }
        > = {};

        if (levelRows) {
          levelRows.forEach((row) => {
            if (!latestLevelsByStation[row.station_id]) {
              latestLevelsByStation[row.station_id] = {
                level_m: Number(row.level_m) || 0,
                recorded_at: row.recorded_at,
              };
            }
          });
        }

        const latestSnapshotsByStation: Record<number | string, string> = {};
        try {
          const { data: snapshotRows } = await supabase
            .from("alert_events")
            .select("station_id, image_url, created_at")
            .in("station_id", stationIds)
            .order("created_at", { ascending: false })
            .limit(50);

          if (snapshotRows) {
            snapshotRows.forEach((row) => {
              if (
                !latestSnapshotsByStation[row.station_id] &&
                row.image_url
              ) {
                latestSnapshotsByStation[row.station_id] = row.image_url;
              }
            });
          }
        } catch {
          // If alert_events table is empty or pending, continue gracefully
        }

        const mappedStations: StationData[] = stationRows
          .filter(
            (s) =>
              s.latitude !== null &&
              s.longitude !== null &&
              !isNaN(Number(s.latitude)) &&
              !isNaN(Number(s.longitude))
          )
          .map((s) => {
            const lat = Number(s.latitude);
            const lng = Number(s.longitude);
            const reading = latestLevelsByStation[s.id];
            const currentLevel = reading ? reading.level_m : 0;
            const warningLevel = Number(s.warning_level) || 2.0;
            const criticalLevel = Number(s.critical_level) || 2.5;

            let determinedStatus = "normal";
            if (currentLevel >= criticalLevel) {
              determinedStatus = "critical";
            } else if (currentLevel >= warningLevel) {
              determinedStatus = "warning";
            }

            return {
              id: s.id,
              name: s.name,
              location: s.location || "Monitoring Point",
              latitude: lat,
              longitude: lng,
              normal_level: Number(s.normal_level) || 1.0,
              warning_level: warningLevel,
              critical_level: criticalLevel,
              current_level: currentLevel,
              status: determinedStatus,
              latest_snapshot_url: latestSnapshotsByStation[s.id] || "",
              last_updated: reading ? reading.recorded_at : undefined,
            };
          });

        if (isMounted) {
          setStations(mappedStations);
        }
      } catch (err) {
        console.warn("FloodMap data loading note:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadMapData();

    if (!supabase) return;

    const channel = supabase
      .channel("flood-map-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "water_levels" },
        (payload) => {
          const newLevel = Number(payload.new?.level_m) || 0;
          const stationId = payload.new?.station_id;

          setStations((prev) =>
            prev.map((station) => {
              if (String(station.id) === String(stationId)) {
                let newStatus = "normal";
                if (newLevel >= (station.critical_level || 2.5)) {
                  newStatus = "critical";
                } else if (newLevel >= (station.warning_level || 2.0)) {
                  newStatus = "warning";
                }
                return {
                  ...station,
                  current_level: newLevel,
                  status: newStatus,
                  last_updated: payload.new?.recorded_at || new Date().toISOString(),
                };
              }
              return station;
            })
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alert_events" },
        (payload) => {
          const stationId = payload.new?.station_id;
          const imageUrl = payload.new?.image_url;
          if (stationId && imageUrl) {
            setStations((prev) =>
              prev.map((station) =>
                String(station.id) === String(stationId)
                  ? { ...station, latest_snapshot_url: imageUrl }
                  : station
              )
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stations" },
        () => {
          loadMapData();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const initialCenter = useMemo<[number, number]>(() => {
    if (stations.length > 0) {
      return [stations[0].latitude, stations[0].longitude];
    }
    return center;
  }, [stations, center]);

  function handleSelectPill(stationOrAll: StationData | "all") {
    if (stationOrAll === "all") {
      setInternalStationId("all");
      onStationSelect?.(null);
    } else {
      setInternalStationId(String(stationOrAll.id));
      onStationSelect?.(stationOrAll);
    }
  }

  return (
    <div
      className={`flood-map-container ${className}`}
      style={{ height }}
    >
      {stations.length > 0 && (
        <div className="flood-map-station-bar" role="tablist" aria-label="Monitoring stations on map">
          <button
            type="button"
            className={`flood-station-pill ${effectiveStationId === "all" ? "active" : ""}`}
            onClick={() => handleSelectPill("all")}
          >
            <span>All Barangays ({stations.length})</span>
          </button>

          {stations.map((station) => {
            const stStatus = (station.status || "normal").toLowerCase();
            const isSelected = String(effectiveStationId) === String(station.id);

            return (
              <button
                key={station.id}
                type="button"
                className={`flood-station-pill pill-${stStatus} ${isSelected ? "active" : ""}`}
                onClick={() => handleSelectPill(station)}
                title={`${station.name} — ${station.location}`}
              >
                <span className={`flood-station-dot dot-${stStatus}`} />
                <span>{station.name.replace(/ Station$/i, "")}</span>
                <span className="flood-station-pill-level">
                  {(station.current_level ?? 0).toFixed(2)}m
                </span>
              </button>
            );
          })}
        </div>
      )}

      {loading && stations.length === 0 && (
        <div style={{
          position: "absolute",
          inset: 0,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(11, 17, 32, 0.75)",
          color: "#94a3b8",
          fontSize: "14px",
          fontWeight: 500,
        }}>
          Loading real-time station map...
        </div>
      )}

      <MapContainer
        center={initialCenter}
        zoom={zoom}
        scrollWheelZoom={true}
        style={{ width: "100%", height: "100%" }}
      >
        <MapController
          activeStationId={effectiveStationId}
          stations={stations}
          markerRefs={markerRefs}
        />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {stations.map((station) => {
          const isCritical = station.status === "critical";
          const icon = createStationDivIcon(station.status || "normal");

          return (
            <React.Fragment key={station.id}>
              {isCritical && (
                <Circle
                  center={[station.latitude, station.longitude]}
                  radius={300}
                  pathOptions={{
                    color: "#ef4444",
                    fillColor: "#ef4444",
                    fillOpacity: 0.22,
                    weight: 2,
                    dashArray: "4, 8",
                    className: "danger-zone-circle",
                  }}
                />
              )}

              <Marker
                ref={(el) => {
                  if (el) {
                    markerRefs.current[String(station.id)] = el;
                  }
                }}
                position={[station.latitude, station.longitude]}
                icon={icon}
                eventHandlers={{
                  click: () => {
                    setInternalStationId(String(station.id));
                    onStationSelect?.(station);
                  },
                }}
              >
                <Popup className="custom-flood-popup">
                  <div className="flood-popup-card">
                    <div className="flood-popup-header">
                      <h4 className="flood-popup-title">{station.name}</h4>
                      <span
                        className={`flood-popup-badge badge-${station.status || "normal"}`}
                      >
                        {station.status || "Normal"}
                      </span>
                    </div>

                    <div className="flood-popup-metrics">
                      <div>
                        <span style={{ color: "#94a3b8" }}>Location:</span>{" "}
                        <span style={{ color: "#e2e8f0", fontWeight: 500 }}>
                          {station.location}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: "#94a3b8" }}>Coordinates:</span>{" "}
                        <span style={{ color: "#cbd5e1", fontFamily: "monospace", fontSize: "12px" }}>
                          {station.latitude.toFixed(5)}, {station.longitude.toFixed(5)}
                        </span>
                      </div>
                      <div style={{
                        marginTop: "8px",
                        paddingTop: "8px",
                        borderTop: "1px solid rgba(51, 65, 85, 0.6)",
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between"
                      }}>
                        <span style={{ color: "#94a3b8" }}>Water Level:</span>
                        <span className="flood-popup-level">
                          {(station.current_level ?? 0).toFixed(2)}
                          <span style={{ fontSize: "12px", fontWeight: "normal", color: "#94a3b8", marginLeft: "2px" }}>m</span>
                        </span>
                      </div>
                    </div>

                    {(station.status === "warning" || station.status === "critical") && (
                      <div className="flood-popup-snapshot-wrap">
                        {station.latest_snapshot_url ? (
                          <>
                            <img
                              src={station.latest_snapshot_url}
                              alt={`Critical alert snapshot for ${station.name}`}
                              className="flood-popup-snapshot-img"
                              loading="lazy"
                            />
                            <div className="flood-popup-snapshot-label">
                              <span>Live Flood Snapshot</span>
                              <span style={{ fontSize: "9px", color: "#f87171", fontWeight: "bold" }}>
                                VERIFIED
                              </span>
                            </div>
                          </>
                        ) : (
                          <div style={{ padding: "12px", textAlign: "center", fontSize: "12px", color: "#94a3b8" }}>
                            📷 Snapshot recording in progress...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default FloodMap;

