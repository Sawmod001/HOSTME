"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { HERO } from "@/config/homepage";
import { SectionContainer } from "./Section";

export default function Hero({ gate }) {
  const bg = HERO.images.background;
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const yParallax = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section ref={ref} className="relative overflow-hidden bg-[var(--color-night)]">
      {/* Editorial motion background — morphing 3D gradients + 360 rotation */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <img
          src={bg.src}
          alt=""
          width={bg.width}
          height={bg.height}
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover object-[center_30%] opacity-[0.32]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,18,15,0.55)_0%,rgba(10,18,15,0.88)_68%,rgba(10,18,15,0.98)_100%)]" />
        {/* Morph gradient orbs — customizable 3D */}
        <motion.div
          className="morph-blob absolute -top-28 -left-20 h-[560px] w-[560px] blur-[85px]"
          style={{ background: "radial-gradient(circle, rgba(232,74,42,0.20) 0%, transparent 70%)" }}
          animate={{ x: [0, 28, -18, 0], y: [0, -18, 28, 0], rotate: [0, 5, -5, 0], scale: [1, 1.04, 0.99, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="morph-blob absolute -bottom-24 -right-20 h-[620px] w-[620px] blur-[90px]"
          style={{ background: "radial-gradient(circle, rgba(232,184,109,0.13) 0%, transparent 70%)" }}
          animate={{ x: [0, -22, 14, 0], y: [0, 18, -14, 0], rotate: [0, -4, 4, 0], scale: [1, 1.03, 0.98, 1] }}
          transition={{ duration: 24, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
        />
        <motion.div
          className="morph-blob absolute top-[42%] left-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 blur-[75px]"
          style={{ background: "radial-gradient(circle, rgba(20,80,60,0.10) 0%, transparent 70%)" }}
          animate={{ scale: [1, 1.07, 1], opacity: [0.5, 0.85, 0.5], rotate: [0, 180, 360] }}
          transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
        />
        {/* 360 rotating border */}
        <motion.div
          className="absolute top-1/2 left-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.04]"
          animate={{ rotate: 360 }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <SectionContainer className="relative flex min-h-[88svh] flex-col justify-center py-12 sm:py-16 lg:min-h-[84svh] lg:py-12">
        <div className="grid items-center gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-6">
          {/* Left: editorial typography */}
          <motion.div
            style={{ y: yParallax, opacity }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="max-w-xl"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold tracking-wide text-white/80 backdrop-blur">
              <Sparkles size={12} className="text-[var(--color-gold)]" aria-hidden="true" />
              Real Nigerian spaces • Real people
            </span>

            <h1 className="mt-5 font-bold leading-[0.92] tracking-tight text-white" style={{ fontFamily: "var(--font-manrope), var(--font-geist-sans), sans-serif" }}>
              <span className="block text-[36px] sm:text-[48px] lg:text-[58px]">Find a place that</span>
              <span className="block font-normal italic tracking-tight" style={{ fontFamily: "var(--font-instrument-serif), var(--font-fraunces), serif", fontSize: "clamp(36px, 6vw, 58px)" }}>
                fits your plans.
              </span>
            </h1>

            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/65 sm:text-[17px]" style={{ fontFamily: "var(--font-manrope), sans-serif" }}>
              {HERO.subtitle}
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href={HERO.primaryCta.href}
                onClick={(e) => gate(e, HERO.primaryCta.href)}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-flame)] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/20 transition-all hover:-translate-y-0.5 hover:bg-[var(--color-flame-bright)] hover:shadow-xl"
              >
                {HERO.primaryCta.label}
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <Link
                href={HERO.secondaryCta.href}
                onClick={(e) => gate(e, HERO.secondaryCta.href)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur transition-all hover:bg-white/10"
              >
                Become a Host
              </Link>
            </div>
          </motion.div>

          {/* Right: asymmetric editorial grid — 1 large + 2 small, overlapping, clip-path reveal */}
          <div className="relative mx-auto w-full max-w-[440px] lg:mx-0 lg:ml-auto">
            <div className="grid grid-cols-[1.4fr_0.9fr] gap-3">
              {/* Large portrait — thatched gazebo */}
              <motion.div
                className="relative overflow-hidden rounded-[18px] bg-[var(--color-night-elevated)]"
                style={{ aspectRatio: "3/4.2" }}
                initial={{ clipPath: "inset(0 100% 0 0)" }}
                animate={{ clipPath: "inset(0 0% 0 0)" }}
                transition={{ duration: 1.1, ease: [0.21, 0.47, 0.32, 0.98], delay: 0.2 }}
                whileHover={{ scale: 1.01 }}
              >
                <img
                  src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80"
                  alt="Thatched gazebo lounge — Ilorin outdoor space"
                  className="h-full w-full object-cover object-center"
                  style={{ objectPosition: "center 20%" }}
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
                <div className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold tracking-wide text-[var(--color-ink)]">ILORIN • OUTDOOR</div>
              </motion.div>

              <div className="flex flex-col gap-3">
                {/* Small square — pool night */}
                <motion.div
                  className="relative overflow-hidden rounded-[18px] bg-[var(--color-night-elevated)]"
                  style={{ aspectRatio: "1/1" }}
                  initial={{ clipPath: "inset(0 0 100% 0)" }}
                  animate={{ clipPath: "inset(0 0 0% 0)" }}
                  transition={{ duration: 0.9, ease: [0.21, 0.47, 0.32, 0.98], delay: 0.4 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <img
                    src="https://images.unsplash.com/photo-157189034984d-68c53b03a3a3?auto=format&fit=crop&w=600&q=80"
                    alt="Resort pool at night — Ella"
                    className="h-full w-full object-cover"
                    style={{ objectPosition: "center 40%" }}
                    loading="eager"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                </motion.div>

                {/* Small portrait — family beach */}
                <motion.div
                  className="relative overflow-hidden rounded-[18px] bg-[var(--color-night-elevated)]"
                  style={{ aspectRatio: "4/5" }}
                  initial={{ clipPath: "inset(100% 0 0 0)" }}
                  animate={{ clipPath: "inset(0% 0 0 0)" }}
                  transition={{ duration: 1.0, ease: [0.21, 0.47, 0.32, 0.98], delay: 0.55 }}
                  whileHover={{ scale: 1.01 }}
                >
                  <img
                    src="https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=600&q=80"
                    alt="Family enjoying beach — shortlet guests"
                    className="h-full w-full object-cover object-top"
                    loading="lazy"
                  />
                  <div className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-bold text-[var(--color-ink)]">BEACH • FAMILY</div>
                </motion.div>
              </div>
            </div>

            {/* Breaking outside grid — rooftop pool wide */}
            <motion.div
              className="relative mt-3 overflow-hidden rounded-[18px] bg-[var(--color-night-elevated)]"
              style={{ aspectRatio: "16/7" }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.7 }}
              whileHover={{ scale: 1.01 }}
            >
              <img
                src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1000&q=80"
                alt="Rooftop infinity pool at sunset"
                className="h-full w-full object-cover object-[center_60%]"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/25 via-transparent to-transparent" />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 -rotate-90 origin-left">
                <span className="text-[10px] font-bold tracking-[0.2em] text-white/60" style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}>ROOFTOP • LAGOS</span>
              </div>
            </motion.div>

            {/* Overlapping tiny — apartment exterior, partially hidden behind typography */}
            <motion.div
              className="absolute -bottom-4 -left-4 hidden w-[160px] overflow-hidden rounded-2xl border border-white/10 bg-white p-1.5 shadow-xl sm:block"
              initial={{ y: 16, rotate: -2 }}
              animate={{ y: [16, -8, 16], rotate: [-2, 1, -2] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden="true"
            >
              <div className="aspect-[1/1] overflow-hidden rounded-xl">
                <img
                  src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=80"
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </SectionContainer>
    </section>
  );
}
