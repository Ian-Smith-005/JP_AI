// functions/api/admin/clients.js
import { neon } from "@neondatabase/serverless";

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DATABASE_URL) return json({ error: "DATABASE_URL not set" }, 500);
  try {
    const sql = neon(env.DATABASE_URL);
    const clients = await sql`SELECT * FROM clients ORDER BY created_at DESC`;
    return json({ clients });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: cors() });
}
function json(d, s=200) { return new Response(JSON.stringify(d),{status:s,headers:cors()}); }
function cors() { return {"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}; }