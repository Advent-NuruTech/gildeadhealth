import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { errorResponse, HttpError, requireAdmin } from "@/lib/auth";
import { BUILT_IN_FORMS } from "@/lib/forms-config";
import { validateFormDocument } from "@/lib/forms-server";
import { firestore } from "@/lib/firestore";
import { buildObjectKey, deleteFromR2, uploadToR2 } from "@/lib/r2";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const snapshot = await firestore()
      .collection("formSubmissions")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();
    const submissions = snapshot.docs.map((document) => {
      const data = document.data();
      return {
        id: document.id,
        formId: data.formId,
        formTitle: data.formTitle,
        fileName: data.fileName,
        fileType: data.fileType,
        createdAt: data.createdAt,
      };
    });
    return NextResponse.json({ submissions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new HttpError(400, "A multipart submission is required");
    }

    const formId = String(form.get("formId") ?? "");
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(formId)) throw new HttpError(400, "Choose a valid form");
    const builtin = BUILT_IN_FORMS.find((item) => item.id === formId);
    const template = await firestore().collection("formTemplates").doc(formId).get();
    if ((!template.exists && !builtin) || template.data()?.enabled === false) {
      throw new HttpError(404, "This form is no longer available");
    }
    const templateData = template.data();
    const formTitle = typeof templateData?.title === "string"
      ? templateData.title
      : builtin?.title;
    if (!formTitle) throw new HttpError(404, "This form is no longer available");

    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose the completed form to submit");
    const { fileName, fileType, bytes } = await validateFormDocument(file);
    const submissions = firestore().collection("formSubmissions");
    const submission = submissions.doc();
    const key = buildObjectKey(`forms/submissions/${submission.id}`, fileName);
    await uploadToR2(key, bytes, fileType, {
      contentDisposition: `attachment; filename="${fileName.replace(/["\r\n]/g, "_")}"`,
      metadata: { "original-name": encodeURIComponent(fileName) },
    });

    try {
      await submission.set({
        formId,
        formTitle,
        fileName,
        fileType,
        fileKey: key,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      try {
        await deleteFromR2(key);
      } catch (cleanupError) {
        console.error("Form submission could not be cleaned up after a metadata failure", cleanupError);
      }
      throw error;
    }

    return NextResponse.json(
      { message: "Your completed form was submitted successfully" },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
