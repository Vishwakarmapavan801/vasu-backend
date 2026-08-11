const Stripe = require('stripe');
const pool = require('../../config/database');
const logger = require('../monitoring/logger');
const { captureException } = require('../monitoring/sentry');

let stripe = null;

function initStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    logger.warn('Stripe not configured — billing disabled');
    return false;
  }
  stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  logger.info('Stripe initialized');

  const priceIds = [
    { key: 'STRIPE_PRICE_BASIC_MONTHLY', label: 'Basic Monthly' },
    { key: 'STRIPE_PRICE_BASIC_YEARLY', label: 'Basic Yearly' },
    { key: 'STRIPE_PRICE_PRO_MONTHLY', label: 'Pro Monthly' },
    { key: 'STRIPE_PRICE_PRO_YEARLY', label: 'Pro Yearly' },
    { key: 'STRIPE_PRICE_ENTERPRISE_MONTHLY', label: 'Enterprise Monthly' },
    { key: 'STRIPE_PRICE_ENTERPRISE_YEARLY', label: 'Enterprise Yearly' },
  ];
  const missing = priceIds.filter((p) => !process.env[p.key]);
  if (missing.length > 0) {
    logger.warn('Stripe price IDs not configured', {
      missing: missing.map((p) => p.label),
      detail: `${missing.length} of ${priceIds.length} price IDs are missing — subscription features may be limited`,
    });
  }

  return true;
}

const PLANS = {
  basic: { price_monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY, price_yearly: process.env.STRIPE_PRICE_BASIC_YEARLY },
  pro: { price_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY, price_yearly: process.env.STRIPE_PRICE_PRO_YEARLY },
  enterprise: { price_monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY, price_yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY },
};

async function createCustomer(user) {
  if (!stripe) return null;
  try {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || user.email,
      metadata: { user_id: user.id },
    });
    await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customer.id, user.id]);
    return customer;
  } catch (err) {
    captureException(err, { extra: { userId: user.id } });
    throw err;
  }
}

async function getOrCreateCustomer(user) {
  if (!stripe) return null;
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const customer = await createCustomer(user);
  return customer.id;
}

async function createSubscription(user, priceId, { trialDays = 0, promoCode } = {}) {
  if (!stripe) return { id: 'simulated', status: 'active' };

  const customerId = await getOrCreateCustomer(user);

  const subscriptionParams = {
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent'],
    metadata: { user_id: user.id },
  };

  if (trialDays > 0) subscriptionParams.trial_period_days = trialDays;
  if (promoCode) subscriptionParams.promotion_code = promoCode;

  const subscription = await stripe.subscriptions.create(subscriptionParams);
  logger.info(`Subscription created for user ${user.id}`, { subscriptionId: subscription.id });

  return {
    id: subscription.id,
    clientSecret: subscription.latest_invoice?.payment_intent?.client_secret,
    status: subscription.status,
  };
}

async function cancelSubscription(subscriptionId) {
  if (!stripe) return { id: 'simulated', status: 'canceled' };

  const subscription = await stripe.subscriptions.cancel(subscriptionId);
  logger.info(`Subscription canceled`, { subscriptionId });
  return { id: subscription.id, status: subscription.status };
}

async function updateSubscription(subscriptionId, newPriceId) {
  if (!stripe) return { id: 'simulated', status: 'updated' };

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const item = subscription.items.data[0];

  await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: item.id, price: newPriceId }],
    proration_behavior: 'create_prorations',
  });

  logger.info(`Subscription updated`, { subscriptionId, newPriceId });
  return { id: subscriptionId, status: 'updated' };
}

async function createCheckoutSession(user, priceId, { successUrl, cancelUrl, trialDays = 0 } = {}) {
  if (!stripe) return { url: `${process.env.CLIENT_URL}/agent/billing?simulated=true` };

  const customerId = await getOrCreateCustomer(user);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl || `${process.env.CLIENT_URL}/agent/billing?success=true`,
    cancel_url: cancelUrl || `${process.env.CLIENT_URL}/agent/billing?canceled=true`,
    subscription_data: {
      trial_period_days: trialDays || undefined,
      metadata: { user_id: user.id },
    },
    metadata: { user_id: user.id },
  });

  return { url: session.url, sessionId: session.id };
}

async function createPaymentIntent(amount, currency = 'usd', metadata = {}) {
  if (!stripe) return { id: 'simulated', clientSecret: 'simulated_secret' };

  const intent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency,
    metadata,
    automatic_payment_methods: { enabled: true },
  });

  return { id: intent.id, clientSecret: intent.client_secret };
}

async function getInvoices(customerId, limit = 12) {
  if (!stripe) return [];

  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit,
  });

  return invoices.data.map(inv => ({
    id: inv.id,
    number: inv.number,
    amount_paid: inv.amount_paid / 100,
    currency: inv.currency,
    status: inv.status,
    pdf_url: inv.invoice_pdf,
    hosted_url: inv.hosted_invoice_url,
    created: new Date(inv.created * 1000).toISOString(),
    paid: inv.paid,
  }));
}

async function handleWebhook(req, sig) {
  if (!stripe) return null;

  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret) {
    logger.warn('Stripe webhook secret not configured');
    return null;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    logger.error('Stripe webhook signature verification failed', { error: err.message });
    throw err;
  }

  const handler = WEBHOOK_HANDLERS[event.type];
  if (handler) {
    await handler(event.data.object);
  }

  return event;
}

const WEBHOOK_HANDLERS = {
  async 'customer.subscription.updated'(subscription) {
    const userId = subscription.metadata?.user_id;
    if (!userId) return;
    const status = subscription.status;
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    const cancelAtPeriodEnd = subscription.cancel_at_period_end;

    await pool.query(
      `UPDATE agent_subscriptions SET status = $1, current_period_end = $2, updated_at = NOW()
       WHERE agent_id = (SELECT id FROM agents WHERE user_id = $3)
       AND status != 'cancelled'`,
      [status === 'active' && cancelAtPeriodEnd ? 'cancel_at_period_end' : status, currentPeriodEnd, userId]
    );
  },

  async 'customer.subscription.deleted'(subscription) {
    const userId = subscription.metadata?.user_id;
    if (!userId) return;
    await pool.query(
      `UPDATE agent_subscriptions SET status = 'cancelled', canceled_at = NOW(), updated_at = NOW()
       WHERE agent_id = (SELECT id FROM agents WHERE user_id = $1)`,
      [userId]
    );
  },

  async 'invoice.payment_succeeded'(invoice) {
    const userId = invoice.subscription_details?.metadata?.user_id || invoice.metadata?.user_id;
    if (!userId) return;

    // Store invoice record
    await pool.query(
      `INSERT INTO billing_invoices (stripe_invoice_id, user_id, amount, currency, status, invoice_url, invoice_pdf, created_at)
       VALUES ($1, $2, $3, $4, 'paid', $5, $6, to_timestamp($7))
       ON CONFLICT (stripe_invoice_id) DO NOTHING`,
      [invoice.id, userId, invoice.amount_paid / 100, invoice.currency,
       invoice.hosted_invoice_url, invoice.invoice_pdf, invoice.created]
    );
  },

  async 'invoice.payment_failed'(invoice) {
    const userId = invoice.subscription_details?.metadata?.user_id || invoice.metadata?.user_id;
    if (!userId) return;

    await pool.query(
      `INSERT INTO billing_events (user_id, event_type, data, created_at)
       VALUES ($1, 'payment_failed', $2, NOW())`,
      [userId, JSON.stringify({ invoice_id: invoice.id, amount: invoice.amount_due / 100, attempt_count: invoice.attempt_count })]
    );
  },
};

module.exports = {
  initStripe, createCustomer, getOrCreateCustomer,
  createSubscription, cancelSubscription, updateSubscription,
  createCheckoutSession, createPaymentIntent, getInvoices,
  handleWebhook,
};
