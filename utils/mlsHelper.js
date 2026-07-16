/**
 * MLS Helper — tryMls
 *
 * Wraps an MLS API call and returns null if it fails,
 * allowing controllers to fail gracefully without falling back to fake data.
 * If MLS fails, the calling controller should return an error, not mock data.
 */

const logger = require('./logger');

/**
 * Attempt to call an MLS Grid API function.
 * Returns the result if successful, or null if the API call throws.
 *
 * @param {Function} mlsFn - The MLS service function to call
 * @param  {...any} args - Arguments to pass to the MLS function
 * @returns {Promise<*|null>} - MLS result or null on failure
 */
async function tryMls(mlsFn, ...args) {
  const startTime = Date.now();
  try {
    const result = await mlsFn(...args);
    const duration = Date.now() - startTime;
    logger.info(`MLS API call succeeded in ${duration}ms`, {
      functionName: mlsFn.name || 'anonymous',
      duration,
    });
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`MLS API call failed in ${duration}ms`, {
      functionName: mlsFn.name || 'anonymous',
      error: error.message,
      duration,
    });
    // Return null so controllers can handle the absence of MLS data
    // without falling back to fake/mock data
    return null;
  }
}

module.exports = { tryMls };
