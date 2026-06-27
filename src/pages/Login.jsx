import { useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { roleRoutes } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import "./Auth.css";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [errorMessage, setErrorMessage] = useState(
    location.state?.error ?? ""
  );
  const [successMessage, setSuccessMessage] = useState(
    location.state?.message ?? ""
  );
  const [loading, setLoading] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.email.trim() || !form.password) {
      setErrorMessage("Please fill in all fields.");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: form.email.trim(),
          password: form.password,
        });

      if (authError) {
        throw authError;
      }

      if (!authData.user) {
        throw new Error("Unable to retrieve your account.");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, name, email, role, status")
        .eq("id", authData.user.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      if (!profile) {
        await supabase.auth.signOut();
        throw new Error("User profile was not found.");
      }

      if (
        profile.status === "inactive" ||
        profile.status === "suspended"
      ) {
        await supabase.auth.signOut();

        throw new Error(
          "Your account is inactive. Contact the administrator."
        );
      }

      const destination =
        roleRoutes[profile.role] ?? "/resident/dashboard";

      navigate(destination, {
        replace: true,
      });
    } catch (error) {
      console.error("Login error:", error);

      if (
        error.message?.toLowerCase().includes("invalid login")
      ) {
        setErrorMessage("Invalid email or password.");
      } else if (
        error.message?.toLowerCase().includes("email not confirmed")
      ) {
        setErrorMessage(
          "Please confirm your email before signing in."
        );
      } else {
        setErrorMessage(
          error.message || "Unable to sign in."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-logo">
          <svg
            width="28"
            height="28"
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="16"
              cy="16"
              r="14"
              stroke="#2563eb"
              strokeWidth="2"
            />

            <path
              d="M8 20c2-4 4-8 8-10 4 2 6 6 8 10"
              stroke="#2563eb"
              strokeWidth="2"
              strokeLinecap="round"
            />

            <circle
              cx="16"
              cy="20"
              r="3"
              fill="#2563eb"
            />
          </svg>

          AquaGuard
        </div>

        <h1>Welcome back</h1>

        <p className="auth-subtitle">
          Sign in to your account
        </p>

        {errorMessage && (
          <div className="auth-message auth-error">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="auth-message auth-success">
            {successMessage}
          </div>
        )}

        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >
          <label htmlFor="login-email">
            Email address
          </label>

          <input
            id="login-email"
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <label htmlFor="login-password">
            Password
          </label>

          <input
            id="login-password"
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />

          <button
            className="auth-button"
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="auth-footer">
          Don't have an account?{" "}
          <Link to="/register">Register</Link>
        </p>
      </section>
    </main>
  );
}
