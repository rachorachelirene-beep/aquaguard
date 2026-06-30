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

    async function loadUnreadAlertCount() {
      const { count, error } = await supabase
        .from("alerts")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);

      if (!active) {
        return;
      }

      if (!error) {
        setUnreadAlerts(count ?? 0);
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
  }, []);

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
          showSearch={showAdminTools}
          showWeather={showAdminTools}
          unreadAlerts={unreadAlerts}
        />

        {children}
      </div>
    </div>
  );
}
