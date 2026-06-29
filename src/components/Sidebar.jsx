import { NavLink, useNavigate } from "react-router-dom";

import BrandLogo from "./BrandLogo";
import { useAuth } from "../context/AuthContext";

const roleMenus = {
  admin: [
    { label: "Dashboard", to: "/admin/dashboard", icon: "☷" },
    { label: "Live Monitoring", to: "/admin/live-monitoring", icon: "◎" },
    {
      label: "Water Level History",
      to: "/admin/water-level-history",
      icon: "↻",
    },
    { label: "Prediction", to: "/admin/prediction", icon: "▲" },
    { label: "Weather", to: "/admin/weather", icon: "☁" },
    { label: "Alerts", to: "/admin/alerts", icon: "⚠" },
    {
      label: "Monitoring Stations",
      to: "/admin/monitoring-stations",
      icon: "▣",
    },
    { label: "Reports", to: "/admin/reports", icon: "▣" },
    { label: "Settings", to: "/admin/settings", icon: "⚙" },
    {
      label: "Camera Settings",
      to: "/admin/camera-settings",
      icon: "▣",
    },
  ],
  barangay_officer: [
    { label: "Dashboard", to: "/officer/dashboard", icon: "☷" },
    {
      label: "Water Level History",
      to: "/officer/water-level-history",
      icon: "↻",
    },
    { label: "Alerts", to: "/officer/alerts", icon: "⚠" },
    { label: "Reports", to: "/officer/reports", icon: "▣" },
    {
      label: "Announcements",
      to: "/officer/announcements",
      icon: "▣",
    },
    {
      label: "Evacuation Advisories",
      to: "/officer/evacuation-advisories",
      icon: "⚠",
    },
    { label: "Coordinate", to: "/officer/coordinate", icon: "▣" },
  ],
  disaster_responder: [
    { label: "Dashboard", to: "/responder/dashboard", icon: "☷" },
    {
      label: "Emergency Alerts",
      to: "/responder/emergency-alerts",
      icon: "⚠",
    },
    {
      label: "Affected Areas",
      to: "/responder/affected-areas",
      icon: "⌖",
    },
    {
      label: "Response Logs",
      to: "/responder/response-logs",
      icon: "✓",
    },
    {
      label: "Emergency Reports",
      to: "/responder/reports",
      icon: "▣",
    },
    { label: "Coordinate", to: "/responder/coordinate", icon: "▣" },
  ],
  resident: [
    { label: "Flood Status", to: "/resident/dashboard", icon: "☷" },
    { label: "Alerts", to: "/resident/alerts", icon: "⚠" },
    {
      label: "Announcements",
      to: "/resident/announcements",
      icon: "▣",
    },
    { label: "Safety Tips", to: "/resident/safety-tips", icon: "▣" },
  ],
};

function AquaGuardLogo() {
  return (
    <BrandLogo
      className="sidebar-logo"
      markClassName="sidebar-logo-mark"
      subtitle="Flood Monitoring System"
    />
  );
}

export default function Sidebar({
  open,
  onClose,
  activeAlerts = 0,
  currentTime,
}) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const menuItems = roleMenus[profile?.role] ?? roleMenus.resident;

  async function handleLogout() {
    await signOut();
    onClose();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <AquaGuardLogo />

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {menuItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
              onClick={onClose}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.label.includes("Alerts") && activeAlerts > 0 && (
                <span className="nav-badge">{activeAlerts}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="system-status">
            <span className="dot green" />
            <strong>SYSTEM ONLINE</strong>
          </div>

          <div className="status-time">{currentTime}</div>

          <div className="sidebar-bottom-links">
            {profile?.role === "admin" && (
              <NavLink
                to="/admin/users"
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
                onClick={onClose}
              >
                <span className="nav-icon">▣</span>
                <span>Users</span>
              </NavLink>
            )}

            <button
              className="nav-item"
              type="button"
              onClick={handleLogout}
            >
              <span className="nav-icon">→</span>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      <button
        className={`sidebar-overlay ${open ? "open" : ""}`}
        type="button"
        aria-label="Close sidebar"
        onClick={onClose}
      />
    </>
  );
}
