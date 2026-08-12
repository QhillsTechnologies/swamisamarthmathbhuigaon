import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function Sidebar() {
  const router = useRouter();
  const [role, setRole] = useState(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setRole(localStorage.getItem("role"));
    }
  }, []);

  const ROLE_MENU = {
    Admin: ["dashboard", "new_booking", "all_bookings", "schedule", "reports", "add_seva", "register", "profile", "check_update"],
    "Entry Operator": ["dashboard", "new_booking", "all_bookings", "schedule", "profile"],
    Accountant: ["dashboard", "new_booking", "all_bookings", "reports", "profile"],
  };

  const menu = [
    { key: "dashboard",    name: "Dashboard",           path: "/dashboard" },
    { key: "new_booking",  name: "New Booking",         path: "/new-booking" },
    { key: "all_bookings", name: "All Bookings",        path: "/all-bookings" },
    { key: "schedule",     name: "Tomorrow's Schedule", path: "/tomorrow-schedule" },
    { key: "reports",      name: "Reports",             path: "/reports" },
    { key: "add_seva",     name: "Add Seva",            path: "/add-seva" },
    { key: "register",     name: "Register User",       path: "/register" },
    { key: "profile",      name: "My Profile",          path: "/profile" },
    { key: "check_update", name: "Check for Updates",   path: "/check-update" },
  ];

  const allowedMenu = role
    ? menu.filter((item) => ROLE_MENU[role]?.includes(item.key))
    : [];

  const handleLogout = () => {
    localStorage.clear();
    router.push("/login");
  };

  if (role === null) {
    return (
      <div className="sidebar">
        <p style={{ padding: "20px" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="sidebar">
      {/* Logo */}
      <div className="logo">
        <img
          src="/images/Swami Samarath.jpeg"
          alt="Swami Samarth"
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            objectFit: "cover",
            border: "2px solid #f97316",
            flexShrink: 0,
          }}
        />
        <div>
          श्री स्वामी समर्थ सेवा परिवार
          <div className="sub-logo">भुईगाव-वसई</div>
        </div>
      </div>

      {/* Menu title */}
      <div className="menu-title">Menu</div>

      {/* Dynamic menu items */}
      {allowedMenu.map((item) => {
        const isActive = router.pathname === item.path;
        return (
          <div
            key={item.key}
            className={`menu-item ${isActive ? "active" : ""}`}
            onClick={() => router.push(item.path)}
          >
              {item.name}
          </div>
        );
      })}

      {/* Logout */}
      <div className="menu-item logout" onClick={handleLogout}>
        बाहेर पडा
      </div>
    </div>
  );
}