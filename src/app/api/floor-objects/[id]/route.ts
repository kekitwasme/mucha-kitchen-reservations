import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  rotation: z.number().optional(),
  color: z.string().optional(),
  label: z.string().optional(),
  opacity: z.number().optional(),
  zIndex: z.number().optional(),
});

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

// PATCH /api/floor-objects/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Invalid data', 'VALIDATION_ERROR', 400);
    }

    const obj = await prisma.floorObject.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json({ object: obj });
  } catch (err) {
    console.error('[PATCH /api/floor-objects/[id]]', err);
    return errorResponse('Failed to update floor object', 'INTERNAL_ERROR', 500);
  }
}

// DELETE /api/floor-objects/[id]
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.floorObject.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[DELETE /api/floor-objects/[id]]', err);
    return errorResponse('Failed to delete floor object', 'INTERNAL_ERROR', 500);
  }
}