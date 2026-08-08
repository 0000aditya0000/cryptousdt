require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const paymentRoutes = require("./routes/payment.routes");
const {
  createPaymentRedirectHandler,
  webhookHandler,
} = require("./controllers/payment.controller");
const logger = require("./utils/logger");

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(morgan("combined", { stream: logger.morganStream }));
app.use(morgan("dev"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/api/payment/webhook", webhookHandler);

app.get("/pay", createPaymentRedirectHandler);

app.use("/api/payments", paymentRoutes);

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "cryptousdt-upay-gateway",
  });
});

app.get("/", (req, res) => {
  res.json({
    message: "CryptoUSDT UPay Gateway API",
    version: "1.0.0",
    endpoints: {
      createPaymentRedirect: "GET /pay?amount=&uid=",
      createUserOrder: "POST /api/payments/user/order",
      webhook: "POST /api/payment/webhook",
      health: "GET /health",
    },
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

app.use((err, req, res, next) => {
  logger.logError("App:GlobalErrorHandler", "Unhandled error", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  logger.info("App", `CryptoUSDT UPay Gateway running on port ${PORT}`);
  logger.info("App", `Redirect:  http://localhost:${PORT}/pay?amount=10&uid=123`);
  logger.info("App", `API:       http://localhost:${PORT}/api/payments`);
  logger.info("App", `Webhook:   http://localhost:${PORT}/api/payment/webhook`);
  logger.info("App", `Health:    http://localhost:${PORT}/health`);
});

module.exports = app;
