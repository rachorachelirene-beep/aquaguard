import { useEffect, useState } from "react";

/**
 * Custom React hook to detect online/offline network connectivity.
 * 
 * Provides reactive network state to trigger offline alerts, cache fallback views,
 * and seamless reconnection recovery during disaster power/cell outages.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      return Boolean(navigator.onLine);
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline };
}

export default useNetworkStatus;

