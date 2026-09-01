"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { HERO } from "@/config/homepage";
import { SectionContainer } from "./Section";

export default function Hero({ gate }) {
  const bg = HERO.images.background;

  return (
    <section className="relative overflow-hidden bg-[var(--color-night)]">
      {/* Amazing motion background — warm flame/gold orbs + emerald */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <img
          src={bg.src}
          alt=""
          width={bg.width}
          height={bg.height}
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover opacity-[0.28]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,18,15,0.65)_0%,rgba(10,18,15,0.85)_60%,rgba(10,18,15,0.98)_100%)]" />
        {/* Motion orbs */}
        <motion.div
          className="absolute -top-24 -left-24 h-[520px] w-[520px] rounded-full blur-[80px]"
          style={{ background: "radial-gradient(circle, rgba(232,74,42,0.22) 0%, transparent 70%)" }}
          animate={{ x: [0, 30, -20, 0], y: [0, -20, 30, 0], scale: [1, 1.05, 0.98, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-32 -right-24 h-[600px] w-[600px] rounded-full blur-[90px]"
          style={{ background: "radial-gradient(circle, rgba(232,184,109,0.14) 0%, transparent 70%)" }}
          animate={{ x: [0, -25, 15, 0], y: [0, 20, -15, 0], scale: [1, 1.03, 0.97, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[70px]"
          style={{ background: "radial-gradient(circle, rgba(20,80,60,0.12) 0%, transparent 70%)" }}
          animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <SectionContainer className="relative flex min-h-[86svh] flex-col justify-center py-16 sm:py-20 lg:min-h-[84svh] lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Left: headline + copy + CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="max-w-xl"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold tracking-wide text-white/80 backdrop-blur">
              <Sparkles size={12} className="text-[var(--color-gold)]" aria-hidden="true" />
              Real Nigerian spaces • Real people • Real bookings
            </span>

            <h1 className="mt-5 text-[36px] font-bold leading-[0.95] tracking-tight text-white sm:text-[48px] lg:text-[56px]">
              Find a place that
              <span className="block font-serif-accent gradient-text">fits your plans.</span>
            </h1>

            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/70 sm:text-[17px]">
              {HERO.subtitle}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={HERO.primaryCta.href}
                onClick={(e) => gate(e, HERO.primaryCta.href)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-flame)] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/20 transition-all hover:-translate-y-0.5 hover:bg-[var(--color-flame-bright)] hover:shadow-xl"
              >
                {HERO.primaryCta.label} <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link
                href={HERO.secondaryCta.href}
                onClick={(e) => gate(e, HERO.secondaryCta.href)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur transition-all hover:bg-white/10"
              >
                Become a Host
              </Link>
            </div>

            <p className="mt-4 text-xs text-white/50">No hidden fees • Pay in Naira via Paystack • Real booking records</p>
          </motion.div>

          {/* Right: Creative Nigeria people imagery — layered cards with motion */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="relative mx-auto w-full max-w-[420px] lg:mx-0 lg:ml-auto"
          >
            {/* Main card — Nigerian celebration with people */}
            <motion.div
              className="relative overflow-hidden rounded-[20px] border border-white/10 bg-white p-2 shadow-2xl shadow-black/30"
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <div className="relative aspect-[4/3.2] overflow-hidden rounded-[14px] bg-[var(--color-night-elevated)]">
                <img
                  src="https://images.pexels.com/photos/3171837/pexels-photo-3171837.jpeg?auto=compress&cs=tinysrgb&w=800"
                  alt="Friends celebrating at a Nigerian venue — real people, real joy"
                  className="h-full w-full object-cover"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-xl bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
                  <span className="text-xs font-semibold text-[var(--color-ink)]">Ilorin • Private lounge</span>
                  <span className="rounded-full bg-[var(--color-flame)] px-2 py-0.5 text-[11px] font-bold text-white">₦2,500/hr</span>
                </div>
              </div>
              <div className="flex items-center gap-2 px-2 py-3">
                <img
                  src="https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=100"
                  alt="Guest avatar"
                  className="h-7 w-7 rounded-full object-cover"
                  loading="lazy"
                />
                <span className="text-xs font-semibold text-[var(--color-ink)]">Aisha • 4 guests • Confirmed</span>
                <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              </div>
            </motion.div>

            {/* Floating card 2 — shortlet with family */}
            <motion.div
              className="absolute -bottom-6 -left-6 hidden w-[200px] overflow-hidden rounded-2xl border border-white/10 bg-white p-2 shadow-xl sm:block"
              initial={{ y: 10, rotate: -1 }}
              animate={{ y: [10, -4, 10], rotate: [-1, 1, -1] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden="true"
            >
              <div className="aspect-[4/3] overflow-hidden rounded-xl">
                <img
                  src="https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=400"
                  alt="Furnished shortlet apartment in Nigeria"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <p className="px-1 pt-2 text-xs font-semibold text-[var(--color-ink)]">Shortlet • 2 beds • Ilorin</p>
              <p className="px-1 text-[11px] text-[var(--color-ink-muted)]">₦18,000 / night</p>
            </motion.div>

            {/* Floating card 3 — outdoor with people */}
            <motion.div
              className="absolute -right-4 top-8 hidden w-[170px] overflow-hidden rounded-2xl border border-white/10 bg-white p-2 shadow-xl lg:block"
              initial={{ y: -6, rotate: 1 }}
              animate={{ y: [-6, 8, -6], rotate: [1, -1, 1] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              aria-hidden="true"
            >
              <div className="aspect-[4/3] overflow-hidden rounded-xl">
                <img
                  src="https://images.pexels.com/photos/2603464/pexels-photo-2603464.jpeg?auto=compress&cs=tinysrgb&w=400"
                  alt="Outdoor garden celebration"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <p className="px-1 pt-2 text-xs font-semibold text-[var(--color-ink)]">Outdoor • Garden</p>
              <p className="px-1 text-[11px] text-[var(--color-gold)]">Exclusive • 6h</p>
            </motion.div>
          </motion.div>
        </div>
      </SectionContainer>
    </section>
  );
}
