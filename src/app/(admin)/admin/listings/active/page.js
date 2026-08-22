"use client";

import { useState, useEffect } from "react";
import { Ban, Loader2 } from "lucide-react";
import DashboardLayout from "@/components/sidebar/DashboardLayout";
import AdminSidebar from "@/components/sidebar/AdminSidebar";

export default function AdminActiveListingsPage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchListings = async () => {
    try {
      const res = await fetch("/api/listings?status=active");
      if (!res.ok) throw new Error("Failed to fetch listings");
      const data = await res.json();
      setListings(data.data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchListings(); }, []);

  const handleSuspend = async (listingId) => {
    setActionLoading(listingId);
    try {
      const res = await fetch(`/api/admin/listings/${listingId}/suspend`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to suspend");
      setListings((prev) => prev.filter((l) => l.id !== listingId));
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <DashboardLayout sidebar={AdminSidebar} sidebarProps={{ activePage: "active" }}>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-[var(--color-border)] bg-white" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout sidebar={AdminSidebar} sidebarProps={{ activePage: "active" }}>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-[var(--color-ink)]">Active Listings</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">View and manage approved listings</p>
        </div>

        {error && listings.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
            <p className="text-sm text-[var(--color-ink-muted)]">Error: {error}</p>
            <button onClick={fetchListings} className="mt-4 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-white font-semibold">Try Again</button>
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
            <p className="text-sm font-semibold text-[var(--color-ink)]">No active listings</p>
            <p className="text-xs text-[var(--color-ink-muted)]">All listings are pending approval or suspended</p>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map((listing) => (
              <div key={listing.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="font-semibold text-[var(--color-ink)]">{listing.title}</h3>
                    <p className="text-sm text-[var(--color-ink-muted)] line-clamp-2">{listing.description}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-2 py-1 text-xs text-[var(--color-ink-muted)]">{listing.vertical}</span>
                      <span className="inline-flex rounded-full border border-[var(--color-border)] bg-[#DCFCE7] px-2 py-1 text-xs font-semibold text-[#166534]">Active</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSuspend(listing.id)}
                    disabled={actionLoading === listing.id}
                    className="flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2 text-white font-semibold disabled:opacity-50"
                  >
                    {actionLoading === listing.id ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                    Suspend
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
