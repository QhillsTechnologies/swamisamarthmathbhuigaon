import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import withAuth from "../utils/withAuth";

function CheckUpdate() {
  const [currentVersion, setCurrentVersion] = useState("");
  const [status, setStatus] = useState({ state: "idle" });

  useEffect(() => {
    window.ipc.invoke("get-app-version").then(setCurrentVersion);

    const unsubscribe = window.ipc.on("update:status", (payload) => {
      setStatus(payload);
    });
    return unsubscribe;
  }, []);

  const handleCheck = async () => {
    setStatus({ state: "checking" });
    const result = await window.ipc.invoke("update-check");
    if (result?.error) {
      setStatus({ state: "error", message: result.error });
    }
  };

  const handleDownload = () => {
    setStatus({ state: "downloading", percent: 0 });
    window.ipc.send("update-download");
  };

  const handleInstall = () => {
    window.ipc.send("update-install");
  };

  const renderStatus = () => {
    switch (status.state) {
      case "checking":
        return <p style={styles.info}>Checking for updates...</p>;
      case "not-available":
        return <p style={styles.success}>You are already on the latest version.</p>;
      case "available":
        return (
          <div>
            <p style={styles.info}>New version {status.version} is available.</p>
            <button className="primary-btn" onClick={handleDownload}>
              Download Update
            </button>
          </div>
        );
      case "downloading":
        return (
          <div>
            <p style={styles.info}>Downloading update... {status.percent ?? 0}%</p>
            <div style={styles.progressTrack}>
              <div style={{ ...styles.progressFill, width: `${status.percent ?? 0}%` }} />
            </div>
          </div>
        );
      case "downloaded":
        return (
          <div>
            <p style={styles.success}>
              Update {status.version} downloaded. Restart to install it.
            </p>
            <button className="primary-btn" onClick={handleInstall}>
              Restart &amp; Install
            </button>
          </div>
        );
      case "error":
        return <p style={styles.error}>{status.message}</p>;
      default:
        return null;
    }
  };

  const checking = status.state === "checking";

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="main">
        <Header title="Check for Updates" />
        <div style={styles.card}>
          <p style={styles.versionLabel}>Current Version</p>
          <p style={styles.versionValue}>{currentVersion || "—"}</p>

          <button className="primary-btn" onClick={handleCheck} disabled={checking}>
            {checking ? "Checking..." : "Check for Updates"}
          </button>

          <div style={styles.statusWrap}>{renderStatus()}</div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: {
    marginTop: "24px",
    background: "#fff",
    borderRadius: "20px",
    border: "1px solid #f0f0f0",
    boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
    padding: "24px",
    maxWidth: "420px",
  },
  versionLabel: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    marginBottom: "4px",
  },
  versionValue: {
    fontSize: "20px",
    fontWeight: 800,
    color: "#111827",
    marginBottom: "16px",
  },
  statusWrap: {
    marginTop: "16px",
  },
  info: {
    fontSize: "13px",
    color: "#374151",
    marginBottom: "10px",
  },
  success: {
    fontSize: "13px",
    color: "#15803d",
    marginBottom: "10px",
    fontWeight: 600,
  },
  error: {
    fontSize: "13px",
    color: "#dc2626",
    fontWeight: 600,
  },
  progressTrack: {
    width: "100%",
    height: "8px",
    borderRadius: "6px",
    background: "#f3f4f6",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "#f97316",
    transition: "width 0.2s",
  },
};

export default withAuth(CheckUpdate, ["Admin"]);
