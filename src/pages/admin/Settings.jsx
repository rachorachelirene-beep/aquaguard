import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BellRing,
  Check,
  Gauge,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

import "./Settings.css";


const defaultSystemSettings = {
  system_name: "AquaGuard",
  organization_name: "Flood Monitoring System",
  emergency_contact: "911",
  timezone: "Asia/Manila",

  dashboard_refresh_seconds: "30",
  alert_refresh_seconds: "30",
  data_retention_days: "365",

  normal_level: "1.00",
  warning_level: "2.00",
  critical_level: "2.50",

  notifications_enabled: "true",
  critical_alerts_enabled: "true",
  warning_alerts_enabled: "true",
  system_alerts_enabled: "true",

  email_notifications: "false",
  sms_notifications: "false",
  auto_resolve_alerts: "false",
};


function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  return [
    "true",
    "1",
    "yes",
    "on",
  ].includes(
    String(value).trim().toLowerCase()
  );
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
  });
}


function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}) {
  return (
    <div className="settings-toggle-row">
      <div>
        <strong>{label}</strong>

        <span>{description}</span>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`settings-toggle ${
          checked
            ? "settings-toggle-enabled"
            : ""
        }`}
        onClick={() =>
          onChange(!checked)
        }
        disabled={disabled}
      >
        <span />
      </button>
    </div>
  );
}


export default function Settings() {
  const {
    user,
    profile,
    refreshProfile,
  } = useAuth();

  const [
    systemSettings,
    setSystemSettings,
  ] = useState(
    defaultSystemSettings
  );

  const [profileForm, setProfileForm] =
    useState({
      name: "",
      phone: "",
      address: "",
      avatar_url: "",
    });

  const [passwordForm, setPasswordForm] =
    useState({
      newPassword: "",
      confirmPassword: "",
    });

  const [loading, setLoading] =
    useState(true);

  const [
    savingSystem,
    setSavingSystem,
  ] = useState(false);

  const [
    savingProfile,
    setSavingProfile,
  ] = useState(false);

  const [
    savingPassword,
    setSavingPassword,
  ] = useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [lastSaved, setLastSaved] =
    useState(null);


  const loadSettings =
    useCallback(async () => {
      try {
        setLoading(true);
        setErrorMessage("");

        const { data, error } =
          await supabase
            .from("settings")
            .select("key, value");

        if (error) {
          throw error;
        }

        const loadedSettings = {
          ...defaultSystemSettings,
        };

        (data ?? []).forEach((row) => {
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

        setSystemSettings(
          loadedSettings
        );
      } catch (error) {
        console.error(
          "Settings loading error:",
          error
        );

        setErrorMessage(
          error.message ||
            "Unable to load system settings."
        );
      } finally {
        setLoading(false);
      }
    }, []);


  useEffect(() => {
    loadSettings();
  }, [loadSettings]);


  useEffect(() => {
    setProfileForm({
      name: profile?.name ?? "",
      phone: profile?.phone ?? "",
      address: profile?.address ?? "",
      avatar_url:
        profile?.avatar_url ?? "",
    });
  }, [profile]);


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


  const notificationMasterEnabled =
    toBoolean(
      systemSettings.notifications_enabled,
      true
    );


  const thresholdPreview = useMemo(
    () => [
      {
        label: "Normal",
        value: toNumber(
          systemSettings.normal_level,
          1
        ),
        className:
          "settings-threshold-normal",
      },
      {
        label: "Warning",
        value: toNumber(
          systemSettings.warning_level,
          2
        ),
        className:
          "settings-threshold-warning",
      },
      {
        label: "Critical",
        value: toNumber(
          systemSettings.critical_level,
          2.5
        ),
        className:
          "settings-threshold-critical",
      },
    ],
    [systemSettings]
  );


  function updateSystemSetting(
    key,
    value
  ) {
    setSystemSettings(
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
    updateSystemSetting(
      key,
      value ? "true" : "false"
    );
  }


  function updateProfileField(
    key,
    value
  ) {
    setProfileForm(
      (currentForm) => ({
        ...currentForm,
        [key]: value,
      })
    );
  }


  function updatePasswordField(
    key,
    value
  ) {
    setPasswordForm(
      (currentForm) => ({
        ...currentForm,
        [key]: value,
      })
    );
  }


  function validateSystemSettings() {
    const normalLevel = toNumber(
      systemSettings.normal_level,
      -1
    );

    const warningLevel = toNumber(
      systemSettings.warning_level,
      -1
    );

    const criticalLevel = toNumber(
      systemSettings.critical_level,
      -1
    );

    const dashboardRefresh = toNumber(
      systemSettings
        .dashboard_refresh_seconds,
      -1
    );

    const alertRefresh = toNumber(
      systemSettings
        .alert_refresh_seconds,
      -1
    );

    const retentionDays = toNumber(
      systemSettings
        .data_retention_days,
      -1
    );

    if (
      !systemSettings.system_name.trim()
    ) {
      return "System name is required.";
    }

    if (
      !systemSettings
        .organization_name
        .trim()
    ) {
      return "Organization name is required.";
    }

    if (
      normalLevel < 0 ||
      warningLevel < 0 ||
      criticalLevel < 0
    ) {
      return "Water-level thresholds cannot be negative.";
    }

    if (
      normalLevel >= warningLevel
    ) {
      return "Normal level must be lower than warning level.";
    }

    if (
      warningLevel >= criticalLevel
    ) {
      return "Warning level must be lower than critical level.";
    }

    if (
      dashboardRefresh < 5 ||
      dashboardRefresh > 300
    ) {
      return "Dashboard refresh must be between 5 and 300 seconds.";
    }

    if (
      alertRefresh < 5 ||
      alertRefresh > 300
    ) {
      return "Alert refresh must be between 5 and 300 seconds.";
    }

    if (
      retentionDays < 1 ||
      retentionDays > 3650
    ) {
      return "Data retention must be between 1 and 3650 days.";
    }

    return null;
  }


  async function saveSystemSettings(
    event
  ) {
    event.preventDefault();

    const validationError =
      validateSystemSettings();

    if (validationError) {
      setErrorMessage(
        validationError
      );

      return;
    }

    try {
      setSavingSystem(true);
      setErrorMessage("");
      setSuccessMessage("");

      const rows = Object.entries(
        systemSettings
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

      const savedAt =
        new Date().toISOString();

      setLastSaved(savedAt);

      setSuccessMessage(
        "System settings saved successfully."
      );
    } catch (error) {
      console.error(
        "System settings save error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to save system settings."
      );
    } finally {
      setSavingSystem(false);
    }
  }


  async function saveProfile(event) {
    event.preventDefault();

    if (!profileForm.name.trim()) {
      setErrorMessage(
        "Full name is required."
      );

      return;
    }

    try {
      setSavingProfile(true);
      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase
        .from("profiles")
        .update({
          name:
            profileForm.name.trim(),

          phone:
            profileForm.phone.trim() ||
            null,

          address:
            profileForm.address.trim() ||
            null,

          avatar_url:
            profileForm.avatar_url.trim() ||
            null,
        })
        .eq("id", profile.id);

      if (error) {
        throw error;
      }

      await refreshProfile();

      setSuccessMessage(
        "Profile updated successfully."
      );
    } catch (error) {
      console.error(
        "Profile update error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to update profile."
      );
    } finally {
      setSavingProfile(false);
    }
  }


  async function changePassword(event) {
    event.preventDefault();

    const {
      newPassword,
      confirmPassword,
    } = passwordForm;

    if (newPassword.length < 8) {
      setErrorMessage(
        "Password must contain at least 8 characters."
      );

      return;
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      setErrorMessage(
        "Password confirmation does not match."
      );

      return;
    }

    try {
      setSavingPassword(true);
      setErrorMessage("");
      setSuccessMessage("");

      const { error } =
        await supabase.auth.updateUser({
          password: newPassword,
        });

      if (error) {
        throw error;
      }

      setPasswordForm({
        newPassword: "",
        confirmPassword: "",
      });

      setSuccessMessage(
        "Account password changed successfully."
      );
    } catch (error) {
      console.error(
        "Password update error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to change password."
      );
    } finally {
      setSavingPassword(false);
    }
  }


  function resetDefaults() {
    setSystemSettings({
      ...defaultSystemSettings,
    });

    setSuccessMessage(
      "Default values restored. Click Save Settings to apply them."
    );
  }


  return (
    <DashboardLayout
      title="Settings"
      description="Configure AquaGuard system, alerts and administrator account"
    >
      <main className="settings-page">
        {errorMessage && (
          <div className="settings-message settings-message-error">
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
              aria-label="Close error"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="settings-message settings-message-success">
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

        <section className="settings-overview">
          <div className="settings-overview-icon">
            <Settings2 size={30} />
          </div>

          <div>
            <span className="settings-eyebrow">
              System configuration
            </span>

            <h2>
              AquaGuard Settings
            </h2>

            <p>
              Manage global flood thresholds,
              notifications, refresh intervals,
              profile details and account
              security.
            </p>
          </div>

          <div className="settings-overview-status">
            <span>
              <i />
              System online
            </span>

            <small>
              Last saved:{" "}
              {formatDateTime(lastSaved)}
            </small>
          </div>
        </section>

        {loading ? (
          <section className="settings-loading">
            <RefreshCw
              size={30}
              className="settings-spin"
            />

            <strong>
              Loading system settings...
            </strong>
          </section>
        ) : (
          <>
            <form
              className="settings-system-form"
              onSubmit={
                saveSystemSettings
              }
            >
              <section className="settings-card">
                <header className="settings-card-header">
                  <div className="settings-card-icon">
                    <Settings2 size={21} />
                  </div>

                  <div>
                    <span className="settings-eyebrow">
                      General
                    </span>

                    <h3>
                      System information
                    </h3>

                    <p>
                      Basic AquaGuard system
                      configuration.
                    </p>
                  </div>
                </header>

                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>
                      System name
                    </span>

                    <input
                      type="text"
                      value={
                        systemSettings
                          .system_name
                      }
                      onChange={(event) =>
                        updateSystemSetting(
                          "system_name",
                          event.target.value
                        )
                      }
                      required
                    />
                  </label>

                  <label className="settings-field">
                    <span>
                      Organization name
                    </span>

                    <input
                      type="text"
                      value={
                        systemSettings
                          .organization_name
                      }
                      onChange={(event) =>
                        updateSystemSetting(
                          "organization_name",
                          event.target.value
                        )
                      }
                      required
                    />
                  </label>

                  <label className="settings-field">
                    <span>
                      Emergency contact
                    </span>

                    <input
                      type="tel"
                      value={
                        systemSettings
                          .emergency_contact
                      }
                      onChange={(event) =>
                        updateSystemSetting(
                          "emergency_contact",
                          event.target.value
                        )
                      }
                      placeholder="911"
                    />
                  </label>

                  <label className="settings-field">
                    <span>Timezone</span>

                    <select
                      value={
                        systemSettings
                          .timezone
                      }
                      onChange={(event) =>
                        updateSystemSetting(
                          "timezone",
                          event.target.value
                        )
                      }
                    >
                      <option value="Asia/Manila">
                        Asia/Manila
                      </option>

                      <option value="UTC">
                        UTC
                      </option>

                      <option value="Asia/Singapore">
                        Asia/Singapore
                      </option>

                      <option value="Asia/Tokyo">
                        Asia/Tokyo
                      </option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="settings-card">
                <header className="settings-card-header">
                  <div className="settings-card-icon">
                    <Gauge size={21} />
                  </div>

                  <div>
                    <span className="settings-eyebrow">
                      Flood monitoring
                    </span>

                    <h3>
                      Default water-level
                      thresholds
                    </h3>

                    <p>
                      Used as fallback values when
                      a station has no custom
                      threshold.
                    </p>
                  </div>
                </header>

                <div className="settings-threshold-preview">
                  {thresholdPreview.map(
                    (threshold) => (
                      <article
                        key={threshold.label}
                        className={
                          threshold.className
                        }
                      >
                        <span>
                          {threshold.label}
                        </span>

                        <strong>
                          {threshold.value.toFixed(
                            2
                          )}{" "}
                          m
                        </strong>
                      </article>
                    )
                  )}
                </div>

                <div className="settings-form-grid settings-form-grid-three">
                  <label className="settings-field">
                    <span>
                      Normal level
                    </span>

                    <div className="settings-unit-input">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          systemSettings
                            .normal_level
                        }
                        onChange={(event) =>
                          updateSystemSetting(
                            "normal_level",
                            event.target.value
                          )
                        }
                        required
                      />

                      <b>m</b>
                    </div>
                  </label>

                  <label className="settings-field">
                    <span>
                      Warning level
                    </span>

                    <div className="settings-unit-input">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          systemSettings
                            .warning_level
                        }
                        onChange={(event) =>
                          updateSystemSetting(
                            "warning_level",
                            event.target.value
                          )
                        }
                        required
                      />

                      <b>m</b>
                    </div>
                  </label>

                  <label className="settings-field">
                    <span>
                      Critical level
                    </span>

                    <div className="settings-unit-input">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          systemSettings
                            .critical_level
                        }
                        onChange={(event) =>
                          updateSystemSetting(
                            "critical_level",
                            event.target.value
                          )
                        }
                        required
                      />

                      <b>m</b>
                    </div>
                  </label>
                </div>
              </section>

              <section className="settings-card">
                <header className="settings-card-header">
                  <div className="settings-card-icon">
                    <RefreshCw size={21} />
                  </div>

                  <div>
                    <span className="settings-eyebrow">
                      Performance
                    </span>

                    <h3>
                      Refresh and storage
                    </h3>

                    <p>
                      Control data refresh intervals
                      and retention duration.
                    </p>
                  </div>
                </header>

                <div className="settings-form-grid settings-form-grid-three">
                  <label className="settings-field">
                    <span>
                      Dashboard refresh
                    </span>

                    <div className="settings-unit-input">
                      <input
                        type="number"
                        min="5"
                        max="300"
                        value={
                          systemSettings
                            .dashboard_refresh_seconds
                        }
                        onChange={(event) =>
                          updateSystemSetting(
                            "dashboard_refresh_seconds",
                            event.target.value
                          )
                        }
                      />

                      <b>sec</b>
                    </div>
                  </label>

                  <label className="settings-field">
                    <span>
                      Alert refresh
                    </span>

                    <div className="settings-unit-input">
                      <input
                        type="number"
                        min="5"
                        max="300"
                        value={
                          systemSettings
                            .alert_refresh_seconds
                        }
                        onChange={(event) =>
                          updateSystemSetting(
                            "alert_refresh_seconds",
                            event.target.value
                          )
                        }
                      />

                      <b>sec</b>
                    </div>
                  </label>

                  <label className="settings-field">
                    <span>
                      Data retention
                    </span>

                    <div className="settings-unit-input">
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        value={
                          systemSettings
                            .data_retention_days
                        }
                        onChange={(event) =>
                          updateSystemSetting(
                            "data_retention_days",
                            event.target.value
                          )
                        }
                      />

                      <b>days</b>
                    </div>
                  </label>
                </div>
              </section>

              <section className="settings-card">
                <header className="settings-card-header">
                  <div className="settings-card-icon">
                    <BellRing size={21} />
                  </div>

                  <div>
                    <span className="settings-eyebrow">
                      Notifications
                    </span>

                    <h3>
                      Alert preferences
                    </h3>

                    <p>
                      Enable or disable different
                      AquaGuard alert channels.
                    </p>
                  </div>
                </header>

                <div className="settings-toggle-list">
                  <Toggle
                    checked={
                      notificationMasterEnabled
                    }
                    onChange={(value) =>
                      updateBooleanSetting(
                        "notifications_enabled",
                        value
                      )
                    }
                    label="Enable notifications"
                    description="Master control for all AquaGuard notifications."
                  />

                  <Toggle
                    checked={toBoolean(
                      systemSettings
                        .critical_alerts_enabled,
                      true
                    )}
                    onChange={(value) =>
                      updateBooleanSetting(
                        "critical_alerts_enabled",
                        value
                      )
                    }
                    label="Critical flood alerts"
                    description="Notify administrators when water reaches the critical threshold."
                    disabled={
                      !notificationMasterEnabled
                    }
                  />

                  <Toggle
                    checked={toBoolean(
                      systemSettings
                        .warning_alerts_enabled,
                      true
                    )}
                    onChange={(value) =>
                      updateBooleanSetting(
                        "warning_alerts_enabled",
                        value
                      )
                    }
                    label="Warning alerts"
                    description="Notify administrators when water reaches the warning threshold."
                    disabled={
                      !notificationMasterEnabled
                    }
                  />

                  <Toggle
                    checked={toBoolean(
                      systemSettings
                        .system_alerts_enabled,
                      true
                    )}
                    onChange={(value) =>
                      updateBooleanSetting(
                        "system_alerts_enabled",
                        value
                      )
                    }
                    label="System alerts"
                    description="Receive camera, detector and station connection alerts."
                    disabled={
                      !notificationMasterEnabled
                    }
                  />

                  <Toggle
                    checked={toBoolean(
                      systemSettings
                        .email_notifications
                    )}
                    onChange={(value) =>
                      updateBooleanSetting(
                        "email_notifications",
                        value
                      )
                    }
                    label="Email notifications"
                    description="Send important alert notifications through email."
                    disabled={
                      !notificationMasterEnabled
                    }
                  />

                  <Toggle
                    checked={toBoolean(
                      systemSettings
                        .sms_notifications
                    )}
                    onChange={(value) =>
                      updateBooleanSetting(
                        "sms_notifications",
                        value
                      )
                    }
                    label="SMS notifications"
                    description="Send critical alert notifications through SMS."
                    disabled={
                      !notificationMasterEnabled
                    }
                  />

                  <Toggle
                    checked={toBoolean(
                      systemSettings
                        .auto_resolve_alerts
                    )}
                    onChange={(value) =>
                      updateBooleanSetting(
                        "auto_resolve_alerts",
                        value
                      )
                    }
                    label="Automatically resolve alerts"
                    description="Automatically resolve alerts when the water level returns to normal."
                  />
                </div>
              </section>

              <div className="settings-save-bar">
                <div>
                  <strong>
                    System settings
                  </strong>

                  <span>
                    Save changes to the
                    Supabase settings table.
                  </span>
                </div>

                <div className="settings-save-actions">
                  <button
                    type="button"
                    className="settings-secondary-button"
                    onClick={resetDefaults}
                    disabled={savingSystem}
                  >
                    <RotateCcw size={16} />
                    Restore defaults
                  </button>

                  <button
                    type="submit"
                    className="settings-primary-button"
                    disabled={savingSystem}
                  >
                    {savingSystem ? (
                      <RefreshCw
                        size={16}
                        className="settings-spin"
                      />
                    ) : (
                      <Save size={16} />
                    )}

                    {savingSystem
                      ? "Saving..."
                      : "Save settings"}
                  </button>
                </div>
              </div>
            </form>

            <section className="settings-account-grid">
              <form
                className="settings-card"
                onSubmit={saveProfile}
              >
                <header className="settings-card-header">
                  <div className="settings-card-icon">
                    <UserRound size={21} />
                  </div>

                  <div>
                    <span className="settings-eyebrow">
                      Administrator
                    </span>

                    <h3>
                      Profile information
                    </h3>

                    <p>
                      Update your AquaGuard
                      administrator profile.
                    </p>
                  </div>
                </header>

                <div className="settings-profile-summary">
                  <div className="settings-avatar">
                    {profileForm.avatar_url ? (
                      <img
                        src={
                          profileForm.avatar_url
                        }
                        alt={
                          profileForm.name ||
                          "Administrator"
                        }
                      />
                    ) : (
                      <UserRound
                        size={30}
                      />
                    )}
                  </div>

                  <div>
                    <strong>
                      {profileForm.name ||
                        "Administrator"}
                    </strong>

                    <span>
                      {user?.email ??
                        profile?.email ??
                        "--"}
                    </span>

                    <small>
                      Role:{" "}
                      {profile?.role ??
                        "admin"}
                    </small>
                  </div>
                </div>

                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>
                      Full name
                    </span>

                    <input
                      type="text"
                      value={
                        profileForm.name
                      }
                      onChange={(event) =>
                        updateProfileField(
                          "name",
                          event.target.value
                        )
                      }
                      required
                    />
                  </label>

                  <label className="settings-field">
                    <span>Email</span>

                    <input
                      type="email"
                      value={
                        user?.email ??
                        profile?.email ??
                        ""
                      }
                      readOnly
                    />
                  </label>

                  <label className="settings-field">
                    <span>
                      Phone number
                    </span>

                    <input
                      type="tel"
                      value={
                        profileForm.phone
                      }
                      onChange={(event) =>
                        updateProfileField(
                          "phone",
                          event.target.value
                        )
                      }
                      placeholder="09XXXXXXXXX"
                    />
                  </label>

                  <label className="settings-field">
                    <span>
                      Avatar URL
                    </span>

                    <input
                      type="url"
                      value={
                        profileForm.avatar_url
                      }
                      onChange={(event) =>
                        updateProfileField(
                          "avatar_url",
                          event.target.value
                        )
                      }
                      placeholder="https://..."
                    />
                  </label>

                  <label className="settings-field settings-field-full">
                    <span>Address</span>

                    <textarea
                      rows="3"
                      value={
                        profileForm.address
                      }
                      onChange={(event) =>
                        updateProfileField(
                          "address",
                          event.target.value
                        )
                      }
                      placeholder="Complete address"
                    />
                  </label>
                </div>

                <footer className="settings-card-footer">
                  <button
                    type="submit"
                    className="settings-primary-button"
                    disabled={savingProfile}
                  >
                    {savingProfile ? (
                      <RefreshCw
                        size={16}
                        className="settings-spin"
                      />
                    ) : (
                      <Save size={16} />
                    )}

                    {savingProfile
                      ? "Saving..."
                      : "Save profile"}
                  </button>
                </footer>
              </form>

              <form
                className="settings-card"
                onSubmit={changePassword}
              >
                <header className="settings-card-header">
                  <div className="settings-card-icon">
                    <KeyRound size={21} />
                  </div>

                  <div>
                    <span className="settings-eyebrow">
                      Account security
                    </span>

                    <h3>
                      Change password
                    </h3>

                    <p>
                      Use at least eight
                      characters for your new
                      password.
                    </p>
                  </div>
                </header>

                <div className="settings-security-notice">
                  <ShieldCheck size={22} />

                  <div>
                    <strong>
                      Secure administrator
                      account
                    </strong>

                    <span>
                      Changing your password
                      updates your Supabase
                      authentication account.
                    </span>
                  </div>
                </div>

                <div className="settings-password-fields">
                  <label className="settings-field">
                    <span>
                      New password
                    </span>

                    <input
                      type="password"
                      minLength="8"
                      autoComplete="new-password"
                      value={
                        passwordForm
                          .newPassword
                      }
                      onChange={(event) =>
                        updatePasswordField(
                          "newPassword",
                          event.target.value
                        )
                      }
                      required
                    />
                  </label>

                  <label className="settings-field">
                    <span>
                      Confirm password
                    </span>

                    <input
                      type="password"
                      minLength="8"
                      autoComplete="new-password"
                      value={
                        passwordForm
                          .confirmPassword
                      }
                      onChange={(event) =>
                        updatePasswordField(
                          "confirmPassword",
                          event.target.value
                        )
                      }
                      required
                    />
                  </label>
                </div>

                <footer className="settings-card-footer">
                  <button
                    type="submit"
                    className="settings-primary-button"
                    disabled={savingPassword}
                  >
                    {savingPassword ? (
                      <RefreshCw
                        size={16}
                        className="settings-spin"
                      />
                    ) : (
                      <KeyRound size={16} />
                    )}

                    {savingPassword
                      ? "Updating..."
                      : "Change password"}
                  </button>
                </footer>
              </form>
            </section>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}