import { PrismaClient, TableShape, TableArea } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'Demo Restaurant',
      slug: 'demo-restaurant',
      timezone: 'Australia/Perth',
      openingHours: {
        monday: { open: '11:00', close: '22:00' },
        tuesday: { open: '11:00', close: '22:00' },
        wednesday: { open: '11:00', close: '22:00' },
        thursday: { open: '11:00', close: '22:00' },
        friday: { open: '11:00', close: '23:00' },
        saturday: { open: '10:00', close: '23:00' },
        sunday: { open: '10:00', close: '21:00' },
      },
      turnTimeRules: {
        '1-2': 90,
        '3-4': 105,
        '5-6': 120,
        '7+': 150,
      },
      maxPartySize: 20,
      bookingWindowDays: 30,
      depositRules: undefined,
      smsReminderMinutes: 60,
    },
  });

  const tables = [
    { name: 'T1', capacity: 2, shape: TableShape.square, area: TableArea.indoor, x: 50, y: 50, width: 60, height: 60 },
    { name: 'T2', capacity: 2, shape: TableShape.square, area: TableArea.indoor, x: 120, y: 50, width: 60, height: 60 },
    { name: 'T3', capacity: 4, shape: TableShape.square, area: TableArea.indoor, x: 200, y: 50, width: 70, height: 70 },
    { name: 'T4', capacity: 4, shape: TableShape.booth, area: TableArea.indoor, x: 280, y: 50, width: 90, height: 60 },
    { name: 'T5', capacity: 6, shape: TableShape.square, area: TableArea.outdoor, x: 50, y: 150, width: 80, height: 60 },
    { name: 'T6', capacity: 8, shape: TableShape.square, area: TableArea.outdoor, x: 150, y: 150, width: 100, height: 70 },
    { name: 'Bar1', capacity: 2, shape: TableShape.square, area: TableArea.bar, x: 50, y: 250, width: 40, height: 40 },
    { name: 'Bar2', capacity: 2, shape: TableShape.square, area: TableArea.bar, x: 100, y: 250, width: 40, height: 40 },
    { name: 'PR1', capacity: 10, shape: TableShape.square, area: TableArea.private_room, x: 300, y: 200, width: 120, height: 80 },
  ];

  for (const t of tables) {
    await prisma.table.create({
      data: { ...t, restaurantId: restaurant.id, active: true },
    });
  }

  // Seed availability rules
  const days = [0, 1, 2, 3, 4, 5, 6];
  for (const day of days) {
    const isWeekend = day === 0 || day === 5 || day === 6;
    const open = isWeekend ? '10:00' : '11:00';
    const close = day === 0 || day === 6 ? '21:00' : day === 5 ? '23:00' : '22:00';
    await prisma.availabilityRule.create({
      data: {
        restaurantId: restaurant.id,
        dayOfWeek: day,
        startTime: open,
        endTime: close,
        slotInterval: 15,
        maxCovers: 100,
      },
    });
  }

  console.log(`Seeded ${tables.length} tables + availability rules for ${restaurant.name}`);

  // Seed a demo staff user for login
  const existingUser = await prisma.staffUser.findFirst({
    where: { userId: 'staff@demo.com' },
  });
  if (!existingUser) {
    await prisma.staffUser.create({
      data: {
        restaurantId: restaurant.id,
        userId: 'staff@demo.com',
        role: 'staff',
        active: true,
      },
    });
    console.log('Created demo staff user: staff@demo.com / demo123');
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
