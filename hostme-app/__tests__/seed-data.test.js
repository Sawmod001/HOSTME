import test from "node:test";
import assert from "node:assert/strict";

// Demo listings in seed route use snake_case keys (DB-compatible).
const DEMO_LISTINGS = [
  { title: "Orca Lounge", vertical: "venue", booking_type: "exclusive" },
  { title: "Havenda Center", vertical: "venue", booking_type: "exclusive" },
  { title: "Kolade Bar", vertical: "venue", booking_type: "exclusive" },
];

test("demo listings have required fields", () => {
  for (const listing of DEMO_LISTINGS) {
    assert.equal(typeof listing.title, "string");
    assert.ok(listing.title.length > 0);
    assert.equal(listing.vertical, "venue");
    assert.equal(listing.booking_type, "exclusive");
  }
});
