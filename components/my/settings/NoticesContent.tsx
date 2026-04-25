"use client";

import { useEffect, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type NoticeItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

function formatDate(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  return value.toLocaleDateString("ko-KR");
}

export function NoticesContent() {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await runSingleFlight("me:settings:notices:get", () =>
          fetch("/api/me/settings/notices", {
            credentials: "include",
            cache: "no-store",
          })
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          notices?: NoticeItem[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(typeof json.error === "string" ? json.error : "공지사항을 불러오지 못했습니다.");
          setNotices([]);
          return;
        }
        setNotices(Array.isArray(json.notices) ? json.notices : []);
      } catch {
        if (!cancelled) {
          setError("공지사항을 불러오지 못했습니다.");
          setNotices([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="py-12 text-center sam-text-body text-sam-muted">불러오는 중입니다.</div>;
  }

  if (error) {
    return <div className="py-12 text-center sam-text-body text-red-600">{error}</div>;
  }

  if (notices.length === 0) {
    return (
      <div className="py-12 text-center sam-text-body text-sam-muted">
        공지사항이 없습니다.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-sam-border-soft">
      {notices.map((n) => (
        <li key={n.id} className="py-3">
          <p className="font-medium text-sam-fg">{n.title}</p>
          {n.createdAt ? (
            <p className="mt-1 sam-text-helper text-sam-meta">{formatDate(n.createdAt)}</p>
          ) : null}
          <p className="mt-1 sam-text-body-secondary text-sam-muted">{n.body}</p>
        </li>
      ))}
    </ul>
  );
}
