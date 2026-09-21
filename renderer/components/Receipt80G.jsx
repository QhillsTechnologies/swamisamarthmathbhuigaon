import { useEffect, useRef } from "react";
import styles from "../styles/Receipt80G.module.css";

/* Marathi number-to-words (Indian numbering system, up to crores) —
   ported unchanged from the Wix receipt template. */
const ONES = ["", "एक", "दोन", "तीन", "चार", "पाच", "सहा", "सात",
  "आठ", "नऊ", "दहा", "अकरा", "बारा", "तेरा", "चौदा",
  "पंधरा", "सोळा", "सतरा", "अठरा", "एकोणीस"];

// Marathi uses irregular compound words for 21-99, so a full lookup is
// used for two-digit numbers instead of "tens + ones" concatenation.
const TWO_DIGIT_WORDS = [
  "शून्य", "एक", "दोन", "तीन", "चार", "पाच", "सहा", "सात", "आठ", "नऊ",
  "दहा", "अकरा", "बारा", "तेरा", "चौदा", "पंधरा", "सोळा", "सतरा", "अठरा", "एकोणीस",
  "वीस", "एकवीस", "बावीस", "तेवीस", "चोवीस", "पंचवीस", "सव्वीस", "सत्तावीस", "अठ्ठावीस", "एकोणतीस",
  "तीस", "एकतीस", "बत्तीस", "तेहतीस", "चौतीस", "पस्तीस", "छत्तीस", "सदतीस", "अडतीस", "एकोणचाळीस",
  "चाळीस", "एक्केचाळीस", "बेचाळीस", "त्रेचाळीस", "चव्वेचाळीस", "पंचेचाळीस", "सेहेचाळीस", "सत्तेचाळीस", "अठ्ठेचाळीस", "एकोणपन्नास",
  "पन्नास", "एक्कावन्न", "बावन्न", "त्रेपन्न", "चोपन्न", "पंचावन्न", "छप्पन्न", "सत्तावन्न", "अठ्ठावन्न", "एकोणसाठ",
  "साठ", "एकसष्ट", "बासष्ट", "त्रेसष्ट", "चौसष्ट", "पासष्ट", "सहासष्ट", "सदुसष्ट", "अडुसष्ट", "एकोणसत्तर",
  "सत्तर", "एक्काहत्तर", "बहात्तर", "त्र्याहत्तर", "चौर्‍याहत्तर", "पंच्याहत्तर", "शहात्तर", "सत्याहत्तर", "अठ्ठ्याहत्तर", "एकोण्याऐंशी",
  "ऐंशी", "एक्क्याऐंशी", "ब्याऐंशी", "त्र्याऐंशी", "चौऱ्याऐंशी", "पंच्याऐंशी", "शहाऐंशी", "सत्त्याऐंशी", "अठ्ठ्याऐंशी", "एकोणनव्वद",
  "नव्वद", "एक्क्याण्णव", "ब्याण्णव", "त्र्याण्णव", "चौऱ्याण्णव", "पंच्याण्णव", "शहाण्णव", "सत्त्याण्णव", "अठ्ठ्याण्णव", "नव्याण्णव",
];

function numberToWordsMarathi(num) {
  num = Math.floor(Number(num) || 0);
  if (num === 0) return "शून्य";

  const twoDigits = (n) => TWO_DIGIT_WORDS[n];
  const threeDigits = (n) => {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return (h ? ONES[h] + "शे" + (r ? " " : "") : "") + (r ? twoDigits(r) : "");
  };

  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000); num %= 100000;
  const thousand = Math.floor(num / 1000); num %= 1000;
  const rest = num;

  const parts = [];
  if (crore) parts.push(threeDigits(crore) + " कोटी");
  if (lakh) parts.push(threeDigits(lakh) + " लाख");
  if (thousand) parts.push(threeDigits(thousand) + " हजार");
  if (rest) parts.push(threeDigits(rest));

  return parts.join(" ").trim();
}

// Formats a date value (timestamp, ISO string, or Date) as DD-MM-YYYY
function formatDateDMY(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function buildPurposeWithDate(item) {
  // Multi-date bookings (e.g. Abhishek/seva across several dates) list every
  // date here instead of just the single bookingDate (which the backend only
  // fills with the earliest one, for records/sorting).
  const bookingDateStr = Array.isArray(item.multiDates) && item.multiDates.length > 1
    ? item.multiDates.slice().sort().map(formatDateDMY).join(", ")
    : formatDateDMY(item.bookingDate);
  return (item.purpose || "") + (bookingDateStr ? ` (${bookingDateStr})` : "");
}

// The स्मरणार्थ/"To" line sits in a fixed-height box (overflow:hidden) —
// the row below it is pre-printed on the physical pavati and can't be
// pushed down, so a long dedication can't wrap onto a 3rd+ line like the
// address field does. Shrinking the font until it fits keeps the whole
// text readable instead of silently clipping the overflow away.
function shrinkToFit(el, minPx = 9) {
  if (!el || !el.textContent) return;
  let guard = 0;
  while (el.scrollHeight > el.clientHeight + 1 && guard < 20) {
    const cur = parseFloat(getComputedStyle(el).fontSize);
    const next = cur - 1;
    if (next < minPx) break;
    el.style.fontSize = `${next}px`;
    guard++;
  }
}

function buildAmountWords(item) {
  if (item.amountInWords) return item.amountInWords;
  return item.advance ? `${numberToWordsMarathi(item.advance)} रुपये फक्त` : "";
}

// Fields below गोत्र/पॅन depend on the payment mode — cheque payments show
// the cheque number + paying bank, online payments show the order id,
// cash shows neither.
function BelowPanFields({ item }) {
  if (item.bank === "Cheque") {
    return (
      <>
        <div className={`${styles.field} ${styles["r-chequenumber"]}`}>
          {item.chequeNumber ? `Cheque Number - ${item.chequeNumber}` : ""}
        </div>
        <div className={`${styles.field} ${styles["r-bankname"]}`}>
          {item.payingBankName ? `Bank Name - ${item.payingBankName}` : ""}
        </div>
      </>
    );
  }
  if (item.bank === "Cash") return null;
  return (
    <div className={`${styles.field} ${styles["r-orderid"]}`}>
      {item.orderId ? `Order Id - ${item.orderId}` : ""}
    </div>
  );
}

function ReceiptCard({ item, guides }) {
  const amount = item.advance ? `Rs. ${Number(item.advance).toLocaleString("en-IN")}` : "";
  const dateStr = item._createdDate
    ? new Date(item._createdDate).toLocaleDateString("en-IN")
    : "";

  const cardClass = guides
    ? `${styles["receipt-card"]} ${styles.guides}`
    : styles["receipt-card"];

  const smarnarthRef = useRef(null);
  useEffect(() => {
    const el = smarnarthRef.current;
    if (!el) return;
    el.style.fontSize = ""; // reset to the CSS default before re-measuring
    shrinkToFit(el);
  }, [item.smarnarth]);

  return (
    <div className={cardClass}>
      <div className={`${styles.field} ${styles["r-bookingid"]}`}>{item.bookingId || ""}</div>
      <div className={`${styles.field} ${styles["r-date"]}`}>{dateStr}</div>
      <div className={`${styles.field} ${styles["r-name"]}`}>{item.name || ""}</div>
      <div className={`${styles.field} ${styles["r-address"]}`}>{item.address || ""}</div>
      <div ref={smarnarthRef} className={`${styles.field} ${styles["r-updatedby"]}`}>
        {item.smarnarth || ""}
      </div>
      <div className={`${styles.field} ${styles["r-phone"]}`}>{item.phone || ""}</div>
      <div className={`${styles.field} ${styles["r-purpose"]}`}>{buildPurposeWithDate(item)}</div>
      <div className={`${styles.field} ${styles["r-amountwords"]}`}>{buildAmountWords(item)}</div>
      <div className={`${styles.field} ${styles["r-gotra"]}`}>{item.gotra || ""}</div>
      <div className={`${styles.field} ${styles["r-pancard"]}`}>{item.panCard || ""}</div>
      <BelowPanFields item={item} />
      <div className={`${styles.field} ${styles["r-bank"]}`}>{item.bank || ""}</div>
      <div className={`${styles.field} ${styles["r-amount"]}`}>{amount}</div>
    </div>
  );
}

/**
 * Print overlay for the pre-printed 80G pavati paper. Renders only the
 * dynamic field values at their calibrated positions — the receipt design
 * itself already exists on the physical paper.
 *
 * items: same shape used elsewhere in the app for receipt printing
 *   (bookingId, name, phone, address, purpose, gotra, bookingDate,
 *   _createdDate, advance, amountInWords, bank, smarnarth, panCard,
 *   orderId, chequeNumber, payingBankName).
 * guides: dev-only calibration outlines, off by default, never printed.
 * showControls: renders a summary line + "Print All" button (hidden on
 *   print) for standalone use; omit when embedding inside a page that
 *   already provides its own print trigger.
 */
export default function Receipt80G({ items = [], guides = false, showControls = false, from = "", to = "" }) {
  if (showControls && items.length === 0) {
    return <div className={styles.status}>No receipts found for selected dates.</div>;
  }

  return (
    <>
      {showControls && (
        <div className={styles.controls}>
          <span className={styles.summary}>
            {items.length} receipts{(from || to) ? `  |  ${from || ""} to ${to || ""}` : ""}
          </span>
          <button className={styles.printBtn} onClick={() => window.print()}>🖨 Print All</button>
        </div>
      )}
      <div className={styles["receipt-list"]}>
        {items.map((item, idx) => (
          <ReceiptCard key={item.bookingId || item._id || idx} item={item} guides={guides} />
        ))}
      </div>
    </>
  );
}
