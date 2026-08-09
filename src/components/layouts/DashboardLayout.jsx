import { useEffect, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { ALERTS_UPDATED_EVENT } from "../../lib/alertEvents";
import { supabase } from "../../lib/supabase";
import Navbar from "../Navbar";
import Sidebar from "../Sidebar";
import "../../styles/admin.css";

function formatSidebarTime(date) {
  const pad = (value) => String(value).padStart(2, "0");

  return `${date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })} | ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`;
}

export default function DashboardLayout({
  title,
  description,
  children,
}) {
  const { profile } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() =>
    formatSidebarTime(new Date())
  );
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(formatSidebarTime(new Date()));
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    let warningShown = false;

    async function loadUnreadAlertCount() {
      if (!active || requestInFlight) {
        return;
      }

      requestInFlight = true;

      try {
        let query = supabase
          .from("alerts")
          .select("id", { count: "exact", head: true });

        query =
          profile?.role === "resident"
            ? query
                .eq("is_resolved", false)
                .in("type", ["warning", "critical"])
            : query.eq("is_read", false);

        const { count, error } = await query;

        if (error) {
          throw error;
        }

        if (!active) {
          return;
        }

        setUnreadAlerts(count ?? 0);
        warningShown = false;
      } catch (error) {
        if (active && !warningShown) {
          console.warn("Alert count unavailable:", error);
          warningShown = true;
        }
      } finally {
        requestInFlight = false;
      }
    }

    loadUnreadAlertCount();
    window.addEventListener(
      ALERTS_UPDATED_EVENT,
      loadUnreadAlertCount
    );

    const interval = window.setInterval(loadUnreadAlertCount, 30000);

    return () => {
      active = false;
      window.removeEventListener(
        ALERTS_UPDATED_EVENT,
        loadUnreadAlertCount
      );
      window.clearInterval(interval);
    };
  }, [profile?.role]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const showAdminTools = profile?.role === "admin";

  return (
    <div className="admin-shell">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        unreadAlerts={unreadAlerts}
        currentTime={currentTime}
      />

      <div className="main">
        <Navbar
          title={title}
          subtitle={description}
          onToggleSidebar={() =>
            setSidebarOpen((isOpen) => !isOpen)
          }
          showSearch={false}
          showWeather={showAdminTools}
          unreadAlerts={unreadAlerts}
        />

        {children}
      </div>
    </div>
  );
}
