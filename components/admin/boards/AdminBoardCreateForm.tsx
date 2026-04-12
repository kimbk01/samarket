"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  ADMIN_BOARD_CATEGORY_MODES,
  ADMIN_BOARD_SKIN_TYPES,
  normalizeBoardSlug,
} from "@/lib/admin-boards/parse-create-board-body";

type ServiceOption = { id: string; name: string; slug: string };

export function AdminBoardCreateForm({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loadingSvc, setLoadingSvc] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [skinType, setSkinType] = useState<string>("basic");
  const [formType, setFormType] = useState<string>("basic");
  const [categoryMode, setCategoryMode] = useState<string>("none");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  const loadServices = useCallback(async () => {
    setLoadingSvc(true);
    const sb = getSupabaseClient();
    if (!sb) {
      setServices([]);
      setLoadingSvc(false);
      return;
    }
    try {
      const { data, error: e } = await (sb as any)
        .from("services")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (e || !Array.isArray(data)) {
        setServices([]);
        return;
      }
      const list = (data as { id: string; name?: string; slug?: string }[]).map((r) => ({
        id: r.id,
        name: r.name ?? r.slug ?? r.id,
        slug: r.slug ?? "",
      }));
      setServices(list);
      setServiceId((prev) => {
        if (prev && list.some((s) => s.id === prev)) return prev;
        const community = list.find((s) => s.slug === "community");
        return community?.id ?? list[0]?.id ?? "";
      });
    } catch {
      setServices([]);
    } finally {
      setLoadingSvc(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName("");
    setSlug("");
    setDescription("");
    setSkinType("basic");
    setFormType("basic");
    setCategoryMode("none");
    setIsActive(true);
    setSortOrder(0);
    void loadServices();
  }, [open, loadServices]);

  useEffect(() => {
    if (!open) return;
    const t = name.trim();
    if (!t) return;
    setSlug((prev) => {
      if (prev.trim() === "") return normalizeBoardSlug(t);
      return prev;
    });
  }, [name, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: serviceId,
          name: name.trim(),
          slug: slug.trim() || normalizeBoardSlug(name),
          description: description.trim() || null,
          skin_type: skinType,
          form_type: formType,
          category_mode: categoryMode,
          is_active: isActive,
          sort_order: sortOrder,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        const err = data?.error as string | undefined;
        const map: Record<string, string> = {
          duplicate_slug: "같은 서비스에 동일 slug 게시판이 이미 있습니다.",
          service_not_found: "선택한 서비스를 찾을 수 없습니다.",
          invalid_slug: "slug는 영문 소문자·숫자·하이픈만 사용하세요.",
          invalid_name: "이름을 1~120자로 입력하세요.",
          forbidden: "권한이 없습니다.",
          supabase_unconfigured: "Supabase 서버 설정을 확인하세요.",
        };
        setError(map[err ?? ""] ?? err ?? "저장 실패");
        return;
      }
      setName("");
      setSlug("");
      setDescription("");
      setSortOrder(0);
      onCreated();
      onClose();
    } catch {
      setError("네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-board-create-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-sam-border-soft px-4 py-3">
          <h2 id="admin-board-create-title" className="text-[16px] font-semibold text-sam-fg">
            게시판 추가
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-ui-rect px-2 py-1 text-[20px] leading-none text-sam-muted hover:bg-sam-surface-muted"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="space-y-3 px-4 py-4 text-[14px]">
          {loadingSvc ? (
            <p className="text-sam-muted">서비스 목록 불러오는 중…</p>
          ) : services.length === 0 ? (
            <p className="text-amber-800">활성 서비스가 없습니다. DB에 `services` 행을 먼저 추가하세요.</p>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-sam-fg">서비스</span>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              required
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.slug})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-sam-fg">게시판 이름</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
              placeholder="예: 동네 맛집"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-sam-fg">slug (URL)</span>
            <input
              value={slug}
              onChange={(e) => setSlug(normalizeBoardSlug(e.target.value))}
              required
              maxLength={64}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2 font-mono text-[13px]"
              placeholder="예: food"
            />
            <span className="mt-0.5 block text-[12px] text-sam-muted">사용자 피드: /community (게시판 slug 미노출)</span>
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-sam-fg">설명 (선택)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-sam-fg">스킨</span>
              <select value={skinType} onChange={(e) => setSkinType(e.target.value)} className="w-full rounded-ui-rect border border-sam-border px-2 py-2 text-[13px]">
                {ADMIN_BOARD_SKIN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-sam-fg">폼</span>
              <select value={formType} onChange={(e) => setFormType(e.target.value)} className="w-full rounded-ui-rect border border-sam-border px-2 py-2 text-[13px]">
                {ADMIN_BOARD_SKIN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-sam-fg">카테고리 모드</span>
            <select
              value={categoryMode}
              onChange={(e) => setCategoryMode(e.target.value)}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
            >
              {ADMIN_BOARD_CATEGORY_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
            <span className="text-[13px] text-sam-fg">노출(활성)</span>
          </label>

          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-sam-fg">정렬 순서</span>
            <input
              type="number"
              min={0}
              max={99999}
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            />
          </label>

          {error ? <p className="rounded-ui-rect bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</p> : null}

          <div className="flex justify-end gap-2 border-t border-sam-border-soft pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-ui-rect border border-sam-border px-4 py-2 text-[14px] text-sam-fg hover:bg-sam-app"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting || loadingSvc || services.length === 0}
              className="rounded-ui-rect bg-signature px-4 py-2 text-[14px] font-medium text-white hover:bg-signature/90 disabled:opacity-50"
            >
              {submitting ? "저장 중…" : "추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
