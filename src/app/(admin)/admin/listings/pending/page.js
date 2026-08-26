"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, Loader2, Mail } from "lucide-react";
import DashboardLayout from "@/components/sidebar/DashboardLayout";
import AdminSidebar from "@/components/sidebar/AdminSidebar";

export default function AdminPendingListingsPage() {
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const [rejectingId, setRejectingId] = useState(null);
    const [rejectReason, setRejectReason] = useState("");
    const [contactingId, setContactingId] = useState(null);
    const [contactHost, setContactHost] = useState(null);

    const fetchListings = async () => {
        try {
            const response = await fetch("/api/listings?status=pending_review");
            if (!response.ok) throw new Error("Failed to fetch listings");
            const data = await response.json();
            setListings(data.data || []);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchListings();
    }, []);

    const handleApprove = async (listingId) => {
        setActionLoading(listingId);
        try {
            const response = await fetch(`/api/admin/listings/${listingId}/approve`, {
                method: "POST",
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "Failed to approve listing");
            setListings((prev) => prev.filter((l) => l.id !== listingId));
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleContactHost = async (listing) => {
        setContactingId(listing.id);
        try {
            const response = await fetch(`/api/users/${listing.providerProfileId}`);
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "Failed to fetch host info");
            setContactHost({ ...data.data, listingId: listing.id });
        } catch (err) {
            alert("Could not load host contact info: " + err.message);
        } finally {
            setContactingId(null);
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
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "Failed to reject listing");
            setListings((prev) => prev.filter((l) => l.id !== listingId));
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
            <DashboardLayout sidebar={AdminSidebar} sidebarProps={{ activePage: "pending" }}>
                <div className="space-y-6">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-32 rounded-2xl bg-white animate-pulse border border-[var(--color-border)]" />
                    ))}
                </div>
            </DashboardLayout>
        );
    }

    if (error && listings.length === 0) {
        return (
            <DashboardLayout sidebar={AdminSidebar} sidebarProps={{ activePage: "pending" }}>
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-8">
                    <p className="text-sm text-[var(--color-ink-muted)]">Error: {error}</p>
                    <button
                        onClick={fetchListings}
                        className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-white font-semibold"
                    >
                        Try Again
                    </button>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout sidebar={AdminSidebar} sidebarProps={{ activePage: "pending" }}>
            <div className="space-y-6">
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
                                key={listing.id}
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
                                            ₦{(listing.pricing?.baseRatePerHour / 100 || 0).toLocaleString()}/hr
                                        </span>
                                    </div>
                                </div>

                                {rejectingId === listing.id ? (
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
                                                onClick={() => handleRejectSubmit(listing.id)}
                                                disabled={actionLoading === listing.id}
                                                className="flex-1 rounded-xl bg-[#B91C1C] px-4 py-2 text-white font-semibold disabled:opacity-50"
                                            >
                                                {actionLoading === listing.id ? "Submitting..." : "Confirm Rejection"}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setRejectingId(null);
                                                    setRejectReason("");
                                                }}
                                                className="btn-outline flex-1 px-4 py-2"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
                                        {contactHost && contactHost.listingId === listing.id && (
                                            <div className="rounded-xl bg-[var(--color-surface-alt)] p-3 text-sm">
                                                <p className="font-semibold text-[var(--color-ink)]">{contactHost.name}</p>
                                                <p className="text-[var(--color-ink-muted)]">{contactHost.email}</p>
                                                {contactHost.profile?.businessName && (
                                                    <p className="text-[var(--color-ink-muted)]">{contactHost.profile.businessName}</p>
                                                )}
                                                <a
                                                    href={`mailto:${contactHost.email}?subject=${encodeURIComponent("Your HostMe listing: " + listing.title)}`}
                                                    className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)]"
                                                >
                                                    <Mail size={14} />
                                                    Send email
                                                </a>
                                                <button
                                                    onClick={() => setContactHost(null)}
                                                    className="ml-3 text-xs text-[var(--color-ink-muted)] underline"
                                                >
                                                    Close
                                                </button>
                                            </div>
                                        )}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleApprove(listing.id)}
                                                disabled={actionLoading === listing.id}
                                                className="flex items-center justify-center gap-2 rounded-xl bg-[#15803D] px-4 py-2 text-white font-semibold disabled:opacity-50 sm:flex-1"
                                            >
                                                {actionLoading === listing.id ? (
                                                    <Loader2 size={16} className="animate-spin" />
                                                ) : (
                                                    <CheckCircle2 size={16} />
                                                )}
                                                Approve
                                            </button>
                                            <button
                                                onClick={() => handleContactHost(listing)}
                                                disabled={contactingId === listing.id}
                                                className="btn-outline gap-2 px-4 py-2 disabled:opacity-50"
                                            >
                                                <Mail size={16} />
                                                {contactingId === listing.id ? "..." : "Contact"}
                                            </button>
                                            <button
                                                onClick={() => setRejectingId(listing.id)}
                                                disabled={actionLoading === listing.id}
                                                className="flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2 text-white font-semibold disabled:opacity-50 sm:flex-1"
                                            >
                                                <XCircle size={16} />
                                                Reject
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
