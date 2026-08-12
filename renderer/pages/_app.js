// ===== GLOBAL BASE (RESET + BODY STYLES) =====
import "../styles/globals.css";

// ===== CORE LAYOUT (Sidebar + Header) =====
import "../styles/layout.css";

// ===== SHARED UI (Reusable everywhere) =====
import "../styles/forms.css";
import "../styles/dropdown.css";

// ===== AUTH =====
import "../styles/auth.css";

// ===== PAGE STYLES =====
import "../styles/dashboard.css";
import "../styles/new-booking.css";
import "../styles/internal-receipt.css";
import "../styles/tax-receipt.css";
import "../styles/allBookings.css";
import "../styles/tomorrowSchedule.css";
import "../styles/reports.css";
import "../styles/edit.css";
import "../styles/success.css";
import "../styles/print.css";
import "../styles/dashboard-details.css";
import "../styles/add-seva.css";

import { useResolvedBooking } from "../hooks/useResolvedBooking";
import { useReceiptPdfPipeline } from "../hooks/useReceiptPdfPipeline";
import { ReceiptPipelineContext } from "../context/ReceiptPipelineContext";

export default function App({ Component, pageProps }) {
  // Runs here (not on booking-success.js) so navigating away right after a
  // booking doesn't unmount the "message" listener before the hidden iframe
  // finishes rendering the PDF — this component stays mounted for the whole
  // app session, only the page inside it changes.
  const resolvedBooking = useResolvedBooking();
  const { receiptUrl, shortReceiptUrl, smsStatus, isGenerating, receiptTimedOut } =
    useReceiptPdfPipeline(resolvedBooking);

  // The PDF generator iframe used to be a single instance mounted here
  // permanently from app startup, and every booking had to wait for it to
  // finish loading — in practice that load was observed silently stalling
  // for 50+ seconds (or indefinitely) with no visible cause, dropping the
  // upload/SMS pipeline until the page was manually refreshed. It's now
  // created fresh on demand inside useReceiptPdfPipeline right when a
  // booking needs one, so there's no long-lived idle iframe to get stuck.
  return (
    <ReceiptPipelineContext.Provider value={{ booking: resolvedBooking, receiptUrl, shortReceiptUrl, smsStatus, isGenerating, receiptTimedOut }}>
      <Component {...pageProps} />
    </ReceiptPipelineContext.Provider>
  );
}
