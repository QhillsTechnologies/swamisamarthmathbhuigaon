import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import apiRequest from "../services/api";

export default function DevoteeForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    smarnarth: "",
    name: "",
    address: "",
    phone: "",
    email: "",
    sendSms: false,
  });

  const [searchPhone, setSearchPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("bookingForm") || "{}");
    setForm({
      smarnarth: saved.smarnarth || "",
      name: saved.name || "",
      address: saved.address || "",
      phone: saved.phone || "",
      email: saved.email || "",
      sendSms: !!saved.sendSms,
    });
  }, []);

  // Clear saved devotee details when leaving the booking flow
  // (going to another tab/page, or back and not returning into
  // new-booking / internal-receipt / tax-receipt)
  useEffect(() => {
    // Only these count as "continuing the same booking" (step 2 pages).
    // Going to /new-booking means restarting, so it should clear too.
    const stepTwoPages = ["/internal-receipt", "/tax-receipt"];

    const handleRouteChange = (url) => {
      const stillInFlow = stepTwoPages.some((p) => url.startsWith(p));
      if (!stillInFlow) {
        localStorage.removeItem("bookingForm");
      }
    };

    router.events.on("routeChangeStart", handleRouteChange);
    return () => router.events.off("routeChangeStart", handleRouteChange);
  }, [router]);

  const updateForm = (field, value) => {
    const updated = { ...form, [field]: value };
    setForm(updated);
    const existing = JSON.parse(localStorage.getItem("bookingForm") || "{}");
    localStorage.setItem("bookingForm", JSON.stringify({ ...existing, ...updated }));
  };

  const handlePhoneSearch = async (phone) => {
    setSearchMessage("");
    if (phone.length < 10) return;

    try {
      setSearching(true);
      const data = await apiRequest("/Bookings");
      const allBookings = Array.isArray(data) ? data : data.bookings || [];
      const matches = allBookings.filter(
        (b) => String(b.phone || "").trim() === phone.trim()
      );

      if (matches.length > 0) {
        const latest = matches.sort(
          (a, b) => new Date(b.createdAt || b.bookingDate) - new Date(a.createdAt || a.bookingDate)
        )[0];

        const updated = {
          smarnarth: latest.smarnarth || "",
          name: latest.name || "",
          address: latest.address || "",
          phone: String(latest.phone || phone),
          email: latest.email || "",
          sendSms: form.sendSms,
        };

        setForm(updated);
        const existing = JSON.parse(localStorage.getItem("bookingForm") || "{}");
        localStorage.setItem("bookingForm", JSON.stringify({ ...existing, ...updated }));
        setSearchMessage("भक्त सापडले! तपशील आपोआप भरले.");
      } else {
        setSearchMessage("भक्त सापडले नाही. कृपया तपशील स्वतः भरा.");
      }
    } catch (err) {
      setSearchMessage("भक्त सापडले नाही. कृपया तपशील स्वतः भरा.");
      console.log("Phone search failed:", err.message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="devotee-form">

      {/* PHONE SEARCH BOX — renamed to Search Devotee */}
      <h3>भक्त शोधा / Search Devotee</h3>
      <input
        className="input"
        placeholder="फोन नंबर टाका / Enter Phone to Auto-fill"
        value={searchPhone}
        maxLength={10}
        onChange={(e) => {
          const value = e.target.value;
          if (/^\d*$/.test(value) && value.length <= 10) {
            setSearchPhone(value);

            if (value.length === 0) {
              const empty = { smarnarth: "", name: "", address: "", phone: "", email: "", sendSms: form.sendSms };
              setForm(empty);
              setSearchMessage("");
              const existing = JSON.parse(localStorage.getItem("bookingForm") || "{}");
              localStorage.setItem("bookingForm", JSON.stringify({ ...existing, ...empty }));
            } else {
              handlePhoneSearch(value);
            }
          }
        }}
      />
      {searching && <p style={{ padding: "5px", color: "gray" }}>शोधत आहे...</p>}
      {searchMessage && <p style={{ padding: "5px" }}>{searchMessage}</p>}

      {/* DEVOTEE DETAILS */}
      <h3 style={{ marginTop: "15px" }}>भक्त माहिती / Devotee Information</h3>

      <input
        className="input"
        placeholder="स्मरणार्थ / Smarnarth"
        value={form.smarnarth}
        onChange={(e) => updateForm("smarnarth", e.target.value)}
      />

      <input
        className="input"
        placeholder="नाव / Name *"
        value={form.name}
        onChange={(e) => {
          const value = e.target.value;
          if (/^[A-Za-z\s]*$/.test(value)) updateForm("name", value);
        }}
      />

      <input
        className="input"
        placeholder="पत्ता / Address"
        value={form.address}
        onChange={(e) => updateForm("address", e.target.value)}
      />

      <input
        className="input"
        placeholder="फोन / Phone *"
        value={form.phone}
        maxLength={10}
        onChange={(e) => {
          const value = e.target.value;
          if (/^\d*$/.test(value) && value.length <= 10) updateForm("phone", value);
        }}
      />

      <input
        className="input"
        placeholder="Email"
        type="email"
        value={form.email}
        onChange={(e) => updateForm("email", e.target.value)}
      />

      <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", fontSize: "14px" }}>
        <input
          type="checkbox"
          checked={!!form.sendSms}
          onChange={(e) => updateForm("sendSms", e.target.checked)}
        />
        पावतीची लिंक SMS द्वारे पाठवा / Send receipt link via SMS
      </label>
    </div>
  );
}