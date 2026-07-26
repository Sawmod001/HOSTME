"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function ExclusiveRequestPage({ params }) {
    const { id } = use(params);
    const [listing, setListing] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(null);
    const [form, setForm] = useState({
        lockId: "",
        headcount: 2,
        eventStart: "",
        eventEnd: "",
    });

    useEffect(() => {
        const fetchListing = async () => {
            try {
                const response = await fetch(`/api/listings/${id}`);
                if (!response.ok) throw new Error("Listing not found");
                const data = await response.json();
                setListing(data);
                setError(null);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchListing();
    }, [id]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await fetch("/api/bookings/exclusive/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    listingId: id,
                    lockId: form.lockId,
                    headcount: form.headcount,
                    eventStart: form.eventStart,
                    eventEnd: form.eventEnd,
                }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Unable to submit request");
            setSuccess(data.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
                <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-[var(--color-border)] bg-white p-6">
                    <div className="h-8 w-24 animate-pulse rounded-xl bg-[var(--color-surface-alt)]" />
                    <div className="h-10 animate-pulse rounded-xl bg-[var(--color-surface-alt)]" />
                    <div className="h-24 animate-pulse rounded-xl bg-[var(--color-surface-alt)]" />
                </div>
            </main>
        );
    }

    if (error || !listing) {
        return (
            <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
                <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
                    <p className="mb-4 text-sm text-[var(--color-ink-muted)]">{error || "Unable to load this listing"}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
                    >
                        Try Again
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
            <div className="mx-auto max-w-2xl space-y-6">
                <Link href={`/listings/${id}`} className="flex items-center gap-2 text-[var(--color-primary)]">
                    <ArrowLeft size={18} />
                    Back to listing
                </Link>

                <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
                    <h1 className="text-2xl font-semibold text-[var(--color-ink)]">Request to Book</h1>
                    <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                        Submit your request for this exclusive-space listing. The first successful payment wins the slot.
                    </p>

                    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                        <label className="block text-sm font-semibold text-[var(--color-ink)]">
                            Exclusive lock ID
                            <input
                                value={form.lockId}
                                onChange={(event) => setForm({ ...form, lockId: event.target.value })}
                                className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                                placeholder="lock-1"
                                required
                            />
                        </label>

                        <label className="block text-sm font-semibold text-[var(--color-ink)]">
                            Headcount
                            <input
                                type="number"
                                min="1"
                                value={form.headcount}
                                onChange={(event) => setForm({ ...form, headcount: Number(event.target.value) })}
                                className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                                required
                            />
                        </label>

                        <label className="block text-sm font-semibold text-[var(--color-ink)]">
                            Start
                            <input
                                type="datetime-local"
                                value={form.eventStart}
                                onChange={(event) => setForm({ ...form, eventStart: event.target.value })}
                                className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                                required
                            />
                        </label>

                        <label className="block text-sm font-semibold text-[var(--color-ink)]">
                            End
                            <input
                                type="datetime-local"
                                value={form.eventEnd}
                                onChange={(event) => setForm({ ...form, eventEnd: event.target.value })}
                                className="mt-2 w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                                required
                            />
                        </label>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                            {submitting ? "Submitting" : "Submit Request"}
                        </button>
                    </form>

                    {success ? (
                        <div className="mt-4 rounded-xl border border-[#DCFCE7] bg-[#F0FDF4] p-4 text-sm text-[#166534]">
                            Request submitted. Booking ID: {success.bookingId}
                        </div>
                    ) : null}

                    {error ? (
                        <div className="mt-4 rounded-xl border border-[#FEE2E2] bg-[#FEF2F2] p-4 text-sm text-[#991B1B]">
                            {error}
                        </div>
                    ) : null}
                </div>
            </div>
        </main>
    );
}
