import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !file.size) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const ext = file.name?.split(".").pop()?.toLowerCase() || "jpg";
    const allowed = ["jpg", "jpeg", "png", "webp", "gif"];
    if (!allowed.includes(ext)) {
      return Response.json({ error: "Only jpg, png, webp, gif allowed" }, { status: 400 });
    }

    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    await writeFile(path.join(uploadDir, uniqueName), Buffer.from(bytes));

    return Response.json({ url: `/uploads/${uniqueName}` });
  } catch (error) {
    console.error("POST /api/upload error:", error);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
