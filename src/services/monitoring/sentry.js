const Sentry = require('@sentry/node');

let nodeProfilingIntegration;
try {
  nodeProfilingIntegration = require('@sentry/profiling-node').nodeProfilingIntegration;
} catch {
  // Profiling native binary unavailable — skipping (non-fatal)
}

function initSentry(app) {
  if (!process.env.SENTRY_DSN) {
    console.warn('Sentry DSN not configured — skipping Sentry initialization');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    integrations: [
      ...(nodeProfilingIntegration ? [nodeProfilingIntegration()] : []),
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    maxBreadcrumbs: 50,
    attachStacktrace: true,
    release: process.env.RELEASE_VERSION || '1.0.0',
    beforeSend(event) {
      if (event.request?.url) {
        const url = new URL(event.request.url);
        if (url.pathname.match(/^\/(health|healthz|readyz)/)) return null;
      }
      return event;
    },
  });

  // Request handler must be first middleware
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());

  // Error handler must be last middleware
  app.use(Sentry.Handlers.errorHandler());
}

function captureException(error, context = {}) {
  if (process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      if (context.user) scope.setUser({ id: context.user.id, email: context.user.email });
      if (context.extra) scope.setExtras(context.extra);
      if (context.tags) scope.setTags(context.tags);
      Sentry.captureException(error);
    });
  } else {
    console.error('Unhandled error:', error.message);
  }
}

function captureMessage(message, level = 'info', context = {}) {
  if (process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      if (context.extra) scope.setExtras(context.extra);
      scope.setLevel(level);
      Sentry.captureMessage(message);
    });
  }
}

module.exports = { initSentry, captureException, captureMessage };
