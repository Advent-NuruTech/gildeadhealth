"use client";

import { useEffect, useState } from "react";
import { ChevronUp, MessageCircle } from "lucide-react";
import { getPublicChatSettings } from "@/lib/public-settings-client";
import { serviceAreas } from "@/lib/site-config";

const chatMessage = [
  "Hello GILEAD, I found you through your website and would like to know more about your services.",
  "My name: [Your name]",
  "My location: [Town or county]",
  "Service I am interested in: [Choose a service below or describe what you need]",
  `GILEAD services:\n${serviceAreas.map(({ title, summary }) => `- ${title}: ${summary}`).join("\n")}`,
  "Please share more information and the next steps. Thank you.",
].join("\n\n");

const chatClassName =
  "grid h-12 w-12 place-items-center rounded-full bg-[#079326] text-white shadow-lg transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#079326]";

export default function FloatingActions() {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [chatUrl, setChatUrl] = useState("");
  const [chatUnavailable, setChatUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    getPublicChatSettings()
      .then(({ directPhone }) => {
        if (active) {
          setChatUrl(`https://wa.me/${directPhone}?text=${encodeURIComponent(chatMessage)}`);
        }
      })
      .catch(() => {
        if (active) setChatUnavailable(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col gap-3 sm:bottom-7 sm:right-7">
      {chatUrl ? (
        <a
          href={chatUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Chat with GILEAD on WhatsApp"
          className={chatClassName}
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </a>
      ) : chatUnavailable ? (
        <>
          <a
            href="/contact"
            aria-label="Chat is unavailable; view contact details"
            className={chatClassName}
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </a>
          <span role="status" className="sr-only">
            WhatsApp chat is temporarily unavailable. View the contact page for other ways to reach GILEAD.
          </span>
        </>
      ) : (
        <span role="status" aria-label="Loading WhatsApp chat" className={chatClassName}>
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </span>
      )}

      {showBackToTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
          className="grid h-11 w-11 place-items-center rounded-full border border-[#008EFE] bg-white text-[#008EFE] shadow-lg transition hover:bg-[#008EFE] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE]"
        >
          <ChevronUp className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
