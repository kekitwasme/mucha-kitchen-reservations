const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function test() {
  const email = 'admin@mucha.kitchen';
  const password = 'demo123';
  
  // 1. Check if user exists
  const user = await prisma.staffUser.findFirst({
    where: { userId: email, active: true },
    include: { restaurant: true }
  });
  console.log('User found:', !!user);
  if (user) {
    console.log('User role:', user.role);
    console.log('User restaurantId:', user.restaurantId);
  }
  
  // 2. Test bcrypt compare
  try {
    const valid = await bcrypt.compare(password, (user?.userId || '') + 'salt');
    console.log('Bcrypt compare result:', valid);
  } catch (e) {
    console.log('Bcrypt error:', e.message);
  }
  
  // 3. Test demo fallback
  console.log('Demo fallback would pass:', password === 'demo123');
  
  // 4. Show what authorize returns
  if (user) {
    console.log('Authorize would return:', {
      id: user.userId,
      email: user.userId,
      name: user.userId,
      role: user.role,
      restaurantId: user.restaurantId
    });
  }
}

test().catch(console.error).finally(() => prisma.$disconnect());
