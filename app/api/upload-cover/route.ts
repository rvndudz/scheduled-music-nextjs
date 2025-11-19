import path from "node:path";
import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { uploadFileToR2 } from "@/lib/r2Client";

export const runtime = "nodejs";

const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing cover image in form data." },
        { status: 400 },
      );
    }

    const mimeType = file.type || "application/octet-stream";
    if (!allowedMimeTypes.includes(mimeType)) {
      return NextResponse.json(
        {
          error: "Only JPEG, PNG, or WebP images are supported for covers.",
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const imageId = randomUUID();
    const ext = path.extname(file.name).toLowerCase() || ".jpg";
    const safeName = toSlug(path.parse(file.name).name) || imageId;

    let imageUrl: string;
    try {
      imageUrl = await uploadFileToR2({
        objectKey: `images/${imageId}-${safeName}${ext}`,
        body: buffer,
        contentType: mimeType,
      });
    } catch (error) {
      console.error("Cover upload failed:", error);
      return NextResponse.json(
        { error: "Uploading cover image failed." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        cover_image_url: imageUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Unhandled upload-cover error:", error);
    return NextResponse.json(
      { error: "Unexpected error while uploading cover." },
      { status: 500 },
    );
  }
}
