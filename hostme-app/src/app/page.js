"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { MapPin, Building2, Home, Package, Music2, Cake, Star, Mic2, Gamepad2, Menu, X, ArrowRight, ChevronDown, Users, Link2, Wallet } from "lucide-react";
import Logo from "@/components/Logo";

const VERTICAL_ICONS = { venue: Building2, housing: Home, preorder: Package };
const CATEGORIES = [
  { key: "birthday", icon: Cake, label: "Birthday", desc: "Party venues with decorations, cake & fun" },
  { key: "exclusive_space", icon: Star, label: "Exclusive Space", desc: "Private halls, event centers & VIP rooms" },
  { key: "karaoke", icon: Mic2, label: "Karaoke", desc: "Sing your heart out with pro sound systems" },
  { key: "group_night", icon: Gamepad2, label: "Group Night", desc: "Pool, games, bar & group fun" },
];

export default function HomePage() {
  const router = useRouter();
  const [listings, setListings] = useState([]);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    fetch("/api/listings?limit=6")
      .then((r) => r.json())
      .then((d) => setListings(d.data || []))
      .catch(() => {});
    fetch("/api/auth/profile-status")
      .then((r) => r.json())
      .then((d) => setAuthenticated(!!d.authenticated))
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  const requireAccount = (e, href) => {
    if (authChecked && authenticated) return;
    if (!authChecked) return;
    e.preventDefault();
    router.push(`/sign-up?next=${encodeURIComponent(href)}`);
  };

  return (
    <div className="min-h-screen bg-[var(--color-surface-alt)]">
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:py-4">
          <Logo href="/" />

          <nav className="hidden items-center gap-1 sm:flex">
            <Link href="/listings" onClick={(e) => requireAccount(e, "/listings")} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-ink)]">Browse</Link>
            <Link href="/group-plans" onClick={(e) => requireAccount(e, "/group-plans")} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-ink)]">Group booking</Link>
            <Link href="/sign-in" className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-ink)]">Sign in</Link>
            <Link href="/sign-up" className="ml-2 rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--color-primary-dark)]">Get started</Link>
          </nav>

          <button onClick={() => setMobileMenu(!mobileMenu)} className="flex items-center justify-center rounded-xl p-2 sm:hidden">
            {mobileMenu ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {mobileMenu && (
          <div className="border-t border-[var(--color-border)] bg-white px-4 py-4 sm:hidden animate-fade-in">
            <nav className="flex flex-col gap-2">
              <Link href="/listings" onClick={(e) => { setMobileMenu(false); requireAccount(e, "/listings"); }} className="rounded-xl px-4 py-3 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]">Browse spaces</Link>
              <Link href="/group-plans" onClick={(e) => { setMobileMenu(false); requireAccount(e, "/group-plans"); }} className="rounded-xl px-4 py-3 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]">Group booking</Link>
              <Link href="/sign-in" onClick={() => setMobileMenu(false)} className="rounded-xl px-4 py-3 text-sm font-semibold text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-alt)]">Sign in</Link>
              <Link href="/sign-up" onClick={() => setMobileMenu(false)} className="rounded-xl bg-[var(--color-primary)] px-4 py-3 text-center text-sm font-semibold text-white">Get started</Link>
            </nav>
          </div>
        )}
      </header>

      <section className="relative overflow-hidden bg-white">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary-subtle)] via-white to-white" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24 lg:py-32">
          <div className="mx-auto max-w-3xl text-center animate-slide-up">
            <span className="inline-flex rounded-full bg-[var(--color-primary-light)] px-4 py-1.5 text-xs font-semibold text-[var(--color-primary)] mb-6">Nigeria&apos;s premier space marketplace</span>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl" style={{ color: "var(--color-ink)" }}>
              Discover unique spaces in{" "}
              <span style={{ color: "var(--color-primary)" }}>Ilorin</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed sm:text-lg" style={{ color: "var(--color-ink-muted)" }}>
              From lively karaoke bars to elegant event centers — find and book the perfect space for any occasion.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/listings" onClick={(e) => requireAccount(e, "/listings")} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-8 py-3.5 font-semibold text-white transition-all hover:bg-[var(--color-primary-dark)] sm:w-auto">
                Browse spaces <ArrowRight size={18} />
              </Link>
              <Link href="/sign-up" className="btn-outline w-full px-8 py-3.5 sm:w-auto">
                List your space
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-semibold sm:text-3xl" style={{ color: "var(--color-ink)" }}>What are you looking for?</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--color-ink-muted)" }}>Browse by category to find your perfect space</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <Link key={cat.key} href={`/listings?vertical=venue&subVertical=${cat.key}`} onClick={(e) => requireAccount(e, `/listings?vertical=venue&subVertical=${cat.key}`)}
                className="group relative rounded-2xl border border-[var(--color-border)] bg-white p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-primary)] hover:shadow-lg">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] transition-all duration-300 group-hover:bg-[var(--color-primary)] group-hover:text-white">
                  <Icon size={24} />
                </div>
                <h3 className="font-semibold" style={{ color: "var(--color-ink)" }}>{cat.label}</h3>
                <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>{cat.desc}</p>
              </Link>
            );
          })}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link href="/listings?vertical=housing" onClick={(e) => requireAccount(e, "/listings?vertical=housing")}
            className="group relative rounded-2xl border border-[var(--color-border)] bg-white p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-primary)] hover:shadow-lg">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] transition-all duration-300 group-hover:bg-[var(--color-primary)] group-hover:text-white">
              <Home size={24} />
            </div>
            <h3 className="font-semibold" style={{ color: "var(--color-ink)" }}>Housing & Shortlets</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>Apartments, houses and short-term rentals</p>
          </Link>
          <Link href="/listings?vertical=preorder" onClick={(e) => requireAccount(e, "/listings?vertical=preorder")}
            className="group relative rounded-2xl border border-[var(--color-border)] bg-white p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-primary)] hover:shadow-lg">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] transition-all duration-300 group-hover:bg-[var(--color-primary)] group-hover:text-white">
              <Package size={24} />
            </div>
            <h3 className="font-semibold" style={{ color: "var(--color-ink)" }}>Food Pre-Order</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>Order from local cuisines ready when you are</p>
          </Link>
        </div>
      </section>

      {listings.length > 0 && (
        <section className="border-t border-[var(--color-border)] bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-semibold sm:text-3xl" style={{ color: "var(--color-ink)" }}>Featured spaces</h2>
                <p className="mt-1 text-sm" style={{ color: "var(--color-ink-muted)" }}>Popular venues handpicked for you</p>
              </div>
              <Link href="/listings" onClick={(e) => requireAccount(e, "/listings")} className="hidden items-center gap-1 text-sm font-semibold sm:flex" style={{ color: "var(--color-primary)" }}>
                View all <ArrowRight size={16} />
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => {
                const Icon = VERTICAL_ICONS[listing.vertical] || Building2;
                return (
                  <Link key={listing.id} href={`/listings/${listing.id}`} onClick={(e) => requireAccount(e, `/listings/${listing.id}`)}
                    className="group rounded-2xl border border-[var(--color-border)] bg-white overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                    <div className="h-44 overflow-hidden bg-[var(--color-surface-alt)] sm:h-48">
                      {listing.media?.[0] ? (
                        <img src={listing.media[0]} alt={listing.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" onError={(e) => { e.target.style.display = "none" }} />
                      ) : (
                        <div className="flex h-full items-center justify-center"><Icon size={48} style={{ color: "var(--color-ink-muted)" }} /></div>
                      )}
                    </div>
                    <div className="p-4 sm:p-5">
                      <h3 className="font-semibold transition-colors group-hover:text-[var(--color-primary)]" style={{ color: "var(--color-ink)" }}>{listing.title}</h3>
                      <div className="mt-1 flex items-center gap-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                        <MapPin size={12} /> {listing.location?.cityArea}, {listing.location?.state}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex flex-wrap gap-1.5">
                          {(Array.isArray(listing.subVertical) ? listing.subVertical : (listing.subVertical ? [listing.subVertical] : [])).map((sv) => (
                            <span key={sv} className="rounded-full bg-[var(--color-primary-light)] px-2.5 py-0.5 text-xs font-medium capitalize" style={{ color: "var(--color-primary-dark)" }}>{sv.replace(/_/g, " ")}</span>
                          ))}
                        </div>
                        <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>₦{((listing.pricing?.baseRatePerHour ?? 0) / 100).toLocaleString()}<span className="text-xs font-normal" style={{ color: "var(--color-ink-muted)" }}>/hr</span></span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            <div className="mt-10 text-center sm:hidden">
              <Link href="/listings" onClick={(e) => requireAccount(e, "/listings")} className="btn-outline gap-1 px-6 py-3">
                View all spaces <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="border-t border-[var(--color-border)] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex rounded-full bg-[var(--color-primary-light)] px-4 py-1.5 text-xs font-semibold text-[var(--color-primary)] mb-4">Group booking</span>
            <h2 className="text-2xl font-semibold sm:text-3xl" style={{ color: "var(--color-ink)" }}>Book together, split the cost</h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              Planning a hangout, birthday or group night? Start a plan, share one link, and everyone pays their own share.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              { icon: Users, title: "Pick a venue & slot", desc: "Choose a group-friendly venue, a date, and how many people you're bringing." },
              { icon: Link2, title: "Share the invite link", desc: "Send the link on WhatsApp, Instagram or anywhere — friends join with a tap." },
              { icon: Wallet, title: "Everyone pays their share", desc: "Each person pays only their part. The plan auto-confirms when the group fills up." },
            ].map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="rounded-2xl border border-[var(--color-border)] bg-white p-6 text-center shadow-sm shadow-black/[0.02]">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)]">
                    <Icon size={24} />
                  </div>
                  <p className="text-xs font-bold tracking-wide text-[var(--color-primary)]">STEP {i + 1}</p>
                  <h3 className="mt-1 font-semibold" style={{ color: "var(--color-ink)" }}>{step.title}</h3>
                  <p className="mt-1 text-sm" style={{ color: "var(--color-ink-muted)" }}>{step.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-10 text-center">
            <Link href="/listings?vertical=venue" onClick={(e) => requireAccount(e, "/listings?vertical=venue")}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-8 py-3.5 font-semibold text-white transition-all hover:bg-[var(--color-primary-dark)]">
              Find a group-friendly venue <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-[var(--color-surface-alt)]">
        <div className="mx-auto max-w-2xl px-4 py-16 sm:py-24">
          <div className="mb-12 text-center">
            <span className="inline-flex rounded-full bg-[var(--color-primary-light)] px-4 py-1.5 text-xs font-semibold text-[var(--color-primary)] mb-4">Support</span>
            <h2 className="text-2xl font-semibold sm:text-3xl" style={{ color: "var(--color-ink)" }}>Frequently asked questions</h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>Everything you need to know about using HostMe.</p>
          </div>
          <div className="space-y-4">
            {[
              { q: "What is HostMe?", a: "HostMe is Nigeria's premier marketplace for discovering and booking unique spaces. From lively karaoke bars and elegant event centers to shortlet apartments and food pre-orders — we connect you with the perfect space for every occasion." },
              { q: "How do I book a space?", a: "Browse listings, find a space you like, select your date and time, then complete your booking. Capacity bookings let you reserve a slot instantly. Exclusive spaces require a request — the host confirms availability, then you pay to secure it." },
              { q: "What is group booking?", a: "Group booking lets you split the cost of a venue with friends. One person starts the plan and shares the link — each friend joins with their HostMe account and pays their own share in Naira. The plan auto-confirms once the group fills up, or cancels with refunds if it doesn't by the close date. A free account is needed to start or join." },
              { q: "What types of spaces are available?", a: "We offer three verticals: Venues (karaoke bars, event centers, party halls, exclusive spaces), Housing (shortlets and apartments), and Food Pre-Order. Each listing clearly shows its category, pricing, and available add-ons." },
              { q: "How do payments work?", a: "All payments are processed securely through Paystack — Nigeria's leading PCI-compliant payment gateway. You can pay via debit card, USSD, bank transfer, or QR code. Funds are only charged once the booking is confirmed." },
              { q: "Can I list my own space?", a: "Yes! Sign up as a host, create a listing with photos, pricing, and availability rules, then submit for admin review. Once approved, your space goes live for thousands of potential guests to discover and book." },
              { q: "What is the difference between capacity and exclusive booking?", a: "Capacity booking works like event tickets — you reserve a spot in a shared experience (e.g., a karaoke session). Exclusive booking gives you full private access to a space for a specific time window (e.g., renting an entire event center)." },
              { q: "Is HostMe available outside Ilorin?", a: "We currently operate in Ilorin, Kwara State. Expansion to other Nigerian cities is on the roadmap. Follow us for announcements about new locations." },
              { q: "What if I need to cancel a booking?", a: "Each listing clearly shows its cancellation policy (flexible, moderate, or strict) before you book. Refunds are processed according to that policy. Contact the host directly for special circumstances or disputes." },
            ].map((faq, i) => (
              <div key={i} className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm shadow-black/[0.02] transition-all duration-200 hover:shadow-md hover:border-[var(--color-primary)]/20">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  aria-expanded={openFaq === i}
                >
                  <span className="text-[15px] font-semibold leading-snug" style={{ color: "var(--color-ink)" }}>{faq.q}</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors" style={{ backgroundColor: openFaq === i ? "var(--color-primary-light)" : "var(--color-surface-alt)" }}>
                    <ChevronDown size={15} className={`transition-transform duration-300 ${openFaq === i ? "rotate-180" : ""}`} style={{ color: "var(--color-primary)" }} />
                  </span>
                </button>
                {openFaq === i && (
                  <p className="border-t border-[var(--color-border-light)] px-6 pb-5 pt-4 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>{faq.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--color-border)] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <Logo size="sm" />
            <nav className="flex flex-wrap justify-center gap-4 text-sm" style={{ color: "var(--color-ink-muted)" }}>
              <Link href="/listings" onClick={(e) => requireAccount(e, "/listings")} className="hover:text-[var(--color-primary)]">Browse</Link>
              <Link href="/group-plans" onClick={(e) => requireAccount(e, "/group-plans")} className="hover:text-[var(--color-primary)]">Group booking</Link>
              <Link href="/sign-up" className="hover:text-[var(--color-primary)]">List your space</Link>
              <Link href="/sign-in" className="hover:text-[var(--color-primary)]">Sign in</Link>
            </nav>
          </div>
          <div className="mt-6 border-t border-[var(--color-border-light)] pt-6 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>
            &copy; {new Date().getFullYear()} HostMe. All rights reserved.
          </div>
        </div>
      </footer>

      <Script id="faq-schema" type="application/ld+json" strategy="lazyOnload">{`
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {"@type":"Question","name":"What is HostMe?","acceptedAnswer":{"@type":"Answer","text":"HostMe is Nigeria's premier marketplace for discovering and booking unique spaces — from karaoke bars and event centers to shortlet apartments."}},
            {"@type":"Question","name":"How do I book a space?","acceptedAnswer":{"@type":"Answer","text":"Browse listings, find a space, select your date and time, then complete your booking. Capacity bookings are instant; exclusive spaces require host confirmation."}},
            {"@type":"Question","name":"What types of spaces are available?","acceptedAnswer":{"@type":"Answer","text":"Venues (karaoke, event centers, party halls), Housing (shortlets, apartments), and Food Pre-Order."}},
            {"@type":"Question","name":"How do payments work?","acceptedAnswer":{"@type":"Answer","text":"All payments are processed securely through Paystack. You can pay via debit card, USSD, bank transfer, or QR code."}},
            {"@type":"Question","name":"Can I list my own space?","acceptedAnswer":{"@type":"Answer","text":"Yes! Sign up as a host, create a listing with photos and pricing, submit for review, and go live once approved."}},
            {"@type":"Question","name":"What is the difference between capacity and exclusive booking?","acceptedAnswer":{"@type":"Answer","text":"Capacity booking reserves a spot in a shared experience. Exclusive booking gives you full private access to a space for a specific time."}},
            {"@type":"Question","name":"Is HostMe available outside Ilorin?","acceptedAnswer":{"@type":"Answer","text":"We currently operate in Ilorin, Kwara State. Expansion to other Nigerian cities is on the roadmap."}},
            {"@type":"Question","name":"What if I need to cancel a booking?","acceptedAnswer":{"@type":"Answer","text":"Each listing shows its cancellation policy. Refunds are processed according to that policy."}}
          ]
        }
      `}</Script>
    </div>
  );
}
