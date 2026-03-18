// backend/server.js
const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = "AIzaSyDXwa1e9fzjUWxzD_NFM5LiwrKT0_Ys21c";

app.post("/chat", async (req, res) => {
  const conversation = req.body.conversation;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a helpful photography studio AI assistant.
Conversation:
${conversation.map((c) => `${c.role}: ${c.content}`).join("\n")}
Assistant:`,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(3000, () => console.log("Server running at http://localhost:3000"));