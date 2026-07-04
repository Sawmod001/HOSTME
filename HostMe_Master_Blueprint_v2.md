# HostMe Master Blueprint: Executive Summary & Core Platform Philosophy

**System Designation:** Multi-Vertical Transactional Marketplace
**Target Environment:** Nigerian Commercial Hospitality & Real Estate Market
**Architecture Type:** Next.js (App Router) / MongoDB / Serverless APIs
**Revision:** v2 — Commission adjusted to 5%, KYC gate removed from Phase 1, booking concurrency model split into Capacity-Based vs Exclusive-Space logic.

---

## 1. Executive Summary & Market Positioning

HostMe is a specialized, high-performance web and mobile-responsive marketplace engineered specifically to solve the trust deficit, logistical chaos, and payment friction inherent in the Nigerian social and real estate sectors.

Unlike generic booking platforms that rely on traditional escrow models or manual calendar updates, HostMe is built as an Instant Split Checkout Coordination Service. It targets mid-tier commercial spaces (lounges, bars, cafés, boutique hotels) and verified real estate agents, deliberately avoiding the structural complexities of mega-wedding logistics in Phase 1.

The platform's ultimate goal is to convert high-friction, offline negotiations — such as dealing with hidden venue rules, unverified real estate agents demanding blind inspection fees, and double-booked calendar dates — into a seamless, trustless digital pipeline. It achieves this by forcing both parties to agree to strict digital parameters before any transaction can occur, and executing financial settlements directly to merchant bank accounts the millisecond a transaction is verified.

---

## 2. Core Platform Philosophy (The "Why")

### 2.1. Trust Through Instant Settlement (Rejecting Escrow)

In the Nigerian market, holding a venue owner's funds in a centralized escrow account creates massive operational friction (e.g., they often need that immediate cash flow to buy diesel for generators prior to the event).

HostMe rejects traditional escrow.

We utilize Point-of-Sale Split Routing (via Monnify or Paystack).

When a guest pays ₦100,000, the API instantly routes **95%** (₦95,000) to the host's direct sub-account and **5%** (₦5,000) to HostMe's platform wallet. The trust is enforced not by holding money, but by the issuance of an unforgeable digital ticket.

### 2.2. Intent-Gated Communication (Micro-Friction as a Feature)

Nigerian business owners suffer heavily from "window shoppers" who waste time negotiating without the intent or capital to book. HostMe introduces structured friction to filter out unserious users.

- **The Mandatory Intake Form:** No user can contact a host or click "Pay Now" without explicitly defining their event parameters (Headcount, Event Type, Required Add-ons).
- **The Optional Paywall:** If a user wishes to bypass a direct instant-booking to ask questions, send voice notes, or negotiate, they must pay a non-refundable ₦2,000 – ₦4,000 Routing Fee. This monetizes high-touch users and guarantees the host is only talking to highly motivated buyers.

### 2.3. Dual Calendar Model: Capacity-Based vs. Exclusive-Space Bookings

Not all bookings behave the same way, and treating them identically was the flaw in the original "one calendar model fits all" design. HostMe splits booking behavior into two distinct engines depending on what the guest is actually buying.

**A. Capacity-Based Bookings (Shared Slot Model)**
Applies to: table reservations, a seat for a meal, "sit-and-watch" specials (e.g., game nights, a movie screening, a live band set), or any offering where the host is selling *access to a shared space*, not the whole space.

- The host defines a **maximum capacity** for the slot (e.g., 40 seats for the 8 PM screening).
- Multiple independent guests can book the same date/time slot concurrently, as long as combined headcount stays under capacity.
- The system decrements available capacity in real time as each payment clears; once capacity hits zero, the slot closes automatically — no manual host action required.
- The host retains a "Reject/Adjust" override if they judge the space genuinely full despite headcount math (e.g., large parties take more room per head).

**B. Exclusive-Space Bookings (First-to-Pay Concurrency Model)**
Applies to: full-space rentals — birthdays, private parties, exclusive lounge buyouts, photoshoots requiring the whole venue, or any booking where the guest is paying for sole use of the space during that window.

- A host can approve multiple pending requests for the same slot, but the calendar remains open until payment.
- The system creates a "race": the exact millisecond the first user successfully completes their gateway payment, the database instantly hard-blocks the slot and revokes the pending payment links for every other user.
- Once paid, the slot is exclusive — no other booking of any type (capacity-based or exclusive) can be layered onto that same space/time window.

The booking engine determines which model applies based on the **listing type** the host configures when creating the space (Shared Capacity vs. Exclusive Rental), not on a per-booking basis — this keeps the guest-facing UI predictable and prevents hosts from silently overselling an exclusive space.

### 2.4. Unforgeable Digital Assets over Paper Receipts

A standard PDF receipt can be screenshotted and shared among ten people at a lounge door.

HostMe converts every successful transaction into a Dynamic Access Pass.

This pass lives in the guest's dashboard and features a live-ticking clock (to defeat screenshots) and a cryptographic QR code (JWT) that can only be scanned and validated once by the host's smartphone. For Capacity-Based Bookings, each pass is tied to the specific headcount purchased, so a single scan validates the full party, not just one person.

---

## 3. The Three Business Verticals & Funnel Logic

The interface allows users to switch contexts seamlessly between three distinct operational funnels.

### Vertical A: Event Spaces (Direct & Negotiated Booking)
**The Use Case:** Booking a VIP section at a lounge, a café floor for a photoshoot, or a dedicated workspace.

**The Funnel:** User selects micro-time slots (e.g., 2:00 PM – 6:00 PM, allowing the host to sell the 7:00 PM – 11:00 PM slot to someone else). The system calculates the base hourly rate plus checked add-ons (e.g., +₦10,000 for guaranteed generator power). Whether this listing runs Capacity-Based or Exclusive-Space logic depends on the host's listing configuration (see 2.3).

### Vertical B: Commercial Real Estate (Regulated Scheduling)
**The Use Case:** Finding verified short-lets, apartments, or commercial leases.

**The Funnel:** Solves the "Bait and Switch" and "Blind Inspection Fee" extortion. The user finds a verified house. They cannot directly pay for rent on the platform yet. Instead, they pay a standardized, low-cost Platform Inspection & Transport Fee. The agent must approve the viewing time. The payment protects the user from extortion on the road and guarantees the agent is compensated for their transport.

### Vertical C: Pre-Ordering (Add-ons & Independent Fulfillment)
**The Use Case:** Buying a bulk food platter or reserving three bottles of Hennessy for the booked lounge.

**The Funnel:** Operates as a classic e-commerce cart. Items can either be attached to an Event Space booking (creating a single consolidated invoice) or bought independently as a direct fulfillment order.

---

## 4. Security, Identity, & Anti-Fraud Architecture

To handle financial transactions safely, the system enforces absolute security boundaries.

- **Platform Leakage Prevention (The Chat Scrubber):** Because users must pay a 5% commission, they will attempt to share phone numbers in the chat to take the deal offline. HostMe utilizes real-time Regex parsing in the chat channel. Any string matching a Nigerian phone format (080, 090, +234) or bank names/account numbers is instantly replaced with `[REDACTED]`.
- **Isolated Super-Admin CMS:** The Admin portal does not share a login screen with guests and hosts. It exists on a restricted subdomain, requires Multi-Factor Authentication (MFA), and provides God-mode controls to manually override schedules, force refunds for broken disputes, and ban fraudulent agents.

*(Strict KYC Onboarding — NIN/BVN validation and facial recognition — has been removed from Phase 1 scope per revision. See CTO note below on the implications of this decision.)*

---

## 5. Phase 1 Scope Boundary (What We Are NOT Building Yet)

To maintain extreme focus and prevent scope creep, the following features are strictly deferred to Phase 2/3. The database architecture will account for them, but they will not be coded in Phase 1:

- **Third-Party Vendor Multi-Split:** (e.g., Booking a venue, a separate caterer, and a separate DJ in one cart). Phase 1 only handles Venue + Host-owned extras.
- **Ticket Sales Marketplace:** Allowing a user to book a venue and then generate a public link to sell 100 individual entry tickets to the public.
- **Automated Escrow Dispute Mediation Rooms:** Heavy logic for freezing funds while users upload photo evidence of a broken AC.
- **Native iOS/Android Apps:** Phase 1 is strictly a highly optimized, mobile-responsive Next.js web application.
