import { useState } from "react";
import { useRouter } from "next/router";
import { FiEye, FiEyeOff } from "react-icons/fi";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import RoleDropdown from "../components/RoleDropdown";
import { registerUser } from "../services/authService";
import withAuth from "../utils/withAuth";

function Register() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "Admin",
  });

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [showPassword, setShowPassword] = useState(false);

  /* ======================================================
     VALIDATION FUNCTIONS
  ====================================================== */

  // Name: Only letters and spaces
  const validateName = (name) => {
    const regex = /^[A-Za-z\s]+$/;
    return regex.test(name.trim());
  };

  // Phone:
  // - Exactly 10 digits
  // - Starts with 6, 7, 8, or 9
  const validatePhone = (phone) => {
    const regex = /^[6-9]\d{9}$/;
    return regex.test(phone.trim());
  };

  // Email format validation
  const validateEmail = (email) => {
    const regex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(
      email.trim().toLowerCase()
    );
  };

  /* ======================================================
     HANDLE INPUT CHANGES
  ====================================================== */
  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  /* ======================================================
     HANDLE FORM SUBMIT
  ====================================================== */
  const handleSubmit = async (e) => {
    e.preventDefault();

    /* ==========================================
       REQUIRED FIELD VALIDATION
    ========================================== */
    setMsg({ text: "", type: "" });

    if (
      !form.name.trim() ||
      !form.email.trim() ||
      !form.phone.trim() ||
      !form.password.trim() ||
      !form.role
    ) {
      setMsg({ text: "Please fill all required fields.", type: "error" });
      return;
    }

    if (!validateName(form.name)) {
      setMsg({ text: "Name should contain only letters and spaces.", type: "error" });
      return;
    }

    if (!validatePhone(form.phone)) {
      setMsg({ text: "Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.", type: "error" });
      return;
    }

    if (!validateEmail(form.email)) {
      setMsg({ text: "Please enter a valid email address.", type: "error" });
      return;
    }

    setLoading(true);

    try {
      /* ==========================================
         CALL REGISTER API
      ========================================== */
      const data = await registerUser({
        name: form.name.trim(),
        email: form.email
          .trim()
          .toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
        role: form.role,
      });

      console.log(
        "REGISTER RESPONSE:",
        data
      );

      /* ==========================================
         SUCCESS
      ========================================== */
      setMsg({ text: data.message || "Registered Successfully! Redirecting...", type: "success" });
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err) {
      console.error(
        "REGISTER ERROR:",
        err
      );

      const message =
        err?.message ||
        "Registration failed";

      /* ==========================================
         DUPLICATE EMAIL
      ========================================== */
      if (message.toLowerCase().includes("email")) {
        setMsg({ text: "This email is already registered.", type: "error" });
      } else if (message.toLowerCase().includes("phone")) {
        setMsg({ text: "This mobile number is already registered.", type: "error" });
      } else if (message.toLowerCase().includes("already exists")) {
        setMsg({ text: "User already exists.", type: "error" });
      } else {
        setMsg({ text: message, type: "error" });
      }
    } finally {
      setLoading(false);
    }
  };

  /* ======================================================
     UI
  ====================================================== */
  return (
    <div className="dashboard">
      <Sidebar />
      <div className="main">
        <Header title="नोंदणी / Register" />

        <div className="auth-container">
          <div className="auth-box">
            <form onSubmit={handleSubmit}>
          {/* Full Name */}
          <input
            type="text"
            name="name"
            placeholder="Full Name"
            className="input"
            value={form.name}
            onChange={handleChange}
            required
          />

          {/* Email */}
          <input
            type="email"
            name="email"
            placeholder="Email"
            className="input"
            value={form.email}
            onChange={handleChange}
            required
          />

          {/* Phone */}
          <input
            type="text"
            name="phone"
            placeholder="Phone Number"
            className="input"
            value={form.phone}
            onChange={handleChange}
            maxLength={10}
            required
          />

          {/* Password */}
          <div className="password-field">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Password"
              className="input"
              value={form.password}
              onChange={handleChange}
              required
            />
            <span
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </span>
          </div>

          {/* Role Dropdown */}
          <RoleDropdown
            value={form.role}
            onChange={handleChange}
          />

          {/* Inline message */}
          {msg.text && (
            <div style={{
              background: msg.type === "success" ? "#dcfce7" : "#fee2e2",
              border: `1px solid ${msg.type === "success" ? "#22c55e" : "#ef4444"}`,
              color: msg.type === "success" ? "#15803d" : "#dc2626",
              borderRadius: "6px", padding: "8px 12px", margin: "10px 0", fontSize: "13px",
            }}>
              {msg.text}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="primary-btn"
            disabled={loading}
          >
            {loading
              ? "Registering..."
              : "Register"}
          </button>
        </form>
        </div>
        </div>
      </div>
    </div>
  );
}

export default withAuth(Register, ["Admin"]);