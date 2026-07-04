# HostMe - Authentication, Identity Management, & RBAC Specification (v2)

## 1. Core Identity Philosophy

HostMe processes real financial transactions between strangers with instant, non-reversible payouts. That combination is exactly where fraud concentrates, so identity design has to do real work even without a formal KYC gate.

Phase 1 explicitly **does not** run NIN/BVN validation or facial recognition. Instead, HostMe uses a **Lite Identity + Compensating Controls** model:

1. **Low friction for guests:** Passwordless OTP, matching Nigerian consumer expectations.
2. **Lite friction for hosts:** Email, full legal name, and OTP-verified phone at signup — no government ID upload required.
3. **One mandatory financial check, not an identity pipeline:** before a host's listing can go live, their declared payout bank account is verified via the gateway's account-name-resolution endpoint and fuzzy-matched against their registered name. This single API call is the one non-negotiable gate, because it's the only thing standing between an anonymous signup and a real, traceable bank account.
4. **Compensating controls that fade out with trust**, in place of upfront KYC (§4).

Two strictly separated access perimeters remain unchanged from the original design: the **Public Domain** (guests and hosts) and the **Isolated Subdomain** (admin/support).

---

## 2. Network Topology & Authentication Perimeters

```text
                             [ HOSTME IDENTITY ENGINE ]
                                         |
           +-----------------------------+-----------------------------+
           |                                                           |
           v                                                           v
+------------------------------------+                  +------------------------------------+
|     PUBLIC DOMAIN (hostme.ng)      |                  |  ISOLATED SUBDOMAIN (admin...)     |
+------------------------------------+                  +------------------------------------+
| Targets: Guests & Space Hosts      |                  | Targets: Support & Super-Admins    |
| Auth Route: /login                 |                  | Auth Route: /system-perimeter      |
| Strategy: NextAuth v5 (JWT)        |                  | Strategy: Custom Auth + TOTP       |
| Primary Auth: Passwordless OTP     |                  | Primary Auth: Email + Pass + MFA   |
| Fallback Auth: Email + Password    |                  | Cookies: Pinned to subdomain only  |
+------------------------------------+                  +------------------------------------+
```

**Cookie configuration (explicit, previously unstated):** all session cookies set `HttpOnly: true`, `Secure: true`, `SameSite: Lax` on the public domain; the admin subdomain additionally scopes cookies with `Domain` pinned to the admin subdomain only, so a compromised guest/host session cannot be replayed against admin routes.

---

## 3. Host Onboarding Flow (replaces the KYC gate)

```text
1. Signup: email + full name + phone
2. Phone OTP verification (blocking — cannot proceed without it)
3. Add payout bank account: account number + bank code
4. Server calls gateway account-name-resolution API
   -> returns the real registered name on that account
5. Fuzzy-match resolved name against registered signup name
   (Levenshtein distance / normalized token match — allows for
    initials, middle names, minor spelling variants)
6. Match passes -> listing can go live, subject to Phase 1 payout
   controls in §4
   Match fails -> host is blocked from going live and prompted to
   re-enter bank details or use an account in their own name;
   flagged for manual admin review, not auto-rejected outright
   (legitimate mismatches happen, e.g., recently married name changes)
```

This closes the single largest fraud vector — payouts routing to an account with no verified link to the person operating the listing — without the cost, delay, or drop-off of a full NIN/BVN + facial recognition flow.

**Step-up authentication (new):** changing payout bank details after initial setup requires a fresh OTP challenge, regardless of session state. This is the single highest-value moment for step-up auth on the platform — it's the exact action a compromised account or a bad-faith host takes right before disappearing with funds.

**Account recovery (new):** OTP-only auth has a real failure mode in a market with common SIM swaps and number recycling. Add an email-based recovery path (magic link + re-verification of phone) as a fallback — do not make phone number the sole, unrecoverable key to an account.

---

## 4. Compensating Controls (replacing KYC's fraud-prevention role)

Since there is no upfront identity verification, risk has to be managed on the transaction side instead. These are lightweight, mostly invisible to legitimate hosts, and phase out automatically as a host builds a track record — they are not a wallet or an escrow model, so they don't reopen the "no escrow" decision.

| Control | Mechanic | Phases out when |
|---|---|---|
| **New-host payout delay** | First 2–3 completed transactions release to the host's account a few hours after confirmation instead of instantly (a timed release, not a held wallet) | After N clean completed transactions |
| **Transaction velocity cap** | New listings capped at a maximum booking value (e.g., ₦50,000) until the host has completed transaction history | After N clean completed transactions |
| **Bank-account lock-in** | Payout account cannot be changed without OTP step-up (§3); changing it resets the "new host" clock | N/A — permanent |
| **Fraud Monitor (admin)** | Flags chat-scrubber trigger events (attempted phone/bank-number sharing) for manual review | N/A — ongoing |
| **Optional Verified Host badge** | Hosts may voluntarily upload a government ID for a trust badge shown to guests — opt-in, not a gate | N/A — incentive layer, not a control |

The optional Verified Host badge is worth building even though it's not mandatory: it gives hosts a reason to self-select into stronger verification for the trust signal it gives guests, without you forcing friction onto every signup.

---

## 5. Multi-Role Accounts & Role Switching (Resolves flagged gap)

One account can hold multiple roles simultaneously (typically `guest` + `host`) — common enough in this market (a host who also books other venues for their own events) that it's built in from Stage 0 rather than retrofitted.

- `User.roles` is an array; `User.activeRole` is session-level UI context only, set by a role-switcher control in the main nav (Screen 1).
- **Authorization never trusts `activeRole` alone.** Every server-side permission check verifies `roles.includes(requiredRole)` for the specific action being performed, regardless of which role the UI is currently displaying — `activeRole` can be manipulated client-side and is a display convenience, not a security boundary.
- Switching `activeRole` is a client-side UI state change plus a lightweight `POST /api/user/switch-role` call to persist the preference for next login; it does not re-authenticate or re-issue a session token, since no new privilege is being granted — the user already held the role.
- A user without the `host` role who attempts a host action (e.g., `POST /api/listings`) is rejected server-side regardless of what `activeRole` claims — this must be enforced at the API layer, never assumed from the UI having hidden the option.

## 6. Admin CMS Identity Screens (Screen 8 update)

Replaces the original "KYC approval queue" with:
- Table of hosts and their bank-account-name-match status (`matched` / `flagged_for_review` / `unmatched`).
- New-host payout-delay and velocity-cap status per host, with manual admin override to lift early (e.g., for a host with strong external reputation) or extend (e.g., after a dispute).
- Verified Host badge approval queue for hosts who opted in to ID upload.
