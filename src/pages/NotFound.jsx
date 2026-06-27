import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="placeholder-page">
      <h1>404</h1>
      <p>The page you requested does not exist.</p>
      <Link to="/login">Return to login</Link>
    </main>
  );
}