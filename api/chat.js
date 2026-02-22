export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages } = req.body;
  const lastMessage = messages?.[messages.length - 1]?.content || "";

  // Simple safety filter
  const banned = [
    "suicide",
    "how to kill",
    "build a bomb",
    "hurt someone",
    "child sexual",
    "illegal drugs recipe"
  ];

  if (banned.some(w => lastMessage.toLowerCase().includes(w))) {
    return res.status(200).json({
      reply: "I can't help with that request. If you're struggling, please reach out to someone you trust."
    });
  }

  return res.status(200).json({
    reply: "Cilo is now connected to its backend. Next step: attach a real AI model."
  });
}
