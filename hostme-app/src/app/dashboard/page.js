"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, MapPin, LogOut, Menu, X } from "lucide-react";
import Logo from "@/components/Logo";

function SidebarNav({ roles, onClose }) {
  return (
    <nav className="flex flex-col gap-2">
      <div className="mb-6 flex items-center justify-between">
        <Logo size="sm" />
        <button className="lg:hidden" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <Link
        href="/dashboard"
        className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
      >
        My Bookings
      </Link>

      {roles.includes("host") && (
        <Link
          href="/host/dashboard"
          className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]"
        >
          Host Dashboard
        </Link>
      )}

      <Link
        href="/listings"
        className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]"
      >
        Browse Listings
      </Link>

      <Link href="/profile"
        className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]">
        Profile
      </Link>

      <div className="mt-auto pt-6">
        <button
          onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/sign-in"; }}
          className="flex w-full items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-alt)]"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </nav>
  );
}

export default function GuestDashboardPage() {
  const [profile, setProfile] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState("upcoming");

  const roles = profile?.redirectTo?.includes("host") ? ["guest", "host"] : ["guest"];

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
    fetchBookings();
  }, [isLoaded]);

  async function fetchBookings() {
    try {
      const res = await fetch("/api/bookings");
      if (!res.ok) throw new Error("Failed to load bookings");
      const data = await res.json();
      setBookings(data.data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const upcomingCount = bookings.filter((b) => b.status === "confirmed").length;
  const pendingCount = bookings.filter((b) => b.status === "pending" || b.status === "awaiting_payment").length;
  const pastCount = bookings.filter((b) => b.status === "completed" || b.status === "cancelled" || b.status === "rejected").length;

  const filteredBookings = bookings.filter((b) => {
    if (tab === "upcoming") return b.status === "confirmed";
    if (tab === "pending") return b.status === "pending" || b.status === "awaiting_payment";
    if (tab === "past") return b.status === "completed" || b.status === "cancelled" || b.status === "rejected";
    return true;
  });

  if (!isLoaded) {
    return (
      <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-[var(--color-border)] bg-white" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-alt)]">
      <div className="lg:hidden flex items-center justify-between border-b border-[var(--color-border)] bg-white px-4 py-3">
        <Logo size="sm" />
        <button onClick={() => setSidebarOpen(true)}>
          <Menu size={20} />
        </button>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-64 bg-white p-6 shadow-lg border-r border-[var(--color-border)]">
            <SidebarNav roles={roles} onClose={() => setSidebarOpen(false)} />
          </div>
          <div className="flex-1 bg-black/20" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6 lg:px-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-6 rounded-2xl border border-[var(--color-border)] bg-white p-4">
            <SidebarNav roles={roles} onClose={() => setSidebarOpen(false)} />
          </div>
        </aside>

        <main className="flex-1 space-y-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-[var(--color-ink)]">My Bookings</h1>
            <p className="text-sm text-[var(--color-ink-muted)]">Manage your reservations</p>
          </div>

          {loading ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-2xl border border-[var(--color-border)] bg-white" />
                ))}
              </div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl border border-[var(--color-border)] bg-white" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
              <p className="text-sm text-[var(--color-ink-muted)]">{error}</p>
              <button onClick={fetchBookings} className="mt-4 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">
                Try Again
              </button>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-[#DCFCE7] p-2 text-[#166534]">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-[var(--color-ink)]">{upcomingCount}</p>
                      <p className="text-xs text-[var(--color-ink-muted)]">Upcoming</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-[#FEF3C7] p-2 text-[#B45309]">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-[var(--color-ink)]">{pendingCount}</p>
                      <p className="text-xs text-[var(--color-ink-muted)]">Pending</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-[#F3F4F6] p-2 text-[#6B7280]">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-[var(--color-ink)]">{pastCount}</p>
                      <p className="text-xs text-[var(--color-ink-muted)]">Past</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-1 rounded-xl border border-[var(--color-border)] bg-white p-1">
                {["upcoming", "pending", "past"].map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold capitalize ${
                      tab === t ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-ink-muted)]"
                    }`}>
                    {t}
                  </button>
                ))}
              </div>

              {filteredBookings.length === 0 ? (
                <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
                  <p className="text-sm font-semibold text-[var(--color-ink)]">
                    {tab === "upcoming" ? "No upcoming bookings" : tab === "pending" ? "No pending bookings" : "No past bookings"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Browse listings and make your first booking</p>
                  <Link href="/listings" className="mt-4 inline-block rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">
                    Browse Listings
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredBookings.map((booking) => (
                    <div key={booking.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-4 sm:p-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="mt-1 rounded-xl bg-[var(--color-primary-light)] p-2 text-[var(--color-primary)]">
                            <Calendar size={16} />
                          </div>
                          <div>
                            <p className="font-semibold text-[var(--color-ink)]">
                              {booking.bookingType === "exclusive" ? "Exclusive Booking" : "Capacity Booking"}
                            </p>
                            <div className="mt-1 flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
                              <Calendar size={14} />
                              {new Date(booking.eventStart).toLocaleDateString("en-NG", {
                                weekday: "short", day: "numeric", month: "short", year: "numeric",
                              })}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
                              <MapPin size={14} />
                              {booking.headcount} guest{booking.headcount > 1 ? "s" : ""}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            booking.status === "confirmed" ? "bg-[#DCFCE7] text-[#166534]"
                            : booking.status === "awaiting_payment" ? "bg-[#FEF3C7] text-[#B45309]"
                            : booking.status === "pending" ? "bg-[#DBEAFE] text-[#1E40AF]"
                            : "bg-[#F3F4F6] text-[#6B7280]"
                          }`}>
                            {booking.status.replace("_", " ")}
                          </span>
                          <p className="text-sm font-semibold text-[var(--color-ink)]">
                            ₦{(booking.totalAmountKobo / 100).toLocaleString()}
                          </p>
                          {booking.status === "awaiting_payment" && (
                            <Link href={`/bookings/${booking.id}/pay`} className="rounded-xl bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white">
                              Pay Now
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
