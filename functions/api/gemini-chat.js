// gemini-chat.js (fixed)
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { messages } = await request.json();

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // ✅ System prompt goes HERE, not inside contents
          system_instruction: {
            parts: [{
              text: `You are Joy, the AI assistant for Joyalty Photography Studio based in Nairobi, Kenya.
You are warm, professional, and concise. You help clients with:
- Services: Wedding Photography, Portrait Sessions, Commercial Shoots, Event Coverage
- Pricing: Wedding from KSh 35,000 | Portraits from KSh 8,000 | Events from KSh 15,000
- Bookings: When a client wants to book, say "I'll get that set up for you!" then trigger the booking flow
- Location: Nairobi, Kenya. Contact: info@joyalty.com | +254 XXX XXX
Never make up prices or services not listed above. Keep replies under 3 sentences unless explaining pricing.`
            }]
          },
          contents: messages  // ✅ Only the actual conversation goes here
        })
      }
    );

    const data = await geminiResponse.json();
    if (!geminiResponse.ok) return new Response(JSON.stringify(data), { status: 500 });

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "I'm here to help!";

    return new Response(JSON.stringify({ reply }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}