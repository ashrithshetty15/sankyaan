/**
 * Rate Limiter Utility
 *
 * Provides configurable rate limiting and retry logic with exponential backoff
 */

export class RateLimiter {
  constructor(requestsPerSecond = 1) {
    this.delay = 1000 / requestsPerSecond;
    this.lastRequestTime = 0;
  }

  /**
   * Throttle execution to respect rate limits
   */
  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.delay) {
      const waitTime = this.delay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Execute a function with rate limiting and automatic retry on failure
   *
   * @param {Function} fn - Function to execute
   * @param {number} maxRetries - Maximum number of retry attempts
   * @returns {Promise} Result of the function execution
   */
  async executeWithRetry(fn, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.throttle();
        return await fn();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff: 2s, 4s, 8s, etc.
        const backoffDelay = Math.pow(2, attempt) * 1000;
        console.log(`  Retry ${attempt}/${maxRetries} after ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }
}
