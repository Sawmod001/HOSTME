import { supabaseAdmin } from "@/lib/supabase-admin";

const BUCKET = "listings";
const ALLOWED = ["jpg", "jpeg", "png", "webp", "gif"];

export async function POST(request) {
  try {
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

    const ext = file.name?.split(".").pop()?.toLowerCase() || "jpg";
    if (!ALLOWED.includes(ext)) {
      return Response.json({ error: "Only jpg, png, webp, gif allowed" }, { status: 400 });
    }

    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const bytes = await file.arrayBuffer();

    let bucketExists = true;

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(uniqueName, Buffer.from(bytes), {
        contentType: file.type || `image/${ext}`,
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
          contentType: file.type || `image/${ext}`,
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
