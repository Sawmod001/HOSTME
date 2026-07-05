import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Booking } from "@/models/Booking";
import { SoftHold } from "@/models/SoftHold";
import { Listing } from "@/models/Listing";
import { Slot } from "@/models/Slot";
import mongoose from "mongoose";

export async function GET(request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();

        if (session.user.roles?.includes("host")) {
            const listings = await Listing.find({ hostId: session.user.id }).select("_id").lean();
            const listingIds = listings.map((listing) => listing._id);
            const bookings = await Booking.find({ listingId: { $in: listingIds } }).sort({ createdAt: -1 }).lean();
            return Response.json({ data: bookings });
        }

        const bookings = await Booking.find({ guestId: session.user.id }).sort({ createdAt: -1 }).lean();
        return Response.json({ data: bookings });
    } catch (error) {
        console.error("GET /api/bookings error:", error);
        return Response.json({ error: "Failed to fetch bookings" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

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
            guestId: session.user.id,
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
