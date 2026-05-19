import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

// DELETE /api/admin/special-hours/[id] — remove a special hours override
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const override = await prisma.specialHoursOverride.findUnique({ where: { id } });
    if (!override) return errorResponse('Special hours override not found', 'NOT_FOUND', 404);

    await prisma.specialHoursOverride.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/admin/special-hours]', err);
    return errorResponse('Failed to delete special hours', 'INTERNAL_ERROR', 500);
  }
}
