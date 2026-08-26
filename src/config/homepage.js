import { Cake, Star, Mic2, Gamepad2, Home, ShieldCheck, Zap, Users, Wallet, MapPin, CheckCircle2 } from "lucide-react";

export const SITE = {
  name: "HostMe",
  tagline: "Nigeria's space marketplace",
  baseUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://hostme-xbhx.vercel.app",
};

export const HERO = {
  badge: "Nigeria's premier space marketplace",
  titleLead: "Discover unique spaces",
  titleAccent: "in Ilorin",
  titleAccentNote: "Ilorin",
  subtitle:
    "From lively karaoke bars and elegant event centers to shortlet apartments, find and book the perfect space for any occasion in minutes.",
  primaryCta: { label: "Browse spaces", href: "/listings" },
  secondaryCta: { label: "List your space", href: "/sign-up" },
  images: {
    background: {
      src: "https://images.pexels.com/photos/6312353/pexels-photo-6312353.jpeg?auto=compress&cs=tinysrgb&w=1920",
      alt: "Cozy shortlet interior with a warm sofa and soft light",
      width: 1920,
      height: 1280,
    },
  },
};

export const NAV_LINKS = [
  { label: "Browse spaces", href: "/listings" },
  { label: "Group booking", href: "/group-plans" },
];

export const CATEGORIES = [
  { key: "birthday", icon: Cake, label: "Birthday", desc: "Party venues with decor and fun", href: "/listings?vertical=venue&subVertical=birthday" },
  { key: "exclusive_space", icon: Star, label: "Exclusive Space", desc: "Private halls and VIP rooms", href: "/listings?vertical=venue&subVertical=exclusive_space" },
  { key: "karaoke", icon: Mic2, label: "Karaoke", desc: "Pro sound systems, sing your heart out", href: "/listings?vertical=venue&subVertical=karaoke" },
  { key: "group_night", icon: Gamepad2, label: "Group Night", desc: "Pool, games, bar and group fun", href: "/listings?vertical=venue&subVertical=group_night" },
  { key: "housing", icon: Home, label: "Housing & Shortlets", desc: "Apartments and short-term rentals", href: "/listings?vertical=housing" },
];

export const HOW_IT_WORKS = [
  {
    icon: MapPin,
    title: "Find a space",
    desc: "Browse verified venues with clear pricing and availability, filtered by your city and occasion.",
  },
  {
    icon: CheckCircle2,
    title: "Book in minutes",
    desc: "Confirm a capacity slot instantly or request an exclusive space and pay to secure it.",
  },
  {
    icon: Zap,
    title: "Show up and enjoy",
    desc: "Your booking details arrive right away, so you can focus on the moment.",
  },
];

export const GROUP_BOOKING = {
  badge: "Group booking",
  title: "Book together, split the cost",
  subtitle:
    "Planning a hangout, birthday or group night? Start a plan, share one link and everyone pays their own share.",
  steps: [
    {
      icon: Users,
      title: "Pick a venue and slot",
      desc: "Choose a group-friendly venue, a date and the number of people you are bringing.",
    },
    {
      icon: Wallet,
      title: "Share the invite link",
      desc: "Send the link on WhatsApp, Instagram or anywhere and friends join with a tap.",
    },
    {
      icon: CheckCircle2,
      title: "Everyone pays their share",
      desc: "Each person pays only their part. The plan auto-confirms when the group fills up.",
    },
  ],
  cta: { label: "Find a group-friendly venue", href: "/listings?vertical=venue" },
};

export const WHY_HOSTME = [
  {
    icon: ShieldCheck,
    title: "Verified spaces",
    desc: "Every listing is reviewed and approved by the HostMe team before it goes live.",
  },
  {
    icon: Zap,
    title: "Instant booking",
    desc: "Capacity spots reserve right away and exclusive spaces confirm in hours.",
  },
  {
    icon: Users,
    title: "Group-friendly payments",
    desc: "Split venue costs fairly with one link and secure sharing.",
  },
  {
    icon: Wallet,
    title: "Transparent pricing",
    desc: "Clear hourly rates in Naira with no hidden fees.",
  },
];

export const LOCATIONS = [
  { name: "Ilorin", area: "Kwara State", query: "Ilorin" },
  { name: "Lagos", area: "Lagos State", query: "Lagos" },
  { name: "Abuja", area: "FCT", query: "Abuja" },
  { name: "Ibadan", area: "Oyo State", query: "Ibadan" },
  { name: "Port Harcourt", area: "Rivers State", query: "Port Harcourt" },
  { name: "Kaduna", area: "Kaduna State", query: "Kaduna" },
  { name: "Enugu", area: "Enugu State", query: "Enugu" },
  { name: "Kano", area: "Kano State", query: "Kano" },
];

export const TESTIMONIALS = [
  {
    quote:
      "Booking the karaoke lounge took three minutes. Everyone paid their own share through the group link and we had the best night.",
    name: "Fatima A.",
    role: "Guests from GRA, Ilorin",
  },
  {
    quote:
      "I listed our event center and got my first booking within a week. The review process was clear and the payout was smooth.",
    name: "Segun B.",
    role: "Space host, Ilorin",
  },
  {
    quote:
      "We needed a private hall for our graduation photos. HostMe handled the reservation and deposit, then confirmed everything for us.",
    name: "Amina K.",
    role: "Guest from University of Ilorin",
  },
];

export const BOOKING_TYPES = {
  eyebrow: "Two ways to book",
  title: "Shared seat or the whole space",
  subtitle:
    "Every space on HostMe uses one of two booking models. Pick the one that fits how you like to book.",
  columns: [
    {
      key: "capacity",
      label: "Shared capacity",
      icon: "seats",
      tagline: "Book a spot in a happening",
      href: "/listings?vertical=venue",
      cta: "Browse shared spaces",
    },
    {
      key: "exclusive",
      label: "Exclusive space",
      icon: "lock",
      tagline: "Take the whole space for yourself",
      href: "/listings?vertical=venue&subVertical=exclusive_space",
      cta: "Browse exclusive spaces",
    },
  ],
  rows: [
    {
      label: "How it works",
      capacity: "Reserve a slot in a shared experience, like a karaoke session or a group night.",
      exclusive: "Request a private venue for a fixed time window, then pay to secure it.",
    },
    {
      label: "Payment",
      capacity: "Pay per seat in Naira with a short payment hold.",
      exclusive: "First successful payment wins the slot.",
    },
    {
      label: "Confirmation",
      capacity: "Auto-confirms the moment your payment clears.",
      exclusive: "Confirms after the host approves your request.",
    },
    {
      label: "Best for",
      capacity: "Birthdays and group nights with friends.",
      exclusive: "Private events, celebrations and VIP moments.",
    },
  ],
};

export const ROLES = {
  eyebrow: "One account, multiple roles",
  title: "Book spaces or list your own",
  subtitle:
    "Your HostMe account works for both sides of the market. Sign up as a guest to book, or as a host to list your space.",
  guest: {
    label: "Book as a guest",
    icon: "search",
    desc: "Discover spaces, compare prices and book instantly with no listing duties.",
    features: [
      "Browse venues and shortlets",
      "Reserve instantly or request exclusive spaces",
      "Split costs with friends on group booking",
    ],
  },
  host: {
    label: "Earn as a host",
    icon: "store",
    desc: "Turn your venue, apartment or kitchen into a paying listing in minutes.",
    features: [
      "Create listings with photos and pricing",
      "Manage slots, availability and add-ons",
      "Get paid securely through Paystack",
    ],
  },
  footnote:
    "Sign up once, then add the host side to your account from your profile. Your active role simply decides which dashboard you land on first.",
};

export const HOST_CTA = {
  title: "Own a space? Start earning with HostMe.",
  subtitle:
    "List your venue, apartment or shortlet in minutes. Reach thousands of local guests and get paid securely through Paystack.",
  primaryCta: { label: "List your space", href: "/sign-up" },
  secondaryCta: { label: "Browse as a guest", href: "/listings" },
  perks: [
    { title: "Instant payouts", desc: "Funds arrive via Paystack as bookings confirm." },
    { title: "Free to list", desc: "Create listings and manage your spaces at no cost." },
    { title: "Admin review", desc: "Every space is checked before it goes live." },
    { title: "Photo & add-ons", desc: "Showcase your space with photos and extras." },
  ],
};

export const FAQS = [
  {
    q: "What is HostMe?",
    a: "HostMe is Nigeria's marketplace for discovering and booking unique spaces. From lively karaoke bars and elegant event centers to shortlet apartments, we connect you with the perfect space for every occasion.",
  },
  {
    q: "How do I book a space?",
    a: "Browse listings, find a space you like, select your date and time and complete your booking. Capacity bookings let you reserve a slot instantly. Exclusive spaces require a request, then the host confirms availability and you pay to secure it.",
  },
  {
    q: "What is group booking?",
    a: "Group booking lets you split the cost of a venue with friends. One person starts the plan and shares the link. Each friend joins with their HostMe account and pays their own share in Naira. The plan auto-confirms once the group fills up, or cancels with refunds if it does not by the close date. A free account is needed to start or join.",
  },
  {
    q: "What types of spaces are available?",
    a: "We offer two verticals: Venues (karaoke bars, event centers, party halls and exclusive spaces) and Housing (shortlets and apartments). Each listing clearly shows its category, pricing and available add-ons.",
  },
  {
    q: "How do payments work?",
    a: "All payments are processed securely through Paystack, Nigeria's PCI-compliant gateway. You can pay via debit card, USSD, bank transfer or QR code. Funds are only charged once the booking is confirmed.",
  },
  {
    q: "Can I list my own space?",
    a: "Yes! Sign up as a host, create a listing with photos, pricing and availability rules, then submit for admin review. Once approved, your space goes live for guests to discover and book.",
  },
  {
    q: "Can I be both a host and a guest?",
    a: "Yes. One HostMe account supports both sides. Sign up as a guest to book spaces first, then add the host side from your profile to start listing your own space. You can switch between them anytime.",
  },
  {
    q: "What is the difference between capacity and exclusive booking?",
    a: "Capacity booking works like event tickets. You reserve a spot in a shared experience, like a karaoke session. Exclusive booking gives you full private access to a space for a specific time window, like renting an entire event center.",
  },
  {
    q: "Is HostMe available outside Ilorin?",
    a: "We currently operate in Ilorin, Kwara State. Expansion to other Nigerian cities is on the roadmap. Follow us for announcements about new locations.",
  },
  {
    q: "What if I need to cancel a booking?",
    a: "Each listing clearly shows its cancellation policy (flexible, moderate or strict) before you book. Refunds are processed according to that policy. Contact the host directly for special circumstances or disputes.",
  },
];