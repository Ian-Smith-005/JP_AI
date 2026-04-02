/* ============================================================
   JOYALTY AI CHATBOT — aichat.js
   Enhanced with AI ↔ Live Admin Chat toggle.

   Modes:
   • AI mode  — Joy (Gemini) answers via /api/gemini-chat
   • Live mode — user messages stored in DB/localStorage and
                 polled by admin dashboard; admin replies shown
                 here in real-time (3s poll)

   The toggle button lives in the .chat-header section
   (injected by this file so no HTML changes needed).
============================================================ */

// ── DOM ───────────────────────────────────────────────────────
const chatToggle    = document.getElementById("chatToggle");
const chatContainer = document.getElementById("chatContainer");
const closeChat     = document.getElementById("closeChat");
const chatMessages  = document.getElementById("chatMessages");
const chatInput     = document.getElementById("chatInput");
const sendBtn       = document.getElementById("sendBtn");
const chatHeader    = document.querySelector(".chat-header");

// ── State ─────────────────────────────────────────────────────
let conversation = JSON.parse(localStorage.getItem("studioChat")) || [];
let userName     = localStorage.getItem("studioUser") || null;
let memory       = JSON.parse(localStorage.getItem("studioMemory")) || {
  sessionType: null, date: null, location: null, phone: null, email: null,
};
let bookingFlow  = { active: false, step: 0 };

// Chat mode: "ai" | "live"
let chatMode     = localStorage.getItem("joyalty_chat_mode") || "ai";
let liveMessages = JSON.parse(localStorage.getItem("joyalty_live_messages")) || [];
let liveSessionId = localStorage.getItem("joyalty_live_session") || `session-${Date.now()}`;
let livePollTimer = null;

// ── Inject mode toggle into chat header ───────────────────────
function injectModeToggle() {
  if (document.getElementById("chatModeToggle")) return;

  const toggle = document.createElement("div");
  toggle.id    = "chatModeToggle";
  toggle.style.cssText = "display:flex;gap:4px;margin-left:auto;margin-right:8px;background:rgba(0,0,0,.2);border-radius:20px;padding:3px";
  toggle.innerHTML = `
    <button id="btnModeAI"   onclick="setChatMode('ai')"   style="${modeBtn(chatMode==='ai')}">🤖 Joy AI</button>
    <button id="btnModeLive" onclick="setChatMode('live')" style="${modeBtn(chatMode==='live')}">💬 Live</button>
  `;

  // Insert before the close button
  const closeEl = chatHeader?.querySelector(".close") || chatHeader?.lastElementChild;
  if (closeEl) chatHeader.insertBefore(toggle, closeEl);
  else chatHeader?.appendChild(toggle);
}

function modeBtn(active) {
  const base = "border:none;border-radius:16px;padding:3px 10px;font-family:Quicksand,sans-serif;font-size:11px;font-weight:600;cursor:pointer;transition:all .2s";
  return active
    ? `${base};background:#fff;color:#333`
    : `${base};background:transparent;color:rgba(255,255,255,.7)`;
}

function setChatMode(mode) {
  chatMode = mode;
  localStorage.setItem("joyalty_chat_mode", mode);

  const btnAI   = document.getElementById("btnModeAI");
  const btnLive = document.getElementById("btnModeLive");
  if (btnAI)   btnAI.style.cssText   = modeBtn(mode === "ai")   + ";border:none;border-radius:16px;padding:3px 10px;font-family:Quicksand,sans-serif;font-size:11px;font-weight:600;cursor:pointer;transition:all .2s";
  if (btnLive) btnLive.style.cssText = modeBtn(mode === "live") + ";border:none;border-radius:16px;padding:3px 10px;font-family:Quicksand,sans-serif;font-size:11px;font-weight:600;cursor:pointer;transition:all .2s";

  // Clear messages and show appropriate welcome
  chatMessages.innerHTML = "";

  if (mode === "ai") {
    stopLivePoll();
    // Reload AI conversation
    conversation.forEach(msg => {
      const div = document.createElement("div");
      div.className = `message ${msg.type}`;
      div.textContent = msg.text;
      chatMessages.appendChild(div);
    });
    if (chatMessages.children.length === 0) {
      typeMessage(userName
        ? `Welcome back ${userName}! 👋 How can I help you today?`
        : "Hello 👋 I'm Joy, your Joyalty Photography assistant. What's your name?", "bot");
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } else {
    // Live admin chat
    liveMessages.forEach(m => renderLiveMessage(m));
    if (liveMessages.length === 0) {
      appendSystemMsg("You are now connected to live support. The admin will reply shortly. Our hours are Mon–Sat 9AM–7PM.");
    }
    startLivePoll();
  }
}

// ── Helpers ───────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function safeJSON(t) { try { return JSON.parse(t); } catch(_){ return null; } }

function saveConversation() {
  if (conversation.length > 50) conversation = conversation.slice(-50);
  localStorage.setItem("studioChat", JSON.stringify(conversation));
}

function saveLiveMessages() {
  if (liveMessages.length > 100) liveMessages = liveMessages.slice(-100);
  localStorage.setItem("joyalty_live_messages", JSON.stringify(liveMessages));
  localStorage.setItem("joyalty_live_session",  liveSessionId);
}

// ── Load AI conversation on init ──────────────────────────────
function loadConversation() {
  if (chatMode !== "ai") return;
  conversation.forEach(msg => {
    const div = document.createElement("div");
    div.className = `message ${msg.type}`;
    div.textContent = msg.text;
    chatMessages.appendChild(div);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
loadConversation();

// ── Type animation ────────────────────────────────────────────
function typeMessage(text, type) {
  removeTyping();
  const msg = document.createElement("div");
  msg.className = `message ${type}`;
  chatMessages.appendChild(msg);

  let i = 0;
  function tick() {
    if (i < text.length) {
      msg.textContent += text.charAt(i++);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      setTimeout(tick, 15);
    }
  }
  tick();

  if (chatMode === "ai") {
    conversation.push({ type, text });
    saveConversation();
  }
}

function showTyping() {
  removeTyping();
  const el = document.createElement("div");
  el.className = "typing"; el.id = "typing";
  el.innerHTML = "<span></span><span></span><span></span>";
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTyping() {
  document.getElementById("typing")?.remove();
}

function appendSystemMsg(text) {
  const div = document.createElement("div");
  div.style.cssText = "text-align:center;font-size:11px;opacity:.5;padding:8px 0;font-family:Quicksand,sans-serif";
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ── Chat toggle ───────────────────────────────────────────────
function toggleChat() {
  chatContainer.classList.toggle("active");
  if (chatContainer.classList.contains("active")) {
    injectModeToggle();
    if (chatMessages.children.length === 0) {
      setChatMode(chatMode); // trigger welcome for current mode
    }
  }
}

chatToggle.onclick = toggleChat;
closeChat.onclick  = toggleChat;

// ── Memory ────────────────────────────────────────────────────
function updateMemory(text) {
  const t = text.toLowerCase();
  if (t.includes("wedding"))   memory.sessionType = "wedding";
  if (t.includes("portrait"))  memory.sessionType = "portrait";
  if (t.includes("event"))     memory.sessionType = "event";
  if (t.includes("commercial"))memory.sessionType = "commercial";
  if (/\d{4}/.test(t))         memory.date  = text;
  if (t.includes("@"))         memory.email = text;
  if (/\d{9,13}/.test(t))      memory.phone = text;
  localStorage.setItem("studioMemory", JSON.stringify(memory));
}

// ── Booking flow (AI mode only) ───────────────────────────────
function startBooking() {
  bookingFlow.active = true;
  bookingFlow.step   = 1;
  typeMessage("Sure! What type of session? (wedding, portrait, commercial, event)", "bot");
}

async function handleBooking(text) {
  switch (bookingFlow.step) {
    case 1: memory.sessionType = text; bookingFlow.step = 2; typeMessage("What date are you thinking?", "bot"); break;
    case 2: memory.date = text;        bookingFlow.step = 3; typeMessage("Where will the session take place?", "bot"); break;
    case 3: memory.location = text;    bookingFlow.step = 4; typeMessage("What's your phone number?", "bot"); break;
    case 4: memory.phone = text;       bookingFlow.step = 5; typeMessage("And your email address?", "bot"); break;
    case 5:
      memory.email = text;
      bookingFlow.active = false;
      typeMessage("Perfect! Let me save your booking…", "bot");
      await delay(800);
      typeMessage("Your session details are saved. Head to our Services page to complete your booking and payment. 👉", "bot");
      break;
  }
  localStorage.setItem("studioMemory", JSON.stringify(memory));
}

// ── AI mode: call Gemini ──────────────────────────────────────
async function callAI() {
  try {
    const formatted = conversation
      .filter(m => m.type === "user" || m.type === "bot")
      .map(m => ({ role: m.type === "user" ? "user" : "model", parts: [{ text: m.text }] }));

    showTyping();

    const res = await fetch("/api/gemini-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: formatted }),
    });

    const raw  = await res.text();
    const data = safeJSON(raw);
    removeTyping();

    if (!data) throw new Error("Invalid response from AI");
    return data.reply || "I'm here to help!";
  } catch (err) {
    console.error("[chat] callAI:", err.message);
    removeTyping();
    return "⚠ I'm having trouble connecting right now. Please try again.";
  }
}

// ── Live mode: send message to /api/live-chat ─────────────────
async function sendLiveMessage(text) {
  const msg = {
    id:        Date.now(),
    sessionId: liveSessionId,
    sender:    "user",
    name:      userName || "Client",
    text,
    timestamp: new Date().toISOString(),
    read:      false,
  };

  liveMessages.push(msg);
  saveLiveMessages();
  renderLiveMessage(msg);

  // Post to backend (non-blocking — localStorage is the fallback)
  try {
    await fetch("/api/live-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    });
  } catch (_) {
    // Silently continue — message is saved locally
  }
}

function renderLiveMessage(msg) {
  const div = document.createElement("div");
  div.className = `message ${msg.sender === "user" ? "user" : "bot"}`;
  div.dataset.msgId = msg.id;

  const time = new Date(msg.timestamp).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
  div.innerHTML = `
    <span style="display:block">${msg.text}</span>
    <span style="font-size:10px;opacity:.5;display:block;margin-top:3px">${msg.sender === "admin" ? "Admin" : "You"} · ${time}</span>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ── Live mode polling — check for admin replies ───────────────
function startLivePoll() {
  stopLivePoll();
  livePollTimer = setInterval(pollAdminReplies, 4000);
}

function stopLivePoll() {
  if (livePollTimer) { clearInterval(livePollTimer); livePollTimer = null; }
}

async function pollAdminReplies() {
  try {
    const res  = await fetch(`/api/live-chat?sessionId=${liveSessionId}`);
    const data = safeJSON(await res.text());
    if (!data?.messages) return;

    const existingIds = new Set(liveMessages.map(m => m.id));
    const newMsgs     = data.messages.filter(m => m.sender === "admin" && !existingIds.has(m.id));

    newMsgs.forEach(msg => {
      liveMessages.push(msg);
      renderLiveMessage(msg);
    });

    if (newMsgs.length) saveLiveMessages();
  } catch (_) {
    // Silent fail — poll will retry
  }
}

// ── Main send handler ─────────────────────────────────────────
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";

  // ── LIVE MODE ─────────────────────────────────────────────
  if (chatMode === "live") {
    if (!userName) {
      // Get name first even in live mode
      const div = document.createElement("div");
      div.className = "message user"; div.textContent = text;
      chatMessages.appendChild(div);
      userName = text.split(" ")[0];
      localStorage.setItem("studioUser", userName);
      appendSystemMsg(`You're chatting as ${userName}. The admin will reply shortly.`);
      // Set name and send first message
      await sendLiveMessage(`Hi, I'm ${text}`);
      return;
    }
    await sendLiveMessage(text);
    return;
  }

  // ── AI MODE ───────────────────────────────────────────────
  typeMessage(text, "user");
  updateMemory(text);

  if (!userName) {
    userName = text.split(" ")[0];
    localStorage.setItem("studioUser", userName);
    typeMessage(`Nice to meet you, ${userName}! 👋 How can I help you today? Ask about services, pricing, or booking.`, "bot");
    return;
  }

  if (bookingFlow.active) {
    await handleBooking(text);
    return;
  }

  const aiReply = await callAI();

  // Check for booking trigger from Joy
  if (aiReply.includes("[START_BOOKING]")) {
    const clean = aiReply.replace("[START_BOOKING]", "").trim();
    if (clean) typeMessage(clean, "bot");
    await delay(500);
    startBooking();
  } else {
    typeMessage(aiReply, "bot");
  }
}

// ── Events ────────────────────────────────────────────────────
sendBtn.onclick = sendMessage;
chatInput.addEventListener("keypress", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// Stop live polling when chat is closed
closeChat.addEventListener("click", stopLivePoll, { passive: true });