import { squareClient } from './square';
import { prisma } from './prisma';

/**
 * Square adapter — async stubs for Square operations.
 * These are best-effort and should NOT block reservation creation.
 * If Square is down, the reservation still succeeds; we retry later.
 */

/**
 * Fetch full booking details from Square by booking ID.
 * Returns the booking object or null if not found / error.
 */
export async function fetchSquareBooking(bookingId: string): Promise<{
  id: string;
  status?: string;
  startAt?: string;
  locationId?: string;
  customerId?: string;
  appointmentSegments?: Array<{ durationMinutes?: number; serviceVariationId?: string; teamMemberId?: string }>;
  sellerNote?: string;
  customerNote?: string;
} | null> {
  try {
    const { bookings } = squareClient;
    const response = await bookings.get({ bookingId });
    const booking = response.booking;
    if (!booking) return null;
    return {
      id: booking.id ?? bookingId,
      status: booking.status as string | undefined,
      startAt: booking.startAt as string | undefined,
      locationId: booking.locationId as string | undefined,
      customerId: booking.customerId as string | undefined,
      appointmentSegments: booking.appointmentSegments?.map((seg) => ({
        durationMinutes: seg.durationMinutes != null ? Number(seg.durationMinutes) : undefined,
        serviceVariationId: seg.serviceVariationId as string | undefined,
        teamMemberId: seg.teamMemberId as string | undefined,
      })),
      sellerNote: booking.sellerNote as string | undefined,
      customerNote: booking.customerNote as string | undefined,
    };
  } catch (error) {
    console.error('[Square Adapter] fetchSquareBooking failed:', error);
    return null;
  }
}

/**
 * Fetch customer details from Square by customer ID.
 * Returns name, phone, email or null if not found / error.
 */
export async function fetchSquareCustomer(customerId: string): Promise<{
  givenName?: string;
  familyName?: string;
  phoneNumber?: string;
  emailAddress?: string;
} | null> {
  try {
    const { customers } = squareClient;
    const response = await customers.get({ customerId });
    const customer = response.customer;
    if (!customer) return null;
    return {
      givenName: customer.givenName as string | undefined,
      familyName: customer.familyName as string | undefined,
      phoneNumber: customer.phoneNumber as string | undefined,
      emailAddress: customer.emailAddress as string | undefined,
    };
  } catch (error) {
    console.error('[Square Adapter] fetchSquareCustomer failed:', error);
    return null;
  }
}

interface CustomerData {
  name: string;
  phone: string;
  email?: string;
}

interface BookingData {
  reservationId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  partySize: number;
  startTime: Date;
  endTime: Date;
  tableNames: string[];
  notes?: string;
}

/**
 * Create a Square customer or find an existing one by phone/email.
 * Returns the Square customer ID, or null if the operation fails.
 */
export async function createOrFindCustomer(
  restaurantId: string,
  data: CustomerData
): Promise<string | null> {
  try {
    // Check if we already have a Square customer ID for this customer
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        restaurantId,
        phone: data.phone,
        ...(data.email ? { email: data.email } : {}),
      },
    });

    if (existingCustomer?.squareCustomerId) {
      return existingCustomer.squareCustomerId;
    }

    // Search for existing customer in Square
    const { customers } = squareClient;
    if (data.phone) {
      try {
        const searchResponse = await customers.search({
          query: {
            filter: {
              phoneNumber: { exact: data.phone },
            },
          },
        });

        if (searchResponse.customers && searchResponse.customers.length > 0) {
          const squareId = searchResponse.customers[0].id;
          if (squareId) {
            if (existingCustomer) {
              await prisma.customer.update({
                where: { id: existingCustomer.id },
                data: { squareCustomerId: squareId },
              });
            }
            return squareId;
          }
        }
      } catch {
        // Search failed, will try to create instead
      }
    }

    // Create new customer in Square
    const nameParts = data.name.split(' ');
    try {
      const createResponse = await customers.create({
        givenName: nameParts[0] || data.name,
        familyName: nameParts.slice(1).join(' ') || undefined,
        phoneNumber: data.phone,
        emailAddress: data.email || undefined,
      });

      const newSquareId = createResponse.customer?.id ?? null;

      if (newSquareId && existingCustomer) {
        await prisma.customer.update({
          where: { id: existingCustomer.id },
          data: { squareCustomerId: newSquareId },
        });
      }

      return newSquareId;
    } catch (createErr) {
      console.error('[Square Adapter] Customer creation failed:', createErr);
      return null;
    }
  } catch (error) {
    console.error('[Square Adapter] createOrFindCustomer failed:', error);
    return null; // Non-blocking — reservation still succeeds
  }
}

/**
 * Create a Square booking linked to our reservation.
 * Returns the Square booking ID, or null if the operation fails.
 */
export async function createSquareBooking(
  bookingData: BookingData,
  squareCustomerId: string | null
): Promise<string | null> {
  try {
    const { bookings } = squareClient;

    const locationId = process.env.SQUARE_LOCATION_ID;
    if (!locationId) {
      console.warn('[Square Adapter] No Square location ID configured, skipping booking creation');
      return null;
    }

    const response = await bookings.create({
      idempotencyKey: bookingData.reservationId,
      booking: {
        startAt: bookingData.startTime.toISOString(),
        locationId,
        customerId: squareCustomerId || undefined,
        appointmentSegments: [
          {
            serviceVariationId: process.env.SQUARE_SERVICE_VARIATION_ID || '',
            serviceVariationVersion: process.env.SQUARE_SERVICE_VARIATION_VERSION
              ? BigInt(process.env.SQUARE_SERVICE_VARIATION_VERSION)
              : undefined,
            teamMemberId: process.env.SQUARE_TEAM_MEMBER_ID || '',
            durationMinutes: Math.round(
              (bookingData.endTime.getTime() - bookingData.startTime.getTime()) / 60000
            ),
          },
        ],
        sellerNote: `Reservation for ${bookingData.partySize} at table(s): ${bookingData.tableNames.join(', ')}. ${bookingData.notes || ''}`.trim(),
      },
    });

    return response.booking?.id ?? null;
  } catch (error) {
    console.error('[Square Adapter] createSquareBooking failed:', error);
    return null; // Non-blocking
  }
}

/**
 * Cancel a Square booking.
 * Returns true if successful, false otherwise.
 */
export async function cancelSquareBooking(
  squareBookingId: string | null | undefined
): Promise<boolean> {
  if (!squareBookingId) return true; // Nothing to cancel

  try {
    const { bookings } = squareClient;
    await bookings.cancel({ bookingId: squareBookingId });
    return true;
  } catch (error) {
    console.error('[Square Adapter] cancelSquareBooking failed:', error);
    return false;
  }
}

/**
 * Sync reservation changes to Square.
 * Best-effort update — we don't block on Square.
 */
export async function updateSquareBooking(
  squareBookingId: string | null | undefined,
  updates: Partial<BookingData>
): Promise<boolean> {
  if (!squareBookingId) return true;

  try {
    const { bookings } = squareClient;

    await bookings.update({
      bookingId: squareBookingId,
      booking: {
        startAt: updates.startTime?.toISOString(),
        appointmentSegments: updates.partySize
          ? [
              {
                serviceVariationId: process.env.SQUARE_SERVICE_VARIATION_ID || '',
                serviceVariationVersion: process.env.SQUARE_SERVICE_VARIATION_VERSION
                  ? BigInt(process.env.SQUARE_SERVICE_VARIATION_VERSION)
                  : undefined,
                teamMemberId: process.env.SQUARE_TEAM_MEMBER_ID || '',
                durationMinutes:
                  updates.startTime && updates.endTime
                    ? Math.round(
                        (updates.endTime.getTime() - updates.startTime.getTime()) / 60000
                      )
                    : undefined,
              },
            ]
          : undefined,
      },
    });

    console.log(`[Square Adapter] updateSquareBooking succeeded for ${squareBookingId}`);
    return true;
  } catch (error) {
    console.error('[Square Adapter] updateSquareBooking failed:', error);
    return false;
  }
}