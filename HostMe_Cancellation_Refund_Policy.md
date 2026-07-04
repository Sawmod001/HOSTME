# HostMe - Cancellation & Refund Policy (Resolves flagged gap)

## 1. Why this needed real design, not just a policy table

Most booking platforms can define a cancellation policy as "refund X% based on how close to the event." HostMe can't stop there, because of the **instant split-settlement** decision: the moment a payment confirms, 95% has already left the platform and landed in the host's bank account. A refund isn't "release held funds" — it's "claw back money that already moved." This doc defines both the guest-facing policy tiers and the underlying mechanics that make a refund actually possible without reintroducing an escrow hold.

## 2. Refund Mechanics (the part that has to work first)

Paystack and Monnify's split-payment products both support **refunding a split transaction directly through their API** — the gateway reverses the transaction and automatically pulls back the corresponding share from the sub-accounts that received it (host's 95% and HostMe's 5% commission), rather than HostMe needing to separately debit the host's account itself. This is the mechanism the whole policy depends on — confirm it against the current Paystack/Monnify API docs before Stage 4 of the build, since split-refund support and its exact behavior (full reversal vs. partial) can differ between the two gateways and between API versions.

**Two real-world constraints this creates:**
- **If the host has already spent the money** (e.g., bought diesel for the generator, as the original blueprint's own rationale for rejecting escrow describes), the gateway's reversal can fail if the sub-account balance is insufficient. This is a genuine open risk of the no-escrow model, not something a policy document can fully solve — the compensating control is the **new-host payout delay** already in the Identity spec, which gives HostMe a short window where reversal is guaranteed to succeed before funds are fully at the host's discretion. Established hosts (past the delay window) carry more of this risk, which is a reasonable trade for the operational benefit escrow-rejection was chosen for.
- **Refunds must be idempotent** exactly like charges — a retried refund webhook must not double-refund. Same unique-index-on-transaction-reference pattern as the charge path in the Database Schemas doc.

## 3. The Three Tiers

Set per-listing by the host at creation (`operationalRules.cancellationPolicy`), shown to guests before booking so there's no ambiguity at checkout.

| Tier | Full refund window | Partial refund | No refund |
|---|---|---|---|
| **Flexible** | Cancel ≥24h before `eventStart` | 50% refund if 6–24h before | No refund <6h before |
| **Moderate** *(default)* | Cancel ≥72h before `eventStart` | 50% refund if 24–72h before | No refund <24h before |
| **Strict** | Cancel ≥7 days before `eventStart` | 50% refund if 72h–7 days before | No refund <72h before |

**Host-initiated cancellation is always a full guest refund**, regardless of tier — a host cancelling on a guest is never the guest's cost to bear. This is not configurable per listing.

## 4. Behavior by Booking Type

**Capacity-Based:** cancelling one guest's booking releases their headcount back to the `Slot.booked` counter atomically (same pattern as the SoftHold release):
```javascript
await Slot.updateOne({ _id: slotId }, { $inc: { booked: -cancelledHeadcount } });
```
Other guests on the same slot are unaffected — this is the main advantage of capacity bookings over exclusive ones for cancellation handling.

**Exclusive-Space:** cancelling releases the entire `ExclusiveLock` back to `open`, and (per Phase 1 scope) does **not** automatically re-notify guests whose earlier requests were auto-rejected when the slot first locked — the host must re-list availability. Auto-renotification is a reasonable Phase 2 addition, not required for launch.

## 5. State Machine Addition

Add to `Booking.status` enum (already includes `cancelled` — this section defines what happens on transition into it):

```
confirmed --(guest or host initiates cancel)--> cancellation_calculating
cancellation_calculating --(refund tier resolved, gateway refund initiated)--> cancelled
cancellation_calculating --(gateway refund fails, e.g. insufficient host sub-account balance)--> disputed
```

The `disputed` fallback is intentional: a failed reversal is exactly the scenario the Dispute model and admin queue already exist for — no new resolution mechanism needed, just routing the failure into the existing path.

## 6. New API Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/bookings/:id/cancellation-preview` | Returns refund tier + amount guest would receive if they cancel now — shown before confirming |
| POST | `/api/bookings/:id/cancel` | Executes cancellation: calculates tier, triggers gateway split-refund, updates Slot/ExclusiveLock, writes Transaction record |

## 7. Notification Additions

| Trigger | Recipient | Channel |
|---|---|---|
| Cancellation refund issued | Guest | in_app, sms, email |
| Cancellation refund failed → disputed | Guest + Host + Admin | in_app, email |
| Host-initiated cancellation | Guest | in_app, sms, email (full refund, apologetic tone) |
