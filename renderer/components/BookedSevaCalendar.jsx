import { useState, useEffect, useMemo, useCallback } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import apiRequest from "../services/api";

/* ==========================================
   DATE HELPERS
========================================== */
const toDBDate = (date) => {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const toDisplayDate = (dateKey) => {
  if (!dateKey) return "";
  const [y, m, d] = dateKey.split("-");
  return `${d}-${m}-${y}`;
};

const safeDate = (dateKey) => {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
};

/* Every calendar date a booking occupies — multi-date sevas store all
   their dates in booking.multiDates; everything else uses bookingDate. */
const getBookingDateKeys = (b) => {
  if (Array.isArray(b.multiDates) && b.multiDates.length > 0) {
    return b.multiDates
      .map((d) => (typeof d === "string" ? d.split("T")[0].trim() : toDBDate(new Date(d))))
      .filter(Boolean);
  }
  const single = (b.bookingDate || b.date || "").split("T")[0].trim();
  return single ? [single] : [];
};

/* ==========================================
   BOOKED SEVA CALENDAR — button + modal
========================================== */
export default function BookedSevaCalendar({ buttonClassName = "secondary-btn" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [activeDateKey, setActiveDateKey] = useState(null); // hovered OR clicked date

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const data = await apiRequest("/Bookings");
      const list = Array.isArray(data) ? data : data.bookings || [];
      setBookings(list.filter((b) => (b.status || "").toLowerCase() !== "cancelled"));
    } catch (err) {
      setFetchError(err.message || "Failed to load booked sevas");
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchBookings();
  }, [isOpen, fetchBookings]);

  /* dateKey -> bookings on that date */
  const bookingsByDate = useMemo(() => {
    const map = {};
    bookings.forEach((b) => {
      getBookingDateKeys(b).forEach((key) => {
        if (!map[key]) map[key] = [];
        map[key].push(b);
      });
    });
    return map;
  }, [bookings]);

  const bookedDates = useMemo(
    () => Object.keys(bookingsByDate).map(safeDate).filter(Boolean),
    [bookingsByDate]
  );

  const activeBookings = activeDateKey ? bookingsByDate[activeDateKey] || [] : [];

  const handleClose = () => {
    setIsOpen(false);
    setActiveDateKey(null);
  };

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        onClick={() => setIsOpen(true)}
      >
        📅 बुक केलेली सेवा / Booked Seva
      </button>

      {isOpen && (
        <div className="bsc-overlay" onClick={handleClose}>
          <div className="bsc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bsc-modal-header">
              <div>
                <p className="bsc-modal-title">बुक केलेली सेवा / Booked Seva Calendar</p>
                <p className="bsc-modal-subtitle">
                  तारखेवर माउस न्या किंवा क्लिक करा / Hover or click a date to see bookings
                </p>
              </div>
              <button type="button" className="bsc-close-btn" onClick={handleClose}>×</button>
            </div>

            <div className="bsc-modal-body">
              {loading ? (
                <div className="bsc-loading">Loading bookings...</div>
              ) : fetchError ? (
                <div className="bsc-error">{fetchError}</div>
              ) : (
                <div className="bsc-content">
                  <div className="bsc-calendar-wrap">
                    <DatePicker
                      inline
                      selected={activeDateKey ? safeDate(activeDateKey) : null}
                      onChange={(date) => setActiveDateKey(date ? toDBDate(date) : null)}
                      calendarClassName="pd-calendar bsc-calendar"
                      highlightDates={
                        bookedDates.length > 0
                          ? [{ "bsc-day--booked": bookedDates }]
                          : []
                      }
                      renderDayContents={(day, date) => {
                        const key = toDBDate(date);
                        const count = bookingsByDate[key]?.length || 0;
                        return (
                          <span
                            title={count > 0 ? `${count} booking${count > 1 ? "s" : ""}` : ""}
                            onMouseEnter={() => count > 0 && setActiveDateKey(key)}
                            style={{ display: "block", width: "100%", height: "100%" }}
                          >
                            {day}
                          </span>
                        );
                      }}
                    />
                  </div>

                  <div className="bsc-details">
                    {!activeDateKey ? (
                      <div className="bsc-details-empty">
                        निळ्या रंगातील तारखांवर बुकिंग आहे — तारीख निवडा
                        <br />
                        Blue dates have bookings — hover or click a date
                      </div>
                    ) : (
                      <>
                        <p className="bsc-details-date">{toDisplayDate(activeDateKey)}</p>
                        {activeBookings.length === 0 ? (
                          <div className="bsc-details-empty">या तारखेला बुकिंग नाही / No bookings on this date</div>
                        ) : (
                          <ul className="bsc-booking-list">
                            {activeBookings.map((b, i) => (
                              <li key={b._id || b.id || i} className="bsc-booking-item">
                                <div className="bsc-booking-name">{b.name || "—"}</div>
                                <div className="bsc-booking-purpose">
                                  {b.purpose || "—"}
                                  {b.subPurpose ? ` (${b.subPurpose})` : ""}
                                </div>
                                {b.phone && <div className="bsc-booking-phone">📞 {b.phone}</div>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
