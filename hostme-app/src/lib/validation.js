import { z } from "zod";

export const ListingCreateSchema = z.object({
    vertical: z.enum(["venue", "housing", "preorder"]),
    bookingType: z.enum(["capacity", "exclusive"]),
    title: z.string().min(3).max(100),
    description: z.string().min(20).max(2000),
    location: z.object({
        state: z.string().min(2),
        cityArea: z.string().min(2),
        address: z.string().min(5),
        coordinates: z.object({
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180),
        }),
    }),
    pricing: z.object({
        baseRatePerHour: z.number().int().min(1000),
        inspectionTransportFee: z.number().int().optional(),
    }),
    operationalRules: z.object({
        maxCapacity: z.number().int().min(1).max(10000),
        setupBufferMinutes: z.number().int().min(0).max(240),
        teardownBufferMinutes: z.number().int().min(0).max(240),
        isByobAllowed: z.boolean(),
        cancellationPolicy: z.enum(["flexible", "moderate", "strict"]),
    }),
    addOns: z
        .array(
            z.object({
                id: z.string(),
                name: z.string().min(1).max(50),
                priceInKobo: z.number().int().min(0),
                isRequired: z.boolean(),
            })
        )
        .optional(),
});

export const ListingUpdateSchema = ListingCreateSchema.partial();

export const ListingFilterSchema = z.object({
    vertical: z.enum(["venue", "housing", "preorder"]).optional(),
    cityArea: z.string().optional(),
    bookingType: z.enum(["capacity", "exclusive"]).optional(),
    limit: z.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    radiusKm: z.number().min(0.1).max(100).default(50),
});

export function validateListingCreate(data) {
    return ListingCreateSchema.safeParse(data);
}

export function validateListingUpdate(data) {
    return ListingUpdateSchema.safeParse(data);
}

export function validateListingFilter(data) {
    return ListingFilterSchema.safeParse(data);
}
