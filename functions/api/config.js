// functions/api/config.js
// Exposes safe public env vars to the browser.
// NEVER expose SERVICE_KEY here — anon key only.

export async function onRequestGet(context) {
  const { env } = context;
  return new Response(
    JSON.stringify({
      supabaseUrl: env.SUPABASE_URL || "",
      supabaseAnon: env.SUPABASE_ANON_KEY || "",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}