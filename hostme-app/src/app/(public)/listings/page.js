"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, Filter, Loader2 } from "lucide-react";

export default function DiscoveryPage() {
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [cursor, setCursor] = useState(null);
    const [hasMore, setHasMore] = useState(false);
    const [filters, setFilters] = useState({
        vertical: "",
        bookingType: "",
        cityArea: "",
    });
    const [searching, setSearching] = useState(false);

    const fetchListings = useCallback(
        async (reset = false) => {
            try {
                const params = new URLSearchParams();
                if (filters.vertical) params.append("vertical", filters.vertical);
                if (filters.bookingType) params.append("bookingType", filters.bookingType);
                if (filters.cityArea) params.append("cityArea", filters.cityArea);
                if (cursor && !reset) params.append("cursor", cursor);

                const response = await fetch(`/api/listings?${params.toString()}`);
                if (!response.ok) throw new Error("Failed to fetch listings");

                const data = await response.json();
                setListings(reset ? data.data : (prev) => [...prev, ...data.data]);
                setCursor(data.pagination.nextCursor);
                setHasMore(data.pagination.hasMore);
                setError(null);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
                setSearching(false);
            }
        },
        [cursor, filters]
    );

    useEffect(() => {
        setLoading(true);
        setCursor(null);
        fetchListings(true);
    }, [filters]);

    const handleFilterChange = (key, value) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    const handleLoadMore = () => {
        if (!searching && hasMore) {
            setSearching(true);
            fetchListings();
        }
    };

    if (loading && listings.length === 0) {
        return (
            <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
                <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-64 rounded-2xl bg-white animate-pulse border border-[var(--color-border)]" />
                    ))}
                </div>
            </main>
        );
    }

    if (error && listings.length === 0) {
        return (
            <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-8">
                    <p className="text-sm text-[var(--color-ink-muted)]">Error: {error}</p>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => fetchListings(true)}
                            className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-white font-semibold"
                        >
                            Try Again
                        </button>
                        <button
                            onClick={async () => {
                                await fetch("/api/listings/seed", { method: "POST" });
                                fetchListings(true);
                            }}
                            className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)]"
                        >
                            Seed Demo Listings
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6 sm:px-6">
            <div className="mx-auto max-w-4xl space-y-6">
                {/* Header */}
                <div className="space-y-3">
                    <h1 className="text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">Discover Spaces</h1>
                    <p className="text-sm text-[var(--color-ink-muted)]">Find the perfect venue for your next event</p>
                </div>

                {/* Filters */}
                <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 space-y-3 sm:flex sm:gap-3 sm:space-y-0">
                    <div className="flex-1">
                        <label className="text-xs font-semibold text-[var(--color-ink)] block mb-2">Vertical</label>
                        <select
                            value={filters.vertical}
                            onChange={(e) => handleFilterChange("vertical", e.target.value)}
                            className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                        >
                            <option value="">All Verticals</option>
                            <option value="venue">Venues</option>
                            <option value="housing">Housing</option>
                            <option value="preorder">Pre-Order</option>
                        </select>
                    </div>

                    <div className="flex-1">
                        <label className="text-xs font-semibold text-[var(--color-ink)] block mb-2">Booking Type</label>
                        <select
                            value={filters.bookingType}
                            onChange={(e) => handleFilterChange("bookingType", e.target.value)}
                            className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                        >
                            <option value="">All Types</option>
                            <option value="capacity">Shared Capacity</option>
                            <option value="exclusive">Exclusive Space</option>
                        </select>
                    </div>

                    <div className="flex-1">
                        <label className="text-xs font-semibold text-[var(--color-ink)] block mb-2">City Area</label>
                        <input
                            type="text"
                            value={filters.cityArea}
                            onChange={(e) => handleFilterChange("cityArea", e.target.value)}
                            placeholder="e.g. Lekki"
                            className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
                        />
                    </div>
                </div>

                {/* Listings */}
                {listings.length === 0 && !loading ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
                        <p className="text-sm font-semibold text-[var(--color-ink)]">No listings found</p>
                        <p className="text-xs text-[var(--color-ink-muted)]">Try adjusting your filters or seed demo content to continue testing</p>
                        <button
                            onClick={async () => {
                                await fetch("/api/listings/seed", { method: "POST" });
                                fetchListings(true);
                            }}
                            className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
                        >
                            Seed Demo Listings
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {listings.map((listing) => (
                            <Link key={listing._id} href={`/listings/${listing._id}`}>
                                <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 hover:border-[var(--color-primary)] transition-colors cursor-pointer sm:p-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 space-y-2">
                                            <h3 className="font-semibold text-[var(--color-ink)] line-clamp-1">{listing.title}</h3>
                                            <p className="text-xs text-[var(--color-ink-muted)] line-clamp-2">{listing.description}</p>
                                            <div className="flex flex-wrap gap-2 pt-2">
                                                <span className="inline-flex rounded-full border border-[var(--color-primary-light)] bg-[var(--color-primary-light)] px-2 py-1 text-xs font-semibold text-[var(--color-primary-dark)]">
                                                    {listing.bookingType === "capacity" ? "Shared" : "Exclusive"}
                                                </span>
                                                <span className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-2 py-1 text-xs text-[var(--color-ink-muted)]">
                                                    {listing.vertical}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right space-y-1">
                                            <p className="font-semibold text-[var(--color-ink)]">
                                                ₦{(listing.pricing.baseRatePerHour / 100).toLocaleString()}
                                            </p>
                                            <p className="text-xs text-[var(--color-ink-muted)]">per hour</p>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}

                {/* Load More */}
                {hasMore && (
                    <div className="flex justify-center">
                        <button
                            onClick={handleLoadMore}
                            disabled={searching}
                            className="rounded-xl bg-[var(--color-primary)] px-6 py-3 text-white font-semibold disabled:opacity-50 flex items-center gap-2"
                        >
                            {searching && <Loader2 size={16} className="animate-spin" />}
                            {searching ? "Loading..." : "Load More"}
                        </button>
                    </div>
                )}
            </div>
        </main>
    );
}
