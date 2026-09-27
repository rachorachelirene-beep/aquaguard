/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";
import { notifyAlertsUpdated } from "../lib/alertEvents";
import {
  getAudioContext,
  playWarningChime,
  startCriticalAlarm,
  stopCriticalAlarm,
  unlockAudio,
} from "../lib/audioAlert";

const AlertAudioContext = createContext(null);

const STORAGE_KEY_MUTED = "aquaguard_sound_muted";

export function AlertAudioProvider({ children }) {
  const { profile } = useAuth();
  const [isMuted, setIsMuted] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_MUTED) === "true";
    } catch {
      return false;
    }
  });

  const [activeCriticalAlert, setActiveCriticalAlert] = useState(null);
  const [warningToasts, setWarningToasts] = useState([]);
  const isMutedRef = useRef(isMuted);
  const processedAlertIdsRef = useRef(new Set());
  const toastTimersRef = useRef(new Set());
  const audioContextRef = useRef(null);
  const [audioState, setAudioState] = useState("suspended");
  const isAudioUnlocked = audioState === "running";
  const isAudioBlocked = !isMuted && !isAudioUnlocked;

  const unlockAlertAudio = useCallback(async () => {
    try {
      await unlockAudio();
    } catch (error) {
      console.warn("Could not unlock alert audio:", error);
    }
    const state = audioContextRef.current?.state;
    if (state) setAudioState(state);
    return state === "running";
  }, []);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Track browser suspension and retry unlocking on subsequent interactions.
  useEffect(() => {
    const context = getAudioContext();
    audioContextRef.current = context;
    function syncAudioState() {
      setAudioState(context?.state || "unavailable");
    }
    syncAudioState();
    context?.addEventListener("statechange", syncAudioState);
    function handleFirstInteraction() {
      if (context?.state !== "running") void unlockAlertAudio();
    }

    window.addEventListener("click", handleFirstInteraction);
    window.addEventListener("keydown", handleFirstInteraction);
    window.addEventListener("touchstart", handleFirstInteraction);

    return () => {
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
      window.removeEventListener("touchstart", handleFirstInteraction);
      context?.removeEventListener("statechange", syncAudioState);
      audioContextRef.current = null;
    };
  }, [unlockAlertAudio]);

  // Save mute preference
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      try {
        localStorage.setItem(STORAGE_KEY_MUTED, String(next));
      } catch (e) {
        console.warn("Could not persist sound preference", e);
      }
      if (next) {
        stopCriticalAlarm();
      }
      return next;
    });
  }, []);

  const silenceAlarm = useCallback(() => {
    stopCriticalAlarm();
    setActiveCriticalAlert(null);
  }, []);

  const dismissWarningToast = useCallback((toastId) => {
    setWarningToasts((prev) => prev.filter((t) => t.id !== toastId));
  }, []);

  const testSound = useCallback(() => {
    if (!isMutedRef.current) {
      void unlockAlertAudio();
      playWarningChime();
    }
  }, [unlockAlertAudio]);

  useEffect(() => {
    if (!profile) stopCriticalAlarm();
  }, [profile]);

  // Handle incoming alert
  const handleIncomingAlert = useCallback(
    (alert) => {
      if (!alert || !profile) return;
      const key = alert.id != null
        ? `id:${alert.id}`
        : JSON.stringify([
            alert.created_at, alert.station_id, alert.type,
            alert.title, alert.message,
          ]);
      const processed = processedAlertIdsRef.current;
      if (processed.has(key)) return;
      processed.add(key);
      if (processed.size > 300) processed.delete(processed.values().next().value);
      const type = String(alert.type || "").trim().toLowerCase();

      // Broadcast update for badge counters across Navbar/Sidebar
      notifyAlertsUpdated();

      // If user is a resident, only alert on warning and critical
      const userRole = profile?.role;
      if (
        userRole === "resident" &&
        type !== "warning" &&
        type !== "critical"
      ) {
        return;
      }

      if (type === "critical") {
        setActiveCriticalAlert(alert);
        if (!isMutedRef.current) {
          startCriticalAlarm();
        }
      } else if (type === "warning") {
        const toastId = `toast-${key}`;
        const newToast = { id: toastId, alert };
        setWarningToasts((prev) => [...prev, newToast]);

        // Auto-dismiss warning toast after 7 seconds
        const timer = window.setTimeout(() => {
          toastTimersRef.current.delete(timer);
          setWarningToasts((prev) => prev.filter((t) => t.id !== toastId));
        }, 7000);
        toastTimersRef.current.add(timer);

        if (!isMutedRef.current) {
          playWarningChime();
        }
      }
    },
    [profile]
  );

  const handleIncomingAlertRef = useRef(handleIncomingAlert);
  useLayoutEffect(() => {
    handleIncomingAlertRef.current = handleIncomingAlert;
  }, [handleIncomingAlert]);

  // Subscribe to Supabase Realtime for alerts table
  useEffect(() => {
    let active = true;
    const toastTimers = toastTimersRef.current;
    const channel = supabase
      .channel("aquaguard:alerts-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "alerts",
        },
        (payload) => {
          if (active) handleIncomingAlertRef.current(payload.new);
        }
      )
      .subscribe((status, err) => {
        if (!active) return;
        switch (status) {
          case "SUBSCRIBED":
            break;
          case "CHANNEL_ERROR":
          case "TIMED_OUT":
          case "CLOSED":
            console.warn("Supabase Realtime alerts subscription:", status, err);
            break;
        }
      });

    return () => {
      active = false;
      stopCriticalAlarm();
      toastTimers.forEach((timer) => window.clearTimeout(timer));
      toastTimers.clear();
      void supabase.removeChannel(channel).catch((error) => {
        console.warn("Could not remove alerts channel:", error);
      });
    };
  }, []);

  return (
    <AlertAudioContext.Provider
      value={{
        isMuted,
        isAudioUnlocked,
        isAudioBlocked,
        unlockAlertAudio,
        toggleMute,
        silenceAlarm,
        testSound,
        activeCriticalAlert,
        warningToasts,
        dismissWarningToast,
      }}
    >
      {children}
    </AlertAudioContext.Provider>
  );
}

export function useAlertAudio() {
  const context = useContext(AlertAudioContext);
  if (!context) {
    throw new Error(
      "useAlertAudio must be used within an AlertAudioProvider"
    );
  }
  return context;
}

