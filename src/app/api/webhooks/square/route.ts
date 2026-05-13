import { NextRequest, NextResponse } from 'next/server';
import { verifySquareWebhookSignature } from '@/lib/square';
import { prisma } from '@/lib/prisma';
import { fetchSquareCustomer } from '@/lib/square-adapter';
import { assignTables } from '@/lib/table-assignment';
import { getTurnTime, toDateOnly } from '@/lib/utils';
import type { ReservationStatus, PaymentStatus, ReservationSource } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SquareBookingData {
  id: string;
  status?: string;
  start_at?: string;
  location_id?: string;
  customer_id?: string;
  appointment_segments?: Array<{
    service_variation_id?: string;
    team_member_id?: string;
    duration_minutes?: number;
    service_variation_version?: number;
  }>;
  seller_note?: string;
  customer_note?: string;
}

interface SquareWebhookData {
  type: string;
  id: string;
  object: {
    booking?: SquareBookingData;
    payment?: SquarePaymentData;
  };
}

interface SquarePaymentData {
  id: string;
  status?: string;
}

interface SquareWebhookEvent {
  type: string;
  event_id: string;
  created_at: string;
  data: SquareWebhookData;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Map Square booking status to local ReservationStatus */
function mapSquareStatus(status?: string): string | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s === 'ACCEPTED' || s === 'CONFIRMED') return 'confirmed';
  if (s === 'CANCELLED' || s === 'CANCELLED_BY_CUSTOMER' || s === 'CANCELLED_BY_SELLER') return 'cancelled';
  if (s === 'NO_SHOW' || s === 'NO_SHOW_BY_SELLER') return 'no_show';
  // Don't change to pending/seated/completed from webhook — those are locally managed
  return null;
}

/** Parse party size from appointment segments (fallback to 2 if missing) */
function parsePartySize(segments?: SquareBookingData['appointment_segments']): number {
  // Square appointment segments don't carry party size directly.
  // In restaurant context, party size is typically stored in the customer_note
  // or seller_note. For now, default to 2 if not parseable.
  if (!segments || segments.length === 0) return 2;
  // Future: extract from metadata or notes if available
  return 2;
}

/** Parse duration from appointment segments (fallback to restaurant turn time rules) */
function parseDurationMinutes(segments?: SquareBookingData['appointment_segments']): number | null {
  if (!segments || segments.length === 0) return null;
  const total = segments.reduce((sum, seg) => sum + (seg.duration_minutes || 0), 0);
  return total > 0 ? total : null;
}

/** Try to parse party size from notes (e.g. "Party of 4" or "4 guests") */
function parsePartySizeFromNotes(notes?: string): number | null {
  if (!notes) return null;
  // Try patterns like "Party of 4", "4 guests", "4 pax", "pax: 4", etc.
  const patterns = [
    /party\s+of\s+(\d+)/i,
    /(\d+)\s+guests?/i,
    /(\d+)\s+pax/i,
    /pax[:\s]+(\d+)/i,
    /(\d+)\s+people/i,
    /for\s+(\d+)/i,
    /table\s+for\s+(\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = notes.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

/** Idempotency: check if we've already processed this event */
async function isDuplicateEvent(eventId: string): Promise<boolean> {
  const existing = await prisma.webhookEvent.findUnique({ where: { eventId } });
  return !!existing;
}

/** Record that we've processed an event */
async function recordEventProcessed(eventId: string, eventType: string): Promise<void> {
  await prisma.webhookEvent.create({
    data: { eventId, eventType },
  }).catch((err) => {
    // Unique constraint violation means another worker already recorded it — that's fine
    if (!err?.message?.includes('Unique')) {
      console.error('[Square Webhook] Failed to record event idempotency:', err);
    }
  });
}

/** Find or create a customer record from Square data */
async function findOrCreateCustomer(params: {
  restaurantId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  squareCustomerId?: string;
}): Promise<string | null> {
  try {
    // Try to find by squareCustomerId first
    if (params.squareCustomerId) {
      const bySquareId = await prisma.customer.findFirst({
        where: { restaurantId: params.restaurantId, squareCustomerId: params.squareCustomerId },
      });
      if (bySquareId) {
        // Update customer info if we got new data
        await prisma.customer.update({
          where: { id: bySquareId.id },
          data: {
            name: params.customerName || bySquareId.name,
            phone: params.customerPhone || bySquareId.phone,
            email: params.customerEmail || bySquareId.email,
            squareCustomerId: params.squareCustomerId,
          },
        });
        return bySquareId.id;
      }
    }

    // Try to find by email
    if (params.customerEmail) {
      const byEmail = await prisma.customer.findFirst({
        where: { restaurantId: params.restaurantId, email: params.customerEmail },
      });
      if (byEmail) {
        await prisma.customer.update({
          where: { id: byEmail.id },
          data: {
            name: params.customerName || byEmail.name,
            phone: params.customerPhone || byEmail.phone,
            squareCustomerId: params.squareCustomerId || byEmail.squareCustomerId,
          },
        });
        return byEmail.id;
      }
    }

    // Try to find by phone
    const byPhone = await prisma.customer.findFirst({
      where: { restaurantId: params.restaurantId, phone: params.customerPhone },
    });
    if (byPhone) {
      await prisma.customer.update({
        where: { id: byPhone.id },
        data: {
          name: params.customerName || byPhone.name,
          email: params.customerEmail || byPhone.email,
          squareCustomerId: params.squareCustomerId || byPhone.squareCustomerId,
        },
      });
      return byPhone.id;
    }

    // Create new customer
    if (params.customerName || params.customerPhone) {
      const customer = await prisma.customer.create({
        data: {
          restaurantId: params.restaurantId,
          name: params.customerName || 'Unknown',
          phone: params.customerPhone || '0000000000',
          email: params.customerEmail,
          squareCustomerId: params.squareCustomerId,
        },
      });
      return customer.id;
    }

    return null;
  } catch (error) {
    console.error('[Square Webhook] findOrCreateCustomer failed:', error);
    return null;
  }
}

/** Enrich booking data by fetching customer details from Square (best-effort) */
async function enrichWithCustomerInfo(data: SquareBookingData): Promise<{
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}> {
  let customerName = '';
  let customerPhone = '';
  let customerEmail = '';

  if (data.customer_id) {
    const squareCustomer = await fetchSquareCustomer(data.customer_id);
    if (squareCustomer) {
      const parts = [squareCustomer.givenName, squareCustomer.familyName].filter(Boolean);
      customerName = parts.join(' ') || '';
      customerPhone = squareCustomer.phoneNumber || '';
      customerEmail = squareCustomer.emailAddress || '';
    }
  }

  return { customerName, customerPhone, customerEmail };
}

/** Calculate end time given start time and duration (or restaurant defaults) */
async function calculateEndTime(
  restaurantId: string,
  startTime: Date,
  partySize: number,
  durationMinutes: number | null
): Promise<Date> {
  if (durationMinutes && durationMinutes > 0) {
    return new Date(startTime.getTime() + durationMinutes * 60000);
  }

  // Fallback: use restaurant turn time rules
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { turnTimeRules: true },
  });

  const turnTime = restaurant?.turnTimeRules
    ? getTurnTime(partySize, restaurant.turnTimeRules as Record<string, number>)
    : 90; // default 90 minutes

  return new Date(startTime.getTime() + turnTime * 60000);
}

/** Find restaurant by Square location ID */
async function findRestaurantByLocationId(locationId?: string): Promise<string | null> {
  if (!locationId) return null;
  const restaurant = await prisma.restaurant.findFirst({
    where: { squareLocationId: locationId },
    select: { id: true },
  });
  return restaurant?.id || null;
}

/** Find the first (default) restaurant as fallback */
async function findDefaultRestaurant(): Promise<string | null> {
  const restaurant = await prisma.restaurant.findFirst({
    where: { active: true },
    select: { id: true },
  });
  return restaurant?.id || null;
}

// ─── Main Handler ────────────────────────────────────────────────────────────

// POST /api/webhooks/square — Square webhook receiver
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-square-hmacsha256-signature') || '';
    const webhookSecret = process.env.SQUARE_WEBHOOK_SECRET || '';

    // Verify signature if secret is configured
    if (webhookSecret) {
      const isValid = await verifySquareWebhookSignature(body, signature, webhookSecret);
      if (!isValid) {
        console.warn('[Square Webhook] Invalid signature', {
          receivedSig: signature.substring(0, 20) + '...',
          bodyLength: body.length,
        });
        return NextResponse.json({ error: 'Invalid signature', code: 'INVALID_SIGNATURE' }, { status: 400 });
      }
    } else {
      console.warn('[Square Webhook] No webhook secret configured, skipping signature verification');
    }

    const event: SquareWebhookEvent = JSON.parse(body);
    const eventType = event.type || '';
    const eventId = event.event_id || `unknown-${Date.now()}`;

    console.debug(`[Square Webhook] Received event: ${eventType} (id: ${eventId})`);

    // ── Idempotency check ────────────────────────────────────────────────
    if (eventId && eventId !== `unknown-${Date.now()}`) {
      const isDup = await isDuplicateEvent(eventId);
      if (isDup) {
        console.debug(`[Square Webhook] Duplicate event ${eventId}, skipping`);
        return NextResponse.json({ received: true, duplicate: true });
      }
    }

    // Extract booking data from nested Square structure
    const bookingData: SquareBookingData | undefined = event.data?.object?.booking;
    const paymentData: SquarePaymentData | undefined = event.data?.object?.payment;

    if (!bookingData && !paymentData) {
      console.warn(`[Square Webhook] No booking or payment data in event ${eventId}`);
      return NextResponse.json({ received: true });
    }

    // ── booking.created ──────────────────────────────────────────────────
    if (eventType === 'booking.created' && bookingData) {
      const result = await handleBookingCreated(eventId, bookingData);
      if (result) {
        await recordEventProcessed(eventId, eventType);
      }
      return NextResponse.json({ received: true });
    }

    // ── booking.updated (enhanced) ────────────────────────────────────────────
    if (eventType === 'booking.updated' && bookingData) {
      const result = await handleBookingUpdated(eventId, bookingData);
      if (result) {
        await recordEventProcessed(eventId, eventType);
      }
      return NextResponse.json({ received: true });
    }

    // ── booking.cancelled ────────────────────────────────────────────────────
    if (eventType === 'booking.cancelled' && bookingData) {
      const result = await handleBookingCancelled(eventId, bookingData);
      if (result) {
        await recordEventProcessed(eventId, eventType);
      }
      return NextResponse.json({ received: true });
    }

    // ── booking.deleted ────────────────────────────────────────────────────
    // Square sends booking.deleted when a booking is hard-deleted.
    // Treat the same as cancelled — mark local reservation as cancelled.
    if (eventType === 'booking.deleted' && bookingData) {
      const result = await handleBookingCancelled(eventId, bookingData);
      if (result) {
        await recordEventProcessed(eventId, eventType);
      }
      return NextResponse.json({ received: true });
    }

    // ── payment.updated (unchanged) ──────────────────────────────────────────
    if (eventType === 'payment.updated' && paymentData) {
      await handlePaymentUpdated(eventId, paymentData);
      await recordEventProcessed(eventId, eventType);
      return NextResponse.json({ received: true });
    }

    // Unknown event type — acknowledge but skip
    console.debug(`[Square Webhook] Unhandled event type: ${eventType}`);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[POST /api/webhooks/square]', err);
    return NextResponse.json({ error: 'Webhook processing failed', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

/**
 * Handle booking.created — create a local reservation from a Square booking.
 */
async function handleBookingCreated(eventId: string, data: SquareBookingData): Promise<boolean> {
  const squareBookingId = data.id;
  if (!squareBookingId) {
    console.warn('[Square Webhook] booking.created: missing booking ID, skipping');
    return false;
  }

  // Check if a reservation with this squareBookingId already exists (idempotency / race condition)
  const existing = await prisma.reservation.findFirst({
    where: { squareBookingId },
  });
  if (existing) {
    console.debug(`[Square Webhook] booking.created: reservation ${existing.id} already exists for Square booking ${squareBookingId}`);
    return true; // Already exists, mark as processed
  }

  // Determine restaurant
  const restaurantId = await findRestaurantByLocationId(data.location_id) || await findDefaultRestaurant();
  if (!restaurantId) {
    console.error('[Square Webhook] booking.created: no restaurant found, cannot create reservation');
    return false;
  }

  // Enrich with customer info from Square
  const { customerName, customerPhone, customerEmail } = await enrichWithCustomerInfo(data);

  // Determine party size
  const notes = [data.seller_note, data.customer_note].filter(Boolean).join(' | ');
  const partySize = parsePartySizeFromNotes(notes) || parsePartySize(data.appointment_segments);

  // Parse times
  let startTime: Date;
  let endTime: Date;

  if (data.start_at) {
    startTime = new Date(data.start_at);
    const durationMinutes = parseDurationMinutes(data.appointment_segments);
    endTime = await calculateEndTime(restaurantId, startTime, partySize, durationMinutes);
  } else {
    console.warn('[Square Webhook] booking.created: no start_at provided, skipping');
    return false;
  }

  // Map status
  const status = mapSquareStatus(data.status) || 'confirmed';

  // Find or create customer
  await findOrCreateCustomer({
    restaurantId,
    customerName: customerName || 'Square Booking',
    customerPhone: customerPhone || '0000000000',
    customerEmail: customerEmail || undefined,
    squareCustomerId: data.customer_id,
  });

  // Create reservation
  const reservation = await prisma.reservation.create({
    data: {
      restaurantId,
      customerName: customerName || 'Square Booking',
      customerPhone: customerPhone || '0000000000',
      customerEmail: customerEmail || null,
      partySize,
      reservationDate: toDateOnly(startTime),
      startTime,
      endTime,
      status: status as ReservationStatus,
      source: 'square',
      notes: notes || null,
      squareBookingId,
      squareCustomerId: data.customer_id || null,
    },
  });

  // Best-effort table assignment
  try {
    const assignment = await assignTables(restaurantId, partySize, startTime, endTime, undefined, reservation.id);
    if (assignment) {
      await prisma.reservationTable.createMany({
        data: assignment.tableIds.map((tableId) => ({
          reservationId: reservation.id,
          tableId,
        })),
      });
    }
  } catch (err) {
    console.warn('[Square Webhook] booking.created: table assignment failed (non-blocking):', err);
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      restaurantId,
      reservationId: reservation.id,
      action: 'webhook_received',
      details: {
        squareEvent: 'booking.created',
        squareEventId: eventId,
        squareBookingId,
        squareCustomerId: data.customer_id || null,
        partySize,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        status,
        source: 'square',
      },
    },
  });

  console.debug(`[Square Webhook] booking.created: created reservation ${reservation.id} for Square booking ${squareBookingId}`);
  return true;
}

/**
 * Handle booking.updated — enhanced to sync all fields, not just status.
 * If reservation doesn't exist locally, create it (upsert pattern).
 */
async function handleBookingUpdated(eventId: string, data: SquareBookingData): Promise<boolean> {
  const squareBookingId = data.id;
  if (!squareBookingId) {
    console.warn('[Square Webhook] booking.updated: missing booking ID, skipping');
    return false;
  }

  const reservation = await prisma.reservation.findFirst({
    where: { squareBookingId },
  });

  // If no local reservation exists, treat as booking.created (upsert)
  if (!reservation) {
    console.debug(`[Square Webhook] booking.updated: no local reservation for ${squareBookingId}, treating as booking.created`);
    return handleBookingCreated(eventId, data);
  }

  // Determine restaurant
  const restaurantId = reservation.restaurantId;

  // Build update payload from event data
  const updateData: Record<string, string | number | Date | null | ReservationStatus | ReservationSource> = {};

  // Status
  const mappedStatus = mapSquareStatus(data.status);
  if (mappedStatus) {
    updateData.status = mappedStatus;
  }

  // Time changes
  if (data.start_at) {
    const newStart = new Date(data.start_at);
    updateData.startTime = newStart;
    updateData.reservationDate = toDateOnly(newStart);

    const durationMinutes = parseDurationMinutes(data.appointment_segments);
    updateData.endTime = await calculateEndTime(restaurantId, newStart, reservation.partySize, durationMinutes);
  }

  // Party size — try to extract from notes if available
  const notes = [data.seller_note, data.customer_note].filter(Boolean).join(' | ');
  const newPartySize = parsePartySizeFromNotes(notes);
  if (newPartySize) {
    updateData.partySize = newPartySize;
    // Recalculate end time if party size changed and no explicit duration
    if (!data.start_at) {
      updateData.endTime = await calculateEndTime(restaurantId, reservation.startTime, newPartySize, null);
    }
  }

  // Customer info — enrich from Square if customer_id provided
  if (data.customer_id) {
    const { customerName, customerPhone, customerEmail } = await enrichWithCustomerInfo(data);
    if (customerName) updateData.customerName = customerName;
    if (customerPhone) updateData.customerPhone = customerPhone;
    if (customerEmail) updateData.customerEmail = customerEmail;
    updateData.squareCustomerId = data.customer_id;

    // Also update the customer record
    await findOrCreateCustomer({
      restaurantId,
      customerName: customerName || reservation.customerName,
      customerPhone: customerPhone || reservation.customerPhone,
      customerEmail: customerEmail || reservation.customerEmail || undefined,
      squareCustomerId: data.customer_id,
    });
  }

  // Notes
  if (data.seller_note !== undefined || data.customer_note !== undefined) {
    updateData.notes = notes || null;
  }

  // Apply updates if any
  if (Object.keys(updateData).length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservation.id },
        data: updateData,
      });

      await tx.auditLog.create({
        data: {
          restaurantId,
          reservationId: reservation.id,
          action: 'webhook_received',
          details: {
            squareEvent: 'booking.updated',
            squareEventId: eventId,
            squareBookingId,
            updatedFields: Object.keys(updateData),
            squareStatus: data.status,
            mappedStatus,
            rawEventData: {
              start_at: data.start_at,
              customer_id: data.customer_id,
              seller_note: data.seller_note,
              customer_note: data.customer_note,
            },
          },
        },
      });
    });

    console.debug(`[Square Webhook] booking.updated: updated reservation ${reservation.id}, fields: ${Object.keys(updateData).join(', ')}`);

    // Re-assign tables if time or party size changed
    if (updateData.startTime || updateData.partySize) {
      try {
        const newStart = (updateData.startTime as Date) || reservation.startTime;
        const newEnd = (updateData.endTime as Date) || reservation.endTime;
        const newPartySize = (updateData.partySize as number) || reservation.partySize;

        // Remove old table assignments
        await prisma.reservationTable.deleteMany({
          where: { reservationId: reservation.id },
        });

        // Assign new tables
        const assignment = await assignTables(restaurantId, newPartySize, newStart, newEnd, undefined, reservation.id);
        if (assignment) {
          await prisma.reservationTable.createMany({
            data: assignment.tableIds.map((tableId) => ({
              reservationId: reservation.id,
              tableId,
            })),
          });
        }
      } catch (err) {
        console.warn('[Square Webhook] booking.updated: table reassignment failed (non-blocking):', err);
      }
    }
  } else {
    // No fields to update — still log
    await prisma.auditLog.create({
      data: {
        restaurantId,
        reservationId: reservation.id,
        action: 'webhook_received',
        details: {
          squareEvent: 'booking.updated',
          squareEventId: eventId,
          squareBookingId,
          note: 'No fields to update',
        },
      },
    });
    console.debug(`[Square Webhook] booking.updated: no fields to update for reservation ${reservation.id}`);
  }

  return true;
}

/**
 * Handle booking.cancelled — cancel existing reservation (unchanged logic, improved logging).
 */
async function handleBookingCancelled(eventId: string, data: SquareBookingData): Promise<boolean> {
  const squareBookingId = data.id;
  if (!squareBookingId) {
    console.warn('[Square Webhook] booking.cancelled: missing booking ID, skipping');
    return false;
  }

  const reservation = await prisma.reservation.findFirst({
    where: { squareBookingId },
  });

  if (!reservation) {
    console.warn(`[Square Webhook] booking.cancelled: no local reservation for Square booking ${squareBookingId}`);
    return true; // Nothing to cancel, but event is processed
  }

  if (reservation.status !== 'cancelled') {
    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: 'cancelled' },
      });

      await tx.auditLog.create({
        data: {
          restaurantId: reservation.restaurantId,
          reservationId: reservation.id,
          action: 'webhook_received',
          details: {
            squareEvent: 'booking.cancelled',
            squareEventId: eventId,
            squareBookingId,
            reason: 'Square booking cancelled',
            previousStatus: reservation.status,
          },
        },
      });
    });

    console.debug(`[Square Webhook] Cancelled reservation ${reservation.id}`);
  } else {
    console.debug(`[Square Webhook] Reservation ${reservation.id} already cancelled`);
  }

  return true;
}

/**
 * Handle payment.updated — update payment status (unchanged logic).
 */
async function handlePaymentUpdated(eventId: string, data: SquarePaymentData): Promise<void> {
  const squarePaymentId = data.id;
  const paymentStatus = data.status;

  if (!squarePaymentId) return;

  const payment = await prisma.payment.findFirst({
    where: { squarePaymentId },
  });

  if (!payment) return;

  let mappedStatus: string | null = null;
  if (paymentStatus === 'COMPLETED') mappedStatus = 'completed';
  else if (paymentStatus === 'FAILED') mappedStatus = 'failed';
  else if (paymentStatus === 'CANCELED') mappedStatus = 'refunded';

  if (mappedStatus) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: mappedStatus as PaymentStatus },
    });

    console.debug(`[Square Webhook] Updated payment ${payment.id} to ${mappedStatus}`);
  }
}