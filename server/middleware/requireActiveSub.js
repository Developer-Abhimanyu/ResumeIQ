import db from "../db.js";

export default async function requireActiveSub(req, res, next) {
  try {
    const email = req.body.email || req.query.email;

    if (!email) {
      return res.status(401).json({ error: "EMAIL_REQUIRED" });
    }

    const sub = await db.get(
      `SELECT ai_credits, expires_at
       FROM subscriptions
       WHERE user_email = ?`,
      email
    );

    // ❌ No subscription
    if (!sub) {
      return res.status(403).json({
        success: false,
        reason: "NO_SUBSCRIPTION",
      });
    }

    // ⏰ Expired subscription
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

    // 🚫 No credits
    if (sub.ai_credits <= 0) {
      return res.status(403).json({
        success: false,
        reason: "NO_CREDITS",
      });
    }

    // ✅ Attach to request
    req.subscription = sub;
    req.userEmail = email;

    next();
  } catch (err) {
    console.error("❌ requireActiveSub failed", err);
    res.status(500).json({ error: "PAYWALL_ERROR" });
  }
}