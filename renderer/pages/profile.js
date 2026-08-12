import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import withAuth from "../utils/withAuth";
import { getProfile, updateProfile } from "../services/userService";

function Profile() {
  const [form, setForm] = useState({
    staffId: "", name: "", email: "",
    phone: "", role: "", status: "",
  });

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [profileError, setProfileError] = useState("");

  useEffect(() => { fetchProfile(); }, []);

  const fetchProfile = async () => {
    try {
      const data = await getProfile();
      setForm({
        staffId: data.profile.staffId || "",
        name:    data.profile.name    || "",
        email:   data.profile.email   || "",
        phone:   data.profile.phone   || "",
        role:    data.profile.role    || "",
        status:  data.profile.status  || "",
      });
    } catch (err) {
      setProfileError(err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await updateProfile({ name: form.name, phone: form.phone });
      localStorage.setItem("name", data.user.name);
      const u = JSON.parse(localStorage.getItem("user"));
      u.name = data.user.name; u.phone = data.user.phone;
      localStorage.setItem("user", JSON.stringify(u));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setProfileError(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  /* ── initials avatar ── */
  const initials = form.name
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

  const isActive = form.status?.toLowerCase() === "active";

  if (loading) {
    return (
      <div className="dashboard">
        <Sidebar />
        <div className="main">
          <Header title="प्रोफाइल / My Profile" />
          <div style={styles.loadingWrap}>
            <div style={styles.spinner} />
            <p style={{ color: "#9ca3af", marginTop: "12px" }}>Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="main">
        <Header title="प्रोफाइल / My Profile" />

        <div style={styles.pageWrap}>

          {/* ── LEFT: Avatar card ── */}
          <div style={styles.avatarCard}>
            {/* Gradient bg strip */}
            <div style={styles.avatarStrip} />

            <div style={styles.avatarBody}>
              {/* Avatar circle */}
              <div style={styles.avatarCircle}>
                <span style={styles.avatarInitials}>{initials}</span>
              </div>

              <h2 style={styles.avatarName}>{form.name || "—"}</h2>
              <p style={styles.avatarEmail}>{form.email || "—"}</p>

              {/* Role pill */}
              <span style={styles.rolePill}>{form.role || "—"}</span>

              {/* Status */}
              <div style={{
                ...styles.statusPill,
                background: isActive ? "#f0fdf4" : "#fff1f2",
                color:      isActive ? "#15803d" : "#dc2626",
                border:     `1px solid ${isActive ? "#bbf7d0" : "#fecdd3"}`,
              }}>
                <span style={{
                  width: "7px", height: "7px", borderRadius: "50%",
                  background: isActive ? "#16a34a" : "#dc2626",
                  flexShrink: 0,
                }} />
                {isActive ? "Active" : "Inactive"}
              </div>

              {/* Staff ID badge */}
              <div style={styles.staffIdBox}>
                <span style={styles.staffIdLabel}>STAFF ID</span>
                <span style={styles.staffIdValue}>{form.staffId || "—"}</span>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Edit card ── */}
          <div style={styles.editCard}>

            {/* Header */}
            <div style={styles.editCardHeader}>
              <div>
                <p style={styles.editCardTitle}>प्रोफाइल संपादित करा / Edit Profile</p>
                <p style={styles.editCardSub}>Update your name and phone number</p>
              </div>
            </div>

            <div style={styles.divider} />

            {/* Read-only fields */}
            <div style={styles.sectionTitle}>Account Information</div>
            <div style={styles.fieldsGrid}>
              {[
                { label: "Staff ID", value: form.staffId },
                { label: "Role",     value: form.role    },
                { label: "Email",    value: form.email   },
                { label: "Status",   value: form.status  },
              ].map(({ label, value }) => (
                <div key={label} style={styles.readField}>
                  <label style={styles.fieldLabel}>{label}</label>
                  <div style={styles.readValue}>{value || "—"}</div>
                </div>
              ))}
            </div>

            <div style={styles.divider} />

            {/* Editable fields */}
            <div style={styles.sectionTitle}>Editable Fields</div>
            <div style={styles.editableGrid}>
              {[
                { label: "Full Name", name: "name",  placeholder: "Enter your name"  },
                { label: "Phone",     name: "phone", placeholder: "Enter phone number" },
              ].map(({ label, name, placeholder }) => (
                <div key={name}>
                  <label style={styles.fieldLabel}>{label}</label>
                  <input
                    name={name}
                    value={form[name]}
                    onChange={handleChange}
                    placeholder={placeholder}
                    style={styles.editInput}
                    onFocus={e => {
                      e.target.style.borderColor = "#f97316";
                      e.target.style.boxShadow   = "0 0 0 3px rgba(249,115,22,0.1)";
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = "#e5e7eb";
                      e.target.style.boxShadow   = "none";
                    }}
                  />
                </div>
              ))}
            </div>

            <p style={styles.hint}>
              Staff ID, Email, Role and Status are managed by Admin and cannot be changed here.
            </p>

            <div style={styles.divider} />

            {/* Error message */}
            {profileError && (
              <div style={{ background: "#fee2e2", border: "1px solid #ef4444", borderRadius: "8px", color: "#dc2626", padding: "10px 14px", margin: "8px 0", fontSize: "13px" }}>
                {profileError}
              </div>
            )}

            {/* Save button */}
            <button
              className="primary-btn"
              onClick={handleSave}
              disabled={saving}
              style={{ marginTop: "4px" }}
            >
              {saving ? "Saving..." : saved ? "Profile Updated!" : "Update Profile"}
            </button>

            {/* Success toast */}
            {saved && (
              <div style={styles.successToast}>
                Profile updated successfully!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────
   STYLES
────────────────────────────── */
const styles = {
  pageWrap: {
    display: "flex",
    gap: "20px",
    marginTop: "24px",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },

  /* ── Avatar card ── */
  avatarCard: {
    width: "240px",
    minWidth: "220px",
    background: "#fff",
    borderRadius: "20px",
    border: "1px solid #f0f0f0",
    boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
    overflow: "hidden",
    flexShrink: 0,
  },
  avatarStrip: {
    height: "80px",
    background: "linear-gradient(135deg, #f97316, #ea580c)",
  },
  avatarBody: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0 20px 24px",
    marginTop: "-40px",
  },
  avatarCircle: {
    width: "80px",
    height: "80px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #f97316, #c2410c)",
    border: "4px solid #fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 16px rgba(249,115,22,0.35)",
    flexShrink: 0,
  },
  avatarInitials: {
    color: "#fff",
    fontSize: "26px",
    fontWeight: 800,
    letterSpacing: "1px",
  },
  avatarName: {
    marginTop: "14px",
    fontSize: "16px",
    fontWeight: 800,
    color: "#111827",
    textAlign: "center",
    marginBottom: "4px",
  },
  avatarEmail: {
    fontSize: "12px",
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: "12px",
    wordBreak: "break-all",
  },
  rolePill: {
    background: "#fff7ed",
    color: "#c2410c",
    border: "1px solid #fed7aa",
    borderRadius: "20px",
    padding: "4px 14px",
    fontSize: "12px",
    fontWeight: 700,
    marginBottom: "10px",
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    borderRadius: "20px",
    padding: "4px 14px",
    fontSize: "12px",
    fontWeight: 700,
    marginBottom: "16px",
  },
  staffIdBox: {
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "10px 16px",
    width: "100%",
    textAlign: "center",
  },
  staffIdLabel: {
    display: "block",
    fontSize: "10px",
    fontWeight: 700,
    color: "#9ca3af",
    letterSpacing: "0.8px",
    marginBottom: "4px",
  },
  staffIdValue: {
    fontSize: "15px",
    fontWeight: 800,
    color: "#111827",
    letterSpacing: "1px",
  },

  /* ── Edit card ── */
  editCard: {
    flex: 1,
    minWidth: "300px",
    background: "#fff",
    borderRadius: "20px",
    border: "1px solid #f0f0f0",
    boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
    padding: "24px",
  },
  editCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "16px",
  },
  editCardTitle: {
    fontSize: "15px",
    fontWeight: 800,
    color: "#111827",
    margin: 0,
  },
  editCardSub: {
    fontSize: "12px",
    color: "#9ca3af",
    margin: "2px 0 0",
  },
  divider: {
    height: "1px",
    background: "#f3f4f6",
    margin: "16px 0",
  },
  sectionTitle: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: "12px",
  },
  fieldsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
  },
  editableGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
    marginBottom: "12px",
  },
  readField: {
    background: "#f9fafb",
    border: "1px solid #f3f4f6",
    borderRadius: "12px",
    padding: "12px 14px",
  },
  fieldLabel: {
    display: "block",
    fontSize: "11px",
    fontWeight: 700,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    marginBottom: "5px",
  },
  readValue: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#374151",
  },
  editInput: {
    width: "100%",
    padding: "11px 14px",
    border: "1.5px solid #e5e7eb",
    borderRadius: "12px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#111827",
    background: "#fff",
    outline: "none",
    fontFamily: "inherit",
    transition: "border-color 0.2s, box-shadow 0.2s",
    boxSizing: "border-box",
    marginTop: "0",
  },
  hint: {
    fontSize: "12px",
    color: "#9ca3af",
    marginTop: "4px",
    lineHeight: 1.5,
  },
  successToast: {
    marginTop: "12px",
    padding: "12px 16px",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "10px",
    color: "#15803d",
    fontSize: "13px",
    fontWeight: 600,
    textAlign: "center",
  },
  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "60px 20px",
  },
  spinner: {
    width: "36px",
    height: "36px",
    border: "3px solid #e5e7eb",
    borderTopColor: "#f97316",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
  },
};

export default withAuth(Profile, ["Admin", "Entry Operator", "Accountant"]);