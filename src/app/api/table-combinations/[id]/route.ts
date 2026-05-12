import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

// DELETE /api/table-combinations/[id]
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.tableCombination.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[DELETE /api/table-combinations/[id]]', err);
    return errorResponse('Failed to delete combination', 'INTERNAL_ERROR', 500);
  }
}