/* ============================================================
   JOYALTY PHOTOGRAPHY — aichat.js
   Features:
   • Single-row header (icon | pill toggle | trash | ×)
   • AI mode  → Joy/Gemini via /api/gemini-chat
   • Live mode → name prompt on first switch, then polls
                 /api/live-chat for admin replies every 4s
   • Persistent AI history in localStorage
   • Booking flow trigger from AI
============================================================ */

// ── DOM ────────────────────────────────────────────────────────
const chatToggle   = document.getElementById("chatToggle");
const chatContainer= document.getElementById("chatContainer");
const closeChat    = document.getElementById("closeChat");
const chatMessages = document.getElementById("chatMessages");
const chatInput    = document.getElementById("chatInput");
const sendBtn      = document.getElementById("sendBtn");
const namePrompt   = document.getElementById("chatNamePrompt");
const liveNameInput= document.getElementById("liveNameInput");

// ── State ──────────────────────────────────────────────────────
let conversation = _load("studioChat")        || [];
let userName     = _load("studioUser")        || null;
let memory       = _load("studioMemory")      || { sessionType:null, date:null, location:null, phone:null, email:null };
let bookingFlow  = { active:false, step:0 };

let chatMode      = _load("joyalty_chat_mode")  || "ai";
let liveMessages  = _load("joyalty_live_msgs")  || [];
let liveSessionId = _load("joyalty_live_sid")   || null;
let liveName      = _load("joyalty_live_name")  || null;
let livePollTimer = null;
let chatOpen      = false;

// ── Storage helpers ────────────────────────────────────────────
function _save(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(_){} }
function _load(k)  { try{ const r=localStorage.getItem(k); return r?JSON.parse(r):null; }catch(_){ return null; } }
function _del(k)   { try{ localStorage.removeItem(k); }catch(_){} }
function _json(t)  { try{ return JSON.parse(t); }catch(_){ return null; } }
function _delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

function _saveConv() {
  if (conversation.length > 60) conversation = conversation.slice(-60);
  _save("studioChat", conversation);
}

// ── Refresh pill button active states ─────────────────────────
function _refreshPill() {
  document.getElementById("btnModeAI")  ?.classList.toggle("active", chatMode==="ai");
  document.getElementById("btnModeLive")?.classList.toggle("active", chatMode==="live");
}

// ── Open / Close ───────────────────────────────────────────────
function toggleChat() {
  chatOpen = !chatOpen;
  chatContainer.classList.toggle("active", chatOpen);
  if (chatOpen) {
    _refreshPill();
    if (chatMessages.children.length === 0) _enterMode(chatMode);
    setTimeout(()=>chatInput?.focus(), 300);
  } else {
    stopLivePoll();
  }
}

chatToggle.onclick = toggleChat;
closeChat.onclick  = ()=>{ chatOpen=false; chatContainer.classList.remove("active"); stopLivePoll(); };

// ── Switch mode (called by pill buttons) ──────────────────────
window.setChatMode = function(mode) {
  chatMode = mode;
  _save("joyalty_chat_mode", mode);
  _refreshPill();
  chatMessages.innerHTML = "";
  namePrompt.classList.remove("visible");
  chatMessages.style.display = "";
  document.querySelector(".chat-input") && (document.querySelector(".chat-input").style.display = "");
  stopLivePoll();
  _enterMode(mode);
};

function _enterMode(mode) {
  if (mode === "ai") {
    _renderAIHistory();
    if (chatMessages.children.length === 0) {
      typeMessage(
        userName
          ? `Welcome back, ${userName}! 👋 How can I help you today?`
          : "Hello 👋 I'm Joy, your Joyalty Photography assistant. What's your name?",
        "bot"
      );
    }
  } else {
    _enterLive();
  }
}

// ── AI mode ────────────────────────────────────────────────────
function _renderAIHistory() {
  conversation.forEach(m => {
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
    // Show name prompt, hide messages + input
    namePrompt.classList.add("visible");
    chatMessages.style.display = "none";
    document.querySelector(".chat-input") && (document.querySelector(".chat-input").style.display = "none");
    liveNameInput?.focus();
    return;
  }
  _showLiveChat();
}

window.confirmLiveName = function() {
  const name = liveNameInput?.value.trim();
  if (!name) { if(liveNameInput){ liveNameInput.placeholder="Enter a name first…"; liveNameInput.focus(); } return; }
  liveName      = name;
  liveSessionId = `${name.replace(/\s+/g,"_")}-${Date.now()}`;
  _save("joyalty_live_name", liveName);
  _save("joyalty_live_sid",  liveSessionId);
  namePrompt.classList.remove("visible");
  chatMessages.style.display = "";
  document.querySelector(".chat-input") && (document.querySelector(".chat-input").style.display = "");
  _showLiveChat();
};

function _showLiveChat() {
  liveMessages.forEach(_renderLiveBubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  if (!liveMessages.length) {
    _sysMsg(`You're chatting as ${liveName}. We reply Mon–Sat, 9AM–7PM EAT.`);
  }
  startLivePoll();
}

// ── Type animation ─────────────────────────────────────────────
function typeMessage(text, type) {
  removeTyping();
  const el = document.createElement("div");
  el.className = `message ${type}`;
  chatMessages.appendChild(el);

  let i=0;
  (function tick(){
    if(i<text.length){ el.textContent+=text.charAt(i++); chatMessages.scrollTop=chatMessages.scrollHeight; setTimeout(tick,14); }
  })();

  if(type==="user"||type==="bot"){ conversation.push({type,text}); _saveConv(); }
}

function showTyping() {
  removeTyping();
  const el=document.createElement("div"); el.className="typing"; el.id="typing";
  el.innerHTML="<span></span><span></span><span></span>";
  chatMessages.appendChild(el); chatMessages.scrollTop=chatMessages.scrollHeight;
}
function removeTyping(){ document.getElementById("typing")?.remove(); }

function _sysMsg(text) {
  const d=document.createElement("div"); d.className="chat-system-msg"; d.textContent=text;
  chatMessages.appendChild(d); chatMessages.scrollTop=chatMessages.scrollHeight;
}

// ── Live bubble ────────────────────────────────────────────────
function _renderLiveBubble(msg) {
  const isMe = msg.sender==="user";
  const el   = document.createElement("div");
  el.className = `message ${isMe?"user":"bot"}`;
  el.dataset.msgId = msg.id;
  const time = new Date(msg.timestamp||Date.now()).toLocaleTimeString("en-KE",{hour:"2-digit",minute:"2-digit"});
  el.innerHTML=`<span>${_esc(msg.text)}</span><span style="font-size:10px;opacity:.42;display:block;margin-top:3px">${isMe?"You":"Admin"} · ${time}</span>`;
  chatMessages.appendChild(el); chatMessages.scrollTop=chatMessages.scrollHeight;
}

// ── Live chat polling ──────────────────────────────────────────
function startLivePoll() {
  stopLivePoll();
  livePollTimer = setInterval(async ()=>{
    if(!liveSessionId) return;
    try{
      const d = _json(await (await fetch(`/api/live-chat?sessionId=${encodeURIComponent(liveSessionId)}`)).text());
      if(!d?.messages) return;
      const known = new Set(liveMessages.map(m=>String(m.id)));
      const newMs = d.messages.filter(m=>m.sender==="admin"&&!known.has(String(m.id)));
      newMs.forEach(m=>{ liveMessages.push(m); _renderLiveBubble(m); });
      if(newMs.length) _save("joyalty_live_msgs", liveMessages);
    }catch(_){}
  }, 4000);
}
function stopLivePoll(){ if(livePollTimer){ clearInterval(livePollTimer); livePollTimer=null; } }

async function _sendLiveMsg(text) {
  const msg = { id:Date.now(), sessionId:liveSessionId, sender:"user", name:liveName||userName||"Client", text, timestamp:new Date().toISOString() };
  liveMessages.push(msg); _save("joyalty_live_msgs",liveMessages); _renderLiveBubble(msg);
  try{ await fetch("/api/live-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(msg)}); }catch(_){}
}

// ── Memory ─────────────────────────────────────────────────────
function updateMemory(text) {
  const t=text.toLowerCase();
  if(t.includes("wedding"))    memory.sessionType="wedding";
  if(t.includes("portrait"))   memory.sessionType="portrait";
  if(t.includes("event"))      memory.sessionType="event";
  if(t.includes("commercial")) memory.sessionType="commercial";
  if(/\d{4}/.test(t))          memory.date=text;
  if(t.includes("@"))          memory.email=text;
  if(/\d{9,13}/.test(t))       memory.phone=text;
  _save("studioMemory",memory);
}

// ── Booking flow ───────────────────────────────────────────────
function startBooking() {
  bookingFlow.active=true; bookingFlow.step=1;
  typeMessage("Sure! What type of session? (wedding, portrait, commercial, event)","bot");
}
async function handleBooking(text) {
  switch(bookingFlow.step){
    case 1: memory.sessionType=text; bookingFlow.step=2; typeMessage("What date are you thinking?","bot"); break;
    case 2: memory.date=text;        bookingFlow.step=3; typeMessage("Where will the session take place?","bot"); break;
    case 3: memory.location=text;    bookingFlow.step=4; typeMessage("What's your phone number?","bot"); break;
    case 4: memory.phone=text;       bookingFlow.step=5; typeMessage("And your email address?","bot"); break;
    case 5:
      memory.email=text; bookingFlow.active=false;
      typeMessage("Details saved! Head to our Services page to complete your booking and pay the deposit. 👉","bot");
      break;
  }
  _save("studioMemory",memory);
}

// ── Gemini AI call ─────────────────────────────────────────────
async function callAI() {
  const formatted = conversation
    .filter(m=>m.type==="user"||m.type==="bot")
    .map(m=>({role:m.type==="user"?"user":"model",parts:[{text:m.text}]}));
  showTyping();
  try{
    const res  = await fetch("/api/gemini-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:formatted})});
    const data = _json(await res.text());
    removeTyping();
    return data?.reply || "I'm here to help!";
  }catch(err){
    removeTyping(); console.error("[chat]",err.message);
    return "⚠ I'm having trouble connecting right now. Please try again.";
  }
}

// ── Main send ──────────────────────────────────────────────────
async function sendMessage() {
  const text = chatInput.value.trim();
  if(!text) return;
  chatInput.value="";

  // Live mode
  if(chatMode==="live"){ await _sendLiveMsg(text); return; }

  // AI mode
  typeMessage(text,"user");
  updateMemory(text);

  if(!userName){
    userName=text.split(" ")[0];
    _save("studioUser",userName);
    typeMessage(`Nice to meet you, ${userName}! 👋 Ask me about services, pricing, or how to book.`,"bot");
    return;
  }
  if(bookingFlow.active){ await handleBooking(text); return; }

  const reply = await callAI();
  if(reply.includes("[START_BOOKING]")){
    const clean=reply.replace("[START_BOOKING]","").trim();
    if(clean) typeMessage(clean,"bot");
    await _delay(400); startBooking();
  } else {
    typeMessage(reply,"bot");
  }
}

// ── Events ─────────────────────────────────────────────────────
sendBtn.onclick = sendMessage;
chatInput.addEventListener("keypress",e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();} });
liveNameInput?.addEventListener("keypress",e=>{ if(e.key==="Enter") window.confirmLiveName(); });

// ── Delete modal ───────────────────────────────────────────────
window.openDeleteModal = ()=>{ document.getElementById("deleteModal").style.display="flex"; };

document.getElementById("confirmDelete")?.addEventListener("click",()=>{
  conversation=[]; userName=null; memory={};
  ["studioChat","studioUser","studioMemory","joyalty_live_msgs","joyalty_live_sid","joyalty_live_name"].forEach(_del);
  liveMessages=[]; liveSessionId=null; liveName=null;
  chatMessages.innerHTML="";
  document.getElementById("deleteModal").style.display="none";
  chatMode="ai"; _refreshPill(); _enterMode("ai");
});
document.getElementById("cancelDelete")?.addEventListener("click",()=>{ document.getElementById("deleteModal").style.display="none"; });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") document.getElementById("deleteModal").style.display="none"; });

// ── Escape HTML ────────────────────────────────────────────────
function _esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }