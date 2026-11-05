import { SandboxPayPal } from './sandbox.js';
import { MockPayPal } from './mock.js';

// Real sandbox client when both keys are set, otherwise the mock behind the same interface.
export function createPayPal(env = process.env) {
  if (env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET) {
    return new SandboxPayPal({
      clientId: env.PAYPAL_CLIENT_ID,
      clientSecret: env.PAYPAL_CLIENT_SECRET,
      baseUrl: env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com',
      webhookId: env.PAYPAL_WEBHOOK_ID,
    });
  }
  return new MockPayPal();
}
