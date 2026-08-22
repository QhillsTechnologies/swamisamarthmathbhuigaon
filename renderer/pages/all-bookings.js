import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/router";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import withAuth from "../utils/withAuth";
import apiRequest from "../services/api";
import Pagination from "../components/Pagination";

function AllBookings() {
  const router = useRouter();

  const [bookings, setBookings] = useState([]);
  const [confirmId, setConfirmId] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [pageError, setPageError] = useState("");
  const [cancelMsg, setCancelMsg] = useState({ text: "", type: "" });
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPurpose, setEditPurpose] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editPaidAmount, setEditPaidAmount] = useState("");
  const [editMsg, setEditMsg] = useState({ text: "", type: "" });
  const [editSaving, setEditSaving] = useState(false);

  const tableRef = useRef(null);
  const headerRef = useRef(null);

  /* ======================================================
     SYNC HORIZONTAL SCROLL — keeps header aligned with rows
  ====================================================== */
  const handleTableScroll = () => {
    if (headerRef.current)
      headerRef.current.scrollLeft = tableRef.current.scrollLeft;
  };

  /* ======================================================
     LOAD USER ROLE
  ====================================================== */
  useEffect(() => {
    setUserRole(localStorage.getItem("role"));
  }, []);

  /* ======================================================
     FETCH ALL BOOKINGS
  ====================================================== */
  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const data = await apiRequest("/Bookings");
        const list = Array.isArray(data) ? data : (data.bookings || []);

        const sorted = [...list].sort((a, b) => {
          const dateA = new Date(a.createdAt || a._createdDate || 0);
          const dateB = new Date(b.createdAt || b._createdDate || 0);
          return dateB - dateA;
        });

        setBookings(sorted);
      } catch (err) {
        console.error("Bookings fetch error:", err);
        const errorMsg = (err.message || "").toLowerCase();
        if (
          errorMsg.includes("token") ||
          errorMsg.includes("expired") ||
          errorMsg.includes("signature")
        ) {
          localStorage.clear();
          window.location.href = "/login";
        } else {
          setPageError(err.message || "Failed to load bookings");
        }
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, []);

  /* ======================================================
     SEARCH FILTER
  ====================================================== */
  const filteredBookings = useMemo(() => {
    setCurrentPage(1);
    const term = searchTerm.toLowerCase().trim();
    return bookings.filter(
      (booking) =>
        String(booking.name || "").toLowerCase().includes(term) ||
        String(booking.bookingId || "").toLowerCase().includes(term) ||
        String(booking.phone || "").toLowerCase().includes(term) ||
        String(booking._id || "").toLowerCase().includes(term)
    );
  }, [bookings, searchTerm]);

  const pagedBookings = filteredBookings.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  /* ======================================================
     CANCEL BOOKING
  ====================================================== */
  const confirmCancel = async () => {
    if (!cancelReason.trim()) {
      setCancelMsg({ text: "Please enter cancellation reason", type: "error" });
      return;
    }
    try {
      await apiRequest("/cancel_booking", {
        method: "POST",
        body: JSON.stringify({ id: confirmId, reason: cancelReason }),
      });
      setBookings((prev) =>
        prev.map((booking) =>
          (booking._id || booking.id) === confirmId
            ? { ...booking, status: "Cancelled", reason: cancelReason }
            : booking
        )
      );
      setConfirmId(null);
      setCancelReason("");
      setCancelMsg({ text: "Booking cancelled successfully", type: "success" });
    } catch (err) {
      console.error("Cancel booking error:", err);
      setCancelMsg({ text: err.message || "Failed to cancel booking", type: "error" });
    }
  };

  /* ======================================================
     EDIT BOOKING CONTACT (Admin only)
  ====================================================== */
  const openEdit = (booking) => {
    setEditId(booking._id || booking.id);
    setEditName(booking.name || "");
    setEditPhone(String(booking.phone || ""));
    setEditPurpose(booking.purpose || "");
    setEditAmount(String(booking.amount ?? ""));
    setEditPaidAmount(String(booking.advance ?? booking.paidAmount ?? ""));
    setEditMsg({ text: "", type: "" });
  };

  const closeEdit = () => {
    setEditId(null);
    setEditName("");
    setEditPhone("");
    setEditPurpose("");
    setEditAmount("");
    setEditPaidAmount("");
    setEditMsg({ text: "", type: "" });
  };

  // Remaining is always derived from amount - paid so the three stay
  // consistent — admin edits amount/paid, remaining follows automatically.
  const editRemainingAmount = Math.max(
    Number(editAmount || 0) - Number(editPaidAmount || 0),
    0
  );

  const confirmEdit = async () => {
    const name = editName.trim();
    const phone = String(editPhone).trim();
    const purpose = editPurpose.trim();
    const amount = Number(editAmount || 0);
    const paidAmount = Number(editPaidAmount || 0);

    if (!/^[A-Za-z\s]+$/.test(name)) {
      setEditMsg({ text: "Name should contain only letters and spaces", type: "error" });
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setEditMsg({ text: "Invalid mobile number", type: "error" });
      return;
    }
    if (!purpose) {
      setEditMsg({ text: "Purpose is required", type: "error" });
      return;
    }
    if (amount <= 0) {
      setEditMsg({ text: "Amount must be greater than 0", type: "error" });
      return;
    }
    if (paidAmount < 0 || paidAmount > amount) {
      setEditMsg({ text: "Paid amount cannot exceed the total amount", type: "error" });
      return;
    }

    try {
      setEditSaving(true);
      const res = await apiRequest("/update_booking_contact", {
        method: "POST",
        body: JSON.stringify({
          id: editId,
          name,
          phone,
          purpose,
          amount,
          paidAmount,
          remainingAmount: editRemainingAmount,
        }),
      });
      const updated = res?.booking;
      setBookings((prev) =>
        prev.map((booking) =>
          (booking._id || booking.id) === editId
            ? {
                ...booking,
                ...(updated || {
                  name,
                  phone,
                  purpose,
                  amount,
                  advance: paidAmount,
                  paidAmount,
                  remainingAmount: editRemainingAmount,
                }),
              }
            : booking
        )
      );
      closeEdit();
      setCancelMsg({ text: "Booking updated successfully", type: "success" });
    } catch (err) {
      console.error("Update booking error:", err);
      setEditMsg({ text: err.message || "Failed to update booking", type: "error" });
    } finally {
      setEditSaving(false);
    }
  };

  /* ======================================================
     HELPERS
  ====================================================== */
  const formatCurrency = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN")}`;

  const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (isNaN(date)) return value;
    return date.toLocaleDateString("en-GB");
  };

  // Multi-date bookings (e.g. Abhishek/seva booked across several dates)
  // store all of them in booking.multiDates — show every one of them here
  // instead of just the single bookingDate (which the backend only fills
  // with the earliest date, for records/sorting).
  const formatBookingDate = (booking) => {
    if (Array.isArray(booking.multiDates) && booking.multiDates.length > 1) {
      return booking.multiDates
        .slice()
        .sort()
        .map(formatDate)
        .join(", ");
    }
    return formatDate(booking.bookingDate || booking.date);
  };

  /* ======================================================
     LOADING
  ====================================================== */
  if (loading) {
    return (
      <div className="db-dashboard">
        <Sidebar />
        <div className="db-main">
          <Header title="सर्व बुकिंग / All Bookings" />
          <p style={{ padding: "20px" }}>Loading bookings...</p>
        </div>
      </div>
    );
  }

  /* ======================================================
     UI
  ====================================================== */
  return (
    <div className="db-dashboard">
      <Sidebar />

      <div className="db-main ab-page">
        <div className="ab-sticky-top">
          <Header title="सर्व बुकिंग / All Bookings" />

          {/* SEARCH BOX */}
          <div className="ab-search-box">
            <input
              type="text"
              placeholder="Search by Name, Booking ID, or Phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* PAGE ERROR */}
        {pageError && (
          <div style={{ background: "#fee2e2", border: "1px solid #ef4444", borderRadius: "6px", color: "#dc2626", padding: "8px 12px", margin: "10px 0", fontSize: "13px" }}>
            {pageError}
          </div>
        )}

        {/* CANCEL SUCCESS/ERROR */}
        {cancelMsg.text && (
          <div style={{
            background: cancelMsg.type === "success" ? "#dcfce7" : "#fee2e2",
            border: `1px solid ${cancelMsg.type === "success" ? "#22c55e" : "#ef4444"}`,
            color: cancelMsg.type === "success" ? "#15803d" : "#dc2626",
            borderRadius: "6px", padding: "8px 12px", margin: "10px 0", fontSize: "13px", display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span>{cancelMsg.text}</span>
            <button onClick={() => setCancelMsg({ text: "", type: "" })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px" }}>x</button>
          </div>
        )}

        {/* BOOKING LIST */}
        <div className="ab-booking-list">
          {filteredBookings.length === 0 ? (
            <div className="ab-empty">No bookings found.</div>
          ) : (
            <div className="ab-container">

              {/* STICKY HEADER */}
              <div className="ab-sticky-header" ref={headerRef}>
                <div className="ab-header">
                  <div>Booking ID</div>
                  <div>Name</div>
                  <div>Phone</div>
                  <div>Purpose</div>
                  <div>Total Amount</div>
                  <div>Paid Amount</div>
                  <div>Remaining</div>
                  <div>Status</div>
                  <div>Date</div>
                  <div>Action</div>
                </div>
              </div>

              {/* SCROLLABLE BODY */}
              <div
                className="ab-table-scroll"
                ref={tableRef}
                onScroll={handleTableScroll}
              >
                {/* Invisible spacer */}
                <div className="ab-header ab-header-spacer">
                  <div>Booking ID</div>
                  <div>Name</div>
                  <div>Phone</div>
                  <div>Purpose</div>
                  <div>Total Amount</div>
                  <div>Paid Amount</div>
                  <div>Remaining</div>
                  <div>Status</div>
                  <div>Date</div>
                  <div>Action</div>
                </div>

                {/* ROWS */}
                <div className="ab-list">
                  {pagedBookings.map((booking) => {
                    const rowKey = booking._id || booking.id;
                    const status = booking.status || "Pending";
                    const statusLower = status.toLowerCase();

                    const statusClass = statusLower.includes("approved")
                      ? "ab-status-approved"
                      : statusLower.includes("cancelled")
                      ? "ab-status-cancelled"
                      : "ab-status-pending";

                    // Show Cancel button for all non-cancelled bookings
                    const showCancelBtn =
                      userRole === "Admin" &&
                      statusLower !== "cancelled";

                    return (
                      <div key={rowKey} className="ab-row">
                        <div className="ab-id">
                          {booking.bookingId || rowKey || "-"}
                        </div>
                        <div className="ab-name" title={booking.name || ""}>{booking.name || "-"}</div>
                        <div className="ab-phone" title={String(booking.phone || "")}>{booking.phone || "-"}</div>
                        <div className="ab-purpose">{booking.purpose || "-"}</div>
                        <div className="ab-amount">{formatCurrency(booking.amount)}</div>
                        <div className="ab-amount">
                          {formatCurrency(booking.advance ?? booking.paidAmount)}
                        </div>
                        <div
                          className="ab-amount"
                          style={
                            Number(booking.remainingAmount) > 0
                              ? { color: "#dc2626", fontWeight: 700 }
                              : undefined
                          }
                        >
                          {formatCurrency(booking.remainingAmount)}
                        </div>
                        <div className={`ab-status ${statusClass}`}>{status}</div>
                        <div className="ab-date">
                          {formatBookingDate(booking)}
                        </div>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          {userRole === "Admin" && (
                            <button
                              className="ab-edit-btn"
                              onClick={() => openEdit(booking)}
                            >
                              Edit
                            </button>
                          )}
                          {showCancelBtn ? (
                            <button
                              className="ab-cancel-btn"
                              onClick={() =>
                                setConfirmId(booking._id || booking.id)
                              }
                            >
                              Cancel
                            </button>
                          ) : statusLower === "cancelled" ? (
                            <span
                              className="ab-cancel-reason"
                              title={booking.reason || ""}
                            >
                              {booking.reason || "-"}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Pagination
                currentPage={currentPage}
                totalItems={filteredBookings.length}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={setCurrentPage}
              />

            </div>
          )}
        </div>
      </div>

      {/* CANCEL MODAL */}
      {confirmId && (
        <div className="ab-modal-overlay">
          <div className="ab-modal">
            <p>Enter cancellation reason</p>
            {cancelMsg.type === "error" && cancelMsg.text && (
              <div style={{ background: "#fee2e2", border: "1px solid #ef4444", borderRadius: "6px", color: "#dc2626", padding: "6px 10px", fontSize: "12px", margin: "6px 0" }}>
                {cancelMsg.text}
              </div>
            )}
            <textarea
              className="input"
              rows="4"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter reason..."
              style={{ marginTop: "10px", marginBottom: "15px" }}
            />
            <div className="ab-modal-actions">
              <button className="primary-btn" onClick={confirmCancel}>
                Confirm Cancel
              </button>
              <button
                className="secondary-btn"
                onClick={() => { setConfirmId(null); setCancelReason(""); }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* EDIT MODAL */}
      {editId && (
        <div className="ab-modal-overlay">
          <div className="ab-modal">
            <p>Edit booking contact details</p>
            {editMsg.type === "error" && editMsg.text && (
              <div style={{ background: "#fee2e2", border: "1px solid #ef4444", borderRadius: "6px", color: "#dc2626", padding: "6px 10px", fontSize: "12px", margin: "6px 0" }}>
                {editMsg.text}
              </div>
            )}
            <input
              className="input"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Name"
              style={{ marginTop: "10px", marginBottom: "10px" }}
            />
            <input
              className="input"
              type="text"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="Phone"
              maxLength={10}
              style={{ marginBottom: "10px" }}
            />
            <input
              className="input"
              type="text"
              value={editPurpose}
              onChange={(e) => setEditPurpose(e.target.value)}
              placeholder="Purpose"
              style={{ marginBottom: "10px" }}
            />
            <input
              className="input"
              type="number"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              placeholder="Total Amount"
              min="0"
              onWheel={(e) => e.target.blur()}
              style={{ marginBottom: "10px" }}
            />
            <input
              className="input"
              type="number"
              value={editPaidAmount}
              onChange={(e) => setEditPaidAmount(e.target.value)}
              placeholder="Paid Amount"
              min="0"
              onWheel={(e) => e.target.blur()}
              style={{ marginBottom: "10px" }}
            />
            <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "15px" }}>
              Remaining Amount: ₹{editRemainingAmount.toLocaleString("en-IN")}
            </div>
            <div className="ab-modal-actions">
              <button className="primary-btn" onClick={confirmEdit} disabled={editSaving}>
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
              <button className="secondary-btn" onClick={closeEdit}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default withAuth(AllBookings, ["Admin", "Entry Operator", "Accountant"]);