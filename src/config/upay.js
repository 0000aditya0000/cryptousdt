require("dotenv").config();

module.exports = {
  baseURL: process.env.UPAY_BASE_URL || "https://api.upay.ink",
  appId: process.env.UPAY_APP_ID,
  appSecret: process.env.UPAY_APP_SECRET,
  chainType: process.env.UPAY_CHAIN_TYPE || "1",
  productName: process.env.UPAY_PRODUCT_NAME || "usdtrecharge",
  fiatCurrency: process.env.UPAY_FIAT_CURRENCY || "USD",
  usdtInrRate: parseFloat(process.env.USDT_INR_RATE || "89"),
  usdtDepositRateUrl:
    process.env.USDT_DEPOSIT_RATE_URL ||
    `${process.env.PLATFORM_BASE_URL || "https://api.rollix777.com"}/api/rates/usdt-deposit-rate`,
  createEndpoint: "/v1/api/open/order/apply",
  notifyUrl: process.env.NOTIFY_URL || "https://cryptousdt.rollix777.com/api/payment/webhook",
  returnUrl: process.env.RETURN_URL || "https://r7dream.com/",
  platformBaseURL: process.env.PLATFORM_BASE_URL || "https://api.rollix777.com",
};
