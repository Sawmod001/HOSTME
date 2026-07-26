"use client";

import { Suspense } from "react";
import { useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailAddressId = searchParams.get("emailAddressId");
  const abortRef = useRef(null);

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!code.trim() || code.length < 4) {
      setError("Please enter the full verification code.");
      return;
    }

    if (!emailAddressId) {
      setError("Missing verification information. Please sign up again.");
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailAddressId, code: code.trim() }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Verification failed.");
        return;
      }

      router.push(data.redirectTo || "/complete-profile");
    } catch (err) {
      if (err.name === "AbortError") {
        setError("Request timed out. Please try again.");
      } else {
        setError("Connection error. Please try again.");
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-surface-alt)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold text-[var(--color-ink)]">Check your email</h1>
        <p className="mb-6 text-sm text-[var(--color-ink-muted)]">
          We sent a verification code to your email. Enter it below.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-[var(--color-ink-muted)]">
              Verification code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              placeholder="000000"
              className="mt-1 block w-full rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || code.length < 4}
            className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify email"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-surface-alt)] px-4">
        <div className="text-[var(--color-ink-muted)]">Loading...</div>
      </main>
    }>
      <VerifyForm />
    </Suspense>
  );
}
