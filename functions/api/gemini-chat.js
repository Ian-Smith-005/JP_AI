export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { messages } = await request.json();

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: messages
        })
      }
    );

    const data = await geminiResponse.json();

    console.log("STATUS:", geminiResponse.status);
    console.log("DATA:", JSON.stringify(data));

    if (!geminiResponse.ok) {
      return new Response(JSON.stringify(data), { status: 500 });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I'm here to help!";

    return new Response(JSON.stringify({ reply }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (err) {
    console.log("SERVER ERROR:", err);

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
}