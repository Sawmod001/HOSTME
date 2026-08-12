import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseSessionToken, verifyClerkSession } from "@/lib/getSessionUser";

const BUCKET = "HOSTME";
const ALLOWED = ["jpg", "jpeg", "png", "webp", "gif"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

// Minimal magic-byte sniffing so a .png that is actually HTML/SVG/JS is rejected.
function sniffImageType(bytes) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp";
  return null;
}

export async function POST(request) {
  try {
    // Require a real, verified session — presence-only checks aren't enough.
    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }
    const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
    if (!isValid) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return Response.json(
        { error: "Storage not configured — add SUPABASE_SERVICE_ROLE_KEY to env" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !file.size) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return Response.json({ error: "File is too large. Max size is 5MB." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const detected = sniffImageType(new Uint8Array(bytes));
    if (!detected) {
      return Response.json({ error: "File is not a valid image" }, { status: 400 });
    }

    const ext = detected;
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    let bucketExists = true;

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(uniqueName, Buffer.from(bytes), {
        contentType: `image/${ext}`,
        upsert: false,
      });

    if (error) {
      const errMsg = (error.message || error.error || "").toLowerCase();
      const isBucketProblem = errMsg.includes("bucket") || errMsg.includes("not found") || errMsg.includes("does not exist");

      if (isBucketProblem) {
        bucketExists = false;
        const { error: createErr } = await supabaseAdmin.storage.createBucket(BUCKET, {
          public: true,
        });
        if (createErr) {
          return Response.json({
            error: `Failed to create storage bucket. Create one manually: Supabase Dashboard → Storage → New bucket → name: "${BUCKET}", Public: ON`,
          }, { status: 500 });
        }
      } else {
        return Response.json({ error: `Upload error: ${error.message || "Unknown"}` }, { status: 500 });
      }
    }

    if (!bucketExists) {
      const { data: retryData, error: retryErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(uniqueName, Buffer.from(bytes), {
          contentType: `image/${ext}`,
        });
      if (retryErr) {
        return Response.json({ error: "Upload failed after creating bucket" }, { status: 500 });
      }
      const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(retryData.path).data.publicUrl;
      return Response.json({ url });
    }

    const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(data.path).data.publicUrl;
    return Response.json({ url });
  } catch (error) {
    console.error("POST /api/upload error:", error);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}