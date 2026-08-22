"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, Users } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";

const STATUS_STYLE = {
  active: "bg-[#DBEAFE] text-[#1E40AF]",
  finalized: "bg-[#DCFCE7] text-[#166534]",
  cancelled: "bg-[#F3F4F6] text-[#6B7280]",
};

export default function MyGroupPlansPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/group-plans");
        if (!res.ok) throw new Error("Could not load your plans");
        const data = await res.json();
        const now = Date.now();
        setPlans((data.data || []).map((plan) => ({
          ...plan,
          expired: plan.status === "active" && new Date(plan.expiresAt).getTime() <= now,
        })));
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <PublicHeader />
        <Link href="/" className="flex items-center gap-2 text-[var(--color-primary)] text-sm">
          <ArrowLeft size={16} /> Back to Home
        </Link>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-ink)]">
              <Users size={22} /> My group bookings
            </h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Plans you started or joined. Share the invite link to grow the group.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-[var(--color-border)] bg-white p-12">
            <Loader2 size={20} className="animate-spin text-[var(--color-ink-muted)]" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
            <p className="text-sm text-[var(--color-ink-muted)]">{error}</p>
          </div>
        ) : plans.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)]">
              <Users size={24} />
            </div>
            <h2 className="text-lg font-semibold text-[var(--color-ink)]">No group bookings yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--color-ink-muted)]">
              Book a venue together and split the cost. Start a plan on any group-friendly venue.
            </p>
            <Link href="/listings?vertical=venue"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 py-3 text-sm font-semibold text-white">
              Browse venues <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {plans.map((plan) => {
              const progress = Math.min(100, Math.round((plan.committed / plan.targetHeadcount) * 100));
              const expired = plan.expired;
              return (
                <li key={plan.id}>
                  <Link href={`/group-plans/${plan.id}`}
                    className="block rounded-2xl border border-[var(--color-border)] bg-white p-4 transition-all hover:border-[var(--color-primary)] hover:shadow-md sm:p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--color-ink)]">{plan.listingTitle}</p>
                        <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                          {new Date(plan.eventStart).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })}{" "}
                          {new Date(plan.eventStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize ${expired ? "bg-[#FEF3C7] text-[#B45309]" : STATUS_STYLE[plan.status] || "bg-[#F3F4F6] text-[#6B7280]"}`}>
                        {expired ? "expired" : plan.status}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-alt)]">
                        <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-[var(--color-ink-muted)]">
                        {plan.committed}/{plan.targetHeadcount} people
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
