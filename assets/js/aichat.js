/* =========================================================
   JOYALTY AI CHATBOT — aichat.js
   Features:
   - Persistent chat history (localStorage)
   - Conversation memory (name, session type, date, etc.)
   - Booking flow (step-by-step data collection)
   - Gemini API via secure Cloudflare Pages Function
   - M-Pesa payment trigger
========================================================= */

// ── DOM Elements ──────────────────────────────────────────
const chatToggle    = document.getElementById("chatToggle");
const chatContainer = document.getElementById("chatContainer");
const closeChat     = document.getElementById("closeChat");
const chatMessages  = document.getElementById("chatMessages");
const chatInput     = document.getElementById("chatInput");
const sendBtn       = document.getElementById("sendBtn");

// ── State ─────────────────────────────────────────────────
let conversation = JSON.parse(localStorage.getItem("studioChat")) || [];
let userName     = localStorage.getItem("studioUser") || null;
let memory       = JSON.parse(localStorage.getItem("studioMemory")) || {
  sessionType: null,
  date: null,
  location: null,
  phone: null,
  email: null,
};

let bookingFlow = { active: false, step: 0 };

// ── Helpers ───────────────────────────────────────────────
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function saveConversation() {
  // Keep last 40 messages to avoid localStorage bloat
  if (conversation.length > 40) conversation = conversation.slice(-40);
  localStorage.setItem("studioChat", JSON.stringify(conversation));
}

// ── Load previous messages on page load ───────────────────
function loadConversation() {
  conversation.forEach(msg => {
    const div = document.createElement("div");
    div.className = `message ${msg.type}`;
    div.textContent = msg.text;
    chatMessages.appendChild(div);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
loadConversation();

// ── Render a message with typing animation ────────────────
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

  conversation.push({ type, text });
  saveConversation();
}

// ── Typing indicator ──────────────────────────────────────
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

// ── Chat open/close ───────────────────────────────────────
function toggleChat() {
  chatContainer.classList.toggle("active");

  if (chatContainer.classList.contains("active") && chatMessages.children.length === 0) {
    if (userName) {
      typeMessage(`Welcome back ${userName}! 👋 How can I assist you today?`, "bot");
    } else {
      typeMessage("Hello 👋 I'm Joy, your Joyalty Photography assistant. What's your name?", "bot");
    }
  }
}

chatToggle.onclick = toggleChat;
closeChat.onclick  = toggleChat;

// ── Memory: extract session details from text ─────────────
function updateMemory(text) {
  const t = text.toLowerCase();
  if (t.includes("wedding"))  memory.sessionType = "wedding";
  if (t.includes("portrait")) memory.sessionType = "portrait";
  if (t.includes("event"))    memory.sessionType = "event";
  if (t.includes("commercial")) memory.sessionType = "commercial";
  if (/\d{4}/.test(t))        memory.date  = text;
  if (t.includes("@"))        memory.email = text;
  if (/\d{9,13}/.test(t))     memory.phone = text;
  localStorage.setItem("studioMemory", JSON.stringify(memory));
}

// ── Booking flow ──────────────────────────────────────────
function startBooking() {
  bookingFlow.active = true;
  bookingFlow.step   = 1;
  typeMessage("Sure! What type of session? (wedding, portrait, commercial, or event)", "bot");
}

async function handleBooking(text) {
  switch (bookingFlow.step) {
    case 1:
      memory.sessionType = text;
      bookingFlow.step = 2;
      typeMessage("Great choice! What date are you thinking for your session?", "bot");
      break;
    case 2:
      memory.date = text;
      bookingFlow.step = 3;
      typeMessage("And where will the session take place?", "bot");
      break;
    case 3:
      memory.location = text;
      bookingFlow.step = 4;
      typeMessage("What's the best phone number to reach you on?", "bot");
      break;
    case 4:
      memory.phone = text;
      bookingFlow.step = 5;
      typeMessage("Almost done! What's your email address?", "bot");
      break;
    case 5:
      memory.email = text;
      bookingFlow.active = false;
      await processBooking();
      break;
  }
  localStorage.setItem("studioMemory", JSON.stringify(memory));
}

// ── Submit booking to backend ─────────────────────────────
async function processBooking() {
  showTyping();
  await delay(1500);
  removeTyping();

  try {
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...memory, name: userName }),
    });

    const data = await response.json();
    typeMessage("✅ Booking request received! We'll confirm with you shortly.", "bot");

    if (data.paymentRequired) {
      typeMessage("To secure your date, please complete your deposit via M-Pesa.", "bot");
      await triggerMpesa();
    }
  } catch (err) {
    typeMessage("⚠ Booking could not be submitted right now. Please email us at info@joyalty.com.", "bot");
  }
}

// ── M-Pesa STK push ───────────────────────────────────────
async function triggerMpesa() {
  try {
    await fetch("/api/mpesa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: memory.phone, amount: 1000 }),
    });
    typeMessage("📱 M-Pesa payment request sent to your phone. Please complete it to confirm your booking.", "bot");
  } catch (err) {
    typeMessage("⚠ M-Pesa request failed. Please call us to pay manually.", "bot");
  }
}

// ── Call Gemini via Cloudflare Pages Function ─────────────
async function callAI() {
  try {
    // Build conversation history — Gemini needs strictly alternating user/model
    // Filter to only user and bot messages, exclude any system entries
    const formatted = conversation
      .filter(m => m.type === "user" || m.type === "bot")
      .map(m => ({
        role: m.type === "user" ? "user" : "model",
        parts: [{ text: m.text }]
      }));

    showTyping();

    const response = await fetch("/api/gemini-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: formatted }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("API error:", errText);
      throw new Error(errText);
    }

    const data = await response.json();
    removeTyping();

    return data.reply || "I'm here to help!";
  } catch (err) {
    console.error("callAI error:", err);
    removeTyping();
    return "⚠ I'm having trouble connecting right now. Please try again or contact us at info@joyalty.com.";
  }
}

// ── Main send handler ─────────────────────────────────────
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  typeMessage(text, "user");
  chatInput.value = "";
  updateMemory(text);

  // Step 1: collect name on first message
  if (!userName) {
    userName = text.split(" ")[0];
    localStorage.setItem("studioUser", userName);
    typeMessage(`Nice to meet you, ${userName}! 👋 How can I help you today? Ask me about our services, pricing, or to book a session.`, "bot");
    return;
  }

  // Step 2: handle active booking flow
  if (bookingFlow.active) {
    await handleBooking(text);
    return;
  }

  // Step 3: get AI reply
  const aiReply = await callAI();

  // Check if Gemini wants to trigger booking flow
  if (aiReply.includes("[START_BOOKING]")) {
    const cleanReply = aiReply.replace("[START_BOOKING]", "").trim();
    if (cleanReply) typeMessage(cleanReply, "bot");
    await delay(600);
    startBooking();
  } else {
    typeMessage(aiReply, "bot");
  }
}

// ── Events ────────────────────────────────────────────────
sendBtn.onclick = sendMessage;
chatInput.addEventListener("keypress", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});