"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function AdminPendingListingsPage() {
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const [rejectingId, setRejectingId] = useState(null);
    const [rejectReason, setRejectReason] = useState("");

    useEffect(() => {
        fetchListings();
    }, []);

    const fetchListings = async () => {
        try {
            const response = await fetch("/api/listings?status=pending_review");
            if (!response.ok) throw new Error("Failed to fetch listings");
            const data = await response.json();
            setListings(data.data);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (listingId) => {
        setActionLoading(listingId);
        try {
            const response = await fetch(`/api/admin/listings/${listingId}/approve`, {
                method: "POST",
            });
            if (!response.ok) throw new Error("Failed to approve listing");
            setListings((prev) => prev.filter((l) => l._id !== listingId));
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleRejectSubmit = async (listingId) => {
        if (!rejectReason.trim()) {
            alert("Please provide a rejection reason");
            return;
        }

        setActionLoading(listingId);
        try {
            const response = await fetch(`/api/admin/listings/${listingId}/reject`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: rejectReason }),
            });
            if (!response.ok) throw new Error("Failed to reject listing");
            setListings((prev) => prev.filter((l) => l._id !== listingId));
            setRejectingId(null);
            setRejectReason("");
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
                <div className="mx-auto max-w-4xl space-y-6">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-32 rounded-2xl bg-white animate-pulse border border-[var(--color-border)]" />
                    ))}
                </div>
            </main>
        );
    }

    if (error && listings.length === 0) {
        return (
            <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
                <div className="mx-auto max-w-4xl flex flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-8">
                    <p className="text-sm text-[var(--color-ink-muted)]">Error: {error}</p>
                    <button
                        onClick={fetchListings}
                        className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-white font-semibold"
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
                    <h1 className="text-3xl font-semibold text-[var(--color-ink)]">Pending Approvals</h1>
                    <p className="text-sm text-[var(--color-ink-muted)]">Review and approve new listings</p>
                </div>

                {listings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
                        <p className="text-sm font-semibold text-[var(--color-ink)]">No pending listings</p>
                        <p className="text-xs text-[var(--color-ink-muted)]">All listings have been reviewed</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {listings.map((listing) => (
                            <div
                                key={listing._id}
                                className="rounded-2xl border border-[var(--color-border)] bg-white p-6 space-y-4"
                            >
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-[var(--color-ink)]">{listing.title}</h3>
                                    <p className="text-sm text-[var(--color-ink-muted)]">{listing.description}</p>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <span className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-2 py-1 text-xs text-[var(--color-ink-muted)]">
                                            {listing.vertical}
                                        </span>
                                        <span className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-2 py-1 text-xs text-[var(--color-ink-muted)]">
                                            {listing.bookingType === "capacity" ? "Capacity" : "Exclusive"}
                                        </span>
                                        <span className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-2 py-1 text-xs text-[var(--color-ink-muted)]">
                                            ₦{(listing.pricing.baseRatePerHour / 100).toLocaleString()}/hr
                                        </span>
                                    </div>
                                </div>

                                {rejectingId === listing._id ? (
                                    <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
                                        <label className="text-sm font-semibold text-[var(--color-ink)] block">Rejection Reason</label>
                                        <textarea
                                            value={rejectReason}
                                            onChange={(e) => setRejectReason(e.target.value)}
                                            placeholder="Explain why this listing is being rejected..."
                                            rows="3"
                                            className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleRejectSubmit(listing._id)}
                                                disabled={actionLoading === listing._id}
                                                className="flex-1 rounded-xl bg-[#B91C1C] px-4 py-2 text-white font-semibold disabled:opacity-50"
                                            >
                                                {actionLoading === listing._id ? "Submitting..." : "Confirm Rejection"}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setRejectingId(null);
                                                    setRejectReason("");
                                                }}
                                                className="flex-1 rounded-xl border border-[var(--color-border)] px-4 py-2 text-[var(--color-ink)] font-semibold"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex gap-2 border-t border-[var(--color-border)] pt-4">
                                        <button
                                            onClick={() => handleApprove(listing._id)}
                                            disabled={actionLoading === listing._id}
                                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#15803D] px-4 py-2 text-white font-semibold disabled:opacity-50"
                                        >
                                            {actionLoading === listing._id ? (
                                                <Loader2 size={16} className="animate-spin" />
                                            ) : (
                                                <CheckCircle2 size={16} />
                                            )}
                                            {actionLoading === listing._id ? "Approving..." : "Approve"}
                                        </button>
                                        <button
                                            onClick={() => setRejectingId(listing._id)}
                                            disabled={actionLoading === listing._id}
                                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2 text-white font-semibold disabled:opacity-50"
                                        >
                                            <XCircle size={16} />
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
