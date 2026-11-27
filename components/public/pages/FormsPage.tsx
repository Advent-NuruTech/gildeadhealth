"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Download, Eye, FileText, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { FORM_MAX_BYTES, type FormTemplate } from "@/lib/forms-config";
import FormDocumentViewer from "@/components/public/FormDocumentViewer";
import { errorMessage } from "@/components/admin/admin-utils";

const accept = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export default function FormsPage() {
  const [forms, setForms] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.get<{ forms: FormTemplate[] }>("/api/forms")
      .then((result) => { if (active) setForms(result.forms); })
      .catch((reason) => { if (active) setError(errorMessage(reason, "Forms could not be loaded.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  return (
    <main>
      <section className="bg-[#079326] px-4 py-14 text-white sm:px-6 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-white">Gilead Medicare forms</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">Download, complete, and submit your form.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/90 sm:text-lg">View a blank form online or download it to complete. When you are ready, upload the completed PDF or Word document below.</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14" aria-labelledby="available-forms">
        <div className="mb-6">
          <h2 id="available-forms" className="text-2xl font-bold text-slate-950">Available forms</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Choose the form that applies to you. Completed files are sent securely to the GILEAD administration team.</p>
        </div>

        {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">Loading forms…</p>}
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800"><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 font-semibold"><RefreshCw size={16} aria-hidden="true" /> Try again</button></div>}
        {!loading && !error && forms.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-8 text-slate-600">There are no forms available right now.</p>}

        <div className="grid gap-5">
          {forms.map((form) => <PublicFormCard key={form.id} form={form} />)}
        </div>

        <aside className="mt-8 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <ShieldCheck size={21} className="mt-0.5 shrink-0 text-[#008EFE]" aria-hidden="true" />
          <p><strong className="text-slate-900">Your privacy matters.</strong> Submitted documents are stored privately and can only be accessed by authorized administrators. Please upload only the completed form requested.</p>
        </aside>
      </section>
    </main>
  );
}

function PublicFormCard({ form }: { form: FormTemplate }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!selectedFile) {
      setError("Choose the completed form before submitting.");
      return;
    }
    if (selectedFile.size > FORM_MAX_BYTES) {
      setError("The completed form must be 20 MB or smaller.");
      return;
    }

    const body = new FormData();
    body.set("formId", form.id);
    body.set("file", selectedFile);
    setSubmitting(true);
    try {
      const result = await api.upload<{ message: string }>("/api/forms/submissions", body);
      setSuccess(result.message);
      setSelectedFile(null);
      const input = event.currentTarget.querySelector<HTMLInputElement>('input[type="file"]');
      if (input) input.value = "";
    } catch (reason) {
      setError(errorMessage(reason, "Your form could not be submitted. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-[#079326]"><FileText size={22} aria-hidden="true" /></span>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-950">{form.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{form.description}</p>
              <p className="mt-2 break-all text-xs text-slate-500">{form.fileName}</p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={() => setPreviewOpen((open) => !open)} aria-expanded={previewOpen} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#008EFE] px-3 py-2 text-sm font-semibold text-[#008EFE] hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]">
            <Eye size={16} aria-hidden="true" /> {previewOpen ? "Close preview" : "View online"}
          </button>
          <a href={`${form.fileUrl}?download=1`} download={form.fileName} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#079326] px-3 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]">
            <Download size={16} aria-hidden="true" /> Download
          </a>
        </div>
      </div>

      {previewOpen && <div className="mt-5"><FormDocumentViewer url={`${form.fileUrl}?preview=1`} fileName={form.fileName} fileType={form.fileType} /></div>}

      <form onSubmit={submit} className="mt-5 border-t border-slate-100 pt-5">
        <label htmlFor={`completed-form-${form.id}`} className="block text-sm font-semibold text-slate-800">Upload your completed form</label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input id={`completed-form-${form.id}`} name="completed-form" type="file" accept={accept} onChange={(event) => { setSelectedFile(event.target.files?.[0] ?? null); setError(""); setSuccess(""); }} className="block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 file:mr-3 file:min-h-11 file:border-0 file:bg-slate-100 file:px-3 file:font-semibold file:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]" aria-describedby={`form-help-${form.id}`} />
          <button type="submit" disabled={submitting} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#008EFE] px-5 py-2.5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#079326] disabled:cursor-wait disabled:bg-slate-300 disabled:text-slate-600">
            <Upload size={17} aria-hidden="true" /> {submitting ? "Uploading…" : "Submit form"}
          </button>
        </div>
        <p id={`form-help-${form.id}`} className="mt-2 text-xs leading-5 text-slate-500">PDF, DOC, or DOCX; maximum 20 MB.</p>
        {selectedFile && <p className="mt-2 break-all text-sm text-slate-600">Selected: {selectedFile.name}</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {success && <p role="status" className="mt-3 rounded-lg bg-slate-50 p-3 text-sm font-medium text-[#079326]"><CheckCircle2 size={17} className="mr-1 inline" aria-hidden="true" />{success}</p>}
      </form>
    </article>
  );
}
