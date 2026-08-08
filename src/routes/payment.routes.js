const express = require("express");
const router = express.Router();

const {
  createUserOrderHandler,
  reprocessOrderHandler,
} = require("../controllers/payment.controller");

const { createRechargeRateLimiter } = require("../middlewares/rateLimiter");
const { validateUserStatus } = require("../middlewares/userStatusValidator");

router.post(
  "/user/order",
  createRechargeRateLimiter(),
  validateUserStatus,
  createUserOrderHandler
);

router.post("/reprocess", reprocessOrderHandler);

module.exports = router;
