"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, XCircle, ChevronRight } from "lucide-react";
import DashboardLayout from "@/components/sidebar/DashboardLayout";
import HostSidebar from "@/components/sidebar/HostSidebar";

const TABS = [
  { key: "", label: "All" },
  { key: "pending_approval", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "rejected", label: "Rejected" },
];

const STATUS_STYLES = {
  pending_approval: "bg-[#FEF3C7] text-[#B45309]",
  awaiting_payment: "bg-[#DBEAFE] text-[#1E40AF]",
  confirmed: "bg-[#DCFCE7] text-[#166534]",
  rejected: "bg-[#FEE2E2] text-[#991B1B]",
  completed: "bg-[#F3F4F6] text-[#6B7280]",
  cancelled_by_guest: "bg-[#F3F4F6] text-[#6B7280]",
  cancelled_by_host: "bg-[#F3F4F6] text-[#6B7280]",
  cancelled_system: "bg-[#F3F4F6] text-[#6B7280]",
  expired: "bg-[#F3F4F6] text-[#6B7280]",
};

export default function HostBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [activeTab, setActiveTab] = useState("");

  const loadData = async (statusFilter) => {
    try {
      const url = statusFilter ? `/api/bookings?status=${statusFilter}` : "/api/bookings";
      const bRes = await fetch(url);
      if (!bRes.ok) throw new Error("Unable to load bookings");
      const bData = await bRes.json();
      setBookings(bData.data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(activeTab); }, [activeTab]);

  const handleApprove = async (bookingId) => {
    setProcessingId(bookingId);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/approve`, { method: "POST" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Unable to approve"); }
      await loadData(activeTab);
    } catch (err) { setError(err.message); }
    finally { setProcessingId(null); }
  };

  const handleReject = async (bookingId) => {
    if (!rejectReason.trim()) return;
    setProcessingId(bookingId);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Unable to reject"); }
      setRejectingId(null); setRejectReason("");
      await loadData(activeTab);
    } catch (err) { setError(err.message); }
    finally { setProcessingId(null); }
  };

  if (loading) {
    return (
      <DashboardLayout sidebar={HostSidebar} sidebarProps={{ activePage: "bookings" }}>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-[var(--color-border)] bg-white" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout sidebar={HostSidebar} sidebarProps={{ activePage: "bookings" }}>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
          <p className="text-sm text-[var(--color-ink-muted)]">{error}</p>
          <button onClick={() => loadData(activeTab)} className="mt-4 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">Try Again</button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout sidebar={HostSidebar} sidebarProps={{ activePage: "bookings" }}>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-[var(--color-ink)]">Booking Inbox</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">Review pending requests and manage bookings</p>
        </div>

        <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white p-1">
          {TABS.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${activeTab === tab.key ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {bookings.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-ink-muted)]">No bookings found.</div>
        ) : (
          <div className="space-y-3">
            {bookings.map((booking) => (
              <div key={booking.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
                <Link href={`/host/bookings/${booking.id}`} className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[var(--color-ink)]">{booking.bookingType === "exclusive" ? "Exclusive" : "Capacity"}</p>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[booking.status] || "bg-[#F3F4F6] text-[#6B7280]"}`}>
                        {booking.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      {new Date(booking.eventStart).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {new Date(booking.eventEnd).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold">₦{(booking.totalAmountKobo / 100).toLocaleString()}</p>
                      <p className="text-xs text-[var(--color-ink-muted)]">{booking.headcount} guest{booking.headcount > 1 ? "s" : ""}</p>
                    </div>
                    <ChevronRight size={16} className="text-[var(--color-ink-muted)]" />
                  </div>
                </Link>

                {booking.status === "pending_approval" && (
                  <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                    {rejectingId === booking.id ? (
                      <div className="space-y-3">
                        <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection..." rows={2} className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm" />
                        <div className="flex gap-2">
                          <button onClick={() => handleReject(booking.id)} disabled={processingId === booking.id || !rejectReason.trim()} className="flex items-center gap-1 rounded-xl bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                            {processingId === booking.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Confirm Reject
                          </button>
                          <button onClick={() => { setRejectingId(null); setRejectReason(""); }} className="btn-outline px-4 py-2 text-sm">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <button onClick={() => handleApprove(booking.id)} disabled={processingId === booking.id} className="flex items-center gap-1 rounded-xl bg-[#15803D] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                          {processingId === booking.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve
                        </button>
                        <button onClick={() => setRejectingId(booking.id)} disabled={processingId === booking.id} className="btn-outline gap-1 px-4 py-2 text-sm disabled:opacity-50">
                          <XCircle size={14} /> Reject
                        </button>
                        <Link href={`/host/bookings/${booking.id}`} className="btn-outline ml-auto px-4 py-2 text-sm">Details</Link>
                      </div>
                    )}
                  </div>
                )}

                {booking.status === "rejected" && booking.rejectionReason && (
                  <p className="mt-2 text-xs text-[var(--color-ink-muted)]">Reason: {booking.rejectionReason}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
