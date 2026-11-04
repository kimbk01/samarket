/**
 * 광고 ② 수정 설계 구현 (Owner 「설계안대로 구현」 2026-11-04) — 피드 배너 문구. 뒤에 spread 되므로 같은 키는 이 파일 값이 우선한다.
 * 광고 표면 연동 I3 (2026-11-04): 배너(피드·이벤트·배달·마이) 어드민 안내·날짜 라벨.
 */
export const adsImpl1104FeedMessages = {
  ko: {
    ads_f_upload_failed_generic: "이미지를 올리지 못했습니다. 3:1 비율·1200×400 이상인지 확인해 주세요.",
    /** FB-M13: 연장 응답이 끊김·5xx — 같은 키로 다시 확인 */
    feed_ad_renew_result_unknown: "연장 결과를 확인하지 못했습니다. 다시 누르면 같은 결제로 확인합니다.",
    /** FB-M13: 409 idempotency_consumed */
    feed_ad_renew_already_processed: "이미 처리된 연장입니다. 목록을 다시 불러왔습니다.",
    /** FA-1 */
    ads_f_feed_name_hint: "거래·커뮤니티 피드 광고 위쪽에 광고주 이름으로 보입니다.",
    /** FA-2 */
    ads_f_feed_topic_also_all_hint: "커뮤니티 주제 배너는 커뮤니티 전체 피드에도 나옵니다.",
    /** FA-4 · CX-16 · 공통 정본: 광고 어드민 날짜 라벨 */
    ads_f_start_pht: "시작 (PHT)",
    ads_f_end_pht: "종료 (PHT)",
    ads_f_status_draft: "초안",
    ads_f_status_active: "노출",
    /** EV-1 */
    ads_f_event_banner_upload: "내 PC에서 이미지 올리기",
    ads_f_event_banner_uploading: "올리는 중…",
    ads_f_event_banner_reupload:
      "배너 형태가 바뀌어 이미지 비율이 맞지 않을 수 있습니다. 이 형태 규격으로 다시 올려 주세요.",
    /** EV-2 */
    ads_f_event_hero_headline_hint:
      "히어로 배너의 문구는 화면에 보이지 않고 대체 텍스트(화면 읽기)로 쓰입니다. 비우면 이벤트 제목을 씁니다.",
    /** DL-1 */
    ads_f_delivery_hero_headline_hint: "히어로는 글자를 덮지 않고 대체 텍스트로 쓰입니다. (선택)",
    /** MY-1 */
    ads_f_mypage_banner_image_hint: "앱에서는 48×48 썸네일로 보입니다(정사각형 권장).",
  },
  en: {
    ads_f_upload_failed_generic: "Could not upload the image. Check it is 3:1 and at least 1200×400.",
    feed_ad_renew_result_unknown: "We could not confirm the renewal. Tap again to check the same payment.",
    feed_ad_renew_already_processed: "This renewal was already processed. The list has been refreshed.",
    ads_f_feed_name_hint: "Shown above trade and community feed ads as the advertiser name.",
    ads_f_feed_topic_also_all_hint: "Community topic banners also appear in the all-topics community feed.",
    ads_f_start_pht: "Start (PHT)",
    ads_f_end_pht: "End (PHT)",
    ads_f_status_draft: "Draft",
    ads_f_status_active: "Live",
    ads_f_event_banner_upload: "Upload image from PC",
    ads_f_event_banner_uploading: "Uploading…",
    ads_f_event_banner_reupload:
      "The banner type changed, so the image ratio may not fit. Upload again for this type.",
    ads_f_event_hero_headline_hint:
      "Hero banner text is not shown on screen; it is used as alt text. If empty, the event title is used.",
    ads_f_delivery_hero_headline_hint: "Hero banners do not overlay text; this is used as alt text. (Optional)",
    ads_f_mypage_banner_image_hint: "Shown in the app as a 48×48 thumbnail (square recommended).",
  },
} as const;
