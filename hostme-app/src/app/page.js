import Link from "next/link";
import { Compass, ShieldCheck, Sparkles } from "lucide-react";

const features = [
  {
    title: "Discovery-first browsing",
    text: "A mobile-first shell for the landing discovery hub and listing detail experience.",
    icon: Compass,
  },
  {
    title: "Concurrency-safe booking domain",
    text: "The models are shaped around the atomic capacity and exclusive-lock patterns from the spec.",
    icon: ShieldCheck,
  },
  {
    title: "Design-system-ready UI",
    text: "Loading, empty, error, and disabled states are included in the first shared screen shell.",
    icon: Sparkles,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--color-surface-alt)] px-4 py-8 text-[var(--color-ink)] sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-6xl flex-col gap-6 rounded-[28px] border border-[var(--color-border)] bg-white p-6 shadow-sm sm:p-8 lg:flex-row lg:items-stretch lg:gap-8 lg:p-10">
        <div className="flex-1 space-y-6">
          <div className="inline-flex rounded-full border border-[var(--color-primary-light)] bg-[var(--color-primary-light)] px-3 py-1 text-sm font-semibold text-[var(--color-primary-dark)]">
            Stage 0 foundation
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
              HostMe is being scaffolded as a mobile-first transactional marketplace foundation.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-[var(--color-ink-muted)]">
              The initial build covers the app shell, shared theme tokens, auth entry point, and the core booking models required for later stages.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/signin" className="rounded-xl bg-[var(--color-primary)] px-4 py-3 text-center font-semibold text-white">
              Continue to sign in
            </Link>
            <a href="https://github.com" className="rounded-xl border border-[var(--color-border)] px-4 py-3 text-center font-semibold text-[var(--color-ink)]">
              Review roadmap
            </a>
          </div>
        </div>

        <div className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-4 sm:p-6">
          <div className="space-y-4">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="flex gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4">
                  <div className="mt-1 rounded-xl bg-[var(--color-primary-light)] p-2 text-[var(--color-primary)]">
                    <Icon size={18} />
                  </div>
                  <div>
                    <h2 className="font-semibold">{feature.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">{feature.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
