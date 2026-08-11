const stripeService = require('../../services/billing/stripeService');
const logger = require('../../services/monitoring/logger');

module.exports = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  try {
    const event = await stripeService.handleWebhook(req, sig);
    if (event) {
      logger.info('Stripe webhook processed', { type: event.type });
    }
    res.json({ received: true });
  } catch (err) {
    logger.error('Stripe webhook error', { error: err.message });
    res.status(400).json({ error: 'Webhook error' });
  }
};
