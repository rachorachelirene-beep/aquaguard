import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { roleRoutes, useAuth } from "../context/AuthContext";

function RouteLoading() {
  return (
    <main className="route-state">
      <p>Loading AquaGuard...</p>
    </main>
  );
}

function ProfileError({ message }) {
  const { signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
  }

  return (
    <main className="route-state">
      <h1>Profile unavailable</h1>
      <p>{message}</p>
      <button type="button" onClick={handleSignOut}>
        Return to login
      </button>
    </main>
  );
}

export default function ProtectedRoute({
  allowedRoles = [],
  children,
}) {
  const {
    loading,
    user,
    profile,
    profileError,
    isAccountBlocked,
    signOut,
  } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (isAccountBlocked) {
      signOut();
    }
  }, [isAccountBlocked, signOut]);

  if (loading) {
    return <RouteLoading />;
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  if (profileError || !profile) {
    return (
      <ProfileError
        message={
          profileError ||
          "Your authenticated account does not have a profile."
        }
      />
    );
  }

  if (isAccountBlocked) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          error:
            "Your account is inactive. Contact the administrator.",
        }}
      />
    );
  }

  if (
    allowedRoles.length > 0 &&
    !allowedRoles.includes(profile.role)
  ) {
    return (
      <Navigate
        to={roleRoutes[profile.role] ?? "/resident/dashboard"}
        replace
      />
    );
  }

  return children;
}
