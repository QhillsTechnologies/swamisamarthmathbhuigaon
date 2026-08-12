import { useState } from "react";
import { useRouter } from "next/router";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import DevoteeForm from "../components/DevoteeForm";
import PurposeDropdown from "../components/PurposeDropdown";
import apiRequest from "../services/api";

export default function InternalReceipt() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPayment, setShowPayment] = useState(false);

  const ADVANCE_ALLOWED_PURPOSES = ["full bhandara", "half bhandara", "shiraprasad"];

  const normalizePurpose = (purpose = "") =>
    String(purpose).split("/")[0].trim().toLowerCase();

  const validateName = (name) => /^[A-Za-z\s]+$/.test(name.trim());
  const validatePhone = (phone) => {
    const c = phone.trim();
    return /^[6-9]\d{9}$/.test(c) && !/^(\d)\1{9}$/.test(c);
  };
  const validateEmail = (email) => {
    if (!email?.trim()) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
  };

  const showErr = (msg) => { setErrorMsg(msg); };

  const handleCreateBooking = async () => {
    setErrorMsg("");
    const savedForm = JSON.parse(localStorage.getItem("bookingForm") || "{}");

    // 1. Name & phone
    if (!savedForm.name?.trim())         { showErr("Please enter devotee name"); return; }
    if (!validateName(savedForm.name))   { showErr("Name should contain only letters and spaces."); return; }
    const phoneStr = String(savedForm.phone ?? "");
    if (!phoneStr.trim())                { showErr("Please enter phone number"); return; }
    if (!validatePhone(phoneStr))        { showErr("Enter a valid 10-digit mobile number."); return; }
    if (savedForm.email?.trim() && !validateEmail(savedForm.email)) { showErr("Please enter a valid email address."); return; }

    // 2. Event type
    if (!savedForm.eventType) { showErr("Please select event type (Special or Regular)"); return; }

    // 3. Purpose / event
    if (!savedForm.purpose?.trim()) { showErr("Please select purpose / event"); return; }

    // 4. Amount — always required, must be greater than 0
    if (!Number(savedForm.amount) || Number(savedForm.amount) <= 0) { showErr("Please enter amount"); return; }

    // 5. Date
    const noCalendarPurposes = [
      "Two Wheeler / दुचाकी (₹251)",
      "Three Wheeler / तीनचाकी (₹351)",
      "Four Wheeler / चारचाकी (₹551)",
      "गाडीपुजा (टे पो, बस इयादी.)",
    ];
    const isMultiDate = Array.isArray(savedForm.multiDates) && savedForm.multiDates.length > 0;
    if (isMultiDate) {
      if (!savedForm.pricePerDate || Number(savedForm.pricePerDate) <= 0) { showErr("Please enter price per date"); return; }
    } else if (!noCalendarPurposes.includes(savedForm.purpose)) {
      if (!savedForm.bookingDate) { showErr("Please select booking date"); return; }
      const [by, bm, bdNum] = savedForm.bookingDate.split("-").map(Number);
      const bd = new Date(by, bm - 1, bdNum);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (bd < today) { showErr("Past dates are not allowed."); return; }
    }

    const amount = Number(savedForm.amount || 0);
    let advance = Number(savedForm.advance || 0);
    let remainingAmount = Number(savedForm.remainingAmount || 0);

    const normalizedPurpose = normalizePurpose(savedForm.purpose);
    const isAdvanceAllowed = savedForm.paymentOptions === "full_advance" || ADVANCE_ALLOWED_PURPOSES.includes(normalizedPurpose);

    let status = "Approved";
    if (isAdvanceAllowed) {
      status = remainingAmount > 0 ? "Pending" : "Approved";
    } else {
      advance = amount; remainingAmount = 0; status = "Approved";
    }

    const paymentType = savedForm.paymentType || (remainingAmount > 0 ? "Advance Payment" : "Full Payment");

    try {
      setLoading(true);
      const response = await apiRequest("/create_booking", {
        method: "POST",
        body: JSON.stringify({
          customerId: savedForm.customerId || "",
          bookingGroupId: savedForm.bookingGroupId || "",
          parentBookingId: savedForm.parentBookingId || "",
          smarnarth: savedForm.smarnarth?.trim() || "",
          name: savedForm.name?.trim() || "",
          phone: phoneStr.trim(),
          email: savedForm.email?.trim() || "",
          address: savedForm.address?.trim() || "",
          purpose: savedForm.purpose || "",
          bookingDate: savedForm.bookingDate,
          multiDates: savedForm.multiDates || [],
          pricePerDate: savedForm.pricePerDate || "",
          gotra: savedForm.gotra || "",
          amount, advance, paidAmount: advance, remainingAmount,
          paymentType, status,
          receiptType: "Internal",
          bank: "Cash",
          reason: savedForm.reason || "",
          sendSms: !!savedForm.sendSms,
        }),
      });

      const receiptId = response?.booking?.bookingId || response?.booking?.receiptId || response?.bookingId || "BOOKING";
      localStorage.setItem("lastBooking", JSON.stringify({ ...(response?.booking || {}), bookingId: receiptId, sendSms: !!savedForm.sendSms }));
      localStorage.removeItem("bookingForm");
      router.push(`/booking-success?id=${encodeURIComponent(receiptId)}`);
    } catch (err) {
      console.error("Create booking error:", err);
      showErr(err.message || "Failed to create booking");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="db-dashboard">
      <Sidebar />

      <div className="db-main ir-internal-page">
        <Header title="अंतर्गत पावती / Internal Receipt" />

        {/* STEP INDICATOR */}
        <div className="ir-step-bar">
          <div className="ir-step ir-step-done">
            <div className="ir-step-num">✓</div>
            <span>Receipt Type</span>
          </div>
          <div className="ir-step-line" />
          <div className="ir-step ir-step-active">
            <div className="ir-step-num">2</div>
            <span>Booking Details</span>
          </div>
        </div>
        
        {/* CASH PAYMENT INDICATOR */}
        <div className="tr-card">
          <div className="tr-card-header">
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
              <div>
                <p className="tr-card-title">पेमेंट पद्धत / Payment Method</p>
                <p className="tr-card-subtitle">Internal receipts accept cash only</p>
              </div>

              <button
                className="secondary-btn"
                onClick={() => router.push("/new-booking")}
                disabled={loading}
                style={{ marginLeft: "auto" }}
              >
                ← मागे / Back
              </button>
            </div>
          </div>
          <div className="tr-card-body">
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              background: "#f0fdf4", border: "1.5px solid #86efac",
              borderRadius: "10px", padding: "10px 18px",
              fontSize: "14px", fontWeight: 700, color: "#15803d",
            }}>
              <span style={{ fontSize: "20px" }}></span>
              रोख / Cash
            </div>
          </div>
        </div>

        {/* DEVOTEE DETAILS CARD */}
        <div className="ir-card">
          <div className="ir-card-header">
            <div>
              <p className="ir-card-title">भक्त तपशील / Devotee Details</p>
              <p className="ir-card-subtitle">Enter the devotee's personal information</p>
            </div>
          </div>
          <div className="ir-card-body">
            <DevoteeForm />
          </div>
        </div>

        {/* PURPOSE & BOOKING DETAILS CARD */}
        <div className="ir-card">
          <div className="ir-card-header">
            <div>
              <p className="ir-card-title">उद्देश आणि तारीख / Purpose & Date</p>
              <p className="ir-card-subtitle">Select purpose, payment type and booking date</p>
            </div>
          </div>
          <div className="ir-card-body">
            <PurposeDropdown />
          </div>
        </div>

        {errorMsg && (
          <div style={{
            background: "#fee2e2", border: "1px solid #ef4444", borderRadius: "6px",
            color: "#dc2626", padding: "6px 10px", marginBottom: "8px",
            fontSize: "13px", display: "flex", alignItems: "center", gap: "6px",
          }}>
            <span style={{ flex: 1 }}>{errorMsg}</span>
            <button onClick={() => setErrorMsg("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: "14px", lineHeight: 1 }}>x</button>
          </div>
        )}

        {/* ACTION BUTTONS */}
        <div className="ir-internal-actions">
          <button
            className="secondary-btn"
            onClick={() => router.push("/new-booking")}
            disabled={loading}
          >
            ← मागे / Back
          </button>
          <button
            className="primary-btn"
            onClick={handleCreateBooking}
            disabled={loading}
          >
            {loading ? "Creating..." : "बुकिंग करा / Create Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
