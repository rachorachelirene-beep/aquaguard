import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Megaphone, RefreshCw, Search, X } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";
import {
  formatDateTime,
  formatRelativeTime,
  isRecent,
} from "./residentUtils";

const INITIAL_PAGE_SIZE = 10;
const PAGE_INCREMENT = 10;

export default function ResidentAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_PAGE_SIZE);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Debounce search input (250ms)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchText.trim());
      setVisibleCount(INITIAL_PAGE_SIZE);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchText]);

  const loadAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        throw error;
      }

      if (isMountedRef.current) {
        setAnnouncements(data ?? []);
      }
    } catch (error) {
      console.error("Resident announcements loading error:", error);
      if (isMountedRef.current) {
        setErrorMessage(
          "Unable to load announcements. Check your connection and try again."
        );
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(loadAnnouncements, 0);

    const channel = supabase
      .channel("resident-announcements-page")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "announcements",
        },
        () => {
          loadAnnouncements();
        }
      )
      .subscribe();

    return () => {
      window.clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [loadAnnouncements]);

  const filteredAnnouncements = useMemo(() => {
    const keyword = debouncedSearch.toLowerCase();

    if (!keyword) {
      return announcements;
    }

    return announcements.filter(
      (announcement) =>
        announcement.title?.toLowerCase().includes(keyword) ||
        announcement.body?.toLowerCase().includes(keyword)
    );
  }, [announcements, debouncedSearch]);

  const displayedAnnouncements = useMemo(() => {
    return filteredAnnouncements.slice(0, visibleCount);
  }, [filteredAnnouncements, visibleCount]);

  const handleClearSearch = () => {
    setSearchText("");
    setDebouncedSearch("");
    setVisibleCount(INITIAL_PAGE_SIZE);
  };

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + PAGE_INCREMENT);
  };

  return (
    <DashboardLayout
      title="Announcements"
      description="Latest community updates from AquaGuard."
    >
      <main className="page-content officer-page">
        <section className="section-card">
          <div className="section-title">
            <span>Announcements</span>

            <button
              className="btn-cancel officer-icon-button"
              type="button"
              onClick={loadAnnouncements}
              disabled={loading}
              aria-label="Refresh announcements"
              aria-busy={loading}
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
                aria-label="Search announcements"
              />
            </label>

            {searchText && (
              <button
                className="btn-cancel officer-icon-button"
                type="button"
                onClick={handleClearSearch}
              >
                <X size={16} />
                Clear
              </button>
            )}

            <span className="officer-count" aria-live="polite">
              {filteredAnnouncements.length} announcement
              {filteredAnnouncements.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="resident-list">
            {loading ? (
              <div className="dashboard-empty">
                Loading announcements...
              </div>
            ) : errorMessage ? (
              <div className="dashboard-empty error">
                <strong>{errorMessage}</strong>
                <button
                  className="btn-submit officer-icon-button"
                  type="button"
                  onClick={loadAnnouncements}
                >
                  Try again
                </button>
              </div>
            ) : announcements.length === 0 ? (
              <div className="dashboard-empty">
                No announcements at this time.
              </div>
            ) : filteredAnnouncements.length === 0 ? (
              <div className="dashboard-empty" style={{ gap: "10px" }}>
                <span>No announcements matching "{debouncedSearch || searchText}".</span>
                <button
                  className="btn-cancel officer-icon-button"
                  type="button"
                  onClick={handleClearSearch}
                >
                  <X size={16} />
                  Clear search
                </button>
              </div>
            ) : (
              <>
                {displayedAnnouncements.map((announcement) => {
                  const recent = isRecent(announcement.created_at, 24);
                  return (
                    <article
                      className="resident-announcement-item"
                      key={announcement.id}
                    >
                      <div className="resident-announcement-header">
                        <div className="resident-announcement-title-group">
                          <Megaphone
                            size={16}
                            className="resident-announcement-icon"
                          />
                          <span className="resident-announcement-title">
                            {announcement.title}
                          </span>
                          {recent && (
                            <span className="badge badge-green">NEW</span>
                          )}
                        </div>

                        <span
                          className="resident-announcement-meta"
                          title={formatDateTime(announcement.created_at)}
                        >
                          {formatRelativeTime(announcement.created_at)}
                        </span>
                      </div>

                      <p className="resident-announcement-body">
                        {announcement.body}
                      </p>
                    </article>
                  );
                })}

                {filteredAnnouncements.length > visibleCount && (
                  <div style={{ textAlign: "center", padding: "16px 0" }}>
                    <button
                      className="btn-cancel officer-icon-button"
                      type="button"
                      onClick={handleLoadMore}
                      style={{ margin: "0 auto" }}
                    >
                      <ChevronDown size={16} />
                      Load more announcements (
                      {filteredAnnouncements.length - visibleCount} remaining)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </DashboardLayout>
  );
}
