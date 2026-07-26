export function buildSeedListingPayloads() {
    return [
        {
            hostId: "000000000000000000000000",
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
                setupTimeMinutes: 30,
                cleanupTimeMinutes: 30,
                isByobAllowed: true,
                cancellationPolicy: "moderate",
            },
            addOns: [{ id: "generator", name: "Generator Backup", priceInKobo: 1500000, isRequired: false }],
        },
        {
            hostId: "000000000000000000000000",
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
                setupTimeMinutes: 30,
                cleanupTimeMinutes: 30,
                isByobAllowed: false,
                cancellationPolicy: "strict",
            },
            addOns: [{ id: "decor", name: "Decor Pack", priceInKobo: 1000000, isRequired: false }],
        },
    ];
}
