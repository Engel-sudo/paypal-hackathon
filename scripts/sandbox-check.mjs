// Checks the PayPal sandbox connection step by step, without starting the app.
//
//   npm run sandbox:check                               # login, Transaction Search, Invoicing (read only)
//   npm run sandbox:check -- --invoice buyer@example.com   # also creates and sends a $1 test invoice
//
// Reads PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET from the environment or from a .env file.
import { SandboxPayPal } from '../src/paypal/sandbox.js';

try { process.loadEnvFile?.(); } catch { /* no .env file */ }
const { PAYPAL_CLIENT_ID: clientId, PAYPAL_CLIENT_SECRET: clientSecret, PAYPAL_API_BASE } = process.env;
if (!clientId || !clientSecret) {
  console.error('Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET first (copy .env.example to .env and fill it in).');
  process.exit(2);
}
const at = process.argv.indexOf('--invoice');
const invoiceTo = at > -1 ? process.argv[at + 1] : null;
if (at > -1 && !/^\S+@\S+\.\S+$/.test(invoiceTo || '')) {
  console.error('--invoice needs an email address, ideally a sandbox personal account, e.g. --invoice sb-abc123@personal.example.com');
  process.exit(2);
}

const paypal = new SandboxPayPal({ clientId, clientSecret, baseUrl: PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com' });
console.log(`PayPal API: ${paypal.baseUrl}\n`);
let failed = 0;
async function step(name, fn) {
  try {
    console.log(`PASS  ${name}: ${await fn()}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}

await step('Log in with the app keys', async () => { await paypal.accessToken(); return 'got an access token'; });
if (!failed) {
  await step('Transaction Search (payments of the last 30 days)', async () => {
    const list = await paypal.listTransactions({ start: new Date(Date.now() - 30 * 86_400_000), end: new Date() });
    return `${list.length} incoming payment${list.length === 1 ? '' : 's'}${list.length ? `, newest note: "${list.at(-1).note || '(none)'}"` : ' (new payments can take a few hours to show up)'}`;
  });
  await step('Invoicing (list invoices)', async () => `${(await paypal.listInvoices()).length} invoices on the account`);
  if (invoiceTo) {
    await step(`Invoicing (create and send a $1 invoice to ${invoiceTo})`, async () => {
      const inv = await paypal.createAndSendInvoice({
        member: { id: 'sandbox-check', name: 'Sandbox Check', email: invoiceTo }, amount: 1, currency: 'USD',
        note: 'Test invoice from the Clubkeep sandbox check.', clubName: 'Clubkeep sandbox check', period: 'test',
      });
      return `sent ${inv.id}; look for it under Invoicing at sandbox.paypal.com (business account)`;
    });
  }
}
console.log(failed ? `\n${failed} step${failed === 1 ? '' : 's'} failed.` : '\nAll steps passed: Clubkeep can talk to this PayPal sandbox account.');
process.exit(failed ? 1 : 0);
