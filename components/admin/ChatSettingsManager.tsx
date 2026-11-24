"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Save } from "lucide-react";
import { api } from "@/lib/api";
import type { ChatSettings } from "@/lib/types";
import { errorMessage } from "@/components/admin/admin-utils";
import { serviceAreas } from "@/lib/site-config";

const emptySettings: ChatSettings = { directPhone: "", categories: [] };

export default function ChatSettingsManager() {
  const [settings, setSettings] = useState<ChatSettings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get<ChatSettings>("/api/admin/chat")
      .then(setSettings)
      .catch((nextError) => setError(errorMessage(nextError, "Could not load chat settings")))
      .finally(() => setLoading(false));
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const categories = serviceAreas.map((area, index) => ({
        id: `service-${index + 1}`,
        label: area.title,
        phone: settings.directPhone,
      }));
      const saved = await api.put<ChatSettings>("/api/admin/chat", {
        directPhone: settings.directPhone,
        categories,
      });
      setSettings(saved);
      setMessage("The WhatsApp contact number and service message have been saved.");
    } catch (nextError) {
      setError(errorMessage(nextError, "Could not save chat settings"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="container mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-[#079326] p-3 text-white"><MessageCircle /></div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">WhatsApp chat settings</h1>
          <p className="mt-2 text-gray-600">Set the main contact number for the website chat. Visitors get a prefilled message with GILEAD&apos;s services and fields for their details.</p>
        </div>
      </div>

      {error && <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
      {message && <p role="status" className="mt-6 rounded-lg border border-[#079326] bg-white p-4 text-[#079326]">{message}</p>}

      <form onSubmit={save} className="mt-6 space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <label className="block font-semibold text-gray-900">
            Main contact person&apos;s WhatsApp number
            <input
              id="direct-chat-number"
              required
              type="tel"
              value={settings.directPhone}
              onChange={(event) => setSettings((current) => ({ ...current, directPhone: event.target.value }))}
              placeholder="254721627977"
              className="input-field mt-2"
            />
          </label>
          <p className="mt-2 text-sm text-gray-500">Include the country code. The floating chat button sends every enquiry to this number.</p>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Services included in the chat message</h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {serviceAreas.map((area) => (
              <li key={area.title} className="rounded-lg border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900">{area.title}</h3>
                <p className="mt-1 text-sm leading-6 text-gray-600">{area.summary}</p>
              </li>
            ))}
          </ul>
        </section>

        <button disabled={loading || saving} className="flex items-center gap-2 rounded-lg bg-[#079326] px-6 py-3 font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#079326] disabled:opacity-50">
          <Save size={18} /> {saving ? "Saving…" : "Save chat settings"}
        </button>
      </form>
    </main>
  );
}
