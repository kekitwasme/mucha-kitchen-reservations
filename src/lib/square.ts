import { SquareClient, SquareEnvironment } from 'square';

// Square SDK client singleton
const globalForSquare = globalThis as unknown as { squareClient: SquareClient };

function createSquareClient(): SquareClient {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN || '';
  const environment = process.env.SQUARE_ENVIRONMENT === 'production'
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox;

  return new SquareClient({
    token: accessToken,
    environment,
  });
}

// Always create fresh client to pick up env changes in dev
export const squareClient = process.env.NODE_ENV === 'production'
  ? (globalForSquare.squareClient || createSquareClient())
  : createSquareClient();

if (process.env.NODE_ENV === 'production') {
  globalForSquare.squareClient = squareClient;
}

// Webhook signature verification helper
export function verifySquareWebhookSignature(
  body: string,
  signature: string,
  webhookSecret: string
): boolean {
  try {
    const crypto = require('crypto');
    const hash = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('base64');
    return hash === signature;
  } catch {
    console.warn('[Square Webhook] Signature verification skipped — missing config');
    return false;
  }
}