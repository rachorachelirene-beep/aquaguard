import { useEffect, useState } from "react";

import { useAuth } from "../../context/AuthContext";
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
  const [activeAlerts, setActiveAlerts] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(formatSidebarTime(new Date()));
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadAlertCount() {
      const { count, error } = await supabase
        .from("alerts")
        .select("id", { count: "exact", head: true })
        .eq("is_resolved", false)
        .in("type", ["critical", "warning"]);

      if (!active) {
        return;
      }

      if (!error) {
        setActiveAlerts(count ?? 0);
      }
    }

    loadAlertCount();
    const interval = window.setInterval(loadAlertCount, 30000);

    return () => {
      active = false;
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
        activeAlerts={activeAlerts}
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
          activeAlerts={activeAlerts}
        />

        {children}
      </div>
    </div>
  );
}
