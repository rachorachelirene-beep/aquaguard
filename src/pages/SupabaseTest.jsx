import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function SupabaseTest() {
  const [stations, setStations] = useState([]);
  const [message, setMessage] = useState("Checking connection...");
  const [user, setUser] = useState(null);

  useEffect(() => {
    async function testConnection() {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        setMessage(`Session error: ${sessionError.message}`);
        return;
      }

      if (!session?.user) {
        setMessage(
          "Supabase is connected, but you must sign in before viewing stations."
        );
        return;
      }

      setUser(session.user);

      const { data, error } = await supabase
        .from("stations")
        .select("*")
        .order("id", { ascending: true });

      if (error) {
        setMessage(`Database error: ${error.message}`);
        return;
      }

      setStations(data ?? []);
      setMessage("Supabase connected successfully.");
    }

    testConnection();
  }, []);

  return (
    <main style={{ padding: "40px" }}>
      <h1>AquaGuard Database Test</h1>

      <p>{message}</p>

      {!user && (
        <p>
          <Link to="/login">Sign in</Link> or{" "}
          <Link to="/register">create a resident account</Link>.
        </p>
      )}

      {user && (
        <p>
          Signed in as: <strong>{user.email}</strong>
        </p>
      )}

      {stations.map((station) => (
        <div
          key={station.id}
          style={{
            padding: "12px",
            marginBottom: "10px",
            border: "1px solid #ddd",
            borderRadius: "8px",
          }}
        >
          <strong>{station.id}</strong> — {station.name}
          <br />
          <small>{station.location}</small>
        </div>
      ))}
    </main>
  );
}