import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateSettingsSchema } from '@/lib/schemas';

const RESTAURANT_ID = process.env.RESTAURANT_ID || '';

function errorResponse(error: string, code: string, status: number, details?: unknown) {
  return NextResponse.json({ error, code, ...(details ? { details } : {}) }, { status });
}

// GET /api/admin/settings — Get current restaurant config
export async function GET() {
  try {
    const restaurant = RESTAURANT_ID
      ? await prisma.restaurant.findUnique({ where: { id: RESTAURANT_ID } })
      : await prisma.restaurant.findFirst();

    if (!restaurant) {
      return errorResponse('Restaurant not found', 'NOT_FOUND', 404);
    }

    return NextResponse.json({
      settings: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        address: restaurant.address,
        phone: restaurant.phone,
        email: restaurant.email,
        timezone: restaurant.timezone,
        openingHours: restaurant.openingHours,
        turnTimeRules: restaurant.turnTimeRules,
        maxPartySize: restaurant.maxPartySize,
        bookingWindowDays: restaurant.bookingWindowDays,
        depositRules: restaurant.depositRules,
        smsReminderMinutes: restaurant.smsReminderMinutes,
        squareLocationId: restaurant.squareLocationId,
        active: restaurant.active,
        createdAt: restaurant.createdAt.toISOString(),
        updatedAt: restaurant.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[GET /api/admin/settings]', err);
    return errorResponse('Failed to fetch settings', 'INTERNAL_ERROR', 500);
  }
}

// PATCH /api/admin/settings — Update restaurant config
export async function PATCH(request: NextRequest) {
  try {
    // TODO: Add auth check — admin only
    const body = await request.json();
    const parsed = updateSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse('Invalid settings data', 'VALIDATION_ERROR', 400, parsed.error.flatten());
    }

    const restaurant = RESTAURANT_ID
      ? await prisma.restaurant.findUnique({ where: { id: RESTAURANT_ID } })
      : await prisma.restaurant.findFirst();

    if (!restaurant) {
      return errorResponse('Restaurant not found', 'NOT_FOUND', 404);
    }

    const data = parsed.data;

    // Build update object — only include fields that were provided
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.openingHours !== undefined) updateData.openingHours = data.openingHours;
    if (data.turnTimeRules !== undefined) updateData.turnTimeRules = data.turnTimeRules;
    if (data.maxPartySize !== undefined) updateData.maxPartySize = data.maxPartySize;
    if (data.bookingWindowDays !== undefined) updateData.bookingWindowDays = data.bookingWindowDays;
    if (data.depositRules !== undefined) updateData.depositRules = data.depositRules;
    if (data.smsReminderMinutes !== undefined) updateData.smsReminderMinutes = data.smsReminderMinutes;

    if (Object.keys(updateData).length === 0) {
      return errorResponse('No fields to update', 'VALIDATION_ERROR', 400);
    }

    const updated = await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: updateData,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        restaurantId: restaurant.id,
        action: 'updated',
        details: { fields: Object.keys(updateData) },
      },
    });

    return NextResponse.json({
      settings: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        address: updated.address,
        phone: updated.phone,
        email: updated.email,
        timezone: updated.timezone,
        openingHours: updated.openingHours,
        turnTimeRules: updated.turnTimeRules,
        maxPartySize: updated.maxPartySize,
        bookingWindowDays: updated.bookingWindowDays,
        depositRules: updated.depositRules,
        smsReminderMinutes: updated.smsReminderMinutes,
        squareLocationId: updated.squareLocationId,
        active: updated.active,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[PATCH /api/admin/settings]', err);
    return errorResponse('Failed to update settings', 'INTERNAL_ERROR', 500);
  }
}