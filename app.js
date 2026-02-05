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

/* =====================================================
   GLOBAL STATE
   ===================================================== */

window.resumeData = null;
window.lastSavedTime = null;

/* =====================================================
   PLANS (SOURCE OF TRUTH)
   ===================================================== */

const PLANS = {
  MONTHLY: {
    id: "pro_monthly",
    label: "Pro Monthly",
    price: 299,
    days: 30,
    ai: 50
  },
  ANNUAL: {
    id: "pro_annual",
    label: "Pro Annual",
    price: 2999,
    days: 365,
    ai: 999
  }
};

/* =====================================================
   USER PLAN
   ===================================================== */

let userPlan = JSON.parse(localStorage.getItem("userPlan")) || {
  name: "FREE",
  expiresAt: null,
  aiLeft: 2,
  aiTotal: 2
};

/* =====================================================
   PLAN HELPERS
   ===================================================== */

function isProActive() {
  return userPlan.name !== "FREE" && userPlan.expiresAt > Date.now();
}

function creditsPercentLeft() {
  if (!userPlan.aiTotal) return 0;
  return Math.round((userPlan.aiLeft / userPlan.aiTotal) * 100);
}

/* =====================================================
   UI UPDATE
   ===================================================== */

function updatePlanUI() {
  planEl.innerText = userPlan.name;
  expiryEl.innerText = userPlan.expiresAt
    ? new Date(userPlan.expiresAt).toLocaleDateString()
    : "—";
  aiLeftEl.innerText = userPlan.aiLeft;

  updateUsageMeter();
}

function updateUsageMeter() {
  const percent = creditsPercentLeft();
  usageFill.style.width = `${percent}%`;

  const box = usageFill.closest(".usage-box");
  box.classList.remove("usage-warning", "usage-critical");

  if (percent <= 20) {
    box.classList.add("usage-critical");
    usageLabel.innerText = "Critically low credits";
    autoShowUpgradeModal();
  } else if (percent <= 40) {
    box.classList.add("usage-warning");
    usageLabel.innerText = "Running low on credits";
  } else {
    usageLabel.innerText = "Credits remaining";
  }
}

/* =====================================================
   UPGRADE MODAL
   ===================================================== */

function autoShowUpgradeModal() {
  if (isProActive()) return;
  if (sessionStorage.getItem("upgradeModalShown")) return;

  upgradeModal.style.display = "flex";
  sessionStorage.setItem("upgradeModalShown", "true");
}

function closeUpgradeModal() {
  upgradeModal.style.display = "none";
}

/* =====================================================
   BILLING TOGGLE
   ===================================================== */

function updatePricingUI() {
  priceDisplay.innerText = billingToggle.checked ? "249 / mo" : "299";
}

billingToggle.addEventListener("change", updatePricingUI);

/* =====================================================
   RAZORPAY CHECKOUT
   ===================================================== */

async function startCheckout() {
  const plan = billingToggle.checked ? PLANS.ANNUAL : PLANS.MONTHLY;

  try {
    const res = await fetch("http://localhost:4242/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: plan.id })
    });

    const data = await res.json();

    const options = {
      key: data.key,
      amount: data.amount,
      currency: data.currency,
      name: "ResumeIQ",
      description: plan.label,
      order_id: data.orderId,
      handler: async function (response) {
        const verifyRes = await fetch("http://localhost:4242/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...response,
            planId: plan.id
          })
        });

        const verifyData = await verifyRes.json();

        if (verifyData.success) {
          activatePlan(plan);
          alert("🎉 Payment successful! Plan activated.");
        } else {
          alert("Payment verification failed");
        }
      },
      theme: { color: "#4f46e5" }
    };

    const rzp = new Razorpay(options);
    rzp.open();
  } catch (err) {
    console.error(err);
    alert("Unable to start payment");
  }
}

/* =====================================================
   PLAN ACTIVATION
   ===================================================== */

function activatePlan(plan) {
  userPlan = {
    name: plan.label,
    expiresAt: Date.now() + plan.days * 86400000,
    aiLeft: plan.ai,
    aiTotal: plan.ai
  };

  localStorage.setItem("userPlan", JSON.stringify(userPlan));
  updatePlanUI();
  closeUpgradeModal();
}

/* =====================================================
   AI MOCK
   ===================================================== */

function aiRewriteSummary(text) {
  return `ATS-optimized professional summary:\n${text}`;
}

rewriteBtn.addEventListener("click", () => {
  if (!isProActive() && userPlan.aiLeft <= 0) {
    autoShowUpgradeModal();
    return;
  }

  summary.value = aiRewriteSummary(summary.value);
  userPlan.aiLeft--;

  localStorage.setItem("userPlan", JSON.stringify(userPlan));
  updatePlanUI();
});

/* =====================================================
   LOAD
   ===================================================== */

window.onload = () => {
  updatePricingUI();
  updatePlanUI();
};