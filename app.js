const form = document.getElementById("resumeForm");
const output = document.getElementById("output");

/* ------------------ GLOBAL STATE ------------------ */
window.resumeData = null;
window.atsScore = 0;
window.jdMatchPercent = 0;
window.matchingKeywords = [];
window.missingKeywords = [];
window.lastSavedTime = null;

/* ------------------ PLANS ------------------ */
const PLANS = {
  ONE_TIME: { label: "One Time", price: 49, days: 1, ai: 3 },
  WEEK: { label: "1 Week", price: 99, days: 7, ai: 10 },
  FIFTEEN: { label: "15 Days", price: 149, days: 15, ai: 25 },
  MONTH: { label: "1 Month", price: 299, days: 30, ai: 50 },
  THREE_MONTH: { label: "3 Months", price: 699, days: 90, ai: 120 },
  SIX_MONTH: { label: "6 Months", price: 999, days: 180, ai: 250 },
  YEAR: { label: "1 Year", price: 1699, days: 365, ai: 999 }
};

/* ------------------ USER PLAN ------------------ */
let userPlan = JSON.parse(localStorage.getItem("userPlan")) || {
  name: "FREE",
  expiresAt: null,
  aiLeft: 2
};

/* ------------------ PLAN HELPERS ------------------ */
function isProActive() {
  return userPlan.name !== "FREE" && userPlan.expiresAt > Date.now();
}

function updatePlanUI() {
  const status = document.getElementById("planStatus");
  const expiry = document.getElementById("planExpiry");
  const aiLeftUI = document.getElementById("aiLeft");
  const upgradeBtn = document.getElementById("upgradeBtn");

  if (!status || !expiry) return;

  if (isProActive()) {
    status.innerText = `Plan: ${userPlan.name} 💎`;
    expiry.innerText =
      "Valid till: " + new Date(userPlan.expiresAt).toLocaleString();
    if (upgradeBtn) upgradeBtn.style.display = "none";
  } else {
    status.innerText = "Plan: FREE";
    expiry.innerText = "No expiry";
    if (upgradeBtn) upgradeBtn.style.display = "inline-block";
  }

  if (aiLeftUI) {
    aiLeftUI.innerText = userPlan.aiLeft;
  }
}

/* ------------------ COMPLETENESS ------------------ */
function calculateCompleteness(data) {
  let filled = 0;
  let total = 5;
  if (data.name) filled++;
  if (data.role) filled++;
  if (data.summary) filled++;
  if (data.experience) filled++;
  if (data.skills.length) filled++;
  return Math.round((filled / total) * 100);
}

/* ------------------ ATS SCORE ------------------ */
function calculateATSScore(data) {
  let score = 0;
  let reasons = [];

  if (data.name && data.role) score += 10;
  else reasons.push("Missing name or target role");

  if (data.summary.length > 40) score += 15;
  else reasons.push("Summary too short");

  if (data.experience.length > 100) score += 25;
  else reasons.push("Experience needs more detail");

  if (data.skills.length >= 5) score += 20;
  else reasons.push("Add at least 5 skills");

  const wc = (
    data.summary +
    data.experience +
    data.skills.join(" ")
  ).split(/\s+/).length;

  if (wc >= 150 && wc <= 600) score += 30;
  else reasons.push("Resume length not ATS optimized");

  return { score, reasons };
}

/* ------------------ JD MATCH ------------------ */
function calculateJDMatch(resumeData, jobDesc) {
  if (!jobDesc || jobDesc.length < 30)
    return { matchPercent: 0, matched: [], missing: [] };

  const resumeText = (
    resumeData.summary +
    resumeData.experience +
    resumeData.skills.join(" ")
  ).toLowerCase();

  const jdWords = jobDesc
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 3);

  const uniqueJD = [...new Set(jdWords)];
  let matched = [];
  let missing = [];

  uniqueJD.forEach(w =>
    resumeText.includes(w) ? matched.push(w) : missing.push(w)
  );

  return {
    matchPercent: Math.round((matched.length / uniqueJD.length) * 100),
    matched,
    missing
  };
}

/* ------------------ AI MOCK ------------------ */
function aiRewriteSummary(text) {
  return `ATS-optimized professional summary:
${text}
Focused on impact, ownership, and results.`;
}

/* ------------------ SAVE ------------------ */
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

  window.lastSavedTime = new Date().toLocaleString();
  window.resumeData = resumeData;

  localStorage.setItem(
    "resumeData",
    JSON.stringify({ ...resumeData, savedTime: window.lastSavedTime })
  );

  const completeness = calculateCompleteness(resumeData);
  const ats = calculateATSScore(resumeData);
  const jd = calculateJDMatch(resumeData, resumeData.jobDesc);

  window.atsScore = ats.score;
  window.jdMatchPercent = jd.matchPercent;
  window.matchingKeywords = jd.matched;
  window.missingKeywords = jd.missing;

  output.innerText = `
Resume Saved ✅

ATS Score: ${window.atsScore}/100
JD Match: ${window.jdMatchPercent}%
Resume Completeness: ${completeness}%

Matched Keywords:
${jd.matched.slice(0, 10).join(", ") || "None"}

Missing Keywords:
${jd.missing.slice(0, 10).join(", ") || "None"}

Last Saved: ${window.lastSavedTime}
`;

  updatePlanUI();
});

/* ------------------ AI REWRITE ------------------ */
rewriteSummaryBtn.addEventListener("click", () => {
  if (!isProActive() && userPlan.aiLeft <= 0) {
    alert("AI limit exhausted. Upgrade your plan.");
    return;
  }

  summary.value = aiRewriteSummary(summary.value);

  if (!isProActive()) {
    userPlan.aiLeft--;
    localStorage.setItem("userPlan", JSON.stringify(userPlan));
  }

  updatePlanUI();
  alert("Summary rewritten ✨");
});

/* ------------------ UPGRADE ------------------ */
upgradeBtn.addEventListener("click", () => {
  const choice = prompt(
`Choose Plan:
1 ₹49 One Time
2 ₹99 One Week
3 ₹149 15 Days
4 ₹299 1 Month
5 ₹699 3 Months
6 ₹999 6 Months
7 ₹1699 1 Year`
  );

  const map = [
    null,
    PLANS.ONE_TIME,
    PLANS.WEEK,
    PLANS.FIFTEEN,
    PLANS.MONTH,
    PLANS.THREE_MONTH,
    PLANS.SIX_MONTH,
    PLANS.YEAR
  ];

  const selected = map[choice];
  if (!selected) return alert("Invalid plan");

  userPlan = {
    name: selected.label,
    expiresAt: Date.now() + selected.days * 86400000,
    aiLeft: selected.ai
  };

  localStorage.setItem("userPlan", JSON.stringify(userPlan));
  alert("🎉 Plan activated successfully!");
  updatePlanUI();
});

/* ------------------ LOAD ------------------ */
window.onload = () => {
  const data = JSON.parse(localStorage.getItem("resumeData") || "{}");

  name.value = data.name || "";
  role.value = data.role || "";
  summary.value = data.summary || "";
  experience.value = data.experience || "";
  jobDesc.value = data.jobDesc || "";
  skills.value = (data.skills || []).join(", ");

  updatePlanUI();
};