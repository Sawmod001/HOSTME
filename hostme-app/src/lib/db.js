import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;

const globalForMongoose = globalThis;

if (!globalForMongoose.__hostmeMongooseCache) {
    globalForMongoose.__hostmeMongooseCache = { conn: null, promise: null };
}

const cached = globalForMongoose.__hostmeMongooseCache;

export async function connectToDatabase() {
    if (!uri) {
        return { connected: false, reason: "MONGODB_URI is not configured" };
    }

    if (cached.conn) {
        return { connected: true, connection: cached.conn };
    }

    if (!cached.promise) {
        cached.promise = mongoose.connect(uri).then((connection) => connection);
    }

    try {
        cached.conn = await cached.promise;
        return { connected: true, connection: cached.conn };
    } catch (error) {
        cached.promise = null;
        throw error;
    }
}
