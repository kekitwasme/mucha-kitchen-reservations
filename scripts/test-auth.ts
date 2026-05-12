import { prisma } from '../src/lib/prisma';
import { compare } from 'bcryptjs';

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
    const valid = await compare(password, user?.userId + 'salt' || '');
    console.log('Bcrypt compare result:', valid);
  } catch (e) {
    console.log('Bcrypt error:', (e as Error).message);
  }
  
  // 3. Test demo fallback
  console.log('Demo fallback would pass:', password === 'demo123');
}

test().catch(console.error).finally(() => prisma.$disconnect());
