import { useRouter } from "next/router";

export default function PrintOptionsModal({ onClose, booking }) {
  const router = useRouter();

  // 🔥 HANDLE NAVIGATION WITH DATA
  const handlePrint = (type) => {
    onClose();

    if (type === "list") {
      router.push("/schedule-print");
    } else {
      // 👉 pass booking data (future ready)
      router.push({
        pathname: "/internal-print",
        query: booking || {},
      });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal print-modal">

        <h3 className="modal-title">Select Print Type</h3>
        <p className="modal-subtitle">
          Choose how you want to print
        </p>

        <div className="modal-actions">

          {/* LIST PRINT */}
          <button
            className="primary-btn"
            onClick={() => handlePrint("list")}
          >
            List Print
          </button>

          {/* INTERNAL PRINT */}
          <button
            className="primary-btn"
            onClick={() => handlePrint("internal")}
          >
            Internal Receipt
          </button>

        </div>

        {/* CANCEL */}
        <button
          className="secondary-btn cancel-btn"
          onClick={onClose}
        >
          Cancel
        </button>

      </div>
    </div>
  );
}