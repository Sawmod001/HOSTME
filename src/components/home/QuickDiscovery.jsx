import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionContainer, SectionHeading } from "./Section";
import Reveal from "./Reveal";
import { QUICK_DISCOVERY } from "@/config/homepage";

export default function QuickDiscovery({ gate }) {
  return (
    <SectionContainer className="bg-[var(--color-night)] py-12 sm:py-16">
      <SectionHeading
        eyebrow="Quick discovery"
        title="What are you looking for?"
        subtitle="Start with the space that fits your plans."
      />

      <div className="grid gap-6 sm:grid-cols-2">
        {QUICK_DISCOVERY.map((card, i) => (
          <Reveal key={card.key} delay={i * 80}>
            <Link
              href={card.href}
              onClick={(e) => gate(e, card.href)}
              className="group relative flex h-[320px] flex-col overflow-hidden rounded-[20px] border border-[var(--color-night-border)] bg-[var(--color-night-card)] shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-flame-bright)]/40 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-flame-bright)]"
            >
              <div className="relative h-[68%] overflow-hidden">
                <img
                  src={card.image}
                  alt={`${card.label} — ${card.title}`}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  loading="lazy"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/5 to-transparent"
                />
                <span
                  aria-hidden="true"
                  className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[var(--color-night)] shadow transition-transform duration-300 group-hover:translate-x-0.5"
                >
                  <ArrowRight size={16} />
                </span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="font-serif-display text-xl font-semibold text-[var(--color-night-text)]">{card.label}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--color-night-muted)]">{card.title}</p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-flame-bright)] group-hover:gap-2">
                  {card.cta} <ArrowRight size={14} aria-hidden="true" />
                </span>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </SectionContainer>
  );
}
