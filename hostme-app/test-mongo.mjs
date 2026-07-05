// MongoDB connection test — run with: node test-mongo.mjs
import mongoose from "mongoose";

const MONGODB_URI =
  "mongodb+srv://sawmodabolaji_db_user:e0Jfw0RIacsihbCx@cluster0.aphsje6.mongodb.net/hostme?retryWrites=true&w=majority";

console.log("🔌 Connecting to MongoDB Atlas...");

try {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected! Host:", mongoose.connection.host);
  console.log("   DB Name:", mongoose.connection.name);
  console.log("   Ready State:", mongoose.connection.readyState, "(1 = connected)");

  // List collections
  const collections = await mongoose.connection.db.listCollections().toArray();
  if (collections.length === 0) {
    console.log("   📂 No collections yet (fresh database — expected for a new project)");
  } else {
    console.log("   📂 Collections found:");
    collections.forEach((c) => console.log(`      - ${c.name}`));
  }

  // Quick ping
  await mongoose.connection.db.admin().ping();
  console.log("   🏓 Ping OK — Atlas cluster is reachable and responsive");
} catch (err) {
  console.error("❌ Connection FAILED:", err.message);
  if (err.code) console.error("   Error code:", err.code);
} finally {
  await mongoose.disconnect();
  console.log("🔒 Disconnected.");
}
