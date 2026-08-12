import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import StatCard from "../components/StatCard";
import withAuth from "../utils/withAuth";
import apiRequest from "../services/api";
import Pagination from "../components/Pagination";

function Dashboard() {
  const [stats, setStats] = useState({
    totalBookings: 0,
    totalRevenue: 0,
    pendingDues: 0,
    todayBookings: 0,
    cancelledBookings: 0,
  });

  const [recentBookings, setRecentBookings] = useState([]);
  const [revenueByPurpose, setRevenueByPurpose] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [revPage, setRevPage] = useState(1);
  const REV_PER_PAGE = 8;

  /* ======================================================
     FETCH DASHBOARD STATS
  ====================================================== */
  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const data = await apiRequest("/dashboard_stats");
        console.log("DASHBOARD RESPONSE:", data);
        const statsData = data.stats || data;

        const bookingsResponse = await apiRequest("/Bookings");
        const allBookings = bookingsResponse.bookings || [];

        /* APPROVED BOOKINGS (FOR REVENUE ONLY) */
        const approvedBookings = allBookings.filter(
          (booking) =>
            (booking.status || "").toLowerCase().trim() === "approved"
        );

        /* RECENT BOOKINGS - Approved + Pending only, sorted newest first */
        const validRecentBookings = allBookings
          .filter((booking) => {
            const status = (booking.status || "").toLowerCase().trim();
            return status === "approved" || status === "pending";
          })
          .sort((a, b) => {
            const dateA = new Date(a.createdAt || a._createdDate || 0);
            const dateB = new Date(b.createdAt || b._createdDate || 0);
            return dateB - dateA;
          });

        /* TOTAL REVENUE - ONLY APPROVED */
        const totalRevenue = approvedBookings.reduce(
          (sum, booking) =>
            sum + Number(booking.paidAmount || booking.advance || 0),
          0
        );

        /* PENDING DUES */
        const pendingDues =
          Number(statsData.pendingDues || statsData.totalPendingAmount) || 0;

        /* TODAY BOOKINGS */
        const todayBookings = Number(statsData.todayBookings) || 0;

        /* CANCELLED BOOKINGS COUNT */
        const cancelledBookings = allBookings.filter(
          (booking) =>
            (booking.status || "").toLowerCase().trim() === "cancelled"
        ).length;

        /* REVENUE BY PURPOSE */
        const revenueByPurpose = Object.values(
          approvedBookings.reduce((grouped, booking) => {
            const purpose = booking.purpose || "Unknown";
            const paid = Number(booking.paidAmount || booking.advance || 0);
            if (!grouped[purpose]) {
              grouped[purpose] = { purpose, amount: 0 };
            }
            grouped[purpose].amount += paid;
            return grouped;
          }, {})
        );

        /* UPDATE STATS */
        setStats({
          totalBookings: allBookings.length,
          totalRevenue,
          pendingDues,
          todayBookings,
          cancelledBookings,
        });

        setRecentBookings(validRecentBookings.slice(0, 7));
        setRevenueByPurpose(revenueByPurpose);
        setRevPage(1);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        const errorMsg = (err.message || "").toLowerCase();
        if (
          errorMsg.includes("token") ||
          errorMsg.includes("expired") ||
          errorMsg.includes("signature")
        ) {
          localStorage.clear();
          window.location.href = "/login";
          return;
        }
        setFetchError(err.message || "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  /* ======================================================
     LOADING
  ====================================================== */
  if (loading) {
    return (
      <div className="db-dashboard">
        <Sidebar />
        <div className="db-main">
          <Header title="मुख्यपृष्ठ / Dashboard" />
          <p style={{ padding: "20px" }}>Loading dashboard...</p>
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

      <div className="db-main">
        <Header title="मुख्यपृष्ठ / Dashboard" />

        {fetchError && (
          <div style={{ background: "#fee2e2", border: "1px solid #ef4444", borderRadius: "6px", color: "#dc2626", padding: "8px 12px", margin: "10px 0", fontSize: "13px" }}>
            {fetchError}
          </div>
        )}

        {/* ===== STAT CARDS ===== */}
        <div className="db-cards">
          <StatCard
            title="Total Bookings"
            value={stats.totalBookings}
            color="orange"
            link="/dashboard-details?type=bookings"
          />
          <StatCard
            title="Total Revenue"
            value={`₹${Number(stats.totalRevenue || 0).toLocaleString("en-IN")}`}
            color="green"
            link="/dashboard-details?type=revenue"
          />
          <StatCard
            title="Pending Dues"
            value={`₹${Number(stats.pendingDues || 0).toLocaleString("en-IN")}`}
            color="orange"
            link="/dashboard-details?type=pending"
          />
          <StatCard
            title="Today's Bookings"
            value={stats.todayBookings}
            color="blue"
            link="/dashboard-details?type=today"
          />
          <StatCard
            title="Cancelled Bookings"
            value={stats.cancelledBookings}
            color="orange"
            link="/dashboard-details?type=cancelled"
          />
        </div>

        {/* ===== MAIN SECTIONS ===== */}
        <div className="db-section-container">

          {/* ===== REVENUE BY PURPOSE ===== */}
          <div className="db-section">
            <h3>उद्देशानुसार महसूल / Revenue by Purpose</h3>

            {revenueByPurpose.length === 0 ? (
              <div className="db-empty-state">
                <p>No revenue data available.</p>
              </div>
            ) : (
              <>
                {revenueByPurpose
                  .slice((revPage - 1) * REV_PER_PAGE, revPage * REV_PER_PAGE)
                  .map((item, index) => (
                    <div key={index} className="db-revenue-item">
                      <p>
                        <strong>{item.purpose}</strong>
                      </p>
                      <p>₹{Number(item.amount || 0).toLocaleString("en-IN")}</p>
                    </div>
                  ))}
                <Pagination
                  currentPage={revPage}
                  totalItems={revenueByPurpose.length}
                  itemsPerPage={REV_PER_PAGE}
                  onPageChange={setRevPage}
                />
              </>
            )}
          </div>

          {/* ===== RECENT BOOKINGS ===== */}
          <div className="db-section">
            <h3>अलीकडील बुकिंग / Recent Bookings</h3>

            {recentBookings.length === 0 ? (
              <div className="db-empty-state">
                <p>No bookings yet. Create your first booking!</p>
              </div>
            ) : (
              recentBookings.map((booking, index) => (
                <div
                  key={booking._id || index}
                  className="db-booking-item"
                >
                  <div className="db-booking-info">
                    <p className="db-booking-name">
                      <strong>{booking.name}</strong>
                    </p>
                    <p className="db-booking-purpose">{booking.purpose}</p>
                  </div>

                  <p className="db-booking-amount">
                    ₹{Number(booking.paidAmount || booking.advance || booking.amount || 0).toLocaleString("en-IN")}
                  </p>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

export default withAuth(Dashboard, ["Admin", "Entry Operator", "Accountant"]);