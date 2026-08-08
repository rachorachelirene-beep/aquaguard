import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";
import { decodeReminderIcon } from "./residentUtils";

export default function ResidentSafetyTips() {
  const [tips, setTips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchText, setSearchText] = useState("");

  const loadTips = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("safety_reminders")
        .select("id, title, body, icon, is_active")
        .eq("is_active", true)
        .order("id", { ascending: true });

      if (error) {
        throw error;
      }

      setTips(data ?? []);
    } catch (error) {
      console.error("Resident safety tips loading error:", error);
      setErrorMessage(
        "Safety reminders are temporarily unavailable. Check your connection and try again."
      );
      setTips([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(loadTips, 0);
    return () => window.clearTimeout(timeout);
  }, [loadTips]);

  const filteredTips = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) {
      return tips;
    }

    return tips.filter((tip) =>
      [tip.title, tip.body]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [tips, searchText]);

  return (
    <DashboardLayout
      title="Safety Reminders"
      description="Official flood-safety reminders for residents."
    >
      <main className="page-content officer-page">
        <section className="section-card">
          <div className="section-title">
            <span>Safety Reminders</span>

            <button
              className="btn-cancel officer-icon-button"
              type="button"
              onClick={loadTips}
              disabled={loading}
            >
              <RefreshCw
                size={16}
                className={loading ? "officer-spin" : ""}
              />
              Refresh
            </button>
          </div>

          <div className="officer-toolbar">
            <label className="officer-search">
              <Search size={17} />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search safety tips..."
              />
            </label>

            {searchText && (
              <button
                className="btn-cancel officer-icon-button"
                type="button"
                onClick={() => setSearchText("")}
              >
                <X size={16} />
                Clear
              </button>
            )}

            <span className="officer-count">
              {filteredTips.length} tip
              {filteredTips.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="resident-tip-grid">
            {loading ? (
              <div className="dashboard-empty">Loading safety reminders...</div>
            ) : errorMessage ? (
              <div className="dashboard-empty error">
                <strong>{errorMessage}</strong>
                <button
                  className="btn-submit officer-icon-button"
                  type="button"
                  onClick={loadTips}
                >
                  Try again
                </button>
              </div>
            ) : filteredTips.length === 0 ? (
              <div className="dashboard-empty">
                No safety reminders have been published.
              </div>
            ) : (
              filteredTips.map((tip) => (
                <article className="resident-tip-card" key={tip.id}>
                  <div className="resident-tip-icon">
                    {decodeReminderIcon(tip.icon)}
                  </div>
                  <strong>{tip.title}</strong>
                  <span>{tip.body}</span>
                </article>
              ))
            )}
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}
