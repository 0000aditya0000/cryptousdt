const axios = require("axios");
const db = require("../config/database");
const config = require("../config/upay");
const logger = require("../utils/logger");

/**
 * Find recharge row by order_id or recharge_id (handles legacy column naming)
 */
const findRechargeByOrderId = async (orderId) => {
  const [rows] = await db.execute(
    `SELECT userId, recharge_amount, recharge_status, isDepAdded
     FROM recharge
     WHERE order_id = ? OR recharge_id = ?
     LIMIT 1`,
    [orderId, orderId]
  );
  return rows[0] || null;
};

/**
 * Mark recharge as success (idempotent — only updates pending rows)
 */
const markRechargeSuccess = async (orderId) => {
  const [result] = await db.execute(
    `UPDATE recharge
     SET recharge_status = 'success', isDepAdded = 1
     WHERE (order_id = ? OR recharge_id = ?)
       AND recharge_status != 'success'`,
    [orderId, orderId]
  );
  return result.affectedRows;
};

/**
 * Fetch live USDT→INR rate from platform API
 * Falls back to env USDT_INR_RATE if API is unavailable
 */
const fetchUsdtDepositRate = async () => {
  try {
    const response = await axios.get(config.usdtDepositRateUrl, { timeout: 10000 });

    if (response.data?.success && response.data?.rate) {
      const rate = parseFloat(response.data.rate);
      logger.logResponse(
        "Recharge:fetchUsdtDepositRate",
        config.usdtDepositRateUrl,
        response.data
      );
      return rate;
    }

    logger.warn(
      "Recharge:fetchUsdtDepositRate",
      "Invalid rate API response, using fallback",
      response.data
    );
  } catch (err) {
    logger.logError(
      "Recharge:fetchUsdtDepositRate",
      "Failed to fetch live rate, using fallback",
      err
    );
  }

  logger.info("Recharge:fetchUsdtDepositRate", "Using fallback rate", {
    rate: config.usdtInrRate,
  });
  return config.usdtInrRate;
};

/**
 * Credit user wallet via platform APIs
 */
const creditUserWallet = async ({ userId, orderId, usdtAmount }) => {
  const rate = await fetchUsdtDepositRate();
  const inrAmount = usdtAmount * rate;
  const platformBaseURL = config.platformBaseURL;

  const depositRes = await axios.post(
    `${platformBaseURL}/api/user/deposit`,
    { userId, amount: inrAmount, cryptoname: "INR", orderid: orderId },
    { headers: { "Content-Type": "application/json" }, timeout: 15000 }
  );
  logger.logResponse(
    "Recharge:creditUserWallet:DepositAPI",
    `${platformBaseURL}/api/user/deposit`,
    depositRes.data
  );

  const walletRes = await axios.put(
    `${platformBaseURL}/api/user/wallet/balance`,
    { userId, cryptoname: "INR", balance: inrAmount },
    { headers: { "Content-Type": "application/json" }, timeout: 15000 }
  );
  logger.logResponse(
    "Recharge:creditUserWallet:WalletAPI",
    `${platformBaseURL}/api/user/wallet/balance`,
    walletRes.data
  );

  return { inrAmount, usdtAmount, rate };
};

/**
 * Full success flow: update DB + credit wallet
 */
const processSuccessfulPayment = async (orderId) => {
  const recharge = await findRechargeByOrderId(orderId);

  if (!recharge) {
    logger.error("Recharge:processSuccess", "Recharge not found", { orderId });
    return { success: false, message: "Recharge not found" };
  }

  const alreadySuccess = recharge.recharge_status === "success";
  const alreadyCredited = recharge.isDepAdded === 1;

  if (alreadySuccess && alreadyCredited) {
    logger.warn("Recharge:processSuccess", "Already fully processed", { orderId });
    return { success: true, message: "Transaction already processed" };
  }

  const userId = recharge.userId;
  const usdtAmount = parseFloat(recharge.recharge_amount);

  if (!alreadySuccess) {
    const updated = await markRechargeSuccess(orderId);
    if (updated === 0 && !alreadyCredited) {
      logger.warn("Recharge:processSuccess", "Status update had no effect", { orderId });
    }
  }

  if (!alreadyCredited) {
    try {
      const { inrAmount, rate } = await creditUserWallet({ userId, orderId, usdtAmount });

      await db.execute(
        `UPDATE recharge SET isDepAdded = 1
         WHERE (order_id = ? OR recharge_id = ?)`,
        [orderId, orderId]
      );

      logger.info("Recharge:processSuccess", "Payment fully processed", {
        orderId,
        userId,
        usdtAmount,
        inrAmount,
        rate,
      });
    } catch (platformErr) {
      logger.logError(
        "Recharge:processSuccess",
        `CRITICAL: Platform API failed for order ${orderId} — manual intervention required`,
        platformErr
      );
      return {
        success: false,
        message: "Recharge marked success but wallet credit failed",
      };
    }
  }

  return { success: true, message: "Transaction processed successfully" };
};

module.exports = {
  findRechargeByOrderId,
  markRechargeSuccess,
  fetchUsdtDepositRate,
  creditUserWallet,
  processSuccessfulPayment,
};
