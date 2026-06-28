import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createClient } from "@supabase/supabase-js";

import {
  Check,
  Edit3,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  UserCheck,
  UserRound,
  UsersRound,
  UserX,
  X,
} from "lucide-react";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

import "./Users.css";


const accountCreatorClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);


const roleOptions = [
  {
    value: "admin",
    label: "Administrator",
  },
  {
    value: "barangay_officer",
    label: "Barangay Officer",
  },
  {
    value: "disaster_responder",
    label: "Disaster Responder",
  },
  {
    value: "resident",
    label: "Resident",
  },
];


const statusOptions = [
  {
    value: "active",
    label: "Active",
  },
  {
    value: "inactive",
    label: "Inactive",
  },
  {
    value: "suspended",
    label: "Suspended",
  },
];


const emptyCreateForm = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "resident",
  phone: "",
  address: "",
};


const emptyEditForm = {
  name: "",
  email: "",
  role: "resident",
  status: "active",
  phone: "",
  address: "",
  avatar_url: "",
};


function normalizeRole(value) {
  const role = String(
    value ?? "resident"
  ).toLowerCase();

  return roleOptions.some(
    (option) =>
      option.value === role
  )
    ? role
    : "resident";
}


function normalizeStatus(value) {
  const status = String(
    value ?? "active"
  ).toLowerCase();

  return statusOptions.some(
    (option) =>
      option.value === status
  )
    ? status
    : "active";
}


function getRoleDetails(value) {
  const role = normalizeRole(value);

  if (role === "admin") {
    return {
      label: "Administrator",
      className: "users-role-admin",
    };
  }

  if (role === "barangay_officer") {
    return {
      label: "Barangay Officer",
      className: "users-role-officer",
    };
  }

  if (role === "disaster_responder") {
    return {
      label: "Disaster Responder",
      className: "users-role-responder",
    };
  }

  return {
    label: "Resident",
    className: "users-role-resident",
  };
}


function getStatusDetails(value) {
  const status = normalizeStatus(value);

  if (status === "active") {
    return {
      label: "Active",
      className: "users-status-active",
      icon: UserCheck,
    };
  }

  if (status === "suspended") {
    return {
      label: "Suspended",
      className: "users-status-suspended",
      icon: ShieldAlert,
    };
  }

  return {
    label: "Inactive",
    className: "users-status-inactive",
    icon: UserX,
  };
}


function getInitials(name) {
  const words = String(
    name ?? "User"
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "U";
  }

  return words
    .slice(0, 2)
    .map((word) =>
      word.charAt(0).toUpperCase()
    )
    .join("");
}


export default function Users() {
  const {
    user: currentAuthUser,
  } = useAuth();

  const [users, setUsers] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [creating, setCreating] =
    useState(false);

  const [
    actionUserId,
    setActionUserId,
  ] = useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [searchText, setSearchText] =
    useState("");

  const [roleFilter, setRoleFilter] =
    useState("all");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [modalMode, setModalMode] =
    useState(null);

  const [
    selectedUser,
    setSelectedUser,
  ] = useState(null);

  const [createForm, setCreateForm] =
    useState(emptyCreateForm);

  const [editForm, setEditForm] =
    useState(emptyEditForm);


  const loadUsers =
    useCallback(async () => {
      try {
        setLoading(true);
        setErrorMessage("");

        const { data, error } =
          await supabase
            .from("profiles")
            .select(
              [
                "id",
                "name",
                "email",
                "role",
                "status",
                "phone",
                "address",
                "avatar_url",
              ].join(",")
            )
            .order("name", {
              ascending: true,
            });

        if (error) {
          throw error;
        }

        setUsers(data ?? []);
      } catch (error) {
        console.error(
          "Users loading error:",
          error
        );

        setErrorMessage(
          error.message ||
            "Unable to load users."
        );
      } finally {
        setLoading(false);
      }
    }, []);


  useEffect(() => {
    loadUsers();
  }, [loadUsers]);


  useEffect(() => {
    const channel = supabase
      .channel("admin-users-page")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
        },
        loadUsers
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadUsers]);


  useEffect(() => {
    if (
      !errorMessage &&
      !successMessage
    ) {
      return undefined;
    }

    const timer = window.setTimeout(
      () => {
        setErrorMessage("");
        setSuccessMessage("");
      },
      5000
    );

    return () =>
      window.clearTimeout(timer);
  }, [
    errorMessage,
    successMessage,
  ]);


  const statistics = useMemo(() => {
    return {
      total: users.length,

      active: users.filter(
        (profile) =>
          normalizeStatus(
            profile.status
          ) === "active"
      ).length,

      admins: users.filter(
        (profile) =>
          normalizeRole(
            profile.role
          ) === "admin"
      ).length,

      officers: users.filter(
        (profile) =>
          normalizeRole(
            profile.role
          ) ===
          "barangay_officer"
      ).length,

      responders: users.filter(
        (profile) =>
          normalizeRole(
            profile.role
          ) ===
          "disaster_responder"
      ).length,

      blocked: users.filter(
        (profile) =>
          [
            "inactive",
            "suspended",
          ].includes(
            normalizeStatus(
              profile.status
            )
          )
      ).length,
    };
  }, [users]);


  const filteredUsers = useMemo(() => {
    const keyword = searchText
      .trim()
      .toLowerCase();

    return users.filter(
      (profile) => {
        const searchableText = [
          profile.name,
          profile.email,
          profile.phone,
          profile.address,
          getRoleDetails(
            profile.role
          ).label,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const matchesSearch =
          !keyword ||
          searchableText.includes(
            keyword
          );

        const matchesRole =
          roleFilter === "all" ||
          normalizeRole(
            profile.role
          ) === roleFilter;

        const matchesStatus =
          statusFilter === "all" ||
          normalizeStatus(
            profile.status
          ) === statusFilter;

        return (
          matchesSearch &&
          matchesRole &&
          matchesStatus
        );
      }
    );
  }, [
    users,
    searchText,
    roleFilter,
    statusFilter,
  ]);


  function openCreateModal() {
    setCreateForm(
      emptyCreateForm
    );

    setSelectedUser(null);
    setModalMode("create");
  }


  function openEditModal(profile) {
    setSelectedUser(profile);

    setEditForm({
      name: profile.name ?? "",
      email: profile.email ?? "",
      role: normalizeRole(
        profile.role
      ),
      status: normalizeStatus(
        profile.status
      ),
      phone: profile.phone ?? "",
      address:
        profile.address ?? "",
      avatar_url:
        profile.avatar_url ?? "",
    });

    setModalMode("edit");
  }


  function closeModal() {
    if (saving || creating) {
      return;
    }

    setModalMode(null);
    setSelectedUser(null);
    setCreateForm(
      emptyCreateForm
    );
    setEditForm(
      emptyEditForm
    );
  }


  function updateCreateForm(
    field,
    value
  ) {
    setCreateForm(
      (currentForm) => ({
        ...currentForm,
        [field]: value,
      })
    );
  }


  function updateEditForm(
    field,
    value
  ) {
    setEditForm(
      (currentForm) => ({
        ...currentForm,
        [field]: value,
      })
    );
  }


  async function createUserAccount(
    event
  ) {
    event.preventDefault();

    const name =
      createForm.name.trim();

    const email =
      createForm.email
        .trim()
        .toLowerCase();

    if (!name || !email) {
      setErrorMessage(
        "Name and email address are required."
      );

      return;
    }

    if (
      createForm.password.length < 8
    ) {
      setErrorMessage(
        "Password must contain at least 8 characters."
      );

      return;
    }

    if (
      createForm.password !==
      createForm.confirmPassword
    ) {
      setErrorMessage(
        "Password confirmation does not match."
      );

      return;
    }

    try {
      setCreating(true);
      setErrorMessage("");
      setSuccessMessage("");

      const {
        data,
        error,
      } =
        await accountCreatorClient.auth.signUp(
          {
            email,
            password:
              createForm.password,

            options: {
              emailRedirectTo:
                `${window.location.origin}/login`,

              data: {
                name,
                role:
                  createForm.role,
              },
            },
          }
        );

      if (error) {
        throw error;
      }

      if (data.user?.id) {
        const {
          error: profileError,
        } = await supabase
          .from("profiles")
          .upsert(
            {
              id: data.user.id,
              name,
              email,
              role:
                createForm.role,
              status: "active",

              phone:
                createForm.phone
                  .trim() || null,

              address:
                createForm.address
                  .trim() || null,
            },
            {
              onConflict: "id",
            }
          );

        if (profileError) {
          console.warn(
            "Profile synchronization warning:",
            profileError
          );
        }
      }

      closeModal();

      await loadUsers();

      setSuccessMessage(
        data.session
          ? "User account created successfully."
          : "User account created. The user may need to confirm the email before signing in."
      );
    } catch (error) {
      console.error(
        "User account creation error:",
        error
      );

      const message =
        error.message ?? "";

      if (
        message
          .toLowerCase()
          .includes(
            "already registered"
          )
      ) {
        setErrorMessage(
          "That email address is already registered."
        );
      } else {
        setErrorMessage(
          message ||
            "Unable to create user account."
        );
      }
    } finally {
      setCreating(false);
    }
  }


  async function saveUserChanges(
    event
  ) {
    event.preventDefault();

    if (!selectedUser) {
      return;
    }

    if (!editForm.name.trim()) {
      setErrorMessage(
        "Full name is required."
      );

      return;
    }

    const isCurrentUser =
      String(selectedUser.id) ===
      String(
        currentAuthUser?.id
      );

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      const changes = {
        name:
          editForm.name.trim(),

        phone:
          editForm.phone
            .trim() || null,

        address:
          editForm.address
            .trim() || null,

        avatar_url:
          editForm.avatar_url
            .trim() || null,

        role: isCurrentUser
          ? normalizeRole(
              selectedUser.role
            )
          : editForm.role,

        status: isCurrentUser
          ? normalizeStatus(
              selectedUser.status
            )
          : editForm.status,
      };

      const { error } = await supabase
        .from("profiles")
        .update(changes)
        .eq(
          "id",
          selectedUser.id
        );

      if (error) {
        throw error;
      }

      setUsers(
        (currentUsers) =>
          currentUsers.map(
            (profile) =>
              profile.id ===
              selectedUser.id
                ? {
                    ...profile,
                    ...changes,
                  }
                : profile
          )
      );

      closeModal();

      setSuccessMessage(
        isCurrentUser
          ? "Your profile information was updated. Your own role and status were protected."
          : "User profile updated successfully."
      );
    } catch (error) {
      console.error(
        "User update error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to update user."
      );
    } finally {
      setSaving(false);
    }
  }


  async function changeUserStatus(
    profile,
    nextStatus
  ) {
    const isCurrentUser =
      String(profile.id) ===
      String(
        currentAuthUser?.id
      );

    if (isCurrentUser) {
      setErrorMessage(
        "You cannot deactivate or suspend your own administrator account."
      );

      return;
    }

    try {
      setActionUserId(
        String(profile.id)
      );

      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase
        .from("profiles")
        .update({
          status: nextStatus,
        })
        .eq("id", profile.id);

      if (error) {
        throw error;
      }

      setUsers(
        (currentUsers) =>
          currentUsers.map(
            (currentProfile) =>
              currentProfile.id ===
              profile.id
                ? {
                    ...currentProfile,
                    status:
                      nextStatus,
                  }
                : currentProfile
          )
      );

      setSuccessMessage(
        `${profile.name} is now ${nextStatus}.`
      );
    } catch (error) {
      console.error(
        "User status error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to update user status."
      );
    } finally {
      setActionUserId("");
    }
  }


  async function sendPasswordReset(
    profile
  ) {
    if (!profile.email) {
      setErrorMessage(
        "This user has no email address."
      );

      return;
    }

    try {
      setActionUserId(
        `reset-${profile.id}`
      );

      setErrorMessage("");
      setSuccessMessage("");

      const { error } =
        await supabase.auth
          .resetPasswordForEmail(
            profile.email,
            {
              redirectTo:
                `${window.location.origin}/login`,
            }
          );

      if (error) {
        throw error;
      }

      setSuccessMessage(
        `Password-reset email sent to ${profile.email}.`
      );
    } catch (error) {
      console.error(
        "Password-reset error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Unable to send password-reset email."
      );
    } finally {
      setActionUserId("");
    }
  }


  function clearFilters() {
    setSearchText("");
    setRoleFilter("all");
    setStatusFilter("all");
  }


  const hasFilters =
    searchText ||
    roleFilter !== "all" ||
    statusFilter !== "all";


  return (
    <DashboardLayout
      title="Users"
      description="Manage AquaGuard accounts, roles and access status"
    >
      <main className="users-page">
        {errorMessage && (
          <div className="users-message users-message-error">
            <ShieldAlert size={18} />

            <span>
              {errorMessage}
            </span>

            <button
              type="button"
              onClick={() =>
                setErrorMessage("")
              }
              aria-label="Close error"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="users-message users-message-success">
            <Check size={18} />

            <span>
              {successMessage}
            </span>

            <button
              type="button"
              onClick={() =>
                setSuccessMessage("")
              }
              aria-label="Close message"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <section className="users-heading-card">
          <div className="users-heading-icon">
            <UsersRound size={30} />
          </div>

          <div>
            <span className="users-eyebrow">
              Account administration
            </span>

            <h2>
              AquaGuard Users
            </h2>

            <p>
              Create accounts and manage
              user roles, profile details
              and account access.
            </p>
          </div>

          <button
            type="button"
            className="users-primary-button"
            onClick={openCreateModal}
          >
            <Plus size={17} />
            Add user
          </button>
        </section>

        <section className="users-stat-grid">
          <article className="users-stat-card">
            <div className="users-stat-icon users-icon-blue">
              <UsersRound size={21} />
            </div>

            <div>
              <span>Total users</span>

              <strong>
                {statistics.total}
              </strong>

              <small>
                Registered profiles
              </small>
            </div>
          </article>

          <article className="users-stat-card">
            <div className="users-stat-icon users-icon-green">
              <UserCheck size={21} />
            </div>

            <div>
              <span>Active</span>

              <strong>
                {statistics.active}
              </strong>

              <small>
                Can access system
              </small>
            </div>
          </article>

          <article className="users-stat-card">
            <div className="users-stat-icon users-icon-purple">
              <Shield size={21} />
            </div>

            <div>
              <span>Administrators</span>

              <strong>
                {statistics.admins}
              </strong>

              <small>
                Full system access
              </small>
            </div>
          </article>

          <article className="users-stat-card">
            <div className="users-stat-icon users-icon-cyan">
              <UserRound size={21} />
            </div>

            <div>
              <span>Officers</span>

              <strong>
                {statistics.officers}
              </strong>

              <small>
                Barangay officers
              </small>
            </div>
          </article>

          <article className="users-stat-card">
            <div className="users-stat-icon users-icon-orange">
              <ShieldAlert size={21} />
            </div>

            <div>
              <span>Responders</span>

              <strong>
                {statistics.responders}
              </strong>

              <small>
                Disaster responders
              </small>
            </div>
          </article>

          <article className="users-stat-card">
            <div className="users-stat-icon users-icon-red">
              <UserX size={21} />
            </div>

            <div>
              <span>Blocked</span>

              <strong>
                {statistics.blocked}
              </strong>

              <small>
                Inactive or suspended
              </small>
            </div>
          </article>
        </section>

        <section className="users-toolbar">
          <div className="users-search">
            <Search size={17} />

            <input
              type="search"
              value={searchText}
              onChange={(event) =>
                setSearchText(
                  event.target.value
                )
              }
              placeholder="Search name, email, phone or address..."
            />
          </div>

          <label className="users-filter">
            <span>Role</span>

            <select
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(
                  event.target.value
                )
              }
            >
              <option value="all">
                All roles
              </option>

              {roleOptions.map(
                (option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                )
              )}
            </select>
          </label>

          <label className="users-filter">
            <span>Status</span>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value
                )
              }
            >
              <option value="all">
                All statuses
              </option>

              {statusOptions.map(
                (option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                )
              )}
            </select>
          </label>

          <div className="users-toolbar-actions">
            {hasFilters && (
              <button
                type="button"
                className="users-secondary-button"
                onClick={clearFilters}
              >
                <X size={16} />
                Clear
              </button>
            )}

            <button
              type="button"
              className="users-secondary-button"
              onClick={loadUsers}
              disabled={loading}
            >
              <RefreshCw
                size={16}
                className={
                  loading
                    ? "users-spin"
                    : ""
                }
              />

              Refresh
            </button>
          </div>
        </section>

        <section className="users-list-card">
          <header className="users-section-header">
            <div>
              <span className="users-eyebrow">
                User directory
              </span>

              <h3>
                Registered accounts
              </h3>
            </div>

            <span className="users-record-count">
              {filteredUsers.length} user
              {filteredUsers.length === 1
                ? ""
                : "s"}
            </span>
          </header>

          {loading ? (
            <div className="users-empty">
              <RefreshCw
                size={30}
                className="users-spin"
              />

              <strong>
                Loading users...
              </strong>
            </div>
          ) : filteredUsers.length ===
            0 ? (
            <div className="users-empty">
              <UsersRound size={40} />

              <strong>
                No users found
              </strong>

              <span>
                No users match the
                selected filters.
              </span>
            </div>
          ) : (
            <div className="users-table-wrapper">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th>Access control</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredUsers.map(
                    (profile) => {
                      const role =
                        getRoleDetails(
                          profile.role
                        );

                      const status =
                        getStatusDetails(
                          profile.status
                        );

                      const StatusIcon =
                        status.icon;

                      const isCurrentUser =
                        String(
                          profile.id
                        ) ===
                        String(
                          currentAuthUser?.id
                        );

                      const isBusy =
                        actionUserId ===
                          String(
                            profile.id
                          ) ||
                        actionUserId ===
                          `reset-${profile.id}`;

                      return (
                        <tr key={profile.id}>
                          <td>
                            <div className="users-profile-cell">
                              <div className="users-avatar">
                                {profile.avatar_url ? (
                                  <img
                                    src={
                                      profile.avatar_url
                                    }
                                    alt={
                                      profile.name ||
                                      "User"
                                    }
                                  />
                                ) : (
                                  <span>
                                    {getInitials(
                                      profile.name
                                    )}
                                  </span>
                                )}
                              </div>

                              <div>
                                <strong>
                                  {profile.name ||
                                    "Unnamed user"}

                                  {isCurrentUser && (
                                    <small className="users-you-badge">
                                      You
                                    </small>
                                  )}
                                </strong>

                                <span>
                                  {profile.email ||
                                    "No email"}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td>
                            <span
                              className={`users-role-badge ${role.className}`}
                            >
                              {role.label}
                            </span>
                          </td>

                          <td>
                            <div className="users-contact-cell">
                              <span>
                                <Phone size={14} />

                                {profile.phone ||
                                  "No phone"}
                              </span>

                              <span>
                                <MapPin size={14} />

                                {profile.address ||
                                  "No address"}
                              </span>
                            </div>
                          </td>

                          <td>
                            <span
                              className={`users-status-badge ${status.className}`}
                            >
                              <StatusIcon
                                size={13}
                              />

                              {status.label}
                            </span>
                          </td>

                          <td>
                            <select
                              value={normalizeStatus(
                                profile.status
                              )}
                              onChange={(event) =>
                                changeUserStatus(
                                  profile,
                                  event.target.value
                                )
                              }
                              disabled={
                                isCurrentUser ||
                                isBusy
                              }
                              aria-label={`Change ${profile.name} account status`}
                            >
                              {statusOptions.map(
                                (option) => (
                                  <option
                                    key={
                                      option.value
                                    }
                                    value={
                                      option.value
                                    }
                                  >
                                    {
                                      option.label
                                    }
                                  </option>
                                )
                              )}
                            </select>
                          </td>

                          <td>
                            <div className="users-action-buttons">
                              <button
                                type="button"
                                onClick={() =>
                                  sendPasswordReset(
                                    profile
                                  )
                                }
                                disabled={
                                  isBusy ||
                                  !profile.email
                                }
                                title="Send password reset"
                              >
                                <KeyRound
                                  size={16}
                                />
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  openEditModal(
                                    profile
                                  )
                                }
                                disabled={isBusy}
                                title="Edit user"
                              >
                                <Edit3
                                  size={16}
                                />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {modalMode === "create" && (
          <div
            className="users-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeModal();
              }
            }}
          >
            <div
              className="users-modal"
              role="dialog"
              aria-modal="true"
            >
              <header className="users-modal-header">
                <div>
                  <span className="users-eyebrow">
                    New account
                  </span>

                  <h2>
                    Add AquaGuard user
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>
              </header>

              <form
                className="users-modal-form"
                onSubmit={
                  createUserAccount
                }
              >
                <div className="users-form-grid">
                  <label className="users-field users-field-full">
                    <span>
                      Full name
                    </span>

                    <input
                      type="text"
                      value={
                        createForm.name
                      }
                      onChange={(event) =>
                        updateCreateForm(
                          "name",
                          event.target.value
                        )
                      }
                      placeholder="Juan dela Cruz"
                      required
                    />
                  </label>

                  <label className="users-field">
                    <span>
                      Email address
                    </span>

                    <input
                      type="email"
                      value={
                        createForm.email
                      }
                      onChange={(event) =>
                        updateCreateForm(
                          "email",
                          event.target.value
                        )
                      }
                      placeholder="user@example.com"
                      required
                    />
                  </label>

                  <label className="users-field">
                    <span>Role</span>

                    <select
                      value={
                        createForm.role
                      }
                      onChange={(event) =>
                        updateCreateForm(
                          "role",
                          event.target.value
                        )
                      }
                    >
                      {roleOptions.map(
                        (option) => (
                          <option
                            key={
                              option.value
                            }
                            value={
                              option.value
                            }
                          >
                            {
                              option.label
                            }
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label className="users-field">
                    <span>Password</span>

                    <input
                      type="password"
                      minLength="8"
                      autoComplete="new-password"
                      value={
                        createForm.password
                      }
                      onChange={(event) =>
                        updateCreateForm(
                          "password",
                          event.target.value
                        )
                      }
                      placeholder="Minimum 8 characters"
                      required
                    />
                  </label>

                  <label className="users-field">
                    <span>
                      Confirm password
                    </span>

                    <input
                      type="password"
                      minLength="8"
                      autoComplete="new-password"
                      value={
                        createForm.confirmPassword
                      }
                      onChange={(event) =>
                        updateCreateForm(
                          "confirmPassword",
                          event.target.value
                        )
                      }
                      required
                    />
                  </label>

                  <label className="users-field">
                    <span>
                      Phone number
                    </span>

                    <input
                      type="tel"
                      value={
                        createForm.phone
                      }
                      onChange={(event) =>
                        updateCreateForm(
                          "phone",
                          event.target.value
                        )
                      }
                      placeholder="09XXXXXXXXX"
                    />
                  </label>

                  <label className="users-field">
                    <span>Address</span>

                    <input
                      type="text"
                      value={
                        createForm.address
                      }
                      onChange={(event) =>
                        updateCreateForm(
                          "address",
                          event.target.value
                        )
                      }
                      placeholder="Complete address"
                    />
                  </label>
                </div>

                <div className="users-account-note">
                  <Mail size={20} />

                  <span>
                    The user may receive
                    an email-confirmation
                    message depending on
                    your Supabase
                    authentication settings.
                  </span>
                </div>

                <footer className="users-modal-actions">
                  <button
                    type="button"
                    className="users-secondary-button"
                    onClick={closeModal}
                    disabled={creating}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="users-primary-button"
                    disabled={creating}
                  >
                    {creating ? (
                      <RefreshCw
                        size={16}
                        className="users-spin"
                      />
                    ) : (
                      <Plus size={16} />
                    )}

                    {creating
                      ? "Creating..."
                      : "Create user"}
                  </button>
                </footer>
              </form>
            </div>
          </div>
        )}

        {modalMode === "edit" &&
          selectedUser && (
            <div
              className="users-modal-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (
                  event.target ===
                  event.currentTarget
                ) {
                  closeModal();
                }
              }}
            >
              <div
                className="users-modal"
                role="dialog"
                aria-modal="true"
              >
                <header className="users-modal-header">
                  <div>
                    <span className="users-eyebrow">
                      User profile
                    </span>

                    <h2>
                      Edit AquaGuard user
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={closeModal}
                    aria-label="Close modal"
                  >
                    <X size={20} />
                  </button>
                </header>

                <form
                  className="users-modal-form"
                  onSubmit={
                    saveUserChanges
                  }
                >
                  <div className="users-edit-summary">
                    <div className="users-avatar users-avatar-large">
                      {editForm.avatar_url ? (
                        <img
                          src={
                            editForm.avatar_url
                          }
                          alt={
                            editForm.name ||
                            "User"
                          }
                        />
                      ) : (
                        <span>
                          {getInitials(
                            editForm.name
                          )}
                        </span>
                      )}
                    </div>

                    <div>
                      <strong>
                        {editForm.name ||
                          "User"}
                      </strong>

                      <span>
                        {editForm.email}
                      </span>
                    </div>
                  </div>

                  <div className="users-form-grid">
                    <label className="users-field">
                      <span>
                        Full name
                      </span>

                      <input
                        type="text"
                        value={
                          editForm.name
                        }
                        onChange={(event) =>
                          updateEditForm(
                            "name",
                            event.target.value
                          )
                        }
                        required
                      />
                    </label>

                    <label className="users-field">
                      <span>
                        Email address
                      </span>

                      <input
                        type="email"
                        value={
                          editForm.email
                        }
                        readOnly
                      />
                    </label>

                    <label className="users-field">
                      <span>Role</span>

                      <select
                        value={
                          editForm.role
                        }
                        onChange={(event) =>
                          updateEditForm(
                            "role",
                            event.target.value
                          )
                        }
                        disabled={
                          String(
                            selectedUser.id
                          ) ===
                          String(
                            currentAuthUser?.id
                          )
                        }
                      >
                        {roleOptions.map(
                          (option) => (
                            <option
                              key={
                                option.value
                              }
                              value={
                                option.value
                              }
                            >
                              {
                                option.label
                              }
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    <label className="users-field">
                      <span>Status</span>

                      <select
                        value={
                          editForm.status
                        }
                        onChange={(event) =>
                          updateEditForm(
                            "status",
                            event.target.value
                          )
                        }
                        disabled={
                          String(
                            selectedUser.id
                          ) ===
                          String(
                            currentAuthUser?.id
                          )
                        }
                      >
                        {statusOptions.map(
                          (option) => (
                            <option
                              key={
                                option.value
                              }
                              value={
                                option.value
                              }
                            >
                              {
                                option.label
                              }
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    <label className="users-field">
                      <span>
                        Phone number
                      </span>

                      <input
                        type="tel"
                        value={
                          editForm.phone
                        }
                        onChange={(event) =>
                          updateEditForm(
                            "phone",
                            event.target.value
                          )
                        }
                      />
                    </label>

                    <label className="users-field">
                      <span>
                        Avatar URL
                      </span>

                      <input
                        type="url"
                        value={
                          editForm.avatar_url
                        }
                        onChange={(event) =>
                          updateEditForm(
                            "avatar_url",
                            event.target.value
                          )
                        }
                        placeholder="https://..."
                      />
                    </label>

                    <label className="users-field users-field-full">
                      <span>Address</span>

                      <textarea
                        rows="3"
                        value={
                          editForm.address
                        }
                        onChange={(event) =>
                          updateEditForm(
                            "address",
                            event.target.value
                          )
                        }
                      />
                    </label>
                  </div>

                  {String(
                    selectedUser.id
                  ) ===
                    String(
                      currentAuthUser?.id
                    ) && (
                    <div className="users-account-warning">
                      <Shield size={20} />

                      <span>
                        Your own
                        administrator role
                        and account status
                        cannot be changed
                        from this page.
                      </span>
                    </div>
                  )}

                  <footer className="users-modal-actions">
                    <button
                      type="button"
                      className="users-secondary-button"
                      onClick={closeModal}
                      disabled={saving}
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      className="users-primary-button"
                      disabled={saving}
                    >
                      {saving ? (
                        <RefreshCw
                          size={16}
                          className="users-spin"
                        />
                      ) : (
                        <Edit3 size={16} />
                      )}

                      {saving
                        ? "Saving..."
                        : "Save changes"}
                    </button>
                  </footer>
                </form>
              </div>
            </div>
          )}
      </main>
    </DashboardLayout>
  );
}