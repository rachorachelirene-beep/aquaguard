import { useEffect } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export default function RoleRedirect() {
  const {
    loading,
    user,
    profile,
    isAccountBlocked,
    hasRecognizedRole,
    roleRoute,
    signOut,
  } = useAuth();

  useEffect(() => {
    if (isAccountBlocked) {
      signOut();
    }
  }, [isAccountBlocked, signOut]);

  if (loading) {
    return (
      <main className="route-state">
        <p>Loading AquaGuard...</p>
      </main>
    );
  }

  if (!user || !profile || isAccountBlocked || !hasRecognizedRole) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={roleRoute} replace />;
}
