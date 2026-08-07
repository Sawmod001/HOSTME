import { parseSessionToken, verifyClerkSession } from "@/lib/getSessionUser";
import { getUser } from "@/lib/getUser";
import { listReviews, createReview, findBookingById } from "@/lib/supabase-queries";
import { toCamelCase, ok, cachedOk, fail, unauthorised, notFound } from "@/lib/supabase-utils";

export async function GET(request, { params }) {
  try {
    const p = await params;
    const reviews = await listReviews(p.id);
    return cachedOk({ data: reviews.map(toCamelCase) });
  } catch (error) {
    console.error("GET /api/listings/[id]/reviews error:", error);
    return fail("Failed to fetch reviews", 500);
  }
}

export async function POST(request, { params }) {
  try {
    const p = await params;
    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) return unauthorised("No session");
    const isValid = await verifyClerkSession(sessionInfo.sessionId);
    if (!isValid) return unauthorised("Invalid session");

    const user = await getUser(sessionInfo.userId);
    if (!user) return unauthorised("User not found");

    const body = await request.json();
    const { bookingId, rating, reviewText } = body;

    if (!bookingId || !rating) return fail("Missing bookingId or rating", 400);
    if (rating < 1 || rating > 5) return fail("Rating must be between 1 and 5", 400);

    const booking = await findBookingById(bookingId);
    if (!booking) return notFound("Booking not found");
    if (booking.guest_id !== user.id) return fail("Not your booking", 403);
    if (booking.status !== "completed") return fail("Can only review completed bookings", 400);
    if (booking.listing_id !== p.id) return fail("Booking does not match this listing", 400);

    const review = await createReview({
      listing_id: p.id,
      guest_id: user.id,
      booking_id: bookingId,
      rating,
      review_text: reviewText || "",
    });

    return ok(toCamelCase(review), 201);
  } catch (error) {
    console.error("POST /api/listings/[id]/reviews error:", error);
    return fail("Failed to create review", 500);
  }
}
