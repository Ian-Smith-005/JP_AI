// functions/api/live-chat.js
// Handles live chat between users and admin.
// Uses Neon DB for persistence so admin dashboard can see all sessions.
// Falls back gracefully if DB not available.
//
// POST /api/live-chat  — user sends a message
// GET  /api/live-chat?sessionId=xxx — admin/user polls for new messages

import { neon } from "@neondatabase/serverless";

// ── Ensure table exists (create if not) ──────────────────────
async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS live_chat_messages (
      id          SERIAL PRIMARY KEY,
      session_id  TEXT NOT NULL,
      sender      TEXT NOT NULL,  -- 'user' | 'admin'
      name        TEXT,
      text        TEXT NOT NULL,
      timestamp   TIMESTAMPTZ DEFAULT NOW(),
      read        BOOLEAN DEFAULT false
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_chat_session ON live_chat_messages(session_id)`;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch (_) { return json({ error: "Invalid body" }, 400); }

  const { sessionId, sender, name, text, timestamp } = body;
  if (!sessionId || !sender || !text) return json({ error: "sessionId, sender and text required" }, 400);

  if (!env.DATABASE_URL) {
    // No DB — just return success (messages only live in localStorage)
    return json({ success: true, warning: "No database — message not persisted server-side" });
  }

  try {
    const sql = neon(env.DATABASE_URL);
    await ensureTable(sql);
    await sql`
      INSERT INTO live_chat_messages (session_id, sender, name, text, timestamp)
      VALUES (${sessionId}, ${sender}, ${name || null}, ${text}, ${timestamp || new Date().toISOString()})
    `;
    return json({ success: true });
  } catch (err) {
    console.error("[live-chat POST]", err.message);
    return json({ error: err.message }, 500);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url       = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  const since     = url.searchParams.get("since"); // optional ISO timestamp

  if (!sessionId) return json({ error: "sessionId required" }, 400);
  if (!env.DATABASE_URL) return json({ messages: [] });

  try {
    const sql = neon(env.DATABASE_URL);
    await ensureTable(sql);

    const messages = since
      ? await sql`
          SELECT id, session_id, sender, name, text, timestamp
          FROM live_chat_messages
          WHERE session_id = ${sessionId} AND timestamp > ${since}
          ORDER BY timestamp ASC
        `
      : await sql`
          SELECT id, session_id, sender, name, text, timestamp
          FROM live_chat_messages
          WHERE session_id = ${sessionId}
          ORDER BY timestamp ASC
          LIMIT 200
        `;

    return json({ messages });
  } catch (err) {
    console.error("[live-chat GET]", err.message);
    return json({ messages: [], error: err.message });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: cors() });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors() });
}

function cors() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}