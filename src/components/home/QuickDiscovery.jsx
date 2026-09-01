"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
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

      {/* Editorial asymmetric: 1 large portrait + 1 wide */}
      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
        {QUICK_DISCOVERY.map((card, i) => {
          const isVenues = card.key === "venues";
          return (
            <Reveal key={card.key} delay={i * 80} className="h-full">
              <motion.div
                initial={{ clipPath: "inset(0 100% 0 0)" }}
                whileInView={{ clipPath: "inset(0 0% 0 0)" }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.9, ease: [0.21, 0.47, 0.32, 0.98], delay: i * 0.1 }}
                className="group relative h-full overflow-hidden rounded-[20px] border border-[var(--color-night-border)] bg-[var(--color-night-card)]"
              >
                <Link
                  href={card.href}
                  onClick={(e) => gate(e, card.href)}
                  className="flex h-full flex-col focus-visible:outline-none"
                >
                  <div className={`relative overflow-hidden ${isVenues ? "aspect-[4/2.8]" : "aspect-[4/3.4]"}`}>
                    <img
                      src={card.image}
                      alt={`${card.label} — ${card.title}`}
                      className="h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.03]"
                      style={{ objectPosition: isVenues ? "center 35%" : "center 30%" }}
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
                    <span className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold tracking-widest text-[var(--color-ink)]">
                      0{i + 1}
                    </span>
                    <span
                      aria-hidden="true"
                      className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[var(--color-night)] shadow transition-transform duration-300 group-hover:translate-x-0.5 group-hover:scale-105"
                    >
                      <ArrowRight size={16} />
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="font-semibold text-[var(--color-night-text)]" style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: "1.25rem" }}>
                      {card.label}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--color-night-muted)]">{card.title}</p>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-flame-bright)]">
                      {card.cta} <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            </Reveal>
          );
        })}
      </div>

      {/* Editorial annotation — tiny handwritten */}
      <p className="mt-4 text-center text-[11px] tracking-wide text-white/30" style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}>
        — Real listings • No fake venues —
      </p>
    </SectionContainer>
  );
}
