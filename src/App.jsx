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
import OfficerDashboard from "./pages/officer/OfficerDashboard";
import ResponderDashboard from "./pages/responder/ResponderDashboard";
import ResidentDashboard from "./pages/resident/ResidentDashboard";

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
            path="/officer/dashboard"
            element={
              <ProtectedRoute allowedRoles={["barangay_officer"]}>
                <OfficerDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/responder/dashboard"
            element={
              <ProtectedRoute allowedRoles={["disaster_responder"]}>
                <ResponderDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/resident/dashboard"
            element={
              <ProtectedRoute allowedRoles={["resident"]}>
                <ResidentDashboard />
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
