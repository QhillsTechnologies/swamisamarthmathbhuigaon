import apiRequest from "./api";

export async function sendReceiptSms({ phone, name, amount, fileName }) {
  const number = String(phone || "").replace(/\D/g, "").slice(-10);
  if (!number) throw new Error("Missing phone number for SMS");

  // send_receipt_sms.web.js's live DLT-approved template hardcodes
  // "https://ssmath-receipts.s3.us-east-1.amazonaws.com/receipts/{#urg#}{#uro#}"
  // and just concatenates urg+uro after it — it does NOT read a `receiptUrl`
  // field. Splitting the filename in half (rather than putting it all in one
  // variable) keeps each half under whatever per-variable length the DLT
  // template was registered with, while still reconstructing the exact
  // filename when the gateway concatenates them back together.
  const name_ = String(fileName || "");
  const mid = Math.ceil(name_.length / 2);
  const urg = name_.slice(0, mid);
  const uro = name_.slice(mid);

  console.log("[sendReceiptSms] request:", { phone: number, name: name || "Devotee", amount, urg, uro });

  const res = await apiRequest("/send_receipt_sms", {
    method: "POST",
    body: JSON.stringify({ phone: number, name: name || "Devotee", amount, urg, uro }),
  });

  // Logged unconditionally, not just on failure: `success` only reflects that
  // the HTTP call to the gateway went through — the gateway can still return
  // 200 with an error string in its own response body (bad auth key, DLT
  // rejection, etc.), which would otherwise report as "sent" with no trace.
  console.log("[sendReceiptSms] response:", res);

  if (!res?.success) throw new Error(res?.providerResponse || "SMS request failed");
  return res.providerResponse;
}
