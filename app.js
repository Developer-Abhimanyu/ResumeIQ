/* =====================================================
   DOM REFERENCES
   ===================================================== */

const planEl = document.getElementById("plan");
const expiryEl = document.getElementById("expiry");
const aiLeftEl = document.getElementById("aiLeft");

const usageFill = document.getElementById("usageFill");
const usageLabel = document.getElementById("usageLabel");

const upgradeModal = document.getElementById("upgradeModal");
const billingToggle = document.getElementById("billingToggle");
const priceDisplay = document.getElementById("priceDisplay");

const rewriteBtn = document.getElementById("rewriteBtn");
const summary = document.getElementById("summary");

/* =====================================================
   GLOBAL STATE
   ===================================================== */

window.serverMe = null;

/* =====================================================
   PAYWALL CONTROL
   ===================================================== */

function lockApp() {
  rewriteBtn.disabled = true;
  rewriteBtn.innerText = "🔒 Upgrade to use AI";
  upgradeModal.style.display = "flex";
}

function unlockApp() {
  rewriteBtn.disabled = false;
  rewriteBtn.innerText = "✨ Rewrite Summary (AI)";
}

/* =====================================================
   SERVER PAYWALL CHECK
   ===================================================== */

async function checkPaywall() {
  const email = localStorage.getItem("email");

  if (!email) {
    lockApp();
    return;
  }

  try {
    const res = await fetch(
      `http://localhost:4242/me?email=${email}`
    );

    const me = await res.json();
    window.serverMe = me;

    if (!me.active) {
      lockApp();
    } else {
      unlockApp();
    }

    updatePlanUI();
  } catch (err) {
    console.error("Paywall check failed", err);
    lockApp();
  }
}

/* =====================================================
   UI UPDATE
   ===================================================== */

function updatePlanUI() {
  if (window.serverMe?.active) {
    planEl.innerText = window.serverMe.plan.name;
    expiryEl.innerText = new Date(
      window.serverMe.plan.expiresAt
    ).toLocaleDateString();
    aiLeftEl.innerText = window.serverMe.aiCredits;
  } else {
    planEl.innerText = "LOCKED";
    expiryEl.innerText = "—";
    aiLeftEl.innerText = "0";
  }

  updateUsageMeter();
}

function updateUsageMeter() {
  if (!window.serverMe?.active) {
    usageFill.style.width = "0%";
    usageLabel.innerText = "Upgrade to unlock AI";
    return;
  }

  const percent = Math.round(
    (window.serverMe.aiCredits / window.serverMe.aiTotal) * 100
  );

  usageFill.style.width = `${percent}%`;
  usageLabel.innerText = "Credits remaining";
}

/* =====================================================
   BILLING UI
   ===================================================== */

function updatePricingUI() {
  priceDisplay.innerText = billingToggle.checked ? "249 / mo" : "299";
}

billingToggle.addEventListener("change", updatePricingUI);

/* =====================================================
   AI CALL — SERVER ENFORCED (STEP 5)
   ===================================================== */

rewriteBtn.addEventListener("click", async () => {
  if (!window.serverMe?.active) {
    lockApp();
    return;
  }

  try {
    const res = await fetch("http://localhost:4242/use-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: localStorage.getItem("email"),
        text: summary.value
      })
    });

    const data = await res.json();

    if (!res.ok) {
      lockApp();
      return;
    }

    summary.value = data.result;
    window.serverMe.aiCredits = data.creditsLeft;
    updatePlanUI();
  } catch (err) {
    console.error("AI call failed", err);
  }
});

/* =====================================================
   LOAD
   ===================================================== */

window.onload = async () => {
  updatePricingUI();
  await checkPaywall();
};