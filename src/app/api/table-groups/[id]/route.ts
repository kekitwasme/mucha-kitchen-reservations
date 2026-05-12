import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

const patchSchema = z.object({
  name: z.string().optional(),
  active: z.boolean().optional(),
  tableIds: z.array(z.string()).min(2).optional(),
});

// PATCH /api/table-groups/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Invalid data', 'VALIDATION_ERROR', 400);
    }

    const { name, active, tableIds } = parsed.data;

    // Check group exists
    const existing = await prisma.tableGroup.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse('Table group not found', 'NOT_FOUND', 404);
    }

    // If tableIds provided, replace members
    if (tableIds) {
      const uniqueIds = [...new Set(tableIds)];

      const tables = await prisma.table.findMany({
        where: { id: { in: uniqueIds } },
      });

      if (tables.length !== uniqueIds.length) {
        return errorResponse('One or more tables not found', 'NOT_FOUND', 404);
      }

      const combinedCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);
      const groupName = name || tables.map((t) => t.name).sort().join('+');

      // Delete old members and create new ones in a transaction
      await prisma.tableGroupMember.deleteMany({ where: { groupId: id } });

      const group = await prisma.tableGroup.update({
        where: { id },
        data: {
          name: groupName,
          combinedCapacity,
          active: active ?? existing.active,
          groupMembers: {
            create: uniqueIds.map((tableId, index) => ({
              tableId,
              sortOrder: index,
            })),
          },
        },
        include: {
          groupMembers: {
            include: { table: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      return NextResponse.json({ group });
    }

    // Simple update (name/active only)
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (active !== undefined) updateData.active = active;

    const group = await prisma.tableGroup.update({
      where: { id },
      data: updateData,
      include: {
        groupMembers: {
          include: { table: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return NextResponse.json({ group });
  } catch (err) {
    console.error('[PATCH /api/table-groups/[id]]', err);
    return errorResponse('Failed to update table group', 'INTERNAL_ERROR', 500);
  }
}

// DELETE /api/table-groups/[id]
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.tableGroup.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[DELETE /api/table-groups/[id]]', err);
    return errorResponse('Failed to delete table group', 'INTERNAL_ERROR', 500);
  }
}