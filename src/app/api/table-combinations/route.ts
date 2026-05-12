import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const RESTAURANT_ID = process.env.RESTAURANT_ID || '';

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

const createSchema = z.object({
  tableAId: z.string(),
  tableBId: z.string(),
  combinedCapacity: z.number().int().min(1),
});

// GET /api/table-combinations
export async function GET() {
  try {
    const combinations = await prisma.tableCombination.findMany({
      where: RESTAURANT_ID ? { restaurantId: RESTAURANT_ID } : {},
      include: { tableA: true, tableB: true },
      orderBy: { id: 'asc' },
    });
    return NextResponse.json({ combinations });
  } catch (err) {
    console.error('[GET /api/table-combinations]', err);
    return errorResponse('Failed to fetch combinations', 'INTERNAL_ERROR', 500);
  }
}

// POST /api/table-combinations
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Invalid data', 'VALIDATION_ERROR', 400);
    }

    const { tableAId, tableBId, combinedCapacity } = parsed.data;

    if (tableAId === tableBId) {
      return errorResponse('Cannot combine a table with itself', 'VALIDATION_ERROR', 400);
    }

    // Check for existing combination (either direction)
    const existing = await prisma.tableCombination.findFirst({
      where: {
        OR: [
          { tableAId, tableBId },
          { tableAId: tableBId, tableBId: tableAId },
        ],
      },
    });
    if (existing) {
      return errorResponse('Combination already exists', 'DUPLICATE', 409);
    }

    const rid = RESTAURANT_ID || (await prisma.restaurant.findFirst())!.id;

    const combo = await prisma.tableCombination.create({
      data: { restaurantId: rid, tableAId, tableBId, combinedCapacity },
      include: { tableA: true, tableB: true },
    });

    return NextResponse.json({ combination: combo }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/table-combinations]', err);
    return errorResponse('Failed to create combination', 'INTERNAL_ERROR', 500);
  }
}