"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, CalendarCheck, LayoutDashboard, Shield, CheckCircle2, Clock } from "lucide-react";
import DashboardLayout from "@/components/sidebar/DashboardLayout";
import HostSidebar from "@/components/sidebar/HostSidebar";

export default function HostDashboardPage() {
  const [profile, setProfile] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [listings, setListings] = useState([]);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/auth/profile-status")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) setProfile(data);
      })
      .finally(() => setIsLoaded(true));
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    fetchData();
  }, [isLoaded]);

  async function fetchData() {
    try {
      const meRes = await fetch("/api/users/me");
      let meId = null;
      if (meRes.ok) {
        const meData = await meRes.json();
        meId = meData.data?.providerProfile?.id || meData.providerProfile?.id || null;
      }

      const query = meId ? `&providerProfileId=${meId}` : "";
      const [bookingsRes, pendingRes, activeRes, verifRes] = await Promise.all([
        fetch("/api/bookings"),
        fetch(`/api/listings?status=pending_review${query}`),
        fetch(`/api/listings?status=active${query}`),
        fetch("/api/provider/verifications"),
      ]);
      if (verifRes.ok) {
        const verifData = await verifRes.json();
        const verifs = verifData.data || [];
        const hasApproved = verifs.some((v) => v.status === "approved");
        const hasPending = verifs.some((v) => v.status === "pending");
        setVerificationStatus(hasApproved ? "approved" : hasPending ? "pending" : "none");
      }
      if (!bookingsRes.ok) throw new Error("Failed to load data");
      const bookingsData = await bookingsRes.json();
      setBookings(bookingsData.data || []);

      const pending = await pendingRes.json();
      const active = await activeRes.json();
      setListings([...(pending.data || []), ...(active.data || [])]);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!isLoaded) {
    return (
      <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border border-[var(--color-border)] bg-white" />
          ))}
        </div>
      </main>
    );
  }

  const pendingCount = bookings.filter((b) => b.status === "pending").length;
  const confirmedCount = bookings.filter((b) => b.status === "confirmed").length;

  return (
    <DashboardLayout sidebar={HostSidebar} sidebarProps={{ activePage: "dashboard" }}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-ink)]">Host Dashboard</h1>
            <p className="text-sm text-[var(--color-ink-muted)]">Manage your spaces and bookings</p>
          </div>
          <Link
            href="/host/listings/new"
            className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus size={16} />
            New Listing
          </Link>
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
            <button
              onClick={fetchData}
              className="mt-4 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
            >
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-[#DBEAFE] p-2 text-[#1E40AF]">
                    <CalendarCheck size={20} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[var(--color-ink)]">{pendingCount}</p>
                    <p className="text-xs text-[var(--color-ink-muted)]">Pending requests</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-[#DCFCE7] p-2 text-[#166534]">
                    <CalendarCheck size={20} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[var(--color-ink)]">{confirmedCount}</p>
                    <p className="text-xs text-[var(--color-ink-muted)]">Confirmed bookings</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-[#F3F4F6] p-2 text-[#6B7280]">
                    <LayoutDashboard size={20} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[var(--color-ink)]">
                      {listings.length}
                    </p>
                    <p className="text-xs text-[var(--color-ink-muted)]">My listings</p>
                  </div>
                </div>
              </div>
            </div>

            {verificationStatus && verificationStatus !== "approved" && (
              <div className={`rounded-2xl border p-4 ${
                verificationStatus === "pending"
                  ? "border-amber-200 bg-amber-50"
                  : "border-[var(--color-border)] bg-white"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-xl p-2 ${
                      verificationStatus === "pending" ? "bg-amber-100 text-amber-700" : "bg-[var(--color-surface-alt)] text-[var(--color-ink-muted)]"
                    }`}>
                      {verificationStatus === "pending" ? <Clock size={20} /> : <Shield size={20} />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-ink)]">
                        {verificationStatus === "pending" ? "Verification in progress" : "Get verified"}
                      </p>
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        {verificationStatus === "pending"
                          ? "Your documents are being reviewed"
                          : "Complete verification to build trust with guests"}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/host/verification"
                    className="rounded-xl bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    {verificationStatus === "pending" ? "View Status" : "Start Now"}
                  </Link>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <h2 className="font-semibold text-[var(--color-ink)]">Quick Actions</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  href="/host/listings"
                  className="rounded-2xl border border-[var(--color-border)] bg-white p-4 text-sm font-semibold text-[var(--color-ink)] hover:border-[var(--color-primary)]"
                >
                  View my listings
                </Link>
                <Link
                  href="/host/bookings"
                  className="rounded-2xl border border-[var(--color-border)] bg-white p-4 text-sm font-semibold text-[var(--color-ink)] hover:border-[var(--color-primary)]"
                >
                  Review booking requests
                </Link>
              </div>
            </div>

            {pendingCount > 0 && (
              <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-[var(--color-ink)]">Pending Requests</h2>
                  <Link href="/host/bookings" className="text-sm text-[var(--color-primary)] font-semibold">
                    View all
                  </Link>
                </div>
                <div className="space-y-2">
                  {bookings
                    .filter((b) => b.status === "pending")
                    .slice(0, 3)
                    .map((booking) => (
                      <div key={booking.id} className="flex items-center justify-between rounded-xl bg-[var(--color-surface-alt)] p-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-ink)]">
                            {booking.bookingType === "exclusive" ? "Exclusive" : "Capacity"} booking
                          </p>
                          <p className="text-xs text-[var(--color-ink-muted)]">
                            {new Date(booking.eventStart).toLocaleDateString("en-NG", {
                              day: "numeric", month: "short",
                            })}
                            {" - "}
                            {booking.headcount} guest{booking.headcount > 1 ? "s" : ""}
                          </p>
                        </div>
                        <span className="inline-flex rounded-full bg-[#DBEAFE] px-2 py-0.5 text-xs font-semibold text-[#1E40AF]">
                          {booking.status}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
