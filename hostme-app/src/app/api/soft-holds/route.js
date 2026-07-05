import { connectToDatabase } from "@/lib/db";
import { Listing } from "@/models/Listing";
import { Slot } from "@/models/Slot";
import { SoftHold } from "@/models/SoftHold";
import { reserveCapacitySlot } from "@/lib/booking";

export async function POST(request) {
    try {
        const payload = await request.json();
        const { listingId, slotId, headcount, guestName, guestEmail, guestPhone } = payload;

        if (!listingId || !slotId || !headcount) {
            return Response.json({ error: "Missing required booking details" }, { status: 400 });
        }

        await connectToDatabase();

        const listing = await Listing.findById(listingId).lean();
        if (!listing) {
            return Response.json({ error: "Listing not found" }, { status: 404 });
        }

        if (listing.bookingType !== "capacity") {
            return Response.json({ error: "Listing is not capacity-based" }, { status: 400 });
        }

        const reservation = await reserveCapacitySlot({
            slotId,
            listingId,
            headcount,
            SlotModel: Slot,
            SoftHoldModel: SoftHold,
            expiresInMinutes: 10,
        });

        if (!reservation.ok) {
            return Response.json({ error: reservation.error }, { status: reservation.status });
        }

        const softHold = await SoftHold.findById(reservation.data.softHoldId).lean();

        return Response.json(
            {
                ok: true,
                data: {
                    softHoldId: softHold._id,
                    slotId,
                    listingId,
                    headcount,
                    expiresAt: softHold.expiresAt,
                    totalAmountKobo: listing.pricing?.baseRatePerHour ? listing.pricing.baseRatePerHour * headcount : 0,
                    guest: {
                        name: guestName || "Guest",
                        email: guestEmail || null,
                        phone: guestPhone || null,
                    },
                },
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("POST /api/soft-holds error:", error);
        return Response.json({ error: "Failed to create soft hold" }, { status: 500 });
    }
}
