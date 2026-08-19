import { Armchair as SeatsIcon, LockKeyhole as LockIcon } from "lucide-react";
import Reveal from "./Reveal";
import { BOOKING_TYPES } from "@/config/homepage";

const ICONS = { seats: SeatsIcon, lock: LockIcon };

export default function TwoWaysToBook({ gate }) {
  const [capacity, exclusive] = BOOKING_TYPES.columns;

  return (
    <section className="border-t border-[var(--color-night-border-soft)] bg-[var(--color-night-soft)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="grid items-end gap-6 lg:grid-cols-[1fr_1.2fr]">
          <Reveal>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--color-gold)]">
                {BOOKING_TYPES.eyebrow}
              </p>
              <h2 className="font-serif-display text-3xl font-semibold tracking-tight text-[var(--color-night-text)] sm:text-4xl">
                {BOOKING_TYPES.title}
              </h2>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <p className="max-w-xl text-sm leading-relaxed text-[var(--color-night-muted)] sm:text-base lg:ml-auto">
              {BOOKING_TYPES.subtitle}
            </p>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <div className={`mt-12 overflow-hidden border border-[var(--color-night-border)] rounded-3xl`}>
            <div className="grid grid-cols-3 overflow-x-auto">
              <div className="p-5 sm:p-6" />
              {[capacity, exclusive].map((col) => {
                const Icon = ICONS[col.icon] || SeatsIcon;
                return (
                  <div key={col.key} className="border-l border-[var(--color-night-border)] bg-[var(--color-night-elevated)] p-5 sm:p-6">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-flame)]/15 text-[var(--color-flame-bright)]">
                        <Icon size={20} aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-night-muted)]">
                          {col.tagline}
                        </p>
                        <h3 className="font-serif-display text-lg font-semibold text-[var(--color-night-text)]">
                          {col.label}
                        </h3>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {BOOKING_TYPES.rows.map((row, i) => (
              <div key={row.label} className={`grid grid-cols-3 ${i % 2 ? "bg-[var(--color-night-card)]/60" : ""}`}>
                <div className="px-5 py-4 sm:px-6 sm:py-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-gold)]">{row.label}</p>
                </div>
                <div className="border-l border-[var(--color-night-border)] px-5 py-4 text-sm leading-relaxed text-[var(--color-night-text)] sm:px-6 sm:py-5">
                  {row.capacity}
                </div>
                <div className="border-l border-[var(--color-night-border)] px-5 py-4 text-sm leading-relaxed text-[var(--color-night-text)] sm:px-6 sm:py-5">
                  {row.exclusive}
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:pl-[33.333%]">
          {BOOKING_TYPES.columns.map((col) => (
            <button
              key={col.key}
              onClick={(e) => gate(e, col.href)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-flame)] px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-[var(--color-flame-bright)]"
            >
              {col.cta}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}