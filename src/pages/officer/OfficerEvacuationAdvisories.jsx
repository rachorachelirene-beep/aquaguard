import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
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

function getLevelBadge(level) {
  if (level === "mandatory") {
    return "badge-red";
  }

  if (level === "warning") {
    return "badge-orange";
  }

  return "badge-green";
}

export default function OfficerEvacuationAdvisories() {
  const { profile } = useAuth();
  const [advisories, setAdvisories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [searchText, setSearchText] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [flash, setFlash] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [advisoryToDelete, setAdvisoryToDelete] = useState(null);
  const [form, setForm] = useState({
    title: "",
    area: "",
    level: "advisory",
    details: "",
  });

  const loadAdvisories = useCallback(async () => {
    try {
      setLoading(true);
      setFlash(null);

      const { data, error } = await supabase
        .from("evacuation_advisories")
        .select(
          "id, title, area, level, details, is_active, issued_by, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(300);

      if (error) {
        throw error;
      }

      setAdvisories(data ?? []);
    } catch (error) {
      console.error("Evacuation advisories loading error:", error);
      setFlash({
        type: "error",
        text: error.message || "Unable to load evacuation advisories.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function boot() {
      await loadAdvisories();
    }

    boot();
  }, [loadAdvisories]);

  useEffect(() => {
    if (!flash) {
      return undefined;
    }

    const timer = window.setTimeout(() => setFlash(null), 5000);
    return () => window.clearTimeout(timer);
  }, [flash]);

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
  }, [advisories, searchText, levelFilter, statusFilter]);

  function clearFilters() {
    setSearchText("");
    setLevelFilter("all");
    setStatusFilter("all");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setActionLoading("create");
    setFlash(null);

    const payload = {
      title: form.title.trim(),
      area: form.area.trim(),
      level: form.level,
      details: form.details.trim(),
      is_active: true,
    };

    if (profile?.id) {
      payload.issued_by = profile.id;
    }

    const { error } = await supabase
      .from("evacuation_advisories")
      .insert(payload);

    setActionLoading("");

    if (error) {
      setFlash({
        type: "error",
        text: error.message || "Unable to issue advisory.",
      });
      return;
    }

    setForm({
      title: "",
      area: "",
      level: "advisory",
      details: "",
    });
    setModalOpen(false);
    setFlash({ type: "success", text: "Evacuation advisory issued." });
    await loadAdvisories();
  }

  async function deactivateAdvisory(advisory) {
    setActionLoading(`deactivate-${advisory.id}`);
    setFlash(null);

    const { error } = await supabase
      .from("evacuation_advisories")
      .update({ is_active: false })
      .eq("id", advisory.id);

    setActionLoading("");

    if (error) {
      setFlash({
        type: "error",
        text: error.message || "Unable to deactivate advisory.",
      });
      return;
    }

    setAdvisories((current) =>
      current.map((item) =>
        item.id === advisory.id ? { ...item, is_active: false } : item
      )
    );
    setFlash({ type: "success", text: "Advisory deactivated." });
  }

  async function deleteAdvisory() {
    if (!advisoryToDelete) {
      return;
    }

    setActionLoading(`delete-${advisoryToDelete.id}`);
    setFlash(null);

    const { error } = await supabase
      .from("evacuation_advisories")
      .delete()
      .eq("id", advisoryToDelete.id);

    setActionLoading("");

    if (error) {
      setFlash({
        type: "error",
        text: error.message || "Unable to delete advisory.",
      });
      return;
    }

    setAdvisories((current) =>
      current.filter((item) => item.id !== advisoryToDelete.id)
    );
    setAdvisoryToDelete(null);
    setFlash({ type: "success", text: "Advisory deleted." });
  }

  const hasFilters =
    searchText || levelFilter !== "all" || statusFilter !== "all";

  return (
    <DashboardLayout
      title="Evacuation Advisories"
      description="Issue and manage evacuation notices for affected areas."
    >
      {flash && (
        <div className={`flash ${flash.type}`}>{flash.text}</div>
      )}

      <main className="page-content officer-page">
        <section className="section-card">
          <div className="section-title">
            <span>All Advisories</span>

            <button
              className="btn-submit officer-title-action"
              type="button"
              onClick={() => setModalOpen(true)}
            >
              <Plus size={16} />
              Issue Advisory
            </button>
          </div>

          <div className="officer-toolbar">
            <label className="officer-search">
              <Search size={17} />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search title, area, or details..."
              />
            </label>

            <select
              className="form-input officer-filter-select"
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value)}
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
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
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

            <span className="officer-count">
              {filteredAdvisories.length} record
              {filteredAdvisories.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Area</th>
                  <th>Level</th>
                  <th>Status</th>
                  <th>Issued By</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="officer-table-empty">
                      Loading advisories...
                    </td>
                  </tr>
                ) : filteredAdvisories.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="officer-table-empty">
                      No advisories found.
                    </td>
                  </tr>
                ) : (
                  filteredAdvisories.map((advisory) => (
                    <tr key={advisory.id}>
                      <td>{formatDateTime(advisory.created_at)}</td>
                      <td>
                        <strong>{advisory.title}</strong>
                        <small className="officer-table-subtext">
                          {advisory.details}
                        </small>
                      </td>
                      <td>{advisory.area}</td>
                      <td>
                        <span
                          className={`badge ${getLevelBadge(
                            advisory.level
                          )}`}
                        >
                          {advisory.level}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            advisory.is_active
                              ? "badge-green"
                              : "badge-gray"
                          }`}
                        >
                          {advisory.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        {advisory.issued_by === profile?.id
                          ? "You"
                          : "Officer"}
                      </td>
                      <td>
                        <div className="officer-table-actions">
                          {advisory.is_active && (
                            <button
                              className="btn-submit officer-icon-button"
                              type="button"
                              onClick={() => deactivateAdvisory(advisory)}
                              disabled={
                                actionLoading ===
                                `deactivate-${advisory.id}`
                              }
                            >
                              <CheckCircle2 size={15} />
                              Deactivate
                            </button>
                          )}

                          <button
                            className="btn-danger officer-icon-button"
                            type="button"
                            onClick={() => setAdvisoryToDelete(advisory)}
                          >
                            <Trash2 size={15} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <span>Issue Evacuation Advisory</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setModalOpen(false)}
              >
                x
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <label className="form-label" htmlFor="advisory-title">
                Title
              </label>
              <input
                id="advisory-title"
                className="form-input"
                type="text"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                required
              />

              <label className="form-label" htmlFor="advisory-area">
                Affected Area
              </label>
              <input
                id="advisory-area"
                className="form-input"
                type="text"
                value={form.area}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    area: event.target.value,
                  }))
                }
                placeholder="e.g. Brgy. Bucana, Davao City"
                required
              />

              <label className="form-label" htmlFor="advisory-level">
                Level
              </label>
              <select
                id="advisory-level"
                className="form-input"
                value={form.level}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    level: event.target.value,
                  }))
                }
              >
                <option value="advisory">Advisory (Prepare)</option>
                <option value="warning">Warning (Be Ready)</option>
                <option value="mandatory">
                  Mandatory (Evacuate Now)
                </option>
              </select>

              <label className="form-label" htmlFor="advisory-details">
                Details
              </label>
              <textarea
                id="advisory-details"
                className="form-input"
                rows="4"
                value={form.details}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    details: event.target.value,
                  }))
                }
                required
              />

              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  type="button"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn-submit"
                  type="submit"
                  disabled={actionLoading === "create"}
                >
                  {actionLoading === "create" ? "Issuing..." : "Issue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {advisoryToDelete && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <span>Delete Advisory</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setAdvisoryToDelete(null)}
              >
                x
              </button>
            </div>

            <div className="officer-confirm-body">
              <p>
                Delete <strong>{advisoryToDelete.title}</strong>?
              </p>

              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  type="button"
                  onClick={() => setAdvisoryToDelete(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-danger"
                  type="button"
                  onClick={deleteAdvisory}
                  disabled={
                    actionLoading === `delete-${advisoryToDelete.id}`
                  }
                >
                  {actionLoading === `delete-${advisoryToDelete.id}`
                    ? "Deleting..."
                    : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
