"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, LogOut, Menu, X, Ban } from "lucide-react";
import Logo from "@/components/Logo";

function AdminSidebar({ onClose }) {
  return (
    <nav className="flex flex-col gap-2">
      <div className="mb-6 flex items-center justify-between">
        <Logo size="sm" />
        <button className="lg:hidden" onClick={onClose}><X size={20} /></button>
      </div>
      <Link href="/admin" className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">
        Dashboard
      </Link>
      <Link href="/admin/listings/pending" className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]">
        Pending Approvals
      </Link>
      <Link href="/admin/listings/active" className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]">
        Active Listings
      </Link>
      <Link href="/admin/users" className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]">
        Users
      </Link>
      <div className="mt-auto pt-6">
        <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/sign-in"; }}
          className="flex w-full items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-alt)]">
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </nav>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { fetchStats(); }, []);

  async function fetchStats() {
    try {
      const [pendingRes, activeRes, listingsRes] = await Promise.all([
        fetch("/api/listings?status=pending_review&limit=1"),
        fetch("/api/listings?status=active&limit=1"),
        fetch("/api/listings?limit=1"),
      ]);
      const pending = await pendingRes.json();
      const active = await activeRes.json();
      const all = await listingsRes.json();
      const pendingLen = pending.data?.length || 0;
      const activeLen = active.data?.length || 0;
      const totalSeen = pendingLen + activeLen;
      const totalCount = totalSeen + (pending.pagination?.hasMore ? 1 : 0) + (active.pagination?.hasMore ? 1 : 0);
      setStats({ pendingCount: pendingLen, activeCount: activeLen, totalCount });
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-ink)]">Admin Dashboard</h1>
            <p className="text-sm text-[var(--color-ink-muted)]">Monitor and manage the platform</p>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl border border-[var(--color-border)] bg-white" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
              <p className="text-sm text-[var(--color-ink-muted)]">{error}</p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-[#DBEAFE] p-2 text-[#1E40AF]"><Loader2 size={20} /></div>
                    <div>
                      <p className="text-2xl font-bold text-[var(--color-ink)]">{stats?.pendingCount || 0}</p>
                      <p className="text-xs text-[var(--color-ink-muted)]">Pending review</p>
                    </div>
                  </div>
                  <Link href="/admin/listings/pending" className="mt-3 block text-sm font-semibold text-[var(--color-primary)]">
                    Review now →
                  </Link>
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-[#DCFCE7] p-2 text-[#166534]"><CheckCircle2 size={20} /></div>
                    <div>
                      <p className="text-2xl font-bold text-[var(--color-ink)]">{stats?.activeCount || 0}</p>
                      <p className="text-xs text-[var(--color-ink-muted)]">Active listings</p>
                    </div>
                  </div>
                  <Link href="/admin/listings/active" className="mt-3 block text-sm font-semibold text-[var(--color-primary)]">
                    Manage →
                  </Link>
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-[#F3F4F6] p-2 text-[#6B7280]"><AlertTriangle size={20} /></div>
                    <div>
                      <p className="text-2xl font-bold text-[var(--color-ink)]">{stats?.totalCount || 0}</p>
                      <p className="text-xs text-[var(--color-ink-muted)]">Total listings</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Link href="/admin/listings/pending" className="rounded-2xl border border-[var(--color-border)] bg-white p-4 hover:border-[var(--color-primary)]">
                  <p className="font-semibold text-[var(--color-ink)]">Pending Approvals</p>
                  <p className="text-sm text-[var(--color-ink-muted)]">Review and approve new listings</p>
                </Link>
                <Link href="/admin/listings/active" className="rounded-2xl border border-[var(--color-border)] bg-white p-4 hover:border-[var(--color-primary)]">
                  <p className="font-semibold text-[var(--color-ink)]">Active Listings</p>
                  <p className="text-sm text-[var(--color-ink-muted)]">View and suspend active listings</p>
                </Link>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
