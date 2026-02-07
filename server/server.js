import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import razorpay from "./razorpay.js";
import db from "./db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4242;

/* =========================
   MIDDLEWARE
   ========================= */

app.use(cors());
app.use(express.json());

/* =========================
   PLANS (DAY 13 – TIME BASED)
   ========================= */

const PLANS = {
  one_time: { name: "One Time", price: 49, days: 1 },
  weekly: { name: "Weekly", price: 99, days: 7 },
  fifteen_days: { name: "15 Days", price: 149, days: 15 },
  monthly: { name: "Monthly", price: 299, days: 30 },
  three_months: { name: "3 Months", price: 699, days: 90 },
  six_months: { name: "6 Months", price: 999, days: 180 },
  yearly: { name: "Yearly", price: 1699, days: 365 },
};

/* =========================
   DAY 15 — PAID USER GUARD
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
    return res.status(403).json({
      success: false,
      reason: "NO_SUBSCRIPTION",
    });
  }

  if (Date.now() > sub.expires_at) {
    await db.run(
      "DELETE FROM subscriptions WHERE user_email = ?",
      email
    );

    return res.status(403).json({
      success: false,
      reason: "EXPIRED",
    });
  }

  next(); // ✅ Paid & active
}

/* =========================
   REGISTER USER
   ========================= */

app.post("/register", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const existing = await db.get(
      "SELECT email FROM users WHERE email = ?",
      email
    );

    if (!existing) {
      await db.run("INSERT INTO users (email) VALUES (?)", email);
      console.log("✅ New user registered:", email);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Register failed:", err);
    res.status(500).json({ success: false });
  }
});

/* =========================
   CREATE RAZORPAY ORDER
   ========================= */

app.post("/create-order", async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId || !PLANS[planId]) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const plan = PLANS[planId];

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
  } catch (err) {
    console.error("❌ Razorpay order failed:", err);
    res.status(500).json({ error: "Failed to create Razorpay order" });
  }
});

/* =========================
   VERIFY PAYMENT (HARDENED)
   ========================= */

app.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planId,
      email,
    } = req.body;

    if (!email || !planId) {
      return res.status(400).json({ error: "Email & plan required" });
    }

    const plan = PLANS[planId];
    if (!plan) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    // 🛑 Prevent replay attacks
    const existingPayment = await db.get(
      "SELECT id FROM payments WHERE razorpay_payment_id = ?",
      razorpay_payment_id
    );

    if (existingPayment) {
      return res.status(409).json({ error: "Payment already processed" });
    }

    // 🔐 Verify signature
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    // 👤 Ensure user exists
    const user = await db.get(
      "SELECT email FROM users WHERE email = ?",
      email
    );

    if (!user) {
      await db.run("INSERT INTO users (email) VALUES (?)", email);
    }

    // 💳 Save payment
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

    // 🧹 Single active subscription
    await db.run(
      "DELETE FROM subscriptions WHERE user_email = ?",
      email
    );

    const expiresAt =
      Date.now() + plan.days * 24 * 60 * 60 * 1000;

    await db.run(
      `INSERT INTO subscriptions
       (user_email, plan_id, plan_name, expires_at)
       VALUES (?, ?, ?, ?)`,
      [email, planId, plan.name, expiresAt]
    );

    console.log("🔥 Subscription activated:", email, plan.name);

    res.json({
      success: true,
      plan: plan.name,
      expiresAt,
    });
  } catch (err) {
    console.error("❌ Verification failed:", err);
    res.status(500).json({ success: false });
  }
});

/* =========================
   GET CURRENT USER STATUS
   ========================= */

app.get("/me", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email required" });

    const sub = await db.get(
      `SELECT plan_id, plan_name, expires_at
       FROM subscriptions
       WHERE user_email = ?`,
      email
    );

    if (!sub) {
      return res.json({ email, active: false, plan: null });
    }

    if (Date.now() > sub.expires_at) {
      await db.run(
        "DELETE FROM subscriptions WHERE user_email = ?",
        email
      );

      return res.json({ email, active: false, plan: null });
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
  } catch (err) {
    console.error("❌ /me failed:", err);
    res.status(500).json({ error: "Failed to fetch user status" });
  }
});

/* =========================
   USE AI (DAY 15 HARDENED)
   ========================= */

app.post("/use-ai", requireActiveSubscription, async (req, res) => {
  // 🔐 Guaranteed paid user here
  res.json({ success: true });
});

/* =========================
   START SERVER
   ========================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});