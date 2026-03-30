"use client";

import { useEffect, useState } from "react";

export function JobChatPhoneStrip({ roomId, active }: { roomId: string; active: boolean }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active || !roomId) {
      setDone(true);
      return;
    }
    let cancelled = false;
    setDone(false);
    setPhone(null);
    void (async () => {
      try {
        const r = await fetch(
          `/api/chat/rooms/${encodeURIComponent(roomId)}/job-contact`,
          { credentials: "include" }
        );
        const j = (await r.json()) as {
          ok?: boolean;
          disclosed?: boolean;
          phone?: string | null;
        };
        if (cancelled || !j?.ok || !j.disclosed) return;
        const p = typeof j.phone === "string" ? j.phone.trim() : "";
        if (p) setPhone(p);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, active]);

  if (!active || !done || !phone) return null;

  const tel = phone.replace(/\s/g, "");

  return (
    <div className="border-b border-emerald-100 bg-emerald-50/90 px-3 py-2.5 text-[13px] text-emerald-950">
      <span className="font-medium">작성자 연락처</span>
      <span className="mx-1.5 text-emerald-700/80">·</span>
      <span className="text-emerald-800">이 채팅방에서만 표시됩니다</span>
      <div className="mt-1">
        <a href={`tel:${tel}`} className="font-semibold text-emerald-900 underline">
          {phone}
        </a>
      </div>
    </div>
  );
}
