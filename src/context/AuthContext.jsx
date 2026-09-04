/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { supabase, supabaseConfigError } from "../lib/supabase";

const AuthContext = createContext(null);

export const roleRoutes = {
  admin: "/admin/dashboard",
  barangay_officer: "/officer/dashboard",
  disaster_responder: "/responder/dashboard",
  resident: "/resident/dashboard",
};

const PROFILE_FETCH_TIMEOUT_MS = 8000;

async function fetchProfile(userId, timeoutMs = PROFILE_FETCH_TIMEOUT_MS) {
  let timerId = null;

  const timeoutPromise = new Promise((_, reject) => {
    timerId = window.setTimeout(() => {
      reject(
        new Error(
          "Profile request timed out. Please verify your connection or try again."
        )
      );
    }, timeoutMs);
  });

  try {
    const profilePromise = supabase
      .from("profiles")
      .select("id, name, email, role, status, phone, address, avatar_url")
      .eq("id", userId)
      .single();

    const result = await Promise.race([profilePromise, timeoutPromise]);

    if (result.error) {
      throw result.error;
    }

    return result.data;
  } finally {
    if (timerId !== null) {
      window.clearTimeout(timerId);
    }
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState("");

  const inFlightProfilePromiseRef = useRef(null);
  const inFlightUserIdRef = useRef(null);

  const loadProfile = useCallback(async (currentUser) => {
    if (!supabase) {
      setProfile(null);
      setProfileError(supabaseConfigError);
      return null;
    }

    if (!currentUser) {
      setProfile(null);
      setProfileError("");
      return null;
    }

    if (
      inFlightProfilePromiseRef.current &&
      inFlightUserIdRef.current === currentUser.id
    ) {
      return inFlightProfilePromiseRef.current;
    }

    inFlightUserIdRef.current = currentUser.id;
    const fetchPromise = (async () => {
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
      } finally {
        inFlightProfilePromiseRef.current = null;
        inFlightUserIdRef.current = null;
      }
    })();

    inFlightProfilePromiseRef.current = fetchPromise;
    return fetchPromise;
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!supabase) {
      return undefined;
    }

    let initialBootDone = false;

    async function loadSession() {
      setLoading(true);

      try {
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
          return;
        }

        const nextSession = data.session ?? null;
        const nextUser = nextSession?.user ?? null;

        setSession(nextSession);
        setUser(nextUser);
        await loadProfile(nextUser);
      } finally {
        initialBootDone = true;
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      const nextUser = nextSession?.user ?? null;
      setSession(nextSession);
      setUser(nextUser);

      // Only re-trigger loadProfile if boot has finished and user changed
      if (initialBootDone) {
        setLoading(true);
        await loadProfile(nextUser);
        if (isMounted) {
          setLoading(false);
        }
      }
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
    await supabase?.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo(() => {
    const status = String(profile?.status ?? "").toLowerCase();
    const isAccountBlocked = Boolean(profile) && status !== "active";
    const hasRecognizedRole = Boolean(
      profile && Object.hasOwn(roleRoutes, profile.role)
    );

    return {
      session,
      user,
      profile,
      loading,
      profileError,
      isAuthenticated: Boolean(user),
      isAccountBlocked,
      hasRecognizedRole,
      roleRoute: roleRoutes[profile?.role] ?? "/login",
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

  if (supabaseConfigError) {
    return (
      <main className="route-state">
        <h1>AquaGuard setup needed</h1>
        <p>{supabaseConfigError}</p>
      </main>
    );
  }

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
