"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SSOCallback() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.push("/dashboard"), 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-surface-alt)]">
      <p className="text-sm text-[var(--color-ink-muted)]">Redirecting to dashboard...</p>
    </main>
  );
}
