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
const PAGE_SIZE = 5;

/* Purpose filter checkboxes. "All" wins over the others whenever it is
   checked; otherwise the calendar shows the union of the checked purposes. */
const PURPOSE_FILTERS = [
  { key: "sanyukt", label: "संयुक्त महाप्रसाद", match: "संयुक्त महाप्रसाद" },
  { key: "sampurna", label: "संपूर्ण महाप्रसाद", match: "संपूर्ण महाप्रसाद" },
];

const bookingMatchesPurpose = (b, needle) =>
  (b.purpose || "").includes(needle) || (b.subPurpose || "").includes(needle);

// Module-level cache so re-opening the modal in the same session shows data
// instantly instead of re-waiting on the full /Bookings fetch every time.
let bookingsCache = null;

export default function BookedSevaCalendar({ buttonClassName = "secondary-btn" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [bookings, setBookings] = useState(() => bookingsCache || []);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [activeDateKey, setActiveDateKey] = useState(null); // hovered OR clicked date
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filterAll, setFilterAll] = useState(true);
  const [filterChecked, setFilterChecked] = useState({ sanyukt: false, sampurna: false });

  // Switching dates should always start collapsed again — otherwise "Show
  // more" clicked on one busy date would leave every date after it expanded.
  const selectDate = useCallback((key) => {
    setActiveDateKey(key);
    setVisibleCount(PAGE_SIZE);
  }, []);

  const fetchBookings = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setFetchError("");
    }
    try {
      const data = await apiRequest("/Bookings");
      const list = Array.isArray(data) ? data : data.bookings || [];
      const active = list.filter((b) => (b.status || "").toLowerCase() !== "cancelled");
      bookingsCache = active;
      setBookings(active);
    } catch (err) {
      if (!silent) {
        setFetchError(err.message || "Failed to load booked sevas");
        setBookings([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (bookingsCache) {
      // Show the cached list immediately, then quietly refresh in the background.
      setBookings(bookingsCache);
      fetchBookings({ silent: true });
    } else {
      fetchBookings();
    }
  }, [isOpen, fetchBookings]);

  // Reset the selected date whenever the purpose filter changes so the
  // details panel never keeps showing a date that no longer matches.
  useEffect(() => {
    setActiveDateKey(null);
    setVisibleCount(PAGE_SIZE);
  }, [filterAll, filterChecked]);

  const activePurposeKeys = PURPOSE_FILTERS.filter((f) => filterChecked[f.key]).map((f) => f.match);

  /* Purpose-filtered bookings that actually drive the calendar/list. */
  const filteredBookings = useMemo(() => {
    if (filterAll) return bookings;
    if (activePurposeKeys.length === 0) return [];
    return bookings.filter((b) => activePurposeKeys.some((p) => bookingMatchesPurpose(b, p)));
  }, [bookings, filterAll, filterChecked]);

  /* dateKey -> bookings on that date */
  const bookingsByDate = useMemo(() => {
    const map = {};
    filteredBookings.forEach((b) => {
      getBookingDateKeys(b).forEach((key) => {
        if (!map[key]) map[key] = [];
        map[key].push(b);
      });
    });
    return map;
  }, [filteredBookings]);

  const bookedDates = useMemo(
    () => Object.keys(bookingsByDate).map(safeDate).filter(Boolean),
    [bookingsByDate]
  );

  const activeBookings = activeDateKey ? bookingsByDate[activeDateKey] || [] : [];
  const visibleBookings = activeBookings.slice(0, visibleCount);
  const remainingCount = activeBookings.length - visibleBookings.length;

  const handleClose = () => {
    setIsOpen(false);
    setActiveDateKey(null);
    setVisibleCount(PAGE_SIZE);
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
              <div className="bsc-filters">
                <label className="bsc-filter-checkbox">
                  <input
                    type="checkbox"
                    checked={filterAll}
                    onChange={(e) => setFilterAll(e.target.checked)}
                  />
                  सर्व / All
                </label>
                {PURPOSE_FILTERS.map((f) => (
                  <label key={f.key} className="bsc-filter-checkbox">
                    <input
                      type="checkbox"
                      checked={filterChecked[f.key]}
                      onChange={(e) =>
                        setFilterChecked((prev) => ({ ...prev, [f.key]: e.target.checked }))
                      }
                    />
                    {f.label}
                  </label>
                ))}
              </div>

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
                      onChange={(date) => selectDate(date ? toDBDate(date) : null)}
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
                            onMouseEnter={() => count > 0 && selectDate(key)}
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
                          <>
                            <ul className="bsc-booking-list">
                              {visibleBookings.map((b, i) => (
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
                            {remainingCount > 0 && (
                              <button
                                type="button"
                                className="bsc-showmore-btn"
                                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                              >
                                आणखी पहा / Show More ({remainingCount})
                              </button>
                            )}
                          </>
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
