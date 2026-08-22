"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Ban } from "lucide-react";
import DashboardLayout from "@/components/sidebar/DashboardLayout";
import AdminSidebar from "@/components/sidebar/AdminSidebar";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    <DashboardLayout sidebar={AdminSidebar} sidebarProps={{ activePage: "dashboard" }}>
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
    </DashboardLayout>
  );
}
