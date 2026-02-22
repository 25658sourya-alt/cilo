export default async function handler(req, res) {
  const HF_TOKEN = process.env.HF_TOKEN;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const userMessage =
      req.body.messages?.slice(-1)[0]?.content ||
      req.body.message ||
      "";

    const response = await fetch(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: userMessage,
          parameters: {
            max_new_tokens: 200,
            return_full_text: false
          }
        }),
      }
    );

    const data = await response.json();

    let reply = "";

    if (Array.isArray(data)) {
      reply = data[0]?.generated_text;
    } else if (data.generated_text) {
      reply = data.generated_text;
    } else if (data.error) {
      reply = "Model error: " + data.error;
    }

    if (!reply) {
      reply = "The model is thinking... try again.";
    }

    res.status(200).json({ reply });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
}
