import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";
import { notifyAlertsUpdated } from "../lib/alertEvents";
import {
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
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  // Unlock browser audio context on first user click or touch anywhere on the page
  useEffect(() => {
    function handleFirstInteraction() {
      unlockAudio();
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
      window.removeEventListener("touchstart", handleFirstInteraction);
    }

    window.addEventListener("click", handleFirstInteraction, { once: true });
    window.addEventListener("keydown", handleFirstInteraction, { once: true });
    window.addEventListener("touchstart", handleFirstInteraction, { once: true });

    return () => {
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
      window.removeEventListener("touchstart", handleFirstInteraction);
    };
  }, []);

  // Save mute preference
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
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

  const testSound = useCallback(() => {
    unlockAudio();
    playWarningChime();
  }, []);

  // Handle incoming alert
  const handleIncomingAlert = useCallback(
    (alert) => {
      if (!alert) return;

      // Broadcast update for badge counters across Navbar/Sidebar
      notifyAlertsUpdated();

      // If user is a resident, only alert on warning and critical
      const userRole = profile?.role;
      if (
        userRole === "resident" &&
        alert.type !== "warning" &&
        alert.type !== "critical"
      ) {
        return;
      }

      if (alert.type === "critical") {
        setActiveCriticalAlert(alert);
        if (!isMutedRef.current) {
          unlockAudio().then(() => {
            startCriticalAlarm();
          });
        }
      } else if (alert.type === "warning") {
        if (!isMutedRef.current) {
          unlockAudio().then(() => {
            playWarningChime();
          });
        }
      }
    },
    [profile?.role]
  );

  // Subscribe to Supabase Realtime for alerts table
  useEffect(() => {
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
          handleIncomingAlert(payload.new);
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.warn("Supabase Realtime alerts subscription warning:", err);
        }
      });

    return () => {
      stopCriticalAlarm();
      supabase.removeChannel(channel);
    };
  }, [handleIncomingAlert]);

  return (
    <AlertAudioContext.Provider
      value={{
        isMuted,
        toggleMute,
        silenceAlarm,
        testSound,
        activeCriticalAlert,
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

