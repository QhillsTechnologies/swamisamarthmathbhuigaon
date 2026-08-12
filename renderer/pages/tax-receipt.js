import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import QRCode from "qrcode";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import DevoteeForm from "../components/DevoteeForm";
import PurposeDropdown from "../components/PurposeDropdown";
import apiRequest from "../services/api";

const ORDER_POLL_INTERVAL_MS = 3000;
const ORDER_POLL_TIMEOUT_MS = 5 * 60 * 1000;

/* Bank options — no Cash */
const ALL_BANKS = [
  { id: "ICICI Bank", label: "ICICI" },
  { id: "BCCB Bank",  label: "BCCB" },
  { id: "SBI Bank",   label: "SBI" },
  { id: "Cash",       label: "Cash",   isCash: true },
  { id: "Card",       label: "Card",   isCard: true },
  { id: "Cheque",     label: "Cheque", isCheque: true },
];

export default function TaxReceipt() {
  const router = useRouter();

  const [is80G, setIs80G] = useState(false);
  const [selectedBank, setSelectedBank] = useState("");
  const [panCard, setPanCard] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Online payment (ICICI / SBI / BCCB via Cashfree) — QR shown on a
  // customer-facing display device, paid from the customer's own phone.
  const [showPayment, setShowPayment] = useState(false);
  const [pendingBookingId, setPendingBookingId] = useState("");
  const pendingBookingPayloadRef = useRef(null);
  const pollTimerRef = useRef(null);
  const pollStartRef = useRef(0);
  const [displayUrl, setDisplayUrl] = useState("");
  const [displayUrlQr, setDisplayUrlQr] = useState("");

  // Cheque fields
  const [payingBankName, setPayingBankName] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState("");

  const visibleBanks = is80G

    ? ALL_BANKS
    : ALL_BANKS.filter((b) => b.id !== "SBI Bank");

  const isChequeSelected = selectedBank === "Cheque";

  // Cheque derived values
  const chequeNo = chequeNumber || "";
  const showCheque = isChequeSelected && chequeNo;

  const ADVANCE_ALLOWED_PURPOSES = ["full bhandara", "half bhandara", "shiraprasad"];

  const normalizePurpose = (p = "") => String(p).split("/")[0].trim().toLowerCase();

  const validateName  = (n) => /^[A-Za-z\s]+$/.test(n.trim());
  const validatePhone = (p) => { const c = p.trim(); return /^[6-9]\d{9}$/.test(c) && !/^(\d)\1{9}$/.test(c); };
  const validateEmail = (e) => { if (!e?.trim()) return true; return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()); };
  const validatePan   = (p) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p.trim().toUpperCase());

  const stopPaymentWait = () => {
    clearTimeout(pollTimerRef.current);
    setShowPayment(false);
    window.ipc?.send?.("display-reset");
  };

  const finalizePaymentSuccess = () => {
    clearTimeout(pollTimerRef.current);
    const bookingPayload = pendingBookingPayloadRef.current || {};
    localStorage.setItem("lastBooking", JSON.stringify({
      ...bookingPayload,
      bookingId: pendingBookingId,
      bank: "UPI",
    }));
    localStorage.removeItem("bookingForm");
    window.ipc?.send?.("display-payment-success", { amount: bookingPayload.advance });
    setShowPayment(false);
    router.push(`/booking-success?id=${encodeURIComponent(pendingBookingId)}`);
  };

  // Poll the booking's payment status while the QR is on the customer
  // display — the payment itself completes on the customer's own phone, so
  // there's no local callback to hook into.
  useEffect(() => {
    if (!showPayment || !pendingBookingId) return;

    pollStartRef.current = Date.now();
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      const elapsedMs = Date.now() - pollStartRef.current;
      try {
        const res = await apiRequest(`/payment_status?orderId=${encodeURIComponent(pendingBookingId)}&bank=${encodeURIComponent(selectedBank)}`);
        const status = res?.status;
        console.log(`[payment-poll] orderId=${pendingBookingId} elapsedMs=${elapsedMs} status=${status}`);

        if (status === "PAID") {
          console.log(`[payment-poll] PAID after elapsedMs=${elapsedMs} (${(elapsedMs / 1000).toFixed(1)}s) orderId=${pendingBookingId}`);
          finalizePaymentSuccess();
          return;
        }
        if (status === "EXPIRED" || status === "TERMINATED" || status === "CANCELLED") {
          console.log(`[payment-poll] ${status} after elapsedMs=${elapsedMs} orderId=${pendingBookingId}`);
          setErrorMsg("Payment was not completed (expired or cancelled). Please try again.");
          stopPaymentWait();
          return;
        }
      } catch (err) {
        console.error(`[payment-poll] network error elapsedMs=${elapsedMs} orderId=${pendingBookingId}`, err);
      }

      if (Date.now() - pollStartRef.current > ORDER_POLL_TIMEOUT_MS) {
        console.log(`[payment-poll] TIMEOUT after elapsedMs=${elapsedMs} orderId=${pendingBookingId}`);
        setErrorMsg("Payment timed out. Please try again.");
        stopPaymentWait();
        return;
      }
      pollTimerRef.current = setTimeout(poll, ORDER_POLL_INTERVAL_MS);
    };

    poll();
    return () => { cancelled = true; clearTimeout(pollTimerRef.current); };
  }, [showPayment, pendingBookingId]);

  // Fetch the customer display's tunnel URL, so the cashier can point that
  // device's browser at it. This is a quick-tunnel URL, so it's a new random
  // link every time the app restarts — the QR lets staff just re-scan it on
  // the display device each morning instead of re-typing it.
  useEffect(() => {
    window.ipc?.invoke?.("get-display-url").then((url) => setDisplayUrl(url || "")).catch(() => {});
  }, []);

  useEffect(() => {
    if (!displayUrl) { setDisplayUrlQr(""); return; }
    console.log("displayUrl",displayUrl)
    QRCode.toDataURL(displayUrl, { width: 160, margin: 1 }).then(setDisplayUrlQr).catch(() => {});
  }, [displayUrl]);

  const showErr = (msg) => { setErrorMsg(msg); };

  const handleCreateBooking = async () => {
    setErrorMsg("");
    const savedForm = JSON.parse(localStorage.getItem("bookingForm") || "{}");

    // 1. Payment method
    if (!selectedBank) { showErr("Please select a payment method"); return; }
    if (isChequeSelected) {
      if (!payingBankName.trim()) { showErr("Please enter paying bank name"); return; }
      if (!chequeNumber.trim())   { showErr("Please enter cheque number"); return; }
      if (!chequeDate)            { showErr("Please enter cheque date"); return; }
    }
    if (is80G) {
      if (!panCard.trim())       { showErr("Please enter PAN card number for 80G"); return; }
      if (!validatePan(panCard)) { showErr("Please enter a valid PAN card (e.g. ABCDE1234F)"); return; }
    }

    // 2. Name & phone
    if (!savedForm.name?.trim())         { showErr("Please enter devotee name"); return; }
    if (!validateName(savedForm.name))   { showErr("Name should contain only letters and spaces."); return; }
    if (!savedForm.phone?.trim())        { showErr("Please enter phone number"); return; }
    if (!validatePhone(savedForm.phone)) { showErr("Enter a valid 10-digit mobile number."); return; }
    if (savedForm.email?.trim() && !validateEmail(savedForm.email)) { showErr("Please enter a valid email address."); return; }

    // 3. Event type
    if (!savedForm.eventType) { showErr("Please select event type (Special or Regular)"); return; }

    // 4. Purpose / event
    if (!savedForm.purpose?.trim()) { showErr("Please select purpose / event"); return; }

    // 5. Amount — always required, must be greater than 0
    if (!Number(savedForm.amount) || Number(savedForm.amount) <= 0) { showErr("Please enter amount"); return; }

    // 6. Date
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

    const bookingPayload = {
      customerId: savedForm.customerId || "",
      bookingGroupId: savedForm.bookingGroupId || "",
      parentBookingId: savedForm.parentBookingId || "",
      smarnarth: savedForm.smarnarth?.trim() || "",
      name: savedForm.name?.trim() || "",
      phone: savedForm.phone?.trim() || "",
      email: savedForm.email?.trim() || "",
      address: savedForm.address?.trim() || "",
      purpose: savedForm.purpose || "",
      bookingDate: savedForm.bookingDate,
      multiDates: savedForm.multiDates || [],
      pricePerDate: savedForm.pricePerDate || "",
      gotra: savedForm.gotra || "",
      amount, advance, paidAmount: advance, remainingAmount,
      paymentType,
      receiptType: "Tax",
      bank: selectedBank,
      is80G,
      panCard: is80G ? panCard.trim().toUpperCase() : "",
      payingBankName: isChequeSelected ? payingBankName.trim() : "",
      chequeNumber:   isChequeSelected ? chequeNumber.trim() : "",
      chequeDate:     isChequeSelected ? chequeDate : "",
      upiId:          savedForm.upiId || "",
      reason: savedForm.reason || "",
      sendSms: !!savedForm.sendSms,
    };

    const isOnlineBank = selectedBank === "ICICI Bank" || selectedBank === "SBI Bank" || selectedBank === "BCCB Bank";

    try {
      setLoading(true);

      if (isOnlineBank) {
        // Step 1: Save to dedicated pending DB (separate from booking DB)
        const pendingRes = await apiRequest("/create_pending_booking", {
          method: "POST",
          body: JSON.stringify(bookingPayload),
        });
        const orderId = pendingRes?.orderId || "";
        if (!orderId) { showErr("Failed to create pending booking. Please try again."); return; }

        // Step 2: Create Cashfree payment order using orderId as reference
        // Use advance amount (what user is paying now), not the total seva amount
        const orderRes = await apiRequest("/create_payment_order", {
          method: "POST",
          body: JSON.stringify({
            bank: selectedBank,
            amount: advance,
            orderId,
            customerName: savedForm.name?.trim(),
            customerPhone: savedForm.phone?.trim(),
            customerEmail: savedForm.email?.trim() || "devotee@ssmvd.org",
          }),
        });

        if (!orderRes?.link_url) {
          showErr("Could not initiate payment. Please try again.");
          return;
        }

        // Step 3: Turn the Cashfree Payment Link into a QR code and push it
        // to the customer-facing display device. Unlike the SDK checkout
        // session, a Payment Link works from any device/browser — the
        // customer scans it with their own phone and pays there.
        const qrDataUrl = await QRCode.toDataURL(orderRes.link_url, { width: 400, margin: 1 });

        pendingBookingPayloadRef.current = bookingPayload;
        setPendingBookingId(orderId);
        window.ipc?.send?.("display-show-qr", { qrDataUrl, amount: advance, orderId });
        setShowPayment(true);
      } else {
        // Cash / Cheque — direct booking
        const response = await apiRequest("/create_booking", {
          method: "POST",
          body: JSON.stringify({ ...bookingPayload, status }),
        });
        const receiptId = response?.booking?.bookingId || response?.booking?.receiptId || response?.bookingId || "BOOKING";
        localStorage.setItem("lastBooking", JSON.stringify({ ...(response?.booking || {}), bookingId: receiptId, sendSms: bookingPayload.sendSms }));
        localStorage.removeItem("bookingForm");
        router.push(`/booking-success?id=${encodeURIComponent(receiptId)}`);
      }
    } catch (err) {
      console.error("Tax booking error:", err);
      showErr(err.message || "Failed to create booking");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="db-dashboard">
      <Sidebar />

      <div className="db-main ir-internal-page">
        <Header title="आयकर पावती / Income Tax Receipt" />

        {/* STEP INDICATOR */}
        <div className="tr-step-bar">
          <div className="tr-step tr-step-done">
            <div className="tr-step-num">✓</div>
            <span>Receipt Type</span>
          </div>
          <div className="tr-step-line" />
          <div className="tr-step tr-step-active">
            <div className="tr-step-num">2</div>
            <span>Booking Details</span>
          </div>
        </div>
        
        {/* PAYMENT DETAILS CARD */}
        <div className="tr-card">
          <div className="tr-card-header">
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
              <div>
                <p className="tr-card-title">पेमेंट तपशील / Payment Details</p>
                <p className="tr-card-subtitle">Select payment method and tax exemption</p>
              </div>

              <button
                className="secondary-btn"
                onClick={() => router.push("/new-booking")}
                disabled={loading || showPayment}
                style={{ marginLeft: "auto" }}
              >
                ← मागे / Back
              </button>
            </div>
          </div>
          <div className="tr-card-body">

            {/* 80G TOGGLE */}
            <label className="tr-toggle-row">
              <div className="tr-toggle-info">
                <span className="tr-toggle-title">80G Tax Exemption Applicable</span>
                <span className="tr-toggle-desc">Enable for income tax deduction certificate</span>
              </div>
              <div className="tr-toggle">
                <input
                  type="checkbox"
                  checked={is80G}
                  onChange={() => {
                    const next = !is80G;
                    setIs80G(next);
                    if (!next && selectedBank === "SBI Bank") setSelectedBank("");
                    if (!next) setPanCard("");
                  }}
                />
                <span className="tr-toggle-slider" />
              </div>
            </label>

            {/* PAYMENT METHOD PILLS — Cash, Card, Cheque added */}
            <div className="tr-field">
              <label className="tr-bank-label">पेमेंट पद्धत / Payment Method</label>
              <div className="tr-bank-options">
                {visibleBanks.map((bank) => (
                  <button
                    key={bank.id}
                    type="button"
                    className={`tr-bank-pill${bank.isCheque ? " tr-cheque-pill" : ""}${selectedBank === bank.id ? " tr-bank-active" : ""}`}
                    onClick={() => {
                      setSelectedBank(bank.id);
                      // Clear cheque fields if switching away from cheque
                      if (!bank.isCheque) {
                        setPayingBankName("");
                        setChequeNumber("");
                        setChequeDate("");
                      }
                    }}
                  >
                    {bank.label}
                  </button>
                ))}
              </div>
              {["ICICI Bank", "BCCB Bank", "SBI Bank"].includes(selectedBank) && displayUrl && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
                  {displayUrlQr && (
                    <img
                      src={displayUrlQr}
                      alt="Scan to open customer display"
                      style={{ width: "72px", height: "72px", background: "#fff", padding: "4px", borderRadius: "4px" }}
                    />
                  )}
                  <p style={{ fontSize: "11px", color: "#888" }}>
                    Customer display device should be pointed at: <strong>{displayUrl}</strong>
                    <br />
                    Changes on every app restart — re-scan this each time it does.
                  </p>
                </div>
              )}
            </div>

            {/* CHEQUE FIELDS — only when Cheque selected */}
            {isChequeSelected && (
              <div className="tr-cheque-box">
                <p className="tr-cheque-title">चेक तपशील / Cheque Details</p>

                <div className="tr-cheque-field">
                  <label className="tr-bank-label">बँकेचे नाव / Paying Bank Name *</label>
                  <input
                    className="tr-cheque-input"
                    placeholder="e.g. State Bank of India"
                    value={payingBankName}
                    onChange={(e) => setPayingBankName(e.target.value)}
                  />
                </div>

                <div className="tr-cheque-field">
                  <label className="tr-bank-label">चेक नंबर / Cheque Number *</label>
                  <input
                    className="tr-cheque-input"
                    placeholder="e.g. 123456"
                    value={chequeNumber}
                    onChange={(e) =>
                      setChequeNumber(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    maxLength={6}
                  />
                </div>

                <div className="tr-cheque-field">
                  <label className="tr-bank-label">चेक तारीख / Cheque Date *</label>
                  <input
                    type="date"
                    className="tr-cheque-input"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* PAN CARD — only when 80G enabled */}
            {is80G && (
              <div className="tr-pan-box">
                <label className="tr-pan-label">🪪 पॅन कार्ड नंबर / PAN Card Number *</label>
                <input
                  className="tr-pan-input"
                  placeholder="e.g. ABCDE1234F"
                  value={panCard}
                  maxLength={10}
                  onChange={(e) =>
                    setPanCard(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                  }
                />
              </div>
            )}

          </div>
        </div>

        {/* DEVOTEE DETAILS CARD */}
        <div className="tr-card">
          <div className="tr-card-header">
            <div>
              <p className="tr-card-title">भक्त तपशील / Devotee Details</p>
              <p className="tr-card-subtitle">Enter the devotee's personal information</p>
            </div>
          </div>
          <div className="tr-card-body">
            <DevoteeForm />
          </div>
        </div>

        {/* PURPOSE CARD */}
        <div className="tr-card">
          <div className="tr-card-header">
            <div>
              <p className="tr-card-title">उद्देश आणि तारीख / Purpose & Date</p>
              <p className="tr-card-subtitle">Select purpose, payment type and booking date</p>
            </div>
          </div>
          <div className="tr-card-body">
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

        {/* PAYMENT IN PROGRESS — QR is shown on the customer-facing display device */}
        {showPayment && (
          <div style={{
            background: "#f0f9ff", border: "1px solid #0ea5e9", borderRadius: "8px",
            padding: "14px 16px", marginBottom: "10px", textAlign: "center",
          }}>
            <p style={{ fontWeight: 600, color: "#0369a1", marginBottom: "4px", fontSize: "14px" }}>
              Waiting for the customer to scan &amp; pay on the display screen...
            </p>
            <p style={{ fontSize: "12px", color: "#666", marginBottom: "10px" }}>
              Booking ID: <strong>{pendingBookingId}</strong>
            </p>
            <button
              style={{
                fontSize: "12px", padding: "4px 14px", cursor: "pointer",
                border: "1px solid #94a3b8", borderRadius: "4px", background: "#fff",
              }}
              onClick={stopPaymentWait}
            >
              Cancel Payment
            </button>
          </div>
        )}

        {/* ACTION BUTTONS */}
        <div className="tr-actions">
          <button className="secondary-btn" onClick={() => router.push("/new-booking")} disabled={loading || showPayment}>
            ← मागे / Back
          </button>
          <button type="button" className="primary-btn" onClick={handleCreateBooking} disabled={loading || showPayment}>
            {loading ? "Processing..." : "बुकिंग करा / Create Booking"}
          </button>


        </div>

      </div>
    </div>
  );
}