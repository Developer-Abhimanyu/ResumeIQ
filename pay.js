export async function pay(planId, email) {
  // 1️⃣ Create order
  const orderRes = await fetch("http://localhost:4242/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId }),
  });

  const order = await orderRes.json();

  // 2️⃣ Open Razorpay
  const options = {
    key: order.key,
    amount: order.amount,
    currency: order.currency,
    name: "ResumeIQ",
    description: order.plan.name,
    order_id: order.orderId,
    prefill: { email },

    handler: async function (response) {
      // 3️⃣ Verify payment
      await fetch("http://localhost:4242/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
          planId,
          email,
        }),
      });

      alert("Payment successful 🎉");
      window.location.reload();
    },
  };

  const rzp = new window.Razorpay(options);
  rzp.open();
}