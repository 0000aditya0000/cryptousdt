const axios = require("axios");
const crypto = require("crypto");
const config = require("../config/upay");
const logger = require("../utils/logger");

const ORDER_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ123456789";

/**
 * Generate UPay signature
 * Sort keys ascending, build key=value& pairs, append appSecret, MD5 uppercase
 */
const generateSignature = (params, appSecret) => {
  const sortedKeys = Object.keys(params).sort();
  let stringA = "";

  for (const key of sortedKeys) {
    const value = params[key];
    if (value !== null && value !== "") {
      stringA += `${key}=${value}&`;
    }
  }

  stringA += `appSecret=${appSecret}`;
  const signature = crypto.createHash("md5").update(stringA).digest("hex").toUpperCase();
  return { signature, signString: stringA };
};

/**
 * Generate merchant order ID: YYYYMMDD + 8 random alphanumeric chars
 */
const generateOrderId = () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const chars = ORDER_CHARS.split("");
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  const uniquePart = chars.slice(0, 8).join("");
  return `${dateStr}${uniquePart}`;
};

/**
 * Create UPay order and return payment URL
 * @param {Object} orderData - { amount, userId }
 * @returns {Promise<Object>}
 */
const createOrder = async ({ amount, userId }) => {
  if (!config.appId || !config.appSecret) {
    throw new Error("UPay credentials not configured. Set UPAY_APP_ID and UPAY_APP_SECRET in .env");
  }

  const merchantOrderNo = generateOrderId();
  const fiatAmount = String(amount);

  const signParams = {
    appId: config.appId,
    merchantOrderNo,
    chainType: config.chainType,
    fiatAmount,
    fiatCurrency: config.fiatCurrency,
    notifyUrl: config.notifyUrl,
  };

  const { signature, signString } = generateSignature(signParams, config.appSecret);
  logger.logSign("UPay:createOrder", signString, signature);

  const payload = {
    appId: config.appId,
    merchantOrderNo,
    chainType: config.chainType,
    fiatAmount,
    fiatCurrency: config.fiatCurrency,
    productName: config.productName,
    notifyUrl: config.notifyUrl,
    redirectUrl: config.returnUrl,
    attach: String(userId),
    signature,
  };

  const url = `${config.baseURL}${config.createEndpoint}`;
  logger.logRequest("UPay:createOrder", url, payload);

  const response = await axios.post(url, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 30000,
  });

  logger.logResponse("UPay:createOrder", url, response.data);

  const payUrl = response.data?.data?.payUrl;
  if (!payUrl) {
    throw new Error(
      response.data?.message || "Failed to retrieve payment URL from UPay"
    );
  }

  return {
    payUrl,
    merchantOrderNo,
    upayResponse: response.data,
  };
};

module.exports = {
  createOrder,
  generateSignature,
  generateOrderId,
};
