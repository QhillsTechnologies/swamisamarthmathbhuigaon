import { useState } from "react";
import { useRouter } from "next/router";
import { FiEye, FiEyeOff } from "react-icons/fi";
import {
  loginUser,
  saveAuthData,
} from "../services/authService";

export default function Login() {
  const router = useRouter();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // ===============================
  // Handle Input Change
  // ===============================
  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });

    // Clear error when user types
    setError("");
  };

  // ===============================
  // Handle Login Submit
  // ===============================
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Clear old error
    setError("");

    // Basic validation
    if (!form.email.trim() || !form.password.trim()) {
      setError("Please enter email and password.");
      return;
    }

    setLoading(true);

    try {
      // Call login API
      const result = await loginUser({
        email: form.email.toLowerCase().trim(),
        password: form.password,
      });

      console.log("LOGIN RESPONSE:", result);

      // If login failed
      if (!result.success) {
        setError(result.message || "Invalid email or password.");
        return; // IMPORTANT: Stop here, do not redirect
      }

      // Save token + user data
      saveAuthData(result.data);

      router.push("/dashboard");
    } catch (err) {
      console.error("LOGIN ERROR:", err);
      setError(
        err.message || "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  };

  // ===============================
  // UI
  // ===============================
  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2>लॉगिन / Login</h2>

        <form onSubmit={handleSubmit}>
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

          {/* Error Message */}
          {error && (
            <p
              style={{
                color: "red",
                marginTop: "10px",
                marginBottom: "10px",
                fontSize: "14px",
              }}
            >
              {error}
            </p>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="primary-btn"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}