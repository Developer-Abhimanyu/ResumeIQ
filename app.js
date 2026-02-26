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

const autoFixBtn = document.getElementById("autoFixBtn");
const downloadReportBtn = document.getElementById("downloadReportBtn");

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
  console.log("START CHECKOUT CALLED");
  console.log("Selected Plan:", selectedPlanId);

  const email = localStorage.getItem("email");
  console.log("Email:", email);

  if (!email) {
    alert("No email found in localStorage");
    return;
  }

  if (!selectedPlanId) {
    alert("No plan selected");
    return;
  }

  const res = await fetch("http://localhost:4242/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId: selectedPlanId, email })
  });

  const order = await res.json();
  console.log("Order response:", order);

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

/* =========================
   RESUME ANALYZER
========================= */

document.getElementById("analyzeBtn").addEventListener("click", async (e) => {
  const btn = e.target;

  const email = localStorage.getItem("email");
  if (!email) {
    alert("Please login first");
    return;
  }

  btn.innerText = "Analyzing...";
  btn.disabled = true;

  const resume = document.getElementById("resumeInput").value;
  const jd = document.getElementById("jobInput").value;

  if (!resume || !jd) {
    alert("Resume and Job Description required");
    return;
  }

  const res = await fetch("http://localhost:4242/analyze-resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      resume,
      jobDescription: jd
    })
  });

  if (!res.ok) {
    alert("Subscription required");
    return;
  }

  const data = await res.json();
btn.innerText = "Analyze Resume";
btn.disabled = false;
  renderAnalysis(data);
});

function renderAnalysis(data) {
  const score = data.atsScore;

document.getElementById("atsScore").innerText = score + "%";
animateScore(atsScore);

const circle = document.querySelector(".score-circle");

let color = "#ef4444"; // red
if (score > 60) color = "#f59e0b"; // yellow
if (score > 80) color = "#10b981"; // green

circle.style.background = `conic-gradient(${color} ${score}%, #e5e7eb ${score}%)`;
  document.getElementById("keywordMatch").innerText = data.keywordMatch + "%";

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

const heatmapBox = document.getElementById("heatmapResult").classList.remove("hidden");

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
  const email = localStorage.getItem("email");

  if (!email) {
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
    const res = await fetch("http://localhost:4242/auto-fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        resumeText,
        jobDescription
      })
    });

    const data = await res.json();

    if (data.improvedResume) {
      document.getElementById("resumeInput").value = data.improvedResume;
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

  const email = localStorage.getItem("email") || "candidate@email.com";
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

  const splitResume = doc.splitTextToSize(resumeInput, 180);
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

  const splitJD = doc.splitTextToSize(jobInput, 180);
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