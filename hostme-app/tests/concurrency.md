# Capacity Booking Concurrency Notes

- Simulated concurrency test coverage is implemented in __tests__/concurrency.test.js.
- The atomic reservation path uses a single `reserve_capacity_slot()` PostgreSQL RPC (UPDATE ... RETURNING) to increment booked capacity for a slot.
- Expected behavior: only one reservation succeeds when the slot reaches capacity, and the second request receives HTTP 409 with a full-slot response.
- The exclusive lock race resolution uses the `resolve_exclusive_lock()` RPC for the "first-to-pay-wins" mechanism.