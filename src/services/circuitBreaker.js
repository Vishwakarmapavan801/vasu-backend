const logger = require('./logger');

const STATES = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

const DEFAULTS = {
  failureThreshold: parseInt(process.env.JOTFORM_CB_FAILURE_THRESHOLD, 10) || 5,
  cooldownMs: parseInt(process.env.JOTFORM_CB_COOLDOWN_MS, 10) || 30000,
  halfOpenMaxRequests: parseInt(process.env.JOTFORM_CB_HALF_OPEN_MAX, 10) || 3,
  successThreshold: parseInt(process.env.JOTFORM_CB_SUCCESS_THRESHOLD, 10) || 2,
};

function createCircuitBreaker(options = {}) {
  const config = { ...DEFAULTS, ...options };
  let state = STATES.CLOSED;
  let failureCount = 0;
  let successCount = 0;
  let lastFailureTime = null;
  let lastSuccessTime = null;
  let openedAt = null;

  function getState() { return state; }

  function attempt() {
    if (state === STATES.OPEN) {
      const now = Date.now();
      if (now - openedAt >= config.cooldownMs) {
        logger.info('Circuit breaker transitioning to HALF_OPEN', { from: 'OPEN', to: 'HALF_OPEN' });
        state = STATES.HALF_OPEN;
        successCount = 0;
        return true;
      }
      return false;
    }
    return true;
  }

  function onSuccess() {
    lastSuccessTime = Date.now();
    if (state === STATES.HALF_OPEN) {
      successCount++;
      if (successCount >= config.successThreshold) {
        logger.info('Circuit breaker resetting to CLOSED', { from: 'HALF_OPEN', to: 'CLOSED' });
        state = STATES.CLOSED;
        failureCount = 0;
        successCount = 0;
      }
    } else if (state === STATES.CLOSED) {
      failureCount = 0;
    }
  }

  function onFailure() {
    lastFailureTime = Date.now();
    failureCount++;
    if (state === STATES.HALF_OPEN) {
      logger.warn('Circuit breaker reverting to OPEN from HALF_OPEN', { failureCount });
      state = STATES.OPEN;
      openedAt = Date.now();
      successCount = 0;
    } else if (state === STATES.CLOSED && failureCount >= config.failureThreshold) {
      logger.warn('Circuit breaker opening', { failureCount, threshold: config.failureThreshold });
      state = STATES.OPEN;
      openedAt = Date.now();
    }
  }

  function getStatus() {
    return {
      state,
      failureCount,
      successCount,
      failureThreshold: config.failureThreshold,
      cooldownMs: config.cooldownMs,
      lastSuccessTime: lastSuccessTime ? new Date(lastSuccessTime).toISOString() : null,
      lastFailureTime: lastFailureTime ? new Date(lastFailureTime).toISOString() : null,
      openedAt: openedAt ? new Date(openedAt).toISOString() : null,
      remainingCooldown: openedAt ? Math.max(0, config.cooldownMs - (Date.now() - openedAt)) : 0,
    };
  }

  function reset() {
    state = STATES.CLOSED;
    failureCount = 0;
    successCount = 0;
    lastFailureTime = null;
    lastSuccessTime = null;
    openedAt = null;
  }

  return { getState, attempt, onSuccess, onFailure, getStatus, reset };
}

module.exports = { createCircuitBreaker, STATES };
