"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, CreditCard, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import PublicHeader from "@/components/PublicHeader";
import BackButton from "@/components/BackButton";

export default function PayPage() {
  const { id } = useParams();
  const router = useRouter();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/bookings/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setBooking(data);
        if (data.status === "confirmed") setDone(true);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handlePay() {
    setPaying(true);
    setError(null);
    try {
      const initRes = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: id }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || "Failed to initiate");

      const confirmRes = await fetch("/api/payments/mock-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: id }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.error || "Payment failed");

      setDone(true);
      setTimeout(() => router.push(`/bookings/${id}`), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-surface-alt)] px-4">
        <Loader2 size={24} className="animate-spin text-[var(--color-ink-muted)]" />
      </main>
    );
  }

  if (error && !booking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-surface-alt)] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
          <p className="text-sm text-[var(--color-ink-muted)]">{error}</p>
          <Link href="/listings" className="mt-4 inline-block rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">Browse listings</Link>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-surface-alt)] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-8 text-center">
          <CheckCircle2 size={40} className="mx-auto text-[#15803D]" />
          <h1 className="mt-4 text-xl font-semibold">Payment Successful</h1>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Redirecting to booking details...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-surface-alt)] px-4">
        <div className="w-full max-w-sm space-y-4">
          <PublicHeader />
          <BackButton href={`/bookings/${id}`} label="Back to booking" />
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
          <h1 className="text-xl font-semibold">Complete Payment</h1>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-ink-muted)]">Amount</span><span className="font-semibold">₦{((booking?.totalAmountKobo || 0) / 100).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-ink-muted)]">Status</span><span className="capitalize">{booking?.status}</span></div>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button onClick={handlePay} disabled={paying} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-3 font-semibold text-white disabled:opacity-50">
            {paying ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
            {paying ? "Processing..." : `Pay ₦${((booking?.totalAmountKobo || 0) / 100).toLocaleString()}`}
          </button>
        </div>
      </div>
    </main>
  );
}
