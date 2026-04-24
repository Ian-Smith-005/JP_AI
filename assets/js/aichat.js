/* ============================================================
  By Smith
    Due to the error of the initial version where users could pick same names 
    we have decided to make the names unique by implementing the following
   ✓ Unique username generation / reservation via /api/chat-username
   ✓ File attachments: image, PDF, audio, voice recording
   ✓ In-chat lightbox for images/voice, PDF modal viewer
   ✓ Message quoting / reply threads
   ✓ Read receipts (grey tick = sent, blue = read by admin)
   ✓ Typing indicator broadcast via Supabase Realtime presence
   ✓ Supabase Storage file uploads
   En route is the design of a UI interface that resembles the whatsapp UI
============================================================ */

// ── Supabase client (browser anon key — loaded via /api/config) ─
let sb = null;
let presenceCh = null;
let liveCh = null;

async function initSupabase() {
  try {
    const r = await fetch("/api/config");
    const d = await r.json();
    if (
      d.supabaseUrl &&
      d.supabaseAnon &&
      !d.supabaseUrl.includes("YOUR_PROJECT")
    ) {
      sb = supabase.createClient(d.supabaseUrl, d.supabaseAnon);
    }
  } catch (_) {}
}
initSupabase();

// ── DOM ────────────────────────────────────────────────────────
const chatToggle = document.getElementById("chatToggle");
const chatContainer = document.getElementById("chatContainer");
const closeChat = document.getElementById("closeChat");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const namePrompt = document.getElementById("chatNamePrompt");
const liveNameInput = document.getElementById("liveNameInput");

// ── State ──────────────────────────────────────────────────────
let conversation = _load("studioChat") || [];
let userName = _load("studioUser") || null;
let memory = _load("studioMemory") || {};
let bookingFlow = { active: false, step: 0 };
let chatMode = _load("joyalty_chat_mode") || "ai";
let liveMessages = _load("joyalty_live_msgs") || [];
let liveSessionId = _load("joyalty_live_sid") || null;
let liveName = _load("joyalty_live_name") || null;
let chatOpen = false;
let replyTo = null; // { id, sender, text } for quoting
let isTyping = false;
let typingTimer = null;
let adminTyping = false;
let mediaRecorder = null;
let audioChunks = [];

// ── Storage helpers ────────────────────────────────────────────
function _save(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (_) {}
}
function _load(k) {
  try {
    const r = localStorage.getItem(k);
    return r ? JSON.parse(r) : null;
  } catch (_) {
    return null;
  }
}
function _del(k) {
  try {
    localStorage.removeItem(k);
  } catch (_) {}
}
function _delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function _saveConv() {
  if (conversation.length > 60) conversation = conversation.slice(-60);
  _save("studioChat", conversation);
}

// ── Pills ──────────────────────────────────────────────────────
function _refreshPill() {
  document
    .getElementById("btnModeAI")
    ?.classList.toggle("active", chatMode === "ai");
  document
    .getElementById("btnModeLive")
    ?.classList.toggle("active", chatMode === "live");
}

// ── Open / Close ───────────────────────────────────────────────
function toggleChat() {
  chatOpen = !chatOpen;
  chatContainer.classList.toggle("active", chatOpen);
  if (chatOpen) {
    _refreshPill();
    if (!chatMessages.children.length) _enterMode(chatMode);
    setTimeout(() => chatInput?.focus(), 300);
  } else _stopLive();
}
if (chatToggle) chatToggle.onclick = toggleChat;
if (closeChat)
  closeChat.onclick = () => {
    chatOpen = false;
    chatContainer.classList.remove("active");
    _stopLive();
  };

// ── Mode switch ────────────────────────────────────────────────
window.setChatMode = function (mode) {
  chatMode = mode;
  _save("joyalty_chat_mode", mode);
  _refreshPill();
  chatMessages.innerHTML = "";
  namePrompt?.classList.remove("visible");
  document.querySelector(".chat-input") &&
    (document.querySelector(".chat-input").style.display = "");
  _stopLive();
  _enterMode(mode);
};

function _enterMode(mode) {
  if (mode === "ai") {
    _renderAIHistory();
    if (!chatMessages.children.length)
      typeMessage(
        userName
          ? `Welcome back, ${userName}! 👋 How can I help?`
          : "Hello 👋 I'm Joy, your Joyalty Photography assistant. What's your name?",
        "bot",
      );
  } else {
    _enterLive();
  }
}

// ── AI mode ────────────────────────────────────────────────────
function _renderAIHistory() {
  conversation.forEach((m) => {
    const el = document.createElement("div");
    el.className = `message ${m.type}`;
    el.textContent = m.text;
    chatMessages.appendChild(el);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ── Live mode ──────────────────────────────────────────────────
function _enterLive() {
  if (!liveName) {
    _showNamePrompt();
    return;
  }
  _showLiveChat();
}

function _showNamePrompt() {
  namePrompt?.classList.add("visible");
  chatMessages.style.display = "none";
  document.querySelector(".chat-input") &&
    (document.querySelector(".chat-input").style.display = "none");
  liveNameInput?.focus();
}

window.confirmLiveName = async function () {
  const input = liveNameInput?.value.trim();
  if (!input) {
    if (liveNameInput) {
      liveNameInput.placeholder = "Enter a name…";
      liveNameInput.focus();
    }
    return;
  }

  // Validate / reserve username
  const btn = document.querySelector(".chat-name-prompt button");
  if (btn) btn.textContent = "Checking…";

  try {
    const r = await fetch("/api/chat-username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: input }),
    });
    const data = await r.json();

    if (data.error && r.status === 409) {
      if (liveNameInput) {
        liveNameInput.value = "";
        liveNameInput.placeholder = data.error;
        liveNameInput.focus();
      }
      if (btn) btn.textContent = "Start Live Chat";
      return;
    }
    if (data.error) {
      if (liveNameInput) {
        liveNameInput.placeholder = data.error;
      }
      if (btn) btn.textContent = "Start Live Chat";
      return;
    }

    liveName = data.username;
    liveSessionId = data.sessionId;
    _save("joyalty_live_name", liveName);
    _save("joyalty_live_sid", liveSessionId);
  } catch (_) {
    // Fallback: use as display name, generate session locally
    liveName = input.toLowerCase().replace(/\s+/g, "_");
    liveSessionId = liveName + "-" + Date.now();
    _save("joyalty_live_name", liveName);
    _save("joyalty_live_sid", liveSessionId);
  }

  namePrompt?.classList.remove("visible");
  chatMessages.style.display = "";
  document.querySelector(".chat-input") &&
    (document.querySelector(".chat-input").style.display = "");
  if (btn) btn.textContent = "Start Live Chat";
  _showLiveChat();
};

function _showLiveChat() {
  liveMessages.forEach(_renderLiveBubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  if (!liveMessages.length)
    _sysMsg(`You're chatting as ${liveName}. We reply Mon–Sat, 9AM–7PM EAT.`);
  _subscribeToLive();
  _trackPresence();
}

// ── Supabase Realtime for live chat ───────────────────────────
function _subscribeToLive() {
  if (!sb || !liveSessionId) return;
  if (liveCh) sb.removeChannel(liveCh);
  liveCh = sb
    .channel("live-chat-client-" + liveSessionId)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "live_chat_messages",
        filter: `session_id=eq.${liveSessionId}`,
      },
      (payload) => {
        const msg = payload.new;
        if (!msg || msg.sender === "user") return; // skip our own messages
        const known = new Set(liveMessages.map((m) => String(m.id)));
        if (!known.has(String(msg.id))) {
          liveMessages.push(msg);
          _save("joyalty_live_msgs", liveMessages);
          _renderLiveBubble(msg);
          // Mark as read since we're looking at the chat
          if (chatOpen && chatMode === "live") _markRead();
        }
      },
    )
    // Admin typing indicator via presence
    .on("presence", { event: "sync" }, () => {
      const state = liveCh.presenceState();
      const adminOnline = Object.values(state).some((arr) =>
        arr.some((u) => u.role === "admin"),
      );
      _updateAdminTypingUI(false); // presence sync doesn't mean typing
    })
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload.sender === "admin" && payload.sessionId === liveSessionId) {
        adminTyping = payload.typing;
        _updateAdminTypingUI(adminTyping);
      }
    })
    .subscribe();
}

function _trackPresence() {
  if (!sb || !liveSessionId) return;
  if (presenceCh) sb.removeChannel(presenceCh);
  presenceCh = sb.channel("user-presence").subscribe(async (status) => {
    if (status === "SUBSCRIBED")
      await presenceCh.track({
        user: liveSessionId,
        role: "user",
        online_at: new Date().toISOString(),
      });
  });
  window.addEventListener("beforeunload", () => {
    if (presenceCh) presenceCh.untrack();
  });
}

function _broadcastTyping(isTyp) {
  if (!liveCh) return;
  liveCh.send({
    type: "broadcast",
    event: "typing",
    payload: { sender: "user", sessionId: liveSessionId, typing: isTyp },
  });
}

function _updateAdminTypingUI(typing) {
  let el = document.getElementById("adminTypingBubble");
  if (typing) {
    if (!el) {
      el = document.createElement("div");
      el.id = "adminTypingBubble";
      el.className = "message bot typing";
      el.innerHTML = "<span></span><span></span><span></span>";
      chatMessages.appendChild(el);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  } else {
    el?.remove();
  }
}

function _stopLive() {
  if (liveCh && sb) sb.removeChannel(liveCh);
  if (presenceCh && sb) sb.removeChannel(presenceCh);
  liveCh = null;
  presenceCh = null;
}

function _markRead() {
  if (!liveSessionId) return;
  fetch("/api/live-chat", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: liveSessionId, reader: "user" }),
  }).catch(() => {});
}

// ── Typing broadcast from user ────────────────────────────────
if (chatInput) {
  chatInput.addEventListener("input", () => {
    if (chatMode !== "live") return;
    if (!isTyping) {
      isTyping = true;
      _broadcastTyping(true);
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      isTyping = false;
      _broadcastTyping(false);
    }, 2000);
  });
}

// ── Render live bubble ─────────────────────────────────────────
function _renderLiveBubble(msg) {
  const isMe = msg.sender === "user";
  const el = document.createElement("div");
  el.className = `message ${isMe ? "user" : "bot"}`;
  el.dataset.msgId = msg.id;

  let html = "";

  // Reply quote
  if (msg.reply_preview) {
    html += `<div class="msg-quote"><i class="fa-solid fa-reply"></i> ${_esc(msg.reply_preview)}</div>`;
  }

  // Content
  if (msg.file_url) {
    html += _renderFileContent(msg);
  } else {
    html += `<span>${_esc(msg.text)}</span>`;
  }

  // Meta row: time + ticks
  const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString(
    "en-KE",
    { hour: "2-digit", minute: "2-digit" },
  );
  const ticks = isMe ? _renderTicks(msg) : "";
  html += `<div class="msg-meta"><span class="msg-time">${time}</span>${ticks}</div>`;

  // Long press / right-click to quote
  el.innerHTML = html;
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    _setReplyTo(msg);
  });
  el.addEventListener(
    "touchstart",
    () => {
      el._lp = setTimeout(() => _setReplyTo(msg), 600);
    },
    { passive: true },
  );
  el.addEventListener("touchend", () => clearTimeout(el._lp));

  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Animate in
  el.style.opacity = "0";
  el.style.transform = "translateY(8px) scale(.97)";
  requestAnimationFrame(() => {
    el.style.transition = "opacity .2s ease,transform .2s ease";
    el.style.opacity = "1";
    el.style.transform = "none";
  });
}

function _renderFileContent(msg) {
  const url = msg.file_url;
  const name = msg.file_name || "file";
  const type = msg.file_type || "";

  if (type === "image") {
    return `<img src="${url}" alt="${_esc(name)}" class="msg-img" onclick="openLightbox('${url}','image')" loading="lazy">`;
  }
  if (type === "audio" || type === "voice") {
    return `<div class="msg-audio">
      <button class="audio-play-btn" onclick="toggleAudio(this,'${url}')"><i class="fa-solid fa-play"></i></button>
      <div class="audio-bar"><div class="audio-progress"></div></div>
      <span class="audio-dur">0:00</span>
    </div>`;
  }
  if (type === "pdf") {
    return `<div class="msg-file pdf-file" onclick="openPDFModal('${url}','${_esc(name)}')">
      <i class="fa-solid fa-file-pdf" style="color:#ef4444;font-size:1.5rem"></i>
      <span>${_esc(name)}</span>
      <i class="fa-solid fa-expand" style="font-size:.8rem;opacity:.5"></i>
    </div>`;
  }
  return `<a href="${url}" target="_blank" rel="noopener" class="msg-file">
    <i class="fa-solid fa-file"></i><span>${_esc(name)}</span>
  </a>`;
}

function _renderTicks(msg) {
  if (!msg.read_at)
    return `<span class="ticks grey"><i class="fa-solid fa-check-double"></i></span>`;
  return `<span class="ticks blue"><i class="fa-solid fa-check-double"></i></span>`;
}

// ── Reply / quote ──────────────────────────────────────────────
function _setReplyTo(msg) {
  replyTo = {
    id: msg.id,
    sender: msg.sender,
    text: msg.text || (msg.file_name ? "📎 " + msg.file_name : ""),
  };
  let bar = document.getElementById("replyBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "replyBar";
    bar.className = "reply-bar";
    bar.innerHTML = `<div class="reply-bar-inner"><i class="fa-solid fa-reply"></i><span id="replyText"></span></div><button onclick="clearReply()"><i class="fa-solid fa-xmark"></i></button>`;
    chatInput?.parentElement?.insertBefore(bar, chatInput);
  }
  document.getElementById("replyText").textContent =
    replyTo.text.substring(0, 60) + (replyTo.text.length > 60 ? "…" : "");
  chatInput?.focus();
}
window.clearReply = function () {
  replyTo = null;
  document.getElementById("replyBar")?.remove();
};

// ── File upload to Supabase Storage ───────────────────────────
async function uploadFile(file) {
  if (!sb) return null;
  const ext = file.name.split(".").pop() || "bin";
  const path = `chat/${liveSessionId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await sb.storage
    .from("chat-files")
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw new Error(error.message);
  const { data: pub } = sb.storage.from("chat-files").getPublicUrl(path);
  return pub.publicUrl;
}

function _fileType(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

// ── Attach file button ─────────────────────────────────────────
window.openFileAttach = function () {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,.pdf,audio/*";
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      _sysMsg("Max file size is 10 MB.");
      return;
    }
    await _sendFile(file);
  };
  input.click();
};

async function _sendFile(file) {
  _sysMsg("Uploading…");
  try {
    const url = await uploadFile(file);
    const type = _fileType(file);
    await _sendLiveMsg("", url, type, file.name, file.size);
  } catch (e) {
    _sysMsg("Upload failed: " + e.message);
  }
}

// ── Voice recording ────────────────────────────────────────────
let recBtn = null;
window.toggleRecording = async function (btn) {
  recBtn = btn;
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    btn.classList.remove("recording");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      const file = new File([blob], "voice-" + Date.now() + ".webm", {
        type: "audio/webm",
      });
      await _sendFile(file);
    };
    mediaRecorder.start();
    btn.innerHTML = '<i class="fa-solid fa-stop"></i>';
    btn.classList.add("recording");
  } catch (_) {
    _sysMsg("Microphone permission denied.");
  }
};

// ── Send live message ──────────────────────────────────────────
async function _sendLiveMsg(
  text = "",
  fileUrl = null,
  fileType = null,
  fileName = null,
  fileSize = null,
) {
  const msg = {
    id: Date.now(),
    sessionId: liveSessionId,
    sender: "user",
    name: liveName,
    text,
    timestamp: new Date().toISOString(),
    fileUrl,
    fileType,
    fileName,
    fileSize,
    replyToId: replyTo?.id || null,
    replyPreview: replyTo ? replyTo.text.substring(0, 80) : null,
  };

  // Optimistic render
  liveMessages.push({
    ...msg,
    file_url: fileUrl,
    file_type: fileType,
    file_name: fileName,
    file_size: fileSize,
    reply_to_id: msg.replyToId,
    reply_preview: msg.replyPreview,
  });
  _save("joyalty_live_msgs", liveMessages);
  _renderLiveBubble({
    ...msg,
    file_url: fileUrl,
    file_type: fileType,
    file_name: fileName,
    file_size: fileSize,
    reply_to_id: msg.replyToId,
    reply_preview: msg.replyPreview,
  });
  clearReply();
  isTyping = false;
  _broadcastTyping(false);

  try {
    await fetch("/api/live-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: liveSessionId,
        sender: "user",
        name: liveName,
        text,
        timestamp: msg.timestamp,
        fileUrl,
        fileType,
        fileName,
        fileSize,
        replyToId: msg.replyToId,
        replyPreview: msg.replyPreview,
      }),
    });
  } catch (_) {}
}

// ── Lightbox ───────────────────────────────────────────────────
window.openLightbox = function (src, type) {
  let box = document.getElementById("chatLightbox");
  if (!box) {
    box = document.createElement("div");
    box.id = "chatLightbox";
    box.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:20px;";
    box.onclick = () => box.remove();
    document.body.appendChild(box);
  }
  box.innerHTML = `<img src="${src}" style="max-width:100%;max-height:90vh;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.7)" onclick="event.stopPropagation()">
    <button style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:50%;width:36px;height:36px;cursor:pointer;font-size:1rem" onclick="document.getElementById('chatLightbox').remove()"><i class="fa-solid fa-xmark"></i></button>`;
};

// ── PDF Modal ──────────────────────────────────────────────────
window.openPDFModal = function (src, name) {
  let modal = document.getElementById("chatPDFModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "chatPDFModal";
    modal.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;flex-direction:column;align-items:center;padding:16px;";
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;width:100%;max-width:800px;margin-bottom:10px">
      <span style="color:#f0ece4;font-size:.9rem;flex:1">${_esc(name)}</span>
      <a href="${src}" target="_blank" style="color:#d4a84b;font-size:.8rem;text-decoration:none"><i class="fa-solid fa-download"></i> Download</a>
      <button onclick="document.getElementById('chatPDFModal').remove()" style="background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:1.1rem"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <iframe src="${src}" style="width:100%;max-width:800px;flex:1;border:none;border-radius:10px;background:#fff" title="${_esc(name)}"></iframe>`;
};

// ── Audio player ───────────────────────────────────────────────
const audioPlayers = {};
window.toggleAudio = function (btn, src) {
  let audio = audioPlayers[src];
  if (!audio) {
    audio = new Audio(src);
    audioPlayers[src] = audio;
    const bar = btn.nextElementSibling;
    const dur = bar?.nextElementSibling;
    audio.addEventListener("timeupdate", () => {
      const pct = audio.duration
        ? (audio.currentTime / audio.duration) * 100
        : 0;
      const prog = bar?.querySelector(".audio-progress");
      if (prog) prog.style.width = pct + "%";
      if (dur) dur.textContent = _fmtTime(audio.currentTime);
    });
    audio.addEventListener("ended", () => {
      btn.innerHTML = '<i class="fa-solid fa-play"></i>';
    });
  }
  if (audio.paused) {
    audio.play();
    btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
  } else {
    audio.pause();
    btn.innerHTML = '<i class="fa-solid fa-play"></i>';
  }
};
function _fmtTime(s) {
  const m = Math.floor(s / 60);
  return m + ":" + (Math.floor(s % 60) + "").padStart(2, "0");
}

// ── AI mode helpers ────────────────────────────────────────────
function typeMessage(text, type) {
  removeTyping();
  const el = document.createElement("div");
  el.className = `message ${type}`;
  chatMessages.appendChild(el);
  let i = 0;
  (function tick() {
    if (i < text.length) {
      el.textContent += text.charAt(i++);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      setTimeout(tick, 13);
    }
  })();
  if (type === "user" || type === "bot") {
    conversation.push({ type, text });
    _saveConv();
  }
}
function showTyping() {
  removeTyping();
  const el = document.createElement("div");
  el.className = "typing";
  el.id = "typing";
  el.innerHTML = "<span></span><span></span><span></span>";
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function removeTyping() {
  document.getElementById("typing")?.remove();
}
function _sysMsg(text) {
  const d = document.createElement("div");
  d.className = "chat-system-msg";
  d.textContent = text;
  chatMessages.appendChild(d);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function updateMemory(text) {
  const t = text.toLowerCase();
  if (t.includes("wedding")) memory.sessionType = "wedding";
  if (t.includes("portrait")) memory.sessionType = "portrait";
  if (t.includes("event")) memory.sessionType = "event";
  if (t.includes("commercial")) memory.sessionType = "commercial";
  if (/\d{4}/.test(t)) memory.date = text;
  if (t.includes("@")) memory.email = text;
  if (/\d{9,13}/.test(t)) memory.phone = text;
  _save("studioMemory", memory);
}

function startBooking() {
  bookingFlow.active = true;
  bookingFlow.step = 1;
  typeMessage(
    "What type of session? (wedding, portrait, commercial, event)",
    "bot",
  );
}
async function handleBooking(text) {
  switch (bookingFlow.step) {
    case 1:
      memory.sessionType = text;
      bookingFlow.step = 2;
      typeMessage("What date are you thinking?", "bot");
      break;
    case 2:
      memory.date = text;
      bookingFlow.step = 3;
      typeMessage("Where will the session take place?", "bot");
      break;
    case 3:
      memory.location = text;
      bookingFlow.step = 4;
      typeMessage("What's your phone number?", "bot");
      break;
    case 4:
      memory.phone = text;
      bookingFlow.step = 5;
      typeMessage("And your email address?", "bot");
      break;
    case 5:
      memory.email = text;
      bookingFlow.active = false;
      typeMessage(
        "Head to our Services page to complete your booking 👉",
        "bot",
      );
      break;
  }
  _save("studioMemory", memory);
}

async function callAI() {
  const formatted = conversation
    .filter((m) => m.type === "user" || m.type === "bot")
    .map((m) => ({
      role: m.type === "user" ? "user" : "model",
      parts: [{ text: m.text }],
    }));
  showTyping();
  try {
    const res = await fetch("/api/gemini-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: formatted }),
    });
    const data = await res.json();
    removeTyping();
    return data?.reply || "I'm here to help!";
  } catch (err) {
    removeTyping();
    return "⚠ Trouble connecting. Please try again.";
  }
}

// ── Main send ──────────────────────────────────────────────────
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";

  if (chatMode === "live") {
    if (!liveSessionId) {
      _enterLive();
      return;
    }
    await _sendLiveMsg(text);
    return;
  }

  // AI mode
  typeMessage(text, "user");
  updateMemory(text);
  if (!userName) {
    userName = text.split(" ")[0];
    _save("studioUser", userName);
    typeMessage(
      `Nice to meet you, ${userName}! 👋 Ask me about services, pricing, or how to book.`,
      "bot",
    );
    return;
  }
  if (bookingFlow.active) {
    await handleBooking(text);
    return;
  }
  const reply = await callAI();
  if (reply.includes("[START_BOOKING]")) {
    const clean = reply.replace("[START_BOOKING]", "").trim();
    if (clean) typeMessage(clean, "bot");
    await _delay(400);
    startBooking();
  } else typeMessage(reply, "bot");
}

if (sendBtn) sendBtn.onclick = sendMessage;
if (chatInput)
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
if (liveNameInput)
  liveNameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") window.confirmLiveName();
  });

// ── Delete modal wiring ────────────────────────────────────────
window.openDeleteModal = () => {
  document.getElementById("deleteModal").style.display = "flex";
};
document.getElementById("confirmDelete")?.addEventListener("click", () => {
  conversation = [];
  userName = null;
  memory = {};
  [
    "studioChat",
    "studioUser",
    "studioMemory",
    "joyalty_live_msgs",
    "joyalty_live_sid",
    "joyalty_live_name",
  ].forEach(_del);
  liveMessages = [];
  liveSessionId = null;
  liveName = null;
  chatMessages.innerHTML = "";
  document.getElementById("deleteModal").style.display = "none";
  chatMode = "ai";
  _refreshPill();
  _enterMode("ai");
});
document.getElementById("cancelDelete")?.addEventListener("click", () => {
  document.getElementById("deleteModal").style.display = "none";
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.getElementById("deleteModal").style.display = "none";
    document.getElementById("chatLightbox")?.remove();
    document.getElementById("chatPDFModal")?.remove();
  }
});

function _esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
