import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import withAuth from "../utils/withAuth";
import apiRequest from "../services/api";
import Pagination from "../components/Pagination";
import PurposeMultiSelect from "../components/PurposeMultiSelect";

function Reports() {
  /* ======================================================
     STATES
  ====================================================== */
  const [reportData, setReportData] = useState([]);
  const [receiptType, setReceiptType] = useState("All");
  const [purposeOptions, setPurposeOptions] = useState([]);
const [selectedPurposes, setSelectedPurposes] = useState([]);
const [tomorrowOnly, setTomorrowOnly] = useState(false);
const [selectedIds, setSelectedIds] = useState(new Set());
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [amountOperator, setAmountOperator] = useState("");
  const [amountValue, setAmountValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [reportMsg, setReportMsg] = useState({ text: "", type: "" });
  const [viewType, setViewType] = useState("All Details");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;


  /* ======================================================
     INITIAL LOAD
  ====================================================== */
  useEffect(() => {
    const loadReportsPage = async () => {
      setLoading(true);
      try {
        await fetchReports(false);
      } catch (err) {
        console.error("Reports load error:", err);
      }
      setLoading(false);
    };

    loadReportsPage();
  }, []);

  useEffect(() => {
    const loadPurposes = async () => {
      try {
        const data = await apiRequest("/get_seva_list");
        const list = data.sevaList || [];
        const names = [...new Set(list.map((s) => s.displayName).filter(Boolean))].sort();
        setPurposeOptions(names);
      } catch (err) {
        console.error("Purpose list fetch error:", err);
      }
    };
    loadPurposes();
  }, []);

  /* ======================================================
     RESET PAGE WHEN VIEW TYPE / AMOUNT FILTER CHANGES
  ====================================================== */
  useEffect(() => {
    setCurrentPage(1);
  }, [viewType, amountOperator, amountValue, selectedPurposes, tomorrowOnly]);

  /* ======================================================
     FETCH FILTERED REPORTS
  ====================================================== */
  const fetchReports = async (showAlert = true) => {
    try {
      const params = new URLSearchParams();
      if (receiptType && receiptType !== "All") params.append("receiptType", receiptType);
      if (fromDate) params.append("fromDate", fromDate);
      if (toDate) params.append("toDate", toDate);

      const query = params.toString() ? `?${params.toString()}` : "";
      const data = await apiRequest(`/reports${query}`);
      setReportData(data.reports || []);
      setCurrentPage(1);
    } catch (err) {
      console.error("Reports fetch error:", err);
      if (showAlert) setReportMsg({ text: err.message || "Unable to connect to the server", type: "error" });
      setReportData([]);
    }
  };

  /* ======================================================
     CALCULATE SUMMARY FROM FILTERED DATA
  ====================================================== */
  const getCalculatedStats = (data = reportData) => {
    const totalRevenue = data
      .filter((item) => (item.status || "").toLowerCase().trim() !== "cancelled")
      .reduce((sum, item) => sum + Number(item.paidAmount || item.advance || 0), 0);

    const pendingMap = new Map();
    data.forEach((item) => {
      if ((item.status || "").toLowerCase().trim() !== "pending") return;
      const groupId = item.bookingGroupId || item._id;
      if (!pendingMap.has(groupId)) {
        pendingMap.set(groupId, Number(item.remainingAmount || 0));
      }
    });

    const pendingDues = Array.from(pendingMap.values()).reduce((sum, v) => sum + v, 0);

    return {
      totalRevenue,
      totalBookings: data.length,
      pendingDues,
    };
  };

  /* ======================================================
     CSV DOWNLOAD
  ====================================================== */
  const handleDownload = async (data = []) => {
    try {
      if (!data || data.length === 0) {
        setReportMsg({ text: "No report data found for the selected filters.", type: "error" });
        return;
      }



      const headers = [
        "Booking ID", "Name", "Phone", "Purpose",
        "Receipt Type", "Bank", "Total Amount", "Paid Amount",
        "Remaining Amount", "Status", "Booking Date", "Created Date", "Created By",
      ];

      const rows = data.map((item) => [

        item.bookingId || "",
        item.name || "",
        item.phone || "",
        item.purpose || "",
        item.receiptType || "",
        item.bank || item.paymentType || "",
        item.amount || 0,
        item.advance || 0,
        item.remainingAmount || 0,
        item.status || "",
        formatBookingDateDisplay(item, ""),
        formatCreatedDateDisplay(item, ""),
        item.createdBy || "",
      ]);

      const csvContent = [headers, ...rows]
        .map((row) =>
          row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");

      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, "0");
      const d = String(today.getDate()).padStart(2, "0");
      const filename = `booking-report-${y}-${m}-${d}.csv`;

      if (window.ipc?.invoke) {
        // Save via the main process so the file always keeps its .csv
        // extension — a plain <a download> blob link doesn't reliably
        // preserve the extension in the packaged Electron build.
        const result = await window.ipc.invoke("save-csv-report", {
          filename,
          content: csvContent,
        });
        if (!result?.success && !result?.canceled) {
          setReportMsg({ text: result?.error || "Failed to download report.", type: "error" });
        }
        return;
      }

      const BOM = "﻿";
      const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV download error:", err);
      setReportMsg({ text: "Failed to download report.", type: "error" });
    }
  };

  /* ======================================================
     LOADING UI
  ====================================================== */
  if (loading) {
    return (
      <div className="dashboard">
        <Sidebar />
        <div className="main">
          <Header title="अहवाल / Reports" />
          <p style={{ padding: "20px" }}>Loading reports...</p>
        </div>
      </div>
    );
  }

  /* ======================================================
     UI
  ====================================================== */
  const filteredData = reportData.filter((item) => {
    if (amountOperator && amountValue !== "") {
      const itemAmt = Number(item.amount || 0);
      const filterAmt = Number(amountValue);
      if (amountOperator === "=" && itemAmt !== filterAmt) return false;
      if (amountOperator === ">=" && itemAmt < filterAmt) return false;
      if (amountOperator === "<=" && itemAmt > filterAmt) return false;
    }

    if (selectedPurposes.length > 0 && !selectedPurposes.includes(item.purpose)) {
      return false;
    }

    if (tomorrowOnly) {
      if (!item.bookingDate) return false;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const itemDate = new Date(item.bookingDate);
      itemDate.setHours(0, 0, 0, 0);
      if (itemDate.getTime() !== tomorrow.getTime()) return false;
    }

    return true;
  });

  // ViewType: when Devotee Details is selected, deduplicate by phone
  const displayData = viewType === "Devotee Details"
    ? filteredData.filter((item, index, self) =>
        index === self.findIndex((t) => t.phone === item.phone)
      )
    : filteredData;

  const pagedData = displayData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const { totalRevenue, totalBookings, pendingDues } = getCalculatedStats(displayData);


  // ── Reusable filter row config ──
  // Instead of repeating <div className="filter-left"> 4 times,
  // define the filters as data and render them in one map()
  const filters = [
    {
      label: "View Type",
      element: (
        <select
          className="input"
          value={viewType}
          onChange={(e) => setViewType(e.target.value)}
        >
          <option value="All Details">All Details</option>
          <option value="Devotee Details">Devotee Details</option>
        </select>
      ),
    },
    {
      label: "Receipt Type",
      element: (
        <select
          className="input"
          value={receiptType}
          onChange={(e) => setReceiptType(e.target.value)}
        >
          <option value="All">All Receipts</option>
          <option value="Internal">Shree Swami Samarth Receipt</option>
          <option value="Tax">Income Tax Receipt</option>
        </select>
      ),
    },
    {
      label: "Purpose",
      element: (
        <PurposeMultiSelect
          options={purposeOptions}
          selected={selectedPurposes}
          onChange={setSelectedPurposes}
        />
      ),
    },
    {
      label: "From Date",


      element: (
        <input
          type="date"
          className="input"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
      ),
    },
    {
      label: "To Date",
      element: (
        <input
          type="date"
          className="input"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />
      ),
    },
    {
      label: "Amount Filter",

      element: (
        <select
          className="input"
          value={amountOperator}
          onChange={(e) => { setAmountOperator(e.target.value); setAmountValue(""); }}
        >
          <option value="">No Amount Filter</option>
          <option value="=">= Equal to</option>
          <option value=">=">≥ Greater than or equal</option>
          <option value="<=">≤ Less than or equal</option>
        </select>
      ),
    },

    {
      label: "Amount (₹)",
      element: (
        <input
          type="number"
          className="input"
          placeholder={amountOperator ? "Enter amount" : "Select filter first"}
          value={amountValue}
          min="0"
          disabled={!amountOperator}
          onChange={(e) => setAmountValue(e.target.value)}
          onWheel={(e) => e.target.blur()}
        />
      ),
    },
  ];

  // Multi-date bookings (e.g. Abhishek/seva booked across several dates)
  // store all of them in item.multiDates — show every one instead of just
  // the single bookingDate (which the backend only fills with the earliest
  // date, for records/sorting).
  const formatBookingDateDisplay = (item, emptyValue = "-") => {
    if (Array.isArray(item.multiDates) && item.multiDates.length > 1) {
      return item.multiDates
        .slice()
        .sort()
        .map((d) => new Date(d).toLocaleDateString("en-GB"))
        .join(", ");
    }
    return item.bookingDate
      ? new Date(item.bookingDate).toLocaleDateString("en-GB")
      : emptyValue;
  };

  // Created date = when the record itself was created/paid (backend's
  // createdAt, falling back to Wix's own _createdDate) — distinct from
  // bookingDate, which is the seva/event date and can fall outside the
  // range the entry was actually created/paid in.
  const formatCreatedDateDisplay = (item, emptyValue = "-") => {
    const created = item.createdAt || item._createdDate;
    return created ? new Date(created).toLocaleDateString("en-GB") : emptyValue;
  };

  // ── Reusable table column config ──
  // Instead of repeating <td> blocks, define columns as data
  const columns = [
    { header: "Booking ID",   render: (item) => item.bookingId || "-" },
    { header: "Name",         render: (item) => item.name || "-" },
    { header: "Phone",        render: (item) => item.phone || "-" },
    { header: "Purpose",      render: (item) => item.purpose || "-" },
    { header: "Total Amount", render: (item) => `₹${Number(item.amount || 0).toLocaleString("en-IN")}` },
    { header: "Paid Amount",  render: (item) => `₹${Number(item.paidAmount || item.advance || 0).toLocaleString("en-IN")}` },
    { header: "Remaining",    render: (item) => `₹${Number(item.remainingAmount || 0).toLocaleString("en-IN")}` },
    { header: "Status",       render: (item) => item.status || "-" },
    {
      header: "Booking Date",
      render: (item) => formatBookingDateDisplay(item),
    },
    {
      header: "Created Date",
      render: (item) => formatCreatedDateDisplay(item),
    },
    { header: "Created By",   render: (item) => item.createdBy || "-" },
  ];

  const devoteeColumns = [
    { header: "Name",    render: (item) => item.name    || "-" },
    { header: "Phone",   render: (item) => item.phone   || "-" },
    { header: "Email",   render: (item) => item.email   || "-" },
    { header: "Address", render: (item) => item.address || "-" },
  ];

  const activeColumns = viewType === "Devotee Details" ? devoteeColumns : columns;

  /* ======================================================
     ROW SELECTION + PRINT SELECTED
  ====================================================== */
  const toggleSelectRow = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allPagedSelected =
    displayData.length > 0 && displayData.every((item) => selectedIds.has(item._id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPagedSelected) displayData.forEach((item) => next.delete(item._id));
      else displayData.forEach((item) => next.add(item._id));
      return next;
    });
  };

  const buildPrintItem = (item) => ({
    bookingId:      item.bookingId  || "",
    _createdDate:   item.createdAt || item._createdDate || "",
    bookingDate:    item.bookingDate || "",
    multiDates:     item.multiDates  || [],
    name:           item.name       || "",
    phone:          item.phone      || "",
    address:        item.address    || "",
    purpose:        item.purpose    || "",
    gotra:          item.gotra      || "",
    amount:         item.paidAmount ?? item.advance ?? item.amount ?? 0,
    advance:        item.paidAmount ?? item.advance ?? item.amount ?? 0,
    bank:           item.bank       || item.paymentType || "",
    smarnarth:      item.smarnarth  || "",
    remainingAmount: item.remainingAmount || 0,
    orderId:        item.orderId || item._id || "",
    chequeNumber:   item.chequeNumber || "",
    payingBankName: item.payingBankName || "",
    panCard:        item.panCard || "",
  });

  const handlePrintSelected = () => {
    const rowsToPrint = displayData.filter((item) => selectedIds.has(item._id));
    if (rowsToPrint.length === 0) {
      setReportMsg({ text: "Please select at least one record to print.", type: "error" });
      return;
    }

    // 80G bookings use the new pre-printed 80G pavati layout (Receipt80G);
    // everything else keeps printing on the existing pavati template.
    const rows80G   = rowsToPrint.filter((item) => item.is80G);
    const rowsNormal = rowsToPrint.filter((item) => !item.is80G);

    if (rowsNormal.length > 0) {
      const items = rowsNormal.map(buildPrintItem);
      const templateUrl = `${window.location.origin}/receipt-template.html`;
      const printWin = window.open(templateUrl, "_blank");

      const handler = (event) => {
        if (event.data && event.data.type === "iframeReady") {
          window.removeEventListener("message", handler);
          printWin.postMessage(
            { action: "showReceipts", items, from: fromDate, to: toDate },
            "*"
          );
        }
      };
      window.addEventListener("message", handler);
    }

    if (rows80G.length > 0) {
      const items = rows80G.map(buildPrintItem);
      localStorage.setItem(
        "bulkReceipts80G",
        JSON.stringify({ items, from: fromDate, to: toDate })
      );
      window.open(`${window.location.origin}/receipt-bulk-80g`, "_blank");
    }
  };

  return (
    <div className="dashboard">
      <Sidebar />

      <div className="main">
        <Header title="अहवाल / Reports" />

        {/* INLINE MESSAGE */}
        {reportMsg.text && (
          <div style={{
            background: reportMsg.type === "success" ? "#dcfce7" : "#fee2e2",
            border: `1px solid ${reportMsg.type === "success" ? "#22c55e" : "#ef4444"}`,
            color: reportMsg.type === "success" ? "#15803d" : "#dc2626",
            borderRadius: "6px", padding: "8px 12px", margin: "10px 0", fontSize: "13px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span>{reportMsg.text}</span>
            <button onClick={() => setReportMsg({ text: "", type: "" })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px" }}>x</button>
          </div>
        )}

        {/* ── STATS ── */}
        <div className="reports-stats">
          <div className="reports-card">
            <p>Total Revenue</p>
            <h2 className="green">₹{totalRevenue.toLocaleString("en-IN")}</h2>
          </div>
          <div className="reports-card">
            <p>Bookings</p>
            <h2 className="orange">{totalBookings}</h2>
          </div>
          <div className="reports-card">
            <p>Pending Dues</p>
            <h2 className="orange">₹{pendingDues.toLocaleString("en-IN")}</h2>
          </div>
        </div>

        {/* ── FILTERS ── */}
        <div className="reports-filter">
          {filters.map(({ label, element }) => (
            <div key={label} className="filter-left">
              <label className="label">{label}</label>
              {element}
            </div>
          ))}

          {/* Both buttons in one centered row below filters */}
          <div className="filter-btn-row">
            <button
              className="apply-filter-btn"
              onClick={async () => {
                setLoading(true);
                try {
                  await fetchReports(true);
                } catch (err) {
                  console.error("Filter apply error:", err);
                } finally {
                  setLoading(false);
                }
              }}
            >
              Apply Filters
            </button>

            <button
              className="clear-filters-btn"
              onClick={async () => {
                setReceiptType("All");
                setSelectedPurposes([]);
                setFromDate("");
                setToDate("");
                setAmountOperator("");
                setAmountValue("");
                setTomorrowOnly(false);
                setCurrentPage(1);
                setSelectedIds(new Set());
                setLoading(true);
                try {
                  const data = await apiRequest("/reports");
                  setReportData(data.reports || []);
                } catch (err) {
                  console.error("Clear filters fetch error:", err);
                  setReportMsg({ text: err.message || "Unable to reload reports", type: "error" });
                } finally {
                  setLoading(false);
                }
              }}
            >
              Clear Filters
            </button>

            <button
              className="download-report-btn"
              onClick={handlePrintSelected}
            >
              Print Selected
            </button>

            <button
              className="download-report-btn"
              onClick={() =>
                handleDownload(
                  selectedIds.size > 0
                    ? displayData.filter((item) => selectedIds.has(item._id))
                    : displayData
                )
              }
            >
              ⬇ Download Report
            </button>
          </div>
        </div>

        {/* ── Tomorrow's Bookings ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            margin: "10px 0",
            fontSize: "14px",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={tomorrowOnly}
              onChange={(e) => setTomorrowOnly(e.target.checked)}
            />
            Tomorrow's Bookings Only
          </label>
        </div>

        {/* ── RECORD COUNT ── */}
        <div className="reports-total">
          Total Records: {displayData.length}
          {displayData.length !== reportData.length && (
            <span style={{ marginLeft: "10px", color: "#f97316", fontSize: "13px", fontWeight: 600 }}>
              (filtered from {reportData.length})
            </span>
          )}
          {displayData.length > ITEMS_PER_PAGE && (
            <span style={{ marginLeft: "10px", color: "#6b7280", fontSize: "13px" }}>
              — Page {currentPage} of {Math.ceil(displayData.length / ITEMS_PER_PAGE)}
            </span>
          )}
        </div>

        {/* ── TABLE ── */}
        <div className="table-wrapper">
          <table className="report-table">
            <thead>
              <tr>
                <th>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="checkbox"
                      checked={allPagedSelected}
                      onChange={toggleSelectAll}
                    />
                  </label>
                </th>
                {activeColumns.map(({ header }) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedData.map((item, index) => (
                <tr key={item._id || index}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item._id)}
                      onChange={() => toggleSelectRow(item._id)}
                    />
                  </td>
                  {activeColumns.map(({ header, render }) => (
                    <td key={header}>{render(item)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalItems={displayData.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
}

export default withAuth(Reports, ["Admin", "Accountant"]);