import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import withAuth from "../utils/withAuth";
import apiRequest from "../services/api";

function DashboardDetails() {
  const router = useRouter();
  const { type } = router.query;

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  /* ======================================================
     PAGE TITLE
  ====================================================== */
  const getTitle = () => {
    switch (type) {
      case "bookings":
        return "Total Bookings Details";

      case "revenue":
        return "Total Revenue Details";

      case "pending":
        return "Pending Dues Details";

      case "today":
        return "Today's Bookings Details";

      case "cancelled":
        return "Cancelled Bookings Details";

      default:
        return "Dashboard Details";
    }
  };

  /* ======================================================
     FETCH DATA
  ====================================================== */
  useEffect(() => {
    if (!type) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        const data = await apiRequest("/Bookings");
        const allBookings = data.bookings || [];

        const today = new Date()
          .toISOString()
          .split("T")[0];

        let filtered = [];

        switch (type) {
          /* ======================================
             TOTAL BOOKINGS
          ====================================== */
          case "bookings":
            filtered = allBookings;
            break;

          /* ======================================
             TOTAL REVENUE
             Only approved bookings
          ====================================== */
          case "revenue":
            filtered = allBookings.filter(
              (booking) => {
                const status = (
                  booking.status || ""
                )
                  .toLowerCase()
                  .trim();

                return (
                  status === "approved" &&
                  Number(
                      booking.paidAmount ||
                      0
                  ) > 0
                );
              }
            );
            break;

          /* ======================================
             PENDING DUES
             Show bookings with remaining amount
          ====================================== */
          case "pending":
            filtered = allBookings.filter(
              (booking) => {
                const remaining = Number(
                  booking.remainingAmount ||
                    0
                );

                const status = (
                  booking.status || ""
                )
                  .toLowerCase()
                  .trim();

                return (
                  remaining > 0 &&
                  status !== "cancelled"
                );
              }
            );
            break;

          /* ======================================
             TODAY BOOKINGS
          ====================================== */
          case "today":
            filtered = allBookings.filter(
              (booking) => {
                if (!booking.bookingDate) {
                  return false;
                }

                const date = new Date(
                  booking.bookingDate
                );

                if (
                  isNaN(date.getTime())
                ) {
                  return false;
                }

                const bookingDate =
                  date
                    .toISOString()
                    .split("T")[0];

                return (
                  bookingDate === today
                );
              }
            );
            break;

          /* ======================================
             CANCELLED BOOKINGS
          ====================================== */
          case "cancelled":
            filtered = allBookings.filter(
              (booking) => {
                const status = (
                  booking.status || ""
                )
                  .toLowerCase()
                  .trim();

                return (
                  status ===
                  "cancelled"
                );
              }
            );
            break;

          default:
            filtered = [];
        }

        /* ======================================
           SORT BY NEWEST FIRST
        ====================================== */
        filtered.sort((a, b) => {
          const dateA = new Date(
            a.createdAt || a._createdDate || 0
          );
          const dateB = new Date(
            b.createdAt || b._createdDate || 0
          );

          return dateB - dateA;
        });

        setBookings(filtered);
      } catch (err) {
        console.error(
          "Dashboard details error:",
          err
        );

        setFetchError(err.message || "Failed to load details");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [type]);

  /* ======================================================
     STATUS COLOR
  ====================================================== */
  const getStatusClass = (
    status
  ) => {
    const value = (
      status || ""
    )
      .toLowerCase()
      .trim();

    if (value === "approved") {
      return "status-approved";
    }

    if (value === "cancelled") {
      return "status-cancelled";
    }

    return "status-pending";
  };

  /* ======================================================
     FORMAT AMOUNT
  ====================================================== */
  const formatAmount = (value) => {
    return Number(
      value || 0
    ).toLocaleString("en-IN");
  };

/* ======================================================
   GET DISPLAY AMOUNT
====================================================== */
const getDisplayAmount = (booking) => {
  // Revenue page → show only paid amount
  if (type === "revenue") {
    return Number(
      booking.paidAmount ||
        booking.advance ||
        0
    );
  }

  // Pending page → show remaining amount
  if (type === "pending") {
    return Number(
      booking.remainingAmount || 0
    );
  }

  // Default → show full booking amount
  return Number(
  booking.paidAmount ||
    booking.advance ||
    booking.amount ||
    0
);
};

  /* ======================================================
     HANDLE REMAINING PAYMENT
     Opens edit page to create a NEW receipt
  ====================================================== */
  const handleCollectPayment = (
    booking
  ) => {
    router.push(
      `/edit/${booking._id}`
    );
  };

/* ======================================================
   UI
====================================================== */
return (
  <div className="dashboard">
    <Sidebar />

    <div className="main">
      <Header title={getTitle()} />

      {fetchError && (
        <div style={{ background: "#fee2e2", border: "1px solid #ef4444", borderRadius: "6px", color: "#dc2626", padding: "8px 12px", margin: "10px 0", fontSize: "13px" }}>
          {fetchError}
        </div>
      )}

      <button
        className="secondary-btn back-btn"
        onClick={() =>
          router.push("/dashboard")
        }
      >
        ← Back to Dashboard
      </button>

      <div className="details-container">
        {loading ? (
          <div className="details-loading">
            Loading data...
          </div>
        ) : bookings.length === 0 ? (
          <div className="details-empty">
            No records found.
          </div>
        ) : (
          <>
            {/* HEADER */}
            <div
              className={`details-header ${
                type === "cancelled"
                  ? "cancelled-layout"
                  : type === "pending"
                  ? "pending-layout"
                  : ""
              }`}
            >
              <div>Name</div>
              <div>Phone</div>
              <div>Purpose</div>
              <div>
                {type === "revenue"
                  ? "Paid"
                  : "Amount"}
              </div>
              <div>Status</div>

              {type === "cancelled" && (
                <div>Reason</div>
              )}

              {type === "pending" && (
                <div>Action</div>
              )}
            </div>

            {/* LIST */}
            <div className="details-list">
              {bookings.map(
                (booking) => (
                  <div
                    key={
                      booking._id ||
                      booking.id
                    }
                    className={`details-card ${
                      type ===
                      "cancelled"
                        ? "cancelled-layout"
                        : type ===
                          "pending"
                        ? "pending-layout"
                        : ""
                    }`}
                  >
                    {/* NAME */}
                    <div className="details-name">
                      {booking.name ||
                        "N/A"}
                    </div>

                    {/* PHONE */}
                    <div className="details-phone">
                      {booking.phone ||
                        "-"}
                    </div>

                    {/* PURPOSE */}
                    <div className="details-purpose">
                      {booking.purpose ||
                        "-"}
                    </div>

                    {/* AMOUNT */}
                    <div className="details-amount">
                      ₹
                      {formatAmount(
                        getDisplayAmount(
                          booking
                        )
                      )}
                    </div>

                    {/* STATUS */}
                    <div
                      className={`details-status ${getStatusClass(
                        booking.status
                      )}`}
                    >
                      {booking.status ||
                        "Pending"}
                    </div>

                    {/* REASON COLUMN */}
                    {type ===
                      "cancelled" && (
                      <div className="details-reason">
                        {booking.reason ||
                          "No reason provided"}
                      </div>
                    )}

                    {/* ACTION COLUMN */}
                    {type ===
                      "pending" && (
                      <div className="details-action">
                        <button
                          className="edit-btn"
                          onClick={() =>
                            handleCollectPayment(
                              booking
                            )
                          }
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  </div>
);
}

export default withAuth(
  DashboardDetails,
  [
    "Admin",
    "Entry Operator",
    "Accountant",
  ]
);