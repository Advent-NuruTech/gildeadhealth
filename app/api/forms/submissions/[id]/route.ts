import { NextRequest, NextResponse } from "next/server";
import { errorResponse, HttpError, requireAdmin } from "@/lib/auth";
import { firestore } from "@/lib/firestore";
import { deleteFromR2, getR2Object } from "@/lib/r2";

export const runtime = "nodejs";

function isMissingObject(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error &&
    ["NoSuchKey", "NotFound"].includes(String(error.name)));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) throw new HttpError(404, "Form submission not found");
    const snapshot = await firestore().collection("formSubmissions").doc(id).get();
    if (!snapshot.exists) throw new HttpError(404, "Form submission not found");
    const data = snapshot.data()!;
    if (typeof data.fileKey !== "string" || typeof data.fileName !== "string") {
      throw new HttpError(404, "Submitted document not found");
    }

    let object;
    try {
      object = await getR2Object(data.fileKey);
    } catch (error) {
      if (isMissingObject(error)) throw new HttpError(404, "Submitted document not found");
      throw error;
    }
    if (!object.Body) throw new HttpError(404, "Submitted document not found");
    const fileType = typeof data.fileType === "string" ? data.fileType : "application/octet-stream";
    const preview = request.nextUrl.searchParams.get("preview") === "1" && fileType === "application/pdf";
    const fileName = data.fileName.replace(/[\r\n\0"]/g, "_").replace(/[^\x20-\x7E]/g, "_");
    const headers = new Headers({
      "Content-Type": fileType,
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (object.ContentLength !== undefined) headers.set("Content-Length", String(object.ContentLength));
    return new Response(object.Body.transformToWebStream(), { status: 200, headers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) throw new HttpError(404, "Form submission not found");
    const reference = firestore().collection("formSubmissions").doc(id);
    const snapshot = await reference.get();
    if (!snapshot.exists) throw new HttpError(404, "Form submission not found");
    const key = snapshot.data()?.fileKey;
    if (typeof key !== "string") throw new HttpError(404, "Submitted document not found");

    await deleteFromR2(key);
    await reference.delete();
    return NextResponse.json({ message: "Form submission deleted" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
