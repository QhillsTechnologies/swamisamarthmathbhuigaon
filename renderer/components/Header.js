import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function Header({ title }) {
  const router = useRouter();

  const [user, setUser] = useState({
    name: "",
    role: "",
  });

  useEffect(() => {
    const name = localStorage.getItem("name");
    const role = localStorage.getItem("role");

    if (!name || !role) {
      router.push("/login");
      return;
    }

    setUser({ name, role });
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    router.push("/login");
  };

  return (
    <div className="header">

      <div>
        <h2>{title}</h2>
        <p>Swami Samarth Math, Bhuigaon-Vasai</p>
      </div>

      <div className="role-box">
        {user.name} ({user.role})
        <span className="logout-btn" onClick={handleLogout}>
          Logout
        </span>
      </div>

    </div>
  );
}