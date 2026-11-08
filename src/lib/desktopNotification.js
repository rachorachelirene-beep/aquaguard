/**
 * HTML5 Desktop Notification helper for AquaGuard BDRRMC flood alerts.
 * Dispatches native OS notifications when water level reaches WARNING or CRITICAL.
 */

export function isDesktopNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getDesktopNotificationPermission() {
  if (!isDesktopNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestDesktopNotificationPermission() {
  if (!isDesktopNotificationSupported()) return "unsupported";
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return Notification.permission;
  }
}

export function triggerDesktopNotification(alert, type) {
  if (!isDesktopNotificationSupported()) return null;
  if (Notification.permission !== "granted") return null;

  try {
    const isCritical = String(type || "").trim().toLowerCase() === "critical";
    const stationLabel =
      alert?.station_name ||
      (alert?.station_id ? `Station ${alert.station_id}` : "Monitoring Station");
    const title = isCritical
      ? `🚨 AQUAGUARD CRITICAL FLOOD: ${stationLabel}`
      : `⚠️ AQUAGUARD FLOOD WARNING: ${stationLabel}`;
    const body =
      alert?.message ||
      alert?.title ||
      (isCritical
        ? "Water level has breached CRITICAL threshold! Immediate evacuation protocol advised."
        : "Water level has reached WARNING threshold. Continuous monitoring required.");

    const notification = new Notification(title, {
      body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag: `flood-alert-${alert?.station_id || "general"}`,
      requireInteraction: isCritical,
    });

    notification.onclick = () => {
      window.focus?.();
      notification.close();
    };

    return notification;
  } catch (err) {
    console.warn("Could not dispatch OS desktop notification:", err);
    return null;
  }
}
