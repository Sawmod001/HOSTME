import { connectToDatabase } from "@/lib/db";
import { Booking } from "@/models/Booking";
import { SoftHold } from "@/models/SoftHold";
import { Listing } from "@/models/Listing";
import { Slot } from "@/models/Slot";
import mongoose from "mongoose";

export async function POST(request) {
    try {
        const payload = await request.json();
        const { softHoldId, guestId, guestName, guestEmail, guestPhone, addOns = [] } = payload;

        if (!softHoldId) {
            return Response.json({ error: "Missing soft hold ID" }, { status: 400 });
        }

        await connectToDatabase();

        const softHold = await SoftHold.findById(softHoldId).lean();
        if (!softHold) {
            return Response.json({ error: "Soft hold not found" }, { status: 404 });
        }

        if (new Date(softHold.expiresAt) < new Date()) {
            return Response.json({ error: "Soft hold expired" }, { status: 409 });
        }

        const listing = await Listing.findById(payload.listingId).lean();
        if (!listing) {
            return Response.json({ error: "Listing not found" }, { status: 404 });
        }

        const slot = await Slot.findById(softHold.slotId).lean();
        if (!slot) {
            return Response.json({ error: "Slot not found" }, { status: 404 });
        }

        const addOnsTotal = (addOns || []).reduce((sum, item) => sum + Number(item.priceInKobo || 0), 0);
        const totalAmountKobo = Number(listing.pricing?.baseRatePerHour || 0) * Number(softHold.headcount || 0) + addOnsTotal;
        const commissionKobo = Math.round(totalAmountKobo * 0.05);

        const booking = await Booking.create({
            listingId: listing._id,
            guestId: guestId || null,
            bookingType: "capacity",
            eventStart: slot.eventStart,
            eventEnd: slot.eventEnd,
            headcount: softHold.headcount,
            status: "awaiting_payment",
            totalAmountKobo,
            commissionKobo,
        });

        await SoftHold.updateOne({ _id: softHold._id }, { bookingId: booking._id });

        return Response.json(
            {
                ok: true,
                data: {
                    bookingId: booking._id,
                    status: booking.status,
                    totalAmountKobo,
                    commissionKobo,
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
        console.error("POST /api/bookings error:", error);
        return Response.json({ error: "Failed to create booking" }, { status: 500 });
    }
}
