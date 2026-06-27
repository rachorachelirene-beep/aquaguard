import { useEffect } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

function GuestRouteLoading() {
  return (
    <main className="route-state">
      <p>Loading AquaGuard...</p>
    </main>
  );
}

export default function GuestRoute({ children }) {
  const {
    loading,
    user,
    profile,
    isAccountBlocked,
    roleRoute,
    signOut,
  } = useAuth();

  useEffect(() => {
    if (isAccountBlocked) {
      signOut();
    }
  }, [isAccountBlocked, signOut]);

  if (loading) {
    return <GuestRouteLoading />;
  }

  if (user && profile && !isAccountBlocked) {
    return <Navigate to={roleRoute} replace />;
  }

  return children;
}
