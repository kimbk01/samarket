"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sam } from "@/lib/ui/css-vars";

type DocRow = {
  document_id: string;
  title: string;
  draft_version: number;
  updated_at: string;
};

export function IntroDocumentHub() {
  const router = useRouter();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [live, setLive] = useState<{
    kind: string;
    releaseId?: string;
    packageId?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const [dRes, lRes] = await Promise.all([
      fetch("/api/admin/intro/documents", { cache: "no-store" }),
      fetch("/api/admin/intro/live", { cache: "no-store" }),
    ]);
    const dJson = (await dRes.json()) as {
      ok: boolean;
      documents?: DocRow[];
      error?: string;
    };
    const lJson = (await lRes.json()) as {
      ok: boolean;
      live?: { kind: string; releaseId?: string; packageId?: string };
      error?: string;
    };
    if (!dJson.ok) {
      setError(dJson.error ?? "list_failed");
      return;
    }
    setDocs(dJson.documents ?? []);
    if (lJson.ok && lJson.live) setLive(lJson.live);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createDoc() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/intro/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Intro" }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        document?: { document_id: string };
        error?: string;
      };
      if (!json.ok || !json.document) {
        setError(json.error ?? "create_failed");
        return;
      }
      router.push(`/admin/intro/${json.document.document_id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" data-intro13-hub="1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-sam-fg">인트로</h1>
          <p className="mt-1 text-sm text-sam-muted">
            앱 시작 시 사용자에게 보이는 Product Intro를 만듭니다.
          </p>
        </div>
        <button
          type="button"
          className={Sam.btn.primary}
          disabled={busy}
          onClick={() => void createDoc()}
        >
          새 인트로
        </button>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm">
        <div className="font-medium text-sam-fg">서비스 상태</div>
        <div className="mt-1 text-sam-muted">
          {live?.kind === "LIVE"
            ? `라이브 적용됨 · 배포 ${live.releaseId?.slice(0, 8) ?? "—"}`
            : "라이브 인트로 없음"}
        </div>
        <p className="mt-2 text-xs text-sam-muted">
          서버 적용 성공 ≠ 기기 반영. 기기에서 확인해야 합니다.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
        {docs.length === 0 ? (
          <li className="p-4 text-sm text-sam-muted">아직 인트로가 없습니다.</li>
        ) : (
          docs.map((d) => (
            <li key={d.document_id}>
              <Link
                href={`/admin/intro/${d.document_id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sam-app"
              >
                <span className="font-medium text-sam-fg">{d.title || "Intro"}</span>
                <span className="text-xs text-sam-muted">
                  초안 v{d.draft_version} · {new Date(d.updated_at).toLocaleString()}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
