/* =====================================================
   DOM
===================================================== */

const planEl = document.getElementById("plan");
const expiryEl = document.getElementById("expiry");

const rewriteBtn = document.getElementById("rewriteBtn");
const summary = document.getElementById("summary");

const upgradeModal = document.getElementById("upgradeModal");
const pricingGrid = document.querySelector(".pricing-grid");

const autoFixBtn = document.getElementById("autoFixBtn");
const downloadReportBtn = document.getElementById("downloadReportBtn");

const navUser = document.getElementById("navUser");
const logoutBtn = document.getElementById("logoutBtn");

/* =========================
   RESUME FILE UPLOAD
========================= */

const resumeUpload = document.getElementById("resumeUpload");

resumeUpload?.addEventListener("change", async () => {

  const file = resumeUpload.files[0];

  if (!file) return;

  const formData = new FormData();
  formData.append("resume", file);

  try {

    showToast("Uploading resume...");

    const res = await fetch(
      "https://resumeiq-11x8.onrender.com/api/upload-resume",
      {
        method: "POST",
        body: formData
      }
    );

    if (!res.ok) {
  const text = await res.text();
  console.error("Server error:", text);
  throw new Error("Upload failed");
}

const data = await res.json();

    if (data.text) {
      document.getElementById("resumeInput").value = data.text;
      showToast("✅ Resume uploaded successfully");
    }

  } catch (err) {

    console.error("Upload error:", err);
    showToast("❌ Upload failed");

  }

});

/* =====================================================
   STATE
===================================================== */

let PLANS = {};
let selectedPlanId = null;
window.serverMe = null;

/* =====================================================
   PAYWALL
===================================================== */

function getAuthHeaders() {
  const token = localStorage.getItem("token");

  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token
  };
}

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
  const res = await fetch("https://resumeiq-11x8.onrender.com/plans");
  PLANS = await res.json();

  pricingGrid.innerHTML = "";

  Object.entries(PLANS).forEach(([id, plan]) => {
    const card = document.createElement("div");
    card.className = "pricing-card";
    card.dataset.planId = id;

    card.innerHTML = `
      <h4>${plan.label}</h4>
      <div class="price">₹${plan.price}</div>
      <p class="muted">
  ${plan.days} ${plan.days === 1 ? "day" : "days"} access
</p>
      <button class="choose-btn">Choose Plan</button>
    `;

    // 👇 ONLY select when clicking card (not checkout)
    card.addEventListener("click", (e) => {
      if (e.target.classList.contains("choose-btn")) return;
      selectPlan(id);
    });

    // 👇 ONLY checkout when clicking button
    const button = card.querySelector(".choose-btn");
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      selectPlan(id);
      startCheckout();
    });

    pricingGrid.appendChild(card);
  });

  // Default select first plan
  const firstPlanId = Object.keys(PLANS)[0];
  if (firstPlanId) {
    selectPlan(firstPlanId);
  }
}

function selectPlan(planId) {
  document
    .querySelectorAll(".pricing-card")
    .forEach(c => c.classList.remove("selected"));

  const card = document.querySelector(
    `.pricing-card[data-plan-id="${planId}"]`
  );

  if (card) {
    card.classList.add("selected");
    selectedPlanId = planId;
  }
}

/* =====================================================
   PAYWALL CHECK
===================================================== */
async function checkPaywall() {
  const token = localStorage.getItem("token");

  // 🚫 Not logged in
  if (!token) {
  window.serverMe = null;

  if (navUser) navUser.classList.add("hidden");
  if (logoutBtn) logoutBtn.classList.add("hidden");

  lockApp();
  updatePlanUI(null);
  return;
}

  try {
    const res = await fetch(
      "https://resumeiq-11x8.onrender.com/me",
      {
        headers: {
          "Authorization": "Bearer " + token
        }
      }
    );

    // 🔐 Token invalid or expired
    if (res.status === 401 || res.status === 403) {
  localStorage.removeItem("token");
  window.serverMe = null;

  if (navUser) navUser.classList.add("hidden");
  if (logoutBtn) logoutBtn.classList.add("hidden");

  lockApp();
  updatePlanUI(null);
  return;
}

    const me = await res.json();
    window.serverMe = me;

// ✅ Show user in navbar
// ✅ Show user in navbar ONLY if email exists
if (navUser && me && me.email) {
  navUser.innerText = me.email;
  navUser.classList.remove("hidden");
}

if (logoutBtn && me && me.email) {
  logoutBtn.classList.remove("hidden");
}

    if (me.active) {
      unlockApp();
    } else {
      lockApp();
    }

    setTimeout(() => {
      updatePlanUI(me);
    }, 100);

  } catch (err) {
    console.error("Paywall check failed:", err);
    lockApp();
    updatePlanUI(null);
  }
}
/* =====================================================
   UI
===================================================== */

function updatePlanUI(me) {

  const planEl = document.getElementById("plan");
  const expiryEl = document.getElementById("expiry");

  if (!planEl || !expiryEl) return;

  // Reset all cards first
  document.querySelectorAll(".pricing-card").forEach(card => {
    card.classList.remove("active-plan", "disabled-plan");

    const btn = card.querySelector(".choose-btn");
    btn.disabled = false;
    btn.innerText = "Choose Plan";

    const badge = card.querySelector(".active-badge");
    if (badge) badge.remove();
  });

  // 🚫 NO ACTIVE PLAN
  if (!me || !me.active) {
    planEl.innerText = "Locked";
    expiryEl.innerText = "—";
    updateCountdown(0, 1);
    return;   // 🔥 STOP HERE
  }

  // ✅ ACTIVE PLAN EXISTS
  const expiresAt = new Date(me.plan.expiresAt);
  const now = new Date();

  const totalMs = expiresAt - now;
  const totalDays = Math.ceil(totalMs / (1000 * 60 * 60 * 24));

  planEl.innerText = me.plan.name;
  expiryEl.innerText = expiresAt.toLocaleDateString();

  document.querySelectorAll(".pricing-card").forEach(card => {
    const btn = card.querySelector(".choose-btn");

    if (card.dataset.planId === me.plan.id) {

      card.classList.add("active-plan");

      const badge = document.createElement("div");
      badge.className = "active-badge";
      badge.innerText = "ACTIVE";
      card.appendChild(badge);

      btn.innerText = "Current Plan";
      btn.disabled = true;

    } else {

      card.classList.add("disabled-plan");
      btn.innerText = "Unavailable";
      btn.disabled = true;
    }
  });

  updateCountdown(totalDays, getPlanDuration(me.plan.id));
  startAutoExpireTimer(expiresAt);
}

function getPlanDuration(planId) {
  if (!PLANS[planId]) return 1;
  return PLANS[planId].days;
}

function updateCountdown(daysLeft, totalDays) {
  const circle = document.getElementById("progressCircle");
  const number = document.getElementById("daysLeftNumber");

  if (!circle || !number) return;

  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  circle.style.strokeDasharray = circumference;

  const percent = totalDays > 0 ? daysLeft / totalDays : 0;
  const offset = circumference - percent * circumference;

  circle.style.strokeDashoffset = offset;

  number.innerText = daysLeft > 0 ? daysLeft : 0;
}

function startAutoExpireTimer(expiresAt) {
  const interval = setInterval(async () => {
    const now = new Date();

    if (now >= expiresAt) {
      clearInterval(interval);

      showToast("⚠️ Plan Expired");

      await checkPaywall(); // auto lock UI
      showUpgradeModal();
    }
  }, 60000); // checks every 1 minute
}

/* =====================================================
   CHECKOUT
===================================================== */

async function startCheckout() {
if (window.serverMe?.active) {
  showToast("You already have an active plan");
  return;
}
  console.log("START CHECKOUT CALLED");
  console.log("Selected Plan:", selectedPlanId);

const token = localStorage.getItem("token");
if (!token) {
  showLoginModal();
  return;
}

  if (!selectedPlanId) {
    alert("No plan selected");
    return;
  }

  const res = await fetch("https://resumeiq-11x8.onrender.com/create-order", {
    method: "POST",
    headers: getAuthHeaders(),
body: JSON.stringify({ planId: selectedPlanId })
  });

  if (!res.ok) {
  const error = await res.json();
  showToast(error.message || "Unable to create order");
  return;
}

const order = await res.json();
console.log("Order response:", order);

  const rzp = new Razorpay({
    key: order.key,
    amount: order.amount,
    currency: order.currency,
    order_id: order.orderId,

handler: async (response) => {
  await fetch("https://resumeiq-11x8.onrender.com/verify-payment", {
    method: "POST",
    headers: getAuthHeaders(),
body: JSON.stringify({ ...response, planId: selectedPlanId })
  });

  showToast("🎉 Plan Activated Successfully!");

  await checkPaywall();

  // Auto close modal
  closeUpgradeModal();

  // Scroll to dashboard
  document.getElementById("analysisResults")
    ?.scrollIntoView({ behavior: "smooth" });
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

/* =========================
   RESUME ANALYZER
========================= */

document.getElementById("analyzeBtn")?.addEventListener("click", async (e) => {
  const btn = e.target;

  const token = localStorage.getItem("token");
if (!token) {
  alert("Please login first");
  return;
}

  btn.innerText = "Analyzing...";
  btn.disabled = true;

  const resume = document.getElementById("resumeInput").value;
  const jd = document.getElementById("jobInput").value;

 if (!resume || !jd) {
  alert("Resume and Job Description required");
  btn.innerText = "🎯 Analyze Resume";
  btn.disabled = false;
  return;
}

  const res = await fetch("https://resumeiq-11x8.onrender.com/analyze-resume", {
    method: "POST",
    headers: getAuthHeaders(),
body: JSON.stringify({
  resume,
  jobDescription: jd
})
  });

  if (!res.ok) {
  const error = await res.json();
  console.log(error);

  if (error.reason === "NO_SUBSCRIPTION") {
    alert("No active subscription found");
  } else if (error.reason === "EXPIRED") {
    alert("Subscription expired");
  } else {
    alert("Access denied");
  }

  btn.innerText = "Analyze Resume";
  btn.disabled = false;
  return;
}

  const data = await res.json();
btn.innerText = "Analyze Resume";
btn.disabled = false;
  renderAnalysis(data);
});

function renderAnalysis(data) {
  const score = data.atsScore;

let status = "Needs Improvement";
let statusColor = "#ef4444";

if (score > 60) {
  status = "Strong";
  statusColor = "#f59e0b";
}

if (score > 80) {
  status = "Excellent";
  statusColor = "#10b981";
}

document.getElementById("scoreStatus").innerText = status;
document.getElementById("scoreStatus").style.color = statusColor;

document.getElementById("atsScore").innerText = score + "%";
animateScore(score);

const totalKeywords = 
  (data.matchedKeywords?.length || 0) + 
  (data.missingKeywords?.length || 0);

const matchPercent = totalKeywords
  ? Math.floor((data.matchedKeywords.length / totalKeywords) * 100)
  : 0;

document.getElementById("keywordMatchBar").style.width = matchPercent + "%";

const circle = document.querySelector(".score-circle");

let color = "#ef4444"; // red
if (score > 60) color = "#f59e0b"; // yellow
if (score > 80) color = "#10b981"; // green

circle.style.background = `conic-gradient(${color} ${score}%, #e5e7eb ${score}%)`;
  document.getElementById("keywordMatch").innerText = matchPercent + "%";

  const missingList = document.getElementById("missingKeywords");
  missingList.innerHTML = "";
  data.missingKeywords.forEach(k => {
    const li = document.createElement("li");
    li.innerText = k;
    missingList.appendChild(li);
  });

  const improveList = document.getElementById("improvements");
  improveList.innerHTML = "";
  data.improvements.forEach(i => {
    const li = document.createElement("li");
    li.innerText = i;
    improveList.appendChild(li);
  });

  const bulletList = document.getElementById("optimizedBullets");
  bulletList.innerHTML = "";
  data.optimizedBullets.forEach(b => {
    const li = document.createElement("li");
    li.innerText = b;
    bulletList.appendChild(li);
  });

/* =========================
   KEYWORD HEATMAP
========================= */

const heatmapBox = document.getElementById("heatmapResult");
heatmapBox.classList.remove("hidden");

if (heatmapBox) {
  heatmapBox.innerHTML = `
    <h4>Keyword Heatmap</h4>

    <p><strong>Matched Keywords:</strong></p>
    ${data.matchedKeywords && data.matchedKeywords.length
      ? data.matchedKeywords
          .map(k => `<span class="keyword-match">${k}</span>`)
          .join(" ")
      : "<span class='muted'>None detected</span>"}

    <p style="margin-top:10px;"><strong>Missing Keywords:</strong></p>
    ${data.missingKeywords && data.missingKeywords.length
      ? data.missingKeywords
          .map(k => `<span class="keyword-missing">${k}</span>`)
          .join(" ")
      : "<span class='muted'>None 🎉</span>"}
  `;
}


/* =========================
   SIDE BY SIDE VISUAL
========================= */

const resumeText = document.getElementById("resumeInput").value;
const jdText = document.getElementById("jobInput").value;

let highlightedResume = resumeText;
let highlightedJD = jdText;

// Highlight matched keywords
if (data.matchedKeywords) {
  data.matchedKeywords.forEach(keyword => {
    const regex = new RegExp(`(${keyword})`, "gi");
    highlightedResume = highlightedResume.replace(
      regex,
      `<span class="highlight-match">$1</span>`
    );
  });
}

// Highlight missing keywords in JD
if (data.missingKeywords) {
  data.missingKeywords.forEach(keyword => {
    const regex = new RegExp(`(${keyword})`, "gi");
    highlightedJD = highlightedJD.replace(
      regex,
      `<span class="highlight-missing">$1</span>`
    );
  });
}

document.getElementById("resumePreview").innerHTML = highlightedResume;
document.getElementById("jdPreview").innerHTML = highlightedJD;

document.getElementById("comparisonSection").classList.remove("hidden");

  document.getElementById("analysisResults").classList.remove("hidden");
}

/* =====================================================
   AUTO FIX
===================================================== */

autoFixBtn.addEventListener("click", async () => {
  const token = localStorage.getItem("token");
if (!token) {
  alert("Please login first");
  return;
}

  if (!window.serverMe?.active) {
    showUpgradeModal();
    return;
  }

  const resumeText = document.getElementById("resumeInput").value;
  const jobDescription = document.getElementById("jobInput").value;

  if (!resumeText || !jobDescription) {
    alert("Please paste resume and job description");
    return;
  }

  autoFixBtn.innerText = "Optimizing...";
  autoFixBtn.disabled = true;

  try {
    const resume = document.getElementById("resumeInput").value;
const jd = document.getElementById("jobInput").value;

const res = await fetch("https://resumeiq-11x8.onrender.com/auto-fix", {
  method: "POST",
  headers: getAuthHeaders(),
  body: JSON.stringify({
    resume,
    jobDescription: jd
  })
});

    const data = await res.json();

    if (data.improvedResume) {
      document.getElementById("resumeInput").value = data.improvedResume;
document.getElementById("fixedPreview").innerText = data.improvedResume;
  document.getElementById("fixSection").classList.remove("hidden");
    }

  } catch (err) {
    alert("Auto fix failed");
  }

  autoFixBtn.innerText = "✨ Auto Fix Resume (Pro)";
  autoFixBtn.disabled = false;
});

/* =========================
   DOWNLOAD PDF REPORT
========================= */

downloadReportBtn.addEventListener("click", async () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const email = window.serverMe?.email || "Guest User";
  const today = new Date().toLocaleDateString();

  const score = document.getElementById("atsScore").innerText;
  const keywordMatch = document.getElementById("keywordMatch").innerText;

  const resumeText = document.getElementById("resumeInput").value;
  const jdText = document.getElementById("jobInput").value;

  let y = 20;

  /* =========================
     COMPANY LOGO (Text Based)
  ========================= */

  doc.setFontSize(22);
  doc.setTextColor(16, 185, 129);
  doc.text("ResumeIQ", 105, y, { align: "center" });

  y += 10;

  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text("AI Powered ATS Optimization Report", 105, y, { align: "center" });

  y += 15;

  /* =========================
     CANDIDATE INFO
  ========================= */

  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(`Candidate Email: ${email}`, 15, y);
  y += 7;
  doc.text(`Report Date: ${today}`, 15, y);
  y += 10;

  /* =========================
     SCORE SECTION
  ========================= */

doc.setFillColor(240, 249, 255);
doc.roundedRect(15, y - 5, 180, 25, 5, 5, "F");

  doc.setFontSize(14);
  doc.text("ATS Summary", 15, y);
  y += 8;

  doc.setFontSize(12);
  doc.text(`ATS Score: ${score}`, 15, y);
  y += 7;
  doc.text(`Keyword Match: ${keywordMatch}`, 15, y);
  y += 15;

  /* =========================
     RESUME SNAPSHOT
  ========================= */

  doc.setFontSize(14);
  doc.text("Resume Snapshot", 15, y);
  y += 8;

  const splitResume = doc.splitTextToSize(resumeText, 180);
  doc.setFontSize(10);
  doc.text(splitResume, 15, y);
  y += splitResume.length * 5 + 10;

  /* =========================
     JD SNAPSHOT
  ========================= */

  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(14);
  doc.text("Job Description Snapshot", 15, y);
  y += 8;

  const splitJD = doc.splitTextToSize(jdText, 180);
  doc.setFontSize(10);
  doc.text(splitJD, 15, y);
  y += splitJD.length * 5 + 10;

  /* =========================
     WATERMARK (FREE USERS)
  ========================= */

  if (!window.serverMe?.active) {
    doc.setTextColor(200);
    doc.setFontSize(40);
    doc.text("ResumeIQ FREE", 105, 160, {
      align: "center",
      angle: 45
    });
  }

  /* =========================
     BRANDED FOOTER
  ========================= */

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    "Generated by ResumeIQ • AI Resume Optimization Platform",
    105,
    285,
    { align: "center" }
  );

  doc.save("ResumeIQ-ATS-Report.pdf");
});

/* =====================================================
   INIT
===================================================== */

window.onload = async () => {
  await loadPlans();
  await checkPaywall();
};

const darkToggle = document.getElementById("darkToggle");

darkToggle?.addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
});

// ===============================
// SCROLL ANIMATIONS
// ===============================

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll(".box, .comparison-section").forEach(el => {
  el.classList.add("fade-up");
  observer.observe(el);
});

function animateScore(targetScore) {
  const circle = document.querySelector(".score-circle");
  let current = 0;

  const interval = setInterval(() => {
    if (current >= targetScore) {
      clearInterval(interval);
    } else {
      current++;
      circle.style.setProperty("--score", current + "%");
      document.getElementById("atsScore").innerText = current + "%";
    }
  }, 15);
}

// ===============================
// LIVE ATS PREVIEW
// ===============================

const resumeInput = document.getElementById("resumeInput");
const jobInput = document.getElementById("jobInput");

function calculateLiveScore() {
  const resumeText = resumeInput.value.toLowerCase();
  const jobText = jobInput.value.toLowerCase();

  if (!resumeText || !jobText) return;

  const jobWords = jobText.split(/\W+/);
  let matchCount = 0;

  jobWords.forEach(word => {
    if (resumeText.includes(word) && word.length > 3) {
      matchCount++;
    }
  });

  const score = Math.min(
    100,
    Math.floor((matchCount / jobWords.length) * 100)
  );

  animateScore(score);
}

resumeInput.addEventListener("input", calculateLiveScore);
jobInput.addEventListener("input", calculateLiveScore);

const loginModal = document.getElementById("loginModal");

function showLoginModal() {
  loginModal.classList.remove("hidden");
}

function closeLoginModal() {
  loginModal.classList.add("hidden");
}


async function submitLogin() {
  const emailInput = document.getElementById("loginEmail");
  const btn = document.getElementById("loginBtn");
  const btnText = document.getElementById("loginBtnText");

  const email = emailInput.value.trim();

  if (!email) {
    alert("Please enter your email");
    return;
  }

  // 🔹 Start loader
  btn.classList.add("loading");
  btnText.innerText = "Signing in...";

  try {
    const res = await fetch("https://resumeiq-11x8.onrender.com/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    // 🔥 CRITICAL FIX
    if (!data.token) {
      throw new Error("Login failed");
    }

    // Save token
    localStorage.setItem("token", data.token);

    // Fetch user info
    await checkPaywall();

    closeLoginModal();

  } catch (err) {
    alert("Login failed. Try again.");
    console.error(err);
  } finally {
    // 🔹 Stop loader
    btn.classList.remove("loading");
    btnText.innerText = "Continue with Email";
  }
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerText = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 100);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("token");
  window.serverMe = null;

  navUser.classList.add("hidden");
  logoutBtn.classList.add("hidden");

  lockApp();
  updatePlanUI(null);

  showToast("Logged out successfully");
});

/* =========================
   SAVE RESUME
========================= */

function saveResume() {

  const data = {
    name: document.getElementById("name").value,
    role: document.getElementById("role").value,
    summary: document.getElementById("summary").value,
    experience: document.getElementById("experience").value,
    skills: document.getElementById("skills").value,
    jd: document.getElementById("jd").value
  };

  localStorage.setItem("resumeDraft", JSON.stringify(data));

  showToast("Resume saved locally 💾");
}

/* Auto load saved resume */

window.addEventListener("DOMContentLoaded", () => {

  const saved = localStorage.getItem("resumeDraft");

  if (!saved) return;

  const data = JSON.parse(saved);

  document.getElementById("name").value = data.name || "";
  document.getElementById("role").value = data.role || "";
  document.getElementById("summary").value = data.summary || "";
  document.getElementById("experience").value = data.experience || "";
  document.getElementById("skills").value = data.skills || "";
  document.getElementById("jd").value = data.jd || "";
});

/* =========================
   REWRITE SUMMARY AI
========================= */

rewriteBtn.addEventListener("click", async () => {

  const token = localStorage.getItem("token");

  if (!token) {
    showLoginModal();
    return;
  }

  if (!window.serverMe?.active) {
    showUpgradeModal();
    return;
  }

  const currentSummary = summary.value;

  if (!currentSummary) {
    alert("Please write a summary first");
    return;
  }

  rewriteBtn.innerText = "Rewriting...";
  rewriteBtn.disabled = true;

  try {

    const res = await fetch(
      "https://resumeiq-11x8.onrender.com/use-ai",
      {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          type: "rewrite_summary",
          text: currentSummary
        })
      }
    );

    const data = await res.json();

    if (data.result) {
      summary.value = data.result;
      showToast("✨ Summary improved");
    }

  } catch (err) {

    alert("AI rewrite failed");

  }

  rewriteBtn.innerText = "✨ Rewrite Summary (AI)";
  rewriteBtn.disabled = false;
});