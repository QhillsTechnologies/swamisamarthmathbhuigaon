import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import apiRequest from "../services/api";
import { useResolvedBooking } from "../hooks/useResolvedBooking";
import Receipt80G from "../components/Receipt80G";

// ── Field Row component ───────────────────────────────────────────────────
function Field({ label, value, highlight }) {
  if (!value) return null;
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "3px",
    }}>
      <span style={{
        fontSize: "10px",
        fontWeight: 700,
        color: "#a07850",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}>{label}</span>
      <span style={{
        fontSize: highlight ? "16px" : "14px",
        fontWeight: highlight ? 800 : 500,
        color: highlight ? "#c2410c" : "#1c0f00",
        fontFamily: "inherit",
      }}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ReceiptPrint() {
  const router = useRouter();
  const booking = useResolvedBooking();
  const [receiptUrl, setReceiptUrl] = useState("");
  const [shortReceiptUrl, setShortReceiptUrl] = useState("");
  const [iframeReady, setIframeReady] = useState(false);
  const sentToIframeRef = useRef(false);
  const iframeRef = useRef(null);

  // The PDF/short-link/SMS pipeline actually runs on the booking-success page
  // (see useReceiptPdfPipeline) as soon as the booking is confirmed — before
  // staff even gets here. This just polls the booking record for those two
  // fields once that background work finishes writing them.
  useEffect(() => {
    const bookingId = String(booking?.bookingId || "");
    const recordId = booking?._id;
    if (!bookingId || bookingId.startsWith("SSMATH-") || !recordId) return;
    if (booking.receiptUrl) {
      setReceiptUrl(booking.receiptUrl);
      setShortReceiptUrl(booking.shortReceiptUrl || "");
      return;
    }

    let attempts = 0;
    const maxAttempts = 10;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const data = await apiRequest(`/booking_by_id?id=${recordId}`);
        const latest = data.booking || data;
        if (latest?.receiptUrl) {
          setReceiptUrl(latest.receiptUrl);
          setShortReceiptUrl(latest.shortReceiptUrl || "");
          return;
        }
      } catch (err) {
        console.error("Poll receipt URLs error:", err);
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        setTimeout(poll, 1500);
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [booking?.bookingId, booking?._id]);

  // The template posts {type:"iframeReady"} to (window.opener || window.parent) —
  // since it's embedded here as an <iframe>, window.parent correctly targets this page.
  useEffect(() => {
    const handler = (event) => {
      if (event.data && event.data.type === "iframeReady") {
        setIframeReady(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Send the booking to the iframe once BOTH the confirmed booking (not the
  // temporary "SSMATH-" placeholder used while an online payment is still being
  // confirmed) and the iframe are ready. Shows the print format directly on this
  // page — no separate popup window.
  useEffect(() => {
    if (!booking) return;
    if (String(booking.bookingId || "").startsWith("SSMATH-")) return;
    if (!iframeReady) return;
    if (sentToIframeRef.current) return;
    sentToIframeRef.current = true;

    if (is80G) return; // 80G bookings render Receipt80G inline, no iframe to message

    const item = {
      bookingId:       receiptNo,
      _createdDate:    booking.createdAt || booking._createdDate || "",
      bookingDate:     booking.bookingDate || "",
      multiDates:      booking.multiDates || [],
      name,
      phone,
      address,
      purpose,
      gotra,
      amount:          paidAmt,
      advance:         paidAmt,
      bank:            paymentMode,
      smarnarth,
      remainingAmount: remaining,
      orderId,
      chequeNumber:    chequeNo,
      payingBankName,
    };

    iframeRef.current?.contentWindow?.postMessage(
      { action: "showReceipts", items: [item] },
      "*"
    );
  }, [booking, iframeReady]);

  const handlePrint = () => {
    if (is80G) {
      window.print();
    } else {
      iframeRef.current?.contentWindow?.print();
    }
  };

  if (!booking) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#fdf8f3", fontFamily: "Arial, sans-serif",
      }}>
        <div style={{ marginBottom: "16px" }}></div>
        <p style={{ color: "#a07850", fontSize: "15px", marginBottom: "20px" }}>No receipt data found.</p>
        <button
          onClick={() => router.back()}
          style={{
            background: "#5c1a00", color: "#fff", border: "none",
            padding: "10px 24px", borderRadius: "8px", cursor: "pointer", fontSize: "14px",
          }}
        >← Back</button>
      </div>
    );
  }

  // ── Field mapping ─────────────────────────────────────────────────────────
  const receiptNo    = booking.bookingId || booking.receiptId || "";
  const name         = booking.name || "";
  const phone        = booking.phone || "";
  const address      = booking.address || "";
  const purpose      = booking.purpose || "";
  const gotra        = booking.gotra || "";
  const paymentMode  = booking.bank || booking.paymentType || "";
  const chequeNo     = booking.chequeNumber || "";
  const payingBankName = booking.payingBankName || "";
  const paidAmt      = booking.paidAmount ?? booking.advance ?? booking.amount ?? 0;
  const remaining    = Number(booking.remainingAmount || 0);
  const smarnarth    = booking.smarnarth || "";
  const orderId      = booking.orderId || booking._id || "";
  const is80G        = !!booking.is80G;
  const panCard      = booking.panCard || "";
  const isPendingConfirmation = String(booking.bookingId || "").startsWith("SSMATH-");

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: "Segoe UI", Arial, sans-serif;
          background: #fdf6ee;
          min-height: 100vh;
        }

        /* ── TOP NAVBAR ── */
        .rp-nav {
          background: #3d1400;
          padding: 0 24px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 2px 12px rgba(0,0,0,0.2);
        }

        .rp-nav-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .rp-nav-logo {
          font-size: 20px;
        }

        .rp-nav-title {
          font-size: 14px;
          font-weight: 700;
          color: #ffe4b5;
          letter-spacing: 0.3px;
        }

        .rp-nav-sub {
          font-size: 11px;
          color: #c49a6c;
          font-weight: 400;
        }

        .rp-nav-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .rp-btn-back {
          background: transparent;
          color: #ffe4b5;
          border: 1px solid rgba(255,228,181,0.3);
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s;
        }

        .rp-btn-back:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,228,181,0.6);
        }

        .rp-btn-print {
          background: #f97316;
          color: #fff;
          border: none;
          padding: 8px 20px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          display: flex;
          align-items: center;
          gap: 7px;
          box-shadow: 0 2px 8px rgba(249,115,22,0.4);
          transition: all 0.2s;
        }

        .rp-btn-print:hover {
          background: #ea580c;
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(249,115,22,0.4);
        }

        /* ── PAGE BODY ── */
        .rp-page {
          max-width: 700px;
          margin: 24px auto;
          padding: 0 20px 40px;
        }

        .rp-page-wide {
          max-width: 900px;
        }

        /* ── EMBEDDED PRINT-FORMAT PREVIEW — same template used for bulk printing ── */
        .rp-iframe {
          display: block;
          width: 100%;
          aspect-ratio: 21 / 14.8;
          border: 1px solid #e5d5c0;
          border-radius: 8px;
          background: #fff;
          margin-top: 10px;
        }

        /* ── PLAIN VALUE LIST — no receipt design, the design is already printed on paper ── */
        .rp-plain-row {
          padding: 6px 0;
          border-bottom: 1px solid #eee;
          font-size: 14px;
          color: #222;
        }

        .rp-plain-row strong {
          display: inline-block;
          min-width: 220px;
          color: #555;
        }

        /* ── PRINT NOTICE ── */
        .rp-print-notice {
          margin-top: 20px;
          text-align: center;
          color: #a07850;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        /* ── 80G path: Receipt80G renders full-size inline (not in an iframe),
           so printing the page must hide everything except the receipt itself. ── */
        @media print {
          .rp-no-print { display: none !important; }

          /* 80G path: the printed pavati must sit flush at the page's top-left
             corner, exactly as it does in the Reports bulk-reprint flow
             (receipt-bulk-80g.js), which has no such wrapper around Receipt80G. */
          .rp-page, .rp-page-wide {
            max-width: none;
            margin: 0;
            padding: 0;
          }
        }

      `}</style>

      {/* ── TOP NAV ── */}
      <div className="rp-nav rp-no-print">
        <div className="rp-nav-left">
          <span className="rp-nav-logo"></span>
          <div>
            <div className="rp-nav-title">श्री स्वामी समर्थ सेवा परिवार</div>
            <div className="rp-nav-sub">Receipt Preview — पावती पूर्वावलोकन</div>
          </div>
        </div>
        <div className="rp-nav-actions">
          <button className="rp-btn-back" onClick={() => router.back()}>← Back</button>
          <button
            className="rp-btn-print"
            onClick={handlePrint}
            disabled={isPendingConfirmation}
            title={isPendingConfirmation ? "Waiting for payment confirmation…" : ""}
          >
            Print Receipt
          </button>
        </div>
      </div>

      {/* ── PAGE BODY ── */}
      <div className="rp-page rp-page-wide">

        {receiptUrl && (
          <div className="rp-plain-row rp-no-print"><strong>Receipt PDF:</strong> {receiptUrl}</div>
        )}
        {shortReceiptUrl && (
          <div className="rp-plain-row rp-no-print">
            <strong>Receipt SMS link:</strong> {shortReceiptUrl} ({shortReceiptUrl.length} chars — this is what goes in the SMS)
          </div>
        )}

        {is80G ? (
          isPendingConfirmation ? (
            // Real BK-/IT- booking id not confirmed yet — printing now would put
            // the temporary Cashfree order id in the booking-id slot on the pavati.
            <div className="rp-plain-row">
              Waiting for payment confirmation before this can be printed…
            </div>
          ) : (
            // New 80G format — pre-printed 80G pavati paper, see Receipt80G.
            <Receipt80G
              items={[{
                bookingId: receiptNo,
                _createdDate: booking.createdAt || booking._createdDate || "",
                bookingDate: booking.bookingDate || "",
                multiDates: booking.multiDates || [],
                name, phone, address, purpose, gotra,
                advance: paidAmt,
                bank: paymentMode,
                smarnarth,
                orderId,
                chequeNumber: chequeNo,
                payingBankName,
                panCard,
              }]}
            />
          )
        ) : (
          // Old format — unchanged, same shared template used for bulk printing in Reports
          <iframe
            ref={iframeRef}
            src="/receipt-template.html"
            title="Receipt preview"
            className="rp-iframe"
          />
        )}

        <div className="rp-print-notice rp-no-print">
          Click "Print Receipt" above to print this pavti (21cm × 14.8cm)
        </div>

      </div>
    </>
  );
}