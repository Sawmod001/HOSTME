"use client";

import Link from "next/link";
import { LogOut, X, Shield } from "lucide-react";
import Logo from "@/components/Logo";

export default function HostSidebar({ activePage, onClose }) {
  const linkClass = (page) =>
    `rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
      activePage === page
        ? "bg-[var(--color-primary)] text-white"
        : "text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]"
    }`;

  return (
    <nav className="flex flex-col gap-2">
      <div className="mb-6 flex items-center justify-between">
        <Logo size="sm" />
        <button className="lg:hidden" onClick={onClose} aria-label="Close menu">
          <X size={20} />
        </button>
      </div>

      <Link href="/host/dashboard" className={linkClass("dashboard")}>
        Dashboard
      </Link>
      <Link href="/host/listings" className={linkClass("listings")}>
        My Listing
      </Link>
      <Link href="/host/bookings" className={linkClass("bookings")}>
        Reservations
      </Link>
      <Link href="/host/verification" className={linkClass("verification")}>
        <span className="flex items-center gap-2">
          <Shield size={16} />
          Verification
        </span>
      </Link>

      <div className="mt-auto pt-6">
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/sign-in";
          }}
          className="flex w-full items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-alt)]"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </nav>
  );
}
