"use client";

import Link from "next/link";
import { Bell, CheckCheck, LoaderCircle } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";
import type { AppNotification } from "@/lib/types";

type NotificationsResponse = { notifications: AppNotification[]; unreadCount: number };

function timeLabel(value?: string) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`;
  return date.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

export default function NotificationBell({ dark = false, placement = "below" }: { dark?: boolean; placement?: "above" | "below" }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await api.get<NotificationsResponse>("/api/notifications");
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // A transient notification failure should not interfere with navigation.
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) { setNotifications([]); setUnreadCount(0); return; }
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const interval = window.setInterval(() => void load(), 45_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load, user]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && !panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPanelPosition(null);
      return;
    }
    const button = trigger.current;
    const popup = panel.current;
    if (!button || !popup) return;

    const updatePosition = () => {
      const buttonRect = button.getBoundingClientRect();
      const popupRect = popup.getBoundingClientRect();
      const margin = 12;
      const height = Math.min(popupRect.height, window.innerHeight - margin * 2);
      const availableAbove = buttonRect.top - margin;
      const availableBelow = window.innerHeight - buttonRect.bottom - margin;
      const preferAbove = placement === "above";
      const canPlaceAbove = availableAbove >= Math.min(height, 320);
      const canPlaceBelow = availableBelow >= Math.min(height, 280);
      const placeAbove = preferAbove ? canPlaceAbove || !canPlaceBelow : !canPlaceBelow && canPlaceAbove;
      const desiredTop = placeAbove ? buttonRect.top - height - 8 : buttonRect.bottom + 8;
      const desiredLeft = buttonRect.right - popupRect.width;
      setPanelPosition({
        top: Math.max(margin, Math.min(desiredTop, window.innerHeight - height - margin)),
        left: Math.max(margin, Math.min(desiredLeft, window.innerWidth - popupRect.width - margin)),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const observer = new ResizeObserver(updatePosition);
    observer.observe(popup);
    observer.observe(button);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      observer.disconnect();
    };
  }, [open, loading, notifications.length, placement]);

  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>("button, a")?.focus();
  }, [open]);

  if (!user) return null;
  const markRead = async (ids: string[]) => {
    const unreadIds = ids.filter((id) => notifications.some((notification) => notification.id === id && !notification.readAt));
    if (!unreadIds.length) return;
    setNotifications((current) => current.map((notification) => unreadIds.includes(notification.id) ? { ...notification, readAt: new Date().toISOString() } : notification));
    setUnreadCount((current) => Math.max(0, current - unreadIds.length));
    try { await api.patch("/api/notifications", { ids: unreadIds }); } catch { void load(); }
  };
  const buttonColor = dark ? "text-white hover:bg-black/10" : "text-slate-600 hover:bg-slate-100 hover:text-[#079326]";

  return <div className="relative">
    <button ref={trigger} type="button" onClick={() => { setOpen((current) => !current); if (!open) { setPanelPosition(null); void load(); } }} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={open} aria-controls="notification-panel" aria-haspopup="dialog" className={`relative grid h-10 w-10 place-items-center rounded-xl transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008EFE] ${buttonColor}`}>
      <Bell size={20} aria-hidden="true" />
      {unreadCount > 0 && <span className="absolute right-0.5 top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-[#008EFE] px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>
    {open && typeof document !== "undefined" && createPortal(<section ref={panel} id="notification-panel" role="dialog" aria-label="Notifications" className="fixed z-[9999] flex max-h-[calc(100dvh-1.5rem)] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" style={{ top: panelPosition?.top ?? 0, left: panelPosition?.left ?? 12, visibility: panelPosition ? "visible" : "hidden" }}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="font-bold text-slate-900">Notifications</h2><p className="text-xs text-slate-500">{unreadCount ? `${unreadCount} unread` : "You’re all caught up"}</p></div>{unreadCount > 0 && <button type="button" onClick={() => void markRead(notifications.map((notification) => notification.id))} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#079326] hover:bg-slate-100"><CheckCheck size={15} /> Mark all read</button>}</div>
      <div className="min-h-0 flex-1 overflow-y-auto">{loading && notifications.length === 0 ? <p role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={18} /> Loading notifications…</p> : notifications.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">New account and order updates will appear here.</p> : <ul>{notifications.map((notification) => <li key={notification.id} className={`border-b border-slate-100 last:border-0 ${notification.readAt ? "bg-white" : "bg-slate-100"}`}>{notification.href ? <Link href={notification.href} onClick={() => { void markRead([notification.id]); setOpen(false); }} className="block px-4 py-3 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#008EFE]">{notificationContent(notification)}</Link> : <button type="button" onClick={() => void markRead([notification.id])} className="block w-full px-4 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#008EFE]">{notificationContent(notification)}</button>}</li>)}</ul>}</div>
    </section>, document.body)}
  </div>;
}

function notificationContent(notification: AppNotification) {
  return <><div className="flex items-start gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.readAt ? "bg-transparent" : "bg-[#008EFE]"}`} aria-hidden="true" /><div className="min-w-0"><p className="font-semibold text-slate-900">{notification.title}</p><p className="mt-0.5 text-sm leading-5 text-slate-600">{notification.body}</p><p className="mt-1 text-xs text-slate-400">{timeLabel(notification.createdAt)}</p></div></div></>;
}
