const BASE_URL =
  "https://www.swamisamarthmathbhuigaon.com/_functions";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiRequest(endpoint, options = {}) {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("token")
      : null;

  const headers = {
    "Content-Type": "application/json",
    ...(token
      ? { Authorization: `Bearer ${token}` }
      : {}),
    ...(options.headers || {}),
  };

  // Debug log
  console.log("API URL:", `${BASE_URL}${endpoint}`);

  // GET requests are safe to retry, and worth it: the Wix _functions backend
  // occasionally returns a network failure or an empty/non-JSON body on the
  // very first request right after the app cold-starts (or when the Wix site
  // is still waking up), then works fine a moment later. Non-GET requests
  // (bookings, uploads, SMS) are never retried here — the server may already
  // have applied the write even if the response didn't come back cleanly.
  const method = (options.method || "GET").toUpperCase();
  const maxAttempts = method === "GET" ? 2 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;

    try {
      response = await fetch(
        `${BASE_URL}${endpoint}`,
        {
          ...options,
          headers,
        }
      );
    } catch (err) {
      console.error(`FETCH ERROR (attempt ${attempt}/${maxAttempts}):`, err);
      if (attempt < maxAttempts) {
        await sleep(600);
        continue;
      }
      throw new Error("Unable to connect to the server");
    }

    let data = {};

    try {
      data = await response.json();
    } catch {
      console.error(`INVALID JSON RESPONSE (attempt ${attempt}/${maxAttempts}) for ${endpoint}`);
      if (attempt < maxAttempts) {
        await sleep(600);
        continue;
      }
      throw new Error("Invalid server response");
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        data.message ||
        "API request failed"
      );
    }

    return data;
  }
}

export default apiRequest;