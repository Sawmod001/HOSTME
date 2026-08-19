"use client";

import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { HERO } from "@/config/homepage";
import { SectionContainer } from "./Section";

export default function Hero({ gate }) {
  const bg = HERO.images.background;

  return (
    <section className="relative flex min-h-[88svh] items-center overflow-hidden bg-[var(--color-night)]">
      <img
        src={bg.src}
        alt={bg.alt}
        width={bg.width}
        height={bg.height}
        loading="eager"
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,28,20,0.55)_0%,rgba(10,28,20,0.78)_55%,rgba(10,28,20,0.92)_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,28,20,0.75)_0%,rgba(10,28,20,0.25)_70%,rgba(10,28,20,0)_100%)]"
      />

      <SectionContainer className="relative py-24 sm:py-32">
        <div className="max-w-2xl">
          <span className="hero-badge">
            <span className="hero-badge-dot" aria-hidden="true" />
            {HERO.badge}
          </span>

          <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-[var(--color-night-text)] sm:text-5xl lg:text-[3.6rem]">
            {HERO.titleLead}
            <span className="block font-serif-accent gradient-text">{HERO.titleAccent}</span>
          </h1>

          <p className="mt-6 max-w-lg text-base leading-relaxed text-[var(--color-night-muted)] sm:text-lg">
            {HERO.subtitle}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href={HERO.primaryCta.href}
              onClick={(e) => gate(e, HERO.primaryCta.href)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-flame)] px-8 py-3.5 font-semibold text-white shadow-lg shadow-black/25 transition-all hover:-translate-y-0.5 hover:bg-[var(--color-flame-bright)]"
            >
              {HERO.primaryCta.label} <ArrowRight size={18} />
            </Link>
            <Link
              href={HERO.secondaryCta.href}
              onClick={(e) => gate(e, HERO.secondaryCta.href)}
              className="btn-outline-night inline-flex items-center justify-center gap-2 px-7 py-3.5"
            >
              <Building2 size={16} aria-hidden="true" /> {HERO.secondaryCta.label}
            </Link>
          </div>
        </div>
      </SectionContainer>
    </section>
  );
}