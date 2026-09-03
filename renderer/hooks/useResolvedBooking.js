import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import apiRequest from "../services/api";

// Reads the booking the app just created/paid for out of localStorage. Online
// payments store the Cashfree orderId (e.g. "SSMATH-...") as bookingId until
// the webhook confirms and generates the real BK-/IT-/C- id, so this polls
// until the real booking record is available.
//
// Re-reads on every route change (not just on mount): this hook is now also
// called once at the app level (see _app.js), which never remounts between
// bookings, so without this a second booking made in the same session would
// never be picked up.
export function useResolvedBooking() {
  const [booking, setBooking] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem("lastBooking");
    console.log(`[resolve-booking] asPath=${router.asPath} at ${Date.now()} — lastBooking in localStorage:`, saved ? JSON.parse(saved).bookingId : "(none)");
    if (!saved) return;

    const parsed = JSON.parse(saved);
    setBooking(parsed);

    const isOrderId = String(parsed.bookingId || "").startsWith("SSMATH-");
    if (!isOrderId) return;

    let attempts = 0;
    const maxAttempts = 40; // ~60s at 1.5s interval — webhook confirmation can occasionally lag
    let cancelled = false;
    const pollStartedAt = Date.now();

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      const elapsedMs = Date.now() - pollStartedAt;
      try {
        const res = await apiRequest(`/booking_by_order_id?orderId=${encodeURIComponent(parsed.bookingId)}`);
        console.log(`[resolve-booking-poll] orderId=${parsed.bookingId} attempt=${attempts} elapsedMs=${elapsedMs} found=${res?.found}`);
        if (res?.found && res.booking) {
          console.log(`[resolve-booking-poll] resolved after elapsedMs=${elapsedMs} (${(elapsedMs / 1000).toFixed(1)}s) attempts=${attempts} orderId=${parsed.bookingId}`);
          console.log(`[resolve-booking-poll] booking data:`, JSON.stringify(res.booking));
          const resolved = { ...res.booking, sendSms: parsed.sendSms };
          setBooking(resolved);
          // Persist the real booking so revisiting this page (back button, remount)
          // recognizes it's already resolved instead of re-polling from scratch
          // against the stale "SSMATH-" placeholder every time.
          localStorage.setItem("lastBooking", JSON.stringify(resolved));
          return;
        }
      } catch (err) {
        console.warn(`[resolve-booking-poll] orderId=${parsed.bookingId} attempt=${attempts} elapsedMs=${elapsedMs} error: ${err?.message || err}`);
      }
      if (attempts < maxAttempts) {
        setTimeout(poll, 1500);
      } else {
        console.log(`[resolve-booking-poll] gave up after elapsedMs=${elapsedMs} (${(elapsedMs / 1000).toFixed(1)}s) attempts=${attempts} orderId=${parsed.bookingId}`);
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [router.asPath]);

  return booking;
}
