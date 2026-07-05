"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

export default function HostBookingsPage() {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [processingId, setProcessingId] = useState(null);

    const loadBookings = async () => {
        try {
            const response = await fetch("/api/bookings");
            if (!response.ok) throw new Error("Unable to load bookings");
            const data = await response.json();
            setBookings(data.data || []);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBookings();
    }, []);

    const handleAction = async (bookingId, action) => {
        setProcessingId(bookingId);
        try {
            const body = action === "reject"
                ? { reason: window.prompt("Reason for rejection") || "No reason provided" }
                : undefined;

            const response = await fetch(`/api/bookings/${bookingId}/${action}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: body ? JSON.stringify(body) : undefined,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || "Unable to update booking");
            }

            await loadBookings();
        } catch (err) {
            setError(err.message);
        } finally {
            setProcessingId(null);
        }
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
                <div className="mx-auto max-w-4xl space-y-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="h-24 animate-pulse rounded-2xl border border-[var(--color-border)] bg-white" />
                    ))}
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
                <div className="mx-auto max-w-4xl rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
                    <p className="text-sm text-[var(--color-ink-muted)]">{error}</p>
                    <button
                        onClick={() => loadBookings()}
                        className="mt-4 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
                    >
                        Try Again
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
            <div className="mx-auto max-w-4xl space-y-6">
                <div className="space-y-1">
                    <h1 className="text-3xl font-semibold text-[var(--color-ink)]">Booking Inbox</h1>
                    <p className="text-sm text-[var(--color-ink-muted)]">Review pending requests and approve or reject them</p>
                </div>

                {bookings.length === 0 ? (
                    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-ink-muted)]">
                        No bookings yet.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {bookings.map((booking) => (
                            <div key={booking._id} className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="space-y-2">
                                        <p className="font-semibold text-[var(--color-ink)]">
                                            {booking.bookingType === "exclusive" ? "Exclusive request" : "Capacity booking"}
                                        </p>
                                        <p className="text-sm text-[var(--color-ink-muted)]">Status: {booking.status}</p>
                                        <p className="text-sm text-[var(--color-ink-muted)]">
                                            {new Date(booking.eventStart).toLocaleString()} → {new Date(booking.eventEnd).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="text-right text-sm text-[var(--color-ink-muted)]">
                                        <p>₦{(booking.totalAmountKobo / 100).toLocaleString()}</p>
                                        <p>{booking.headcount} guest(s)</p>
                                    </div>
                                </div>

                                {booking.status === "pending" && (
                                    <div className="mt-4 flex flex-wrap gap-3">
                                        <button
                                            onClick={() => handleAction(booking._id, "approve")}
                                            disabled={processingId === booking._id}
                                            className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                                        >
                                            {processingId === booking._id ? <Loader2 size={16} className="animate-spin" /> : "Approve"}
                                        </button>
                                        <button
                                            onClick={() => handleAction(booking._id, "reject")}
                                            disabled={processingId === booking._id}
                                            className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-70"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
