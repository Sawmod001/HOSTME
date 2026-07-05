import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Booking } from "@/models/Booking";
import { ExclusiveLock } from "@/models/ExclusiveLock";
import { Listing } from "@/models/Listing";

export async function POST(request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const payload = await request.json();
        const { listingId, lockId, headcount, eventStart, eventEnd } = payload;

        if (!listingId || !lockId || !headcount || !eventStart || !eventEnd) {
            return Response.json({ error: "Missing required booking details" }, { status: 400 });
        }

        const parsedHeadcount = Number(headcount);
        if (!Number.isFinite(parsedHeadcount) || parsedHeadcount < 1) {
            return Response.json({ error: "Headcount must be at least 1" }, { status: 400 });
        }

        await connectToDatabase();

        const listing = await Listing.findById(listingId).lean();
        if (!listing) {
            return Response.json({ error: "Listing not found" }, { status: 404 });
        }

        if (listing.bookingType !== "exclusive") {
            return Response.json({ error: "Listing is not exclusive-space" }, { status: 400 });
        }

        if (listing.status !== "active") {
            return Response.json({ error: "Listing is not active" }, { status: 400 });
        }

        const exclusiveLock = await ExclusiveLock.findOne({
            _id: lockId,
            listingId,
            eventStart: new Date(eventStart),
            status: "open",
        }).lean();

        if (!exclusiveLock) {
            return Response.json({ error: "Exclusive lock is not available" }, { status: 409 });
        }

        const totalAmountKobo = Number(listing.pricing?.baseRatePerHour || 0) * parsedHeadcount;
        const commissionKobo = Math.round(totalAmountKobo * 0.05);

        const booking = await Booking.create({
            listingId,
            guestId: session.user.id,
            bookingType: "exclusive",
            eventStart: new Date(eventStart),
            eventEnd: new Date(eventEnd),
            headcount: parsedHeadcount,
            status: "pending",
            totalAmountKobo,
            commissionKobo,
        });

        return Response.json(
            {
                ok: true,
                data: {
                    bookingId: booking._id,
                    status: booking.status,
                    totalAmountKobo,
                    commissionKobo,
                },
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("POST /api/bookings/exclusive/request error:", error);
        return Response.json({ error: "Failed to request exclusive booking" }, { status: 500 });
    }
}
