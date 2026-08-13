import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getClerkUser } from "@/lib/auth/getSessionUser";
import { verifyClerkSession } from "@/lib/auth/getSessionUser";
import Link from "next/link";
import { ShieldCheck, FileText, AlertTriangle, Eye } from "lucide-react";

async function getAdminUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("__session")?.value;
  if (!token) return null;

  let userId, sessionId;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    userId = payload.sub || payload.user_id;
    sessionId = payload.sid;
  } catch {
    return null;
  }

  const isValid = await verifyClerkSession(sessionId, userId);
  if (!isValid) return null;

  const user = await getClerkUser(userId);
  if (!user?.roles?.includes("admin")) return null;

  return user;
}

export default async function AdminPage() {
  const adminUser = await getAdminUser();
  if (!adminUser) notFound();

  const sections = [
    {
      title: "Pending Approvals",
      description: "Review and approve new listings from hosts",
      href: "/admin/listings/pending",
      icon: FileText,
    },
    {
      title: "Dispute Resolution",
      description: "Review evidence and resolve disputes",
      href: "#",
      icon: AlertTriangle,
      disabled: true,
    },
    {
      title: "Fraud Monitor",
      description: "Review flagged chat-scrub events",
      href: "#",
      icon: Eye,
      disabled: true,
    },
    {
      title: "Platform Health",
      description: "Transaction volume, active listings, open disputes",
      href: "#",
      icon: ShieldCheck,
      disabled: true,
    },
  ];

  return (
    <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-3xl font-semibold text-[var(--color-ink)]">Admin Portal</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Platform management and oversight
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {sections.map((section) => {
            const Icon = section.icon;
            if (section.disabled) {
              return (
                <div
                  key={section.title}
                  className="cursor-not-allowed rounded-2xl border border-[var(--color-border)] bg-white/50 p-6 opacity-50"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-[var(--color-surface-alt)] p-2 text-[var(--color-ink-muted)]">
                      <Icon size={20} />
                    </div>
                    <div>
                      <h2 className="font-semibold text-[var(--color-ink)]">{section.title}</h2>
                      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{section.description}</p>
                      <span className="mt-2 inline-block text-xs text-[var(--color-ink-muted)]">Coming soon</span>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <Link
                key={section.title}
                href={section.href}
                className="rounded-2xl border border-[var(--color-border)] bg-white p-6 transition-colors hover:border-[var(--color-primary)]"
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-[var(--color-primary-light)] p-2 text-[var(--color-primary)]">
                    <Icon size={20} />
                  </div>
                  <div>
                    <h2 className="font-semibold text-[var(--color-ink)]">{section.title}</h2>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{section.description}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}