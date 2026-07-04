export function calculateGeoDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function buildGeoQuery(lat, lng, radiusKm = 50) {
    return {
        "location.coordinates": {
            $near: {
                $geometry: {
                    type: "Point",
                    coordinates: [lng, lat],
                },
                $maxDistance: radiusKm * 1000,
            },
        },
    };
}

export function buildListingQuery(filters = {}) {
    const query = { status: "active" };

    if (filters.vertical) {
        query.vertical = filters.vertical;
    }

    if (filters.cityArea) {
        query["location.cityArea"] = filters.cityArea;
    }

    if (filters.bookingType) {
        query.bookingType = filters.bookingType;
    }

    if (filters.lat !== undefined && filters.lng !== undefined) {
        const geoQuery = buildGeoQuery(filters.lat, filters.lng, filters.radiusKm);
        Object.assign(query, geoQuery);
    }

    return query;
}
