import "server-only";

import { HttpError } from "@/lib/auth";
import { FORM_MAX_BYTES } from "@/lib/forms-config";

const FORM_DOCUMENT_TYPES = new Map<string, string>([
  [".pdf", "application/pdf"],
  [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
]);

export async function validateFormDocument(file: File): Promise<{
  fileName: string;
  fileType: string;
  bytes: Buffer;
}> {
  const fileName = file.name.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  const safeName = fileName.replace(/[\r\n\0"]/g, "_").replace(/[^a-zA-Z0-9._ -]/g, "_");
  if (!safeName || safeName === "." || safeName === "..") {
    throw new HttpError(400, "Invalid form filename");
  }
  const extension = safeName.includes(".") ? `.${safeName.split(".").pop()!.toLowerCase()}` : "";
  const fileType = FORM_DOCUMENT_TYPES.get(extension);
  if (!fileType || (file.type !== "" && file.type !== fileType)) {
    throw new HttpError(415, "Only PDF, DOC and DOCX forms are allowed");
  }
  if (file.size === 0) throw new HttpError(400, "The form file is empty");
  if (file.size > FORM_MAX_BYTES) throw new HttpError(413, "Forms must be 20 MB or smaller");

  const bytes = Buffer.from(await file.arrayBuffer());
  validateFormFileContents(fileType, bytes);
  return { fileName: safeName.slice(0, 180), fileType, bytes };
}

export function validateFormFileContents(
  fileType: string,
  bytes: Buffer,
): void {
  const valid = fileType === "application/pdf"
    ? bytes.subarray(0, 5).toString("ascii") === "%PDF-"
    : fileType === "application/msword"
      ? bytes.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))
      : fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ? bytes.subarray(0, 2).toString("ascii") === "PK"
        : false;
  if (!valid) throw new HttpError(415, "The file contents do not match a supported form type");
}
