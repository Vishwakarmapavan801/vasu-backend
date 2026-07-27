const logger = require('./logger');

const counters = {
  submissionsAttempted: 0,
  submissionsSucceeded: 0,
  submissionsFailed: 0,
  submissionsRetried: 0,
  submissionsDeadLettered: 0,
  captchaVerified: 0,
  captchaFailed: 0,
  circuitBreakerOpened: 0,
  circuitBreakerClosed: 0,
};

const timings = [];
const MAX_TIMINGS = 1000;

const formTypeCounters = {};

function increment(name, formType) {
  if (counters[name] !== undefined) counters[name]++;
  if (formType) {
    if (!formTypeCounters[formType]) formTypeCounters[formType] = { attempted: 0, succeeded: 0, failed: 0 };
    if (name === 'submissionsAttempted') formTypeCounters[formType].attempted++;
    if (name === 'submissionsSucceeded') formTypeCounters[formType].succeeded++;
    if (name === 'submissionsFailed') formTypeCounters[formType].failed++;
  }
}

function recordTiming(durationMs) {
  timings.push(durationMs);
  if (timings.length > MAX_TIMINGS) timings.shift();
}

function getAverageTiming() {
  if (timings.length === 0) return 0;
  const sum = timings.reduce((a, b) => a + b, 0);
  return Math.round(sum / timings.length);
  }

function getSnapshot(queueSize = 0, pendingSyncCount = 0) {
  const attempted = counters.submissionsAttempted || 1;
  const successRate = Math.round(((counters.submissionsSucceeded / attempted) * 100) * 100) / 100;
  const failureRate = Math.round(((counters.submissionsFailed / attempted) * 100) * 100) / 100;

  return {
    counters: { ...counters },
    rates: {
      successRate: `${successRate}%`,
      failureRate: `${failureRate}%`,
    },
    averageResponseTimeMs: getAverageTiming(),
    queueSize,
    pendingSyncCount,
    formTypeBreakdown: { ...formTypeCounters },
  };
}

function getFormTypeCounters() {
  return { ...formTypeCounters };
}

module.exports = {
  increment,
  recordTiming,
  getSnapshot,
  getFormTypeCounters,
};
