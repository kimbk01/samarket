"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import {
  AdminControlPlaneEmpty,
  AdminControlPlanePageHeader,
} from "@/components/admin/ui/AdminControlPlaneChrome";
import {
  createIntroDocumentApi,
  listIntroDocumentsApi,
  type IntroDocumentListItemDto,
} from "./introDocumentApi";

function formatWhen(iso: string, ko: boolean): string {
  try {
    return new Date(iso).toLocaleString(ko ? "ko-KR" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function IntroDocumentHub({ ko }: { ko: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<IntroDocumentListItemDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await listIntroDocumentsApi();
    if (!res.ok) {
      setItems(null);
      setError(res.error ?? "list_failed");
      return;
    }
    setItems(res.items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    const res = await createIntroDocumentApi(createTitle || undefined);
    setCreating(false);
    if (!res.ok || !res.record) {
      setError(res.error ?? "create_failed");
      return;
    }
    setShowCreate(false);
    setCreateTitle("");
    router.push(`/admin/intro/${res.record.documentId}`);
  };

  return (
    <div className="space-y-6" data-intro-document-hub="1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminControlPlanePageHeader
          title={ko ? "인트로" : "Intro"}
          description={
            ko
              ? "인트로 문서를 만들고 스튜디오에서 편집·저장하세요."
              : "Create Intro documents and author them in Studio."
          }
          marker="intro-hub"
        />
        <div className="flex flex-wrap gap-2">
          <AdminActionLink href="/admin/intro/media" variant="secondary">
            {ko ? "미디어 라이브러리" : "Media Library"}
          </AdminActionLink>
          <AdminActionButton
            variant="primary"
            onClick={() => setShowCreate(true)}
            data-intro-create-open="1"
          >
            {ko ? "새 인트로 만들기" : "Create Intro"}
          </AdminActionButton>
        </div>
      </div>

      {showCreate ? (
        <div
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
          data-intro-create-dialog="1"
        >
          <h2 className="text-sm font-semibold text-sam-fg">
            {ko ? "새 인트로" : "New Intro"}
          </h2>
          <p className="mt-1 text-xs text-sam-muted">
            {ko
              ? "확인 전에 취소하면 문서가 생성되지 않습니다."
              : "Cancel before confirm — no ghost document."}
          </p>
          <label className="mt-3 block text-xs text-sam-muted">
            {ko ? "제목" : "Title"}
            <input
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-bg px-3 py-2 text-sm text-sam-fg"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder={ko ? "예: 봄 시즌 인트로" : "e.g. Spring Intro"}
              data-intro-create-title="1"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <AdminActionButton
              variant="primary"
              disabled={creating}
              onClick={() => void onCreate()}
              data-intro-create-confirm="1"
            >
              {creating
                ? ko
                  ? "생성 중…"
                  : "Creating…"
                : ko
                  ? "만들고 스튜디오 열기"
                  : "Create & open Studio"}
            </AdminActionButton>
            <AdminActionButton
              variant="secondary"
              disabled={creating}
              onClick={() => {
                setShowCreate(false);
                setCreateTitle("");
              }}
              data-intro-create-cancel="1"
            >
              {ko ? "취소" : "Cancel"}
            </AdminActionButton>
          </div>
        </div>
      ) : null}

      {error ? (
        <AdminControlPlaneEmpty kind="error" message={error} />
      ) : items === null ? (
        <p className="text-sm text-sam-muted" data-intro-list-loading="1">
          {ko ? "불러오는 중…" : "Loading…"}
        </p>
      ) : items.length === 0 ? (
        <AdminControlPlaneEmpty
          message={
            ko
              ? "아직 인트로가 없습니다. 새 인트로를 만들어 주세요."
              : "No intros yet. Create one to start."
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-intro-list="1">
          {items.map((it) => (
            <li key={it.documentId}>
              <button
                type="button"
                className="flex h-full w-full flex-col rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-left transition hover:border-sam-fg/30"
                onClick={() => router.push(`/admin/intro/${it.documentId}`)}
                data-intro-list-item={it.documentId}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-sam-fg line-clamp-2">
                    {it.title || (ko ? "제목 없음" : "Untitled")}
                  </h3>
                  <AdminToneBadge tone="neutral">
                    {ko ? "초안" : "DRAFT"}
                  </AdminToneBadge>
                </div>
                <p className="mt-2 text-xs text-sam-muted">
                  {ko ? "장면" : "Scenes"}: {it.sceneCount}
                </p>
                <p className="mt-1 text-xs text-sam-muted">
                  {ko ? "수정" : "Updated"}: {formatWhen(it.updatedAt, ko)}
                </p>
                {it.hasPublishedRevision ? (
                  <p className="mt-1 text-xs text-sam-muted">
                    {ko ? "게시됨" : "Has revision"}
                  </p>
                ) : null}
                {it.isCurrentLive ? (
                  <p className="mt-1 text-xs text-sam-muted">
                    {ko ? "현재 Live" : "Current Live"}
                  </p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
