import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./Auth.css";

export default function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "resident",
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
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

    setErrorMessage("");
    setSuccessMessage("");

    if (
      !form.name.trim() ||
      !form.email.trim() ||
      !form.password
    ) {
      setErrorMessage("Please fill in all fields.");
      return;
    }

    if (form.password.length < 8) {
      setErrorMessage(
        "Password must be at least 8 characters."
      );
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            name: form.name.trim(),
            role: form.role,
          },
        },
      });

      if (error) {
        throw error;
      }

      setForm({
        name: "",
        email: "",
        password: "",
        role: "resident",
      });

      if (data.session) {
        navigate("/login", {
          replace: true,
          state: {
            message:
              "Account created successfully. Please log in.",
          },
        });

        return;
      }

      setSuccessMessage(
        "Account created successfully. Check your email for the confirmation link before signing in."
      );
    } catch (error) {
      console.error("Registration error:", error);

      if (
        error.message?.toLowerCase().includes("already registered")
      ) {
        setErrorMessage("Email already registered.");
      } else {
        setErrorMessage(
          error.message || "Registration failed. Please try again."
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

        <h1>Create account</h1>

        <p className="auth-subtitle">
          Join AquaGuard today
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
          <label htmlFor="register-name">
            Full name
          </label>

          <input
            id="register-name"
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Juan dela Cruz"
            autoComplete="name"
            required
          />

          <label htmlFor="register-email">
            Email address
          </label>

          <input
            id="register-email"
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <label htmlFor="register-password">
            Password
          </label>

          <input
            id="register-password"
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            minLength={8}
            required
          />

          <label htmlFor="register-role">
            Role
          </label>

          <select
            id="register-role"
            name="role"
            value={form.role}
            onChange={handleChange}
          >
            <option value="resident">
              Resident
            </option>

            <option value="barangay_officer">
              Barangay Officer
            </option>

            <option value="disaster_responder">
              Disaster Responder
            </option>
          </select>

          <button
            className="auth-button"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Creating Account..."
              : "Create Account"}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{" "}
          <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}