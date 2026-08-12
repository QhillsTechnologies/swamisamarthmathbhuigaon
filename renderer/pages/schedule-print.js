import { useEffect, useState } from "react";
import apiRequest from "../services/api";

export default function SchedulePrint() {
  const [bookings, setBookings] = useState([]);

  const getTomorrow = () => {
    const today = new Date();
    today.setDate(today.getDate() + 1);

    return today.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  useEffect(() => {
    apiRequest("/Bookings_tomorrow")
      .then((data) => setBookings(Array.isArray(data) ? data : data.bookings || []))
      .catch((err) => console.error("Tomorrow schedule (print) error:", err));
  }, []);

  return (
    <div className="print-page">

      <h2>उद्याचे वेळापत्रक / Tomorrow Schedule</h2>
      <p>{getTomorrow()}</p>

      <div className="print-table">
        {bookings.length === 0 ? (
          <p>No bookings</p>
        ) : (
          bookings.map((b, i) => (
            <div key={i} className="print-row">
              <span>{b.name}</span>
              <span>{b.purpose}</span>
              <span>₹{b.amount}</span>
              <span>{b.time || "-"}</span>
            </div>
          ))
        )}
      </div>

      {/* PRINT BUTTON */}
      <button
        className="primary-btn"
        onClick={() => window.print()}
      >
        Print Now
      </button>

    </div>
  );
}