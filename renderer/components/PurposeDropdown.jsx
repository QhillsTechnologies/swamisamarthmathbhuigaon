import { useState, useEffect, useCallback } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import apiRequest from "../services/api";

/* ==========================================
   CONSTANTS
========================================== */
const ABHISHEK_GOTRAS = [
  "विश्र्वमित्र", "जमदग्नी", "भारद्वाज", "गौतम",
  "अत्रि", "वसिष्ठ", "कश्यप", "अगस्ती", "Other",
];

/* ==========================================
   SAFE DATE HELPER
========================================== */
const safeDate = (d) => {
  if (!d) return null;
  const str = typeof d === "string" ? d.split("T")[0].trim() : null;
  if (str && /^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, day] = str.split("-").map(Number);
    const date = new Date(y, m - 1, day);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
};

export default function PurposeDropdown() {
  /* ── Core state ── */
  const [eventType, setEventType] = useState("");
  const [sevaList, setSevaList] = useState([]);
  const [sevaLoading, setSevaLoading] = useState(true);
  const [allBookings, setAllBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);

  /* ── Selected seva ── */
  const [selectedSeva, setSelectedSeva] = useState(null);
  const [selectedSevaId, setSelectedSevaId] = useState("");

  /* ── Amount ── */
  const [amount, setAmount] = useState("");
  const [baseAmount, setBaseAmount] = useState(0);

  /* ── Sub-purpose ── */
  const [selectedSubPurpose, setSelectedSubPurpose] = useState("");
  const [pricePerDate, setPricePerDate] = useState("");

  /* ── Gotra ── */
  const [gotra, setGotra] = useState("");
  const [gotraCustom, setGotraCustom] = useState("");

  /* ── Payment ── */
  const [paymentType, setPaymentType] = useState("");
  const [payNowAmount, setPayNowAmount] = useState("");
  const [advance, setAdvance] = useState(0);

  /* ── Dates ── */
  const [bookingDate, setBookingDate] = useState(null);
  const [multiDates, setMultiDates] = useState([]);

  /* ── Special events ── */
  const [selectedSpecialSeva, setSelectedSpecialSeva] = useState(null);
  const [selectedSpecialSubPurpose, setSelectedSpecialSubPurpose] = useState("");

  /* ==========================================
     HELPERS
  ========================================== */
  const getBookingForm = useCallback(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("bookingForm") || "{}"); }
    catch { return {}; }
  }, []);

  const saveToLocalStorage = useCallback((overrides = {}) => {
    const existing = getBookingForm();
    const updated = { ...existing, ...overrides };
    const totalAmount = Number(updated.amount ?? updated.baseAmount ?? 0);
    const paidAmount = Number(updated.advance ?? 0);
    const remaining = Math.max(totalAmount - paidAmount, 0);
    updated.remainingAmount = remaining;
    updated.status = remaining === 0 ? "Approved" : "Pending";
    localStorage.setItem("bookingForm", JSON.stringify(updated));
  }, [getBookingForm]);

  const toDBDate = (date) => {
    if (!date) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const toDisplayDate = (date) => {
    if (!date) return "";
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
  };

  /* ==========================================
     FETCH DATA
  ========================================== */
  const getLocalSevaFlags = () => {
    try { return JSON.parse(localStorage.getItem("sevaLocalFlags") || "{}"); }
    catch { return {}; }
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await apiRequest("/get_seva_list");
      const list = res.sevaList || res.data || res || [];
      const rawList = Array.isArray(list) ? list : [];
      const localFlags = getLocalSevaFlags();
      const merged = rawList.map((s) => {
        const key = `${s.eventType}::${(s.displayName || "").trim()}`;
        return localFlags[key] ? { ...s, ...localFlags[key] } : s;
      });
      setSevaList(merged);
    } catch {
      setSevaList([]);
    } finally {
      setSevaLoading(false);
    }

    try {
      setBookingsLoading(true);
      const data = await apiRequest("/Bookings");
      const list = Array.isArray(data) ? data : data.bookings || [];
      setAllBookings(list);
    } catch {
      setAllBookings([]);
    } finally {
      setBookingsLoading(false);
    }
  }, []);

  /* ==========================================
     INIT
  ========================================== */
  useEffect(() => {
    const init = async () => {
      const saved = getBookingForm();
      if (saved._id || saved.id || saved.bookingId) setIsEditMode(true);
      if (saved.eventType) setEventType(saved.eventType);
      if (saved.selectedSevaId) setSelectedSevaId(saved.selectedSevaId);
      if (saved.amount !== undefined) setAmount(String(saved.amount));
      if (saved.bookingDate) { const d = safeDate(saved.bookingDate); if (d) setBookingDate(d); }
      if (saved.advance !== undefined) setAdvance(Number(saved.advance ?? 0));
      if (saved.paymentType) setPaymentType(saved.paymentType);
      if (saved.selectedSubPurpose) setSelectedSubPurpose(saved.selectedSubPurpose);
      if (saved.selectedSpecialSubPurpose) setSelectedSpecialSubPurpose(saved.selectedSpecialSubPurpose);
      if (saved.gotra) setGotra(saved.gotra);
      if (saved.pricePerDate) setPricePerDate(saved.pricePerDate);
      if (saved.multiDates) {
        setMultiDates(saved.multiDates.map((d) => safeDate(d)).filter(Boolean));
      }
      if (saved.advance !== undefined && saved.originalAdvance === undefined) {
        saveToLocalStorage({ originalAdvance: Number(saved.advance ?? 0) });
      }
      await fetchData();
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ==========================================
     RESTORE selectedSeva after sevaList loads
  ========================================== */
  useEffect(() => {
    if (sevaList.length > 0 && selectedSevaId) {
      const found = sevaList.find((s) => (s._id || s.id) === selectedSevaId);
      if (found) setSelectedSeva(found);
    }
  }, [sevaList, selectedSevaId]);

  /* ==========================================
     DERIVED VALUES
  ========================================== */
  const savedData = getBookingForm();
  const originalAdvance = Number(savedData.originalAdvance ?? savedData.advance ?? 0);
  const previousPaidAmount = isEditMode ? originalAdvance : 0;
  const remainingAmount = Math.max(baseAmount - Number(savedData.advance ?? 0), 0);
  const currentRemainingAmount = Math.max(baseAmount - previousPaidAmount, 0);

  const specialSevas = sevaList.filter((s) => s.eventType === "special" && s.isActive !== false);
  const regularSevas = sevaList.filter((s) => s.eventType === "regular" && s.isActive !== false);

  const multiDateTotal = pricePerDate && multiDates.length
    ? Number(pricePerDate) * multiDates.length
    : 0;

  /* ==========================================
     ACTIVE BOOKINGS FOR DATE
  ========================================== */
  const getActiveBookingsForDate = useCallback((dateKey) =>
    allBookings.filter((b) => {
      if ((b.status || "").toLowerCase() === "cancelled") return false;
      const bDate = (b.bookingDate || b.date || "").split("T")[0].trim();
      return bDate === dateKey;
    }),
    [allBookings]
  );

  /* ==========================================
     DATE SELECTABLE — Regular Sevas
  ========================================== */
  const isDateSelectable = useCallback((date) => {
    if (!date) return false;
    if (!selectedSeva) {
      const selected = new Date(date);
      selected.setHours(0, 0, 0, 0);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return selected >= today;
    }

    const selected = new Date(date);
    selected.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (selected < today) return false;

    const dateRule = selectedSeva.dateRule || "any";
    const dateKey = toDBDate(selected);
    const dayOfWeek = selected.getDay();

    if (selectedSeva?.blockOnSpecialDates) {
      const allSpecialDates = specialSevas.flatMap((s) =>
        (s.specificDates || s.dates || []).map((d) =>
          typeof d === "string" ? d.split("T")[0].trim() : toDBDate(d)
        )
      );
      if (allSpecialDates.includes(dateKey)) return false;
    }

    if (dateRule === "thursday" && dayOfWeek !== 4) return false;
    if (dateRule === "sun_thu" && dayOfWeek !== 0 && dayOfWeek !== 4) return false;
    if (dateRule === "specific") {
      const allowed = (selectedSeva.specificDates || []).map((d) =>
        typeof d === "string" ? d.split("T")[0].trim() : toDBDate(d)
      );
      if (!allowed.includes(dateKey)) return false;
    }

    const maxPerDate = Number(selectedSeva.maxPerDate || 0);
    if (maxPerDate > 0) {
      const activeOnDate = getActiveBookingsForDate(dateKey);
      const sevaName = (selectedSeva.displayName || "").toLowerCase();
      if (sevaName.includes("full bhandara") || sevaName.includes("half bhandara")) {
        const fullCount = activeOnDate.filter((b) => (b.purpose || "").toLowerCase().includes("full bhandara")).length;
        const halfCount = activeOnDate.filter((b) => (b.purpose || "").toLowerCase().includes("half bhandara")).length;
        if (sevaName.includes("full bhandara") && (fullCount >= 1 || halfCount >= 1)) return false;
        if (sevaName.includes("half bhandara") && (fullCount >= 1 || halfCount >= 2)) return false;
        return true;
      }
      const count = activeOnDate.filter((b) => b.purpose === selectedSeva.displayName).length;
      if (count >= maxPerDate) return false;
    }

    return true;
  }, [selectedSeva, specialSevas, getActiveBookingsForDate]);

  /* ==========================================
     DATE SELECTABLE — Special Sevas
  ========================================== */
  const isSpecialDateSelectable = useCallback((date) => {
    if (!date || !selectedSpecialSeva) return false;

    // Need a sub-purpose selected if special seva has sub-purposes
    const activeSeva = selectedSpecialSeva.hasSubPurposes
      ? selectedSpecialSeva.subPurposes?.find((s) => s.name === selectedSpecialSubPurpose)
      : selectedSpecialSeva;
    if (!activeSeva) return false;

    const selected = new Date(date);
    selected.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (selected < today) return false;

    const dateKey = toDBDate(selected);
    const dateRule = selectedSpecialSeva.dateRule || "any";  // ← ADD

    if (dateRule === "any") return true;
    if (dateRule === "thursday" && selected.getDay() !== 4) return false;
    if (dateRule === "sun_thu" && selected.getDay() !== 0 && selected.getDay() !== 4) return false;

    // If day passes above weekday checks, allow it.
    if (dateRule === "thursday" || dateRule === "sun_thu") return true;

    const allowedDates = (selectedSpecialSeva.specificDates || selectedSpecialSeva.dates || [])
      .map((d) => typeof d === "string" ? d.split("T")[0].trim() : toDBDate(d));

    if (!allowedDates.includes(dateKey)) return false;

    const maxPerDate = Number(selectedSpecialSeva.maxPerDate || 0);
    if (maxPerDate > 0) {
      const activeOnDate = getActiveBookingsForDate(dateKey);
      const subName = (activeSeva.name || activeSeva.displayName || "").toLowerCase();
      const fullCount = activeOnDate.filter((b) => (b.purpose || "").toLowerCase().includes("full bhandara")).length;
      const halfCount = activeOnDate.filter((b) => (b.purpose || "").toLowerCase().includes("half bhandara")).length;
      if (subName.includes("full bhandara") && (fullCount >= 1 || halfCount >= 1)) return false;
      if (subName.includes("half bhandara") && (fullCount >= 1 || halfCount >= 2)) return false;
      const count = activeOnDate.filter((b) => b.purpose === (activeSeva.name || activeSeva.displayName)).length;
      if (count >= maxPerDate) return false;
    }

    return true;
  }, [selectedSpecialSeva, selectedSpecialSubPurpose, getActiveBookingsForDate]);

  /* ==========================================
     DATE SELECTABLE — Multi-date
  ========================================== */
  const isMultiDateSelectable = useCallback((date) => {
    if (!date || !selectedSeva) return false;

    const selected = new Date(date);
    selected.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (selected < today) return false;

    const dateKey = toDBDate(selected);

    if (selectedSeva?.blockOnSpecialDates) {
      const allSpecialDates = specialSevas.flatMap((s) =>
        (s.specificDates || s.dates || []).map((d) =>
          typeof d === "string" ? d.split("T")[0].trim() : toDBDate(d)
        )
      );
      if (allSpecialDates.includes(dateKey)) return false;
    }

    if (selectedSubPurpose && selectedSeva.subPurposes) {
      const sub = selectedSeva.subPurposes.find((s) => s.name === selectedSubPurpose);
      if (sub && sub.slots > 0) {
        const bookedCount = allBookings.filter((b) => {
          if ((b.status || "").toLowerCase() === "cancelled") return false;
          const bDate = (b.bookingDate || b.date || "").split("T")[0];
          return bDate === dateKey && b.subPurpose === selectedSubPurpose;
        }).length;
        if (bookedCount >= sub.slots) return false;
      }
    }

    return true;
  }, [selectedSeva, selectedSubPurpose, specialSevas, allBookings]);

  /* ==========================================
     SLOTS-FULL DETECTION
  ========================================== */
  const isRegularDateSlotsFull = useCallback((date) => {
    if (!date || !selectedSeva) return false;
    const selected = new Date(date);
    selected.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (selected < today) return false;
    if (isDateSelectable(date)) return false;

    const dateKey = toDBDate(selected);
    const dayOfWeek = selected.getDay();
    const dateRule = selectedSeva.dateRule || "any";

    if (selectedSeva?.blockOnSpecialDates) {
      const blocked = specialSevas.flatMap((s) =>
        (s.specificDates || s.dates || []).map((d) =>
          typeof d === "string" ? d.split("T")[0].trim() : toDBDate(d))
      );
      if (blocked.includes(dateKey)) return false;
    }
    if (dateRule === "thursday" && dayOfWeek !== 4) return false;
    if (dateRule === "sun_thu" && dayOfWeek !== 0 && dayOfWeek !== 4) return false;
    if (dateRule === "specific") {
      const allowed = (selectedSeva.specificDates || []).map((d) =>
        typeof d === "string" ? d.split("T")[0].trim() : toDBDate(d));
      if (!allowed.includes(dateKey)) return false;
    }
    return Number(selectedSeva.maxPerDate || 0) > 0;
  }, [selectedSeva, specialSevas, isDateSelectable]);

  const isSpecialDateSlotsFull = useCallback((date) => {
    if (!date || !selectedSpecialSeva) return false;
    const selected = new Date(date);
    selected.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (selected < today) return false;
    if (isSpecialDateSelectable(date)) return false;

    const activeSeva = selectedSpecialSeva.hasSubPurposes
      ? selectedSpecialSeva.subPurposes?.find((s) => s.name === selectedSpecialSubPurpose)
      : selectedSpecialSeva;
    if (!activeSeva) return false;

    const dateKey = toDBDate(selected);
    const dateRule = selectedSpecialSeva.dateRule || "any";

    if (dateRule === "thursday" && selected.getDay() !== 4) return false;
    if (dateRule === "sun_thu" && selected.getDay() !== 0 && selected.getDay() !== 4) return false;
    if (dateRule === "specific") {
      const allowedDates = (selectedSpecialSeva.specificDates || selectedSpecialSeva.dates || [])
        .map((d) => typeof d === "string" ? d.split("T")[0].trim() : toDBDate(d));
      if (!allowedDates.includes(dateKey)) return false;
    }
    return Number(selectedSpecialSeva.maxPerDate || 0) > 0;
  }, [selectedSpecialSeva, selectedSpecialSubPurpose, isSpecialDateSelectable]);

  const isMultiDateSlotsFull = useCallback((date) => {
    if (!date || !selectedSeva) return false;
    const selected = new Date(date);
    selected.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (selected < today) return false;
    if (isMultiDateSelectable(date)) return false;

    const dateKey = toDBDate(selected);

    if (selectedSeva?.blockOnSpecialDates) {
      const blocked = specialSevas.flatMap((s) =>
        (s.specificDates || s.dates || []).map((d) =>
          typeof d === "string" ? d.split("T")[0].trim() : toDBDate(d))
      );
      if (blocked.includes(dateKey)) return false;
    }

    const sub = selectedSeva.subPurposes?.find((s) => s.name === selectedSubPurpose);
    return !!(selectedSubPurpose && sub && sub.slots > 0);
  }, [selectedSeva, selectedSubPurpose, specialSevas, isMultiDateSelectable]);

  /* ==========================================
     RESET
  ========================================== */
  const resetSelections = () => {
    setSelectedSeva(null); setSelectedSevaId("");
    setAmount(""); setBaseAmount(0);
    setSelectedSubPurpose(""); setPricePerDate("");
    setSelectedSpecialSubPurpose("");
    setGotra(""); setGotraCustom("");
    setPaymentType(""); setPayNowAmount(""); setAdvance(0);
    setBookingDate(null); setMultiDates([]);
    setSelectedSpecialSeva(null);
    saveToLocalStorage({
      selectedSevaId: "", purpose: "", baseAmount: 0, amount: 0,
      advance: 0, originalAdvance: 0, remainingAmount: 0,
      bookingDate: "", paymentType: "", selectedSubPurpose: "",
      selectedSpecialSubPurpose: "",
      gotra: "", pricePerDate: "", multiDates: [], status: "Pending",
    });
  };

  /* ==========================================
     HANDLERS
  ========================================== */
  const handleEventTypeChange = (type) => {
    setEventType(type);
    resetSelections();
    saveToLocalStorage({ eventType: type });
  };

  const handleSevaChange = (e) => {
    const id = e.target.value;
    const found = sevaList.find((s) => (s._id || s.id) === id);
    const newPricePerDate = (found?.allowMultiDate && found?.amountType === "fixed")
      ? String(Number(found.amount || 0))
      : "";
    setSelectedSeva(found || null);
    setSelectedSevaId(id);
    setAmount(""); setBaseAmount(found?.amountType === "fixed" ? Number(found.amount) : 0);
    setSelectedSubPurpose(""); setPricePerDate(newPricePerDate);
    setGotra(""); setGotraCustom("");
    setPaymentType(""); setPayNowAmount(""); setAdvance(0);
    setBookingDate(null); setMultiDates([]);
    saveToLocalStorage({
      selectedSevaId: id,
      purpose: found?.displayName || "",
      baseAmount: found?.amountType === "fixed" ? Number(found.amount) : 0,
      amount: found?.amountType === "fixed" ? Number(found.amount) : 0,
      advance: 0, originalAdvance: 0,
      remainingAmount: found?.amountType === "fixed" ? Number(found.amount) : 0,
      bookingDate: "", paymentType: "", selectedSubPurpose: "",
      gotra: "", pricePerDate: newPricePerDate, multiDates: [],
      allowMultiDate: found?.allowMultiDate || false,
      paymentOptions: found?.paymentOptions || "full",
      status: "Pending",
    });
  };

  const handleSpecialSevaChange = (e) => {
    const id = e.target.value;
    const found = specialSevas.find((s) => (s._id || s.id) === id);
    const noSubFixed = found && !found.hasSubPurposes && found.amountType === "fixed";
    const fixedAmt = noSubFixed ? Number(found.amount || 0) : 0;
    setSelectedSpecialSeva(found || null);
    setSelectedSeva(null); setSelectedSevaId("");
    setSelectedSpecialSubPurpose("");
    setAmount(""); setBaseAmount(fixedAmt);
    setPaymentType(""); setPayNowAmount(""); setAdvance(0);
    setBookingDate(null); setMultiDates([]);
    saveToLocalStorage({
      selectedSpecialSevaId: id,
      purpose: found && !found.hasSubPurposes ? (found.displayName || "") : "",
      amountType: found?.amountType || "",
      baseAmount: fixedAmt, amount: fixedAmt,
      advance: 0, remainingAmount: fixedAmt,
      bookingDate: "", paymentType: "", selectedSpecialSubPurpose: "",
      paymentOptions: found?.paymentOptions || "full",
    });
  };

  // FIX 1: Special sub-purpose — now uses DROPDOWN handler (e.target.value)
  const handleSpecialSubPurposeChange = (e) => {
    const name = e.target.value;
    setSelectedSpecialSubPurpose(name);
    setPaymentType(""); setPayNowAmount(""); setAdvance(0); setBookingDate(null); setMultiDates([]);
    setAmount("");

    if (!name) {
      setSelectedSeva(null); setSelectedSevaId("");
      setBaseAmount(0);
      saveToLocalStorage({
        selectedSpecialSubPurpose: "",
        purpose: "", selectedSevaId: "",
        baseAmount: 0, amount: 0,
        advance: 0, remainingAmount: 0,
        bookingDate: "", paymentType: "",
      });
      return;
    }

    const sub = selectedSpecialSeva.subPurposes?.find((s) => s.name === name);
    if (sub) {
      // Sub-purpose selected — use sub's amount if fixed, else flexible
      const fixedAmt = sub.amount > 0 ? Number(sub.amount) : 0;
      setBaseAmount(fixedAmt);
      // Create a merged seva object for date selectable checks
      setSelectedSeva({ ...selectedSpecialSeva, displayName: sub.name, amount: fixedAmt });
      setSelectedSevaId(selectedSpecialSeva._id || selectedSpecialSeva.id || "");
      saveToLocalStorage({
        selectedSpecialSubPurpose: name,
        purpose: sub.name,
        selectedSevaId: selectedSpecialSeva._id || selectedSpecialSeva.id || "",
        baseAmount: fixedAmt, amount: fixedAmt,
        advance: 0, remainingAmount: fixedAmt,
        bookingDate: "", paymentType: "",
        paymentOptions: sub.paymentOptions || selectedSpecialSeva?.paymentOptions || "full",
      });
    } else {
      // No sub-purposes — use special seva directly
      const fixedAmt = Number(selectedSpecialSeva.amount || 0);
      setBaseAmount(fixedAmt);
      setSelectedSeva(selectedSpecialSeva);
      setSelectedSevaId(selectedSpecialSeva._id || selectedSpecialSeva.id || "");
      saveToLocalStorage({
        selectedSpecialSubPurpose: name,
        purpose: selectedSpecialSeva.displayName,
        selectedSevaId: selectedSpecialSeva._id || selectedSpecialSeva.id || "",
        baseAmount: fixedAmt, amount: fixedAmt,
        advance: 0, remainingAmount: fixedAmt,
        bookingDate: "", paymentType: "",
        paymentOptions: selectedSpecialSeva?.paymentOptions || "full",
      });
    }
  };

  const handleSubPurposeChange = (e) => {
    const name = e.target.value;
    setSelectedSubPurpose(name);
    setMultiDates([]); setBookingDate(null);
    const sub = selectedSeva?.subPurposes?.find((s) => s.name === name);
    const price = sub ? String(sub.amount || "") : "";
    setPricePerDate(price);
    saveToLocalStorage({
      selectedSubPurpose: name,
      pricePerDate: price,
      multiDates: [], bookingDate: "",
      amount: 0, baseAmount: 0, advance: 0, remainingAmount: 0,
      paymentOptions: sub?.paymentOptions || selectedSeva?.paymentOptions || "full",
    });
  };

  const handleAmountChange = (e) => {
    const value = e.target.value;
    setAmount(value);
    const n = Number(value ?? 0);
    setBaseAmount(n);
    const updates = {
      amount: n, baseAmount: n,
      advance: paymentType === "full" ? n : Number(savedData.advance ?? 0),
      bookingDate: bookingDate ? toDBDate(bookingDate) : "",
    };
    if (selectedSeva?.allowMultiDate) {
      setPricePerDate(value);
      updates.pricePerDate = value;
      // reset multi-date selections when price changes
      setMultiDates([]);
      updates.multiDates = [];
    }
    saveToLocalStorage(updates);
  };

  const handleGotraChange = (val) => {
    setGotra(val);
    saveToLocalStorage({ gotra: val });
  };

  const handlePaymentTypeChange = (type) => {
    setPaymentType(type); setPayNowAmount("");
    const currentAmount = Number(amount || baseAmount || 0);
    if (type === "full") {
      setAdvance(currentAmount);
      saveToLocalStorage({ paymentType: "full", amount: currentAmount, advance: currentAmount, remainingAmount: 0, status: "Approved" });
    }
    if (type === "advance") {
      setAdvance(0);
      saveToLocalStorage({ paymentType: "advance", amount: currentAmount, advance: 0, originalAdvance: 0, remainingAmount: currentAmount });
    }
  };

  const handlePayNowChange = (e) => {
    const value = e.target.value;
    const currentAmount = Number(amount || baseAmount || 0);
    if (value === "") {
      setPayNowAmount(""); setAdvance(previousPaidAmount);
      saveToLocalStorage({ paymentType: "advance", amount: currentAmount, advance: previousPaidAmount, remainingAmount: Math.max(currentAmount - previousPaidAmount, 0) });
      return;
    }
    let payNow = Number(value ?? 0);
    const maxAllowed = Math.max(currentAmount - previousPaidAmount, 0);
    if (payNow > maxAllowed) payNow = maxAllowed;
    setPayNowAmount(String(payNow));
    const totalPaid = previousPaidAmount + payNow;
    setAdvance(totalPaid);
    saveToLocalStorage({ paymentType: "advance", amount: currentAmount, advance: totalPaid, remainingAmount: Math.max(currentAmount - totalPaid, 0) });
  };

  const handleDateChange = (date) => {
    if (!date) { setBookingDate(null); saveToLocalStorage({ bookingDate: "" }); return; }
    setBookingDate(date);
    saveToLocalStorage({ bookingDate: toDBDate(date) });
  };

  const handleMultiDateToggle = (date) => {
    if (!date) return;
    const dateStr = toDBDate(date);
    const exists = multiDates.some((d) => toDBDate(d) === dateStr);
    const newDates = exists
      ? multiDates.filter((d) => toDBDate(d) !== dateStr)
      : [...multiDates, date];
    setMultiDates(newDates);
    const newTotal = pricePerDate ? Number(pricePerDate) * newDates.length : 0;
    setBaseAmount(newTotal);
    saveToLocalStorage({
      multiDates: newDates.map(toDBDate),
      amount: newTotal, baseAmount: newTotal,
      advance: newTotal, remainingAmount: 0,
    });
  };

  const handleSpecialMultiDateToggle = (date) => {
    if (!date) return;
    const dateStr = toDBDate(date);
    const exists = multiDates.some((d) => toDBDate(d) === dateStr);
    const newDates = exists
      ? multiDates.filter((d) => toDBDate(d) !== dateStr)
      : [...multiDates, date];
    setMultiDates(newDates);
    const priceEach = Number(amount || specialDisplayAmount || 0);
    const newTotal = priceEach * newDates.length;
    setBaseAmount(newTotal);
    saveToLocalStorage({
      multiDates: newDates.map(toDBDate),
      pricePerDate: String(priceEach),
      amount: newTotal, baseAmount: newTotal,
      advance: newTotal, remainingAmount: 0,
    });
  };

  /* ==========================================
     TOOLTIP HELPER
  ========================================== */
  const getSpecialEventNameForDate = useCallback((date) => {
    if (!date) return null;
    const dateKey = toDBDate(new Date(date));
    const found = specialSevas.find((s) =>
      (s.specificDates || s.dates || []).some((d) =>
        (typeof d === "string" ? d.split("T")[0].trim() : toDBDate(d)) === dateKey
      )
    );
    return found ? found.displayName : null;
  }, [specialSevas]);

  /* ==========================================
     DATE PICKER PROPS
  ========================================== */
  const allSpecialEventDates = specialSevas
    .flatMap((s) =>
      (s.specificDates || s.dates || []).map((d) =>
        safeDate(typeof d === "string" ? d.split("T")[0].trim() : toDBDate(d))
      )
    )
    .filter(Boolean);

  const blockedSpecialDates = selectedSeva?.blockOnSpecialDates
    ? allSpecialEventDates
    : [];

  const regularDatePickerProps = {
    selected: bookingDate,
    onChange: handleDateChange,
    filterDate: isDateSelectable,
    minDate: new Date(),
    dateFormat: "dd-MM-yyyy",
    placeholderText: "Select booking date (dd-mm-yyyy)",
    className: "pd-date-input",
    required: true,
    isClearable: true,
    calendarClassName: "pd-calendar",
    highlightDates: [
      ...(allSpecialEventDates.length > 0 ? [{ "react-datepicker__day--highlighted": allSpecialEventDates }] : []),
      ...(blockedSpecialDates.length > 0 ? [{ "react-datepicker__day--utsav-blocked": blockedSpecialDates }] : []),
    ],
    renderDayContents: (day, date) => {
      const specialName = getSpecialEventNameForDate(date);
      const slotsFull = isRegularDateSlotsFull(date);
      const tooltipTitle = specialName
        ? selectedSeva?.blockOnSpecialDates
          ? `🚫 ${specialName} — Date reserved for special event`
          : specialName
        : slotsFull ? "Slots are full" : "";
      return (
        <span
          title={tooltipTitle}
          style={{ display: "block", width: "100%", height: "100%" }}
        >
          {day}
        </span>
      );
    },
  };

  const specialSevaHighlightDates = selectedSpecialSeva
    ? (selectedSpecialSeva.specificDates || selectedSpecialSeva.dates || [])
        .map((d) => safeDate(typeof d === "string" ? d.split("T")[0].trim() : toDBDate(d)))
        .filter(Boolean)
    : [];

  const specialDatePickerProps = {
    selected: bookingDate,
    onChange: handleDateChange,
    filterDate: isSpecialDateSelectable,
    minDate: new Date(),
    dateFormat: "dd-MM-yyyy",
    placeholderText: "Select booking date (dd-mm-yyyy)",
    className: "pd-date-input",
    required: true,
    isClearable: true,
    // FIX: disable only when special seva not selected OR (has sub-purposes but none selected) OR no payment type
    disabled: !selectedSpecialSeva ||
      (selectedSpecialSeva.hasSubPurposes && !selectedSpecialSubPurpose) ||
      !paymentType ||
      (paymentType === "advance" && !Number(payNowAmount)),

    calendarClassName: "pd-calendar",
    highlightDates: specialSevaHighlightDates.length > 0
      ? [{ "react-datepicker__day--highlighted": specialSevaHighlightDates }]
      : [],
    renderDayContents: (day, date) => {
      const slotsFull = isSpecialDateSlotsFull(date);
      const dateKey = toDBDate(new Date(date));
      const isHighlighted = selectedSpecialSeva
        ? (selectedSpecialSeva.specificDates || selectedSpecialSeva.dates || []).some(
            (d) => (typeof d === "string" ? d.split("T")[0].trim() : toDBDate(d)) === dateKey
          )
        : false;
      const tooltipTitle = isHighlighted
        ? (selectedSpecialSeva?.displayName || "")
        : slotsFull ? "Slots are full" : "";
      return (
        <span
          title={tooltipTitle}
          style={{ display: "block", width: "100%", height: "100%" }}
        >
          {day}
        </span>
      );
    },
  };

  const specialMultiDatePickerProps = {
    inline: true,
    onChange: handleSpecialMultiDateToggle,
    filterDate: isSpecialDateSelectable,
    highlightDates: [
      ...(specialSevaHighlightDates.length > 0 ? [{ "react-datepicker__day--highlighted": specialSevaHighlightDates }] : []),
      ...(multiDates.length > 0 ? [{ "react-datepicker__day--abhishek-selected": multiDates }] : []),
    ],
    minDate: new Date(),
    calendarClassName: "pd-calendar abhishek-calendar",
    renderDayContents: (day, date) => {
      const slotsFull = isSpecialDateSlotsFull(date);
      const dateKey = toDBDate(new Date(date));
      const isHighlighted = selectedSpecialSeva
        ? (selectedSpecialSeva.specificDates || selectedSpecialSeva.dates || []).some(
            (d) => (typeof d === "string" ? d.split("T")[0].trim() : toDBDate(d)) === dateKey
          )
        : false;
      const tooltipTitle = isHighlighted
        ? (selectedSpecialSeva?.displayName || "")
        : slotsFull ? "Slots are full" : "";
      return (
        <span title={tooltipTitle} style={{ display: "block", width: "100%", height: "100%" }}>
          {day}
        </span>
      );
    },
  };

  const multiDatePickerProps = {
    inline: true,
    onChange: handleMultiDateToggle,
    filterDate: isMultiDateSelectable,
    highlightDates: [
      ...(allSpecialEventDates.length > 0 ? [{ "react-datepicker__day--highlighted": allSpecialEventDates }] : []),
      ...(blockedSpecialDates.length > 0 ? [{ "react-datepicker__day--utsav-blocked": blockedSpecialDates }] : []),
      ...(multiDates.length > 0 ? [{ "react-datepicker__day--abhishek-selected": multiDates }] : []),
    ],
    minDate: new Date(),
    calendarClassName: "pd-calendar abhishek-calendar",
    renderDayContents: (day, date) => {
      const specialName = getSpecialEventNameForDate(date);
      const slotsFull = isMultiDateSlotsFull(date);
      const tooltipTitle = specialName
        ? selectedSeva?.blockOnSpecialDates
          ? `🚫 ${specialName} — Date reserved for special event`
          : specialName
        : slotsFull ? "Slots are full" : "";
      return (
        <span
          title={tooltipTitle}
          style={{ display: "block", width: "100%", height: "100%" }}
        >
          {day}
        </span>
      );
    },
  };

  /* ==========================================
     MULTI-DATE PICKER PROPS — seva-level (uses isDateSelectable for proper date rules)
  ========================================== */
  const sevaMultiDatePickerProps = {
    inline: true,
    onChange: handleMultiDateToggle,
    filterDate: isDateSelectable,
    highlightDates: [
      ...(allSpecialEventDates.length > 0 ? [{ "react-datepicker__day--highlighted": allSpecialEventDates }] : []),
      ...(blockedSpecialDates.length > 0 ? [{ "react-datepicker__day--utsav-blocked": blockedSpecialDates }] : []),
      ...(multiDates.length > 0 ? [{ "react-datepicker__day--abhishek-selected": multiDates }] : []),
    ],
    minDate: new Date(),
    calendarClassName: "pd-calendar abhishek-calendar",
    renderDayContents: (day, date) => {
      const specialName = getSpecialEventNameForDate(date);
      const slotsFull = isRegularDateSlotsFull(date);
      const tooltipTitle = specialName
        ? selectedSeva?.blockOnSpecialDates
          ? `🚫 ${specialName} — Date reserved for special event`
          : specialName
        : slotsFull ? "Slots are full" : "";
      return (
        <span title={tooltipTitle} style={{ display: "block", width: "100%", height: "100%" }}>
          {day}
        </span>
      );
    },
  };

  /* ==========================================
     SPECIAL SEVA — derived helpers
  ========================================== */
  // The active sub object for special seva (used for amount/payment display)
  const activeSpecialSub = selectedSpecialSeva?.hasSubPurposes
    ? selectedSpecialSeva.subPurposes?.find((s) => s.name === selectedSpecialSubPurpose)
    : null;

  // Amount to show for special seva
  const specialDisplayAmount = activeSpecialSub
    ? Number(activeSpecialSub.amount || 0)
    : Number(selectedSpecialSeva?.amount || 0);

  // Payment options for special seva — use sub-purpose's own paymentOptions if available
  const specialPaymentOptions = activeSpecialSub
    ? (activeSpecialSub.paymentOptions || "full")
    : (selectedSpecialSeva?.paymentOptions || "full");

  // Avoid calling setState during render.
  // For flexible special sevas/sub-purposes, auto-select full payment (hide buttons).
  useEffect(() => {
    if (eventType !== "special") return;
    if (paymentType) return;
    if (!selectedSpecialSeva) return;

    const isFlexible = activeSpecialSub
      ? activeSpecialSub.amount === 0
      : selectedSpecialSeva?.amountType === "flexible";

    if (isFlexible && Number(amount) > 0) {
      handlePaymentTypeChange("full");
    }
  }, [eventType, paymentType, selectedSpecialSeva, activeSpecialSub, amount]);

  /* ==========================================
     LOADING
  ========================================== */

  if (sevaLoading) {
    return (
      <div className="pd-root">
        <div className="pd-loading">Loading sevas...</div>
      </div>
    );
  }

  /* ==========================================
     UI
  ========================================== */
  return (
    <div className="pd-root">

      {/* SECTION HEADER */}
      <div className="pd-header">
        <div>
          <h3 className="pd-header-title">उद्देश / Purpose</h3>
          <p className="pd-header-sub">Select event type and booking purpose</p>
        </div>
      </div>

      {/* EVENT TYPE BUTTONS */}
      <div className="pd-field">
        <label className="pd-label">कार्यक्रम प्रकार / Event Type</label>
        <div className="pd-event-grid">
          {[
            { key: "special", en: "Special Events", mr: "विशेष कार्यक्रम" },
            { key: "regular", en: "Regular Events", mr: "नियमित कार्यक्रम" },
          ].map(({ key, en, mr }) => (
            <button
              key={key}
              type="button"
              disabled={isEditMode}
              onClick={() => handleEventTypeChange(key)}
              className={`pd-event-btn ${eventType === key ? "pd-event-btn--active" : ""}`}
            >
              <span className="pd-event-en">{en}</span>
              <span className="pd-event-mr">{mr}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════
          SPECIAL EVENTS
      ══════════════════════════════ */}
      {eventType === "special" && (
        <div className="pd-flow">

          {/* Step 1: Select special seva */}
          <div className="pd-field">
            <label className="pd-label">उत्सव / Event *</label>
            <select
              className="pd-select"
              value={selectedSpecialSeva ? (selectedSpecialSeva._id || selectedSpecialSeva.id) : ""}
              onChange={handleSpecialSevaChange}
              disabled={isEditMode}
            >
              <option value="">— उत्सव निवडा / Select Event —</option>
              {specialSevas.map((seva, i) => {
                const dates = seva.specificDates || seva.dates || [];
                const dateRange = dates.length > 0 ? ` (${dates[0]} to ${dates[dates.length - 1]})` : "";
                return (
                  <option key={i} value={seva._id || seva.id}>
                    {seva.displayName}{dateRange}
                  </option>
                );
              })}
            </select>
          </div>

          {selectedSpecialSeva && (
            <>
              {/* FIX 1: Sub-purpose — DROPDOWN (same as regular events) */}
              {selectedSpecialSeva.hasSubPurposes && selectedSpecialSeva.subPurposes?.length > 0 && (
                <div className="pd-field">
                  <label className="pd-label">
                    सेवा प्रकार / {selectedSpecialSeva.displayName} Type *
                  </label>
                  <select
                    className="pd-select"
                    value={selectedSpecialSubPurpose}
                    onChange={handleSpecialSubPurposeChange}
                    disabled={isEditMode}
                  >
                    <option value="">— Select Type —</option>
                    {selectedSpecialSeva.subPurposes.map((sub, i) => (
                      <option key={i} value={sub.name}>
                        {sub.name}
                        {sub.amount > 0 ? ` — ₹${Number(sub.amount).toLocaleString("en-IN")}` : ""}
                        {sub.slots > 0 ? ` (${sub.slots} slots/day)` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* FIX 3: Gotra — only show if hasGotra is true */}
              {selectedSpecialSeva.hasGotra &&
                (!selectedSpecialSeva.hasSubPurposes || selectedSpecialSubPurpose) && (
                <div className="pd-field">
                  <label className="pd-label">गोत्र / Gotra</label>
                  <select
                    className="pd-select"
                    value={ABHISHEK_GOTRAS.includes(gotra) ? gotra : gotra ? "Other" : ""}
                    onChange={(e) => {
                      if (e.target.value === "Other") { handleGotraChange("Other"); setGotraCustom(""); }
                      else { handleGotraChange(e.target.value); setGotraCustom(""); }
                    }}
                    disabled={isEditMode}
                  >
                    <option value="">— गोत्र निवडा / Select Gotra —</option>
                    {ABHISHEK_GOTRAS.map((g, i) => <option key={i} value={g}>{g}</option>)}
                  </select>
                  {(gotra === "Other" || (gotra && !ABHISHEK_GOTRAS.slice(0, -1).includes(gotra))) && (
                    <input
                      className="pd-input"
                      style={{ marginTop: "8px" }}
                      placeholder="गोत्र प्रविष्ट करा / Enter Gotra"
                      value={gotraCustom}
                      onChange={(e) => { setGotraCustom(e.target.value); handleGotraChange(e.target.value); }}
                    />
                  )}
                </div>
              )}

              {/* Show rest only when sub-purpose selected (or no sub-purposes) */}
              {(!selectedSpecialSeva.hasSubPurposes || selectedSpecialSubPurpose) && (
                <>
                  {/* FIX 2: Flexible amount input for special events */}
                  {(() => {
                    const sub = activeSpecialSub;
                    const isFlexible = sub
                      ? sub.amount === 0
                      : selectedSpecialSeva.amountType === "flexible";
                    return isFlexible;
                  })() && (
                    <>
                      <div className="pd-field">
                        <label className="pd-label">रक्कम टाका / Enter Amount *</label>
                        <input
                          type="number"
                          className="pd-input"
                          placeholder="Enter amount"
                          min="1"
                          value={amount}
                          onChange={handleAmountChange}
                          onWheel={(e) => e.target.blur()}
                        />
                      </div>
                      {Number(amount) > 0 && (
                        <div className="pd-amount-row pd-amount-row--green">
                          <span className="pd-amount-row__label">रक्कम / Amount</span>
                          <span className="pd-amount-row__value">₹{Number(amount).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Fixed amount display */}
                  {(() => {
                    const sub = activeSpecialSub;
                    const isFixed = sub
                      ? sub.amount > 0
                      : (selectedSpecialSeva.amountType === "fixed" && selectedSpecialSeva.amount > 0);
                    return isFixed;
                  })() && (
                    <div className="pd-amount-row pd-amount-row--green">
                      <span className="pd-amount-row__label">निश्चित रक्कम / Fixed Amount</span>
                      <span className="pd-amount-row__value">₹{specialDisplayAmount.toLocaleString("en-IN")}</span>
                    </div>
                  )}

                  {!paymentType && specialDisplayAmount > 0 && (() => {
                    const isFlexible = activeSpecialSub
                      ? activeSpecialSub.amount === 0
                      : selectedSpecialSeva.amountType === "flexible";

                    if (isFlexible) return null; // hide buttons for flexible


                    return (
                      <div className="pd-field">
                        <label className="pd-label">पेमेंट प्रकार / Payment Type</label>
                        <div className="pd-pay-grid">
                          <button
                            type="button"
                            className="pd-pay-btn pd-pay-btn--full"
                            onClick={() => handlePaymentTypeChange("full")}
                          >
                            <span className="pd-pay-icon"></span>
                            <span className="pd-pay-title">Full Payment</span>
                            <span className="pd-pay-sub">₹{specialDisplayAmount.toLocaleString("en-IN")}</span>
                          </button>
                          {specialPaymentOptions === "full_advance" && (
                            <button
                              type="button"
                              className="pd-pay-btn pd-pay-btn--advance"
                              onClick={() => handlePaymentTypeChange("advance")}
                            >
                              <span className="pd-pay-icon"></span>
                              <span className="pd-pay-title">Advance Payment</span>
                              <span className="pd-pay-sub">Pay partial now</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}


                  {/* Advance amount input */}
                  {paymentType === "advance" && (
                    <>
                      <div className="pd-field">
                        <label className="pd-label">आगाऊ रक्कम / Advance Amount *</label>
                        <input type="number" className="pd-input" placeholder="Enter advance amount" min="1" max={baseAmount} value={payNowAmount} onChange={handlePayNowChange} onWheel={(e) => e.target.blur()} />
                      </div>
                      <div className="pd-amount-row pd-amount-row--amber">
                        <span className="pd-amount-row__label">उर्वरित रक्कम / Remaining</span>
                        <span className="pd-amount-row__value">₹{Math.max(baseAmount - Number(payNowAmount || 0), 0).toLocaleString("en-IN")}</span>
                      </div>
                    </>
                  )}

                  {/* Booking date */}
                  {paymentType && (paymentType === "full" || Number(payNowAmount) > 0) && (
                    <div className="pd-field">
                      {selectedSpecialSeva?.allowMultiDate ? (
                        <>
                          <label className="pd-label">
                            तारखा निवडा / Select Dates *
                            <span className="pd-label-hint"> — click to select/deselect</span>
                          </label>
                          <div className="pd-calendar-wrap">
                            <DatePicker {...specialMultiDatePickerProps} />
                          </div>
                          {multiDates.length > 0 && (
                            <>
                              <div className="pd-date-tags">
                                {multiDates.slice().sort((a, b) => a - b).map((date, i) => (
                                  <span key={i} className="pd-date-tag">
                                    {toDisplayDate(date)}
                                    <button className="pd-date-tag__remove" onClick={() => handleSpecialMultiDateToggle(date)}>×</button>
                                  </span>
                                ))}
                              </div>
                              <div className="pd-amount-row pd-amount-row--green">
                                <span className="pd-amount-row__label">
                                  Total — {multiDates.length} date{multiDates.length > 1 ? "s" : ""} × ₹{specialDisplayAmount.toLocaleString("en-IN")}
                                </span>
                                <span className="pd-amount-row__value">₹{(specialDisplayAmount * multiDates.length).toLocaleString("en-IN")}</span>
                              </div>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <label className="pd-label">बुकिंग तारीख / Booking Date *</label>
                          <DatePicker {...specialDatePickerProps} />
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════
          REGULAR EVENTS
      ══════════════════════════════ */}
      {eventType === "regular" && (
        <div className="pd-flow">

          <div className="pd-field">
            <label className="pd-label">उद्देश / Purpose *</label>
            <select
              className="pd-select"
              value={selectedSevaId}
              onChange={handleSevaChange}
              disabled={isEditMode}
              style={{ opacity: isEditMode ? 0.7 : 1, cursor: isEditMode ? "not-allowed" : "pointer" }}
            >
              <option value="">— उद्देश निवडा / Choose Purpose —</option>
              {regularSevas.map((seva, i) => (
                <option key={i} value={seva._id || seva.id}>
                  {seva.displayName}
                  {seva.amountType === "fixed" ? ` (₹${Number(seva.amount).toLocaleString("en-IN")})` : ""}
                </option>
              ))}
            </select>
          </div>

          {selectedSeva && (
            <>
              {/* Fixed amount — no sub-purposes */}
              {selectedSeva.amountType === "fixed" && !selectedSeva.hasSubPurposes && (
                <div className="pd-amount-row pd-amount-row--green">
                  <span className="pd-amount-row__label">रक्कम / Amount</span>
                  <span className="pd-amount-row__value">₹{Number(selectedSeva.amount).toLocaleString("en-IN")}</span>
                </div>
              )}

              {/* Sub-purpose dropdown */}
              {selectedSeva.hasSubPurposes && selectedSeva.subPurposes?.length > 0 && (
                <div className="pd-field">
                  <label className="pd-label">{selectedSeva.displayName} Type *</label>
                  <select className="pd-select" value={selectedSubPurpose} onChange={handleSubPurposeChange} disabled={isEditMode}>
                    <option value="">— Select Type —</option>
                    {selectedSeva.subPurposes.map((sub, i) => (
                      <option key={i} value={sub.name}>
                        {sub.name}
                        {sub.amount > 0 ? ` — ₹${Number(sub.amount).toLocaleString("en-IN")}` : ""}
                        {sub.slots > 0 ? ` (${sub.slots} slots/day)` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* FIX 3: Gotra — only when hasGotra is true */}
              {selectedSeva.hasGotra && (selectedSubPurpose || !selectedSeva.hasSubPurposes) && (
                <div className="pd-field">
                  <label className="pd-label">गोत्र / Gotra</label>
                  <select
                    className="pd-select"
                    value={ABHISHEK_GOTRAS.includes(gotra) ? gotra : gotra ? "Other" : ""}
                    onChange={(e) => {
                      if (e.target.value === "Other") { handleGotraChange("Other"); setGotraCustom(""); }
                      else { handleGotraChange(e.target.value); setGotraCustom(""); }
                    }}
                    disabled={isEditMode}
                  >
                    <option value="">— गोत्र निवडा / Select Gotra —</option>
                    {ABHISHEK_GOTRAS.map((g, i) => <option key={i} value={g}>{g}</option>)}
                  </select>
                  {(gotra === "Other" || (gotra && !ABHISHEK_GOTRAS.slice(0, -1).includes(gotra))) && (
                    <input
                      className="pd-input"
                      style={{ marginTop: "8px" }}
                      placeholder="गोत्र प्रविष्ट करा / Enter Gotra"
                      value={gotraCustom}
                      onChange={(e) => { setGotraCustom(e.target.value); handleGotraChange(e.target.value); }}
                    />
                  )}
                </div>
              )}

              {/* Flexible amount input */}
              {selectedSeva.amountType === "flexible" &&
                (!selectedSeva.hasSubPurposes || (selectedSeva.hasSubPurposes && selectedSubPurpose && !(() => {
                  const sub = selectedSeva.subPurposes?.find((s) => s.name === selectedSubPurpose);
                  return sub?.amount > 0 || sub?.isMultiDate;
                })())) && (
                <>
                  <div className="pd-field">
                    <label className="pd-label">
                      {selectedSeva.allowMultiDate
                        ? "प्रति तारीख किंमत / Price Per Date *"
                        : "रक्कम टाका / Enter Amount *"}
                    </label>
                    <input type="number" className="pd-input" placeholder="Enter amount" min="1" value={amount} onChange={handleAmountChange} onWheel={(e) => e.target.blur()} />
                  </div>
                  {Number(amount) > 0 && !selectedSeva.allowMultiDate && (
                    <div className="pd-amount-row pd-amount-row--green">
                      <span className="pd-amount-row__label">रक्कम / Amount</span>
                      <span className="pd-amount-row__value">₹{Number(amount).toLocaleString("en-IN")}</span>
                    </div>
                  )}
                </>
              )}

              {/* ── Seva-level multi-date selection ── */}
              {selectedSeva.allowMultiDate && (() => {
                if (selectedSeva.amountType === "fixed") return true;
                return Number(pricePerDate) > 0;
              })() && (
                <>
                  {selectedSeva.amountType === "fixed" && (
                    <div className="pd-readonly-field">
                      <span className="pd-readonly-prefix">₹</span>
                      <span className="pd-readonly-value">{Number(selectedSeva.amount).toLocaleString("en-IN")}</span>
                      <span className="pd-readonly-badge">per date</span>
                    </div>
                  )}
                  <div className="pd-field">
                    <label className="pd-label">
                      तारखा निवडा / Select Dates *
                      <span className="pd-label-hint"> — click to select/deselect</span>
                    </label>
                    <div className="pd-calendar-wrap">
                      <DatePicker {...sevaMultiDatePickerProps} />
                    </div>
                  </div>
                  {multiDates.length > 0 && (
                    <>
                      <div className="pd-date-tags">
                        {multiDates.slice().sort((a, b) => a - b).map((date, i) => (
                          <span key={i} className="pd-date-tag">
                            {toDisplayDate(date)}
                            <button className="pd-date-tag__remove" onClick={() => handleMultiDateToggle(date)}>×</button>
                          </span>
                        ))}
                      </div>
                      <div className="pd-amount-row pd-amount-row--green">
                        <span className="pd-amount-row__label">
                          Total — {multiDates.length} date{multiDates.length > 1 ? "s" : ""} × ₹{Number(pricePerDate || selectedSeva.amount || 0).toLocaleString("en-IN")}
                        </span>
                        <span className="pd-amount-row__value">₹{multiDateTotal.toLocaleString("en-IN")}</span>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Multi-date selection */}
              {selectedSeva.hasSubPurposes && selectedSubPurpose && (() => {
                const sub = selectedSeva.subPurposes?.find((s) => s.name === selectedSubPurpose);
                return sub?.isMultiDate;
              })() && pricePerDate && (
                <>
                  <div className="pd-readonly-field">
                    <span className="pd-readonly-prefix">₹</span>
                    <span className="pd-readonly-value">{Number(pricePerDate).toLocaleString("en-IN")}</span>
                    <span className="pd-readonly-badge">per date</span>
                  </div>
                  <div className="pd-field">
                    <label className="pd-label">
                      तारखा निवडा / Select Dates *
                      <span className="pd-label-hint"> — click to select/deselect</span>
                    </label>
                    <div className="pd-calendar-wrap">
                      <DatePicker {...multiDatePickerProps} />
                    </div>
                  </div>
                  {multiDates.length > 0 && (
                    <>
                      <div className="pd-date-tags">
                        {multiDates.slice().sort((a, b) => a - b).map((date, i) => (
                          <span key={i} className="pd-date-tag">
                            {toDisplayDate(date)}
                            <button className="pd-date-tag__remove" onClick={() => handleMultiDateToggle(date)}>×</button>
                          </span>
                        ))}
                      </div>
                      <div className="pd-amount-row pd-amount-row--green">
                        <span className="pd-amount-row__label">
                          Total — {multiDates.length} date{multiDates.length > 1 ? "s" : ""} × ₹{Number(pricePerDate).toLocaleString("en-IN")}
                        </span>
                        <span className="pd-amount-row__value">₹{multiDateTotal.toLocaleString("en-IN")}</span>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Payment type buttons */}
              {selectedSeva.dateRule !== "none" && !paymentType &&
                !selectedSeva.allowMultiDate &&
                (!selectedSeva.hasSubPurposes || selectedSubPurpose) && (() => {
                  const activeSub = selectedSeva.hasSubPurposes
                    ? selectedSeva.subPurposes?.find((s) => s.name === selectedSubPurpose)
                    : null;
                  const activePayOpts = activeSub?.paymentOptions || selectedSeva.paymentOptions || "full";
                  const activeAmt = activeSub?.amount > 0
                    ? Number(activeSub.amount)
                    : Number(selectedSeva.amount || 0);
                  if (!activeAmt) return null;
                  return (
                    <div className="pd-field">
                      <label className="pd-label">पेमेंट प्रकार / Payment Type</label>
                      <div className="pd-pay-grid">
                        <button type="button" className="pd-pay-btn pd-pay-btn--full" onClick={() => handlePaymentTypeChange("full")}>
                          <span className="pd-pay-icon"></span>
                          <span className="pd-pay-title">Full Payment</span>
                          <span className="pd-pay-sub">₹{activeAmt.toLocaleString("en-IN")}</span>
                        </button>
                        {activePayOpts === "full_advance" && (
                          <button type="button" className="pd-pay-btn pd-pay-btn--advance" onClick={() => handlePaymentTypeChange("advance")}>
                            <span className="pd-pay-icon"></span>
                            <span className="pd-pay-title">Advance Payment</span>
                            <span className="pd-pay-sub">Pay partial now</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()
              }


              {/* Advance payment input */}
              {paymentType === "advance" && !selectedSeva.allowMultiDate && (
                <>
                  {isEditMode && (
                    <div className="pd-amount-row pd-amount-row--blue">
                      <span className="pd-amount-row__label">भरलेली रक्कम / Paid Amount</span>
                      <span className="pd-amount-row__value">₹{previousPaidAmount.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  <div className="pd-field">
                    <label className="pd-label">आता भरा / Pay Now *</label>
                    <input type="number" className="pd-input" placeholder="Enter amount to pay now" min="1" max={currentRemainingAmount} value={payNowAmount} onChange={handlePayNowChange} onWheel={(e) => e.target.blur()} />
                  </div>
                  <div className="pd-amount-row pd-amount-row--amber">
                    <span className="pd-amount-row__label">उर्वरित रक्कम / Remaining</span>
                    <span className="pd-amount-row__value">₹{remainingAmount.toLocaleString("en-IN")}</span>
                  </div>
                </>
              )}

              {/* Single booking date */}
              {selectedSeva.dateRule !== "none" && (() => {
                if (selectedSeva.allowMultiDate) return false;
                if (selectedSeva.hasSubPurposes) {
                  if (!selectedSubPurpose) return false;
                  const sub = selectedSeva.subPurposes?.find((s) => s.name === selectedSubPurpose);
                  if (sub?.isMultiDate) return false;
                }
                if (selectedSeva.amountType === "flexible") return true;
                if (selectedSeva.paymentOptions === "full") return true;
                if (selectedSeva.paymentOptions === "full_advance") {
                  return paymentType === "full" || (paymentType === "advance" && Number(payNowAmount) > 0);
                }
                return true;
              })() && (
                <div className="pd-field">
                  <label className="pd-label">बुकिंग तारीख / Booking Date *</label>
                  <DatePicker {...regularDatePickerProps} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}