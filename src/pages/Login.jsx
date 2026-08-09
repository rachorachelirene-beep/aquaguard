import { useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import BrandLogo from "../components/BrandLogo";
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
  const [resetLoading, setResetLoading] = useState(false);

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

      if (String(profile.status ?? "").toLowerCase() !== "active") {
        await supabase.auth.signOut();

        throw new Error(
          "Your account is inactive. Contact the administrator."
        );
      }

      const destination = roleRoutes[profile.role];

      if (!destination) {
        await supabase.auth.signOut();
        throw new Error(
          "Your account role is not recognized. Contact the administrator."
        );
      }

      const requestedLocation = location.state?.from;
      const rolePrefix = destination.replace(/dashboard$/, "");
      const requestedPath = requestedLocation?.pathname ?? "";
      const safeDestination = requestedPath.startsWith(rolePrefix)
        ? `${requestedPath}${requestedLocation?.search ?? ""}${
            requestedLocation?.hash ?? ""
          }`
        : destination;

      navigate(safeDestination, {
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

  async function handleForgotPassword() {
    const email = form.email.trim();

    if (!email) {
      setSuccessMessage("");
      setErrorMessage(
        "Enter your email address first, then select Forgot password."
      );
      return;
    }

    try {
      setResetLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (error) {
        throw error;
      }

      setSuccessMessage(
        "If an account exists for that email, a password-reset link has been sent."
      );
    } catch (error) {
      console.error("Password-reset error:", error);
      setErrorMessage(
        error.message || "Unable to send the password-reset email."
      );
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <BrandLogo
          className="auth-logo"
          markClassName="auth-logo-mark"
        />

        <h1>Welcome back</h1>

        <p className="auth-subtitle">
          Sign in to your account
        </p>

        {errorMessage && (
          <div className="auth-message auth-error" role="alert">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="auth-message auth-success" role="status">
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
            className="auth-forgot-button"
            type="button"
            onClick={handleForgotPassword}
            disabled={loading || resetLoading}
          >
            {resetLoading ? "Sending reset link..." : "Forgot password?"}
          </button>

          <button
            className="auth-button"
            type="submit"
            disabled={loading || resetLoading}
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
