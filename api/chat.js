// api/chat.js
// Robust Vercel serverless handler for calling Hugging Face router endpoint.
// - Expects POST { message: "..." } (or { messages: [...] } if you prefer).
// - Returns { reply: "..." } on success, or { error: "..." } on failure.

export default async function handler(req, res) {
  // Basic method + env checks
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const HF_TOKEN = process.env.HF_TOKEN;
  const HF_MODEL = process.env.HF_MODEL || "mistralai/Mistral-7B-Instruct-v0.2";
  if (!HF_TOKEN) {
    return res.status(500).json({ error: "HF_TOKEN not configured in environment" });
  }

  // ---------- Simple rate limiter (per IP) ----------
  // NOTE: in serverless, this is in-memory per instance and not a global quota.
  // For production use Redis or another persistent store.
  try {
    const LIM_WINDOW_MS = 60_000; // 60s
    const LIM_MAX = 30; // max requests per window per IP
    if (!global.__cilo_rate) global.__cilo_rate = {};
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "anon").split(",")[0].trim();
    const now = Date.now();
    const record = global.__cilo_rate[ip] || { ts: now, count: 0 };
    if (now - record.ts > LIM_WINDOW_MS) {
      record.ts = now;
      record.count = 0;
    }
    record.count += 1;
    global.__cilo_rate[ip] = record;
    if (record.count > LIM_MAX) {
      return res.status(429).json({ error: "Rate limit exceeded. Try again shortly." });
    }
  } catch (e) {
    // don't fail the request on limiter errors
    console.warn("rate limiter error", e);
  }

  // ---------- Read + sanitize input ----------
  const body = req.body || {};
  let userMessage =
    typeof body.message === "string"
      ? body.message
      : Array.isArray(body.messages) && body.messages.length
      ? String(body.messages.slice(-1)[0].content || "")
      : "";

  userMessage = String(userMessage || "").trim();
  if (!userMessage) return res.status(400).json({ error: "Empty message" });

  // Limit message length
  const MAX_INPUT_CHARS = 4000;
  if (userMessage.length > MAX_INPUT_CHARS) {
    userMessage = userMessage.slice(-MAX_INPUT_CHARS); // keep last part
  }

  // ---------- Quick content safety filter ----------
  // These are conservative, explicit checks for dangerous requests.
  // This is not exhaustive; use a professional content-moderation product for production.
  const lower = userMessage.toLowerCase();
  const bannedPatterns = [
    /how to kill/, /how to make a bomb/, /build a bomb/, /detonate/,
    /suicide/, /how to die/, /i want to die/, /hang myself/, /kill myself/,
    /harm (someone|others)/, /hurt (someone|others)/,
    /manufacture.*weapon/, /assemble.*gun/, /illicit drug/, /produce meth/,
    /child sexual/, /sexual.*minor/, /\bpedophile\b/,
    /steal credit card/, /carding/, /explosives instruction/, /bypass (security|captcha)/
  ];
  for (const rx of bannedPatterns) {
    if (rx.test(lower)) {
      // Friendly safe refusal
      return res.status(200).json({
        reply:
          "I can't help with that. If you're feeling unsafe or thinking about harming yourself, please contact a trusted person in your life or local emergency services."
      });
    }
  }

  // ---------- Call Hugging Face Router with timeout ----------
  const HF_URL = `https://router.huggingface.co/models/${HF_MODEL}`;

  // Timeout
  const TIMEOUT_MS = 24000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const hfPayload = {
      inputs: userMessage,
      parameters: {
        max_new_tokens: 400,
        temperature: 0.7
      }
    };

    const hfResp = await fetch(HF_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(hfPayload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    // If HF returns non-JSON or an error, handle gracefully
    let data;
    try {
      data = await hfResp.json();
    } catch (e) {
      console.error("hf non-json response", e);
      return res.status(502).json({ error: "Model returned non-JSON response" });
    }

    // ---------- Parse typical HF response shapes ----------
    // - Many HF router models return [{ generated_text: "..." }]
    // - Some return { generated_text: "..." } or { error: "..." }
    let reply = "";
    if (Array.isArray(data) && data[0] && typeof data[0].generated_text === "string") {
      reply = data[0].generated_text;
    } else if (data && typeof data.generated_text === "string") {
      reply = data.generated_text;
    } else if (data && typeof data.output === "string") { // older shapes
      reply = data.output;
    } else if (data && data.error) {
      // model-level error; surface a friendly message
      console.warn("HF model error object:", data.error);
      return res.status(200).json({ reply: `Model error: ${data.error}` });
    } else {
      // unexpected shape
      console.warn("Unexpected HF response shape:", data);
      return res.status(200).json({ reply: "No response from model." });
    }

    // Trim and safeguard length
    if (typeof reply === "string") {
      reply = reply.trim();
      // optionally enforce a max length
      const MAX_REPLY = 8000;
      if (reply.length > MAX_REPLY) reply = reply.slice(0, MAX_REPLY) + "...";
    } else {
      reply = String(reply);
    }

    // Final content-safety check on model reply (e.g. model echoing banned content)
    const replyLower = reply.toLowerCase();
    for (const rx of bannedPatterns) {
      if (rx.test(replyLower)) {
        return res.status(200).json({
          reply:
            "I can't assist with that topic. If you need urgent help, please contact local services or someone you trust."
        });
      }
    }

    // Success
    return res.status(200).json({ reply });
  } catch (err) {
    clearTimeout(timeout);
    // Distinguish abort vs other errors
    if (err.name === "AbortError") {
      console.error("HF request timed out");
      return res.status(504).json({ error: "Model request timed out" });
    }
    console.error("chat.js exception:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
