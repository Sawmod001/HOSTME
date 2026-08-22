"use client";

import Link from "next/link";
import { LogOut, X } from "lucide-react";
import Logo from "@/components/Logo";

export default function GuestSidebar({ roles = [], activePage, onClose }) {
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

      <Link href="/dashboard" className={linkClass("bookings")}>
        My Bookings
      </Link>

      {roles.includes("host") && (
        <Link href="/host/dashboard" className={linkClass("host")}>
          Host Dashboard
        </Link>
      )}

      <Link href="/listings" className={linkClass("browse")}>
        Browse Listings
      </Link>

      <Link href="/profile" className={linkClass("profile")}>
        Profile
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
