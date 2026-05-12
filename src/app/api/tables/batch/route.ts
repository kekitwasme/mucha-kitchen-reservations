import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const batchUpdateSchema = z.object({
  tables: z.array(
    z.object({
      id: z.string(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      rotation: z.number().optional(),
    })
  ),
});

function errorResponse(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ error, code, ...(details ? { details } : {}) }, { status });
}

// POST /api/tables/batch — Update multiple table positions/sizes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = batchUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Invalid batch data', 'VALIDATION_ERROR', 400, parsed.error.flatten());
    }

    const { tables } = parsed.data;

    const results = await prisma.$transaction(
      tables.map((t) =>
        prisma.table.update({
          where: { id: t.id },
          data: {
            ...(t.x !== undefined ? { x: t.x } : {}),
            ...(t.y !== undefined ? { y: t.y } : {}),
            ...(t.width !== undefined ? { width: t.width } : {}),
            ...(t.height !== undefined ? { height: t.height } : {}),
            ...(t.rotation !== undefined ? { rotation: t.rotation } : {}),
          },
        })
      )
    );

    return NextResponse.json({ updated: results.length });
  } catch (err) {
    console.error('[POST /api/tables/batch]', err);
    return errorResponse('Failed to update tables', 'INTERNAL_ERROR', 500);
  }
}
