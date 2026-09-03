import { useEffect, useRef, useState } from "react";
import apiRequest from "../services/api";
import { sendReceiptSms } from "../services/sms";

// The SMS gateway's DLT-approved template has this fixed as its static text
// around the {#urg#} variable (".../?{#urg#}"), so only the bare ShortLinks
// code — never a full URL — can go into that variable without the message
// getting rejected for not matching the approved template.
const SHORT_LINK_BASE = "https://www.swamisamarthmathbhuigaon.com/?";

// Runs once per confirmed booking: renders the hidden receipt-pdf-template.html
// iframe, uploads the resulting PDF, shortens the link, saves both URLs onto
// the booking record, and sends the SMS if requested. Mounted on the
// booking-success page so it fires right after booking + payment are
// confirmed — not gated behind staff clicking through to receipt-print.
// How long to wait for the iframe -> upload -> save round trip before giving
// up on "generating" and letting the UI move on anyway (e.g. if html2canvas/
// jsPDF fail to load, or the upload backend is unreachable) — otherwise a
// silent failure here would leave the booking-success page's loading gate
// stuck forever with no way for staff to proceed.
const RECEIPT_GENERATION_TIMEOUT_MS = 20000;

export function useReceiptPdfPipeline(booking) {
  const [receiptUrl, setReceiptUrl] = useState("");
  const [shortReceiptUrl, setShortReceiptUrl] = useState("");
  const [smsStatus, setSmsStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [receiptTimedOut, setReceiptTimedOut] = useState(false);
  const generationTimeoutRef = useRef(null);
  // The generator iframe used to sit permanently mounted in _app.js from app
  // startup, waiting for onLoad before it could be used. In practice that
  // left it sitting idle, off-screen, for however long until the first
  // booking — and it was regularly observed never firing onLoad at all for
  // 50+ seconds (or ever) until the page was manually refreshed, silently
  // dropping the PDF/upload/SMS pipeline. Creating a fresh iframe on demand,
  // right when a booking actually needs one, means there's no stale/idle
  // iframe state to get stuck in — just this one load, used immediately.
  const activeIframeRef = useRef(null);
  const bookingRef = useRef(null);
  // Tracks which bookingId the PDF generation was last kicked off for. This
  // hook now lives at the app level (see _app.js) so it survives navigation
  // between pages instead of remounting per booking — a plain boolean would
  // permanently latch true after the first booking and silently block every
  // booking made afterward in the same app session.
  const triggeredForRef = useRef("");
  // bookingId -> Date.now() when the trigger fired, so every later log line
  // can report elapsed time without threading a timestamp through the
  // postMessage round trip to the iframe and back.
  const triggerTimesRef = useRef({});

  useEffect(() => {
    bookingRef.current = booking;
  }, [booking]);

  // Receive the generated PDF (data URI) from the hidden iframe, then upload,
  // shorten, persist, and text it out.
  useEffect(() => {
    const handler = async (event) => {
      if (!event.data || !event.data.pdf) return;
      const currentBooking = bookingRef.current;
      const bookingId = String(currentBooking?.bookingId || "");
      if (!bookingId) return;

      const t0 = triggerTimesRef.current[bookingId] ?? Date.now();
      const since = () => `${Date.now() - t0}ms since trigger`;
      console.log(`[receiptPipeline] PDF ready from iframe, uploading for bookingId: ${bookingId} (${since()})`);

      let uploadedUrl = "";
      let shortCode = "";
      let shortUrl = "";
      try {
        const base64Pdf = event.data.pdf.split(",")[1] || "";
        // The Wix backend generates + stores the ShortLinks code itself
        // (see shortenUrl.web.js) and returns it alongside the PDF URL, so
        // there's no separate client-side shorten call/round trip anymore.
        const uploadResponse = await apiRequest("/upload_receipt", {
          method: "POST",
          body: JSON.stringify({ base64Pdf, bookingId }),
        });
        console.log(`[receiptPipeline] /upload_receipt response (${since()}):`, uploadResponse);
        uploadedUrl = uploadResponse?.url || "";
        shortCode = uploadResponse?.shortCode || "";
        setReceiptUrl(uploadedUrl);

        if (uploadedUrl) {
          shortUrl = shortCode ? `${SHORT_LINK_BASE}${shortCode}` : "";
          setShortReceiptUrl(shortUrl);
          if (!shortCode) {
            console.warn("[receiptPipeline] upload_receipt did not return a shortCode — SMS link will be blank. Has the Wix upload_receipt function been updated to call shortenUrl?");
          }

          try {
            // recordId (Wix Data's internal _id) lets the backend do a direct
            // primary-key lookup instead of a bookingId query — see
            // save_receipt_urls.web.js, which otherwise occasionally returned
            // "Booking not found" for a booking created moments earlier.
            const saveResponse = await apiRequest("/save_receipt_urls", {
              method: "POST",
              body: JSON.stringify({ bookingId, recordId: currentBooking?._id, receiptUrl: uploadedUrl, shortReceiptUrl: shortUrl }),
            });
            console.log(`[receiptPipeline] /save_receipt_urls response (${since()}):`, saveResponse);
          } catch (saveErr) {
            // console.warn, not console.error — this is a handled, non-fatal
            // failure (SMS still sends; only the DB-saved receipt URL is
            // missing) and Next's dev overlay promotes any console.error(Error)
            // to a full-screen crash, which is misleading for something the
            // app already recovered from.
            console.warn(`[receiptPipeline] Save receipt URLs error (${since()}): ${saveErr?.message || saveErr}`);
          }
        }
      } catch (err) {
        console.warn(`[receiptPipeline] Receipt upload error (${since()}): ${err?.message || err}`);
      }

      if (currentBooking?.sendSms && currentBooking?.phone) {
        try {
          setSmsStatus("sending");
          console.log(`[receiptPipeline] sending SMS (${since()})`);
          const amount = currentBooking.paidAmount ?? currentBooking.advance ?? currentBooking.amount ?? 0;
          // The live SMS template's fixed text already ends in ".../receipts/"
          // (see send_receipt_sms.web.js) — it just needs the uploaded PDF's
          // filename appended, not the ShortLinks code.
          const fileName = uploadedUrl ? uploadedUrl.split("/").pop() : "";
          await sendReceiptSms({ phone: currentBooking.phone, name: currentBooking.name, amount, fileName });
          setSmsStatus("sent");
          console.log(`[receiptPipeline] SMS sent (${since()}) — total pipeline time from trigger to SMS sent`);
        } catch (smsErr) {
          console.error(`[receiptPipeline] Receipt SMS error (${since()}):`, smsErr);
          setSmsStatus("failed");
        }
      } else {
        console.log(`[receiptPipeline] SMS skipped (${since()}) — sendSms=${!!currentBooking?.sendSms} phone=${currentBooking?.phone || "(none)"}`);
      }
      delete triggerTimesRef.current[bookingId];
      clearTimeout(generationTimeoutRef.current);
      setIsGenerating(false);
      activeIframeRef.current?.remove();
      activeIframeRef.current = null;
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Once the real booking (BK-/IT-/C- id, not the temporary "SSMATH-" order id)
  // is resolved, spin up a fresh off-screen iframe and ask it to render +
  // generate the PDF as soon as it loads.
  useEffect(() => {
    const bookingId = String(booking?.bookingId || "");
    if (!bookingId) {
      console.log("[receiptPipeline] trigger effect ran but no bookingId yet (booking not resolved)");
      return;
    }
    if (bookingId.startsWith("SSMATH-")) {
      console.log(`[receiptPipeline] trigger effect ran for ${bookingId} but it's still the online-payment placeholder — waiting for webhook confirmation to resolve the real bookingId`);
      return;
    }
    if (triggeredForRef.current === bookingId) return;
    triggeredForRef.current = bookingId;
    triggerTimesRef.current[bookingId] = Date.now();
    console.log("[receiptPipeline] triggering PDF generation for bookingId:", bookingId);
    // Clear the previous booking's status so a page reading this hook's
    // state (e.g. booking-success.js) doesn't briefly show stale "sent"/
    // "failed" text for the new booking before its own PDF comes back.
    setReceiptUrl("");
    setShortReceiptUrl("");
    setSmsStatus("");
    setIsGenerating(true);
    setReceiptTimedOut(false);
    clearTimeout(generationTimeoutRef.current);
    generationTimeoutRef.current = setTimeout(() => {
      console.warn(`[receiptPipeline] receipt generation timed out for bookingId: ${bookingId} — html2canvas/jsPDF may have failed to load, or the upload backend is unreachable`);
      setReceiptTimedOut(true);
      setIsGenerating(false);
      activeIframeRef.current?.remove();
      activeIframeRef.current = null;
    }, RECEIPT_GENERATION_TIMEOUT_MS);

    activeIframeRef.current?.remove();
    const iframe = document.createElement("iframe");
    iframe.title = "Receipt PDF generator";
    iframe.width = "1728";
    iframe.height = "1230";
    Object.assign(iframe.style, {
      position: "fixed",
      top: "-10000px",
      left: "-10000px",
      border: "none",
    });
    iframe.onload = () => {
      console.log(`[receiptPipeline] on-demand PDF iframe loaded for bookingId: ${bookingId}, posting data`);
      iframe.contentWindow?.postMessage(
        {
          bookingId: booking.bookingId,
          bookingDate: booking.bookingDate,
          multiDates: booking.multiDates || [],
          _createdDate: booking.createdAt || booking._createdDate || "",
          name: booking.name,
          smarnarth: booking.smarnarth,
          address: booking.address,
          phone: booking.phone,
          purpose: booking.purpose,
          gotra: booking.gotra,
          amount: booking.paidAmount ?? booking.advance ?? booking.amount ?? 0,
          paymentMethod: booking.bank || booking.paymentType || "",
          chequeNumber: booking.chequeNumber || "",
          payingBankName: booking.payingBankName || "",
          panCard: booking.is80G ? (booking.panCard || "") : "",
          remainingAmount: Number(booking.remainingAmount || 0),
        },
        "*"
      );
    };
    activeIframeRef.current = iframe;
    document.body.appendChild(iframe);
    iframe.src = "/receipt-pdf-template.html";
  }, [booking]);

  useEffect(() => {
    return () => {
      clearTimeout(generationTimeoutRef.current);
      activeIframeRef.current?.remove();
    };
  }, []);

  return {
    receiptUrl,
    shortReceiptUrl,
    smsStatus,
    isGenerating,
    receiptTimedOut,
  };
}
