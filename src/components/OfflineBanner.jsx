import { useState } from "react";
import { PhoneCall, WifiOff, X } from "lucide-react";

import { useNetworkStatus } from "../hooks/useNetworkStatus";
import "./OfflineBanner.css";

/**
 * OfflineBanner Component
 * 
 * Persistent high-visibility banner displayed when network connectivity is lost.
 * Informs residents that internet is down and provides direct one-tap access to
 * cached offline disaster response hotlines and evacuation shelters.
 */
export default function OfflineBanner({ onOpenDirectory }) {
  const { isOnline } = useNetworkStatus();
  const [prevOnline, setPrevOnline] = useState(isOnline);
  const [isDismissed, setIsDismissed] = useState(false);

  // Reset dismissal whenever connection goes from online to offline
  if (prevOnline !== isOnline) {
    setPrevOnline(isOnline);
    if (!isOnline) {
      setIsDismissed(false);
    }
  }

  if (isOnline || isDismissed) {
    return null;
  }

  return (
    <aside
      className="offline-banner"
      role="alert"
      aria-live="assertive"
      aria-label="Offline Mode Notification"
    >
      <div className="offline-banner-content">
        <div className="offline-banner-icon-badge" aria-hidden="true">
          <WifiOff size={18} />
        </div>
        <div className="offline-banner-text">
          <p className="offline-banner-title">
            Offline Mode: Internet Disconnected
          </p>
          <p className="offline-banner-subtitle">
            Showing cached emergency hotlines, evacuation shelters, and disaster safety protocols.
          </p>
        </div>
      </div>

      <div className="offline-banner-actions">
        {onOpenDirectory && (
          <button
            type="button"
            className="offline-btn-hotlines"
            onClick={onOpenDirectory}
          >
            <PhoneCall size={15} />
            <span>View Emergency Hotlines</span>
          </button>
        )}
        <button
          type="button"
          className="offline-btn-dismiss"
          onClick={() => setIsDismissed(true)}
          aria-label="Dismiss offline banner"
          title="Dismiss banner"
        >
          <X size={16} />
        </button>
      </div>
    </aside>
  );
}

