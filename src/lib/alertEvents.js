export const ALERTS_UPDATED_EVENT = "aquaguard:alerts-updated";

export function notifyAlertsUpdated() {
  window.dispatchEvent(new Event(ALERTS_UPDATED_EVENT));
}
