"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminNotificationCampaignCreatePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<"notice" | "marketing" | "system">("notice");
  const [targetType, setTargetType] = useState<string>("all");
  const [targetUrl, setTargetUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [selectedIds, setSelectedIds] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (mode: "draft" | "send") => {
    setErr(null);
    setBusy(true);
    try {
      const target_user_ids =
        targetType === "selected_users"
          ? selectedIds
              .split(/[\s,]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

      const res = await fetch("/api/admin/notification-campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          type,
          target_type: targetType,
          target_url: targetUrl || null,
          image_url: imageUrl || null,
          segment_region_code: targetType === "region" ? regionCode : null,
          status: "draft",
          target_user_ids,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !j?.ok || !j.id) {
        setErr(typeof j?.error === "string" ? j.error : "저장에 실패했습니다.");
        return;
      }
      if (mode === "send") {
        let done = false;
        let guard = 0;
        while (!done && guard < 500) {
          guard += 1;
          const sr = await fetch(`/api/admin/notification-campaigns/${j.id}/send`, {
            method: "POST",
            credentials: "include",
          });
          const sj = (await sr.json().catch(() => ({}))) as { ok?: boolean; done?: boolean };
          if (!sr.ok || !sj?.ok) break;
          done = sj.done === true;
        }
      }
      router.push(`/admin/notifications/${j.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <Link href="/admin/notifications" className="text-sm text-signature hover:underline">
        ← 목록
      </Link>
      <h1 className="text-lg font-semibold text-sam-fg">알림 캠페인 만들기</h1>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <label className="block text-sm">
          <span className="text-sam-muted">유형</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          >
            <option value="notice">공지</option>
            <option value="marketing">마케팅 (동의 회원만)</option>
            <option value="system">시스템</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-sam-muted">대상</span>
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          >
            <option value="all">전체 회원</option>
            <option value="marketing_opt_in">마케팅 동의 DB 행</option>
            <option value="active_users">최근 활동 (30일)</option>
            <option value="region">지역 (region_code)</option>
            <option value="selected_users">선택 회원 (UUID 목록)</option>
            <option value="segment">세그먼트 (현재 전체와 동일 스캔)</option>
          </select>
        </label>

        {targetType === "region" ? (
          <label className="block text-sm">
            <span className="text-sam-muted">region_code</span>
            <input
              value={regionCode}
              onChange={(e) => setRegionCode(e.target.value)}
              className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
            />
          </label>
        ) : null}

        {targetType === "selected_users" ? (
          <label className="block text-sm">
            <span className="text-sam-muted">회원 UUID (쉼표·줄바꿈 구분)</span>
            <textarea
              value={selectedIds}
              onChange={(e) => setSelectedIds(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2 font-mono text-[12px]"
            />
          </label>
        ) : null}

        <label className="block text-sm">
          <span className="text-sam-muted">제목</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="text-sam-muted">내용</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="text-sam-muted">이동 URL</span>
          <input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="text-sam-muted">이미지 URL</span>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-2"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !title.trim() || !body.trim()}
          onClick={() => void submit("draft")}
          className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm disabled:opacity-40"
        >
          임시 저장
        </button>
        <button
          type="button"
          disabled={busy || !title.trim() || !body.trim()}
          onClick={() => void submit("send")}
          className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          저장 후 즉시 배치 발송
        </button>
      </div>
    </div>
  );
}
