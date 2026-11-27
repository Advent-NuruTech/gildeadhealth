import { NextRequest } from "next/server";
import { HttpError, errorResponse } from "@/lib/auth";
import { BUILT_IN_FORMS } from "@/lib/forms-config";
import { firestore } from "@/lib/firestore";
import { getR2Object } from "@/lib/r2";

export const runtime = "nodejs";

function isMissingObject(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error &&
    ["NoSuchKey", "NotFound"].includes(String(error.name)));
}

function safeFilename(value: string): string {
  return value.replace(/[\r\n\0"]/g, "_").replace(/[^\x20-\x7E]/g, "_");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) throw new HttpError(404, "Form template not found");
    const builtin = BUILT_IN_FORMS.find((form) => form.id === id);
    const snapshot = await firestore().collection("formTemplates").doc(id).get();
    if (!snapshot.exists && !builtin) throw new HttpError(404, "Form template not found");
    const record = snapshot.data() ?? {};
    if (record.enabled === false) throw new HttpError(404, "Form template not found");

    const fileName = typeof record.fileName === "string" ? record.fileName : builtin?.fileName;
    if (!fileName) throw new HttpError(404, "Form template not found");
    const fileType = typeof record.fileType === "string"
      ? record.fileType
      : fileName.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : fileName.toLowerCase().endsWith(".doc")
          ? "application/msword"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    if (typeof record.fileKey !== "string") throw new HttpError(404, "Form template not found");
    let object;
    try {
      object = await getR2Object(record.fileKey);
    } catch (error) {
      if (isMissingObject(error)) throw new HttpError(404, "Form template not found");
      throw error;
    }
    if (!object.Body) throw new HttpError(404, "Form template not found");

    const inline = request.nextUrl.searchParams.get("preview") === "1";
    const disposition = inline && fileType === "application/pdf" ? "inline" : "attachment";
    return new Response(object.Body.transformToWebStream(), {
      headers: {
        "Content-Type": fileType,
        "Content-Disposition": `${disposition}; filename="${safeFilename(fileName)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
