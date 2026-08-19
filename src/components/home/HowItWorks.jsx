import Link from "next/link";
import { Users, ArrowRight } from "lucide-react";
import { SectionContainer } from "./Section";
import Reveal from "./Reveal";
import { HOW_IT_WORKS, GROUP_BOOKING } from "@/config/homepage";

export default function HowItWorks({ gate }) {
  return (
    <SectionContainer className="bg-[var(--color-night)] py-16 sm:py-24">
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.6fr]">
        <Reveal>
          <div className="lg:sticky lg:top-28">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--color-gold)]">How it works</p>
            <h2 className="font-serif-display text-3xl font-semibold tracking-tight text-[var(--color-night-text)] sm:text-4xl">
              Book a space in three steps
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--color-night-muted)] sm:text-base">
              Search, reserve and go. No phone calls, no guesswork.
            </p>
            <div className="mt-8 hidden h-px w-24 bg-[var(--color-flame-bright)]/60 lg:block" aria-hidden="true" />
          </div>
        </Reveal>

        <div>
          <ol className="relative space-y-10">
            <div
              aria-hidden="true"
              className="absolute bottom-8 left-[1.35rem] top-8 w-px bg-[var(--color-night-border)]"
            />
            {HOW_IT_WORKS.map((step, i) => {
              const Icon = step.icon;
              const num = String(i + 1).padStart(2, "0");
              return (
                <Reveal key={step.title} delay={i * 100}>
                  <li className="relative flex gap-6">
                    <span className="font-serif-display relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-night-border)] bg-[var(--color-night-elevated)] text-sm font-semibold text-[var(--color-flame-bright)]">
                      {num}
                    </span>
                    <div className="pt-1.5">
                      <h3 className="flex items-center gap-2.5 font-semibold text-[var(--color-night-text)]">
                        <Icon size={16} className="text-[var(--color-flame-bright)]" aria-hidden="true" />
                        {step.title}
                      </h3>
                      <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-[var(--color-night-muted)]">{step.desc}</p>
                    </div>
                  </li>
                </Reveal>
              );
            })}
          </ol>
        </div>
      </div>

      <Reveal delay={150}>
        <div className="mt-16 flex flex-col items-start justify-between gap-6 rounded-3xl border border-[var(--color-gold)]/25 bg-[var(--color-night-elevated)] px-7 py-6 sm:flex-row sm:items-center">
          <div className="flex items-start gap-4">
            <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-gold)]/15 text-[var(--color-gold)]">
              <Users size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[var(--color-night-text)]">{GROUP_BOOKING.title}</p>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--color-night-muted)]">{GROUP_BOOKING.subtitle}</p>
            </div>
          </div>
          <Link
            href={GROUP_BOOKING.cta.href}
            onClick={(e) => gate(e, GROUP_BOOKING.cta.href)}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--color-flame)] px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-[var(--color-flame-bright)]"
          >
            {GROUP_BOOKING.cta.label} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </Reveal>
    </SectionContainer>
  );
}