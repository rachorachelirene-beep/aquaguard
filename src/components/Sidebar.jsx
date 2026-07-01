import { NavLink, useNavigate } from "react-router-dom";
import {
  Bell,
  BrainCircuit,
  Camera,
  ClipboardList,
  CloudRain,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Megaphone,
  RadioTower,
  Settings,
  ShieldAlert,
  Users,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

const roleMenus = {
  admin: [
    { label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard },
    { label: "Live Monitoring", to: "/admin/live-monitoring", icon: RadioTower },
    {
      label: "Water Level History",
      to: "/admin/water-level-history",
      icon: History,
    },
    { label: "Prediction", to: "/admin/prediction", icon: BrainCircuit },
    { label: "Weather", to: "/admin/weather", icon: CloudRain },
    { label: "Alerts", to: "/admin/alerts", icon: Bell },
    {
      label: "Monitoring Stations",
      to: "/admin/monitoring-stations",
      icon: Gauge,
    },
    { label: "Reports", to: "/admin/reports", icon: FileText },
    { label: "Settings", to: "/admin/settings", icon: Settings },
    {
      label: "Camera Settings",
      to: "/admin/camera-settings",
      icon: Camera,
    },
  ],
  barangay_officer: [
    { label: "Dashboard", to: "/officer/dashboard", icon: LayoutDashboard },
    {
      label: "Water Level History",
      to: "/officer/water-level-history",
      icon: History,
    },
    { label: "Alerts", to: "/officer/alerts", icon: Bell },
    { label: "Reports", to: "/officer/reports", icon: FileText },
    {
      label: "Announcements",
      to: "/officer/announcements",
      icon: Megaphone,
    },
    {
      label: "Evacuation Advisories",
      to: "/officer/evacuation-advisories",
      icon: ShieldAlert,
    },
    { label: "Coordinate", to: "/officer/coordinate", icon: MapPinned },
  ],
  disaster_responder: [
    { label: "Dashboard", to: "/responder/dashboard", icon: LayoutDashboard },
    {
      label: "Emergency Alerts",
      to: "/responder/emergency-alerts",
      icon: Bell,
    },
    {
      label: "Affected Areas",
      to: "/responder/affected-areas",
      icon: MapPinned,
    },
    {
      label: "Response Logs",
      to: "/responder/response-logs",
      icon: ClipboardList,
    },
    {
      label: "Emergency Reports",
      to: "/responder/reports",
      icon: FileText,
    },
    { label: "Coordinate", to: "/responder/coordinate", icon: MapPinned },
  ],
  resident: [
    { label: "Flood Status", to: "/resident/dashboard", icon: Gauge },
    { label: "Alerts", to: "/resident/alerts", icon: Bell },
    {
      label: "Announcements",
      to: "/resident/announcements",
      icon: Megaphone,
    },
    { label: "Safety Tips", to: "/resident/safety-tips", icon: ShieldAlert },
  ],
};

function AquaGuardLogo() {
  return (
    <div className="sidebar-logo">
      <span className="sidebar-logo-mark sidebar-logo-image-mark" aria-hidden="true">
        <img src="/logo-transparent.png" alt="" />
      </span>
      <div>
        <span className="brand-logo-title">AquaGuard</span>
        <span className="brand-logo-subtitle">Flood Monitoring System</span>
      </div>
    </div>
  );
}

export default function Sidebar({
  open,
  onClose,
  unreadAlerts = 0,
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
              <span className="nav-icon">
                <item.icon size={20} strokeWidth={2.1} />
              </span>
              <span>{item.label}</span>
              {item.label.includes("Alerts") && unreadAlerts > 0 && (
                <span className="nav-badge">{unreadAlerts}</span>
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
                <span className="nav-icon">
                  <Users size={20} strokeWidth={2.1} />
                </span>
                <span>Users</span>
              </NavLink>
            )}

            <button
              className="nav-item"
              type="button"
              onClick={handleLogout}
            >
              <span className="nav-icon">
                <LogOut size={20} strokeWidth={2.1} />
              </span>
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
