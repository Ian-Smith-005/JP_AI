/* =========================================================
JO YALTY AI CHATBOT - FULL SYSTEM (Gemini API only)
Features:
- persistent chat history
- conversation memory
- auto booking assistant
- client detail collection
- Gemini API integration (via secure proxy)
- booking API + M-Pesa
========================================================= */

/* =========================================================
ELEMENTS
========================================================= */

const chatToggle = document.getElementById("chatToggle");
const chatContainer = document.getElementById("chatContainer");
const closeChat = document.getElementById("closeChat");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

/* =========================================================
STORAGE
========================================================= */

let conversation = JSON.parse(localStorage.getItem("studioChat")) || [];
let userName = localStorage.getItem("studioUser") || null;

let memory = JSON.parse(localStorage.getItem("studioMemory")) || {
  sessionType: null,
  date: null,
  location: null,
  phone: null,
  email: null,
};

/* =========================================================
BOOKING FLOW
========================================================= */

let bookingFlow = {
  active: false,
  step: 0,
};

/* =========================================================
DELAY
========================================================= */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* =========================================================
LOAD CONVERSATION
========================================================= */

function loadConversation() {
  conversation.forEach((msg) => {
    const div = document.createElement("div");
    div.className = `message ${msg.type}`;
    div.textContent = msg.text;
    chatMessages.appendChild(div);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

loadConversation();

/* =========================================================
TYPING MESSAGE
========================================================= */

function typeMessage(text, type) {
  removeTyping();

  const msg = document.createElement("div");
  msg.className = `message ${type}`;
  chatMessages.appendChild(msg);

  let i = 0;
  function typing() {
    if (i < text.length) {
      msg.textContent += text.charAt(i);
      i++;
      chatMessages.scrollTop = chatMessages.scrollHeight;
      setTimeout(typing, 15);
    }
  }
  typing();

  conversation.push({ type, text });
  localStorage.setItem("studioChat", JSON.stringify(conversation));
}

/* =========================================================
TYPING INDICATOR
========================================================= */

function showTyping() {
  removeTyping();
  const typing = document.createElement("div");
  typing.className = "typing";
  typing.id = "typing";
  typing.innerHTML = "<span></span><span></span><span></span>";
  chatMessages.appendChild(typing);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTyping() {
  const typing = document.getElementById("typing");
  if (typing) typing.remove();
}

/* =========================================================
CHAT TOGGLE
========================================================= */

function toggleChat() {
  chatContainer.classList.toggle("active");
  if (chatContainer.classList.contains("active") && chatMessages.children.length === 0) {
    if (userName) {
      typeMessage(`Welcome back ${userName}! 👋 How can I assist you today?`, "bot");
    } else {
      typeMessage("Hello 👋 I am your photography studio assistant. What is your name?", "bot");
    }
  }
}

chatToggle.onclick = toggleChat;
closeChat.onclick = toggleChat;

/* =========================================================
MEMORY UPDATE
========================================================= */

function updateMemory(text) {
  const t = text.toLowerCase();
  if (t.includes("wedding")) memory.sessionType = "wedding";
  if (t.includes("portrait")) memory.sessionType = "portrait";
  if (t.includes("event")) memory.sessionType = "event";
  if (/\d{4}/.test(t)) memory.date = text;
  if (t.includes("@")) memory.email = text;
  if (/\d{10,13}/.test(t)) memory.phone = text;
  localStorage.setItem("studioMemory", JSON.stringify(memory));
}

/* =========================================================
BOOKING SYSTEM
========================================================= */

function startBooking() {
  bookingFlow.active = true;
  bookingFlow.step = 1;
  typeMessage("Great! What type of session would you like? (wedding, portrait, event)", "bot");
}

async function handleBooking(text) {
  switch (bookingFlow.step) {
    case 1:
      memory.sessionType = text;
      bookingFlow.step = 2;
      typeMessage("What date is your session?", "bot");
      break;
    case 2:
      memory.date = text;
      bookingFlow.step = 3;
      typeMessage("Where will the session take place?", "bot");
      break;
    case 3:
      memory.location = text;
      bookingFlow.step = 4;
      typeMessage("Please provide your phone number.", "bot");
      break;
    case 4:
      memory.phone = text;
      bookingFlow.step = 5;
      typeMessage("Finally, provide your email address.", "bot");
      break;
    case 5:
      memory.email = text;
      bookingFlow.active = false;
      await processBooking();
      break;
  }
  localStorage.setItem("studioMemory", JSON.stringify(memory));
}

/* =========================================================
BOOKING API
========================================================= */

async function processBooking() {
  showTyping();
  await delay(1500);
  removeTyping();

  try {
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(memory),
    });

    const data = await response.json();

    typeMessage("✅ Your booking request has been received! We will confirm shortly.", "bot");

    if (data.paymentRequired) {
      typeMessage("Please complete your deposit using M-Pesa to confirm the booking.", "bot");
      await triggerMpesa();
    }
  } catch (err) {
    typeMessage("⚠ Booking failed. Please try again later.", "bot");
  }
}

/* =========================================================
MPESA PAYMENT
========================================================= */

async function triggerMpesa() {
  try {
    await fetch("/api/mpesa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: memory.phone, amount: 1000 }),
    });
    typeMessage("📱 M-Pesa payment request sent to your phone.", "bot");
  } catch (err) {
    typeMessage("⚠ M-Pesa payment failed.", "bot");
  }
}

/* =========================================================
GEMINI AI API CALL (only AI - no fallback)
========================================================= */

async function callAI() {
  try {
    // Format conversation for Gemini
    const formatted = conversation.map((m) => ({
      role: m.type === "user" ? "user" : "model",
      parts: [{ text: m.text }],
    }));

    // System prompt to control behavior
    const systemPrompt = {
      role: "user",
      parts: [{
        text: "You are Joy, a friendly and professional photography studio assistant for Joyalty Photography in Nairobi. Be helpful, warm, and creative. Help with bookings, pricing, portfolio questions, and photography tips. Use emojis sparingly. If unsure, suggest contacting the studio directly."
      }]
    };

    showTyping(); // show typing while waiting for real AI

    const response = await fetch("/functions/gemini-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [systemPrompt, ...formatted],
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    removeTyping();
    return data.reply || "I'm here to help! What would you like to know?";
  } catch (err) {
    console.error("Gemini API error:", err);
    removeTyping();
    return "Sorry, I'm having trouble connecting right now. Please try again later or contact the studio directly.";
  }
}

/* =========================================================
SEND MESSAGE
========================================================= */

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  typeMessage(text, "user");
  chatInput.value = "";
  updateMemory(text);

  // Handle first message (name collection)
  if (!userName) {
    userName = text.trim().split(" ")[0];
    localStorage.setItem("studioUser", userName);
    typeMessage(`Nice to meet you ${userName}! 👋 How can I help you today?`, "bot");
    return;
  }

  // Handle active booking flow (still rule-based for now)
  if (bookingFlow.active) {
    await handleBooking(text);
    return;
  }

  // Use Gemini API for everything else
  const aiReply = await callAI();
  typeMessage(aiReply, "bot");
}

/* =========================================================
EVENTS
========================================================= */

sendBtn.onclick = sendMessage;
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});