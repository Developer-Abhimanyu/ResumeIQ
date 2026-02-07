/* =====================================================
   DOM
===================================================== */

const planEl = document.getElementById("plan");
const expiryEl = document.getElementById("expiry");
const aiLeftEl = document.getElementById("aiLeft");

const rewriteBtn = document.getElementById("rewriteBtn");
const summary = document.getElementById("summary");
const pdfBtn = document.getElementById("pdfBtn");

const upgradeModal = document.getElementById("upgradeModal");
const pricingGrid = document.querySelector(".pricing-grid");

/* =====================================================
   STATE
===================================================== */

let PLANS = {};
let selectedPlanId = null;
let modalDismissed = false;
window.serverMe = null;

/* =====================================================
   PAYWALL
===================================================== */

function lockApp(showModal = true) {
  rewriteBtn.disabled = true;
  rewriteBtn.innerText = "🔒 Upgrade to use AI";

  if (showModal && !modalDismissed) {
    upgradeModal.style.display = "flex";
  }
}

function unlockApp() {
  rewriteBtn.disabled = false;
  rewriteBtn.innerText = "✨ Rewrite Summary (AI)";
  upgradeModal.style.display = "none";
}

function closeUpgradeModal() {
  modalDismissed = true;
  upgradeModal.style.display = "none";
}

/* =====================================================
   LOAD PLANS
===================================================== */

async function loadPlans() {
  const res = await fetch("http://localhost:4242/plans");
  PLANS = await res.json();

  pricingGrid.innerHTML = "";

  Object.entries(PLANS).forEach(([id, plan], index) => {
    const card = document.createElement("div");
    card.className = "pricing-card";
    if (index === 2) card.classList.add("recommended");

    card.innerHTML = `
      <h4>${plan.label}</h4>
      <div class="price">₹${plan.price}</div>
      <p class="muted">${plan.days} days access</p>
      <button onclick="selectPlan('${id}')">Choose Plan</button>
    `;

    pricingGrid.appendChild(card);
  });
}

function selectPlan(planId) {
  selectedPlanId = planId;
  modalDismissed = false;
  startCheckout();
}

/* =====================================================
   PAYWALL CHECK
===================================================== */

async function checkPaywall() {
  const email = localStorage.getItem("email");
  if (!email) return lockApp();

  const res = await fetch(`http://localhost:4242/me?email=${email}`);
  const me = await res.json();
  window.serverMe = me;

  me.active ? unlockApp() : lockApp(false);
  updatePlanUI();
}

/* =====================================================
   UI
===================================================== */

function updatePlanUI() {
  if (!window.serverMe?.active) {
    planEl.innerText = "LOCKED";
    expiryEl.innerText = "—";
    aiLeftEl.innerText = "0";
    return;
  }

  planEl.innerText = window.serverMe.plan.name;
  expiryEl.innerText = new Date(
    window.serverMe.plan.expiresAt
  ).toLocaleDateString();
  aiLeftEl.innerText = "Unlimited";
}

/* =====================================================
   AI
===================================================== */

rewriteBtn.addEventListener("click", async () => {
  if (!window.serverMe?.active) return lockApp();

  const res = await fetch("http://localhost:4242/use-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: localStorage.getItem("email"),
      text: summary.value
    })
  });

  if (!res.ok) return lockApp();
  const data = await res.json();
  summary.value = data.result;
});

/* =====================================================
   CHECKOUT
===================================================== */

async function startCheckout() {
  if (!selectedPlanId) return;

  const email = localStorage.getItem("email");
  if (!email) return alert("Please login first");

  const res = await fetch("http://localhost:4242/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId: selectedPlanId, email })
  });

  const order = await res.json();

  const rzp = new Razorpay({
    key: order.key,
    amount: order.amount,
    currency: order.currency,
    order_id: order.orderId,
    handler: async function (response) {
      await fetch("http://localhost:4242/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...response,
          planId: selectedPlanId,
          email
        })
      });

      alert("✅ Payment successful");
      await checkPaywall();
    }
  });

  rzp.open();
}

/* =====================================================
   INIT
===================================================== */

window.onload = async () => {
  await loadPlans();
  await checkPaywall();
};