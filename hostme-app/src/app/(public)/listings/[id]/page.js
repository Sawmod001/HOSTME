"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function ListingDetailPage({ params }) {
    const [listing, setListing] = useState(null);
    const [slots, setSlots] = useState([]);
    const [availability, setAvailability] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);

    useEffect(() => {
        const fetchListing = async () => {
            try {
                const listingRes = await fetch(`/api/listings/${params.id}`);
                if (!listingRes.ok) throw new Error("Listing not found");
                const listingData = await listingRes.json();
                setListing(listingData);

                if (listingData.bookingType === "capacity") {
                    const slotsRes = await fetch(`/api/listings/${params.id}/slots?date=${selectedDate}`);
                    if (slotsRes.ok) {
                        const slotsData = await slotsRes.json();
                        setSlots(slotsData.data);
                    }
                } else {
                    const availRes = await fetch(`/api/listings/${params.id}/availability?date=${selectedDate}`);
                    if (availRes.ok) {
                        const availData = await availRes.json();
                        setAvailability(availData.data);
                    }
                }

                setError(null);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchListing();
    }, [params.id, selectedDate]);

    if (loading) {
        return (
            <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
                <div className="mx-auto max-w-2xl space-y-6">
                    <div className="h-64 rounded-2xl bg-white animate-pulse border border-[var(--color-border)]" />
                    <div className="space-y-4">
                        <div className="h-8 bg-white rounded-2xl animate-pulse" />
                        <div className="h-32 bg-white rounded-2xl animate-pulse" />
                    </div>
                </div>
            </main>
        );
    }

    if (error || !listing) {
        return (
            <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
                <div className="mx-auto max-w-2xl">
                    <Link href="/listings" className="flex items-center gap-2 text-[var(--color-primary)] mb-6">
                        <ArrowLeft size={18} />
                        Back to listings
                    </Link>
                    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-8">
                        <p className="text-sm text-[var(--color-ink-muted)]">Error: {error || "Listing not found"}</p>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
            <div className="mx-auto max-w-2xl space-y-6">
                <Link href="/listings" className="flex items-center gap-2 text-[var(--color-primary)]">
                    <ArrowLeft size={18} />
                    Back to listings
                </Link>

                <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6 space-y-4">
                    <div className="h-64 bg-[var(--color-surface-alt)] rounded-xl flex items-center justify-center text-[var(--color-ink-muted)]">
                        [Media carousel placeholder]
                    </div>

                    <div className="space-y-2">
                        <h1 className="text-2xl font-semibold text-[var(--color-ink)]">{listing.title}</h1>
                        <p className="text-sm text-[var(--color-ink-muted)]">
                            {listing.location.address}, {listing.location.cityArea}, {listing.location.state}
                        </p>
                    </div>

                    <div className="flex items-baseline gap-1">
                        <p className="text-3xl font-semibold text-[var(--color-ink)]">
                            ₦{(listing.pricing.baseRatePerHour / 100).toLocaleString()}
                        </p>
                        <p className="text-sm text-[var(--color-ink-muted)]">per hour</p>
                    </div>

                    <div className="border-t border-[var(--color-border)] pt-4">
                        <p className="text-sm font-semibold text-[var(--color-ink)] mb-2">Description</p>
                        <p className="text-sm text-[var(--color-ink-muted)] leading-6">{listing.description}</p>
                    </div>

                    <div className="border-t border-[var(--color-border)] pt-4">
                        <p className="text-sm font-semibold text-[var(--color-ink)] mb-3">Details</p>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <p className="text-xs text-[var(--color-ink-muted)]">Max Capacity</p>
                                <p className="font-semibold text-[var(--color-ink)]">{listing.operationalRules.maxCapacity} people</p>
                            </div>
                            <div>
                                <p className="text-xs text-[var(--color-ink-muted)]">Booking Type</p>
                                <p className="font-semibold text-[var(--color-ink)]">
                                    {listing.bookingType === "capacity" ? "Shared" : "Exclusive"}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-[var(--color-ink-muted)]">Setup Buffer</p>
                                <p className="font-semibold text-[var(--color-ink)]">{listing.operationalRules.setupBufferMinutes}m</p>
                            </div>
                            <div>
                                <p className="text-xs text-[var(--color-ink-muted)]">Teardown Buffer</p>
                                <p className="font-semibold text-[var(--color-ink)]">{listing.operationalRules.teardownBufferMinutes}m</p>
                            </div>
                        </div>
                    </div>

                    {listing.addOns && listing.addOns.length > 0 && (
                        <div className="border-t border-[var(--color-border)] pt-4">
                            <p className="text-sm font-semibold text-[var(--color-ink)] mb-3">Add-ons</p>
                            <div className="space-y-2">
                                {listing.addOns.map((addon) => (
                                    <div key={addon.id} className="flex items-center justify-between text-sm border border-[var(--color-border)] rounded-lg p-3">
                                        <span className="text-[var(--color-ink)]">{addon.name}</span>
                                        <span className="font-semibold text-[var(--color-ink)]">+₦{(addon.priceInKobo / 100).toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="border-t border-[var(--color-border)] pt-4 space-y-3">
                        <p className="text-sm font-semibold text-[var(--color-ink)]">Select Date</p>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                        />

                        {listing.bookingType === "capacity" && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-[var(--color-ink-muted)]">Available Slots</p>
                                {slots.length === 0 ? (
                                    <p className="text-sm text-[var(--color-ink-muted)]">No slots available for this date</p>
                                ) : (
                                    <div className="space-y-2">
                                        {slots.map((slot) => (
                                            <div key={slot._id} className="flex items-center justify-between border border-[var(--color-border)] rounded-lg p-3">
                                                <span className="text-sm text-[var(--color-ink)]">
                                                    {new Date(slot.eventStart).toLocaleTimeString()} – {new Date(slot.eventEnd).toLocaleTimeString()}
                                                </span>
                                                <span className="text-xs font-semibold text-[var(--color-ink)]">
                                                    {slot.available}/{slot.capacity}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {listing.bookingType === "exclusive" && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-[var(--color-ink-muted)]">Availability</p>
                                {availability.length === 0 ? (
                                    <p className="text-sm text-[var(--color-ink-muted)]">No time windows for this date</p>
                                ) : (
                                    <div className="space-y-2">
                                        {availability.map((slot) => (
                                            <div key={slot._id} className="flex items-center justify-between border border-[var(--color-border)] rounded-lg p-3">
                                                <span className="text-sm text-[var(--color-ink)]">
                                                    {new Date(slot.eventStart).toLocaleTimeString()} – {new Date(slot.eventEnd).toLocaleTimeString()}
                                                </span>
                                                <span className={`text-xs font-semibold ${slot.status === "open" ? "text-[#15803D]" : "text-[var(--color-ink-muted)]"}`}>
                                                    {slot.status === "open" ? "Open" : "Locked"}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <Link
                            href={`/listings/${params.id}/checkout`}
                            className="mt-4 block w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 text-center font-semibold text-white"
                        >
                            Book Now
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    );
}
