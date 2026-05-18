/** Phase 12b: `lib/community-messenger/monitoring/server-store-summary.ts` SLO digest labels */

export const cmMonitoringSloMessages = {
  ko: {
    admin_cm_slo_room_list: "방 목록 API (서버)",
    admin_cm_slo_home_sync: "홈 silent 묶음 API (서버)",
    admin_cm_slo_room_enter_client: "방 입장 부트스트랩 (클라 RTT)",
    admin_cm_slo_room_bootstrap_http: "방 부트스트랩 HTTP (cmReqSrc={cmReqSrc})",
    admin_cm_slo_room_bootstrap_legacy: "방 부트스트랩 HTTP (구 apiByRoute 키, cmReqSrc 미분리)",
    admin_cm_slo_message_send: "메시지 전송 RTT",
    admin_cm_slo_realtime_delay: "Realtime 메시지 지연 (created_at→수신)",
    admin_cm_slo_unread_sync: "미읽음·목록 정합 (읽음 처리 PATCH ~ 목록 반영)",
    admin_cm_slo_unread_home_bootstrap: "홈 목록 UI 정합 (merge·세션 캐시)",
    admin_cm_slo_home_sync_fetch_client: "홈 silent home-sync (클라 네트워크)",
    admin_cm_slo_silent_fallback_bootstrap: "silent 실패 시 fresh 부트스트랩 (클라)",
    admin_cm_slo_call_connect: "통화 첫 연결 (음·영상 합산 집계)",
    admin_cm_slo_frame_budget:
      "클라 프레임 예산 (frame_budget · NEXT_PUBLIC_MESSENGER_PERF_TRACE_FRAME_BUDGET=1)",
    admin_cm_slo_reconnect_session_rate: "재연결 경험 세션 비율 (근사)",
    admin_cm_slo_subscription_fail_rate: "Realtime 구독 초기 시도 실패율·raw 콜백 (phase:initial)",
    admin_cm_slo_subscription_callback_fail_rate:
      "Realtime channel_subscribe 콜백 실패율(모든 시도·HS4 raw)",
    admin_cm_slo_subscription_session_final_fail_rate:
      "Realtime 구독 세션 최종 실패율(recovered transient 제외)",
    admin_cm_slo_signaling_fail_rate: "시그널링 POST 실패율 (offer/answer/hangup)",
  },
  en: {
    admin_cm_slo_room_list: "Room list API (server)",
    admin_cm_slo_home_sync: "Home silent bundle API (server)",
    admin_cm_slo_room_enter_client: "Room enter bootstrap (client RTT)",
    admin_cm_slo_room_bootstrap_http: "Room bootstrap HTTP (cmReqSrc={cmReqSrc})",
    admin_cm_slo_room_bootstrap_legacy: "Room bootstrap HTTP (legacy apiByRoute key)",
    admin_cm_slo_message_send: "Message send RTT",
    admin_cm_slo_realtime_delay: "Realtime message delay (created_at → receive)",
    admin_cm_slo_unread_sync: "Unread · list sync (read PATCH → list reflect)",
    admin_cm_slo_unread_home_bootstrap: "Home list UI sync (merge · session cache)",
    admin_cm_slo_home_sync_fetch_client: "Home silent home-sync (client network)",
    admin_cm_slo_silent_fallback_bootstrap: "Silent fail → fresh bootstrap (client)",
    admin_cm_slo_call_connect: "Call first connect (voice + video aggregate)",
    admin_cm_slo_frame_budget:
      "Client frame budget (frame_budget · NEXT_PUBLIC_MESSENGER_PERF_TRACE_FRAME_BUDGET=1)",
    admin_cm_slo_reconnect_session_rate: "Reconnect session rate (approx.)",
    admin_cm_slo_subscription_fail_rate: "Realtime subscribe initial fail rate (phase:initial)",
    admin_cm_slo_subscription_callback_fail_rate:
      "Realtime channel_subscribe callback fail rate (all attempts)",
    admin_cm_slo_subscription_session_final_fail_rate:
      "Realtime subscribe session final fail rate (excl. recovered transient)",
    admin_cm_slo_signaling_fail_rate: "Signaling POST fail rate (offer/answer/hangup)",
  },
};
