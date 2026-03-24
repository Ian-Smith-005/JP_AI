export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { messages } = await request.json();

    const formattedMessages = messages.map(m => ({
      role: m.role === "model" ? "model" : "user",
      parts: [{ text: m.parts[0].text }]
    }));

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: formattedMessages
        })
      }
    );

    const data = await geminiResponse.json();

    console.log("GEMINI RAW:", JSON.stringify(data)); // 🔥 debug

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    return new Response(
      JSON.stringify({
        reply: reply || "⚠ No response from AI"
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
}