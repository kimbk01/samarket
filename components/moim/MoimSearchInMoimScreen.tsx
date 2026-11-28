"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimPostDto, MoimScheduleDto } from "@/lib/moim/moim-api-types";
import { useMoimDetail } from "@/components/moim/MoimDetailScreen";
import { MoimPostRow } from "@/components/moim/MoimPostRow";
import { MoimScheduleCard } from "@/components/moim/moim-schedule-ui";
import { normalizeMoimSearchQuery } from "@/lib/moim/moim-search-query";
import { MoimEmptyState, MoimErrorState, MoimListSkeleton, moimCls, useMoimBoardLabel } from "@/components/moim/moim-ui";

type Result = { status: "idle" } | { status: "loading" } | { status: "error"; error: string } | { status: "ready"; posts: MoimPostDto[]; schedules: MoimScheduleDto[] };

/** 모임 안 검색 /moim/[id]/search (시안 U4 머리글 ⌕ · 감사 F11) — 이 모임의 게시글(제목·본문)과 일정(제목). 멤버만 */
export function MoimSearchInMoimScreen({ moimId }: { moimId: string }) {
  const { t } = useI18n();
  const { moim, error: moimError } = useMoimDetail(moimId);
  const boardLabel = useMoimBoardLabel();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result>({ status: "idle" });

  const header = useMemo(() => ({ titleText: t("moim_search_in_title"), backHref: moimRoutes.home(moimId) }), [moimId, t]);
  useRegisterMainTier1Header(header);

  useEffect(() => {
    const id = setTimeout(() => setQuery(normalizeMoimSearchQuery(input) ?? ""), 300);
    return () => clearTimeout(id);
  }, [input]);

  useEffect(() => {
    if (!query) {
      setResult({ status: "idle" });
      return;
    }
    let alive = true;
    setResult({ status: "loading" });
    void moimApi.search(moimId, query).then((r) => {
      if (!alive) return;
      setResult(r.ok ? { status: "ready", posts: r.posts, schedules: r.schedules } : { status: "error", error: r.error ?? "" });
    });
    return () => {
      alive = false;
    };
  }, [moimId, query]);

  const boardsById = useMemo(() => new Map((moim?.boards ?? []).map((b) => [b.id, b])), [moim?.boards]);

  if (moimError) {
    return (
      <div className={moimCls.page}>
        <MoimErrorState messageKey={moimErrorKey(moimError)} />
      </div>
    );
  }
  if (moim && moim.viewer.status !== "active") {
    return (
      <div className={moimCls.page}>
        <MoimEmptyState>{t("moim_err_moim_not_member")}</MoimEmptyState>
      </div>
    );
  }

  return (
    <div className={`${moimCls.page} pb-10`}>
      <div className={moimCls.column}>
        <form
          className="px-4 pb-3 pt-3"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(normalizeMoimSearchQuery(input) ?? "");
          }}
        >
          <label className={`${moimCls.input} flex items-center gap-2`}>
            <Search className="h-4 w-4 shrink-0 text-sam-meta" aria-hidden />
            <input
              type="search"
              autoFocus
              maxLength={40}
              className="min-w-0 flex-1 bg-transparent outline-none"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("moim_search_in_placeholder")}
              aria-label={t("moim_search_in_title")}
            />
          </label>
        </form>
        {result.status === "idle" ? <MoimEmptyState>{t("moim_search_in_hint")}</MoimEmptyState> : null}
        {result.status === "loading" ? <MoimListSkeleton rows={3} /> : null}
        {result.status === "error" ? <MoimErrorState messageKey={moimErrorKey(result.error)} /> : null}
        {result.status === "ready" ? (
          result.posts.length === 0 && result.schedules.length === 0 ? (
            <MoimEmptyState>{t("moim_search_in_empty")}</MoimEmptyState>
          ) : (
            <>
              {result.posts.length > 0 ? (
                <section>
                  <div className={moimCls.sectionHead}>
                    <h2 className={moimCls.sectionTitle}>{t("moim_home_board_tab")}</h2>
                  </div>
                  <div className="grid gap-2 px-4">
                    {result.posts.map((p) => (
                      <MoimPostRow key={p.id} post={p} boardLabel={boardLabel(boardsById.get(p.boardId) ?? { kind: p.boardKind, name: p.boardName })} />
                    ))}
                  </div>
                </section>
              ) : null}
              {result.schedules.length > 0 ? (
                <section>
                  <div className={moimCls.sectionHead}>
                    <h2 className={moimCls.sectionTitle}>{t("moim_home_schedules_tab")}</h2>
                  </div>
                  <div className="grid gap-2 px-4">
                    {result.schedules.map((s) => (
                      <MoimScheduleCard key={s.id} schedule={s} />
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )
        ) : null}
      </div>
    </div>
  );
}
