export default async function handler(req, res) {
  const HF_TOKEN = process.env.HF_TOKEN;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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
          inputs: req.body.messages?.slice(-1)[0]?.content || ""
        }),
      }
    );

    const data = await response.json();

    const reply =
      Array.isArray(data)
        ? data[0]?.generated_text
        : data.generated_text;

    res.status(200).json({ reply });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
}
