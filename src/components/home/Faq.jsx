"use client";

import { useState } from "react";
import Script from "next/script";
import { ChevronDown } from "lucide-react";
import { SectionContainer, SectionHeading } from "./Section";
import Reveal from "./Reveal";
import { FAQS } from "@/config/homepage";

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.a,
    },
  })),
};

export default function Faq() {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <section className="border-t border-[var(--color-night-border-soft)] bg-[var(--color-night)]">
      <SectionContainer className="py-16 sm:py-24" id="faq">
        <SectionHeading
          eyebrow="Support"
          title="Frequently asked questions"
          subtitle="Everything you need to know about using ClockHost."
        />

        <div className="grid gap-4 lg:grid-cols-2">
          {FAQS.map((faq, i) => {
            const isOpen = openFaq === i;
            return (
              <Reveal key={i} delay={(i % 2) * 60} className="h-full">
                <div
                  className={`flex h-full flex-col rounded-2xl border bg-[var(--color-night-card)] transition-all duration-200 ${
                    isOpen ? "border-[var(--color-flame-bright)]/50 shadow-lg" : "border-[var(--color-night-border)]"
                  }`}
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${i}`}
                    id={`faq-tab-${i}`}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  >
                    <span className="text-[15px] font-semibold leading-snug text-[var(--color-night-text)]">
                      {faq.q}
                    </span>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                        isOpen ? "bg-[var(--color-flame)]/15" : "bg-white/5"
                      }`}
                    >
                      <ChevronDown
                        size={15}
                        className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                        style={{ color: "var(--color-flame-bright)" }}
                        aria-hidden="true"
                      />
                    </span>
                  </button>
                  {isOpen && (
                    <p
                      id={`faq-panel-${i}`}
                      role="region"
                      aria-labelledby={`faq-tab-${i}`}
                      className="border-t border-[var(--color-night-border-soft)] px-6 pb-5 pt-4 text-sm leading-relaxed text-[var(--color-night-muted)] animate-fade-in"
                    >
                      {faq.a}
                    </p>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </SectionContainer>

      <Script id="faq-schema" type="application/ld+json" strategy="lazyOnload">
        {JSON.stringify(FAQ_SCHEMA)}
      </Script>
    </section>
  );
}