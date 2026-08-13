"use client";

import { useState, useEffect } from "react";
import { Ban, Loader2, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import Logo from "@/components/Logo";

function AdminSidebar({ onClose }) {
  return (
    <nav className="flex flex-col gap-2">
      <div className="mb-6 flex items-center justify-between">
        <Logo size="sm" />
        <button className="lg:hidden" onClick={onClose}><X size={20} /></button>
      </div>
      <Link href="/admin" className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]">Dashboard</Link>
      <Link href="/admin/listings/pending" className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]">Pending Approvals</Link>
      <Link href="/admin/listings/active" className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">Active Listings</Link>
      <div className="mt-auto pt-6">
        <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/sign-in"; }}
          className="flex w-full items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-alt)]">
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </nav>
  );
}

export default function AdminActiveListingsPage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-[var(--color-border)] bg-white" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-alt)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-white px-4 py-3 lg:hidden">
        <Logo size="sm" />
        <button onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-64 bg-white p-6 shadow-lg border-r border-[var(--color-border)]">
            <AdminSidebar onClose={() => setSidebarOpen(false)} />
          </div>
          <div className="flex-1 bg-black/20" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6 lg:px-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-6 rounded-2xl border border-[var(--color-border)] bg-white p-4">
            <AdminSidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </aside>

        <main className="flex-1 space-y-6">
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
        </main>
      </div>
    </div>
  );
}
