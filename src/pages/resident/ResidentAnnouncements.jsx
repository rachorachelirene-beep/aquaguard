import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";

function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ResidentAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchText, setSearchText] = useState("");

  const loadAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, created_at, created_by")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      setAnnouncements(data ?? []);
    } catch (error) {
      console.error("Resident announcements loading error:", error);
      setErrorMessage(error.message || "Unable to load announcements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function boot() {
      await loadAnnouncements();
    }

    boot();
  }, [loadAnnouncements]);

  const filteredAnnouncements = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) {
      return announcements;
    }

    return announcements.filter((announcement) =>
      [announcement.title, announcement.body]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [announcements, searchText]);

  return (
    <DashboardLayout
      title="Announcements"
      description="Latest community updates from AquaGuard."
    >
      <main className="page-content officer-page">
        {errorMessage && (
          <div className="flash error">{errorMessage}</div>
        )}

        <section className="section-card">
          <div className="section-title">
            <span>Announcements</span>

            <button
              className="btn-cancel officer-icon-button"
              type="button"
              onClick={loadAnnouncements}
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
                placeholder="Search announcements..."
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
              {filteredAnnouncements.length} announcement
              {filteredAnnouncements.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="resident-list">
            {loading ? (
              <div className="dashboard-empty">
                Loading announcements...
              </div>
            ) : filteredAnnouncements.length === 0 ? (
              <div className="dashboard-empty">
                No announcements at this time.
              </div>
            ) : (
              filteredAnnouncements.map((announcement) => (
                <article
                  className="officer-list-item resident-list-item"
                  key={announcement.id}
                >
                  <strong>{announcement.title}</strong>
                  <span>{announcement.body}</span>
                  <small>{formatDateTime(announcement.created_at)}</small>
                </article>
              ))
            )}
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}
