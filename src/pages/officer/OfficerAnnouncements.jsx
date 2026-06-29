import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, Trash2, X } from "lucide-react";

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

export default function OfficerAnnouncements() {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [searchText, setSearchText] = useState("");
  const [flash, setFlash] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [announcementToDelete, setAnnouncementToDelete] =
    useState(null);
  const [form, setForm] = useState({
    title: "",
    body: "",
  });

  const loadAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      setFlash(null);

      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, created_at, created_by")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        throw error;
      }

      setAnnouncements(data ?? []);
    } catch (error) {
      console.error("Announcements loading error:", error);
      setFlash({
        type: "error",
        text: error.message || "Unable to load announcements.",
      });
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

  useEffect(() => {
    if (!flash) {
      return undefined;
    }

    const timer = window.setTimeout(() => setFlash(null), 5000);
    return () => window.clearTimeout(timer);
  }, [flash]);

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

  async function handleSubmit(event) {
    event.preventDefault();
    setActionLoading("create");
    setFlash(null);

    const { error } = await supabase.from("announcements").insert({
      title: form.title.trim(),
      body: form.body.trim(),
      created_by: profile?.id ?? null,
    });

    setActionLoading("");

    if (error) {
      setFlash({
        type: "error",
        text: error.message || "Unable to publish announcement.",
      });
      return;
    }

    setForm({ title: "", body: "" });
    setModalOpen(false);
    setFlash({ type: "success", text: "Announcement published." });
    await loadAnnouncements();
  }

  async function deleteAnnouncement() {
    if (!announcementToDelete) {
      return;
    }

    setActionLoading(`delete-${announcementToDelete.id}`);
    setFlash(null);

    const { error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", announcementToDelete.id);

    setActionLoading("");

    if (error) {
      setFlash({
        type: "error",
        text: error.message || "Unable to delete announcement.",
      });
      return;
    }

    setAnnouncements((current) =>
      current.filter((item) => item.id !== announcementToDelete.id)
    );
    setAnnouncementToDelete(null);
    setFlash({ type: "success", text: "Announcement deleted." });
  }

  return (
    <DashboardLayout
      title="Announcements"
      description="Publish and manage barangay announcements."
    >
      {flash && (
        <div className={`flash ${flash.type}`}>{flash.text}</div>
      )}

      <main className="page-content officer-page">
        <section className="section-card">
          <div className="section-title">
            <span>All Announcements</span>

            <button
              className="btn-submit officer-title-action"
              type="button"
              onClick={() => setModalOpen(true)}
            >
              <Plus size={16} />
              New Announcement
            </button>
          </div>

          <div className="officer-toolbar">
            <label className="officer-search">
              <Search size={17} />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search title or message..."
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

            <span className="officer-count">
              {filteredAnnouncements.length} record
              {filteredAnnouncements.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Message</th>
                  <th>By</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="officer-table-empty">
                      Loading announcements...
                    </td>
                  </tr>
                ) : filteredAnnouncements.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="officer-table-empty">
                      No announcements found.
                    </td>
                  </tr>
                ) : (
                  filteredAnnouncements.map((announcement) => (
                    <tr key={announcement.id}>
                      <td>{formatDateTime(announcement.created_at)}</td>
                      <td>
                        <strong>{announcement.title}</strong>
                      </td>
                      <td className="officer-table-message">
                        {announcement.body}
                      </td>
                      <td>
                        {announcement.created_by === profile?.id
                          ? "You"
                          : "Officer"}
                      </td>
                      <td>
                        <button
                          className="btn-danger officer-icon-button"
                          type="button"
                          onClick={() =>
                            setAnnouncementToDelete(announcement)
                          }
                        >
                          <Trash2 size={15} />
                          Delete
                        </button>
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
              <span>New Announcement</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setModalOpen(false)}
              >
                x
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <label className="form-label" htmlFor="announcement-title">
                Title
              </label>
              <input
                id="announcement-title"
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

              <label className="form-label" htmlFor="announcement-body">
                Message
              </label>
              <textarea
                id="announcement-body"
                className="form-input"
                rows="5"
                value={form.body}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    body: event.target.value,
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
                  {actionLoading === "create" ? "Publishing..." : "Publish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {announcementToDelete && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <span>Delete Announcement</span>
              <button
                className="modal-close"
                type="button"
                onClick={() => setAnnouncementToDelete(null)}
              >
                x
              </button>
            </div>

            <div className="officer-confirm-body">
              <p>
                Delete <strong>{announcementToDelete.title}</strong>?
              </p>

              <div className="modal-footer">
                <button
                  className="btn-cancel"
                  type="button"
                  onClick={() => setAnnouncementToDelete(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-danger"
                  type="button"
                  onClick={deleteAnnouncement}
                  disabled={
                    actionLoading === `delete-${announcementToDelete.id}`
                  }
                >
                  {actionLoading === `delete-${announcementToDelete.id}`
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
