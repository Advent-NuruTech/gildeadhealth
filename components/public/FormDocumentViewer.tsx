"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText } from "lucide-react";
import { firebaseAuth } from "@/lib/firebase/client";

type Props = {
  url: string;
  fileName: string;
  fileType: string;
  requiresAdmin?: boolean;
};

function responseMessage(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }
  return "The document could not be opened.";
}

export default function FormDocumentViewer({ url, fileName, fileType, requiresAdmin = false }: Props) {
  const documentContainer = useRef<HTMLDivElement>(null);
  const styleContainer = useRef<HTMLDivElement>(null);
  const [objectUrl, setObjectUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isDocx = fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isPdf = fileType === "application/pdf";

  useEffect(() => {
    let active = true;
    let currentUrl = "";

    async function load() {
      setLoading(true);
      setError("");
      setObjectUrl("");
      try {
        const headers = new Headers();
        if (requiresAdmin) {
          const user = firebaseAuth().currentUser;
          if (!user) throw new Error("Please sign in again to view this document.");
          headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
        }
        const response = await fetch(url, { headers, cache: "no-store" });
        if (!response.ok) {
          const payload: unknown = await response.json().catch(() => null);
          throw new Error(responseMessage(payload));
        }
        const blob = await response.blob();
        currentUrl = URL.createObjectURL(blob);
        if (active) setObjectUrl(currentUrl);
        if (isDocx) {
          const { renderAsync } = await import("docx-preview");
          if (active && documentContainer.current && styleContainer.current) {
            documentContainer.current.replaceChildren();
            styleContainer.current.replaceChildren();
            await renderAsync(blob, documentContainer.current, styleContainer.current, {
              inWrapper: true,
              breakPages: true,
              ignoreLastRenderedPageBreak: false,
              renderAltChunks: false,
            });
            documentContainer.current.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
              const href = anchor.getAttribute("href") ?? "";
              if (href.startsWith("#")) return;
              try {
                const protocol = new URL(href, window.location.href).protocol;
                if (!["http:", "https:", "mailto:"].includes(protocol)) anchor.removeAttribute("href");
                else if (protocol === "http:" || protocol === "https:") {
                  anchor.target = "_blank";
                  anchor.rel = "noopener noreferrer";
                }
              } catch {
                anchor.removeAttribute("href");
              }
            });
          }
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "The document could not be opened.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      documentContainer.current?.replaceChildren();
      styleContainer.current?.replaceChildren();
    };
  }, [url, requiresAdmin, isDocx]);

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4" aria-label={`Preview of ${fileName}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800">
          <FileText size={18} className="shrink-0 text-[#008EFE]" aria-hidden="true" />
          <span className="truncate">{fileName}</span>
        </p>
        {objectUrl && <a href={objectUrl} download={fileName} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-[#079326] px-3 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]"><Download size={16} aria-hidden="true" /> Download</a>}
      </div>
      {loading && <p role="status" className="py-8 text-center text-sm text-slate-600">Opening document preview…</p>}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} Use the download button if it is available.</p>}
      {!loading && !error && isPdf && objectUrl && <iframe title={`${fileName} preview`} src={objectUrl} className="h-[65vh] min-h-96 w-full rounded-lg border border-slate-200 bg-white" />}
      {!loading && !error && isDocx && <><div ref={styleContainer} /><div ref={documentContainer} className="max-h-[70vh] overflow-auto rounded-lg bg-slate-200 p-3 sm:p-5" /></>}
      {!loading && !error && !isPdf && !isDocx && <p className="rounded-lg bg-white p-4 text-sm text-slate-600">This document format cannot be previewed in the browser. Download it to view and complete it.</p>}
    </section>
  );
}
