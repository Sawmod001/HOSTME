"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/home/Header";
import Hero from "@/components/home/Hero";
import Categories from "@/components/home/Categories";
import FeaturedSpaces from "@/components/home/FeaturedSpaces";
import TwoWaysToBook from "@/components/home/TwoWaysToBook";
import HowItWorks from "@/components/home/HowItWorks";
import OneAccountTwoRoles from "@/components/home/OneAccountTwoRoles";
import WhyHostMe from "@/components/home/WhyHostMe";
import Locations from "@/components/home/Locations";
import Testimonials from "@/components/home/Testimonials";
import HostCta from "@/components/home/HostCta";
import Faq from "@/components/home/Faq";
import Footer from "@/components/home/Footer";

export default function HomePage() {
  const router = useRouter();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    fetch("/api/listings?limit=6")
      .then((r) => r.json())
      .then((d) => setListings(d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch("/api/auth/profile-status")
      .then((r) => r.json())
      .then((d) => setAuthenticated(!!d.authenticated))
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  const gate = (e, href) => {
    if (!authChecked) return;
    if (authenticated) return;
    e.preventDefault();
    router.push(`/sign-up?next=${encodeURIComponent(href)}`);
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--color-night)] text-[var(--color-night-text)]">
      <div className="grain pointer-events-none fixed inset-0 z-[1]" aria-hidden="true" />
      <div className="relative z-[2]">
      <Header gate={gate} />
      <main>
        <Hero gate={gate} />
        <Categories gate={gate} />
        <FeaturedSpaces listings={listings} loading={loading} gate={gate} />
        <TwoWaysToBook gate={gate} />
        <HowItWorks gate={gate} />
        <OneAccountTwoRoles gate={gate} />
        <WhyHostMe />
        <Locations gate={gate} />
        <Testimonials />
        <HostCta gate={gate} />
        <Faq />
      </main>
      <Footer gate={gate} />
      </div>
    </div>
  );
}