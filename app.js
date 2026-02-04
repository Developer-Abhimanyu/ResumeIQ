/* =====================================================
   DOM REFERENCES
   ===================================================== */

const form = document.getElementById("resumeForm");
const output = document.getElementById("output");

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
window.atsScore = 0;
window.jdMatchPercent = 0;
window.matchingKeywords = [];
window.missingKeywords = [];
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
    price: 2999, // effective ₹249/month
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
   UI UPDATE (PLAN + USAGE)
   ===================================================== */

function updatePlanUI() {
  if (planEl) planEl.innerText = userPlan.name;
  if (expiryEl) {
    expiryEl.innerText = userPlan.expiresAt
      ? new Date(userPlan.expiresAt).toLocaleDateString()
      : "—";
  }
  if (aiLeftEl) aiLeftEl.innerText = userPlan.aiLeft;

  updateUsageMeter();
}

function updateUsageMeter() {
  if (!usageFill) return;

  const percent = creditsPercentLeft();
  usageFill.style.width = `${percent}%`;

  const box = usageFill.parentElement.parentElement;
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
   AUTO UPGRADE MODAL
   ===================================================== */

function autoShowUpgradeModal() {
  if (isProActive()) return;
  if (creditsPercentLeft() > 20) return;

  // show once per session
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
  if (!priceDisplay) return;

  if (billingToggle.checked) {
    priceDisplay.innerText = "249 / mo";
  } else {
    priceDisplay.innerText = "299";
  }
}

/* =====================================================
   STRIPE CHECKOUT (FRONTEND READY)
   ===================================================== */

function startCheckout() {
  const isAnnual = billingToggle.checked;
  const plan = isAnnual ? PLANS.ANNUAL : PLANS.MONTHLY;

  /**
   * ⚠️ Backend expectation:
   * POST /create-checkout-session
   * body: { planId: plan.id }
   * response: { url }
   */

  fetch("http://localhost:4242/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId: plan.id })
  })
    .then(res => res.json())
    .then(data => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Unable to start checkout");
      }
    })
    .catch(() => {
      // DEV FALLBACK (local testing)
      activatePlanLocally(plan);
    });
}

/* =====================================================
   LOCAL DEV PLAN ACTIVATE (NO PAYMENT)
   ===================================================== */

function activatePlanLocally(plan) {
  userPlan = {
    name: plan.label,
    expiresAt: Date.now() + plan.days * 86400000,
    aiLeft: plan.ai,
    aiTotal: plan.ai
  };

  localStorage.setItem("userPlan", JSON.stringify(userPlan));
  updatePlanUI();
  closeUpgradeModal();
  alert("🎉 Plan activated (DEV MODE)");
}

/* =====================================================
   AI MOCK
   ===================================================== */

function aiRewriteSummary(text) {
  return `ATS-optimized professional summary:
${text}
Focused on impact, ownership, and measurable results.`;
}

/* =====================================================
   AI REWRITE HANDLER
   ===================================================== */

rewriteSummaryBtn.addEventListener("click", () => {
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
   FORM SAVE (UNCHANGED CORE)
   ===================================================== */

form.addEventListener("submit", e => {
  e.preventDefault();

  const resumeData = {
    name: name.value.trim(),
    role: role.value.trim(),
    summary: summary.value.trim(),
    experience: experience.value.trim(),
    jobDesc: jobDesc.value.trim(),
    skills: skills.value.split(",").map(s => s.trim()).filter(Boolean)
  };

  window.resumeData = resumeData;
  window.lastSavedTime = new Date().toLocaleString();

  localStorage.setItem(
    "resumeData",
    JSON.stringify({ ...resumeData, savedTime: window.lastSavedTime })
  );

  output.innerText = `
Resume Saved ✅

AI Credits Left: ${userPlan.aiLeft}
Last Saved: ${window.lastSavedTime}
`;

  updatePlanUI();
});

/* =====================================================
   LOAD
   ===================================================== */

window.onload = () => {
  const data = JSON.parse(localStorage.getItem("resumeData") || "{}");

  name.value = data.name || "";
  role.value = data.role || "";
  summary.value = data.summary || "";
  experience.value = data.experience || "";
  jobDesc.value = data.jobDesc || "";
  skills.value = (data.skills || []).join(", ");

  updatePricingUI();
  updatePlanUI();
};

billingToggle?.addEventListener("change", updatePricingUI);