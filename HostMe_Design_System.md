# HostMe - Design System & Brand Foundations

No visual identity has been locked yet, so this proposes one grounded in the product's positioning (trust, instant transactions, Nigerian hospitality) — swap freely before the AI coding tool starts consuming it.

## 1. Brand Rationale
HostMe sits between a fintech (money moving instantly, trust-critical) and a hospitality product (warm, social, physical spaces). The palette below leans warm to avoid reading as a cold banking app, while status colors stay strict and unambiguous because real money and real bookings depend on them being readable at a glance, including on a low-light phone screen at a lounge door.

## 2. Color Tokens

```css
:root {
  /* Brand */
  --color-primary: #D97706;        /* Warm amber — CTA buttons, active states, brand marks */
  --color-primary-dark: #B45309;   /* hover/pressed */
  --color-primary-light: #FDE9CC;  /* subtle backgrounds, badges */

  --color-ink: #1C1917;            /* primary text — warm near-black, not pure black */
  --color-ink-muted: #57534E;      /* secondary text */
  --color-surface: #FFFFFF;
  --color-surface-alt: #FAF9F7;    /* page background */
  --color-border: #E7E5E4;

  /* Status — meaning is fixed, never reused for anything else */
  --color-success: #15803D;        /* confirmed, completed, payout success */
  --color-warning: #B45309;        /* pending, awaiting payment */
  --color-danger: #B91C1C;         /* disputed ONLY — never cancelled/rejected */
  --color-neutral-status: #78716C; /* cancelled, rejected, expired — deliberately grey, not red */
  --color-info: #1D4ED8;           /* informational badges, "locked" slot state */
}
```

**Rule:** red is reserved exclusively for `disputed` bookings, matching the OneEvent convention. Cancelled/rejected bookings use neutral grey — conflating "the guest cancelled" with "something went wrong" creates false alarm fatigue for hosts scanning their inbox.

## 3. Typography

- **Font:** Manrope (variable weight) — geometric, highly legible at small sizes on low-end Android screens, free via Google Fonts, good Naira/₦ glyph rendering.
- **Scale:** `text-xs` (12px) captions/timestamps · `text-sm` (14px) body/secondary · `text-base` (16px) primary body · `text-lg` (18px) card titles · `text-xl`–`text-3xl` section/page headers.
- **Weight usage:** 400 body, 600 emphasis/labels, 700 headers and price figures only — price figures should always be the heaviest weight on any card, since price is the first thing a Nigerian consumer scans for.

## 4. Spacing & Layout

- 4px base unit (Tailwind default scale: 1,2,3,4,6,8,12,16...).
- Mobile container padding: 16px horizontal minimum.
- Card radius: `rounded-xl` (12px) — soft enough to feel hospitable, not so soft it looks like a toy.
- Sticky checkout summary: fixed to viewport bottom on mobile (safe-area-inset-bottom respected), floating right rail on desktop ≥1024px.

## 5. Breakpoints

```
sm: 640px   (large phones)
md: 768px   (tablets — treat as mobile-pattern, not desktop)
lg: 1024px  (desktop layouts activate here, not before)
xl: 1280px
```

Per the 85%-mobile-traffic NFR: build every screen mobile-first and treat `lg:` as the enhancement layer, never the default.

## 6. Component Library Baseline

Use **shadcn/ui** primitives (already compatible with the Next.js 15 + Tailwind stack) as the base layer, themed with the tokens above:
- Button, Input, Select, Dialog/Modal, Sheet (mobile bottom-sheets for the Intake Form and Chat), Tabs (vertical switcher), Badge (status pills), Toast (booking confirmations, errors), Skeleton (loading states — see §7).

## 7. Required UI States (apply to every data-driven screen)

AI coding tools frequently ship only the "happy path" screen. Every screen in the matrix must explicitly implement:
- **Loading:** skeleton components matching final layout shape, never a blank screen or generic spinner for list/grid views.
- **Empty:** e.g., "No bookings yet" with a clear next action, not just blank space.
- **Error:** distinct from empty — network/server failure state with a retry action.
- **Disabled/Pending action:** buttons enter a disabled+loading state the instant they're clicked (per the Pessimistic UI NFR) — this must be a shared component behavior, not implemented ad hoc per screen.

## 8. Iconography
Lucide icons (already available in the stack) for infrastructure filters (power, parking, BYOB), status badges, and navigation — no mixed icon sets.

## 9. Accessibility Baseline
- Minimum contrast ratio 4.5:1 for body text against backgrounds (verify `--color-ink-muted` on `--color-surface-alt` specifically — borderline, check before shipping).
- Tap targets minimum 44×44px on mobile — relevant for the numeric headcount stepper and door-scanner action buttons, which get used under time pressure at an actual venue entrance.
