const demoListings = [
    {
        _id: "demo-listing-1",
        hostId: "demo-host",
        vertical: "venue",
        bookingType: "capacity",
        status: "active",
        title: "Skyline Lounge",
        description: "A polished lounge space for screenings, private tables, and social gatherings.",
        location: {
            state: "Lagos",
            cityArea: "Lekki",
            address: "14 Admiralty Way",
            coordinates: {
                type: "Point",
                coordinates: [3.4733, 6.4658],
            },
        },
        pricing: { baseRatePerHour: 2500000 },
        operationalRules: {
            maxCapacity: 40,
            setupBufferMinutes: 30,
            teardownBufferMinutes: 30,
            isByobAllowed: true,
            cancellationPolicy: "moderate",
        },
        addOns: [{ id: "generator", name: "Generator Backup", priceInKobo: 1500000, isRequired: false }],
    },
    {
        _id: "demo-listing-2",
        hostId: "demo-host",
        vertical: "venue",
        bookingType: "exclusive",
        status: "active",
        title: "Harbor Private Room",
        description: "An exclusive buyout room for birthdays, shoots, and private events.",
        location: {
            state: "Lagos",
            cityArea: "Ikeja",
            address: "2 Allen Avenue",
            coordinates: {
                type: "Point",
                coordinates: [3.3462, 6.6018],
            },
        },
        pricing: { baseRatePerHour: 3500000 },
        operationalRules: {
            maxCapacity: 20,
            setupBufferMinutes: 30,
            teardownBufferMinutes: 30,
            isByobAllowed: false,
            cancellationPolicy: "strict",
        },
        addOns: [{ id: "decor", name: "Decor Pack", priceInKobo: 1000000, isRequired: false }],
    },
];

export function getDemoListings({ vertical, cityArea, bookingType, limit = 20, cursor }) {
    let filtered = [...demoListings];

    if (vertical) {
        filtered = filtered.filter((item) => item.vertical === vertical);
    }

    if (cityArea) {
        filtered = filtered.filter((item) => item.location.cityArea.toLowerCase().includes(cityArea.toLowerCase()));
    }

    if (bookingType) {
        filtered = filtered.filter((item) => item.bookingType === bookingType);
    }

    const start = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    const end = start + limit;
    const items = filtered.slice(start, end);

    return {
        data: items,
        pagination: {
            nextCursor: end < filtered.length ? String(end) : null,
            hasMore: end < filtered.length,
        },
    };
}

export function getDemoListingById(id) {
    return demoListings.find((item) => item._id === id) || null;
}

export function seedDemoListings() {
    return demoListings.map((item) => ({ ...item }));
}
