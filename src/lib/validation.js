import { z } from "zod";

const VenueFeaturesSchema = z.object({
  birthday: z.object({
    cakeAllowed: z.boolean().optional(),
    decorationOptions: z.array(z.string()).optional(),
    partyFavorsProvided: z.boolean().optional(),
    kidFriendly: z.boolean().optional(),
  }).optional(),
  exclusiveSpace: z.object({
    privacyLevel: z.enum(["semi_private", "fully_private", "vip"]).optional(),
    cateringOptions: z.array(z.string()).optional(),
    inHouseCatering: z.boolean().optional(),
    maxGuests: z.number().int().min(1).optional(),
  }).optional(),
  karaoke: z.object({
    microphoneCount: z.number().int().min(1).optional(),
    songGenres: z.array(z.string()).optional(),
    privateRoom: z.boolean().optional(),
    hasStage: z.boolean().optional(),
    soundSystem: z.string().optional(),
  }).optional(),
  groupNight: z.object({
    gameTypes: z.array(z.string()).optional(),
    hasPoolTable: z.boolean().optional(),
    hasVideoGames: z.boolean().optional(),
    hasBoardGames: z.boolean().optional(),
    maxGroupSize: z.number().int().min(1).optional(),
    hasBar: z.boolean().optional(),
  }).optional(),
}).strict();

const HousingFeaturesSchema = z.object({
  housing: z.object({
    propertyType: z.enum(["apartment", "house", "duplex", "room", "shortlet"]).optional(),
    bedrooms: z.number().int().min(0).optional(),
    bathrooms: z.number().int().min(0).optional(),
    hasWifi: z.boolean().optional(),
    hasParking: z.boolean().optional(),
    hasAC: z.boolean().optional(),
    furnished: z.boolean().optional(),
    petFriendly: z.boolean().optional(),
  }).optional(),
}).strict();

const PreorderFeaturesSchema = z.object({
  preorder: z.object({
    cuisineType: z.enum(["african", "continental", "fast_food", "local", "drinks"]).optional(),
    deliveryAvailable: z.boolean().optional(),
    pickupAvailable: z.boolean().optional(),
    prepTimeMinutes: z.number().int().min(0).optional(),
    minOrderKobo: z.number().int().min(0).optional(),
  }).optional(),
}).strict();

export const ListingCreateSchema = z.object({
  vertical: z.enum(["venue", "housing", "preorder"]),
  subVertical: z.array(z.string()).optional(),
  bookingType: z.enum(["capacity", "exclusive"]),
  title: z.string().min(3).max(100),
  description: z.string().min(20).max(2000),
  location: z.object({
    state: z.string().min(2),
    cityArea: z.string().min(2),
    address: z.string().min(5),
    coordinates: z.object({
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
    }).optional(),
  }),
  pricing: z.object({
    baseRatePerHour: z.number().int().min(1),
    inspectionTransportFee: z.number().int().optional(),
  }),
  operationalRules: z.object({
    maxCapacity: z.number().int().min(1).max(10000),
    setupTimeMinutes: z.number().int().min(0).max(240),
    cleanupTimeMinutes: z.number().int().min(0).max(240),
    isByobAllowed: z.boolean(),
    cancellationPolicy: z.enum(["flexible", "moderate", "strict"]),
  }),
  features: z.union([VenueFeaturesSchema, HousingFeaturesSchema, PreorderFeaturesSchema]).optional(),
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
  media: z.array(z.string()).max(10).optional(),
});

export const ListingUpdateSchema = ListingCreateSchema.partial();

export const ListingFilterSchema = z.object({
  vertical: z.enum(["venue", "housing", "preorder"]).optional().or(z.literal("")).transform((value) => (value === "" ? undefined : value)),
  subVertical: z.string().optional().or(z.literal("")).transform((value) => (value === "" ? undefined : value)),
  cityArea: z.string().optional().or(z.literal("")).transform((value) => (value === "" ? undefined : value)),
  bookingType: z.enum(["capacity", "exclusive"]).optional().or(z.literal("")).transform((value) => (value === "" ? undefined : value)),
  status: z.enum(["draft", "pending_review", "active", "suspended", "rejected"]).optional().or(z.literal("")).transform((value) => (value === "" ? undefined : value)),
  hostId: z.string().optional().or(z.literal("")).transform((value) => (value === "" ? undefined : value)),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional().or(z.literal("")).transform((value) => (value === "" ? undefined : value)),
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
