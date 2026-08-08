const db = require("../config/database");
const logger = require("../utils/logger");

const validateUserStatus = async (req, res, next) => {
  const userId = req.body.userId;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: "userId is required",
    });
  }

  try {
    const [results] = await db.execute(
      "SELECT status FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    if (results.length === 0) {
      logger.warn("UserStatus", "User not found", { userId });
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (results[0].status !== 1) {
      logger.warn("UserStatus", "User not active", { userId, status: results[0].status });
      return res.status(403).json({
        success: false,
        error: "Not allowed to recharge - user account is not active",
      });
    }

    next();
  } catch (err) {
    logger.logError("UserStatus", "Error validating user status", err);
    return res.status(500).json({
      success: false,
      error: "Error validating user status",
    });
  }
};

module.exports = {
  validateUserStatus,
};
