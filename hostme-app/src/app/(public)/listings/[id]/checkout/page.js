"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

export default function CheckoutPage() {
    const params = useParams();
    const router = useRouter();
    const listingId = params?.id;

    const [listing, setListing] = useState(null);
    const [slot, setSlot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [guestName, setGuestName] = useState("");
    const [guestEmail, setGuestEmail] = useState("");
    const [guestPhone, setGuestPhone] = useState("");
    const [headcount, setHeadcount] = useState(1);
    const [selectedAddOns, setSelectedAddOns] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);

    useEffect(() => {
        const load = async () => {
            try {
                const listingRes = await fetch(`/api/listings/${listingId}`);
                if (!listingRes.ok) throw new Error("Failed to load listing");
                const listingData = await listingRes.json();
                setListing(listingData);

                const slotsRes = await fetch(`/api/listings/${listingId}/slots?date=${selectedDate}`);
                if (!slotsRes.ok) throw new Error("No slots available");
                const slotsData = await slotsRes.json();
                const firstSlot = slotsData?.data?.[0];
                setSlot(firstSlot || null);
                setError(null);
            } catch (err) {
                setError(err.message || "Unable to load checkout details");
            } finally {
                setLoading(false);
            }
        };

        if (listingId) {
            load();
        }
    }, [listingId, selectedDate]);

    const subtotal = useMemo(() => {
        if (!listing) return 0;
        const base = Number(listing.pricing?.baseRatePerHour || 0) * Number(headcount || 0);
        const addOnsTotal = selectedAddOns.reduce((sum, addonId) => {
            const addon = listing.addOns?.find((item) => item.id === addonId);
            return sum + Number(addon?.priceInKobo || 0);
        }, 0);
        return base + addOnsTotal;
    }, [headcount, listing, selectedAddOns]);

    const toggleAddon = (addonId) => {
        setSelectedAddOns((current) =>
            current.includes(addonId) ? current.filter((value) => value !== addonId) : [...current, addonId]
        );
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!listing || !slot) return;

        setSubmitting(true);
        setError(null);

        try {
            const softHoldRes = await fetch("/api/soft-holds", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    listingId,
                    slotId: slot.id,
                    headcount,
                    guestName,
                    guestEmail,
                    guestPhone,
                }),
            });

            const softHoldData = await softHoldRes.json();
            if (!softHoldRes.ok) throw new Error(softHoldData.error || "Could not reserve slot");

            const bookingRes = await fetch("/api/bookings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    softHoldId: softHoldData.data.softHoldId,
                    listingId,
                    guestName,
                    guestEmail,
                    guestPhone,
                    addOns: selectedAddOns.map((addonId) => ({
                        id: addonId,
                        priceInKobo: listing.addOns?.find((item) => item.id === addonId)?.priceInKobo || 0,
                    })),
                }),
            });

            const bookingData = await bookingRes.json();
            if (!bookingRes.ok) throw new Error(bookingData.error || "Could not create booking");

            router.push(`/bookings/${bookingData.data.bookingId}/pay`);
        } catch (err) {
            setError(err.message || "Checkout failed");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
                <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--color-border)] bg-white p-8">
                    <div className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
                        <Loader2 className="animate-spin" size={16} />
                        Preparing checkout...
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
            <div className="mx-auto max-w-2xl space-y-6">
                <Link href={`/listings/${listingId}`} className="flex items-center gap-2 text-[var(--color-primary)]">
                    <ArrowLeft size={18} />
                    Back to listing
                </Link>

                <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-[var(--color-border)] bg-white p-6">
                    <div className="space-y-2">
                        <h1 className="text-2xl font-semibold text-[var(--color-ink)]">Checkout</h1>
                        <p className="text-sm text-[var(--color-ink-muted)]">Reserve your slot and continue to payment.</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-[var(--color-ink)]">Date</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                            disabled={submitting}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-[var(--color-ink)]">Guest name</label>
                        <input
                            required
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                            disabled={submitting}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-[var(--color-ink)]">Email</label>
                        <input
                            type="email"
                            required
                            value={guestEmail}
                            onChange={(e) => setGuestEmail(e.target.value)}
                            className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                            disabled={submitting}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-[var(--color-ink)]">Phone</label>
                        <input
                            value={guestPhone}
                            onChange={(e) => setGuestPhone(e.target.value)}
                            className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                            disabled={submitting}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-[var(--color-ink)]">Headcount</label>
                        <input
                            type="number"
                            min="1"
                            max={(listing?.operationalRules?.maxCapacity || 1)}
                            value={headcount}
                            onChange={(e) => setHeadcount(Number(e.target.value))}
                            className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                            disabled={submitting}
                        />
                    </div>

                    {listing?.addOns?.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-sm font-semibold text-[var(--color-ink)]">Add-ons</p>
                            {listing.addOns.map((addon) => (
                                <label key={addon.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] p-3 text-sm">
                                    <span>{addon.name}</span>
                                    <span className="flex items-center gap-2">
                                        <span>+₦{(addon.priceInKobo / 100).toLocaleString()}</span>
                                        <input
                                            type="checkbox"
                                            checked={selectedAddOns.includes(addon.id)}
                                            onChange={() => toggleAddon(addon.id)}
                                            disabled={submitting}
                                        />
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}

                    <div className="rounded-xl bg-[var(--color-surface-alt)] p-4 text-sm text-[var(--color-ink)]">
                        <div className="flex items-center justify-between">
                            <span>Estimated total</span>
                            <span className="font-semibold">₦{(subtotal / 100).toLocaleString()}</span>
                        </div>
                        {slot ? (
                            <div className="mt-2 text-xs text-[var(--color-ink-muted)]">
                                Selected slot: {new Date(slot.eventStart).toLocaleTimeString()} – {new Date(slot.eventEnd).toLocaleTimeString()}
                            </div>
                        ) : (
                            <div className="mt-2 text-xs text-[var(--color-ink-muted)]">No slot available for this date.</div>
                        )}
                    </div>

                    {error ? <p className="text-sm text-red-600">{error}</p> : null}

                    <button
                        type="submit"
                        disabled={submitting || !slot}
                        className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {submitting ? "Reserving..." : "Continue to Payment"}
                    </button>
                </form>
            </div>
        </main>
    );
}
