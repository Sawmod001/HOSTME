"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function BookingStatusPage({ params }) {
    const { id } = use(params);
    const [booking, setBooking] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const load = async () => {
            try {
                const response = await fetch(`/api/bookings/${id}`);
                if (!response.ok) throw new Error("Booking not found");
                const data = await response.json();
                setBooking(data);
                setError(null);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (id) load();
    }, [id]);

    if (loading) {
        return (
            <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
                <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--color-border)] bg-white p-8">
                    <div className="h-6 w-32 animate-pulse rounded-xl bg-[var(--color-surface-alt)]" />
                </div>
            </main>
        );
    }

    if (error || !booking) {
        return (
            <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
                <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
                    <p className="text-sm text-[var(--color-ink-muted)]">{error || "Booking not found"}</p>
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

                <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">Booking status</p>
                            <h1 className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{booking.status}</h1>
                        </div>
                        <div className="text-right text-sm text-[var(--color-ink-muted)]">
                            <p>₦{(booking.totalAmountKobo / 100).toLocaleString()}</p>
                            <p>{booking.bookingType}</p>
                        </div>
                    </div>

                    <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-4 text-sm text-[var(--color-ink-muted)]">
                        {booking.status === "lost_race" ? (
                            <p>Your booking lost the race and a refund is being processed.</p>
                        ) : booking.status === "awaiting_payment" ? (
                            <div className="space-y-3">
                              <p>This booking is awaiting payment. Complete payment to secure your slot.</p>
                              <Link href={`/bookings/${booking.id}/pay`} className="inline-block rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">
                                Pay Now
                              </Link>
                            </div>
                        ) : booking.status === "confirmed" ? (
                            <p>This booking is confirmed and the slot is now locked.</p>
                        ) : booking.status === "rejected" ? (
                            <p>The host rejected this request.</p>
                        ) : (
                            <p>Your booking is currently {booking.status}.</p>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
