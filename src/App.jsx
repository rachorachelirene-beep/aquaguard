import {
  BrowserRouter,
  Route,
  Routes,
} from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import GuestRoute from "./components/GuestRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRedirect from "./components/RoleRedirect";

import Login from "./pages/Login";
import Register from "./pages/Register";
import SupabaseTest from "./pages/SupabaseTest";
import NotFound from "./pages/NotFound";

import AdminDashboard from "./pages/admin/AdminDashboard";
import LiveMonitoring from "./pages/admin/LiveMonitoring";
import WaterLevelHistory from "./pages/admin/WaterLevelHistory";
import Prediction from "./pages/admin/Prediction";
import Weather from "./pages/admin/Weather";
import Alerts from "./pages/admin/Alerts";
import MonitoringStations from "./pages/admin/MonitoringStations";
import Reports from "./pages/admin/Reports";
import Settings from "./pages/admin/Settings";
import CameraSettings from "./pages/admin/CameraSettings";
import Users from "./pages/admin/Users";

import OfficerDashboard from "./pages/officer/OfficerDashboard";
import OfficerAlerts from "./pages/officer/OfficerAlerts";
import OfficerAnnouncements from "./pages/officer/OfficerAnnouncements";
import OfficerCoordinate from "./pages/officer/OfficerCoordinate";
import OfficerEvacuationAdvisories from "./pages/officer/OfficerEvacuationAdvisories";
import OfficerReports from "./pages/officer/OfficerReports";
import OfficerWaterLevelHistory from "./pages/officer/OfficerWaterLevelHistory";
import ResponderAffectedAreas from "./pages/responder/ResponderAffectedAreas";
import ResponderCoordinate from "./pages/responder/ResponderCoordinate";
import ResponderDashboard from "./pages/responder/ResponderDashboard";
import ResponderEmergencyAlerts from "./pages/responder/ResponderEmergencyAlerts";
import ResponderReports from "./pages/responder/ResponderReports";
import ResponderResponseLogs from "./pages/responder/ResponderResponseLogs";
import ResidentAlerts from "./pages/resident/ResidentAlerts";
import ResidentAnnouncements from "./pages/resident/ResidentAnnouncements";
import ResidentDashboard from "./pages/resident/ResidentDashboard";
import ResidentSafetyTips from "./pages/resident/ResidentSafetyTips";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/"
            element={<RoleRedirect />}
          />

          <Route
            path="/login"
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />

          <Route
            path="/register"
            element={
              <GuestRoute>
                <Register />
              </GuestRoute>
            }
          />

          <Route
            path="/supabase-test"
            element={
              <ProtectedRoute>
                <SupabaseTest />
              </ProtectedRoute>
            }
          />

          {/* Admin routes */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/live-monitoring"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <LiveMonitoring />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/water-level-history"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <WaterLevelHistory />
              </ProtectedRoute>
            }
          />
<Route
  path="/admin/prediction"
  element={
    <ProtectedRoute allowedRoles={["admin"]}>
      <Prediction />
    </ProtectedRoute>
  }
/>

<Route
  path="/admin/weather"
  element={
    <ProtectedRoute allowedRoles={["admin"]}>
      <Weather />
    </ProtectedRoute>
  }
/>

<Route
  path="/admin/alerts"
  element={
    <ProtectedRoute allowedRoles={["admin"]}>
      <Alerts />
    </ProtectedRoute>
  }
/>

<Route
  path="/admin/monitoring-stations"
  element={
    <ProtectedRoute allowedRoles={["admin"]}>
      <MonitoringStations />
    </ProtectedRoute>
  }
/>

<Route
  path="/admin/reports"
  element={
    <ProtectedRoute allowedRoles={["admin"]}>
      <Reports />
    </ProtectedRoute>
  }
/>

<Route
  path="/admin/settings"
  element={
    <ProtectedRoute allowedRoles={["admin"]}>
      <Settings />
    </ProtectedRoute>
  }
/>

<Route
  path="/admin/camera-settings"
  element={
    <ProtectedRoute allowedRoles={["admin"]}>
      <CameraSettings />
    </ProtectedRoute>
  }
/>

<Route
  path="/admin/users"
  element={
    <ProtectedRoute allowedRoles={["admin"]}>
      <Users />
    </ProtectedRoute>
  }
/>

          {/* Barangay officer routes */}
          <Route
            path="/officer/dashboard"
            element={
              <ProtectedRoute
                allowedRoles={["barangay_officer"]}
              >
                <OfficerDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/officer/water-level-history"
            element={
              <ProtectedRoute
                allowedRoles={["barangay_officer"]}
              >
                <OfficerWaterLevelHistory />
              </ProtectedRoute>
            }
          />

          <Route
            path="/officer/alerts"
            element={
              <ProtectedRoute
                allowedRoles={["barangay_officer"]}
              >
                <OfficerAlerts />
              </ProtectedRoute>
            }
          />

          <Route
            path="/officer/announcements"
            element={
              <ProtectedRoute
                allowedRoles={["barangay_officer"]}
              >
                <OfficerAnnouncements />
              </ProtectedRoute>
            }
          />

          <Route
            path="/officer/evacuation-advisories"
            element={
              <ProtectedRoute
                allowedRoles={["barangay_officer"]}
              >
                <OfficerEvacuationAdvisories />
              </ProtectedRoute>
            }
          />

          <Route
            path="/officer/reports"
            element={
              <ProtectedRoute
                allowedRoles={["barangay_officer"]}
              >
                <OfficerReports />
              </ProtectedRoute>
            }
          />

          <Route
            path="/officer/coordinate"
            element={
              <ProtectedRoute
                allowedRoles={["barangay_officer"]}
              >
                <OfficerCoordinate />
              </ProtectedRoute>
            }
          />

          {/* Disaster responder routes */}
          <Route
            path="/responder/dashboard"
            element={
              <ProtectedRoute
                allowedRoles={["disaster_responder"]}
              >
                <ResponderDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/responder/emergency-alerts"
            element={
              <ProtectedRoute
                allowedRoles={["disaster_responder"]}
              >
                <ResponderEmergencyAlerts />
              </ProtectedRoute>
            }
          />

          <Route
            path="/responder/affected-areas"
            element={
              <ProtectedRoute
                allowedRoles={["disaster_responder"]}
              >
                <ResponderAffectedAreas />
              </ProtectedRoute>
            }
          />

          <Route
            path="/responder/response-logs"
            element={
              <ProtectedRoute
                allowedRoles={["disaster_responder"]}
              >
                <ResponderResponseLogs />
              </ProtectedRoute>
            }
          />

          <Route
            path="/responder/reports"
            element={
              <ProtectedRoute
                allowedRoles={["disaster_responder"]}
              >
                <ResponderReports />
              </ProtectedRoute>
            }
          />

          <Route
            path="/responder/coordinate"
            element={
              <ProtectedRoute
                allowedRoles={["disaster_responder"]}
              >
                <ResponderCoordinate />
              </ProtectedRoute>
            }
          />

          {/* Resident routes */}
          <Route
            path="/resident/dashboard"
            element={
              <ProtectedRoute allowedRoles={["resident"]}>
                <ResidentDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/resident/alerts"
            element={
              <ProtectedRoute allowedRoles={["resident"]}>
                <ResidentAlerts />
              </ProtectedRoute>
            }
          />

          <Route
            path="/resident/announcements"
            element={
              <ProtectedRoute allowedRoles={["resident"]}>
                <ResidentAnnouncements />
              </ProtectedRoute>
            }
          />

          <Route
            path="/resident/safety-tips"
            element={
              <ProtectedRoute allowedRoles={["resident"]}>
                <ResidentSafetyTips />
              </ProtectedRoute>
            }
          />

          <Route
            path="*"
            element={<NotFound />}
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
