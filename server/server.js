import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import razorpay from "./razorpay.js";
import db from "./db.js";
import OpenAI from "openai";
import { PLANS } from "./plans.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4242;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================
   MIDDLEWARE
========================= */

app.use(cors());
app.use(express.json());

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

app.get("/plans", (req, res) => {
  res.json(PLANS);
});

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
  const { planId } = req.body;
  const plan = PLANS[planId];

  if (!plan) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  const order = await razorpay.orders.create({
    amount: plan.price * 100,
    currency: "INR",
    receipt: `receipt_${planId}_${Date.now()}`,
  });

  res.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    plan,
    key: process.env.RAZORPAY_KEY_ID,
  });
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
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});