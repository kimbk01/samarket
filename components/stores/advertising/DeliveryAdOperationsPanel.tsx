"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryAdOperationsComposer } from "@/components/stores/advertising/DeliveryAdOperationsComposer";
import { DeliveryAdOperationsTimeline } from "@/components/stores/advertising/DeliveryAdOperationsTimeline";
import type { DeliveryAdOperationsCaseStatus } from "@/lib/stores/advertising/delivery-ad-operations-case";
import type { DeliveryAdOperationsTimelineMessage } from "@/lib/stores/advertising/delivery-ad-operations-message";
import type { DeliveryAdProductKind } from "@/lib/stores/advertising/delivery-ad-domain";

type ActorRole = "owner" | "admin";

export function DeliveryAdOperationsPanel({
  actorRole,
  productKind,
  campaignId,
  storeId,
  focusOperations,
  hideHeading = false,
}: {
  actorRole: ActorRole;
  productKind: DeliveryAdProductKind;
  campaignId: string;
  /** Required for Owner API paths */
  storeId?: string;
  focusOperations?: boolean;
  /** When parent section already provides the title */
  hideHeading?: boolean;
}) {
  const { t, safeT } = useI18n();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [messages, setMessages] = useState<DeliveryAdOperationsTimelineMessage[]>([]);
  const [caseStatus, setCaseStatus] = useState<DeliveryAdOperationsCaseStatus | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const markedRef = useRef(false);

  const messagesUrl =
    actorRole === "owner"
      ? `/api/me/stores/${encodeURIComponent(storeId ?? "")}/delivery-ads/${encodeURIComponent(campaignId)}/messages?productKind=${encodeURIComponent(productKind)}`
      : `/api/admin/delivery-ads/${encodeURIComponent(campaignId)}/messages?productKind=${encodeURIComponent(productKind)}`;

  const readUrl =
    actorRole === "owner"
      ? `/api/me/stores/${encodeURIComponent(storeId ?? "")}/delivery-ads/${encodeURIComponent(campaignId)}/messages/read`
      : `/api/admin/delivery-ads/${encodeURIComponent(campaignId)}/messages/read`;

  const load = useCallback(async () => {
    if (actorRole === "owner" && !storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(messagesUrl, { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        messages?: DeliveryAdOperationsTimelineMessage[];
        caseStatus?: DeliveryAdOperationsCaseStatus | null;
        unreadCount?: number;
      };
      if (!res.ok || !json.ok) {
        setLoadError(true);
        setMessages([]);
        return;
      }
      const list = Array.isArray(json.messages) ? json.messages : [];
      setMessages(list);
      setCaseStatus(json.caseStatus ?? null);
      setUnreadCount(typeof json.unreadCount === "number" ? json.unreadCount : 0);

      // Mark read only after successful operations history load
      if (!markedRef.current) {
        markedRef.current = true;
        const lastId = list.length > 0 ? list[list.length - 1]!.id : undefined;
        void fetch(readUrl, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productKind,
            lastReadMessageId: lastId,
          }),
        }).then(() => setUnreadCount(0));
      }
    } catch {
      setLoadError(true);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [actorRole, messagesUrl, productKind, readUrl, storeId]);

  useEffect(() => {
    markedRef.current = false;
    void load();
  }, [load]);

  useEffect(() => {
    if (!focusOperations || !sectionRef.current) return;
    sectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusOperations, loading]);

  const onSend = async () => {
    if (sending || !draft.trim()) return;
    if (actorRole === "owner" && !storeId) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(messagesUrl.split("?")[0]!, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKind, body: draft }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        caseStatus?: DeliveryAdOperationsCaseStatus;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setSendError(
          safeT("delivery_ad_ops_ui_send_error", {
            fallbackKo: "메시지를 보내지 못했습니다. 다시 시도해 주세요.",
            fallbackEn: "Could not send the message. Please try again.",
          })
        );
        return;
      }
      setDraft("");
      if (json.caseStatus) setCaseStatus(json.caseStatus);
      markedRef.current = false;
      await load();
    } catch {
      setSendError(
        safeT("delivery_ad_ops_ui_send_error", {
          fallbackKo: "메시지를 보내지 못했습니다. 다시 시도해 주세요.",
          fallbackEn: "Could not send the message. Please try again.",
        })
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      ref={sectionRef}
      id="delivery-ad-operations"
      className="space-y-3"
      aria-labelledby="delivery-ad-ops-heading"
    >
      <div className="flex items-center justify-between gap-2">
        {hideHeading ? (
          <span className="sr-only" id="delivery-ad-ops-heading">
            {safeT("delivery_ad_ops_ui_section_title", {
              fallbackKo: "광고 운영",
              fallbackEn: "Ad operations",
            })}
          </span>
        ) : (
          <h2 id="delivery-ad-ops-heading" className="text-[15px] font-semibold text-sam-fg">
            {safeT("delivery_ad_ops_ui_section_title", {
              fallbackKo: "광고 운영",
              fallbackEn: "Ad operations",
            })}
          </h2>
        )}
        {unreadCount > 0 ? (
          <span
            className="rounded-ui-rect bg-sam-brand/15 px-2 py-0.5 text-[11px] font-semibold text-sam-fg"
            aria-label={t("delivery_ad_ops_ui_unread_aria", { count: unreadCount })}
          >
            {t("delivery_ad_ops_ui_unread_badge", { count: unreadCount })}
          </span>
        ) : null}
      </div>

      <p className="text-[13px] text-sam-muted">
        {safeT("delivery_ad_ops_ui_case_status_label", {
          fallbackKo: "처리 상태",
          fallbackEn: "Case status",
        })}
        {": "}
        <span className="font-medium text-sam-fg">
          {caseStatus === "OPEN"
            ? safeT("delivery_ad_ops_ui_case_open", {
                fallbackKo: "열림",
                fallbackEn: "Open",
              })
            : caseStatus === "WAITING_OWNER"
              ? safeT("delivery_ad_ops_ui_case_waiting_owner", {
                  fallbackKo: "오너 응답 대기",
                  fallbackEn: "Waiting on owner",
                })
              : caseStatus === "WAITING_ADMIN"
                ? safeT("delivery_ad_ops_ui_case_waiting_admin", {
                    fallbackKo: "관리자 처리 대기",
                    fallbackEn: "Waiting on admin",
                  })
                : caseStatus === "RESOLVED"
                  ? safeT("delivery_ad_ops_ui_case_resolved", {
                      fallbackKo: "종료",
                      fallbackEn: "Resolved",
                    })
                  : safeT("delivery_ad_ops_ui_case_none", {
                      fallbackKo: "아직 없음",
                      fallbackEn: "None yet",
                    })}
        </span>
      </p>

      {loading ? (
        <p className="text-[13px] text-sam-muted" role="status">
          {t("delivery_ad_ops_ui_loading")}
        </p>
      ) : loadError ? (
        <p className="text-[13px] text-red-600" role="alert">
          {safeT("delivery_ad_ops_ui_load_error", {
            fallbackKo: "운영 기록을 불러오지 못했습니다.",
            fallbackEn: "Could not load operations history.",
          })}
        </p>
      ) : (
        <DeliveryAdOperationsTimeline messages={messages} viewerRole={actorRole} />
      )}

      <DeliveryAdOperationsComposer
        value={draft}
        onChange={setDraft}
        onSend={() => void onSend()}
        sending={sending}
        error={sendError}
      />
    </section>
  );
}
