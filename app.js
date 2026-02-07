/* =====================================================
   DOM
===================================================== */

const planEl = document.getElementById("plan");
const expiryEl = document.getElementById("expiry");
const aiLeftEl = document.getElementById("aiLeft");

const rewriteBtn = document.getElementById("rewriteBtn");
const summary = document.getElementById("summary");

const upgradeModal = document.getElementById("upgradeModal");
const pricingGrid = document.querySelector(".pricing-grid");

/* =====================================================
   STATE
===================================================== */

let PLANS = {};
let selectedPlanId = null;
window.serverMe = null;

/* =====================================================
   PAYWALL
===================================================== */

function showUpgradeModal() {
  upgradeModal.classList.remove("hidden");
}

function closeUpgradeModal() {
  upgradeModal.classList.add("hidden");
}

function lockApp(showModal = false) {
  rewriteBtn.innerText = "🔒 Upgrade to use AI";
  if (showModal) showUpgradeModal();
}

function unlockApp() {
  rewriteBtn.innerText = "✨ Rewrite Summary (AI)";
  closeUpgradeModal();
}

/* =====================================================
   LOAD PLANS
===================================================== */

async function loadPlans() {
  const res = await fetch("http://localhost:4242/plans");
  PLANS = await res.json();

  pricingGrid.innerHTML = "";

  let isFirst = true;

  Object.entries(PLANS).forEach(([id, plan]) => {
    const card = document.createElement("div");
    card.className = "pricing-card";
    card.dataset.planId = id;
    card.innerHTML = `
      <h4>${plan.label}</h4>
      <div class="price">₹${plan.price}</div>
      <p class="muted">${plan.days} days access</p>
      <button>Choose Plan</button>
    `;

   card.onclick = () => {
  selectPlan(id);
};

    pricingGrid.appendChild(card);
  });
const firstPlanId = Object.keys(PLANS)[0];
if (firstPlanId) {
  selectPlan(firstPlanId);
}
}

function selectPlan(planId) {
  selectedPlanId = planId;

  document.querySelectorAll(".pricing-card").forEach(card => {
    card.classList.toggle(
      "selected",
      card.dataset.planId === planId
    );
  });
}

/* =====================================================
   PAYWALL CHECK
===================================================== */

async function checkPaywall() {
  const email = localStorage.getItem("email");
  if (!email) {
    lockApp();
    updatePlanUI(null);
    return;
  }

  const res = await fetch(`http://localhost:4242/me?email=${email}`);
  const me = await res.json();
  window.serverMe = me;

  if (me.active) unlockApp();
  else lockApp();

  updatePlanUI(me);
}

/* =====================================================
   UI
===================================================== */

function updatePlanUI(me) {
  if (!me?.active) {
    planEl.innerText = "LOCKED";
    expiryEl.innerText = "—";
    aiLeftEl.innerText = "0";
    return;
  }

  planEl.innerText = me.plan.name;
  expiryEl.innerText = new Date(me.plan.expiresAt).toLocaleDateString();
  aiLeftEl.innerText = "Unlimited";
}

/* =====================================================
   AI BUTTON
===================================================== */

rewriteBtn.addEventListener("click", async () => {
  if (!window.serverMe?.active) {
    showUpgradeModal();
    return;
  }

  const res = await fetch("http://localhost:4242/use-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: localStorage.getItem("email"),
      text: summary.value
    })
  });

  const data = await res.json();
  summary.value = data.result;
});

/* =====================================================
   CHECKOUT
===================================================== */

async function startCheckout() {
  const email = localStorage.getItem("email");
  if (!email || !selectedPlanId) return;

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
    handler: async (response) => {
      await fetch("http://localhost:4242/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...response, planId: selectedPlanId, email })
      });

      alert("✅ Payment successful");
      await checkPaywall();
    }
  });

  rzp.open();
}

/* =====================================================
   SCROLL
===================================================== */

function scrollToPlans() {
  closeUpgradeModal();
  pricingGrid.scrollIntoView({ behavior: "smooth" });
}

/* =====================================================
   INIT
===================================================== */

window.onload = async () => {
  await loadPlans();
  await checkPaywall();
};