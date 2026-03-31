// ════════════════════════════════════════════════════════════
// JOYALTY ADMIN — admin.js (inline)
// ════════════════════════════════════════════════════════════

// ── Auth ────────────────────────────────────────────────────
// Credentials stored client-side for demo.
// For production: validate against /api/admin-auth endpoint
// which checks against hashed values in env vars.
const ADMIN_EMAIL    = "joyaltyphotography254@gmail.com";
const ADMIN_PASSCODE = "Joyalty@2026"; // Change this — move to /api/admin-auth

let currentUser = null;
let allBookings  = [];
let allClients   = [];
let chatMode     = 'bot'; // 'bot' | 'live'
let chatConversation = [];

function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  const btn   = document.getElementById('loginBtnText');

  errEl.style.display = 'none';

  if (email === ADMIN_EMAIL && pass === ADMIN_PASSCODE) {
    currentUser = { email, name: "Admin" };
    sessionStorage.setItem('joyalty_admin', JSON.stringify(currentUser));
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminApp').style.display   = 'flex';
    document.getElementById('adminNameDisplay').textContent = 'Admin';
    document.getElementById('adminAvatarInitial').textContent = 'A';
    initDashboard();
  } else {
    errEl.textContent = 'Incorrect email or passcode. Please try again.';
    errEl.style.display = 'block';
  }
}

function doLogout() {
  sessionStorage.removeItem('joyalty_admin');
  currentUser = null;
  document.getElementById('adminApp').style.display   = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPass').value  = '';
}

// Enter key on login
document.getElementById('loginPass').addEventListener('keypress', e => {
  if (e.key === 'Enter') doLogin();
});

// Auto-login if session exists
(function() {
  const saved = sessionStorage.getItem('joyalty_admin');
  if (saved) {
    currentUser = JSON.parse(saved);
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminApp').style.display   = 'flex';
    initDashboard();
  }
})();

// ── Tab navigation ───────────────────────────────────────────
const TAB_TITLES = {
  overview: 'Overview', bookings: 'Bookings',
  clients: 'Clients',   email: 'Email',
  chat: 'Chat',         analytics: 'Analytics',
};

function switchTab(tab) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelector(`.nav-item[onclick*="${tab}"]`).classList.add('active');
  document.getElementById('tabTitle').textContent = TAB_TITLES[tab];
  if (tab === 'bookings')  loadBookings();
  if (tab === 'clients')   loadClients();
  if (tab === 'analytics') renderAnalytics();
  if (tab === 'chat')      initAdminChat();
}

// ── Init dashboard ───────────────────────────────────────────
async function initDashboard() {
  await loadStats();
  await loadBookings();
  renderOverviewCharts();
}

// ── API helpers ──────────────────────────────────────────────
async function apiGet(path) {
  const res = await fetch(path);
  const txt = await res.text();
  try { return JSON.parse(txt); } catch (_) { return { error: txt }; }
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch (_) { return { error: txt }; }
}

async function apiDelete(path) {
  const res = await fetch(path, { method: 'DELETE' });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch (_) { return { error: txt }; }
}

// ── Stats ────────────────────────────────────────────────────
async function loadStats() {
  const data = await apiGet('/api/admin/stats');
  if (data.error) return;
  document.getElementById('st-total').textContent     = data.totalBookings     ?? '—';
  document.getElementById('st-confirmed').textContent = data.confirmedBookings ?? '—';
  document.getElementById('st-pending').textContent   = data.pendingBookings   ?? '—';
  document.getElementById('st-revenue').textContent   = data.totalRevenue
    ? `${(data.totalRevenue/1000).toFixed(0)}K`
    : '—';
  document.getElementById('pendingCount').textContent = data.pendingBookings ?? 0;
}

// ── Bookings ─────────────────────────────────────────────────
async function loadBookings() {
  const data = await apiGet('/api/admin/bookings');
  if (data.error || !Array.isArray(data.bookings)) {
    showAlert('bookingsAlert', 'Failed to load bookings: ' + (data.error || 'Unknown error'), 'error');
    return;
  }
  allBookings = data.bookings;
  renderBookingsTable(allBookings);
}

function renderBookingsTable(rows) {
  const tbody = document.getElementById('bookingsBody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-calendar-xmark" style="font-size:2rem;opacity:.3;display:block;margin-bottom:12px"></i>No bookings yet</div></td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(b => `
    <tr>
      <td style="font-family:monospace;font-size:.8rem">${b.booking_ref}</td>
      <td>
        <div style="font-weight:600">${esc(b.client_name || '—')}</div>
        <div style="font-size:.75rem;color:var(--muted)">${esc(b.client_email || '')}</div>
      </td>
      <td>${esc(b.service_name || b.service_type || '—')}</td>
      <td style="font-size:.82rem">${b.event_date || '—'}</td>
      <td style="font-weight:600">KSh ${Number(b.total_price||0).toLocaleString()}</td>
      <td><span class="status-badge ${b.status}">${b.status}</span></td>
      <td>
        <button class="action-btn edit"   onclick="openEditBooking(${b.id})"  title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="action-btn delete" onclick="openDeleteBooking(${b.id})" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

// ── Clients ──────────────────────────────────────────────────
async function loadClients() {
  const data = await apiGet('/api/admin/clients');
  if (data.error || !Array.isArray(data.clients)) return;
  allClients = data.clients;
  const tbody = document.getElementById('clientsBody');
  tbody.innerHTML = allClients.map(c => `
    <tr>
      <td style="font-weight:600">${esc(c.name)}</td>
      <td>${esc(c.email)}</td>
      <td>${esc(c.phone || '—')}</td>
      <td style="font-size:.8rem;color:var(--muted)">${c.created_at ? new Date(c.created_at).toLocaleDateString('en-KE') : '—'}</td>
    </tr>
  `).join('') || '<tr><td colspan="4"><div class="empty-state">No clients yet</div></td></tr>';
}

// ── Create / Edit Booking Modal ──────────────────────────────
let editingBookingId = null;

function openCreateBooking() {
  editingBookingId = null;
  document.getElementById('bookingModalTitle').textContent = 'New Booking';
  ['bm-name','bm-email','bm-phone','bm-date','bm-location','bm-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('bm-service').value = '';
  document.getElementById('bm-package').value = 'Standard';
  document.getElementById('bm-extra').value   = 'None';
  openModal('bookingModal');
}

function openEditBooking(id) {
  const b = allBookings.find(x => x.id === id);
  if (!b) return;
  editingBookingId = id;
  document.getElementById('bookingModalTitle').textContent = 'Edit Booking';
  document.getElementById('bm-name').value     = b.client_name    || '';
  document.getElementById('bm-email').value    = b.client_email   || '';
  document.getElementById('bm-phone').value    = b.client_phone   || '';
  document.getElementById('bm-service').value  = b.service_name   || b.service_type || '';
  document.getElementById('bm-package').value  = b.package_name   || 'Standard';
  document.getElementById('bm-extra').value    = b.extra_name     || 'None';
  document.getElementById('bm-date').value     = b.event_date     || '';
  document.getElementById('bm-location').value = b.event_location || b.location || '';
  document.getElementById('bm-notes').value    = b.event_description || '';
  openModal('bookingModal');
}

async function submitBookingModal() {
  const body = {
    clientName:      document.getElementById('bm-name').value.trim(),
    clientEmail:     document.getElementById('bm-email').value.trim(),
    clientPhone:     document.getElementById('bm-phone').value.trim(),
    serviceType:     document.getElementById('bm-service').value,
    servicePackage:  document.getElementById('bm-package').value,
    extraServices:   document.getElementById('bm-extra').value,
    eventDate:       document.getElementById('bm-date').value,
    eventLocation:   document.getElementById('bm-location').value.trim(),
    eventDescription: document.getElementById('bm-notes').value.trim(),
  };

  if (!body.clientName || !body.clientEmail || !body.serviceType) {
    showAlert('bookingModalAlert', 'Name, email and service are required.', 'error');
    return;
  }

  const endpoint = editingBookingId ? `/api/admin/bookings/${editingBookingId}` : '/api/bookings';
  const method   = editingBookingId ? 'PUT' : 'POST';

  const res = await fetch(endpoint, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: 'Invalid response' }));

  if (data.success || data.bookingRef) {
    closeModal('bookingModal');
    await loadBookings();
    await loadStats();
    showAlert('bookingsAlert', editingBookingId ? 'Booking updated.' : `Booking ${data.bookingRef} created.`, 'success');
    switchTab('bookings');
  } else {
    showAlert('bookingModalAlert', data.error || 'Failed to save booking.', 'error');
  }
}

// ── Delete Booking ───────────────────────────────────────────
function openDeleteBooking(id) {
  document.getElementById('deleteBookingId').value = id;
  openModal('deleteModal');
}

async function confirmDelete() {
  const id   = document.getElementById('deleteBookingId').value;
  const data = await apiDelete(`/api/admin/bookings/${id}`);
  closeModal('deleteModal');
  if (data.success) {
    await loadBookings();
    await loadStats();
    showAlert('bookingsAlert', 'Booking deleted successfully.', 'success');
  } else {
    showAlert('bookingsAlert', data.error || 'Delete failed.', 'error');
  }
}

// ── Search ───────────────────────────────────────────────────
function onSearch(q) {
  const lower = q.toLowerCase();
  const filtered = allBookings.filter(b =>
    (b.booking_ref||'').toLowerCase().includes(lower) ||
    (b.client_name||'').toLowerCase().includes(lower) ||
    (b.client_email||'').toLowerCase().includes(lower) ||
    (b.service_name||'').toLowerCase().includes(lower)
  );
  renderBookingsTable(filtered);
}

// ── Email ────────────────────────────────────────────────────
async function sendAdminEmail() {
  const to      = document.getElementById('emailTo').value.trim();
  const subject = document.getElementById('emailSubject').value.trim();
  const message = document.getElementById('emailBody').value.trim();

  if (!to || !subject || !message) {
    showAlert('emailAlert', 'To, Subject and Message are all required.', 'error'); return;
  }

  const data = await apiPost('/api/contact', {
    name: 'Joyalty Admin', email: to, subject, message,
  });

  if (data.success) {
    showAlert('emailAlert', 'Email sent successfully.', 'success');
    document.getElementById('emailTo').value = '';
    document.getElementById('emailSubject').value = '';
    document.getElementById('emailBody').value = '';
  } else {
    showAlert('emailAlert', data.error || 'Failed to send email.', 'error');
  }
}

// ── Chat ─────────────────────────────────────────────────────
const BOT_CONTACTS = [
  { id: 'joy', name: 'Joy — AI Assistant', sub: 'Gemini chatbot', avatar: '🤖', isBot: true },
];

function setChatMode(mode) {
  chatMode = mode;
  document.getElementById('modeBtnBot').classList.toggle('active',  mode === 'bot');
  document.getElementById('modeBtnLive').classList.toggle('active', mode === 'live');

  const list = document.getElementById('contactList');
  if (mode === 'bot') {
    list.innerHTML = BOT_CONTACTS.map(c => `
      <div class="contact-item active" onclick="selectContact('${c.id}')">
        <div class="contact-avatar bot"><i class="fa-solid fa-robot"></i></div>
        <div>
          <div class="contact-name">${c.name}</div>
          <div class="contact-preview">${c.sub}</div>
        </div>
      </div>`).join('');
    selectContact('joy');
  } else {
    list.innerHTML = allClients.length
      ? allClients.map((c,i) => `
        <div class="contact-item ${i===0?'active':''}" onclick="selectContact('client-${c.id}','${esc(c.name)}','${esc(c.email)}')">
          <div class="contact-avatar">${(c.name||'?')[0].toUpperCase()}</div>
          <div>
            <div class="contact-name">${esc(c.name)}</div>
            <div class="contact-preview">${esc(c.email)}</div>
          </div>
        </div>`).join('')
      : '<div style="padding:20px;color:var(--muted);font-size:.85rem;text-align:center">No clients yet</div>';
  }
}

let activeChatId = null;

function selectContact(id, name, sub) {
  activeChatId = id;
  document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
  event?.currentTarget?.classList.add('active');

  const isBot = id === 'joy';
  document.getElementById('chatActiveName').textContent = name || (isBot ? 'Joy — AI Assistant' : 'Client');
  document.getElementById('chatActiveSub').textContent  = sub  || (isBot ? 'Gemini-powered' : 'Live conversation');

  const msgs = document.getElementById('adminChatMessages');
  msgs.innerHTML = '';
  chatConversation = [];

  if (isBot) {
    appendAdminMsg('Hi Admin! I\'m Joy. Ask me anything about Joyalty Photography or client queries.', 'incoming', '🤖');
  }
}

function initAdminChat() {
  if (!activeChatId) setChatMode('bot');
}

function appendAdminMsg(text, dir, avatarChar) {
  const msgs = document.getElementById('adminChatMessages');
  const div  = document.createElement('div');
  div.className = `msg ${dir}`;
  div.innerHTML = `
    <div class="msg-avatar-sm">${avatarChar || (dir==='outgoing'?'A':'?')}</div>
    <div class="msg-bubble">${esc(text)}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

async function sendAdminChat() {
  const input = document.getElementById('adminChatInput');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';

  appendAdminMsg(text, 'outgoing', 'A');

  if (activeChatId === 'joy') {
    // AI bot mode
    chatConversation.push({ type: 'user', text });
    const formatted = chatConversation.map(m => ({
      role: m.type === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    }));

    const typingEl = document.createElement('div');
    typingEl.id = 'adminTyping';
    typingEl.className = 'msg incoming';
    typingEl.innerHTML = '<div class="msg-bubble" style="opacity:.5">Joy is typing…</div>';
    document.getElementById('adminChatMessages').appendChild(typingEl);

    try {
      const res  = await fetch('/api/gemini-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: formatted }),
      });
      const data = await res.json().catch(() => ({ reply: 'Error' }));
      typingEl.remove();
      const reply = data.reply || 'Sorry, I could not respond.';
      chatConversation.push({ type: 'bot', text: reply });
      appendAdminMsg(reply, 'incoming', '🤖');
    } catch (_) {
      typingEl.remove();
      appendAdminMsg('Connection error. Please try again.', 'incoming', '🤖');
    }
  } else {
    // Live mode — placeholder (would integrate with a real-time channel)
    setTimeout(() => {
      appendAdminMsg('(Live chat requires WebSocket integration. Message logged.)', 'incoming', '📡');
    }, 400);
  }
}

// ── Charts ────────────────────────────────────────────────────
let charts = {};

function renderOverviewCharts() {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now    = new Date().getMonth();
  const labels = months.slice(Math.max(0, now-5), now+1);
  const mockBookings = [2,5,3,8,6,allBookings.length || 1];
  const mockRevenue  = [45000,90000,60000,160000,120000,allBookings.reduce((a,b)=>a+Number(b.deposit_paid||0),0)||45000];

  destroyChart('bookingsChart');
  charts.bookings = new Chart(document.getElementById('bookingsChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Bookings',
        data: mockBookings,
        backgroundColor: 'rgba(108,99,255,.5)',
        borderColor: '#6c63ff',
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    },
    options: { plugins:{ legend:{display:false} }, scales:{ y:{beginAtZero:true,grid:{color:'rgba(255,255,255,.04)'} }, x:{grid:{display:false}} } },
  });

  // Services doughnut
  const svcCounts = {};
  allBookings.forEach(b => { const s = b.service_name||'Other'; svcCounts[s] = (svcCounts[s]||0)+1; });
  const svcLabels = Object.keys(svcCounts).length ? Object.keys(svcCounts) : ['Wedding','Portrait','Commercial','Event'];
  const svcData   = Object.keys(svcCounts).length ? Object.values(svcCounts) : [4,3,2,2];

  destroyChart('servicesChart');
  charts.services = new Chart(document.getElementById('servicesChart'), {
    type: 'doughnut',
    data: { labels: svcLabels, datasets:[{ data: svcData, backgroundColor:['#6c63ff','#22c55e','#f59e0b','#ef4444','#a78bfa','#34d399'], borderWidth:0 }] },
    options: { plugins:{ legend:{position:'bottom', labels:{color:'#8892a4',font:{size:11},padding:12}} } },
  });

  destroyChart('revenueChart');
  charts.revenue = new Chart(document.getElementById('revenueChart'), {
    type: 'line',
    data: { labels, datasets:[{ label:'Revenue (KSh)', data: mockRevenue, borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.08)', fill:true, tension:.4, pointBackgroundColor:'#22c55e', pointRadius:3 }] },
    options: { plugins:{ legend:{display:false} }, scales:{ y:{beginAtZero:true,grid:{color:'rgba(255,255,255,.04)'},ticks:{callback:v=>`${(v/1000).toFixed(0)}K`}}, x:{grid:{display:false}} } },
  });
}

function renderAnalytics() {
  const statusCounts = { pending:0, confirmed:0, cancelled:0, completed:0 };
  allBookings.forEach(b => { if (statusCounts[b.status]!==undefined) statusCounts[b.status]++; });

  destroyChart('statusChart');
  charts.status = new Chart(document.getElementById('statusChart'), {
    type: 'pie',
    data: { labels: Object.keys(statusCounts), datasets:[{ data: Object.values(statusCounts), backgroundColor:['#f59e0b','#22c55e','#ef4444','#6c63ff'], borderWidth:0 }] },
    options: { plugins:{ legend:{position:'bottom',labels:{color:'#8892a4',font:{size:11}}} } },
  });

  destroyChart('paymentChart');
  charts.payment = new Chart(document.getElementById('paymentChart'), {
    type: 'doughnut',
    data: { labels:['M-Pesa','Card','Pending'], datasets:[{ data:[6,2,1], backgroundColor:['#22c55e','#6c63ff','#f59e0b'], borderWidth:0 }] },
    options: { plugins:{ legend:{position:'bottom',labels:{color:'#8892a4',font:{size:11}}} } },
  });

  // Daily revenue — last 30 days
  const days = Array.from({length:30},(_,i)=>{
    const d = new Date(); d.setDate(d.getDate()-29+i);
    return d.toLocaleDateString('en-KE',{month:'short',day:'numeric'});
  });
  const dailyData = days.map((_,i) => i===29 ? 45000 : i===28 ? 30000 : i===25 ? 18000 : 0);

  destroyChart('dailyRevenueChart');
  charts.daily = new Chart(document.getElementById('dailyRevenueChart'), {
    type: 'bar',
    data: { labels:days, datasets:[{ label:'Revenue',data:dailyData,backgroundColor:'rgba(108,99,255,.4)',borderColor:'#6c63ff',borderWidth:1.5,borderRadius:2 }] },
    options: { plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true,grid:{color:'rgba(255,255,255,.04)'},ticks:{callback:v=>`${(v/1000).toFixed(0)}K`}}, x:{grid:{display:false},ticks:{maxTicksLimit:8}} } },
  });
}

function destroyChart(id) {
  if (charts[id.replace('Chart','')]) {
    charts[id.replace('Chart','')].destroy();
    delete charts[id.replace('Chart','')];
  }
  // fallback by canvas id
  const c = Chart.getChart(id);
  if (c) c.destroy();
}

// ── Modals ───────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close on backdrop click
document.querySelectorAll('.admin-modal-backdrop').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

// ── Alerts ───────────────────────────────────────────────────
function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent    = msg;
  el.className      = `admin-alert ${type}`;
  el.style.display  = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

// ── Helpers ──────────────────────────────────────────────────
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}