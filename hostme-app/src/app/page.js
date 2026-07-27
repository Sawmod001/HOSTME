"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Building2, Home, Package, Music2, Cake, Star, Mic2, Gamepad2, Menu, X, ArrowRight } from "lucide-react";
import Logo from "@/components/Logo";

const VERTICAL_ICONS = { venue: Building2, housing: Home, preorder: Package };
const CATEGORIES = [
  { key: "birthday", icon: Cake, label: "Birthday", desc: "Party venues with decorations, cake & fun" },
  { key: "exclusive_space", icon: Star, label: "Exclusive Space", desc: "Private halls, event centers & VIP rooms" },
  { key: "karaoke", icon: Mic2, label: "Karaoke", desc: "Sing your heart out with pro sound systems" },
  { key: "group_night", icon: Gamepad2, label: "Group Night", desc: "Pool, games, bar & group fun" },
];

export default function HomePage() {
  const [listings, setListings] = useState([]);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    fetch("/api/listings?limit=6")
      .then((r) => r.json())
      .then((d) => setListings(d.data || []))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-surface-alt)]">
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:py-4">
          <Logo href="/" />

          <nav className="hidden items-center gap-1 sm:flex">
            <Link href="/listings" className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-ink)]">Browse</Link>
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
              <Link href="/listings" onClick={() => setMobileMenu(false)} className="rounded-xl px-4 py-3 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]">Browse spaces</Link>
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
              <Link href="/listings" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-8 py-3.5 font-semibold text-white transition-all hover:bg-[var(--color-primary-dark)] sm:w-auto">
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
              <Link key={cat.key} href={`/listings?vertical=venue&subVertical=${cat.key}`}
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
          <Link href="/listings?vertical=housing"
            className="group relative rounded-2xl border border-[var(--color-border)] bg-white p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-primary)] hover:shadow-lg">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] transition-all duration-300 group-hover:bg-[var(--color-primary)] group-hover:text-white">
              <Home size={24} />
            </div>
            <h3 className="font-semibold" style={{ color: "var(--color-ink)" }}>Housing & Shortlets</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>Apartments, houses and short-term rentals</p>
          </Link>
          <Link href="/listings?vertical=preorder"
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
              <Link href="/listings" className="hidden items-center gap-1 text-sm font-semibold sm:flex" style={{ color: "var(--color-primary)" }}>
                View all <ArrowRight size={16} />
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => {
                const Icon = VERTICAL_ICONS[listing.vertical] || Building2;
                return (
                  <Link key={listing.id} href={`/listings/${listing.id}`}
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
              <Link href="/listings" className="btn-outline gap-1 px-6 py-3">
                View all spaces <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-[var(--color-border)] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <Logo size="sm" />
            <nav className="flex flex-wrap justify-center gap-4 text-sm" style={{ color: "var(--color-ink-muted)" }}>
              <Link href="/listings" className="hover:text-[var(--color-primary)]">Browse</Link>
              <Link href="/sign-up" className="hover:text-[var(--color-primary)]">List your space</Link>
              <Link href="/sign-in" className="hover:text-[var(--color-primary)]">Sign in</Link>
            </nav>
          </div>
          <div className="mt-6 border-t border-[var(--color-border-light)] pt-6 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>
            &copy; {new Date().getFullYear()} HostMe. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
