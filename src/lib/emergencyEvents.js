/**
 * Event bus for triggering the Emergency Directory modal across any component.
 */
export const OPEN_EMERGENCY_EVENT = "aquaguard:open-emergency-directory";

export function openEmergencyDirectory() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_EMERGENCY_EVENT));
  }
}

