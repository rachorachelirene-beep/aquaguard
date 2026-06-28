import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  Check,
  CircleOff,
  Edit3,
  Gauge,
  MapPin,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  TriangleAlert,
  Waves,
  X,
} from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";

import "./MonitoringStations.css";


const emptyForm = {
  name: "",
  location: "",
  station_code: "",
  status: "online",
  normal_level: "1.00",
  warning_level: "2.00",
  critical_level: "2.50",
};


function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function formatLevel(value) {
  return `${toNumber(value).toFixed(2)} m`;
}


function formatDateTime(value) {
  if (!value) {
    return "No reading";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "No reading";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


function normalizeStatus(value) {
  const status = String(
    value ?? "offline"
  ).toLowerCase();

  if (
    status === "active" ||
    status === "connected"
  ) {
    return "online";
  }

  if (
    status === "inactive" ||
    status === "disconnected"
  ) {
    return "offline";
  }

  return status;
}


function getStatusDetails(value) {
  const status = normalizeStatus(value);

  if (status === "online") {
    return {
      label: "Online",
      className: "station-status-online",
      icon: Radio,
    };
  }

  if (status === "maintenance") {
    return {
      label: "Maintenance",
      className: "station-status-maintenance",
      icon: Settings,
    };
  }

  return {
    label: "Offline",
    className: "station-status-offline",
    icon: CircleOff,
  };
}


function getWaterStatus(
  level,
  warningLevel,
  criticalLevel
) {
  const currentLevel = toNumber(level);
  const warning = toNumber(
    warningLevel,
    2
  );
  const critical = toNumber(
    criticalLevel,
    2.5
  );

  if (currentLevel >= critical) {
    return {
      label: "Critical",
      className: "water-status-critical",
    };
  }

  if (currentLevel >= warning) {
    return {
      label: "Warning",
      className: "water-status-warning",
    };
  }

  return {
    label: "Normal",
    className: "water-status-normal",
  };
}


export default function MonitoringStations() {
  const [stations, setStations] =
    useState([]);

  const [latestReadings, setLatestReadings] =
    useState(new Map());

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [deleting, setDeleting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [searchText, setSearchText] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [modalMode, setModalMode] =
    useState(null);

  const [selectedStation, setSelectedStation] =
    useState(null);

  const [stationToDelete, setStationToDelete] =
    useState(null);

  const [form, setForm] =
    useState(emptyForm);


  const loadStations =
    useCallback(async () => {
      try {
        setLoading(true);
        setErrorMessage("");

        const [
          stationsResult,
          readingsResult,
        ] = await Promise.all([
          supabase
            .from("stations")
            .select(
              [
                "id",
                "name",
                "location",
                "station_code",
                "status",
                "normal_level",
                "warning_level",
                "critical_level",
              ].join(",")
            )
            .order("name", {
              ascending: true,
            }),

          supabase
            .from("water_levels")
            .select(
              [
                "id",
                "station_id",
                "level_m",
                "rainfall_mm",
                "recorded_at",
              ].join(",")
            )
            .order("recorded_at", {
              ascending: false,
            })
            .limit(1000),
        ]);

        const firstError = [
          stationsResult.error,
          readingsResult.error,
        ].find(Boolean);

        if (firstError) {
          throw firstError;
        }

        const stationRows =
          stationsResult.data ?? [];

        const readingRows =
          readingsResult.data ?? [];

        const newestByStation =
          new Map();

        readingRows.forEach((reading) => {
          const key = String(
            reading.station_id
          );

          if (!newestByStation.has(key)) {
            newestByStation.set(
              key,
              reading
            );
          }
        });

        setStations(stationRows);
        setLatestReadings(
          newestByStation
        );
      } catch (error) {
        console.error(
          "Monitoring stations loading error:",
          error
        );

        setErrorMessage(
          error.message ||
            "Unable to load monitoring stations."
        );
      } finally {
        setLoading(false);
      }
    }, []);


  useEffect(() => {
    loadStations();
  }, [loadStations]);


  useEffect(() => {
    const stationChannel = supabase
      .channel(
        "admin-monitoring-stations"
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stations",
        },
        loadStations
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "water_levels",
        },
        loadStations
      )
      .subscribe();

    return () => {
      supabase.removeChannel(
        stationChannel
      );
    };
  }, [loadStations]);


  useEffect(() => {
    if (
      !errorMessage &&
      !successMessage
    ) {
      return undefined;
    }

    const timer = window.setTimeout(
      () => {
        setErrorMessage("");
        setSuccessMessage("");
      },
      5000
    );

    return () =>
      window.clearTimeout(timer);
  }, [
    errorMessage,
    successMessage,
  ]);


  const filteredStations = useMemo(() => {
    const keyword = searchText
      .trim()
      .toLowerCase();

    return stations.filter((station) => {
      const searchableText = [
        station.name,
        station.location,
        station.station_code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !keyword ||
        searchableText.includes(keyword);

      const stationStatus =
        normalizeStatus(
          station.status
        );

      const matchesStatus =
        statusFilter === "all" ||
        stationStatus === statusFilter;

      return (
        matchesSearch &&
        matchesStatus
      );
    });
  }, [
    stations,
    searchText,
    statusFilter,
  ]);


  const statistics = useMemo(() => {
    const online = stations.filter(
      (station) =>
        normalizeStatus(
          station.status
        ) === "online"
    ).length;

    const offline = stations.filter(
      (station) =>
        normalizeStatus(
          station.status
        ) === "offline"
    ).length;

    const maintenance =
      stations.filter(
        (station) =>
          normalizeStatus(
            station.status
          ) === "maintenance"
      ).length;

    const alertStations =
      stations.filter((station) => {
        const reading =
          latestReadings.get(
            String(station.id)
          );

        if (!reading) {
          return false;
        }

        return (
          toNumber(reading.level_m) >=
          toNumber(
            station.warning_level,
            2
          )
        );
      }).length;

    return {
      total: stations.length,
      online,
      offline,
      maintenance,
      alertStations,
    };
  }, [
    stations,
    latestReadings,
  ]);


  function openCreateModal() {
    setSelectedStation(null);
    setForm(emptyForm);
    setModalMode("create");
  }


  function openEditModal(station) {
    setSelectedStation(station);

    setForm({
      name: station.name ?? "",
      location:
        station.location ?? "",
      station_code:
        station.station_code ?? "",
      status: normalizeStatus(
        station.status
      ),
      normal_level: String(
        toNumber(
          station.normal_level,
          1
        )
      ),
      warning_level: String(
        toNumber(
          station.warning_level,
          2
        )
      ),
      critical_level: String(
        toNumber(
          station.critical_level,
          2.5
        )
      ),
    });

    setModalMode("edit");
  }


  function closeModal() {
    if (submitting) {
      return;
    }

    setModalMode(null);
    setSelectedStation(null);
    setForm(emptyForm);
  }


  function updateForm(field, value) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }


  function validateForm() {
    const name = form.name.trim();
    const location =
      form.location.trim();

    const stationCode =
      form.station_code
        .trim()
        .toUpperCase();

    const normalLevel = toNumber(
      form.normal_level,
      -1
    );

    const warningLevel = toNumber(
      form.warning_level,
      -1
    );

    const criticalLevel = toNumber(
      form.critical_level,
      -1
    );

    if (
      !name ||
      !location ||
      !stationCode
    ) {
      return {
        valid: false,
        message:
          "Name, location and station code are required.",
      };
    }

    if (
      normalLevel < 0 ||
      warningLevel < 0 ||
      criticalLevel < 0
    ) {
      return {
        valid: false,
        message:
          "Water-level thresholds cannot be negative.",
      };
    }

    if (
      normalLevel >= warningLevel
    ) {
      return {
        valid: false,
        message:
          "Normal level must be lower than warning level.",
      };
    }

    if (
      warningLevel >= criticalLevel
    ) {
      return {
        valid: false,
        message:
          "Warning level must be lower than critical level.",
      };
    }

    return {
      valid: true,
      payload: {
        name,
        location,
        station_code: stationCode,
        status: form.status,
        normal_level: normalLevel,
        warning_level: warningLevel,
        critical_level: criticalLevel,
      },
    };
  }


  async function handleSubmit(event) {
    event.preventDefault();

    const validation =
      validateForm();

    if (!validation.valid) {
      setErrorMessage(
        validation.message
      );
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");

      if (modalMode === "edit") {
        const { error } = await supabase
          .from("stations")
          .update(validation.payload)
          .eq(
            "id",
            selectedStation.id
          );

        if (error) {
          throw error;
        }

        setSuccessMessage(
          "Monitoring station updated successfully."
        );
      } else {
        const { error } = await supabase
          .from("stations")
          .insert(validation.payload);

        if (error) {
          throw error;
        }

        setSuccessMessage(
          "Monitoring station created successfully."
        );
      }

      closeModal();
      await loadStations();
    } catch (error) {
      console.error(
        "Station save error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to save monitoring station."
      );
    } finally {
      setSubmitting(false);
    }
  }


  async function changeStationStatus(
    station,
    status
  ) {
    try {
      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase
        .from("stations")
        .update({ status })
        .eq("id", station.id);

      if (error) {
        throw error;
      }

      setStations((currentStations) =>
        currentStations.map(
          (currentStation) =>
            currentStation.id ===
            station.id
              ? {
                  ...currentStation,
                  status,
                }
              : currentStation
        )
      );

      setSuccessMessage(
        `${station.name} marked as ${status}.`
      );
    } catch (error) {
      console.error(
        "Station status error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to update station status."
      );
    }
  }


  async function deleteStation() {
    if (!stationToDelete) {
      return;
    }

    try {
      setDeleting(true);
      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase
        .from("stations")
        .delete()
        .eq(
          "id",
          stationToDelete.id
        );

      if (error) {
        throw error;
      }

      setStations((currentStations) =>
        currentStations.filter(
          (station) =>
            station.id !==
            stationToDelete.id
        )
      );

      setStationToDelete(null);

      setSuccessMessage(
        "Monitoring station deleted successfully."
      );
    } catch (error) {
      console.error(
        "Station delete error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to delete station. The station may still have linked readings or alerts."
      );
    } finally {
      setDeleting(false);
    }
  }


  function clearFilters() {
    setSearchText("");
    setStatusFilter("all");
  }


  return (
    <DashboardLayout
      title="Monitoring Stations"
      description="Manage flood monitoring locations and water-level thresholds"
    >
      <main className="stations-page">
        {errorMessage && (
          <div className="stations-message stations-message-error">
            <TriangleAlert size={18} />

            <span>{errorMessage}</span>

            <button
              type="button"
              onClick={() =>
                setErrorMessage("")
              }
              aria-label="Close error"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="stations-message stations-message-success">
            <Check size={18} />

            <span>
              {successMessage}
            </span>

            <button
              type="button"
              onClick={() =>
                setSuccessMessage("")
              }
              aria-label="Close message"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <section className="stations-stat-grid">
          <article className="stations-stat-card">
            <div className="stations-stat-icon stations-icon-blue">
              <Radio size={21} />
            </div>

            <div>
              <span>Total stations</span>

              <strong>
                {statistics.total}
              </strong>

              <small>
                Registered locations
              </small>
            </div>
          </article>

          <article className="stations-stat-card">
            <div className="stations-stat-icon stations-icon-green">
              <Activity size={21} />
            </div>

            <div>
              <span>Online</span>

              <strong>
                {statistics.online}
              </strong>

              <small>
                Currently operational
              </small>
            </div>
          </article>

          <article className="stations-stat-card">
            <div className="stations-stat-icon stations-icon-gray">
              <CircleOff size={21} />
            </div>

            <div>
              <span>Offline</span>

              <strong>
                {statistics.offline}
              </strong>

              <small>
                Not connected
              </small>
            </div>
          </article>

          <article className="stations-stat-card">
            <div className="stations-stat-icon stations-icon-orange">
              <Settings size={21} />
            </div>

            <div>
              <span>Maintenance</span>

              <strong>
                {statistics.maintenance}
              </strong>

              <small>
                Under maintenance
              </small>
            </div>
          </article>

          <article className="stations-stat-card">
            <div className="stations-stat-icon stations-icon-red">
              <TriangleAlert size={21} />
            </div>

            <div>
              <span>Elevated level</span>

              <strong>
                {statistics.alertStations}
              </strong>

              <small>
                Warning or critical
              </small>
            </div>
          </article>
        </section>

        <section className="stations-toolbar">
          <div className="stations-search">
            <Search size={17} />

            <input
              type="search"
              value={searchText}
              onChange={(event) =>
                setSearchText(
                  event.target.value
                )
              }
              placeholder="Search station, location or code..."
            />
          </div>

          <label className="stations-filter">
            <span>Status</span>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value
                )
              }
            >
              <option value="all">
                All statuses
              </option>

              <option value="online">
                Online
              </option>

              <option value="offline">
                Offline
              </option>

              <option value="maintenance">
                Maintenance
              </option>
            </select>
          </label>

          <div className="stations-toolbar-actions">
            {(searchText ||
              statusFilter !==
                "all") && (
              <button
                type="button"
                className="stations-button-secondary"
                onClick={clearFilters}
              >
                <X size={16} />
                Clear
              </button>
            )}

            <button
              type="button"
              className="stations-button-secondary"
              onClick={loadStations}
              disabled={loading}
            >
              <RefreshCw
                size={16}
                className={
                  loading
                    ? "stations-spin"
                    : ""
                }
              />

              Refresh
            </button>

            <button
              type="button"
              className="stations-button-primary"
              onClick={openCreateModal}
            >
              <Plus size={17} />

              Add station
            </button>
          </div>
        </section>

        <section className="stations-list-card">
          <header className="stations-section-header">
            <div>
              <span className="stations-eyebrow">
                Station directory
              </span>

              <h2>
                Monitoring locations
              </h2>
            </div>

            <span className="stations-record-count">
              {filteredStations.length} station
              {filteredStations.length === 1
                ? ""
                : "s"}
            </span>
          </header>

          {loading ? (
            <div className="stations-empty">
              <RefreshCw
                size={30}
                className="stations-spin"
              />

              <strong>
                Loading stations...
              </strong>
            </div>
          ) : filteredStations.length === 0 ? (
            <div className="stations-empty">
              <Radio size={40} />

              <strong>
                No monitoring stations
              </strong>

              <span>
                No stations match the
                selected filters.
              </span>
            </div>
          ) : (
            <div className="stations-grid">
              {filteredStations.map(
                (station) => {
                  const status =
                    getStatusDetails(
                      station.status
                    );

                  const StatusIcon =
                    status.icon;

                  const reading =
                    latestReadings.get(
                      String(station.id)
                    );

                  const waterStatus =
                    getWaterStatus(
                      reading?.level_m,
                      station.warning_level,
                      station.critical_level
                    );

                  return (
                    <article
                      key={station.id}
                      className="station-card"
                    >
                      <header className="station-card-header">
                        <div className="station-card-icon">
                          <Radio size={22} />
                        </div>

                        <div className="station-card-title">
                          <h3>
                            {station.name}
                          </h3>

                          <span>
                            {station.station_code ||
                              "No station code"}
                          </span>
                        </div>

                        <span
                          className={`station-status ${status.className}`}
                        >
                          <StatusIcon
                            size={13}
                          />

                          {status.label}
                        </span>
                      </header>

                      <div className="station-location">
                        <MapPin size={16} />

                        <span>
                          {station.location ||
                            "No location provided"}
                        </span>
                      </div>

                      <div className="station-reading-panel">
                        <div>
                          <span>
                            Current level
                          </span>

                          <strong>
                            {reading
                              ? formatLevel(
                                  reading.level_m
                                )
                              : "--"}
                          </strong>
                        </div>

                        <span
                          className={`water-status ${waterStatus.className}`}
                        >
                          {
                            waterStatus.label
                          }
                        </span>
                      </div>

                      <div className="station-thresholds">
                        <div>
                          <span>Normal</span>

                          <strong>
                            {formatLevel(
                              station.normal_level
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>Warning</span>

                          <strong>
                            {formatLevel(
                              station.warning_level
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>Critical</span>

                          <strong>
                            {formatLevel(
                              station.critical_level
                            )}
                          </strong>
                        </div>
                      </div>

                      <div className="station-last-reading">
                        <Waves size={15} />

                        <span>
                          Last reading:{" "}
                          {formatDateTime(
                            reading?.recorded_at
                          )}
                        </span>
                      </div>

                      <footer className="station-card-actions">
                        <select
                          value={normalizeStatus(
                            station.status
                          )}
                          onChange={(event) =>
                            changeStationStatus(
                              station,
                              event.target.value
                            )
                          }
                          aria-label={`Change ${station.name} status`}
                        >
                          <option value="online">
                            Online
                          </option>

                          <option value="offline">
                            Offline
                          </option>

                          <option value="maintenance">
                            Maintenance
                          </option>
                        </select>

                        <button
                          type="button"
                          className="station-action-button"
                          onClick={() =>
                            openEditModal(
                              station
                            )
                          }
                          title="Edit station"
                        >
                          <Edit3 size={16} />
                        </button>

                        <button
                          type="button"
                          className="station-action-button station-delete-button"
                          onClick={() =>
                            setStationToDelete(
                              station
                            )
                          }
                          title="Delete station"
                        >
                          <Trash2 size={16} />
                        </button>
                      </footer>
                    </article>
                  );
                }
              )}
            </div>
          )}
        </section>

        {modalMode && (
          <div
            className="stations-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeModal();
              }
            }}
          >
            <div
              className="stations-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="station-modal-title"
            >
              <header className="stations-modal-header">
                <div>
                  <span className="stations-eyebrow">
                    {modalMode === "edit"
                      ? "Update station"
                      : "New station"}
                  </span>

                  <h2 id="station-modal-title">
                    {modalMode === "edit"
                      ? "Edit monitoring station"
                      : "Add monitoring station"}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>
              </header>

              <form
                className="stations-form"
                onSubmit={handleSubmit}
              >
                <div className="stations-form-grid">
                  <label className="stations-form-field stations-form-full">
                    <span>
                      Station name
                    </span>

                    <input
                      type="text"
                      value={form.name}
                      onChange={(event) =>
                        updateForm(
                          "name",
                          event.target.value
                        )
                      }
                      placeholder="Example: Brgy Bucana Station"
                      required
                    />
                  </label>

                  <label className="stations-form-field">
                    <span>
                      Station code
                    </span>

                    <input
                      type="text"
                      value={
                        form.station_code
                      }
                      onChange={(event) =>
                        updateForm(
                          "station_code",
                          event.target.value
                            .toUpperCase()
                        )
                      }
                      placeholder="BUC-001"
                      required
                    />
                  </label>

                  <label className="stations-form-field">
                    <span>Status</span>

                    <select
                      value={form.status}
                      onChange={(event) =>
                        updateForm(
                          "status",
                          event.target.value
                        )
                      }
                    >
                      <option value="online">
                        Online
                      </option>

                      <option value="offline">
                        Offline
                      </option>

                      <option value="maintenance">
                        Maintenance
                      </option>
                    </select>
                  </label>

                  <label className="stations-form-field stations-form-full">
                    <span>Location</span>

                    <input
                      type="text"
                      value={form.location}
                      onChange={(event) =>
                        updateForm(
                          "location",
                          event.target.value
                        )
                      }
                      placeholder="Barangay, city or complete location"
                      required
                    />
                  </label>
                </div>

                <div className="stations-threshold-section">
                  <div className="stations-threshold-heading">
                    <Gauge size={19} />

                    <div>
                      <strong>
                        Water-level thresholds
                      </strong>

                      <span>
                        Values are measured in meters.
                      </span>
                    </div>
                  </div>

                  <div className="stations-threshold-grid">
                    <label className="stations-form-field">
                      <span>
                        Normal level
                      </span>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          form.normal_level
                        }
                        onChange={(event) =>
                          updateForm(
                            "normal_level",
                            event.target.value
                          )
                        }
                        required
                      />
                    </label>

                    <label className="stations-form-field">
                      <span>
                        Warning level
                      </span>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          form.warning_level
                        }
                        onChange={(event) =>
                          updateForm(
                            "warning_level",
                            event.target.value
                          )
                        }
                        required
                      />
                    </label>

                    <label className="stations-form-field">
                      <span>
                        Critical level
                      </span>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          form.critical_level
                        }
                        onChange={(event) =>
                          updateForm(
                            "critical_level",
                            event.target.value
                          )
                        }
                        required
                      />
                    </label>
                  </div>
                </div>

                <footer className="stations-modal-actions">
                  <button
                    type="button"
                    className="stations-button-secondary"
                    onClick={closeModal}
                    disabled={submitting}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="stations-button-primary"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <RefreshCw
                        size={16}
                        className="stations-spin"
                      />
                    ) : modalMode ===
                      "edit" ? (
                      <Edit3 size={16} />
                    ) : (
                      <Plus size={16} />
                    )}

                    {submitting
                      ? "Saving..."
                      : modalMode ===
                        "edit"
                      ? "Save changes"
                      : "Create station"}
                  </button>
                </footer>
              </form>
            </div>
          </div>
        )}

        {stationToDelete && (
          <div
            className="stations-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setStationToDelete(
                  null
                );
              }
            }}
          >
            <div
              className="stations-delete-modal"
              role="dialog"
              aria-modal="true"
            >
              <div className="stations-delete-icon">
                <Trash2 size={25} />
              </div>

              <h3>
                Delete monitoring station?
              </h3>

              <p>
                <strong>
                  {stationToDelete.name}
                </strong>{" "}
                will be permanently deleted.
                Linked readings or alerts may
                prevent deletion.
              </p>

              <div className="stations-modal-actions">
                <button
                  type="button"
                  className="stations-button-secondary"
                  onClick={() =>
                    setStationToDelete(
                      null
                    )
                  }
                  disabled={deleting}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="stations-confirm-delete"
                  onClick={deleteStation}
                  disabled={deleting}
                >
                  <Trash2 size={16} />

                  {deleting
                    ? "Deleting..."
                    : "Delete station"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}