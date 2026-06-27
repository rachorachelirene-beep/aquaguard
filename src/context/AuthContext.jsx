/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export const roleRoutes = {
  admin: "/admin/dashboard",
  barangay_officer: "/officer/dashboard",
  disaster_responder: "/responder/dashboard",
  resident: "/resident/dashboard",
};

const blockedStatuses = new Set(["inactive", "suspended"]);

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, role, status, phone, address, avatar_url")
    .eq("id", userId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState("");

  const loadProfile = useCallback(async (currentUser) => {
    if (!currentUser) {
      setProfile(null);
      setProfileError("");
      return null;
    }

    try {
      const nextProfile = await fetchProfile(currentUser.id);
      setProfile(nextProfile);
      setProfileError("");
      return nextProfile;
    } catch (error) {
      console.error("Profile load error:", error);
      setProfile(null);
      setProfileError(
        error.message || "Unable to load your AquaGuard profile."
      );
      return null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      setLoading(true);

      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Session load error:", error);
        setSession(null);
        setUser(null);
        setProfile(null);
        setProfileError(error.message || "Unable to load session.");
        setLoading(false);
        return;
      }

      const nextSession = data.session ?? null;
      const nextUser = nextSession?.user ?? null;

      setSession(nextSession);
      setUser(nextUser);
      await loadProfile(nextUser);

      if (isMounted) {
        setLoading(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      const nextUser = nextSession?.user ?? null;

      setSession(nextSession);
      setUser(nextUser);
      setLoading(true);
      await loadProfile(nextUser);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    return loadProfile(user);
  }, [loadProfile, user]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo(() => {
    const status = profile?.status ?? null;
    const isAccountBlocked = blockedStatuses.has(status);

    return {
      session,
      user,
      profile,
      loading,
      profileError,
      isAuthenticated: Boolean(user),
      isAccountBlocked,
      roleRoute: roleRoutes[profile?.role] ?? "/resident/dashboard",
      refreshProfile,
      signOut,
    };
  }, [
    session,
    user,
    profile,
    loading,
    profileError,
    refreshProfile,
    signOut,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
