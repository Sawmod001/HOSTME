import Link from "next/link";
import Logo from "@/components/Logo";

const DASHBOARD_BY_ROLE = {
  guest: "/dashboard",
  venue_host: "/host/dashboard",
  shortlet_host: "/host/dashboard",
  admin: "/admin",
};

export default function PublicHeader({ backHref, role }) {
  const dashboardPath = DASHBOARD_BY_ROLE[role] || "/dashboard";

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Logo size="sm" href="/" />
        <div className="flex items-center gap-3">
          {backHref && (
            <Link href={backHref} className="text-sm font-semibold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
              ← Back
            </Link>
          )}
          <Link href="/listings" className="text-sm font-semibold text-[var(--color-ink)] hover:text-[var(--color-primary)]">
            Browse
          </Link>
          <Link href={dashboardPath} className="rounded-xl bg-[var(--color-primary)] px-4 py-1.5 text-sm font-semibold text-white">
            Dashboard
          </Link>
        </div>
      </div>
    </header>
  );
}
