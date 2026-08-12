import { createContext, useContext } from "react";

// The pipeline itself runs once at the app level (see _app.js) so it isn't
// tied to the booking-success page's lifetime. Pages that want to show its
// live status (booking-success.js) read it through this context instead of
// calling the hook themselves.
export const ReceiptPipelineContext = createContext({
  booking: null,
  receiptUrl: "",
  shortReceiptUrl: "",
  smsStatus: "",
  isGenerating: false,
  receiptTimedOut: false,
});

export function useReceiptPipelineStatus() {
  return useContext(ReceiptPipelineContext);
}
