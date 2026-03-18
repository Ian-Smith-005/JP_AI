// =========================
// SECTION NAVIGATION
// =========================
const links = document.querySelectorAll('.sidebar a');
const sections = document.querySelectorAll('.section');

links.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();

    links.forEach(l => l.classList.remove('active'));
    link.classList.add('active');

    const target = link.getAttribute('data-section');

    sections.forEach(section => {
      section.classList.remove('active');
      if (section.id === target) {
        section.classList.add('active');
      }
    });
  });
});

// =========================
// DARK MODE
// =========================
const darkToggle = document.querySelector('.dark-toggle');

darkToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');

  // Save preference
  localStorage.setItem('darkMode', document.body.classList.contains('dark'));
});

// Load saved mode
if (localStorage.getItem('darkMode') === 'true') {
  document.body.classList.add('dark');
}

// =========================
// PROFILE DROPDOWN
// =========================
const profile = document.querySelector('.profile');
const dropdown = document.querySelector('.profile-dropdown');

profile.addEventListener('click', () => {
  dropdown.style.display = dropdown.style.display === 'flex' ? 'none' : 'flex';
});

// Close dropdown when clicking outside
window.addEventListener('click', (e) => {
  if (!profile.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

// =========================
// LOGIN SYSTEM (DEMO)
// =========================
const loginOverlay = document.getElementById('loginOverlay');

function logout() {
  loginOverlay.style.display = 'flex';
}

function login() {
  const user = document.getElementById('username').value;
  const pass = document.getElementById('password').value;

  if (user === "admin" && pass === "1234") {
    loginOverlay.style.display = 'none';
  } else {
    alert("Invalid credentials");
  }
}

// =========================
// CHARTS (Chart.js)
// =========================
window.addEventListener('load', () => {
  // BOOKINGS CHART
  const bookingsCtx = document.getElementById('bookingsChart');
  if (bookingsCtx) {
    new Chart(bookingsCtx, {
      type: 'line',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
          label: 'Bookings',
          data: [3, 5, 2, 8, 6, 9, 4],
          fill: true,
          tension: 0.4
        }]
      }
    });
  }

  // TRAFFIC CHART
  const trafficCtx = document.getElementById('trafficChart');
  if (trafficCtx) {
    new Chart(trafficCtx, {
      type: 'bar',
      data: {
        labels: ['Direct', 'Instagram', 'WhatsApp', 'Google'],
        datasets: [{
          label: 'Traffic Sources',
          data: [40, 25, 20, 15]
        }]
      }
    });
  }
});

// =========================
// CHAT SYSTEM
// =========================
const chatInput = document.querySelector('.chat-input input');
const chatMessages = document.querySelector('.chat-messages');

function sendMessage() {
  const message = chatInput.value.trim();
  if (!message) return;

  const msgDiv = document.createElement('div');
  msgDiv.textContent = message;
  msgDiv.style.margin = "10px 0";
  msgDiv.style.padding = "10px";
  msgDiv.style.background = "darkcyan";
  msgDiv.style.color = "#fff";
  msgDiv.style.borderRadius = "10px";
  msgDiv.style.alignSelf = "flex-end";

  chatMessages.appendChild(msgDiv);
  chatInput.value = "";

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Enter key send
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// =========================
// MODAL
// =========================
function openModal() {
  document.getElementById('bookingModal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('bookingModal').style.display = 'none';
}

// =========================
// LOGOUT BUTTON HOOK
// =========================
document.querySelectorAll('.logout').forEach(btn => {
  btn.addEventListener('click', logout);
});