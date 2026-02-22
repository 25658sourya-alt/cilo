export default async function handler(req, res) {
  const HF_TOKEN = process.env.HF_TOKEN;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!HF_TOKEN) {
    return res.status(500).json({ error: "HF_TOKEN not set in environment variables" });
  }

  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: req.body.message || ""
        }),
      }
    );

    const data = await response.json();

    const reply =
      Array.isArray(data)
        ? data[0]?.generated_text
        : data.generated_text;

    return res.status(200).json({ reply: reply || "No response from model." });

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: "Server error" });
  }
}
