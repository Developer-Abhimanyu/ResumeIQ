import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import razorpay from "./razorpay.js";
import db from "./db.js";
import OpenAI from "openai";
import { PLANS } from "./plans.js";
import PDFDocument from "pdfkit";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const app = express();
const PORT = process.env.PORT || 4242;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================
   MIDDLEWARE
========================= */

const allowedOrigins = [
  "http://localhost:5500",
  "http://localhost:3000",
  "https://resumeiq.online" // replace with real URL
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));
app.use(express.json());

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend from "public" folder
app.use(express.static(path.join(__dirname, "public")));

app.get("/plans", (req, res) => {
  res.json(PLANS);
});

/* =========================
   PAID USER GUARD
========================= */

async function requireActiveSubscription(req, res, next) {
  const email = req.body.email || req.query.email;

  if (!email) {
    return res.status(400).json({ error: "Email required" });
  }

  const sub = await db.get(
    `SELECT expires_at FROM subscriptions WHERE user_email = ?`,
    email
  );

  if (!sub) {
    return res.status(403).json({ success: false, reason: "NO_SUBSCRIPTION" });
  }

  if (Date.now() > sub.expires_at) {
    await db.run(
      "DELETE FROM subscriptions WHERE user_email = ?",
      email
    );
    return res.status(403).json({ success: false, reason: "EXPIRED" });
  }

  next();
}

/* =========================
   GET PLANS (SOURCE OF TRUTH)
========================= */

/* =========================
   REGISTER USER
========================= */

app.post("/register", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const existing = await db.get(
    "SELECT email FROM users WHERE email = ?",
    email
  );

  if (!existing) {
    await db.run("INSERT INTO users (email) VALUES (?)", email);
  }

  res.json({ success: true });
});

/* =========================
   CREATE RAZORPAY ORDER
========================= */

app.post("/create-order", async (req, res) => {
  try {
    const { planId, email } = req.body;

    // ✅ Validate input
    if (!planId || !email) {
      return res.status(400).json({
        error: "MISSING_FIELDS",
        message: "Plan ID and email are required"
      });
    }

    const plan = PLANS[planId];

    if (!plan) {
      return res.status(400).json({
        error: "INVALID_PLAN"
      });
    }

    // ✅ Check if user already has active subscription
    const existingSub = await db.get(
      "SELECT expires_at FROM subscriptions WHERE user_email = ?",
      email
    );

    if (existingSub && Date.now() < existingSub.expires_at) {
      return res.status(400).json({
        error: "PLAN_ACTIVE",
        message: "You already have an active subscription"
      });
    }

    // ✅ Create Razorpay order
    const order = await razorpay.orders.create({
      amount: plan.price * 100,
      currency: "INR",
      receipt: `receipt_${planId}_${Date.now()}`
    });

    return res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({
      error: "SERVER_ERROR"
    });
  }
});

/* =========================
   VERIFY PAYMENT
========================= */

app.post("/verify-payment", async (req, res) => {

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    planId,
    email,
  } = req.body;

  const plan = PLANS[planId];
  if (!email || !plan) {
    return res.status(400).json({ error: "Invalid request" });
  }

  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  await db.run(
    `INSERT INTO payments
     (razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_id, amount, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planId,
      plan.price,
      "success",
    ]
  );

  await db.run("DELETE FROM subscriptions WHERE user_email = ?", email);

  const expiresAt =
    Date.now() + plan.days * 24 * 60 * 60 * 1000;

  await db.run(
    `INSERT INTO subscriptions
     (user_email, plan_id, plan_name, expires_at)
     VALUES (?, ?, ?, ?)`,
    [email, planId, plan.label, expiresAt]
  );

  res.json({ success: true });
});

/* =========================
   ME
========================= */

app.get("/me", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Email required" });

  const sub = await db.get(
    `SELECT plan_id, plan_name, expires_at
     FROM subscriptions WHERE user_email = ?`,
    email
  );

  if (!sub || Date.now() > sub.expires_at) {
    if (sub) {
      await db.run(
        "DELETE FROM subscriptions WHERE user_email = ?",
        email
      );
    }
    return res.json({ email, active: false });
  }

  res.json({
    email,
    active: true,
    plan: {
      id: sub.plan_id,
      name: sub.plan_name,
      expiresAt: sub.expires_at,
    },
  });
});

/* =========================
   USE AI (REAL, PAID ONLY)
========================= */

app.post("/use-ai", requireActiveSubscription, async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Text required" });
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert ATS resume writer. Rewrite the summary to be professional, concise, and ATS-optimized.",
      },
      { role: "user", content: text },
    ],
    temperature: 0.4,
    max_tokens: 200,
  });

  res.json({
    success: true,
    result: completion.choices[0].message.content.trim(),
  });
});

/* =========================
   ANALYZE RESUME (PAID ONLY)
========================= */

/* =========================
   ANALYZE RESUME (ADVANCED)
========================= */

app.post("/analyze-resume", requireActiveSubscription, async (req, res) => {
  const { resume, jobDescription } = req.body;

  if (!resume || !jobDescription) {
    return res.status(400).json({ error: "Resume and JD required" });
  }

  const prompt = `
You are an expert ATS resume evaluator.

Analyze the resume against the job description.

Return ONLY valid JSON in this exact format:

{
  "atsScore": number (0-100),
  "keywordMatch": number (0-100),
  "missingKeywords": [array of strings],
  "improvements": [array of short suggestions],
  "optimizedBullets": [array of improved bullet points]
}

Resume:
${resume}

Job Description:
${jobDescription}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 800,
  });

  try {
  const result = JSON.parse(
    completion.choices[0].message.content.trim()
  );

  // 🔥 Calculate matched keywords manually
  const resumeLower = resume.toLowerCase();

  const matchedKeywords = [];
  result.missingKeywords.forEach(k => {
    if (!resumeLower.includes(k.toLowerCase())) return;
  });

  // Extract keywords from JD for matching
  const jdWords = jobDescription
    .toLowerCase()
    .match(/\b[a-zA-Z]{4,}\b/g) || [];

  const uniqueJDWords = [...new Set(jdWords)];

  uniqueJDWords.forEach(word => {
    if (resumeLower.includes(word)) {
      matchedKeywords.push(word);
    }
  });

  res.json({
    ...result,
    matchedKeywords
  });

} catch (err) {
  res.status(500).json({ error: "AI response parsing failed" });
}
});

/* =========================
   AUTO FIX RESUME (PRO ONLY)
========================= */

app.post("/auto-fix", requireActiveSubscription, async (req, res) => {
  const { resumeText, jobDescription } = req.body;

  if (!resumeText || !jobDescription) {
    return res.status(400).json({ error: "Missing resume or job description" });
  }

  const prompt = `
You are an expert ATS resume optimizer.

Rewrite the resume below to:
- Improve ATS score
- Naturally include missing keywords from job description
- Strengthen impact with measurable achievements
- Keep formatting clean and professional
- Do NOT invent fake experience

JOB DESCRIPTION:
${jobDescription}

RESUME:
${resumeText}

Return only the improved resume.
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 1000,
    });

    res.json({
      success: true,
      improvedResume: completion.choices[0].message.content.trim(),
    });
  } catch (err) {
    res.status(500).json({ error: "AI processing failed" });
  }
});

/* =========================
   EXPORT ATS REPORT (PDF)
========================= */

app.post("/export-report", requireActiveSubscription, async (req, res) => {
  const {
    atsScore,
    keywordMatch,
    missingKeywords,
    improvements,
    optimizedBullets
  } = req.body;

  const doc = new PDFDocument({ margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=ResumeIQ-ATS-Report.pdf"
  );

  doc.pipe(res);

  // Title
  doc
    .fontSize(20)
    .text("ResumeIQ ATS Optimization Report", { align: "center" });

  doc.moveDown(2);

  doc.fontSize(14).text(`ATS Score: ${atsScore}%`);
  doc.text(`Keyword Match: ${keywordMatch}%`);

  doc.moveDown();

  doc.fontSize(16).text("Missing Keywords:");
  doc.moveDown(0.5);

  missingKeywords.forEach(k => {
    doc.fontSize(12).text(`• ${k}`);
  });

  doc.moveDown();

  doc.fontSize(16).text("Improvement Suggestions:");
  doc.moveDown(0.5);

  improvements.forEach(i => {
    doc.fontSize(12).text(`• ${i}`);
  });

  doc.moveDown();

  doc.fontSize(16).text("Optimized Bullet Suggestions:");
  doc.moveDown(0.5);

  optimizedBullets.forEach(b => {
    doc.fontSize(12).text(`• ${b}`);
  });

  doc.end();
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});