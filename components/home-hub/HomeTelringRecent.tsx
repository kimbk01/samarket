"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Phone, PhoneMissed, Video } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { DIBAY_SERVICE_BRAND } from "@/lib/brand/dibay-service-brand";
import { buildLoginHref } from "@/lib/auth/client-access-flow";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { formatRelativeTimeAgo } from "@/lib/i18n/format-relative-time";
import { presentCallHistoryRow } from "@/lib/community-messenger/call-history/call-history-presenter";
import { resolveCallLogListTimestampIso, isCallLogMissedDisplayType } from "@/lib/community-messenger/call-log-row-copy";
import { fetchCommunityMessengerCallLogsClient } from "@/lib/community-messenger/call-history/use-community-call-history-realtime-sync";
import { startCallFromHistory } from "@/lib/community-messenger/call-history/start-call-from-history";
import { useOwnLiveCall } from "@/lib/call/own-live-call";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";


const CALL_LOGS_HREF = "/community-messenger?section=call_logs";
const FRIENDS_HREF = "/community-messenger?section=friends";
/** 홈에서 보이는 줄 수 (시안 v2 §3-5) */
export const HOME_TELRING_RECENT_ROWS = 3;
/** 홈 자체 신선도 — 통화 탭 목록의 신선도 기록(`call-logs-freshness`)은 건드리지 않는다 */
const HOME_CALLS_FRESH_MS = 60_000;
/** 통화가 끝난 뒤 다시 읽기까지 — 서버 통화 기록 저장 시간 */
export const HOME_CALLS_AFTER_END_MS = 1_500;
/** 앱이 앞으로 올 때 이 시간 안에 읽었으면 다시 읽지 않음 */
const HOME_CALLS_VISIBLE_SKIP_MS = 10_000;

let homeCallsCache: { viewer: string; at: number; calls: CommunityMessengerCallLog[] } | null = null;

/**
 * 홈 ④ telRING 최근 통화·대화 — 시안 v2 §3-5 (Owner 「v2대로 구현」 2026-11-26, 통화 변경 규정 §6).
 * 휴대폰: 연초록 머리 + 줄 3(사진 · 이름 · 종류·시간 · 오른쪽 시각 · 진초록 버튼 1 = 그 통화 종류)
 * 태블릿: 진초록 머리 + 줄 3(사진 · 이름 · 종류·시간·시각 · 연초록 영상 + 노랑 음성 버튼)
 * 데이터 = 기존 `GET /api/community-messenger/calls` 첫 페이지 앞 3건 · 버튼 = 누른 종류로 바로 `startCallFromHistory`(통화 탭과 같은 발신 함수).
 * 통화가 끝나거나 앱이 앞으로 오면 다시 읽는다.
 * 비로그인·빈 상태는 같은 카드 모양.
 */
export function HomeTelringRecent({ isMember, refreshSeq }: { isMember: boolean; refreshSeq: number }) {
  const { t, language } = useI18n();
  const router = useRouter();
  const live = useOwnLiveCall();
  const [calls, setCalls] = useState<CommunityMessengerCallLog[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  /** 다시 읽기 — 화면이 살아 있는 동안 마지막 요청 결과만 반영 */
  const loadSeqRef = useRef(0);
  const load = useCallback((force: boolean) => {
    const viewer = getSyncViewerUserIdForClient() ?? "";
    const hit = homeCallsCache;
    if (!force && hit && hit.viewer === viewer && Date.now() - hit.at < HOME_CALLS_FRESH_MS) {
      setCalls(hit.calls);
      return;
    }
    const seq = ++loadSeqRef.current;
    void fetchCommunityMessengerCallLogsClient().then((page) => {
      if (seq !== loadSeqRef.current) return;
      if (!page) {
        setFailed(true);
        return;
      }
      const top = page.calls.slice(0, HOME_TELRING_RECENT_ROWS);
      homeCallsCache = { viewer, at: Date.now(), calls: top };
      setFailed(false);
      setCalls(top);
    });
  }, []);

  useEffect(() => {
    if (!isMember) return;
    load(refreshSeq > 0);
    return () => {
      loadSeqRef.current += 1;
    };
  }, [isMember, refreshSeq, load]);

  /**
   * 통화가 끝나면 다시 읽는다 (2026-11-26 실기 FAIL: 통화 화면에서 돌아와도 1일 전 기록이 17분 동안 그대로).
   * ① 내 통화가 진행 중 → 끝남으로 바뀔 때 (통화 기록 저장 시간을 두고 1.5초 뒤)
   * ② 앱이 다시 앞으로 올 때(통화 화면·다른 앱에서 돌아옴, 받지 않은 전화 포함) — 10초 안에 읽었으면 건너뜀
   */
  const wasLiveRef = useRef(false);
  useEffect(() => {
    if (!isMember) return;
    const isLive = live != null;
    if (wasLiveRef.current && !isLive) {
      const id = window.setTimeout(() => load(true), HOME_CALLS_AFTER_END_MS);
      wasLiveRef.current = false;
      return () => window.clearTimeout(id);
    }
    wasLiveRef.current = isLive;
  }, [isMember, live, load]);
  useEffect(() => {
    if (!isMember) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const hit = homeCallsCache;
      if (hit && Date.now() - hit.at < HOME_CALLS_VISIBLE_SKIP_MS) return;
      load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isMember, load]);

  const brand = DIBAY_SERVICE_BRAND.LETARING;
  const ringAt = brand.indexOf("RING");
  const head = (
    <button type="button" className="home-tel-head" onClick={() => router.push(CALL_LOGS_HREF)} data-home-telring-head>
      <span className="home-tel-head-ic" aria-hidden>
        <Phone className="h-[18px] w-[18px]" strokeWidth={2.4} />
      </span>
      <span className="home-tel-head-title">
        {ringAt > 0 ? (
          <>
            {brand.slice(0, ringAt)}
            <span className="home-tel-ring">{brand.slice(ringAt)}</span>
          </>
        ) : (
          brand
        )}{" "}
        {t("home_telring_recent_title")}
      </span>
      <ChevronRight className="home-tel-head-chev" strokeWidth={2.4} aria-hidden />
    </button>
  );

  /** 누른 버튼의 종류로 바로 발신 — 시안 v2: 휴대폰 = 그 통화 종류 버튼, 태블릿 = 영상·음성 버튼 (2026-11-26 실기: 시트가 종류를 무시) */
  const startCall = (call: CommunityMessengerCallLog, peerLabel: string, kind: "voice" | "video") => {
    if (busy) return;
    startCallFromHistory({
      call,
      kind,
      peerLabel,
      router,
      missingRoomMessage: t("cm_ui_call_outgoing_missing_room"),
      networkErrorMessage: t("cm_ui_network_error_could_not_start_call"),
      onBlocked: () => {},
      onStart: () => setBusy(true),
      onDone: () => setBusy(false),
    });
  };

  let body: React.ReactNode;
  if (!isMember) {
    body = (
      <div className="home-tel-empty">
        <p>{t("home_telring_guest_body")}</p>
        <button type="button" className="home-press home-tel-empty-btn" onClick={() => router.push(buildLoginHref("/home"))}>
          {t("home_sign_in")}
        </button>
      </div>
    );
  } else if (failed && !calls) {
    body = (
      <div className="home-tel-empty">
        <p>{t("home_telring_failed")}</p>
      </div>
    );
  } else if (calls == null) {
    body = (
      <ul className="home-tel-list" aria-busy="true">
        {Array.from({ length: HOME_TELRING_RECENT_ROWS }, (_, i) => (
          <li key={i} className="home-tel-row home-tel-row--skel">
            <span className="home-tel-avatar home-skel" />
            <span className="home-tel-skel-line home-skel" />
          </li>
        ))}
      </ul>
    );
  } else if (calls.length === 0) {
    body = (
      <div className="home-tel-empty">
        <p>{t("home_telring_empty_body")}</p>
        <button type="button" className="home-press home-tel-empty-btn" onClick={() => router.push(FRIENDS_HREF)}>
          {t("home_telring_find_friends")}
        </button>
      </div>
    );
  } else {
    body = (
      <ul className="home-tel-list">
        {calls.map((call) => {
          const vm = presentCallHistoryRow(call);
          const missed = isCallLogMissedDisplayType(vm.displayType);
          const video = call.callKind === "video";
          const kindText = missed
            ? t(video ? "cm_call_row_missed_video" : "cm_call_row_missed_voice")
            : `${t(video ? "cm_call_row_kind_video" : "cm_call_row_kind_voice")} · ${vm.durationLabel?.trim() || t(vm.badgeLabelKey)}`;
          const iso = resolveCallLogListTimestampIso(call);
          const when = iso ? formatRelativeTimeAgo(iso, language === "en" ? "en" : "ko") : "";
          const avatar = resolveUserAvatarImageSrc(call.peerAvatarUrl);
          const KindIcon = missed ? PhoneMissed : video ? Video : Phone;
          const dial = (kind: "voice" | "video") => () => startCall(call, vm.peerDisplayLabel, kind);
          return (
            <li key={call.id} className="home-tel-row" data-home-telring-row>
              <button type="button" className="home-tel-row-main" onClick={() => router.push(CALL_LOGS_HREF)}>
                <span className="home-tel-avatar">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 통화 상대 사진(통화 탭과 같은 주소)
                    <img src={avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <SamarketDefaultAvatarFace className="h-full w-full" />
                  )}
                </span>
                <span className="home-tel-text">
                  <b className="home-tel-name">{vm.peerDisplayLabel}</b>
                  <span className={`home-tel-sub${missed ? " is-missed" : ""}`}>
                    <KindIcon className="home-tel-sub-ic" strokeWidth={2.2} aria-hidden />
                    <span className="home-tel-sub-text">{kindText}</span>
                    {when ? <span className="home-tel-when-inline"> · {when}</span> : null}
                  </span>
                </span>
                {when ? <span className="home-tel-when">{when}</span> : null}
              </button>
              {vm.canRedial ? (
                <span className="home-tel-btns">
                  {/* 휴대폰 = 그 통화 종류 버튼 1개 · 태블릿 = 영상(연초록) + 음성(노랑) */}
                  <button
                    type="button"
                    className={`home-tel-btn home-tel-btn--one${live ? " is-live" : ""}`}
                    aria-label={t(video ? "cm_call_row_kind_video" : "cm_call_row_kind_voice")}
                    data-home-press="call"
                    disabled={busy}
                    onClick={dial(video ? "video" : "voice")}
                  >
                    {video ? <Video className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden /> : <Phone className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />}
                  </button>
                  <button
                    type="button"
                    className={`home-tel-btn home-tel-btn--video${live ? " is-live" : ""}`}
                    aria-label={t("cm_call_row_kind_video")}
                    data-home-press="call"
                    disabled={busy}
                    onClick={dial("video")}
                  >
                    <Video className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={`home-tel-btn home-tel-btn--voice${live ? " is-live" : ""}`}
                    aria-label={t("cm_call_row_kind_voice")}
                    data-home-press="call"
                    disabled={busy}
                    onClick={dial("voice")}
                  >
                    <Phone className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className="home-tel" data-home-telring-recent>
      {head}
      {body}
    </section>
  );
}
