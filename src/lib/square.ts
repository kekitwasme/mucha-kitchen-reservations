import { SquareClient, SquareEnvironment, WebhooksHelper } from 'square';

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

// Webhook signature verification using Square SDK
// Square signs with HMAC-SHA256 using: signatureKey + notificationUrl + requestBody
export async function verifySquareWebhookSignature(
  body: string,
  signature: string,
  signatureKey: string
): Promise<boolean> {
  try {
    const notificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://restaurant-reservation-two-theta.vercel.app'}/api/webhooks/square`;
    return await WebhooksHelper.verifySignature({
      requestBody: body,
      signatureHeader: signature,
      signatureKey,
      notificationUrl,
    });
  } catch {
    console.warn('[Square Webhook] Signature verification failed');
    return false;
  }
}