import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { errorResponse, HttpError, requireAdmin } from "@/lib/auth";
import { BUILT_IN_FORMS, type FormTemplate } from "@/lib/forms-config";
import { validateFormDocument } from "@/lib/forms-server";
import { firestore } from "@/lib/firestore";
import { buildObjectKey, deleteFromR2, uploadToR2 } from "@/lib/r2";

export const runtime = "nodejs";

const collectionName = "formTemplates";
const formIdPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;

function documentType(fileName: string, storedType?: unknown): string {
  if (typeof storedType === "string" && storedType) return storedType;
  return fileName.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : fileName.toLowerCase().endsWith(".doc")
      ? "application/msword"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function slugFromTitle(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export async function GET(request: NextRequest) {
  try {
    const adminView = request.nextUrl.searchParams.get("admin") === "1";
    if (adminView) await requireAdmin(request);

    const snapshot = await firestore().collection(collectionName).get();
    const records = new Map(snapshot.docs.map((document) => [document.id, document.data()]));
    const builtInIds = new Set<string>(BUILT_IN_FORMS.map((form) => form.id));
    const templates: FormTemplate[] = [
      ...BUILT_IN_FORMS.map((form) => {
        const record = records.get(form.id) ?? {};
        const fileName = typeof record.fileName === "string" ? record.fileName : form.fileName;
        return {
          ...form,
          title: typeof record.title === "string" ? record.title : form.title,
          description: typeof record.description === "string" ? record.description : form.description,
          fileName,
          fileType: documentType(fileName, record.fileType),
          fileUrl: typeof record.fileKey === "string"
            ? `/api/forms/templates/${encodeURIComponent(form.id)}`
            : `/assets/forms/${encodeURIComponent(fileName)}`,
          enabled: record.enabled !== false,
          isBundled: typeof record.fileKey !== "string",
          ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
        };
      }),
      ...snapshot.docs
        .filter((document) => !builtInIds.has(document.id))
        .map((document) => {
          const record = document.data();
          const fileName = typeof record.fileName === "string" ? record.fileName : "form";
          return {
            id: document.id,
            title: typeof record.title === "string" ? record.title : fileName,
            description: typeof record.description === "string" ? record.description : "",
            fileName,
            fileType: documentType(fileName, record.fileType),
            fileUrl: `/api/forms/templates/${encodeURIComponent(document.id)}`,
            enabled: record.enabled !== false,
            isBundled: false,
            ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
          };
        }),
    ];

    return NextResponse.json({
      forms: adminView ? templates : templates.filter((form) => form.enabled),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new HttpError(400, "A multipart form upload is required");
    }

    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a form document to upload");
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    if (!title || title.length > 120) throw new HttpError(400, "Form titles must be 1 to 120 characters");
    if (description.length > 500) throw new HttpError(400, "Form descriptions must be 500 characters or fewer");

    const requestedId = String(form.get("id") ?? "").trim();
    const baseId = requestedId || slugFromTitle(title);
    if (!formIdPattern.test(baseId)) throw new HttpError(400, "Use a title containing letters or numbers for the form name");

    const templates = firestore().collection(collectionName);
    let id = baseId;
    let existing = await templates.doc(id).get();
    if (!requestedId && (existing.exists || BUILT_IN_FORMS.some((form) => form.id === baseId))) {
      id = `${baseId}-${randomUUID().slice(0, 8)}`;
      existing = await templates.doc(id).get();
    }

    const { fileName, fileType, bytes } = await validateFormDocument(file);
    const key = buildObjectKey(`forms/templates/${id}`, fileName, randomUUID());
    await uploadToR2(key, bytes, fileType, {
      contentDisposition: `attachment; filename="${fileName.replace(/["\r\n]/g, "_")}"`,
      metadata: { "original-name": encodeURIComponent(fileName) },
    });

    const previousKey = existing.data()?.fileKey;
    try {
      await templates.doc(id).set({
        id,
        title,
        description,
        fileName,
        fileType,
        fileKey: key,
        enabled: true,
        ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      try {
        await deleteFromR2(key);
      } catch (cleanupError) {
        console.error("New form template could not be cleaned up after a metadata failure", cleanupError);
      }
      throw error;
    }

    if (typeof previousKey === "string" && previousKey !== key) {
      try {
        await deleteFromR2(previousKey);
      } catch (error) {
        console.error("Previous form template could not be deleted after replacement", error);
        throw new HttpError(500, "The new form was saved, but the previous file could not be removed. Contact an administrator.");
      }
    }

    return NextResponse.json({
      message: "Form template saved",
      id,
      fileUrl: `/api/forms/templates/${encodeURIComponent(id)}`,
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "A JSON body containing the form id is required");
    }
    const id = body && typeof body === "object" && "id" in body ? body.id : undefined;
    if (typeof id !== "string" || !formIdPattern.test(id)) throw new HttpError(400, "Invalid form id");

    const reference = firestore().collection(collectionName).doc(id);
    const existing = await reference.get();
    const isBuiltin = BUILT_IN_FORMS.some((form) => form.id === id);
    if (!existing.exists && !isBuiltin) throw new HttpError(404, "Form template not found");
    const fileKey = existing.data()?.fileKey;

    await reference.set({
      id,
      enabled: false,
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (typeof fileKey === "string") {
      try {
        await deleteFromR2(fileKey);
      } catch (error) {
        console.error("Deleted form template file could not be removed from R2", error);
        throw new HttpError(500, "The form was hidden, but its stored file could not be deleted. Try again or contact an administrator.");
      }
    }

    return NextResponse.json({ message: "Form template removed" });
  } catch (error) {
    return errorResponse(error);
  }
}
