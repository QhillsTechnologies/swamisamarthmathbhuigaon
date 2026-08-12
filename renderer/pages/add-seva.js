import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import withAuth from "../utils/withAuth";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import apiRequest from "../services/api";
import Pagination from "../components/Pagination";

/* ============================================================
   CONSTANTS
============================================================ */
const DATE_RULES = [
  { key: "any",      label: "Any Future Date",       mr: "कोणतीही भविष्यातील तारीख" },
  { key: "thursday", label: "Thursday Only",          mr: "फक्त गुरुवार" },
  { key: "sun_thu",  label: "Sunday & Thursday Only", mr: "रविवार आणि गुरुवार" },
  { key: "specific", label: "Specific Dates Only",    mr: "विशिष्ट तारखा" },
];

function AddSeva() {
  const router = useRouter();

  /* ── Step ── */
  const [step, setStep] = useState(1);

  /* ── Edit mode ── */
  const [editingId, setEditingId] = useState(null); // null = add mode, id = edit mode

  /* ── Step 1: Event Type ── */
  const [eventType, setEventType] = useState("");

  /* ── Step 2: Name ── */
  const [displayName, setDisplayName] = useState("");

  /* ── Step 3: Amount ── */
  const [amountType, setAmountType] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");

  /* ── Step 5: Payment Options ── */
  const [paymentOptions, setPaymentOptions] = useState("");

  /* ── Step 6: Date Rules ── */
  const [dateRule, setDateRule] = useState("");
  const [specificDates, setSpecificDates] = useState([]);
  const [maxPerDate, setMaxPerDate] = useState("");

  /* ── List & UI state ── */
  const [sevaList, setSevaList] = useState([]);
  const [sevaLoading, setSevaLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sevaPage, setSevaPage] = useState(1);
  const SEVA_PER_PAGE = 8;
  const [toast, setToast] = useState("");
  const [sevaError, setSevaError] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [blockOnSpecialDates, setBlockOnSpecialDates] = useState(false);
  const [allowMultiDate, setAllowMultiDate] = useState(false);
  const [hasGotra, setHasGotra] = useState(false);

  /* ============================================================
     LOCAL FLAG HELPERS
     Wix backend may not persist allowMultiDate / hasGotra /
     blockOnSpecialDates, so we cache them in localStorage
     keyed by "eventType::displayName" and merge on every load.
  ============================================================ */
  const getLocalSevaFlags = () => {
    try { return JSON.parse(localStorage.getItem("sevaLocalFlags") || "{}"); }
    catch { return {}; }
  };

  const saveLocalSevaFlag = (evType, name, flags) => {
    const key = `${evType}::${name.trim()}`;
    const existing = getLocalSevaFlags();
    existing[key] = flags;
    localStorage.setItem("sevaLocalFlags", JSON.stringify(existing));
  };

  /* ============================================================
     LOAD EXISTING SEVA LIST
  ============================================================ */
  useEffect(() => {
    loadSevaList();
  }, []);

  const loadSevaList = async () => {
    try {
      const res = await apiRequest("/get_seva_list");
      const list = res.sevaList || res.data || res || [];
      const rawList = Array.isArray(list) ? list : [];
      const localFlags = getLocalSevaFlags();
      const merged = rawList.map((s) => {
        const key = `${s.eventType}::${(s.displayName || "").trim()}`;
        return localFlags[key] ? { ...s, ...localFlags[key] } : s;
      });
      setSevaList(merged);
      setSevaPage(1);
    } catch {
      setSevaList([]);
      setSevaPage(1);
    } finally {
      setSevaLoading(false);
    }
  };

  /* ============================================================
     HELPERS
  ============================================================ */
  const toDBDate = (date) => {
    if (!date) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const toDisplayDate = (date) => {
    if (!date) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${d}-${m}-${y}`;
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const resetForm = () => {
    setEditingId(null);
    setStep(1); setEventType(""); setDisplayName("");
    setAmountType(""); setFixedAmount("");
    setPaymentOptions(""); setDateRule(""); setSpecificDates([]); setMaxPerDate("");
    setIsActive(true); setBlockOnSpecialDates(false);
    setAllowMultiDate(false); setHasGotra(false);
  };

  /* ============================================================
     EDIT — populate form from existing seva
  ============================================================ */
  const handleEdit = (seva) => {
    const id = seva._id || seva.id;
    setEditingId(id);
    setStep(1);

    // Restore all fields
    setEventType(seva.eventType || "");
    setDisplayName(seva.displayName || "");
    setAmountType(seva.amountType || "");
    setFixedAmount(seva.amount ? String(seva.amount) : "");
    setPaymentOptions(seva.paymentOptions || "");
    setDateRule(seva.dateRule || "");
    setSpecificDates(
      (seva.specificDates || [])
        .map((d) => {
          const str = typeof d === "string" ? d.split("T")[0] : d;
          const [y, m, day] = str.split("-").map(Number);
          const date = new Date(y, m - 1, day);
          return isNaN(date.getTime()) ? null : date;
        })
        .filter(Boolean)
    );
    setMaxPerDate(seva.maxPerDate ? String(seva.maxPerDate) : "");
    setIsActive(seva.isActive !== false);
    setBlockOnSpecialDates(!!seva.blockOnSpecialDates);
    setAllowMultiDate(!!seva.allowMultiDate);
    setHasGotra(!!seva.hasGotra);

    // Scroll to form
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast("Editing: " + seva.displayName);
  };

  /* ============================================================
     SPECIFIC DATES CALENDAR TOGGLE
  ============================================================ */
  const handleSpecificDateToggle = (date) => {
    if (!date) return;
    const dateStr = toDBDate(date);
    const exists = specificDates.some((d) => toDBDate(d) === dateStr);
    if (exists) setSpecificDates(specificDates.filter((d) => toDBDate(d) !== dateStr));
    else setSpecificDates([...specificDates, date]);
  };

  /* ============================================================
     STEP VALIDATION
  ============================================================ */
  const canProceed = () => {
    if (step === 1) return !!eventType;
    if (step === 2) return displayName.trim().length >= 2;
    if (step === 3) {
      if (!amountType) return false;
      if (amountType === "fixed" && (!fixedAmount || Number(fixedAmount) <= 0)) return false;
      return true;
    }
    if (step === 4) {
      if (amountType === "flexible") return true;
      return !!paymentOptions;
    }
    if (step === 5) {
      if (!dateRule) return false;
      if (dateRule === "specific" && specificDates.length === 0) return false;
      return true;
    }
    return true;
  };

  /* ============================================================
     SAVE / UPDATE SEVA
  ============================================================ */
  const handleSave = async () => {
    try {
      setSaving(true);

      const nameKey = eventType === "special"
        ? `special_${displayName.trim()}`
        : `regular_${displayName.trim()}`;

      const payload = {
        eventType,
        displayName: displayName.trim(),
        specialEventName: eventType === "special" ? nameKey : "",
        regularEventName: eventType === "regular" ? nameKey : "",
        amountType,
        amount: amountType === "fixed" ? Number(fixedAmount) : 0,
        paymentOptions: amountType === "flexible" ? "full" : paymentOptions,
        dateRule,
        specificDates: dateRule === "specific" ? specificDates.map(toDBDate).sort() : [],
        dates: dateRule === "specific" ? specificDates.map(toDBDate).sort().join(",") : "",
        maxPerDate: maxPerDate ? Number(maxPerDate) : 0,
        blockOnSpecialDates: eventType === "special" ? blockOnSpecialDates : false,
        allowMultiDate,
        hasGotra,
        isActive,
      };

      if (editingId) {
        // ── UPDATE existing seva ──
        await apiRequest("/update_seva", {
          method: "POST",
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        showToast("Seva updated successfully!");
      } else {
        // ── CREATE new seva ──
        payload.createdAt = new Date();
        await apiRequest("/save_seva", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("Seva saved successfully!");
      }

      saveLocalSevaFlag(eventType, displayName, { allowMultiDate, hasGotra, blockOnSpecialDates });
      await loadSevaList();
      resetForm();
    } catch (err) {
      setSevaError(err.message || "Failed to save seva");
    } finally {
      setSaving(false);
    }
  };

  /* ============================================================
     TOGGLE ACTIVE / INACTIVE
  ============================================================ */
  const handleToggleActive = async (id, currentActive) => {
    try {
      const newActive = currentActive === false ? true : false;
      await apiRequest("/toggle_seva_active", {
        method: "POST",
        body: JSON.stringify({ id, isActive: newActive }),
      });
      setSevaList(sevaList.map((s) =>
        (s._id || s.id) === id ? { ...s, isActive: newActive } : s
      ));
      showToast(newActive ? "Seva activated" : "Seva deactivated");
    } catch (err) {
      setSevaError(err.message || "Failed to update seva");
    }
  };

  /* ============================================================
     DELETE SEVA
  ============================================================ */
  const handleDelete = async (id) => {
    if (!confirm("Delete this seva?")) return;
    try {
      await apiRequest("/delete_seva", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      setSevaList(sevaList.filter((s) => (s._id || s.id) !== id));
      if (editingId === id) resetForm();
      showToast("Seva deleted");
    } catch (err) {
      setSevaError(err.message || "Failed to delete");
    }
  };

  /* ============================================================
     STEP LABELS
  ============================================================ */
  const steps = [
    { num: 1, label: "Event Type" },
    { num: 2, label: "Name" },
    { num: 3, label: "Amount" },
    { num: 4, label: "Payment" },
    { num: 5, label: "Date Rules" },
  ];

  const pagedSevaList = sevaList.slice(
    (sevaPage - 1) * SEVA_PER_PAGE,
    sevaPage * SEVA_PER_PAGE
  );

  /* ============================================================
     UI
  ============================================================ */
  return (
    <div className="db-dashboard">
      <Sidebar />

      <div className="db-main">
        <Header title="सेवा जोडा / Add Seva" />

        {/* ── EDIT MODE BANNER ── */}
        {editingId && (
          <div style={{
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: "10px",
            padding: "12px 16px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div>
                <p style={{ fontWeight: 700, color: "#c2410c", margin: 0 }}>Edit Mode</p>
                <p style={{ fontSize: "12px", color: "#9a3412", margin: 0 }}>
                  You are editing an existing seva. Click "Update Seva" to save changes.
                </p>
              </div>
            </div>
            <button
              onClick={resetForm}
              style={{
                background: "#fff",
                border: "1px solid #fed7aa",
                borderRadius: "8px",
                padding: "6px 14px",
                color: "#c2410c",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "13px",
                whiteSpace: "nowrap",
              }}
            >
              Cancel Edit
            </button>
          </div>
        )}

        {/* ── PROGRESS BAR ── */}
        <div className="as-progress">
          {steps.map((s) => (
            <div key={s.num} className={`as-step ${step === s.num ? "as-step--active" : ""} ${step > s.num ? "as-step--done" : ""}`}>
              <div className="as-step-circle">{step > s.num ? "✓" : s.num}</div>
              <span className="as-step-label">{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── FORM CARD ── */}
        <div className="as-card">

          {/* ══ STEP 1: EVENT TYPE ══ */}
          {step === 1 && (
            <div className="as-step-body">
              <h3 className="as-step-title">Step 1 — कार्यक्रम प्रकार / Event Type</h3>
              <p className="as-step-desc">Is this a special festival event or a regular daily seva?</p>
              <div className="as-type-grid">
                <button type="button" className={`as-type-btn ${eventType === "special" ? "as-type-btn--active" : ""}`} onClick={() => setEventType("special")}>
                  <span className="as-type-title">Special Events</span>
                  <span className="as-type-sub">विशेष कार्यक्रम</span>
                  <span className="as-type-hint">Festival-based, specific dates (e.g. Ram Navami Bhandara)</span>
                </button>
                <button type="button" className={`as-type-btn ${eventType === "regular" ? "as-type-btn--active" : ""}`} onClick={() => setEventType("regular")}>
                  <span className="as-type-title">Regular Events</span>
                  <span className="as-type-sub">नियमित कार्यक्रम</span>
                  <span className="as-type-hint">Daily/weekly sevas (e.g. Abhishek, Donation, Vidaprasad)</span>
                </button>
              </div>
            </div>
          )}

          {/* ══ STEP 2: NAME ══ */}
          {step === 2 && (
            <div className="as-step-body">
              <h3 className="as-step-title">Step 2 — सेवेचे नाव / Seva Name</h3>
              <p className="as-step-desc">
                {eventType === "special" ? "Enter the name of this special event / festival" : "Enter the name of this regular seva purpose"}
              </p>
              <div className="as-field">
                <label className="as-label">
                  {eventType === "special" ? "उत्सव नाव / Event Name" : "उद्देश नाव / Purpose Name"} *
                </label>
                <input
                  className="input"
                  placeholder={eventType === "special" ? "e.g. Ram Navami Utsav" : "e.g. Abhishek, Donation, Vidaprasad"}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              {displayName.trim() && (
                <div className="as-preview-key">
                  <span className="as-preview-key__label">Saved as:</span>
                  <code className="as-preview-key__value">
                    {eventType === "special" ? `special_${displayName.trim()}` : `regular_${displayName.trim()}`}
                  </code>
                  <span className="as-preview-key__hint">(prevents collision if both types have same name)</span>
                </div>
              )}
            </div>
          )}

          {/* ══ STEP 3: AMOUNT ══ */}
          {step === 3 && (
            <div className="as-step-body">
              <h3 className="as-step-title">Step 3 — रक्कम / Amount</h3>
              <p className="as-step-desc">Is the amount fixed by admin or entered by the user at booking time?</p>
              <div className="as-type-grid">
                <button type="button" className={`as-type-btn ${amountType === "fixed" ? "as-type-btn--active" : ""}`} onClick={() => setAmountType("fixed")}>
                  <span className="as-type-title">Fixed Amount</span>
                  <span className="as-type-sub">निश्चित रक्कम</span>
                  <span className="as-type-hint">e.g. Vidaprasad ₹251, Full Bhandara ₹1,00,000</span>
                </button>
                <button type="button" className={`as-type-btn ${amountType === "flexible" ? "as-type-btn--active" : ""}`} onClick={() => { setAmountType("flexible"); setFixedAmount(""); }}>
                  <span className="as-type-title">Flexible Amount</span>
                  <span className="as-type-sub">लवचिक रक्कम</span>
                  <span className="as-type-hint">User enters amount at booking (e.g. Donation)</span>
                </button>
              </div>
              {amountType === "fixed" && (
                <div className="as-field" style={{ marginTop: "16px" }}>
                  <label className="as-label">निश्चित रक्कम (₹) / Fixed Amount *</label>
                  <input type="number" className="input" placeholder="Enter amount e.g. 251" min="1" value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} onWheel={(e) => e.target.blur()} />
                </div>
              )}
            </div>
          )}

          {/* ══ STEP 4: PAYMENT OPTIONS ══ */}
          {step === 4 && (
            <div className="as-step-body">
              <h3 className="as-step-title">Step 4 — पेमेंट पर्याय / Payment Options</h3>
              {amountType === "flexible" ? (
                <div className="as-info-box">
                  Since this seva has a flexible amount, only Full Payment applies — users pay the full amount they enter.
                </div>
              ) : (
                <>
                  <p className="as-step-desc">Can users pay in advance (partial) or must they pay the full amount?</p>
                  <div className="as-type-grid">
                    <button type="button" className={`as-type-btn ${paymentOptions === "full" ? "as-type-btn--active" : ""}`} onClick={() => setPaymentOptions("full")}>
                      <span className="as-type-title">Full Payment Only</span>
                      <span className="as-type-sub">फक्त पूर्ण पेमेंट</span>
                      <span className="as-type-hint">e.g. Shiraprasad, Vidaprasad — must pay full at booking</span>
                    </button>
                    <button type="button" className={`as-type-btn ${paymentOptions === "full_advance" ? "as-type-btn--active" : ""}`} onClick={() => setPaymentOptions("full_advance")}>
                      <span className="as-type-title">Full + Advance</span>
                      <span className="as-type-sub">पूर्ण + आगाऊ</span>
                      <span className="as-type-hint">e.g. Full/Half Bhandara — users can pay partial advance now</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ STEP 5: DATE RULES ══ */}
          {step === 5 && (
            <div className="as-step-body">
              <h3 className="as-step-title">Step 5 — तारीख नियम / Date Rules</h3>
              <p className="as-step-desc">Which dates can users select for this seva?</p>
              <div className="as-date-rule-list">
                {(eventType === "special" ? DATE_RULES.filter((r) => r.key === "specific") : DATE_RULES).map((rule) => (
                  <button key={rule.key} type="button" className={`as-date-rule-btn ${dateRule === rule.key ? "as-date-rule-btn--active" : ""}`} onClick={() => { setDateRule(rule.key); setSpecificDates([]); }}>
                    <div>
                      <p className="as-date-rule-title">{rule.label}</p>
                      <p className="as-date-rule-mr">{rule.mr}</p>
                    </div>
                  </button>
                ))}
              </div>

              {dateRule === "specific" && (
                <div style={{ marginTop: "16px" }}>
                  <label className="as-label">Select Available Dates (click to toggle)</label>
                  <DatePicker onChange={handleSpecificDateToggle} highlightDates={[{ "react-datepicker__day--highlighted": specificDates }]} minDate={new Date()} inline calendarClassName="utsav-calendar" />
                  {specificDates.length > 0 && (
                    <div className="as-date-tags">
                      {specificDates.slice().sort((a, b) => a - b).map((date, i) => (
                        <span key={i} className="as-date-tag">
                          {toDisplayDate(date)}
                          <button onClick={() => handleSpecificDateToggle(date)}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {eventType === "special" && dateRule && (
                <div className="as-toggle-row" style={{ marginTop: "16px" }}>
                  <div>
                    <p className="as-toggle-title"> Block on Special Event Dates</p>
                    <p className="as-toggle-desc">If ON, users cannot book this seva on dates reserved for special events</p>
                  </div>
                  <label className="as-switch">
                    <input type="checkbox" checked={blockOnSpecialDates} onChange={(e) => setBlockOnSpecialDates(e.target.checked)} />
                    <span className="as-switch-slider" />
                  </label>
                </div>
              )}

              {/* ── Allow Multiple Date Selection ── */}
              <div className="as-toggle-row" style={{ marginTop: "16px" }}>
                <div>
                  <p className="as-toggle-title">अनेक तारखा निवड / Allow Multiple Date Selection</p>
                  <p className="as-toggle-desc">If ON, users can select multiple dates when booking this seva</p>
                </div>
                <label className="as-switch">
                  <input type="checkbox" checked={allowMultiDate} onChange={(e) => setAllowMultiDate(e.target.checked)} />
                  <span className="as-switch-slider" />
                </label>
              </div>

              {/* ── Require Gotra ── */}
              <div className="as-toggle-row" style={{ marginTop: "12px" }}>
                <div>
                  <p className="as-toggle-title"> गोत्र आवश्यक / Require Gotra</p>
                  <p className="as-toggle-desc">If ON, users must select their Gotra when booking this seva</p>
                </div>
                <label className="as-switch">
                  <input type="checkbox" checked={hasGotra} onChange={(e) => setHasGotra(e.target.checked)} />
                  <span className="as-switch-slider" />
                </label>
              </div>

              {dateRule && (
                <div className="as-field" style={{ marginTop: "16px" }}>
                  <label className="as-label">
                    प्रति तारीख कमाल बुकिंग / Max Bookings per Date
                    <span className="as-label-hint"> (0 = unlimited)</span>
                  </label>
                  <input type="number" className="input" placeholder="e.g. 1 for Full Bhandara, 0 for unlimited" min="0" value={maxPerDate} onChange={(e) => setMaxPerDate(e.target.value)} onWheel={(e) => e.target.blur()} />
                </div>
              )}
            </div>
          )}

          {/* ── NAV BUTTONS ── */}
          <div className="as-nav">
            {step > 1 && (
              <button type="button" className="secondary-btn" onClick={() => setStep(step - 1)}>
                ← Back
              </button>
            )}
            {step < 5 ? (
              <button type="button" className="primary-btn" disabled={!canProceed()} onClick={() => setStep(step + 1)}>
                Next →
              </button>
            ) : (
              <button type="button" className="primary-btn" disabled={!canProceed() || saving} onClick={handleSave}>
                {saving
                  ? (editingId ? "Updating..." : "Saving...")
                  : editingId ? "Update Seva" : "Save Seva"
                }
              </button>
            )}
          </div>
        </div>

        {/* ── EXISTING SEVA LIST ── */}
        <div className="as-card" style={{ marginTop: "20px" }}>
          <h3 className="as-list-title">विद्यमान सेवा / Existing Sevas</h3>

          {sevaLoading ? (
            <p style={{ color: "#999", padding: "12px 0" }}>Loading...</p>
          ) : sevaList.length === 0 ? (
            <p style={{ color: "#999", padding: "12px 0" }}>No sevas added yet.</p>
          ) : (
            <>
              <div className="as-seva-list">
                {pagedSevaList.map((seva) => {
                  const id = seva._id || seva.id;
                  const isBeingEdited = editingId === id;
                  return (
                    <div
                      key={id}
                      className="as-seva-item"
                      style={{
                        background: isBeingEdited ? "#fff7ed" : undefined,
                        border: isBeingEdited ? "1px solid #fed7aa" : undefined,
                        borderRadius: isBeingEdited ? "10px" : undefined,
                      }}
                    >
                      <div className="as-seva-info">
                        <div className="as-seva-badge">
                          {seva.eventType === "special" ? "Special" : "Regular"}
                          {isBeingEdited && (
                            <span style={{ marginLeft: "6px", color: "#c2410c", fontSize: "11px", fontWeight: 700 }}>
                              Editing
                            </span>
                          )}
                        </div>
                        <p className="as-seva-name">{seva.displayName}</p>
                        <div className="as-seva-meta">
                          <span>{seva.amountType === "fixed" ? `₹${Number(seva.amount || 0).toLocaleString("en-IN")} fixed` : "Flexible amount"}</span>
                          <span>·</span>
                          <span>{DATE_RULES.find((r) => r.key === seva.dateRule)?.label || seva.dateRule}</span>
                          {seva.maxPerDate > 0 && <><span>·</span><span>Max {seva.maxPerDate}/date</span></>}
                          <span>·</span>
                          <span style={{ color: seva.isActive === false ? "#dc2626" : "#16a34a", fontWeight: 700 }}>
                            {seva.isActive === false ? "Inactive" : "Active"}
                          </span>
                          {seva.blockOnSpecialDates && <><span>·</span><span style={{ color: "#f97316", fontWeight: 600 }}>Blocked on special dates</span></>}
                        </div>
                      </div>

                      {/* ── ACTION BUTTONS ── */}
                      <div style={{ display: "flex", gap: "8px", flexShrink: 0, marginLeft: "12px" }}>

                        {/* ✏️ EDIT BUTTON — new */}
                        <button
                          style={{
                            background: isBeingEdited ? "#fff7ed" : "#f0f9ff",
                            color: isBeingEdited ? "#c2410c" : "#0369a1",
                            border: `1px solid ${isBeingEdited ? "#fed7aa" : "#bae6fd"}`,
                            borderRadius: "8px",
                            padding: "6px 12px",
                            fontSize: "12px",
                            fontWeight: "600",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                          onClick={() => isBeingEdited ? resetForm() : handleEdit(seva)}
                        >
                          {isBeingEdited ? "Cancel" : "Edit"}
                        </button>

                        {/* Activate / Deactivate */}
                        <button
                          style={{
                            background: seva.isActive === false ? "#f0fdf4" : "#fff7ed",
                            color: seva.isActive === false ? "#16a34a" : "#f97316",
                            border: `1px solid ${seva.isActive === false ? "#bbf7d0" : "#fed7aa"}`,
                            borderRadius: "8px",
                            padding: "6px 12px",
                            fontSize: "12px",
                            fontWeight: "600",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                          onClick={() => handleToggleActive(id, seva.isActive)}
                        >
                          {seva.isActive === false ? "Activate" : "Deactivate"}
                        </button>

                        {/* Delete */}
                        <button className="as-seva-delete" onClick={() => handleDelete(id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Pagination
                currentPage={sevaPage}
                totalItems={sevaList.length}
                itemsPerPage={SEVA_PER_PAGE}
                onPageChange={setSevaPage}
              />
            </>
          )}
        </div>

        {toast && <div className="toast">{toast}</div>}
        {sevaError && (
          <div style={{ position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)", background: "#fee2e2", border: "1px solid #ef4444", borderRadius: "8px", color: "#dc2626", padding: "10px 18px", fontSize: "13px", zIndex: 1000, display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
            {sevaError}
            <button onClick={() => setSevaError("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: "16px", lineHeight: 1 }}>x</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default withAuth(AddSeva, ["Admin"]);