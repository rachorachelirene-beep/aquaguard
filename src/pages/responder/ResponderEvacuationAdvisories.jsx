import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, ShieldAlert, X } from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { supabase } from "../../lib/supabase";
import { formatDateTime } from "./responderUtils";

function getLevelBadge(level) {
  if (level === "mandatory") {
    return "badge-red";
  }

  if (level === "warning") {
    return "badge-orange";
  }

  return "badge-blue";
}

export default function ResponderEvacuationAdvisories({
  description = "Read current evacuation guidance and recent notices for field operations.",
}) {
  const [advisories, setAdvisories] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  const loadAdvisories = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const [advisoriesResult, profilesResult] = await Promise.all([
        supabase
          .from("evacuation_advisories")
          .select(
            "id, title, area, level, details, is_active, issued_by, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(300),
        supabase.from("profiles").select("id, name, role"),
      ]);

      if (advisoriesResult.error) {
        throw advisoriesResult.error;
      }

      if (profilesResult.error) {
        console.warn("Advisory issuer profiles unavailable:", profilesResult.error);
      }

      setAdvisories(advisoriesResult.data ?? []);
      setProfiles(profilesResult.error ? [] : profilesResult.data ?? []);
    } catch (error) {
      console.error("Responder advisories loading error:", error);
      setLoadError(
        "Unable to load evacuation advisories. Check your connection and access permissions, then try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(loadAdvisories, 0);
    return () => window.clearTimeout(timeout);
  }, [loadAdvisories]);

  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [String(profile.id), profile])),
    [profiles]
  );

  const filteredAdvisories = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return advisories.filter((advisory) => {
      const matchesSearch =
        !keyword ||
        [advisory.title, advisory.area, advisory.details]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      const matchesLevel =
        levelFilter === "all" || advisory.level === levelFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && advisory.is_active) ||
        (statusFilter === "inactive" && !advisory.is_active);

      return matchesSearch && matchesLevel && matchesStatus;
    });
  }, [advisories, levelFilter, searchText, statusFilter]);

  const hasFilters =
    searchText || levelFilter !== "all" || statusFilter !== "active";

  function clearFilters() {
    setSearchText("");
    setLevelFilter("all");
    setStatusFilter("active");
  }

  return (
    <DashboardLayout
      title="Evacuation Advisories"
      description={description}
    >
      <main className="page-content officer-page">
        <section className="section-card">
          <div className="section-title">
            <span>Evacuation Guidance</span>
            <button
              className="btn-cancel officer-icon-button"
              type="button"
              onClick={loadAdvisories}
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
                placeholder="Search area, title, or instructions..."
              />
            </label>

            <select
              className="form-input officer-filter-select"
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value)}
              aria-label="Advisory severity"
            >
              <option value="all">All Levels</option>
              <option value="advisory">Advisory</option>
              <option value="warning">Warning</option>
              <option value="mandatory">Mandatory</option>
            </select>

            <select
              className="form-input officer-filter-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Advisory status"
            >
              <option value="active">Active</option>
              <option value="all">All Status</option>
              <option value="inactive">Inactive</option>
            </select>

            {hasFilters && (
              <button
                className="btn-cancel officer-icon-button"
                type="button"
                onClick={clearFilters}
              >
                <X size={16} />
                Clear
              </button>
            )}

            <span className="officer-count">
              {filteredAdvisories.length} notice
              {filteredAdvisories.length === 1 ? "" : "s"}
            </span>
          </div>

          {loading ? (
            <div className="dashboard-empty">Loading advisories...</div>
          ) : loadError ? (
            <div className="dashboard-empty error">
              <ShieldAlert size={20} />
              <strong>{loadError}</strong>
              <button
                className="btn-submit officer-icon-button"
                type="button"
                onClick={loadAdvisories}
              >
                Try again
              </button>
            </div>
          ) : filteredAdvisories.length === 0 ? (
            <div className="dashboard-empty">
              No evacuation advisories match the selected filters.
            </div>
          ) : (
            <div className="resident-list">
              {filteredAdvisories.map((advisory) => {
                const issuer = profileMap.get(String(advisory.issued_by));

                return (
                  <article
                    className={`officer-list-item resident-advisory-item ${
                      advisory.is_active ? "resident-advisory-active" : ""
                    }`}
                    key={advisory.id}
                  >
                    <div className="officer-list-heading">
                      <strong>{advisory.title}</strong>
                      <span className={`badge ${getLevelBadge(advisory.level)}`}>
                        {advisory.level ?? "Advisory"}
                      </span>
                      <span
                        className={`badge ${
                          advisory.is_active ? "badge-green" : "badge-gray"
                        }`}
                      >
                        {advisory.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <span>
                      <strong>Affected area:</strong> {advisory.area || "Not specified"}
                    </span>
                    <p>{advisory.details || "No instructions provided."}</p>
                    <small>
                      Issued by {issuer?.name ?? "Barangay operations"} ·{" "}
                      {formatDateTime(advisory.created_at)}
                    </small>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </DashboardLayout>
  );
}
