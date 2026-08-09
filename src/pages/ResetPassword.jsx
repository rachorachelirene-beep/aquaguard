import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import BrandLogo from "../components/BrandLogo";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

import "./Auth.css";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { loading: authLoading, user } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmation) {
      setErrorMessage("Password confirmation does not match.");
      return;
    }

    try {
      setSubmitting(true);

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        throw error;
      }

      await supabase.auth.signOut();
      navigate("/login", {
        replace: true,
        state: {
          message: "Password updated successfully. Sign in with your new password.",
        },
      });
    } catch (error) {
      console.error("Password recovery error:", error);
      setErrorMessage(
        error.message ||
          "Unable to update the password. Request a new recovery email and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <BrandLogo
          className="auth-logo"
          markClassName="auth-logo-mark"
        />

        <h1>Set a new password</h1>

        <p className="auth-subtitle">
          Choose a secure password for your AquaGuard account.
        </p>

        {errorMessage && (
          <div className="auth-message auth-error" role="alert">
            {errorMessage}
          </div>
        )}

        {authLoading ? (
          <div className="auth-message">Validating recovery link...</div>
        ) : !user ? (
          <div className="auth-message auth-error" role="alert">
            This recovery link is invalid or has expired. Ask an administrator
            to send a new password-reset email.
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="reset-password">New password</label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />

            <label htmlFor="reset-password-confirmation">
              Confirm new password
            </label>
            <input
              id="reset-password-confirmation"
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />

            <button
              className="auth-button"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Updating Password..." : "Update Password"}
            </button>
          </form>
        )}

        <p className="auth-footer">
          <Link to="/login">Return to sign in</Link>
        </p>
      </section>
    </main>
  );
}
