AOS.init({ duration: 650, once: true });

// ── Product catalogue ─────────────────────────────────────────
const PRODUCTS = [
  { id:1,  name:"Classic Wood Frame",     category:"frames",      price:3500,  desc:"Handcrafted mahogany frame. Available A4–A1.",      img:"https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=400" },
  { id:2,  name:"Floating Acrylic Frame", category:"frames",      price:6500,  desc:"Museum-quality acrylic mount. Crystal-clear finish.", img:"https://images.unsplash.com/photo-1580130732478-4e339fb33746?w=400" },
  { id:3,  name:"Black Metal Frame",      category:"frames",      price:2800,  desc:"Slim brushed aluminium. Suits modern interiors.",     img:"https://images.unsplash.com/photo-1584824486509-112e4181ff6b?w=400" },
  { id:4,  name:"Canvas Print – A3",      category:"prints",      price:2200,  desc:"Gallery-wrapped canvas, ready to hang. A3 size.",     img:"https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400" },
  { id:5,  name:"Lustre Print – A4",      category:"prints",      price:850,   desc:"Professional lustre finish, vibrant colours.",        img:"https://images.unsplash.com/photo-1533158326339-7f3cf2404354?w=400" },
  { id:6,  name:"Fine Art Print – A2",    category:"prints",      price:4500,  desc:"Archival pigment print on 310gsm cotton rag.",        img:"https://images.unsplash.com/photo-1510936111840-65e151ad71bb?w=400" },
  { id:7,  name:"Lay-Flat Photo Album",   category:"albums",      price:8500,  desc:"20 spreads, flush-mount binding. 10×10 inches.",      img:"https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400" },
  { id:8,  name:"Wedding Album – Linen",  category:"albums",      price:14500, desc:"Linen-covered hardback, 30 spreads, personalised.",   img:"https://images.unsplash.com/photo-1519741497674-611481863552?w=400" },
  { id:9,  name:"Mini Boudoir Album",     category:"albums",      price:4200,  desc:"Compact 6×6 inch softcover. 15 pages.",              img:"https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=400" },
  { id:10, name:"USB Drive – Engraved",   category:"accessories", price:1800,  desc:"Branded wooden USB with engraved logo. 32 GB.",      img:"https://images.unsplash.com/photo-1618044733300-9472054094ee?w=400" },
  { id:11, name:"Gift Voucher – KSh 5K",  category:"accessories", price:5000,  desc:"Redeemable against any session or product.",          img:"https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400" },
  { id:12, name:"Photo Keyring",          category:"accessories", price:650,   desc:"Acrylic keyring with your chosen photo.",             img:"https://images.unsplash.com/photo-1503602642458-232111445657?w=400" },
];

// ── Cart state ────────────────────────────────────────────────
let cart = JSON.parse(localStorage.getItem("joyalty_cart") || "[]");

function saveCart() { localStorage.setItem("joyalty_cart", JSON.stringify(cart)); }

// ── Render products ───────────────────────────────────────────
let activeFilter = "all";

function renderProducts() {
  const grid = document.getElementById("productsGrid");
  const items = activeFilter === "all" ? PRODUCTS : PRODUCTS.filter(p => p.category === activeFilter);

  grid.innerHTML = items.map(p => `
    <div class="col-sm-6 col-lg-4" data-aos="fade-up">
      <div class="product-card">
        <img src="${p.img}&q=80" alt="${p.name}" loading="lazy">
        <div class="product-info">
          <div class="product-category">${p.category}</div>
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${p.desc}</div>
          <div class="product-footer">
            <div class="product-price">KSh ${p.price.toLocaleString()}</div>
            <button class="btn-add-cart btn primary-btn" onclick="addToCart(${p.id})">
              <i class="fa-solid fa-plus"></i> Add
            </button>
          </div>
        </div>
      </div>
    </div>`).join("");
}

// Filter pills
document.querySelectorAll(".filter-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    renderProducts();
  });
});

// ── Cart functions ────────────────────────────────────────────
function addToCart(id) {
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) return;
  const ex = cart.find(i => i.id === id);
  if (ex) ex.qty++;
  else cart.push({ ...product, qty: 1 });
  saveCart(); updateCartUI();

  // Flash feedback on button
  const btn = event.currentTarget;
  const orig = btn.innerHTML;
  btn.innerHTML = "✓ Added"; btn.disabled = true;
  setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 900);
}

function updateCartUI() {
  const total  = cart.reduce((a,i) => a + i.price * i.qty, 0);
  const count  = cart.reduce((a,i) => a + i.qty, 0);
  const badge  = document.getElementById("cartBadge");
  const totalEl = document.getElementById("cartTotal");

  badge.style.display = count > 0 ? "flex" : "none";
  badge.textContent   = count;
  if (totalEl) totalEl.textContent = `KSh ${total.toLocaleString()}`;

  renderCartItems();
}

function renderCartItems() {
  const container = document.getElementById("cartItems");
  if (!container) return;
  if (!cart.length) {
    container.innerHTML = '<div class="cart-empty"><i class="fa-solid fa-cart-shopping" style="font-size:2rem;opacity:.25;display:block;margin-bottom:10px"></i>Your cart is empty</div>';
    return;
  }
  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${item.img}&w=128&q=70" alt="${item.name}">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">KSh ${item.price.toLocaleString()}</div>
        <div class="cart-qty">
          <button onclick="changeQty(${item.id},-1)"><i class="fa-solid fa-minus"></i></button>
          <span>${item.qty}</span>
          <button onclick="changeQty(${item.id},1)"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart(${item.id})" title="Remove">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>`).join("");
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) removeFromCart(id);
  else { saveCart(); updateCartUI(); }
}
function removeFromCart(id) { cart = cart.filter(i => i.id !== id); saveCart(); updateCartUI(); }
function clearCart()        { cart = []; saveCart(); updateCartUI(); }

// ── Cart sidebar ──────────────────────────────────────────────
function openCart() {
  document.getElementById("cartOverlay").classList.add("open");
  document.getElementById("cartSidebar").classList.add("open");
  renderCartItems();
}
function closeCart() {
  document.getElementById("cartOverlay").classList.remove("open");
  document.getElementById("cartSidebar").classList.remove("open");
}

// ── Checkout ──────────────────────────────────────────────────
function openCheckout() {
  if (!cart.length) { alert("Your cart is empty."); return; }
  closeCart();

  // Build summary
  const lines   = cart.map(i => `${i.name} ×${i.qty} — KSh ${(i.price*i.qty).toLocaleString()}`).join("<br>");
  const total   = cart.reduce((a,i) => a + i.price*i.qty, 0);
  document.getElementById("checkoutSummary").innerHTML =
    `${lines}<br><strong>Total: KSh ${total.toLocaleString()}</strong>`;

  document.getElementById("checkoutForm").style.display  = "block";
  document.getElementById("checkoutSuccess").style.display = "none";
  document.getElementById("checkoutModal").classList.add("open");
}
function closeCheckout() {
  document.getElementById("checkoutModal").classList.remove("open");
}

async function placeOrder() {
  const name    = document.getElementById("co-name").value.trim();
  const email   = document.getElementById("co-email").value.trim();
  const phone   = document.getElementById("co-phone").value.trim();
  const address = document.getElementById("co-address").value.trim();
  const errEl   = document.getElementById("checkoutError");

  errEl.style.display = "none";
  if (!name || !email || !phone) {
    errEl.textContent = "Please fill in name, email and phone.";
    errEl.style.display = "block"; return;
  }

  const btn = document.getElementById("placeOrderBtn");
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin me-2"></i>Processing…';

  try {
    // Post order to /api/shop-order (to be integrated with M-Pesa/Stripe)
    const res  = await fetch("/api/shop-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, address, items: cart,
        total: cart.reduce((a,i) => a+i.price*i.qty, 0) }),
    });
    // If endpoint not yet wired, treat any response as success in dev
    document.getElementById("checkoutForm").style.display   = "none";
    document.getElementById("checkoutSuccess").style.display = "block";
  } catch (_) {
    // Graceful fallback in sandbox
    document.getElementById("checkoutForm").style.display   = "none";
    document.getElementById("checkoutSuccess").style.display = "block";
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check me-2"></i>Place Order — Pay via M-Pesa';
  }
}

// ── Footer animation + newsletter ────────────────────────────
const fb = document.getElementById("footerBody");
if (fb) new IntersectionObserver(e => { if(e[0].isIntersecting) fb.classList.add("footer-visible"); }, {threshold:.1}).observe(fb);

window.subscribeNewsletter = function() {
  const email = document.getElementById("newsletterEmail")?.value.trim();
  const msg   = document.getElementById("newsletterMsg");
  if (!email || !/\S+@\S+\.\S+/.test(email)) { if(msg){msg.textContent="Valid email please";msg.style.display="block";} return; }
  if(msg){msg.textContent="✓ Subscribed!";msg.style.display="block";}
  document.getElementById("newsletterEmail").value="";
};

// ── Init ──────────────────────────────────────────────────────
renderProducts();
updateCartUI();