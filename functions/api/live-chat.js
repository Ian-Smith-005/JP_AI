// functions/api/live-chat.js
// POST  — insert message (text or file attachment)
// GET   — fetch messages for a session
// PATCH — mark messages as read
// ✅ Self-contained, bare npm specifier
import { createClient } from "@supabase/supabase-js";

function sb(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}
function j(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ── POST: insert message ──────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.SUPABASE_URL) return j({ success: true, warning: "No DB" });

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return j({ error: "Invalid body" }, 400);
  }

  const {
    sessionId,
    sender,
    name = null,
    text,
    timestamp,
    fileUrl = null,
    fileType = null,
    fileName = null,
    fileSize = null,
    replyToId = null,
    replyPreview = null,
  } = body;

  if (!sessionId || !sender || (!text && !fileUrl))
    return j(
      { error: "sessionId, sender and (text or fileUrl) are required" },
      400,
    );

  const db = sb(env);
  const { data, error } = await db
    .from("live_chat_messages")
    .insert({
      session_id: sessionId,
      sender,
      name,
      text: text || "",
      timestamp: timestamp || new Date().toISOString(),
      file_url: fileUrl,
      file_type: fileType,
      file_name: fileName,
      file_size: fileSize,
      reply_to_id: replyToId,
      reply_preview: replyPreview,
      delivered_at: new Date().toISOString(), // mark delivered immediately on insert
    })
    .select("id")
    .single();

  if (error) return j({ error: error.message }, 500);

  // Mark opposite side's messages as read when admin replies
  if (sender === "admin") {
    await db
      .from("live_chat_messages")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("session_id", sessionId)
      .eq("sender", "user");
  }

  return j({ success: true, id: data.id });
}

// ── GET: fetch messages ───────────────────────────────────────
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SUPABASE_URL) return j({ messages: [] });

  const url = new URL(request.url);
  const sid = url.searchParams.get("sessionId");
  if (!sid) return j({ error: "sessionId required" }, 400);

  const db = sb(env);
  const { data, error } = await db
    .from("live_chat_messages")
    .select("*")
    .eq("session_id", sid)
    .order("timestamp", { ascending: true })
    .limit(200);

  if (error) return j({ messages: [], error: error.message });
  return j({ messages: data });
}

// ── PATCH: mark messages read ─────────────────────────────────
export async function onRequestPatch(context) {
  const { request, env } = context;
  if (!env.SUPABASE_URL) return j({ success: true });

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return j({ error: "Invalid body" }, 400);
  }

  const { sessionId, reader } = body;
  if (!sessionId || !reader)
    return j({ error: "sessionId and reader required" }, 400);

  const db = sb(env);
  await db
    .from("live_chat_messages")
    .update({ read_at: new Date().toISOString(), read: true })
    .eq("session_id", sessionId)
    .neq("sender", reader)
    .is("read_at", null);

  return j({ success: true });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
