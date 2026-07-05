import test from "node:test";
import assert from "node:assert/strict";

import { buildSeedListingPayloads } from "../src/lib/seed-data.js";

test("buildSeedListingPayloads creates schema-compatible listing documents", () => {
    const listings = buildSeedListingPayloads();

    assert.equal(listings.length, 2);

    for (const listing of listings) {
        assert.equal(listing.status, "active");
        assert.equal(typeof listing.title, "string");
        assert.equal(typeof listing.description, "string");
        assert.equal(listing.location.coordinates.type, "Point");
        assert.ok(Array.isArray(listing.location.coordinates.coordinates));
        assert.equal(listing.operationalRules.maxCapacity > 0, true);
        assert.equal(typeof listing.operationalRules.isByobAllowed, "boolean");
    }
});
