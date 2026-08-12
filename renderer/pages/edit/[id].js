import { useRouter } from "next/router";
import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";
import PurposeDropdown from "../../components/PurposeDropdown";
import withAuth from "../../utils/withAuth";
import apiRequest from "../../services/api";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const ORDER_POLL_INTERVAL_MS = 3000;
const ORDER_POLL_TIMEOUT_MS = 5 * 60 * 1000;
const ONLINE_BANKS = ["ICICI Bank", "BCCB Bank", "SBI Bank"];

/* Bank options — same set as the new-booking tax-receipt flow */
const ALL_BANKS = [
  { id: "ICICI Bank", label: "ICICI" },
  { id: "BCCB Bank",  label: "BCCB" },
  { id: "SBI Bank",   label: "SBI" },
  { id: "Cash",       label: "Cash",   isCash: true },
  { id: "Card",       label: "Card",   isCard: true },
  { id: "Cheque",     label: "Cheque", isCheque: true },
];

function EditBooking() {
  const router = useRouter();
  const { id } = router.query;

  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    payNow: "",
    bookingDate: "",
  });

  const [booking, setBooking] =
    useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [sendSms, setSendSms] = useState(false);

  /* ── Payment method (editable — may differ from the original booking's) ── */
  const [selectedBank, setSelectedBank] = useState("");
  const [payingBankName, setPayingBankName] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState("");

  // Online payment (ICICI / SBI / BCCB via Cashfree) — QR shown on the
  // customer-facing display device, paid from the customer's own phone.
  // Same flow as tax-receipt.js's "isOnlineBank" branch.
  const [showPayment, setShowPayment] = useState(false);
  const [pendingBookingId, setPendingBookingId] = useState("");
  const pendingBookingPayloadRef = useRef(null);
  const pollTimerRef = useRef(null);
  const pollStartRef = useRef(0);
  const [displayUrl, setDisplayUrl] = useState("");
  const [displayUrlQr, setDisplayUrlQr] = useState("");

  const isChequeSelected = selectedBank === "Cheque";
  const isOnlineBank = ONLINE_BANKS.includes(selectedBank);

  const visibleBanks = booking?.is80G
    ? ALL_BANKS
    : ALL_BANKS.filter((b) => b.id !== "SBI Bank");

  /* ======================================================
     FETCH BOOKING BY ID
  ====================================================== */
  useEffect(() => {
    if (!id) return;

    const fetchBooking = async () => {
      try {
        const data = await apiRequest(
          `/booking_by_id?id=${id}`
        );

        const booking = data.booking || data;

        setBooking(booking);
        setSelectedBank(booking.bank || "");

        // Devotee form fields
        setForm({
          name: booking.name || "",
          address: booking.address || "",
          phone: booking.phone || "",
          email: booking.email || "",
          payNow: "",
          bookingDate: booking.bookingDate
            ? new Date(
                booking.bookingDate
              )
                .toISOString()
                .split("T")[0]
            : "",
        });

        // Normalize financial fields
        const amount = Number(booking.amount || 0);
        const advance = Number(booking.advance || 0);

        const remainingAmount =
          booking.remainingAmount !== undefined
            ? Number(
                booking.remainingAmount || 0
              )
            : Math.max(amount - advance, 0);

        // Save full booking for PurposeDropdown
        localStorage.setItem(
          "bookingForm",
          JSON.stringify({
            ...booking,

            // Normalize date for input type="date"
            bookingDate: booking.bookingDate
              ? new Date(
                  booking.bookingDate
                )
                  .toISOString()
                  .split("T")[0]
              : "",

            // Original amount
            amount,

            // User will enter any amount manually
            advance: 0,
            paidAmount: 0,

            // Current pending amount
            remainingAmount,

            // Payment type
            paymentType:
              "Remaining Payment",

            // Metadata for backend
            originalBookingId:
              booking.bookingId,

            bookingGroupId:
              booking.bookingGroupId ||
              booking.bookingId,

            parentBookingId:
              booking.bookingId,

            // Initial status
            status:
              remainingAmount > 0
                ? "Pending"
                : "Approved",

            paymentStatus:
              remainingAmount > 0
                ? "Partial"
                : "Paid",
          })
        );
      } catch (err) {
        console.error(
          "Fetch booking error:",
          err
        );
        alert(
          err.message ||
            "Failed to load booking"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchBooking();

    // Cleanup when page is closed
    return () => {
      localStorage.removeItem(
        "bookingForm"
      );
    };
  }, [id]);

  /* ======================================================
     PAYMENT STATUS POLL (online bank branch)
     Same shape as tax-receipt.js — payment completes on the
     customer's own phone, so there's no local callback to hook into.
  ====================================================== */
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

        if (status === "PAID") {
          finalizePaymentSuccess();
          return;
        }
        if (status === "EXPIRED" || status === "TERMINATED" || status === "CANCELLED") {
          setErrorMsg("Payment was not completed (expired or cancelled). Please try again.");
          stopPaymentWait();
          return;
        }
      } catch (err) {
        console.error(`[payment-poll] network error elapsedMs=${elapsedMs} orderId=${pendingBookingId}`, err);
      }

      if (Date.now() - pollStartRef.current > ORDER_POLL_TIMEOUT_MS) {
        setErrorMsg("Payment timed out. Please try again.");
        stopPaymentWait();
        return;
      }
      pollTimerRef.current = setTimeout(poll, ORDER_POLL_INTERVAL_MS);
    };

    poll();
    return () => { cancelled = true; clearTimeout(pollTimerRef.current); };
  }, [showPayment, pendingBookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Pairing QR for the customer display's tunnel URL (staff-facing hint) */
  useEffect(() => {
    window.ipc?.invoke?.("get-display-url").then((url) => setDisplayUrl(url || "")).catch(() => {});
  }, []);

  useEffect(() => {
    if (!displayUrl) { setDisplayUrlQr(""); return; }
    QRCode.toDataURL(displayUrl, { width: 160, margin: 1 }).then(setDisplayUrlQr).catch(() => {});
  }, [displayUrl]);

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

  /* ======================================================
     HANDLE INPUT CHANGE
  ====================================================== */
  const handleChange = (e) => {
    const updatedForm = {
      ...form,
      [e.target.name]: e.target.value,
    };

    setForm(updatedForm);

    const existing = JSON.parse(
      localStorage.getItem(
        "bookingForm"
      ) || "{}"
    );

    localStorage.setItem(
      "bookingForm",
      JSON.stringify({
        ...existing,
        [e.target.name]: e.target.value,
      })
    );
  };

  /* ======================================================
     HANDLE BANK SELECTION
  ====================================================== */
  const handleBankSelect = (bank) => {
    setSelectedBank(bank.id);
    if (!bank.isCheque) {
      setPayingBankName("");
      setChequeNumber("");
      setChequeDate("");
    }
  };

  /* ======================================================
     HANDLE PAYMENT AMOUNT CHANGE
  ====================================================== */
  const handlePaymentChange = (e) => {
    const value = e.target.value;
    const payNow = Number(value || 0);

    const currentRemaining = Number(
      booking?.remainingAmount || 0
    );

    if (payNow > currentRemaining) {
      alert(
        "Entered amount cannot be greater than pending amount."
      );
      return;
    }

    const newRemaining = Math.max(
      currentRemaining - payNow,
      0
    );

    setForm({
      ...form,
      payNow: value,
    });

    const existing = JSON.parse(
      localStorage.getItem(
        "bookingForm"
      ) || "{}"
    );

    localStorage.setItem(
      "bookingForm",
      JSON.stringify({
        ...existing,
        advance: payNow,
        paidAmount: payNow,
        remainingAmount:
          newRemaining,
        paymentType:
          "Remaining Payment",
        status:
          newRemaining === 0
            ? "Approved"
            : "Pending",
        paymentStatus:
          newRemaining === 0
            ? "Paid"
            : "Partial",
      })
    );
  };

  /* ======================================================
     SAVE PAYMENT (CREATE NEW RECEIPT)
  ====================================================== */
  const handleSave = async () => {
    setErrorMsg("");

    if (!selectedBank) {
      alert("Please select a payment method.");
      return;
    }
    if (isChequeSelected) {
      if (!payingBankName.trim()) { alert("Please enter paying bank name."); return; }
      if (!chequeNumber.trim())   { alert("Please enter cheque number."); return; }
      if (!chequeDate)            { alert("Please enter cheque date."); return; }
    }

    try {
      setSaving(true);

      const saved = JSON.parse(
        localStorage.getItem(
          "bookingForm"
        ) || "{}"
      );

      const payNow = Number(
        saved.advance ||
          saved.paidAmount ||
          0
      );

      if (payNow <= 0) {
        alert(
          "Please enter amount to pay."
        );
        return;
      }

      const currentRemaining = Number(
        booking?.remainingAmount || 0
      );

      if (payNow > currentRemaining) {
        alert(
          "Payment amount cannot exceed pending amount."
        );
        return;
      }

      const newRemaining = Math.max(
        currentRemaining - payNow,
        0
      );

      const payload = {
        // SAME GROUP ID
        bookingGroupId:
          booking.bookingGroupId ||
          booking.bookingId,

        // PREVIOUS RECEIPT ID
        parentBookingId:
          booking.bookingId,

        // Customer info
        customerId:
          booking.customerId || "",

        // Devotee details
        name: saved.name,
        address: saved.address,
        phone: saved.phone,
        email: saved.email,

        // Booking details
        purpose: saved.purpose,
        bookingDate:
          form.bookingDate ||
          saved.bookingDate,

        // Financial
        amount:
          Number(
            booking.amount || 0
          ),
        advance: payNow,
        paidAmount: payNow,
        remainingAmount:
          newRemaining,

        // Payment
        paymentType:
          "Remaining Payment",

        // Status
        status:
          newRemaining === 0
            ? "Approved"
            : "Pending",

        // Receipt info
        receiptType:
          booking.receiptType ||
          "Internal",
        bank: selectedBank,
        is80G:
          booking.is80G || false,
        payingBankName: isChequeSelected ? payingBankName.trim() : "",
        chequeNumber:   isChequeSelected ? chequeNumber.trim() : "",
        chequeDate:     isChequeSelected ? chequeDate : "",
        sendSms,
      };

      if (isOnlineBank) {
        // Step 1: Save to dedicated pending DB (separate from booking DB)
        const pendingRes = await apiRequest("/create_pending_booking", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const orderId = pendingRes?.orderId || "";
        if (!orderId) { alert("Failed to create pending booking. Please try again."); return; }

        // Step 2: Create Cashfree payment order using orderId as reference
        const orderRes = await apiRequest("/create_payment_order", {
          method: "POST",
          body: JSON.stringify({
            bank: selectedBank,
            amount: payNow,
            orderId,
            customerName: saved.name?.trim(),
            customerPhone: saved.phone?.trim(),
            customerEmail: saved.email?.trim() || "devotee@ssmvd.org",
          }),
        });

        if (!orderRes?.link_url) {
          alert("Could not initiate payment. Please try again.");
          return;
        }

        // Step 3: Turn the Cashfree Payment Link into a QR code and push it
        // to the customer-facing display device.
        const qrDataUrl = await QRCode.toDataURL(orderRes.link_url, { width: 400, margin: 1 });

        pendingBookingPayloadRef.current = payload;
        setPendingBookingId(orderId);
        window.ipc?.send?.("display-show-qr", { qrDataUrl, amount: payNow, orderId });
        setShowPayment(true);
        return;
      }

      // Cash / Card / Cheque — direct booking, same as before
      const data = await apiRequest(
        "/create_booking",
        {
          method: "POST",
          body: JSON.stringify(
            payload
          ),
        }
      );

      console.log(
        "PAYMENT RESPONSE:",
        data
      );

      alert(
        `Payment received successfully!\nNew Receipt ID: ${data.booking.bookingId}`
      );

      // Feeds useResolvedBooking/useReceiptPdfPipeline (mounted at the app
      // level in _app.js) so this pending-dues receipt also gets a PDF
      // generated and, if requested, texted out — same as new-booking's
      // direct (Cash/Card/Cheque) flow in internal-receipt.js/tax-receipt.js.
      localStorage.setItem(
        "lastBooking",
        JSON.stringify({
          ...(data.booking || {}),
          bookingId: data.booking.bookingId,
          sendSms,
        })
      );

      localStorage.removeItem(
        "bookingForm"
      );

      router.push(
        `/booking-success?id=${data.booking.bookingId}`
      );
    } catch (err) {
      console.error(
        "Payment error:",
        err
      );

      alert(
        err.message ||
          "Failed to create receipt"
      );
    } finally {
      setSaving(false);
    }
  };

  /* ======================================================
     LOADING
  ====================================================== */
  if (loading) {
    return (
      <div className="dashboard">
        <Sidebar />
        <div className="main">
          <Header title="Edit Booking" />
          <p style={{ padding: "20px" }}>
            Loading booking...
          </p>
        </div>
      </div>
    );
  }

  /* ======================================================
     UI
  ====================================================== */
  return (
    <div className="dashboard">
      <Sidebar />

      <div className="main">
        <Header
          title={`Edit Receipt ${
            booking?.bookingId || ""
          }`}
        />

        <div className="edit-container">
          <h2>
            बुकिंग संपादित करा / Edit Booking
          </h2>

          {/* DEVOTEE DETAILS */}
          <div className="form-section">
            <h3>
              भक्त तपशील / Devotee Details
            </h3>

            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="नाव / Name *"
              className="input"
            />

            <input
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="पत्ता / Address"
              className="input"
            />

            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="फोन / Phone *"
              className="input"
            />

            <input
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="Email"
              className="input"
            />

            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", fontSize: "14px" }}>
              <input
                type="checkbox"
                checked={sendSms}
                onChange={(e) => setSendSms(e.target.checked)}
              />
              पावतीची लिंक SMS द्वारे पाठवा / Send receipt link via SMS
            </label>
          </div>

          {/* PURPOSE + PAYMENT SECTION */}
          <div className="form-section">

            <PurposeDropdown />

            <div className="amount-box">
              <strong>
                भरलेली रक्कम / Paid Amount:
              </strong>{" "}
              ₹
              {Number(
                (booking?.amount || 0) -
                  (booking?.remainingAmount ||
                    0)
              ).toLocaleString("en-IN")}
            </div>

            <input
              type="number"
              className="input"
              placeholder="आता भरणारी रक्कम / Enter Amount to Pay Now"
              value={form.payNow}
              onChange={
                handlePaymentChange
              }
              onWheel={(e) => e.target.blur()}
              disabled={showPayment}
            />

            <div className="amount-box">
              <strong>
                उर्वरित रक्कम / Remaining Amount:
              </strong>{" "}
              ₹
              {Math.max(
                Number(
                  booking?.remainingAmount ||
                    0
                ) -
                  Number(
                    form.payNow || 0
                  ),
                0
              ).toLocaleString("en-IN")}
            </div>

            {/* PAYMENT METHOD — editable, may differ from the original booking */}
            <div className="tr-field">
              <label className="tr-bank-label">पेमेंट पद्धत / Payment Method</label>
              <div className="tr-bank-options">
                {visibleBanks.map((bank) => (
                  <button
                    key={bank.id}
                    type="button"
                    className={`tr-bank-pill${bank.isCheque ? " tr-cheque-pill" : ""}${selectedBank === bank.id ? " tr-bank-active" : ""}`}
                    onClick={() => handleBankSelect(bank)}
                    disabled={showPayment}
                  >
                    {bank.label}
                  </button>
                ))}
              </div>
              {isOnlineBank && displayUrl && (
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

            <DatePicker
  selected={
    form.bookingDate
      ? new Date(form.bookingDate)
      : null
  }
  onChange={(date) => {
    if (!date) return;

    const year = date.getFullYear();
    const month = String(
      date.getMonth() + 1
    ).padStart(2, "0");
    const day = String(
      date.getDate()
    ).padStart(2, "0");

    const formatted = `${year}-${month}-${day}`;

    const updatedForm = {
      ...form,
      bookingDate: formatted,
    };

    setForm(updatedForm);

    // Update localStorage so PurposeDropdown and save logic stay in sync
    const existing = JSON.parse(
      localStorage.getItem("bookingForm") || "{}"
    );

    localStorage.setItem(
      "bookingForm",
      JSON.stringify({
        ...existing,
        bookingDate: formatted,
      })
    );
  }}
  filterDate={(date) => {
    // Disable past dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const selected = new Date(date);
    selected.setHours(0, 0, 0, 0);

    return selected >= today;
  }}
  minDate={new Date()}
  dateFormat="dd-MM-yyyy"
  placeholderText="Select booking date"
  className="input"
  required
/>

            {errorMsg && (
              <div style={{
                background: "#fee2e2", border: "1px solid #ef4444", borderRadius: "6px",
                color: "#dc2626", padding: "6px 10px", margin: "8px 0",
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
                padding: "14px 16px", margin: "10px 0", textAlign: "center",
              }}>
                <p style={{ fontWeight: 600, color: "#0369a1", marginBottom: "4px", fontSize: "14px" }}>
                  Waiting for the customer to scan &amp; pay on the display screen...
                </p>
                <p style={{ fontSize: "12px", color: "#666", marginBottom: "10px" }}>
                  Order ID: <strong>{pendingBookingId}</strong>
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

            <button
              className="primary-btn"
              onClick={handleSave}
              disabled={saving || showPayment}
              style={{ marginTop: "4px" }}
            >
              {saving
                ? "Generating Receipt..."
                : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default withAuth(
  EditBooking,
  [
    "Admin",
    "Entry Operator",
    "Accountant",
  ]
);
