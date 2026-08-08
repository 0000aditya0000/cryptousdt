/**
 * Manually reprocess a stuck recharge order.
 * Usage: node scripts/reprocess-order.js 20260804BX5HC9W2
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { processSuccessfulPayment } = require("../src/services/recharge.service");

const orderId = process.argv[2];

if (!orderId) {
  console.error("Usage: node scripts/reprocess-order.js <orderId>");
  console.error("Example: node scripts/reprocess-order.js 20260804BX5HC9W2");
  process.exit(1);
}

processSuccessfulPayment(orderId)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
