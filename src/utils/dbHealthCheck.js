const { PrismaClient } = require('@prisma/client');
const { isDatabaseConnectionError, isNetworkError } = require('./errorHandler');

let prismaInstance = null;
let lastHealthCheck = null;
let isHealthy = false;

/**
 * Get or create Prisma client instance
 */
function getPrismaClient() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      log: ['error', 'warn'],
      errorFormat: 'minimal'
    });
  }
  return prismaInstance;
}

/**
 * Check database connectivity
 * @returns {Promise<{healthy: boolean, error?: string, latency?: number}>}
 */
async function checkDatabaseHealth() {
  const startTime = Date.now();
  
  try {
    const prisma = getPrismaClient();
    
    // Simple query to check connectivity
    await prisma.$queryRaw`SELECT 1`;
    
    const latency = Date.now() - startTime;
    isHealthy = true;
    lastHealthCheck = new Date();
    
    return {
      healthy: true,
      latency,
      lastCheck: lastHealthCheck
    };
  } catch (error) {
    isHealthy = false;
    lastHealthCheck = new Date();
    
    console.error('❌ Database health check failed:', {
      error: error.message,
      code: error.code,
      name: error.name,
      timestamp: lastHealthCheck.toISOString()
    });
    
    return {
      healthy: false,
      error: error.message,
      code: error.code,
      lastCheck: lastHealthCheck,
      isConnectionError: isDatabaseConnectionError(error),
      isNetworkError: isNetworkError(error)
    };
  }
}

/**
 * Get cached health status (doesn't perform new check)
 */
function getCachedHealthStatus() {
  return {
    healthy: isHealthy,
    lastCheck: lastHealthCheck,
    cacheAge: lastHealthCheck ? Date.now() - lastHealthCheck.getTime() : null
  };
}

/**
 * Middleware to check database health before processing requests
 */
function healthCheckMiddleware(req, res, next) {
  // Skip health check for health endpoint itself
  if (req.path === '/health' || req.path === '/api/health') {
    return next();
  }
  
  const cached = getCachedHealthStatus();
  
  // If we have a recent successful health check (within 30 seconds), proceed
  if (cached.healthy && cached.cacheAge && cached.cacheAge < 30000) {
    return next();
  }
  
  // If we know the database is unhealthy and it's been less than 5 minutes, return error immediately
  if (!cached.healthy && cached.cacheAge && cached.cacheAge < 300000) {
    return res.status(503).json({
      error: 'Database temporarily unavailable',
      message: 'Please check your internet connection and try again',
      code: 'DATABASE_UNAVAILABLE',
      retryAfter: 30
    });
  }
  
  // Otherwise, proceed (let individual operations handle their own errors)
  next();
}

/**
 * Start periodic health checks
 */
function startHealthMonitoring(intervalMs = 60000) {
  console.log('🏥 Starting database health monitoring...');
  
  // Initial health check
  checkDatabaseHealth().then(result => {
    if (result.healthy) {
      console.log('✅ Database connection healthy');
    } else {
      console.log('❌ Database connection unhealthy');
    }
  });
  
  // Periodic health checks
  setInterval(async () => {
    const result = await checkDatabaseHealth();
    if (!result.healthy) {
      console.warn('⚠️ Database health check failed - connection may be unstable');
    }
  }, intervalMs);
}

/**
 * Gracefully disconnect from database
 */
async function disconnectDatabase() {
  if (prismaInstance) {
    try {
      await prismaInstance.$disconnect();
      console.log('📊 Database connection closed gracefully');
    } catch (error) {
      console.error('❌ Error disconnecting from database:', error);
    }
  }
}

module.exports = {
  checkDatabaseHealth,
  getCachedHealthStatus,
  healthCheckMiddleware,
  startHealthMonitoring,
  disconnectDatabase,
  getPrismaClient
};