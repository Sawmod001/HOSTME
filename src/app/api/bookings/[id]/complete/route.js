import { requireHost } from "@/lib/auth/helpers";
import { toCamelCase, ok, fail, parseId } from "@/lib/db/supabase-utils";
import { transitionBooking } from "@/lib/bookings/state-machine";
import { validateCsrfOrigin } from "@/lib/csrf";

export async function POST(request, { params }) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const p = await params;
    const userOrResponse = await requireHost(request);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;
    if (!parseId(p.id)) return fail("Invalid booking ID", 400);

    const result = await transitionBooking({
      bookingId: p.id,
      toStatus: "completed",
      actorId: user.id,
      actorRole: "host",
    });

    if (!result.ok) return fail(result.error, 400);

    return ok(toCamelCase(result.booking));
  } catch (error) {
    console.error("POST /api/bookings/[id]/complete error:", error);
    return fail("Failed to complete booking", 500);
  }
}