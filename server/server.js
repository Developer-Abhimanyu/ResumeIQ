import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import razorpay from "./razorpay.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4242;

/* =========================
   MIDDLEWARE
   ========================= */

app.use(cors());
app.use(express.json());

/* =========================
   PLANS (MATCH FRONTEND)
   ========================= */

const PLANS = {
  pro_monthly: {
    name: "Pro Monthly",
    price: 299, // INR
    days: 30,
    ai: 50,
  },
  pro_annual: {
    name: "Pro Annual",
    price: 2999, // INR
    days: 365,
    ai: 999,
  },
};

/* =========================
   CREATE RAZORPAY ORDER
   ========================= */

app.post("/create-order", async (req, res) => {
  try {
    const { planId } = req.body;
    const plan = PLANS[planId];

    if (!plan) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const options = {
      amount: plan.price * 100, // paise
      currency: "INR",
      receipt: `receipt_${planId}_${Date.now()}`,
      notes: {
        planId,
        planName: plan.name,
      },
    };

    const order = await razorpay.orders.create(options);

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      plan,
      key: process.env.RAZORPAY_KEY_ID, // safe to expose
    });
  } catch (err) {
    console.error("❌ Razorpay order failed:", err);
    res.status(500).json({ error: "Failed to create Razorpay order" });
  }
});

/* =========================
   VERIFY PAYMENT
   ========================= */

app.post("/verify-payment", (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planId,
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, error: "Invalid signature" });
    }

    console.log("✅ Payment verified for plan:", planId);

    /**
     * TODO (NEXT STEP):
     * - Identify user (email / userId)
     * - Activate plan
     * - Store expiresAt, aiCredits
     */

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Verification failed:", err);
    res.status(500).json({ success: false });
  }
});

/* =========================
   START SERVER
   ========================= */

app.listen(PORT, () => {
  console.log(`🚀 Razorpay server running on http://localhost:${PORT}`);
});