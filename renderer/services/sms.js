import apiRequest from "./api";

export async function sendReceiptSms({ phone, name, amount, receiptUrl }) {
  const number = String(phone || "").replace(/\D/g, "").slice(-10);
  if (!number) throw new Error("Missing phone number for SMS");

  console.log("[sendReceiptSms] request:", { phone: number, name: name || "Devotee", amount, receiptUrl: receiptUrl || "" });

  const res = await apiRequest("/send_receipt_sms", {
    method: "POST",
    body: JSON.stringify({ phone: number, name: name || "Devotee", amount, receiptUrl: receiptUrl || "" }),
  });

  // Logged unconditionally, not just on failure: `success` only reflects that
  // the HTTP call to the gateway went through — the gateway can still return
  // 200 with an error string in its own response body (bad auth key, DLT
  // rejection, etc.), which would otherwise report as "sent" with no trace.
  console.log("[sendReceiptSms] response:", res);

  if (!res?.success) throw new Error(res?.providerResponse || "SMS request failed");
  return res.providerResponse;
}
