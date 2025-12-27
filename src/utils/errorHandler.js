/**
 * Centralized error handling utilities
 */

/**
 * Check if error is a database connection error
 * @param {Error} error - The error to check
 * @returns {boolean} - True if it's a connection error
 */
function isDatabaseConnectionError(error) {
  return (
    error.name === 'PrismaClientInitializationError' ||
    error.name === 'PrismaClientKnownRequestError' ||
    error.message?.includes("Can't reach database server") ||
    error.message?.includes('Connection refused') ||
    error.message?.includes('timeout') ||
    error.code === 'P1001' || // Connection error
    error.code === 'P1008' || // Timeout
    error.code === 'P1017'    // Server closed connection
  );
}

/**
 * Check if error is a network/internet connectivity issue
 * @param {Error} error - The error to check
 * @returns {boolean} - True if it's a network error
 */
function isNetworkError(error) {
  return (
    error.code === 'ENOTFOUND' ||
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ECONNRESET' ||
    error.message?.includes('network') ||
    error.message?.includes('internet') ||
    error.message?.includes('DNS')
  );
}

/**
 * Handle database connection errors gracefully
 * @param {Error} error - The database error
 * @param {Object} res - Express response object
 * @param {string} operation - Description of the operation that failed
 */
function handleDatabaseError(error, res, operation = 'database operation') {
  console.error(`❌ Database error during ${operation}:`, {
    name: error.name,
    message: error.message,
    code: error.code,
    timestamp: new Date().toISOString()
  });

  if (isDatabaseConnectionError(error)) {
    return res.status(503).json({
      error: 'Database temporarily unavailable',
      message: 'Please check your internet connection and try again',
      code: 'DATABASE_CONNECTION_ERROR',
      retryAfter: 30 // seconds
    });
  }

  if (isNetworkError(error)) {
    return res.status(503).json({
      error: 'Network connectivity issue',
      message: 'Please check your internet connection and try again',
      code: 'NETWORK_ERROR',
      retryAfter: 30
    });
  }

  // Generic database error
  return res.status(500).json({
    error: 'Database operation failed',
    message: 'An unexpected database error occurred',
    code: 'DATABASE_ERROR'
  });
}

/**
 * Retry database operation with exponential backoff
 * @param {Function} operation - The async operation to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} - Result of the operation
 */
async function retryDatabaseOperation(operation, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (!isDatabaseConnectionError(error) && !isNetworkError(error)) {
        // If it's not a connection error, don't retry
        throw error;
      }
      
      if (attempt === maxRetries) {
        // Last attempt failed
        break;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
      console.warn(`⚠️ Database operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Wrap async route handlers with error handling
 * @param {Function} handler - The async route handler
 * @returns {Function} - Wrapped handler with error handling
 */
function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      console.error('❌ Unhandled error in route handler:', error);
      
      if (isDatabaseConnectionError(error) || isNetworkError(error)) {
        return handleDatabaseError(error, res, 'route handler');
      }
      
      // Generic error
      res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      });
    }
  };
}

module.exports = {
  isDatabaseConnectionError,
  isNetworkError,
  handleDatabaseError,
  retryDatabaseOperation,
  asyncHandler
};