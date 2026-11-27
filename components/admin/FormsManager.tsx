"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Download, FileText, RefreshCw, Trash2, Upload, Eye } from "lucide-react";
import { api } from "@/lib/api";
import { firebaseAuth } from "@/lib/firebase/client";
import { FORM_MAX_BYTES, type FormSubmission, type FormTemplate } from "@/lib/forms-config";
import FormDocumentViewer from "@/components/public/FormDocumentViewer";
import { errorMessage } from "@/components/admin/admin-utils";

const accept = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function formatDate(value: unknown): string {
  let date: Date | null = null;
  if (typeof value === "string") date = new Date(value);
  else if (typeof value === "object" && value !== null && "_seconds" in value) date = new Date(Number(value._seconds) * 1000);
  else if (typeof value === "object" && value !== null && "seconds" in value) date = new Date(Number(value.seconds) * 1000);
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })
    : "Date unavailable";
}

export default function FormsManager() {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [retry, setRetry] = useState(0);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [templateResult, submissionResult] = await Promise.all([
        api.get<{ forms: FormTemplate[] }>("/api/forms?admin=1"),
        api.get<{ submissions: FormSubmission[] }>("/api/forms/submissions"),
      ]);
      setTemplates(templateResult.forms);
      setSubmissions(submissionResult.submissions);
    } catch (reason) {
      setError(errorMessage(reason, "Forms could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, retry]);

  async function saveTemplate(form: FormTemplate | null, title: string, description: string, file: File): Promise<boolean> {
    if (file.size > FORM_MAX_BYTES) {
      setError("Forms must be 20 MB or smaller.");
      return false;
    }
    const body = new FormData();
    if (form) body.set("id", form.id);
    body.set("title", title);
    body.set("description", description);
    body.set("file", file);
    const key = form?.id ?? "new";
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await api.upload("/api/forms", body);
      setNotice(`${title} is now saved as the current form template.`);
      await load();
      return true;
    } catch (reason) {
      setError(errorMessage(reason, "The form template could not be saved."));
      return false;
    } finally {
      setBusy("");
    }
  }

  async function removeTemplate(form: FormTemplate) {
    if (!window.confirm(`Remove "${form.title}" from the public forms page?`)) return;
    setBusy(form.id);
    setError("");
    setNotice("");
    try {
      await api.delete("/api/forms", { id: form.id });
      setNotice(`${form.title} was removed from the public forms page.`);
      await load();
    } catch (reason) {
      setError(errorMessage(reason, "The form template could not be removed."));
    } finally {
      setBusy("");
    }
  }

  async function removeSubmission(submission: FormSubmission) {
    if (!window.confirm(`Permanently delete the submitted file "${submission.fileName}"?`)) return;
    setBusy(submission.id);
    setError("");
    setNotice("");
    try {
      await api.delete(`/api/forms/submissions/${encodeURIComponent(submission.id)}`);
      setNotice(`The submission for ${submission.formTitle} was deleted.`);
      await load();
    } catch (reason) {
      setError(errorMessage(reason, "The form submission could not be deleted."));
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-[#008EFE]">Client documents</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Forms</h1>
          <p className="mt-2 max-w-2xl text-slate-600">Manage the forms shown to the public and securely review completed documents uploaded by clients.</p>
        </div>
        <button type="button" onClick={() => setRetry((value) => value + 1)} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]">
          <RefreshCw size={17} className={loading ? "animate-spin" : ""} aria-hidden="true" /> Refresh
        </button>
      </header>

      <nav aria-label="Forms dashboard shortcuts" className="sticky top-16 z-20 mt-5 flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur lg:top-3">
        <a href="#completed-forms" className="inline-flex min-h-10 shrink-0 items-center rounded-lg bg-[#008EFE] px-3 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#079326]">Submissions ({submissions.length})</a>
        <a href="#public-templates" className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]">Form links &amp; templates</a>
        <a href="#new-form" className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]">Add a form</a>
      </nav>

      <section aria-labelledby="shareable-forms-heading" className="mt-5">
        <h2 id="shareable-forms-heading" className="text-sm font-bold uppercase tracking-wider text-slate-500">Shareable public form links</h2>
        {templates.filter((form) => form.enabled).length > 0
          ? <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{templates.filter((form) => form.enabled).map((form) => <li key={form.id} className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold text-slate-900">{form.title}</h3><div className="mt-3 flex flex-wrap gap-2"><a href={`/forms?form=${encodeURIComponent(form.id)}#form-${encodeURIComponent(form.id)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-lg border border-[#008EFE] px-3 py-1.5 text-xs font-semibold text-[#008EFE] hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]">Open form</a><a href={`/forms?form=${encodeURIComponent(form.id)}#upload-${encodeURIComponent(form.id)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-lg bg-[#079326] px-3 py-1.5 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]">Submission link</a></div></li>)}</ul>
          : <p className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{loading ? "Loading form links…" : "No active forms are available to share."}</p>}
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-[#008EFE] bg-white p-5">
          <p className="text-sm font-medium text-slate-600">Active public forms</p>
          <p className="mt-1 text-3xl font-bold text-[#008EFE]">{loading ? "—" : templates.filter((form) => form.enabled).length}</p>
          <p className="mt-2 text-sm text-slate-600">These appear on the public Forms page.</p>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-600">Recent submissions</p>
          <p className="mt-1 text-3xl font-bold text-[#079326]">{loading ? "—" : submissions.length}</p>
          <p className="mt-2 text-sm text-slate-600">The latest 200 completed forms stored privately in R2.</p>
        </section>
      </div>

      {error && <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
      {notice && <p role="status" className="mt-6 rounded-xl bg-slate-50 p-4 text-sm font-medium text-[#079326]"><CheckCircle2 size={18} className="mr-2 inline" aria-hidden="true" />{notice}</p>}

      <section id="public-templates" className="scroll-mt-24 mt-8" aria-labelledby="form-template-heading">
        <div className="mb-4">
          <h2 id="form-template-heading" className="text-xl font-bold text-slate-950">Public form templates</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Replace a template by uploading its updated PDF or Word file. Deleting a template removes it from the public page.</p>
        </div>
        {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-slate-600">Loading templates…</p>}
        {!loading && templates.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-5 text-slate-600">No templates found.</p>}
        <div className="grid gap-4">
          {templates.map((form) => <TemplateCard key={form.id} form={form} busy={busy === form.id} onSave={saveTemplate} onRemove={removeTemplate} />)}
        </div>
        <div id="new-form" className="scroll-mt-24"><NewTemplateForm busy={busy === "new"} onSave={saveTemplate} /></div>
      </section>

      <section id="completed-forms" className="scroll-mt-24 mt-10" aria-labelledby="form-submissions-heading">
        <div className="mb-4">
          <h2 id="form-submissions-heading" className="text-xl font-bold text-slate-950">Completed forms</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Only authorized administrators can access these private files. You can preview, download, or permanently delete a submission.</p>
        </div>
        {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-slate-600">Loading submissions…</p>}
        {!loading && submissions.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center"><FileText className="mx-auto h-9 w-9 text-slate-400" aria-hidden="true" /><p className="mt-3 font-semibold text-slate-900">No completed forms yet</p><p className="mt-1 text-sm text-slate-600">New client uploads will appear here.</p></div>}
        <div className="space-y-4">
          {submissions.map((submission) => <SubmissionCard key={submission.id} submission={submission} busy={busy === submission.id} onDelete={removeSubmission} />)}
        </div>
      </section>
    </main>
  );
}

function TemplateCard({ form, busy, onSave, onRemove }: {
  form: FormTemplate;
  busy: boolean;
  onSave: (form: FormTemplate, title: string, description: string, file: File) => Promise<boolean>;
  onRemove: (form: FormTemplate) => Promise<void>;
}) {
  const [title, setTitle] = useState(form.title);
  const [description, setDescription] = useState(form.description);
  const [file, setFile] = useState<File | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const input = event.currentTarget.querySelector<HTMLInputElement>('input[type="file"]');
    if (await onSave(form, title, description, file)) {
      setFile(null);
      if (input) input.value = "";
    }
  }

  return (
    <article className={`rounded-xl border bg-white p-5 shadow-sm ${form.enabled ? "border-slate-200" : "border-slate-300"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-slate-950">{form.title}</h3>
          <p className="mt-1 break-all text-xs text-slate-500">{form.fileName} · {form.isBundled ? "Bundled original" : "Stored in R2"}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${form.enabled ? "bg-slate-100 text-[#079326]" : "bg-slate-100 text-slate-600"}`}>{form.enabled ? "Public" : "Removed"}</span>
      </div>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Public title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]" /></label>
        <label className="text-sm font-semibold text-slate-700">Description<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]" /></label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Updated form file<input type="file" accept={accept} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-normal file:mr-3 file:min-h-11 file:border-0 file:bg-slate-100 file:px-3 file:font-semibold file:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]" aria-describedby={`template-file-help-${form.id}`} /><span id={`template-file-help-${form.id}`} className="mt-1 block text-xs font-normal text-slate-500">PDF, DOC, or DOCX; maximum 20 MB. Uploading replaces the current file.</span></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" disabled={!file || busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#008EFE] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#079326]"><Upload size={16} aria-hidden="true" />{busy ? "Saving…" : "Save template"}</button>
          {form.enabled && <button type="button" onClick={() => void onRemove(form)} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500"><Trash2 size={16} aria-hidden="true" />Remove</button>}
        </div>
      </form>
    </article>
  );
}

function NewTemplateForm({ busy, onSave }: {
  busy: boolean;
  onSave: (form: null, title: string, description: string, file: File) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const input = event.currentTarget.querySelector<HTMLInputElement>('input[type="file"]');
    if (await onSave(null, title, description, file)) {
      setTitle("");
      setDescription("");
      setFile(null);
      if (input) input.value = "";
    }
  }

  return (
    <details className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white">
      <summary className="cursor-pointer px-5 py-4 font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]">Add a new form</summary>
      <form onSubmit={submit} className="grid gap-4 border-t border-slate-100 p-5 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Form title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]" /></label>
        <label className="text-sm font-semibold text-slate-700">Description<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]" /></label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Form file<input type="file" accept={accept} onChange={(event) => setFile(event.target.files?.[0] ?? null)} required className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-normal file:mr-3 file:min-h-11 file:border-0 file:bg-slate-100 file:px-3 file:font-semibold file:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]" /></label>
        <div className="sm:col-span-2"><button type="submit" disabled={!file || busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#079326] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]"><Upload size={16} aria-hidden="true" />{busy ? "Saving…" : "Add form"}</button></div>
      </form>
    </details>
  );
}

function SubmissionCard({ submission, busy, onDelete }: {
  submission: FormSubmission;
  busy: boolean;
  onDelete: (submission: FormSubmission) => Promise<void>;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const url = `/api/forms/submissions/${encodeURIComponent(submission.id)}?preview=1`;
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h3 className="font-bold text-slate-950">{submission.formTitle}</h3>
          <p className="mt-1 break-all text-sm text-slate-700">{submission.fileName}</p>
          <p className="mt-1 text-xs text-slate-500">Received {formatDate(submission.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPreviewOpen((open) => !open)} aria-expanded={previewOpen} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#008EFE] px-3 py-2 text-sm font-semibold text-[#008EFE] hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]"><Eye size={16} aria-hidden="true" />{previewOpen ? "Close" : "View"}</button>
          <SubmissionDownloadButton submission={submission} />
          <button type="button" onClick={() => void onDelete(submission)} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500"><Trash2 size={16} aria-hidden="true" />Delete</button>
        </div>
      </div>
      {previewOpen && <div className="mt-4"><FormDocumentViewer url={url} fileName={submission.fileName} fileType={submission.fileType} requiresAdmin /></div>}
    </article>
  );
}

function SubmissionDownloadButton({ submission }: { submission: FormSubmission }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setDownloading(true);
    setError("");
    try {
      const user = firebaseAuth().currentUser;
      if (!user) throw new Error("Please sign in again to download this document.");
      const response = await fetch(`/api/forms/submissions/${encodeURIComponent(submission.id)}`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: "no-store",
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message = typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string"
          ? payload.message
          : "The document could not be downloaded.";
        throw new Error(message);
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = submission.fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The document could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  }

  return <div><button type="button" onClick={() => void download()} disabled={downloading} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#079326] px-3 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-slate-300 disabled:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]"><Download size={16} aria-hidden="true" />{downloading ? "Downloading…" : "Download"}</button>{error && <p role="alert" className="mt-1 max-w-48 text-xs text-red-700">{error}</p>}</div>;
}

