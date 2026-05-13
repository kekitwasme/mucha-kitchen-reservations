import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Delete in order respecting foreign keys
  const models = [
    'payment', 'reservationTable', 'auditLog', 'reservation', 'table',
    'staffUser', 'availabilityRule', 'customer', 'webhookEvent', 'restaurant'
  ];
  
  for (const model of models) {
    try {
      // @ts-expect-error dynamic model access
      const result = await prisma[model].deleteMany();
      console.log(`Cleared ${model}: ${result.count} rows`);
    } catch (e) {
      console.log(`Skip ${model}: ${(e as Error).message}`);
    }
  }
  
  console.log('Done flushing');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });