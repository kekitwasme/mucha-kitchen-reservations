import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateTableSchema } from '@/lib/schemas';

function errorResponse(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ error, code, ...(details ? { details } : {}) }, { status });
}

// GET /api/tables/[id] — Get single table
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const table = await prisma.table.findUnique({ where: { id } });

    if (!table) {
      return errorResponse('Table not found', 'NOT_FOUND', 404);
    }

    return NextResponse.json({ table });
  } catch (err) {
    console.error('[GET /api/tables/[id]]', err);
    return errorResponse('Failed to fetch table', 'INTERNAL_ERROR', 500);
  }
}

// PATCH /api/tables/[id] — Update table
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // TODO: Add auth check — admin only
    const { id } = await params;
    const body = await request.json();
    const parsed = updateTableSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse('Invalid update data', 'VALIDATION_ERROR', 400, parsed.error.flatten());
    }

    const existing = await prisma.table.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse('Table not found', 'NOT_FOUND', 404);
    }

    const table = await prisma.table.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json({ table });
  } catch (err) {
    console.error('[PATCH /api/tables/[id]]', err);
    return errorResponse('Failed to update table', 'INTERNAL_ERROR', 500);
  }
}

// DELETE /api/tables/[id] — Soft delete (set active=false)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // TODO: Add auth check — admin only
    const { id } = await params;

    const existing = await prisma.table.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse('Table not found', 'NOT_FOUND', 404);
    }

    await prisma.table.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/tables/[id]]', err);
    return errorResponse('Failed to delete table', 'INTERNAL_ERROR', 500);
  }
}