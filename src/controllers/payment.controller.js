const upayService = require("../services/upay.service");
const { processSuccessfulPayment } = require("../services/recharge.service");
const db = require("../config/database");
const logger = require("../utils/logger");

const insertRechargeRecord = async ({
  rechargeId,
  orderId,
  userId,
  userMobile,
  amount,
}) => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const baseValues = [
    rechargeId,
    orderId,
    userId,
    userMobile || "0123456789",
    parseFloat(amount),
    "USDT",
    "Upay",
    date,
    time,
    "pending",
  ];

  try {
    await db.execute(
      `INSERT INTO recharge (
        recharge_id, order_id, userId, user_mobile, recharge_amount,
        recharge_type, payment_mode, date, time, recharge_status, isDepAdded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      baseValues
    );
  } catch (err) {
    if (err.code === "ER_BAD_FIELD_ERROR") {
      await db.execute(
        `INSERT INTO recharge (
          recharge_id, order_id, userId, user_mobile, recharge_amount,
          recharge_type, payment_mode, date, time, recharge_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        baseValues
      );
    } else {
      throw err;
    }
  }
};

const createPaymentRedirectHandler = async (req, res) => {
  try {
    const amount = parseFloat(req.query.amount);
    const uid = parseInt(req.query.uid, 10);

    logger.logIncoming("PayIn:Redirect", "/pay", { amount, uid });

    if (!amount || !uid) {
      return res.status(400).json({
        status: false,
        message: "Invalid input parameters",
      });
    }

    const { payUrl, merchantOrderNo } = await upayService.createOrder({
      amount,
      userId: uid,
    });

    await insertRechargeRecord({
      rechargeId: merchantOrderNo,
      orderId: merchantOrderNo,
      userId: uid,
      amount,
    });

    logger.info("PayIn:Redirect", "Redirecting to payment URL", { merchantOrderNo, uid });
    return res.redirect(payUrl);
  } catch (err) {
    logger.logError("PayIn:Redirect", "Failed to create payment", err);
    return res.status(500).json({
      status: false,
      message: err.message || "Failed to create payment",
    });
  }
};

const createUserOrderHandler = async (req, res) => {
  try {
    const { amount, userId, user_mobile } = req.body;

    logger.logIncoming("PayIn:createUserOrder", "/api/payments/user/order", req.body);

    if (!amount || !userId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: amount, userId",
      });
    }

    const { payUrl, merchantOrderNo } = await upayService.createOrder({
      amount,
      userId,
    });

    await insertRechargeRecord({
      rechargeId: merchantOrderNo,
      orderId: merchantOrderNo,
      userId,
      userMobile: user_mobile,
      amount,
    });

    logger.logOutgoing("PayIn:createUserOrder", "/api/payments/user/order", { paymentUrl: payUrl });
    return res.json({ paymentUrl: payUrl });
  } catch (err) {
    logger.logError("PayIn:createUserOrder", err.message, err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/**
 * UPay webhook — accepts alphanumeric merchantOrderNo like 20260804BX5HC9W2
 * UPay sends status as string "1" for success
 */
const webhookHandler = async (req, res) => {
  try {
    logger.logWebhook("PayIn:Webhook", req.originalUrl, req.body);

    const { merchantOrderNo, status } = req.body;

    if (!merchantOrderNo || status === undefined || status === null) {
      logger.error("PayIn:Webhook", "Missing required fields", req.body);
      return res.json({
        status: false,
        message: "Invalid callback data: missing required fields",
      });
    }

    const orderId = String(merchantOrderNo).trim();

    if (!orderId) {
      logger.error("PayIn:Webhook", "Empty merchantOrderNo", req.body);
      return res.json({
        status: false,
        message: "Invalid callback data: merchantOrderNo issue",
      });
    }

    const paymentStatus = parseInt(status, 10);

    if (paymentStatus !== 1) {
      logger.info("PayIn:Webhook", `Status=${status} (not success), ignoring`, { orderId });
      return res.json({
        status: false,
        message: "Recharge Pending",
      });
    }

    logger.info("PayIn:Webhook", "Payment SUCCESS (status=1)", { orderId });

    const result = await processSuccessfulPayment(orderId);
    return res.json({ status: result.success, message: result.message });
  } catch (err) {
    logger.logError("PayIn:Webhook", "Unexpected error in webhook handler", err);
    return res.json({
      status: false,
      message: "Internal server error",
    });
  }
};

/**
 * Manual reprocess for orders stuck due to old PHP bug
 * POST /api/payments/reprocess  { "orderId": "20260804BX5HC9W2" }
 */
const reprocessOrderHandler = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, error: "orderId is required" });
    }

    logger.info("PayIn:Reprocess", "Manual reprocess requested", { orderId });
    const result = await processSuccessfulPayment(String(orderId).trim());
    return res.json(result);
  } catch (err) {
    logger.logError("PayIn:Reprocess", "Reprocess failed", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  createPaymentRedirectHandler,
  createUserOrderHandler,
  webhookHandler,
  reprocessOrderHandler,
};
