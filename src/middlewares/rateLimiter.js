const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const logger = require("../utils/logger");

const getUserRateLimitKey = (req) => {
  const userId = req.body?.userId || req.query?.uid;
  if (userId !== undefined && userId !== null && String(userId).trim() !== "") {
    return `user:${String(userId).trim()}`;
  }
  return ipKeyGenerator(req);
};

const createRechargeRateLimiter = () => {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => getUserRateLimitKey(req),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn("RateLimiter", "Rate limit exceeded for recharge", {
        userId: req.body?.userId || req.query?.uid,
        ip: req.ip,
        path: req.path,
      });
      res.status(429).json({
        success: false,
        error: "Too many recharge attempts. Please try again later.",
        retryAfter: "15 minutes",
      });
    },
  });
};

module.exports = {
  createRechargeRateLimiter,
};
