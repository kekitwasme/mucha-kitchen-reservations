import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const RESTAURANT_ID = process.env.RESTAURANT_ID || '';

function errorResponse(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ error, code, ...(details ? { details } : {}) }, { status });
}

const createSchema = z.object({
  type: z.string(),
  label: z.string(),
  x: z.number().optional().default(0),
  y: z.number().optional().default(0),
  width: z.number().optional().default(80),
  height: z.number().optional().default(40),
  rotation: z.number().optional().default(0),
  color: z.string().optional().default('#94a3b8'),
  opacity: z.number().optional().default(0.3),
  zIndex: z.number().optional().default(0),
});

// GET /api/floor-objects
export async function GET() {
  try {
    const objects = await prisma.floorObject.findMany({
      where: RESTAURANT_ID ? { restaurantId: RESTAURANT_ID } : {},
      orderBy: [{ zIndex: 'asc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json({ objects });
  } catch (err) {
    console.error('[GET /api/floor-objects]', err);
    return errorResponse('Failed to fetch floor objects', 'INTERNAL_ERROR', 500);
  }
}

// POST /api/floor-objects
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Invalid data', 'VALIDATION_ERROR', 400, parsed.error.flatten());
    }

    const obj = await prisma.floorObject.create({
      data: {
        ...parsed.data,
        restaurantId: RESTAURANT_ID || (await prisma.restaurant.findFirst())!.id,
      },
    });

    return NextResponse.json({ object: obj }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/floor-objects]', err);
    return errorResponse('Failed to create floor object', 'INTERNAL_ERROR', 500);
  }
}