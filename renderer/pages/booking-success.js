import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import apiRequest from "../services/api";
import { useReceiptPipelineStatus } from "../context/ReceiptPipelineContext";

export default function BookingSuccess() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [receiptId, setReceiptId] = useState("Loading...");
  const rawId = router.query.id;

  // The receipt PDF generation / shortening / SMS pipeline itself runs at
  // the app level (see _app.js and useReceiptPdfPipeline) — as soon as the
  // booking is confirmed, independent of whether staff stays on this page
  // long enough or clicks through to receipt-print. This just reads its
  // live status for display, off the same resolved-booking instance (avoids
  // polling /booking_by_order_id a second time in parallel).
  const { booking: resolvedBooking, receiptUrl, smsStatus, isGenerating, receiptTimedOut } = useReceiptPipelineStatus();

  const resolvedBookingId = String(resolvedBooking?.bookingId || "");
  const isConfirmedBooking = !!resolvedBookingId && !resolvedBookingId.startsWith("SSMATH-");
  // The booking itself is already done the moment this page loads — the PDF
  // render/upload/SMS pipeline (see useReceiptPdfPipeline) is just follow-up
  // work that can take several seconds (S3 upload in particular). Staff
  // shouldn't be stuck staring at a loading screen for that; show the
  // confirmation immediately and surface pipeline progress as a status line
  // instead of a gate.
  const showPipelineStatus = isConfirmedBooking && !receiptUrl && isGenerating && !receiptTimedOut;

  useEffect(() => {
    if (!rawId) return;

    if (/^(C|BK|IT)-\d{2}-\d+$/.test(rawId)) {
      setReceiptId(rawId);
      return;
    }

    let attempts = 0;
    let cancelled = false;
    const pollStartedAt = Date.now();

    const poll = async () => {
      if (cancelled) return;
      attempts++;
      const elapsedMs = Date.now() - pollStartedAt;
      try {
        // Same endpoint + response shape used by receipt-print.js's poll —
        // this used to call a differently-named "/booking_by_order_id"
        // endpoint that never resolved, so this page always burned through
        // every retry before falling back to the generic message below.
        const data = await apiRequest(`/booking_by_order_id?orderId=${encodeURIComponent(rawId)}`);
        console.log(`[booking-success-poll] orderId=${rawId} attempt=${attempts} elapsedMs=${elapsedMs} found=${data?.found}`);
        if (data?.found && data.booking) {
          console.log(`[booking-success-poll] resolved after elapsedMs=${elapsedMs} (${(elapsedMs / 1000).toFixed(1)}s) attempts=${attempts} orderId=${rawId}`);
          setReceiptId(data.booking.bookingId || data.booking.receiptId || rawId);
          return;
        }
      } catch (e) {
        console.warn(`[booking-success-poll] orderId=${rawId} attempt=${attempts} elapsedMs=${elapsedMs} error: ${e?.message || e}`);
      }

      if (attempts >= 40) { // ~60s at 1.5s interval — webhook confirmation can occasionally lag
        console.log(`[booking-success-poll] gave up after elapsedMs=${elapsedMs} (${(elapsedMs / 1000).toFixed(1)}s) attempts=${attempts} orderId=${rawId}`);
        setReceiptId("Payment received — booking is being finalized, check All Bookings in a moment");
        return;
      }

      setTimeout(poll, 1500);
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [rawId]);

  useEffect(() => {
    const saved = JSON.parse(
      localStorage.getItem("bookingForm") || "{}"
    );

    // If smarnarth is filled → show smarnarth, else show name
    const name = saved.smarnarth?.trim()
      ? saved.smarnarth.trim()
      : saved.name?.trim() || "";

    setDisplayName(name);
  }, []);

  return (
    <div className="dashboard">
      <Sidebar active="new-booking" />

      <div className="main success-page">
        <Header title="Booking Status" />

        <div className="success-card">
          {/* Success Icon */}
          <div className="success-icon">✔</div>

          {/* Title */}
          <h2 className="success-title">
            <span>Booking Confirmed!</span>
            <span>बुकिंग पूर्ण!</span>
          </h2>

          {/* Subtitle */}
          <p className="success-subtitle">
            Your booking has been successfully created.
          </p>

          {/* Name — shows smarnarth if filled, else name */}
          {displayName && (
            <p className="receipt">
              नाव / Name:<br />
              <strong>{displayName}</strong>
            </p>
          )}

          {/* Receipt */}
          <p className="receipt">
            Receipt:<br />
            <strong>{receiptId}</strong>
          </p>

          {/* Receipt pipeline status — non-blocking, updates in place as the
              PDF renders/uploads and (if requested) the SMS sends. */}
          {showPipelineStatus && (
            <p className="success-subtitle">
              पावती तयार होत आहे… / Generating receipt…
            </p>
          )}

          {isConfirmedBooking && receiptTimedOut && !receiptUrl && (
            <p className="success-subtitle">
              ⚠️ Receipt generation is taking longer than usual — you can still print from here.
            </p>
          )}

          {/* SMS status — the receipt PDF/link/SMS pipeline runs at the app
              level (see _app.js) via useReceiptPdfPipeline */}
          {resolvedBooking?.sendSms && smsStatus && (
            <p className="success-subtitle">
              {smsStatus === "sending" && "Sending receipt SMS…"}
              {smsStatus === "sent" && `✅ Receipt SMS sent to ${resolvedBooking.phone}`}
              {smsStatus === "failed" && "⚠️ Receipt SMS failed — you can copy the link from the Print Receipt page"}
            </p>
          )}

          {/* Buttons */}
          <div className="success-actions">
            <button
              className="primary-btn success-print-btn"
              onClick={() => router.push("/receipt-print")}
            >
              पावती प्रिंट / Print Receipt
            </button>

            <div className="success-secondary-row">
              <button
                className="secondary-btn"
                onClick={() => router.push("/new-booking")}
              >
                नवीन बुकिंग / New Booking
              </button>

              <button
                className="secondary-btn"
                onClick={() => router.push("/all-bookings")}
              >
                सर्व पहा / View All
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}