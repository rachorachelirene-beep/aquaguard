import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";

const fallbackTips = [
  {
    id: "fallback-1",
    icon: "!",
    title: "Prepare an emergency bag",
    body: "Keep water, food, flashlight, medicine, power bank, and important documents ready.",
  },
  {
    id: "fallback-2",
    icon: "~",
    title: "Avoid floodwater",
    body: "Do not walk or drive through floodwater. It may be deeper or faster than it looks.",
  },
  {
    id: "fallback-3",
    icon: "^",
    title: "Move to higher ground",
    body: "If water level rises quickly, move your family to a safe elevated area immediately.",
  },
];

function decodeIcon(value) {
  if (!value) {
    return "!";
  }

  return String(value)
    .replace(/&#(\d+);/g, (_match, code) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    );
}

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
        "Safety reminder table is unavailable. Showing default tips."
      );
      setTips(fallbackTips);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function boot() {
      await loadTips();
    }

    boot();
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
      title="Safety Tips"
      description="Flood safety reminders for residents."
    >
      <main className="page-content officer-page">
        {errorMessage && (
          <div className="flash error">{errorMessage}</div>
        )}

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
              <div className="dashboard-empty">Loading safety tips...</div>
            ) : filteredTips.length === 0 ? (
              <div className="dashboard-empty">
                No safety tips found.
              </div>
            ) : (
              filteredTips.map((tip) => (
                <article className="resident-tip-card" key={tip.id}>
                  <div className="resident-tip-icon">
                    {decodeIcon(tip.icon)}
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
