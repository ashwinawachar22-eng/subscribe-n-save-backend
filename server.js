const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

const subscriptions = [
  {
    id: "SUB-10001",
    customer: "John Smith",
    plan: "Premium Coffee",
    amount: 999,
    currency: "INR",
    frequency: "MONTHLY",
    status: "ACTIVE",
    nextBillingDate: "2026-10-12",
    paymentMethod: "•••• 4242"
  },
  {
    id: "SUB-10002",
    customer: "Priya Shah",
    plan: "Premium Coffee",
    amount: 999,
    currency: "INR",
    frequency: "MONTHLY",
    status: "PAYMENT_RETRY",
    nextBillingDate: "2026-10-12",
    paymentMethod: "•••• 1111"
  },
  {
    id: "SUB-10003",
    customer: "Rahul Mehta",
    plan: "Daily Essentials",
    amount: 499,
    currency: "INR",
    frequency: "MONTHLY",
    status: "PAUSED",
    nextBillingDate: "2026-10-15",
    paymentMethod: "•••• 2222"
  }
];

const payments = [
  {
    id: "PAY-10001",
    subscriptionId: "SUB-10001",
    amount: 999,
    status: "SUCCESS",
    type: "CIT",
    message: "Initial payment"
  },
  {
    id: "PAY-10002",
    subscriptionId: "SUB-10002",
    amount: 999,
    status: "DECLINED",
    type: "MIT",
    message: "Retryable decline"
  },
  {
    id: "PAY-10003",
    subscriptionId: "SUB-10003",
    amount: 499,
    status: "UNKNOWN",
    type: "MIT",
    message: "PSP timeout"
  }
];

const events = [
  {
    time: "2026-09-12 10:00",
    subscriptionId: "SUB-10001",
    text: "Subscription created"
  },
  {
    time: "2026-09-12 10:01",
    subscriptionId: "SUB-10001",
    text: "Initial payment ₹999"
  },
  {
    time: "2026-09-12 10:02",
    subscriptionId: "SUB-10001",
    text: "3DS authentication: SUCCESS"
  },
  {
    time: "2026-09-12 10:03",
    subscriptionId: "SUB-10001",
    text: "Payment authorized"
  },
  {
    time: "2026-09-12 10:03",
    subscriptionId: "SUB-10001",
    text: "Subscription became ACTIVE"
  },
  {
    time: "2026-10-12 00:01",
    subscriptionId: "SUB-10001",
    text: "Scheduler identified billing cycle due"
  },
  {
    time: "2026-10-12 00:02",
    subscriptionId: "SUB-10001",
    text: "Recurring MIT payment triggered"
  },
  {
    time: "2026-10-12 00:02",
    subscriptionId: "SUB-10001",
    text: "3RI/authentication handling where applicable"
  }
];

function id(prefix) {
  return (
    prefix +
    crypto.randomUUID().slice(0, 8).toUpperCase()
  );
}

function nextMonthDate() {
  const d = new Date();

  d.setMonth(
    d.getMonth() + 1
  );

  return d
    .toISOString()
    .slice(0, 10);
}

/* =========================
   HEALTH
========================= */

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      status: "UP",
      service:
        "subscribe-n-save-backend"
    });
  }
);

/* =========================
   SUBSCRIPTIONS
========================= */

app.get(
  "/api/subscriptions",
  (req, res) => {
    res.json(subscriptions);
  }
);

app.get(
  "/api/subscriptions/:id/events",
  (req, res) => {
    res.json(
      events.filter(
        (e) =>
          e.subscriptionId ===
          req.params.id
      )
    );
  }
);

/* =========================
   PAYMENTS
========================= */

app.get(
  "/api/payments",
  (req, res) => {
    res.json(payments);
  }
);

/* =========================
   CUSTOMER ENROLLMENT
   Initial payment = CIT
========================= */

app.post(
  "/api/subscriptions/enroll",
  (req, res) => {
    const {
      customerName,
      plan,
      amount,
      currency = "INR",
      frequency = "MONTHLY",
      paymentMethod,
      consent
    } = req.body;

    if (
      !customerName ||
      !plan ||
      !amount ||
      !paymentMethod ||
      consent !== true
    ) {
      return res
        .status(400)
        .json({
          error:
            "Customer name, plan, amount, payment method and recurring-payment consent are required."
        });
    }

    const subscriptionId =
      id("SUB-SIM-");

    const paymentId =
      id("PAY-CIT-");

    const nextBillingDate =
      nextMonthDate();

    const subscription = {
      id: subscriptionId,
      customer: customerName,
      plan,
      amount: Number(amount),
      currency,
      frequency,
      status: "ACTIVE",
      nextBillingDate,
      paymentMethod:
        `•••• ${String(
          paymentMethod
        ).slice(-4)}`
    };

    const payment = {
      id: paymentId,
      subscriptionId,
      amount: Number(amount),
      status: "SUCCESS",
      type: "CIT",
      message:
        "Initial customer-initiated payment",
      idempotencyKey:
        `${subscriptionId}-INITIAL`
    };

    subscriptions.push(
      subscription
    );

    payments.push(payment);

    const timestamp =
      new Date().toISOString();

    events.push(
      {
        time: timestamp,
        subscriptionId,
        text:
          `Customer selected ${plan} Subscribe & Save`
      },
      {
        time: timestamp,
        subscriptionId,
        text:
          "Recurring-payment consent captured"
      },
      {
        time: timestamp,
        subscriptionId,
        text:
          "Initial customer-initiated payment SUCCESS"
      },
      {
        time: timestamp,
        subscriptionId,
        text:
          "Subscription became ACTIVE"
      }
    );

    res
      .status(201)
      .json({
        subscription,
        payment,
        webhook: {
          event:
            "payment.authorized",
          payment_id:
            paymentId,
          subscription_id:
            subscriptionId,
          status: "SUCCESS"
        }
      });
  }
);

/* =========================
   PAYMENT SIMULATOR
========================= */

app.post(
  "/api/payments/simulate",
  (req, res) => {
    const {
      subscriptionId =
        "SUB-10001",
      outcome = "SUCCESS",
      amount = 999,
      idempotencyKey
    } = req.body;

    const key =
      idempotencyKey ||
      crypto.randomUUID();

    /* =========================
       IDEMPOTENCY CHECK
    ========================= */

    const existing =
      payments.find(
        (p) =>
          p.idempotencyKey ===
          key
      );

    if (existing) {
      return res.json({
        ...existing,

        /*
          Important:
          This request is a duplicate
          of an already processed
          payment request.

          We return the ORIGINAL
          payment instead of creating
          another payment.
        */

        duplicate: true,

        message:
          "Duplicate request detected. Original payment response returned. No duplicate charge created."
      });
    }

    /* =========================
       CREATE NEW PAYMENT
    ========================= */

    const paymentId =
      id("PAY-SIM-");

    const payment = {
      id: paymentId,
      subscriptionId,
      amount: Number(amount),
      status: outcome,
      type: "MIT",
      idempotencyKey: key,
      message:
        "Simulated PSP outcome"
    };

    payments.push(payment);

    const subscription =
      subscriptions.find(
        (x) =>
          x.id ===
          subscriptionId
      );

    /* =========================
       SUCCESS
    ========================= */

    if (
      outcome === "SUCCESS"
    ) {
      if (subscription) {
        subscription.status =
          "ACTIVE";

        subscription.nextBillingDate =
          "2026-11-12";
      }

      events.push({
        time:
          new Date().toISOString(),

        subscriptionId,

        text:
          "Recurring payment SUCCESS; billing cycle PAID"
      });
    }

    /* =========================
       DECLINED
    ========================= */

    else if (
      outcome === "DECLINED"
    ) {
      if (subscription) {
        subscription.status =
          "PAYMENT_RETRY";
      }

      events.push({
        time:
          new Date().toISOString(),

        subscriptionId,

        text:
          "Payment DECLINED; retry evaluation scheduled"
      });
    }

    /* =========================
       UNKNOWN
    ========================= */

    else if (
      outcome === "UNKNOWN"
    ) {
      events.push({
        time:
          new Date().toISOString(),

        subscriptionId,

        text:
          "PSP TIMEOUT; payment UNKNOWN; duplicate charge blocked pending reconciliation"
      });
    }

    /* =========================
       3DS REQUIRED
    ========================= */

    else if (
      outcome ===
      "3DS_REQUIRED"
    ) {
      events.push({
        time:
          new Date().toISOString(),

        subscriptionId,

        text:
          "3DS authentication required; payment awaiting authentication"
      });
    }

    /* =========================
       RESPONSE
    ========================= */

    res.json({
      payment,

      webhook: {
        event:
          outcome === "SUCCESS"
            ? "payment.authorized"
            : "payment.status",

        payment_id:
          paymentId,

        subscription_id:
          subscriptionId,

        status: outcome
      }
    });
  }
);

/* =========================
   RECONCILIATION
========================= */

app.post(
  "/api/payments/:id/reconcile",
  (req, res) => {
    const payment =
      payments.find(
        (x) =>
          x.id ===
          req.params.id
      );

    if (!payment) {
      return res
        .status(404)
        .json({
          error:
            "Payment not found"
        });
    }

    payment.status =
      "SUCCESS";

    payment.reconciled =
      true;

    const subscription =
      subscriptions.find(
        (x) =>
          x.id ===
          payment.subscriptionId
      );

    if (subscription) {
      subscription.status =
        "ACTIVE";
    }

    events.push({
      time:
        new Date().toISOString(),

      subscriptionId:
        payment.subscriptionId,

      text:
        "Reconciliation confirmed SUCCESS; billing cycle PAID; no duplicate charge"
    });

    res.json({
      payment,

      result:
        "SUCCESS",

      duplicateChargePrevented:
        true
    });
  }
);

/* =========================
   SUBSCRIPTION MANAGEMENT
========================= */

app.post(
  "/api/subscriptions/:id/:action",
  (req, res) => {
    const subscription =
      subscriptions.find(
        (x) =>
          x.id ===
          req.params.id
      );

    if (!subscription) {
      return res
        .status(404)
        .json({
          error:
            "Subscription not found"
        });
    }

    const statusMap = {
      pause: "PAUSED",
      resume: "ACTIVE",
      cancel: "CANCELLED"
    };

    const newStatus =
      statusMap[
        req.params.action
      ];

    if (!newStatus) {
      return res
        .status(400)
        .json({
          error:
            "Unsupported action"
        });
    }

    subscription.status =
      newStatus;

    events.push({
      time:
        new Date().toISOString(),

      subscriptionId:
        subscription.id,

      text:
        `Subscription ${req.params.action.toUpperCase()} requested`
    });

    res.json(
      subscription
    );
  }
);

/* =========================
   VERCEL / SERVER
========================= */

const PORT =
  process.env.PORT || 4000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Backend running on port ${PORT}`
    );
  }
);
