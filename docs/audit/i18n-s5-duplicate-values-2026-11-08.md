# S5 중복 키 — 값이 달랐던 키 (2026-11-08)

> 언어 SSOT S5. 같은 키가 2곳 이상에 다른 값으로 있던 키 목록이다. **화면에 나오던 값(최종 병합값)을 남기고** 나머지 정의를 지웠다 — 화면 값 변동 0(전후 22,076키 전수 대조).
> 「지운 값」은 화면에 나오지 않던 값이다. 어느 값이 맞는지 다시 정해야 하는 키는 Owner 결정(발견 목록 L9).

총 239키 · 어드민 232 · 그 외 7

| 키 | 남긴 곳 | 화면 값 ko / en | 지운 값 (파일: ko / en) |
|---|---|---|---|
| `admin_ad_applications_title` | `ads-impl-1107-w3.ts` | 광고·상위노출 신청 (도메인 선택) / Ad / top-exposure requests (choose domain) | `admin.ts`: 광고·홍보 신청 (도메인 선택) / Ad / promote requests (choose domain) |
| `admin_auth_settings_label_guide_text` | `messages/json` | 안내 문구 / Guide message | `admin-settings.ts`: 안내 문구 / Guide text |
| `admin_auth_settings_label_otp_ttl` | `messages/json` | OTP 유효시간(초) / OTP validity (seconds) | `admin-settings.ts`: OTP 유효시간(초) / OTP TTL (seconds) |
| `admin_auth_settings_oauth_callback_guide` | `messages/json` | dibaY는 Supabase Auth 방식입니다. 카카오/구글/네이버/애플/페이스북 개발자 콘솔에는 dibaY.vercel.app/api/auth/... 주소가 아니라 Supabase Callback URL을 등록해야 합니다. / dibaY uses Supabase Auth. In provider consoles (Kakao/Google/Naver/Apple/Facebook), register the Supabase callback URL instead of dibaY.vercel.app/api/auth/.... | `admin-settings.ts`: dibaY는 Supabase Auth 방식입니다. 카카오/구글/네이버/애플/페이스북 개발자 콘솔에는 dibaY.vercel.app/api/auth/... 주소가 아니라 Supabase Callback URL을 등록해야 합니다. / dibaY uses Supabase Auth. Register the Supabase callback URL in each provider console—not dibaY.vercel.app/api/auth/... |
| `admin_auth_settings_oauth_card_title` | `messages/json` | SNS OAuth Provider 설정 / SNS OAuth provider settings | `admin-settings.ts`: SNS OAuth Provider 설정 / SNS OAuth providers |
| `admin_auth_settings_oauth_tab` | `messages/json` | OAuth 설정 / OAuth settings | `admin-settings.ts`: OAuth 설정 / OAuth |
| `admin_auth_settings_phone_card_title` | `messages/json` | 전화 인증 설정 / Phone verification settings | `admin-settings.ts`: 전화 인증 설정 / Phone verification |
| `admin_auth_settings_phone_save` | `messages/json` | 전화 인증 설정 저장 / Save phone verification settings | `admin-settings.ts`: 전화 인증 설정 저장 / Save phone settings |
| `admin_auth_settings_section_title` | `messages/json` | 설정 구분 / Settings sections | `admin-settings.ts`: 설정 구분 / Sections |
| `admin_biz_page_cc` | `admin-delivery-ops-ux.ts` | 매장 상세 / Store detail | `admin-business.ts`: 업체 Control Center / Business Control Center |
| `admin_biz_page_list` | `admin-delivery-ops-ux.ts` | 매장 운영 / Store operations | `admin-business.ts`: 매장 운영 관제 / Store operations |
| `admin_comm_promo_title` | `ads-impl-1107-w3.ts` | 게시물 상위노출 신청 / Post top-exposure requests | `admin.ts`: 게시물 홍보 신청 / Post promotion requests |
| `admin_community_comments_col_body` | `messages/json` | 댓글 / Comment | `admin.ts`: 본문 / Body |
| `admin_community_home_title` | `admin-community-r4.ts` | 커뮤니티 대시보드 / Community dashboard | `admin.ts`: 커뮤니티 운영 / Community ops |
| `admin_del_admin_status_prefix` | `admin-delivery-r4-field-monitoring.ts` | 관리 상태: {status} / Admin status: {status} | `admin-delivery-admin.ts`: adm:{status} / adm:{status} |
| `admin_del_alert_filter_today_utc` | `admin-delivery-r4-field-monitoring.ts` | 오늘만 (마닐라) / Today only (Manila) | `admin-delivery-alerts.ts`: 오늘만(UTC) / Today only (UTC) |
| `admin_del_alert_metadata_summary` | `admin-delivery-r4-field-monitoring.ts` | 기술 정보 — 실행 상세 (최근 5건) / Technical details — run detail (latest 5) | `admin-delivery-alerts.ts`: metadata 원본 (맨 위 5건) / Raw metadata (top 5) |
| `admin_del_alert_page_title` | `admin-delivery-ops-ux.ts` | 배달 경고 / Delivery alerts | `admin-delivery-alerts.ts`: 배달 운영 알림 / Delivery ops alerts |
| `admin_del_ops_chart_orders_by_hour` | `admin-delivery-r4-field-monitoring.ts` | 시간대별 주문 (마닐라 시간) / Orders by hour (Manila time) | `admin-delivery-operations.ts`: 시간대별 주문 (UTC) / Orders by hour (UTC) |
| `admin_del_ops_hb_alert_sync_last` | `admin-delivery-r4-field-monitoring.ts` | 경고 동기화 마지막 실행 / Last alert sync | `admin-delivery-operations.ts`: 알림 동기화 마지막 / Last alert sync |
| `admin_del_ops_hb_auto_runner_last` | `admin-delivery-r4-field-monitoring.ts` | 자동 조치 마지막 실행 / Last auto-action run | `admin-delivery-operations.ts`: 자동 액션 러너 마지막 / Last auto-action runner |
| `admin_del_ops_hb_sla_cron_last` | `admin-delivery-r4-field-monitoring.ts` | 배달 지연 점검 마지막 실행 / Last delay check | `admin-delivery-operations.ts`: SLA cron 마지막 / Last SLA cron |
| `admin_del_ops_health_auto_actions_disabled` | `admin-delivery-r4-field-monitoring.ts` | 자동 조치가 전체 중지되어 있습니다. / Auto actions are stopped. | `admin-delivery-operations.ts`: 자동 액션 kill switch 가 OFF 입니다. / Auto-action kill switch is OFF. |
| `admin_del_ops_health_held_settlement_stale` | `admin-delivery-r4-field-monitoring.ts` | 3일 이상 보류된 정산(이전 방식)이 있습니다. / Legacy settlements held for over 3 days. | `admin-delivery-operations.ts`: 3일 이상 held 정산이 있습니다. / Held settlements older than 3 days. |
| `admin_del_ops_health_pending_approval_high` | `admin-delivery-r4-field-monitoring.ts` | 승인 대기 자동 조치가 많습니다. / Many auto actions are pending approval. | `admin-delivery-operations.ts`: 승인 대기 자동 액션이 과다합니다. / Too many auto actions pending approval. |
| `admin_del_ops_kpi_sla_attention` | `admin-delivery-r4-field-monitoring.ts` | 배달 지연 경고 / Delay warnings | `admin-delivery-operations.ts`: SLA 경고 수 / SLA warnings |
| `admin_del_ops_kpi_unassigned` | `admin-delivery-r4-field-monitoring.ts` | 라이더 미배정 / No rider | `admin-delivery-operations.ts`: 미배차 수 / Unassigned |
| `admin_del_ops_recovery_delivering_attention` | `admin-delivery-r4-field-monitoring.ts` | 장시간 배달 주문 주의 표시 / Flag long deliveries | `admin-delivery-operations.ts`: delivering 주목 표시 / Flag long delivering |
| `admin_del_ops_recovery_waiting_bump` | `admin-delivery-r4-field-monitoring.ts` | 배정 대기 주문 재배정 요청 / Re-request riders for waiting orders | `admin-delivery-operations.ts`: waiting_rider 재큐(소프트) / waiting_rider soft requeue |
| `admin_delivery_ads_related_support_note` | `ads-impl-1107-w3.ts` | 고객지원 문의입니다. 광고 승인·정지는 아래 운영 대화가 아니라 「광고 운영 조치」에서 처리합니다. / Customer support cases. Approve/pause ads in Ad operations — not this Support inbox. | `admin-delivery-ads.ts`: 고객지원 문의입니다. 광고 승인/중지는 아래 운영 대화가 아니라 Ads lifecycle에서 처리합니다. / Customer support cases. Approve/pause ads via Ads lifecycle — not this Support inbox. |
| `admin_delivery_ads_related_support_title` | `ads-impl-1107-w3.ts` | 관련 문의 / Related Support cases | `admin-delivery-ads.ts`: 관련 문의 (Support) / Related Support cases |
| `admin_delivery_ads_schedule_no_silent_extend` | `ads-impl-1107-w3.ts` | 종료일을 늘리려면 「일정 저장」이 아니라 아래 기간 연장(유료/보상)을 사용하세요. 숨김 CTA는 없습니다 — 일시중지·종료만 지원합니다. / To lengthen end date, use Period extension (PAID/compensation) below — not Save schedule. No hide CTA — pause and end only. | `admin-delivery-ads.ts`: 종료일을 늘리려면 「일정 저장」이 아니라 아래 기간 연장(유료/보상)을 사용하세요. 숨김 CTA는 없습니다 — 일시중지·강제 종료·종료만 지원합니다. / To lengthen end date, use Period extension (PAID/compensation) below — not Save schedule. No hide CTA — pause, terminate, and end only. |
| `admin_delivery_ads_stub_body` | `admin-delivery-ads.ts` | 이 화면에서 승인·반려·운영을 진행하세요. / The unified control plane is live. Review, approve, and operate campaigns here. | `admin-stores-product-recovery.ts`: 통합 제어면이 활성화되었습니다. /admin/delivery-ads 에서 검수·운영하세요. / Unified control plane is live. Review and operate at /admin/delivery-ads. |
| `admin_do_aa_refund_approved` | `admin-delivery-r4-orders.ts` | 환불 처리 기록 / Refund recorded | `admin-delivery-orders.ts`: 환불 승인 처리 / Refund approved |
| `admin_do_chat_delivery_table` | `admin-delivery-r4-orders.ts` | 주문 상세 보기 / Open order detail | `admin-delivery-orders.ts`: 배달 주문 상세(표) / Delivery order table |
| `admin_do_chat_desc` | `admin-delivery-r4-orders.ts` | 주문에 연결된 채팅을 조회합니다. 관리자 화면에서는 채팅방을 새로 만들지 않습니다. / Look up the chat linked to an order. Admin screens never create chat rooms. | `admin-delivery-orders.ts`: 배달·매장 주문 채팅은 Delivery Authority입니다. CM room은 메시지 chrome 참조만 합니다(생성·소유 이전 금지). / Delivery owns store-order chat. CM rooms are message chrome only (no create / ownership move). |
| `admin_do_chat_open_store_orders` | `admin-delivery-r4-orders.ts` | 처리 필요 주문에서 보기 / View in orders needing action | `admin-delivery-orders.ts`: 매장 주문(액션)에서 열기 / Open from store orders (actions) |
| `admin_do_chat_room_hint` | `admin-delivery-r4-orders.ts` | 이 주문의 대화는 「주문 채팅 열기」에서 읽기 전용으로 확인합니다. / Read this order's conversation via 「Open order chat」 (read-only). | `admin-delivery-orders.ts`: 주문 {orderId}의 대화는 연결된 메신저 방에서 확인합니다. Admin은 조회만 하며 방을 만들지 않습니다. / Conversation for order {orderId} is in the linked messenger room. Admin is lookup-only and does not create rooms. |
| `admin_do_common_ledger_loading` | `admin-delivery-r4-orders.ts` | 불러오는 중… / Loading… | `admin-delivery-orders.ts`: 원장 불러오는 중… / Loading ledger… |
| `admin_do_dashboard_go_store_orders` | `admin-delivery-r4-orders.ts` | 처리 필요 주문으로 이동 / Go to orders needing action | `admin-delivery-orders.ts`: 매장 주문(액션)으로 이동 / Go to store orders (actions) |
| `admin_do_detail_dt_refund_approved` | `admin-delivery-r4-orders.ts` | 환불 처리 기록 시각 / Refund recorded at | `admin-delivery-orders.ts`: 환불 승인 시각 / Refund approved at |
| `admin_do_detail_search_hint` | `admin-delivery-r4-orders.ts` | 주문 목록에서 주문번호로 검색하세요 / Search by order number in the order list | `admin-delivery-orders.ts`: 매장 주문(액션)에서 order_id로 검색 / Search by order_id in store orders (actions) |
| `admin_do_nav_store_orders` | `admin-delivery-r4-orders.ts` | 처리 필요 주문 / Orders needing action | `admin-delivery-orders.ts`: 매장 주문(액션) / Store orders (actions) |
| `admin_do_refund_approved` | `admin-delivery-r4-orders.ts` | 환불 처리 기록됨 / Refund recorded | `admin-delivery-orders.ts`: 환불 승인됨 / Refund approved |
| `admin_do_refund_modal_approve_title` | `admin-delivery-r4-orders.ts` | 환불 처리 기록 / Record refund | `admin-delivery-orders.ts`: 환불 승인 / Approve refund |
| `admin_feed_posts_col_reported` | `messages/json` | 신고 / Reported | `admin.ts`: 신고 / Reports |
| `admin_feed_report_detail_body` | `messages/json` | 내용 / Details | `admin.ts`: 신고 내용 / Report body |
| `admin_feed_report_detail_card_info` | `messages/json` | 신고 정보 / Report | `admin.ts`: 신고 정보 / Report info |
| `admin_feed_report_detail_post` | `messages/json` | 글 / Post | `admin.ts`: 게시글 / Post |
| `admin_feed_report_detail_processed` | `messages/json` | 처리 시각 / Processed at | `admin.ts`: 처리 / Processed |
| `admin_feed_report_memo_label` | `messages/json` | 메모 / Memo | `admin.ts`: 관리자 메모 / Admin memo |
| `admin_launch_intro_frequency_every_launch` | `ads-impl-1104-i.ts` | 새로 실행할 때마다(완전히 종료 후 다시 켬 · 백그라운드 복귀·알림으로 열 때는 안 나옴) / Every fresh launch (fully closed, then opened again · not when returning from background or opening from a notification) | `admin-launch-intro.ts`: 앱을 켤 때마다 / Every app launch |
| `admin_launch_intro_history_invalid` | `ads-impl-1104-i.ts` | 손상됨 — {error} · 다시 게시할 수 없습니다 / Broken — {error} · cannot be reactivated | `admin-launch-intro.ts`: 손상됨 — 장면 문서를 읽을 수 없어 다시 게시할 수 없습니다 ({error}) / Broken — the scene document cannot be read, so it cannot be reactivated ({error}) |
| `admin_launch_intro_total_hint` | `ads-impl-1104-i.ts` | 앱을 새로 실행할 때 이 시간만큼 인트로가 보입니다. 짧을수록 사용자가 덜 지칩니다. / On a fresh app launch the intro shows this long. Shorter is less tiring. | `admin-launch-intro.ts`: 앱을 켤 때 이 시간만큼 Intro가 보입니다. 짧을수록 사용자가 덜 지칩니다. / Devices show the Intro this long at app start. Shorter is less tiring. |
| `admin_menu_ads_community_promote` | `ads-impl-1107-w3.ts` | 커뮤니티 게시물 상위노출 / Community post top exposure | `admin.ts`: 커뮤니티 게시물 홍보 / Community post promote |
| `admin_menu_ads_promote_group` | `ads-impl-1107-w3.ts` | 게시물 상위노출 신청 / Post top-exposure requests | `admin.ts`: 게시물 홍보 신청 / Post promote requests |
| `admin_menu_chat_flow` | `admin-trade-admin.ts` | 거래 진행·완료 / Trade progress | `admin.ts`: 거래흐름·온도 / Trade flow and temperature |
| `admin_menu_chat_trade` | `admin-trade-admin.ts` | 거래 채팅방 / Trade chat rooms | `admin.ts`: 거래채팅 / Trade chats |
| `admin_menu_commerce_settings` | `admin-delivery-ops-ux.ts` | 커머스 기본값 / Commerce defaults | `admin.ts`: 커머스 수치 / Commerce metrics |
| `admin_menu_community_point_policies` | `admin-community-r4.ts` | 포인트 정책 / Point policy | `admin.ts`: 커뮤니티 포인트 정책 / Community point policies |
| `admin_menu_community_promotions` | `admin-community-r4.ts` | 커뮤니티 상위노출 / Post promotions | `admin.ts`: 커뮤니티 상위노출 / Community promotions |
| `admin_menu_community_reports` | `admin-community-r4.ts` | 신고 처리함 / Report inbox | `admin.ts`: 일반 신고 / General reports |
| `admin_menu_community_section_content` | `admin-community-r4.ts` | 게시물·댓글 / Posts & comments | `admin.ts`: 콘텐츠 / Content |
| `admin_menu_community_section_moderation` | `admin-community-r4.ts` | 신고·제재 / Reports & sanctions | `admin.ts`: 신고 / 관리 / Reports / moderation |
| `admin_menu_community_section_ops` | `admin-community-r4.ts` | 운영 현황 / Overview | `admin.ts`: 운영 / Operations |
| `admin_menu_community_section_promo_point` | `admin-community-r4.ts` | 포인트·충전 / Points & top-ups | `admin.ts`: 홍보 / 포인트 / Promotion / points |
| `admin_menu_community_section_promotion` | `ads-impl-1104-a.ts` | 상위노출 / Top placement | `admin-community-r4.ts`: 홍보 / Promotion |
| `admin_menu_community_section_settings` | `admin-community-r4.ts` | 운영 기록·설정 / Records & settings | `admin.ts`: 설정 / Settings |
| `admin_menu_delivery_ads_commercial` | `ads-impl-1107-r1.ts` | 광고 상품·가격 / Ad products & prices | `admin-delivery-ads.ts`: 광고 상품 설정 / Ad product settings |
| `admin_menu_delivery_ads_ops` | `ads-impl-1107-r1.ts` | 배달 광고 운영 목록 / Delivery ad operations | `admin-delivery-ads.ts`: 배달 광고 / Delivery ads |
| `admin_menu_delivery_auto_actions` | `admin-delivery-ops-ux.ts` | 자동 조치 승인 / Auto action approval | `admin.ts`: 자동 액션 / Auto actions |
| `admin_menu_delivery_distance` | `admin-delivery-ops-ux.ts` | 배달 거리 정책 / Delivery distance policy | `admin.ts`: 거리 정책 / Distance policy |
| `admin_menu_delivery_logs` | `admin-delivery-ops-ux.ts` | 주문 처리 기록 / Order activity log | `admin.ts`: 감사 로그 / Audit logs |
| `admin_menu_delivery_operation_alerts` | `admin-delivery-ops-ux.ts` | 배달 경고 / Delivery alerts | `admin.ts`: 운영 알림 / Ops alerts |
| `admin_menu_delivery_operations_stats` | `admin-delivery-r4-field-monitoring.ts` | 배달 통계 / Delivery statistics | `admin.ts`: 운영 통계 / Ops stats |
| `admin_menu_delivery_ops` | `admin-delivery-ops-ux.ts` | 주문 / Orders | `admin.ts`: 주문 운영 / Order operations |
| `admin_menu_delivery_ops_console` | `admin-delivery-r4-field-monitoring.ts` | 실시간 상황판 / Live ops board | `admin.ts`: 운영 콘솔 / Ops console |
| `admin_menu_delivery_section_settings` | `admin-delivery-ops-ux.ts` | 배달 설정 / Delivery settings | `admin.ts`: 매장설정 / Store settings |
| `admin_menu_feed_settings` | `admin-community-r4.ts` | 운영 설정 / Settings | `admin.ts`: 운영 설정 / Ops settings |
| `admin_menu_finance_cash` | `admin-delivery-ops-ux.ts` | 매장 캐시 내역 / Cash history | `admin.ts`: Cash / Cash |
| `admin_menu_finance_orders` | `admin-delivery-ops-ux.ts` | 주문별 금액 추적 / Per-order money trace | `admin.ts`: 주문별 정산 / Order settlements |
| `admin_menu_meeting_logs` | `admin-community-r4.ts` | 모임 운영 로그 / Meeting logs | `admin.ts`: 모임 운영 로그 / Meeting operation logs |
| `admin_menu_menu_trade` | `admin-trade-admin.ts` | 카테고리 / Categories | `admin.ts`: 주제 (거래) / Subjects (trade) |
| `admin_menu_order_notifications` | `admin-delivery-ops-ux.ts` | 전체 처리 대기함 / All pending work | `admin.ts`: 액션 큐 / Action queue |
| `admin_menu_posts_management` | `admin-trade-admin.ts` | 거래 게시물 / Listings | `admin.ts`: 게시물 관리 / Post management |
| `admin_menu_store_coupon_control_center` | `admin-delivery-ops-ux.ts` | 쿠폰 운영 / Coupons | `admin-stores-product-recovery.ts`: 쿠폰 운영 센터 / Coupon control center |
| `admin_menu_store_orders_action_queue` | `admin-delivery-ops-ux.ts` | 처리 필요 주문 / Orders needing action | `admin.ts`: 주문 액션 / Order actions |
| `admin_menu_store_payment_events` | `admin-delivery-ops-ux.ts` | 결제 수신 기록 / Payment receipts | `admin.ts`: 결제 이벤트 / Payment events |
| `admin_menu_store_point_ledger` | `admin-delivery-ops-ux.ts` | 매장 코인 내역 / Store Coin history | `admin.ts`: 이전 매장 운영 원장 보관함 / Historical store operations ledger archive |
| `admin_menu_store_reports` | `admin-delivery-ops-ux.ts` | 매장 신고 / Store reports | `admin.ts`: 신고 / Reports |
| `admin_menu_store_reviews` | `admin-delivery-ops-ux.ts` | 매장 리뷰 / Store reviews | `admin.ts`: 리뷰 / Reviews |
| `admin_menu_store_settings_alerts` | `admin-delivery-ops-ux.ts` | 매장 알림 설정 / Store alert settings | `admin.ts`: 알림 / Alerts |
| `admin_menu_store_settlements` | `admin-delivery-ops-ux.ts` | 수수료 내역·검토 / Fee history & review | `admin.ts`: 정산 / Settlements |
| `admin_menu_stores_browse_policy` | `admin-delivery-ops-ux.ts` | 매장 목록 노출 정책 / Store list display policy | `admin-stores-product-recovery.ts`: BROWSE 노출 정책 / BROWSE exposure policy |
| `admin_menu_stores_home_shelves` | `admin-delivery-ops-ux.ts` | 홈 화면 구성 / Home screen layout | `admin-stores-product-recovery.ts`: HOME 구성 / HOME composition |
| `admin_menu_trade_audit` | `admin-trade-admin.ts` | 운영 기록 / Operation log | `admin.ts`: 거래 게시물 감사 로그 / Trade post audit log |
| `admin_menu_trade_hub` | `admin-trade-admin.ts` | 거래 대시보드 / Trade dashboard | `admin.ts`: 거래 통합 / Trade hub |
| `admin_menu_trade_reports` | `admin-trade-admin.ts` | 거래 신고 / Trade reports | `admin.ts`: 상품 신고 / Product reports |
| `admin_menu_trade_reviews` | `admin-trade-admin.ts` | 거래 후기 / Trade reviews | `admin.ts`: 거래후기 / Trade reviews |
| `admin_menu_trade_settings` | `admin-trade-admin.ts` | 거래 정책 / Trade policy | `admin.ts`: 거래 설정 / Trade settings |
| `admin_ops_console_empty_queue` | `admin-delivery-r4-field-monitoring.ts` | 처리할 주문이 없습니다. / No orders to handle. | `admin-ops-console.ts`: 큐가 비어있습니다. / Queue is empty. |
| `admin_ops_console_focus_attention` | `admin-delivery-r4-field-monitoring.ts` | 주의 표시 / Flagged | `admin-ops-console.ts`: Attention / Attention |
| `admin_ops_console_focus_critical` | `admin-delivery-r4-field-monitoring.ts` | 긴급 / Critical | `admin-ops-console.ts`: Critical / Critical |
| `admin_ops_console_focus_label` | `admin-delivery-r4-field-monitoring.ts` | 보기 / View | `admin-ops-console.ts`: Focus / Focus |
| `admin_ops_console_focus_sla` | `admin-delivery-r4-field-monitoring.ts` | 배달 지연 / Delays | `admin-ops-console.ts`: SLA / SLA |
| `admin_ops_console_group_label` | `admin-delivery-r4-field-monitoring.ts` | 묶기 / Group | `admin-ops-console.ts`: Group / Group |
| `admin_ops_console_group_rider_id` | `admin-delivery-r4-field-monitoring.ts` | 라이더 (이름 없음) / Rider (no name) | `admin-ops-console.ts`: Rider {id} / Rider {id} |
| `admin_ops_console_group_store_id` | `admin-delivery-r4-field-monitoring.ts` | 매장 (이름 없음) / Store (no name) | `admin-ops-console.ts`: Store {id} / Store {id} |
| `admin_ops_console_kpi_cron_health` | `admin-delivery-r4-field-monitoring.ts` | 경고 동기화 마지막 실행 / Last alert sync | `admin-ops-console.ts`: cron health / Cron health |
| `admin_ops_console_kpi_cron_minutes` | `admin-delivery-r4-field-monitoring.ts` | {m}분 전 / {m} min ago | `admin-ops-console.ts`: {m}m / {m}m |
| `admin_ops_console_kpi_failed_auto` | `admin-delivery-r4-field-monitoring.ts` | 자동 조치 실패 / Failed auto actions | `admin-ops-console.ts`: failed auto / Failed auto |
| `admin_ops_console_kpi_held_settlements` | `admin-delivery-r4-field-monitoring.ts` | 보류 정산 (이전 방식) / Held settlements (legacy) | `admin-ops-console.ts`: held settlements / Held settlements |
| `admin_ops_console_kpi_long_delivering` | `admin-delivery-r4-field-monitoring.ts` | 장시간 배달 중 / Long deliveries | `admin-ops-console.ts`: 장기 배송 / Long deliveries |
| `admin_ops_console_kpi_pending_appr` | `admin-delivery-r4-field-monitoring.ts` | 자동 조치 승인 대기 / Auto actions pending | `admin-ops-console.ts`: pending appr / Pending approval |
| `admin_ops_console_kpi_sla_attention` | `admin-delivery-r4-field-monitoring.ts` | 배달 지연 경고 / Delay warnings | `admin-ops-console.ts`: SLA 경고 / SLA warnings |
| `admin_ops_console_kpi_unassigned` | `admin-delivery-r4-field-monitoring.ts` | 라이더 미배정 / No rider | `admin-ops-console.ts`: 미배차 / Unassigned |
| `admin_ops_console_link_ops_hub` | `admin-delivery-r4-field-monitoring.ts` | 배달 통계 / Delivery statistics | `admin-ops-console.ts`: 운영센터 / Ops hub |
| `admin_ops_console_loading` | `admin-delivery-r4-field-monitoring.ts` | 불러오는 중… / Loading… | `admin-ops-console.ts`: loading… / Loading… |
| `admin_ops_console_low_auto_collapse` | `admin-delivery-r4-field-monitoring.ts` | 낮은 우선순위 — 자동 접힘 / Low priority — collapsed | `admin-ops-console.ts`: low → auto collapse / low → auto collapse |
| `admin_ops_console_modal_hint` | `admin-delivery-r4-field-monitoring.ts` | 처리 중에는 중복 클릭이 막힙니다. / Duplicate clicks are blocked while processing. | `admin-ops-console.ts`: 확인/취소. 처리 중 중복 클릭은 차단됩니다. / Confirm/cancel. Duplicate clicks are blocked while processing. |
| `admin_ops_console_no_order_id` | `admin-delivery-r4-field-monitoring.ts` | 연결된 주문 없음 / No linked order | `admin-ops-console.ts`: order_id 없음 / No order_id |
| `admin_ops_console_page_title` | `admin-delivery-ops-ux.ts` | 운영 콘솔 / Ops console | `admin-ops-console.ts`: Ops Console / Ops Console |
| `admin_ops_console_ph_failure_reason` | `admin-delivery-r4-field-monitoring.ts` | 해제 사유 (선택) / Release reason (optional) | `admin-ops-console.ts`: failure_reason(선택) / failure_reason (optional) |
| `admin_ops_console_ph_rider_search` | `admin-delivery-r4-field-monitoring.ts` | 라이더 검색 (이름) / Search riders (name) | `admin-ops-console.ts`: 라이더 검색(이름/ID 일부) / Search rider (name/ID) |
| `admin_ops_console_queue_title` | `admin-delivery-r4-field-monitoring.ts` | 실시간 처리 목록 / Live work list | `admin-ops-console.ts`: 실시간 운영 큐 / Live ops queue |
| `admin_ops_console_quick_actions_hint` | `admin-delivery-r4-field-monitoring.ts` | 여러 주문에 한 번에 적용됩니다. 실행 전 사유 입력과 확인 문구 재입력이 필요합니다. / Applies to many orders at once. Requires a reason and retyping the confirmation text. | `admin-ops-console.ts`: 복구 러너는 기존 RPC를 호출합니다. (상태 머신/기능 축소 없음) / Recovery runners call existing RPCs. (No state machine / feature reduction) |
| `admin_ops_console_quick_actions_title` | `admin-delivery-r4-field-monitoring.ts` | 현장 일괄 복구 / Field bulk recovery | `admin-ops-console.ts`: 빠른 액션 / Quick actions |
| `admin_ops_console_reason_attention` | `admin-delivery-r4-field-monitoring.ts` | 주의 표시됨 / Flagged | `admin-ops-console.ts`: attention / attention |
| `admin_ops_console_reason_delivering_1h` | `admin-delivery-r4-field-monitoring.ts` | 배달 1시간 이상 / Delivering 1h+ | `admin-ops-console.ts`: delivering 1h+ / delivering 1h+ |
| `admin_ops_console_reason_delivering_2h` | `admin-delivery-r4-field-monitoring.ts` | 배달 2시간 이상 / Delivering 2h+ | `admin-ops-console.ts`: delivering 2h+ / delivering 2h+ |
| `admin_ops_console_reason_delivering_3h` | `admin-delivery-r4-field-monitoring.ts` | 배달 3시간 이상 / Delivering 3h+ | `admin-ops-console.ts`: delivering 3h+ / delivering 3h+ |
| `admin_ops_console_reason_escalation` | `admin-delivery-r4-field-monitoring.ts` | 경고 단계 상승 {count}회 / Escalated {count}x | `admin-ops-console.ts`: escalation {count} / escalation {count} |
| `admin_ops_console_reason_held_settlement` | `admin-delivery-r4-field-monitoring.ts` | 보류 정산 / Held settlement | `admin-ops-console.ts`: held settlement / held settlement |
| `admin_ops_console_reason_queue` | `admin-delivery-r4-field-monitoring.ts` | 확인 필요 / Needs a look | `admin-ops-console.ts`: queue / queue |
| `admin_ops_console_reason_repeat` | `admin-delivery-r4-field-monitoring.ts` | 경고 반복 {count}회 / Repeated {count}x | `admin-ops-console.ts`: repeat {count} / repeat {count} |
| `admin_ops_console_reason_sla_critical` | `admin-delivery-r4-field-monitoring.ts` | 배달 지연 긴급 / Critical delay | `admin-ops-console.ts`: SLA critical / SLA critical |
| `admin_ops_console_reason_sla_level` | `admin-delivery-r4-field-monitoring.ts` | 배달 지연 경고 / Delay warning | `admin-ops-console.ts`: SLA {level} / SLA {level} |
| `admin_ops_console_reason_unassigned` | `admin-delivery-r4-field-monitoring.ts` | 라이더 미배정 / No rider | `admin-ops-console.ts`: 미배차 / Unassigned |
| `admin_ops_console_recovery_alert_pipeline` | `admin-delivery-r4-field-monitoring.ts` | 경고 동기화 + 자동 조치 실행 / Sync alerts + run auto actions | `admin-ops-console.ts`: 동기화+러너 / Sync + runner |
| `admin_ops_console_recovery_alert_sync` | `admin-delivery-r4-field-monitoring.ts` | 배달 경고 동기화 / Sync delivery alerts | `admin-ops-console.ts`: 알림 동기화 / Alert sync |
| `admin_ops_console_recovery_auto_action_runner` | `admin-delivery-r4-field-monitoring.ts` | 자동 조치 지금 실행 / Run auto actions now | `admin-ops-console.ts`: 자동 액션 러너 / Auto action runner |
| `admin_ops_console_recovery_bulk_retry` | `admin-delivery-r4-field-monitoring.ts` | 실패한 자동 조치 일괄 재실행 / Re-run all failed auto actions | `admin-ops-console.ts`: 실패 자동 액션 재큐 / Requeue failed auto actions |
| `admin_ops_console_recovery_sla_scan` | `admin-delivery-r4-field-monitoring.ts` | 배달 지연 점검 실행 / Run delay check | `admin-ops-console.ts`: SLA 스캔 / SLA scan |
| `admin_ops_console_recovery_stale_alerts` | `admin-delivery-r4-field-monitoring.ts` | 종료된 주문의 경고 정리 / Clean up alerts of closed orders | `admin-ops-console.ts`: 종료 주문 알림 정리 / Clear stale order alerts |
| `admin_ops_console_rider_load_failed` | `admin-delivery-r4-field-monitoring.ts` | 라이더 목록을 불러오지 못했습니다: {error} / Could not load riders: {error} | `admin-ops-console.ts`: 라이더 목록 로드 실패: {error} / Failed to load riders: {error} |
| `admin_ops_console_rider_option_offline` | `admin-delivery-r4-field-monitoring.ts` | [오프라인]  / [Offline]  | `admin-ops-console.ts`: [OFF]  / [OFF]  |
| `admin_ops_console_rider_option_online` | `admin-delivery-r4-field-monitoring.ts` | [온라인]  / [Online]  | `admin-ops-console.ts`: [ON]  / [ON]  |
| `admin_ops_console_sort_hint` | `admin-delivery-r4-field-monitoring.ts` | 우선순위 높은 순 (같으면 경고 단계·최근 변경 순) / Highest priority first (then escalation, latest change) | `admin-ops-console.ts`: smart sort: priority_score desc (tie: escalation, updated_at) / Smart sort: priority_score desc (tie: escalation, updated_at) |
| `admin_ops_console_tab_incidents` | `admin-delivery-r4-field-monitoring.ts` | 경고 발생 / Alerts raised | `admin-ops-console.ts`: 장애 / Incidents |
| `admin_ops_console_tab_settlements` | `admin-delivery-r4-field-monitoring.ts` | 보류 정산 / Held settlements | `admin-ops-console.ts`: 정산 문제 / Settlement issues |
| `admin_ops_console_tab_sla` | `admin-delivery-r4-field-monitoring.ts` | 배달 지연 / Delays | `admin-ops-console.ts`: SLA / SLA |
| `admin_ops_console_th_instant_action` | `admin-delivery-r4-field-monitoring.ts` | 실시간 조치 / Live actions | `admin-ops-console.ts`: 즉시 액션 / Instant action |
| `admin_ops_console_th_priority` | `admin-delivery-r4-field-monitoring.ts` | 우선순위 / Priority | `admin-ops-console.ts`: Priority / Priority |
| `admin_ops_console_top_priority` | `admin-delivery-r4-field-monitoring.ts` | 최고 우선순위 {score} / Top priority {score} | `admin-ops-console.ts`: top priority {score} / top priority {score} |
| `admin_order_chats_hub_title` | `admin-delivery-ops-ux.ts` | 주문 채팅 / Order chats | `messages/json`: 주문 · 채팅 허브 / Orders · chat hub |
| `admin_order_notifications_desc` | `messages/json` | 취소·환불·분쟁 등 시뮬/데모 알림 스토어와 연동된 목록입니다. 실운영 알림은 별도 채널·감사 로그와 함께 검증하세요. / List tied to the demo/sim notification store (cancellations, refunds, disputes, etc.). Validate production alerts with your real channels and audit logs. | `admin.ts`: 주문·매장·시스템 인앱 알림을 확인합니다. 계정별 설정은 알림 설정에서 변경할 수 있습니다. / View in-app alerts for orders, stores, and system events. Change per-account settings on the notification settings page. |
| `admin_order_notifications_title` | `messages/json` | 운영 알림 / Operations notifications | `admin.ts`: 운영 알림 / Ops alerts |
| `admin_page_store_products` | `admin-delivery-ops-ux.ts` | 메뉴·상품 검수 / Menu & product review | `admin.ts`: 매장 상품 검수 / Store product moderation |
| `admin_page_store_review_queue` | `admin-delivery-ops-ux.ts` | 입점 심사 / Store onboarding review | `admin.ts`: 매장 심사 (커머스) / Store review queue (commerce) |
| `admin_platform_popup_placement_system_note` | `admin-platform-popup.ts` | 결제·통화·위험 작업 화면은 시스템이 잠시 가립니다. 노출 위치와는 별개입니다. / Payment, call, and high-risk screens are gated by the system — separate from placement. | `platform-popup-owner.ts`: 메신저·통화·관리자·오너 운영·결제·주문 Critical 화면은 시스템에서 자동 제외됩니다. / Messenger, Call, Admin, Owner Ops, Payment, and order-critical screens are excluded automatically. |
| `admin_platform_popup_section_placement` | `ads-impl-1104-u.ts` | 6. 노출 위치 / 6. Placement | `platform-popup-owner.ts`: 이 팝업을 어디에 노출할까요? / Where should this popup appear? |
| `admin_posts_col_likes` | `messages/json` | 추천 / Likes | `admin.ts`: 좋아요 / Likes |
| `admin_posts_col_region` | `messages/json` | 동네 / Neighborhood | `admin.ts`: 지역 / Region |
| `admin_posts_col_registered` | `messages/json` | 등록 / Posted | `admin.ts`: 등록 / Created |
| `admin_posts_empty_community` | `messages/json` | 동네·커뮤니티 글이 없습니다. / No neighborhood or community posts. | `admin.ts`: 게시글이 없습니다. / No posts. |
| `admin_posts_err_community_load` | `messages/json` | 동네 글 목록을 불러오지 못했습니다. / Could not load neighborhood posts. | `admin.ts`: 게시글을 불러오지 못했습니다. / Could not load posts. |
| `admin_posts_err_community_patch` | `messages/json` | 상태 변경에 실패했습니다. / Failed to change status. | `admin.ts`: 게시글 상태를 변경하지 못했습니다. / Could not update post status. |
| `admin_report_card_log` | `admin-ia-r1.ts` | 처리 이력 / Action history | `admin.ts`: 처리 이력 (report_actions) / Action log (report_actions) |
| `admin_report_filter_domain_all` | `admin-ia-r1.ts` | 도메인: 전체 / Domain: all | `admin.ts`: 도메인: 전체(표시만) / Domain: all (display only) |
| `admin_report_list_description` | `admin-ia-r1.ts` | 신고 원장 6종을 한 목록으로 봅니다. 거래(reports)·커뮤니티(community_reports) 신고는 「상세」에서 처리하고, 매장·모임·메신저·구 거래 채팅 신고는 조회만 하며 각 행의 「처리 화면」에서 처리합니다. 계정 정지·차단은 회원 상세에서 합니다. / All six report ledgers in one list. Trade (reports) and community (community_reports) reports are processed from Detail; store, meeting, messenger and legacy trade-chat reports are view-only here and processed via each row’s domain screen. Account suspensions are done in member detail. | `admin.ts`: 표시만 합칩니다. Trade는 reports, Community는 community_reports 테이블을 씁니다. 도메인 필터 후 해당 상세 writer로만 조치하세요. 계정 제재는 MCC·제재 원장과 별개입니다. / Display-only merge. Trade uses reports; Community uses community_reports. Filter by domain, then act only via that detail writer. Account sanctions are separate (MCC / sanction ledger). |
| `admin_report_sanctions_intro` | `admin-ia-r1.ts` | 반려·경고·채팅 제한·게시글 숨김·계정 정지 등 처리 결과는 처리 이력에 기록되고, 제재가 걸리면 제재 기록에도 남습니다. / Rejections, warnings, chat restrictions, hidden posts and suspensions are recorded in the action history; sanctions also appear in the sanction log. | `admin.ts`: 반려·경고·채팅 제한·게시글 숨김(posts.status → hidden)·계정 정지 등은 report_actions에 기록되고, 해당 시 sanctions에 제재가 쌓입니다. / Rejections, warnings, chat restrictions, hiding posts (posts.status → hidden), suspensions, etc. are written to report_actions; sanctions are accumulated in sanctions when applicable. |
| `admin_sanction_ledger_intro` | `admin-ia-r1.ts` | 신고 처리 기록 · 거래·커뮤니티 이용 제한 · 계정 정지·차단 이력을 한 목록으로 봅니다. 각 행의 출처에서 원래 처리 화면으로 이동할 수 있습니다. / Report actions, trade/community restrictions and account suspensions/bans in one list. Each row links to its original processing screen. | `admin.ts`: 신고 콘텐츠 조치 로그(report_actions + reports)입니다. 계정 상태(profiles.status / user_moderation_events)와는 별도 원장입니다. / Content-action log on reports (report_actions + reports). Separate from account status (profiles.status / user_moderation_events). |
| `admin_stores_home_shelves_title` | `admin-delivery-ops-ux.ts` | 홈 화면 구성 / Home screen layout | `admin-stores-product-recovery.ts`: HOME 구성 / HOME composition |
| `admin_stores_payment_desc` | `admin-delivery-r4-orders.ts` | 결제사 자동 알림으로 들어온 결제 관련 기록입니다. 고객 결제는 매장에서 직접 처리되며, 이 기록은 조회 전용입니다. 원본 데이터는 각 행의 「기술 정보」에 있습니다. / Payment records received from payment provider notices. Customers pay the store directly; this page is read-only. Raw data is under each row's Technical details. | `admin.ts`: 웹훅·관리자 스텁으로 기록된 결제 관련 이력입니다. 민감 정보는 payload에 포함될 수 있으니 접근을 제한하세요. / Payment-related events from webhooks and admin stubs. Payloads may contain sensitive data—restrict access. |
| `admin_stores_payment_err_table_missing` | `admin-delivery-r4-orders.ts` | 결제 수신 기록 저장소가 준비되지 않았습니다. 시스템 관리자에게 문의하세요. / Payment receipt storage is not set up. Contact a system admin. | `admin.ts`: store_payment_events 테이블을 적용해 주세요. / Apply the store_payment_events table migration. |
| `admin_stores_payment_filter_event` | `admin-delivery-r4-orders.ts` | 내용 / What happened | `admin.ts`: event_type 포함 / event_type contains |
| `admin_stores_payment_filter_source` | `admin-delivery-r4-orders.ts` | 수신 경로 / Received via | `admin.ts`: source 포함 / source contains |
| `admin_trade_dashboard_desc` | `ads-impl-1107-w3.ts` | Marketplace의 게시물, 거래, 신고, 상위노출 상태를 관리합니다. / Manage marketplace listings, trades, reports, and top exposure. | `admin-trade-console.ts`: Marketplace의 게시물, 거래, 신고, 홍보 상태를 관리합니다. / Manage marketplace listings, trades, reports, and promotions. |
| `admin_trade_kpi_promo` | `ads-impl-1107-w3.ts` | 상위노출 중 / Top exposure | `admin-trade-console.ts`: 홍보중 / Promoted |
| `admin_trade_post_status_active` | `admin-chat-r1-pages.ts` | 판매 중 / On sale | `messages/json`: 판매중 / For sale |
| `admin_trade_post_status_reserved` | `admin-chat-r1-pages.ts` | 예약 중 / Reserved | `messages/json`: 예약중 / Reserved |
| `admin_trade_post_status_sold` | `admin-chat-r1-pages.ts` | 판매 완료 / Sold | `messages/json`: 거래완료 / Sold |
| `admin_user_filter_auth_all` | `messages/json` | 가입수단 전체 / All sign-up methods | `admin.ts`: 가입수단 전체 / All sign-in methods |
| `admin_user_filter_phone_all` | `messages/json` | 전화 인증 전체 / All phone verification | `admin.ts`: 전화인증 전체 / All phone verification |
| `admin_user_filter_phone_unverified` | `messages/json` | 미인증 / Not verified | `admin.ts`: 미인증 / Unverified |
| `admin_user_member_type_normal` | `messages/json` | 일반회원 / Standard member | `admin.ts`: 일반회원 / Regular member |
| `admin_user_mod_filter_banned` | `messages/json` | 탈퇴/영구정지 / Banned / permanent | `admin.ts`: 영구정지 / Banned |
| `admin_user_provider_apple` | `messages/json` | 애플 / Apple | `admin.ts`: Apple / Apple |
| `admin_user_provider_facebook` | `messages/json` | 페이스북 / Facebook | `admin.ts`: Facebook / Facebook |
| `admin_user_provider_google` | `messages/json` | 구글 / Google | `admin.ts`: Google / Google |
| `admin_user_provider_kakao` | `messages/json` | 카카오톡 / Kakao | `admin.ts`: 카카오 / Kakao |
| `admin_user_provider_manual` | `messages/json` | 수동 관리 / Manual | `admin.ts`: 수동 / Manual |
| `admin_user_provider_unknown` | `messages/json` | 확인 필요 / Unknown | `admin.ts`: 미확인 / Unknown |
| `admin_user_show_uuid` | `messages/json` | 회원 UUID 표시 / Show member UUID | `admin.ts`: UUID 표시 / Show UUID |
| `admin_user_sort_joined` | `messages/json` | 최근가입순 / Recently joined | `admin.ts`: 가입일 / Joined |
| `admin_user_sort_last_signin` | `messages/json` | 최근 로그인순 / Recent sign-in | `admin.ts`: 최근 로그인 / Last sign-in |
| `admin_user_sort_login_id` | `messages/json` | 로그인 아이디순 / Login ID | `admin.ts`: 로그인 ID / Login ID |
| `admin_user_sort_moderation` | `messages/json` | 상태순 / Moderation status | `admin.ts`: 제재상태 / Moderation |
| `admin_user_sort_nickname` | `messages/json` | 닉네임순 / Nickname | `admin.ts`: 닉네임 / Nickname |
| `admin_user_sort_phone_verified` | `messages/json` | 전화 인증순 / Phone verification | `admin.ts`: 전화인증 / Phone verified |
| `admin_user_sort_points` | `messages/json` | 포인트많은순 / Most points | `admin.ts`: Point / Point |
| `admin_user_sort_products` | `messages/json` | 상품많은순 / Most products | `admin.ts`: 상품/판매 / Products/sales |
| `admin_user_sort_provider` | `messages/json` | 가입수단순 / Sign-up method | `admin.ts`: 가입수단 / Sign-in method |
| `admin_user_sort_reports` | `messages/json` | 신고많은순 / Most reports | `admin.ts`: 신고 / Reports |
| `admin_users_action_detail` | `messages/json` | 상세 / Detail | `admin.ts`: 상세 / Details |
| `admin_users_cleanup_button` | `messages/json` | 테스트 회원 정리 (aaaa만 유지) / Clean test members (keep aaaa) | `admin.ts`: 고아 계정 정리 / Clean orphan accounts |
| `admin_users_cleanup_confirm` | `messages/json` | 관리자(role=admin) 계정만 남기고 나머지 테스트 회원을 삭제합니다. 계속할까요? / This will delete all test members except admin(role=admin). Continue? | `admin.ts`: 고아 계정·미연결 auth 계정을 정리합니다. 계속할까요? / Clean orphan accounts and unlinked auth users. Continue? |
| `admin_users_col_actions` | `messages/json` | 작업 / Actions | `admin.ts`: 관리 / Actions |
| `admin_users_col_last_login` | `messages/json` | 최근 로그인 / Last sign-in | `admin.ts`: 최근 로그인 / Last login |
| `admin_users_col_login_id` | `messages/json` | 로그인 아이디 / Login ID | `admin.ts`: 로그인 ID / Login ID |
| `admin_users_col_moderation` | `messages/json` | 상태 / Status | `admin.ts`: 제재 / Moderation |
| `admin_users_col_phone` | `messages/json` | 전화번호 / Phone | `admin.ts`: 전화 / Phone |
| `admin_users_col_phone_verify` | `messages/json` | 전화 인증 / Phone verify | `admin.ts`: 전화인증 / Phone verify |
| `admin_users_col_points` | `messages/json` | 포인트 / Points | `admin.ts`: Point / Point |
| `admin_users_create_admin` | `messages/json` | 관리자 수동 생성 / Create admin manually | `admin.ts`: 관리자 생성 / Create admin |
| `admin_users_error_admin_only` | `messages/json` | 관리자만 조회할 수 있습니다. / Only admins can view this list. | `admin.ts`: 관리자만 접근할 수 있습니다. / Admins only. |
| `admin_users_error_fetch_failed` | `messages/json` | 회원 목록을 불러오지 못했습니다. / Failed to load member list. | `admin.ts`: 회원 목록을 불러오지 못했습니다. / Could not load member list. |
| `admin_users_error_login_required` | `messages/json` | 로그인이 필요합니다. 다시 로그인 후 시도해 주세요. / Login is required. Please sign in again and try. | `admin.ts`: 로그인이 필요합니다. / Login required. |
| `admin_users_error_network` | `messages/json` | 회원 목록 요청에 실패했습니다. 네트워크 또는 서버 로그를 확인해 주세요. / Failed to request member list. Check network status or server logs. | `admin.ts`: 네트워크 오류가 발생했습니다. / Network error. |
| `admin_users_error_service_role_missing` | `messages/json` | SUPABASE_SERVICE_ROLE_KEY가 없어 회원 목록을 불러올 수 없습니다. / Member list cannot be loaded because SUPABASE_SERVICE_ROLE_KEY is missing. | `admin.ts`: Supabase service role이 설정되지 않았습니다. / Supabase service role is not configured. |
| `admin_users_member_state_active` | `messages/json` | 정상회원 / Active | `admin.ts`: 정상 / Active |
| `admin_users_member_state_need_phone` | `messages/json` | 전화미인증 / Phone not verified | `admin.ts`: 전화미인증 / Phone unverified |
| `admin_users_member_state_pending` | `messages/json` | 대기회원 / Pending | `admin.ts`: 대기 / Pending |
| `admin_users_member_summary_visible_count` | `messages/json` | {count}명 / {count} shown | `admin.ts`: {count}명 / {count} |
| `admin_users_member_type_admin_short` | `messages/json` | 관리자 / Admin | `admin.ts`: 관리 / Admin |
| `admin_users_member_type_normal_short` | `messages/json` | 일반 / Standard | `admin.ts`: 일반 / Regular |
| `admin_users_phone_status_none` | `messages/json` | 미인증 / Not verified | `admin.ts`: 미인증 / Unverified |
| `admin_users_phone_status_verified` | `messages/json` | 완료 / Done | `admin.ts`: 인증 / Verified |
| `admin_users_points_link` | `messages/json` | 내역 / History | `admin.ts`: Point / Point |
| `admin_users_request_failed` | `messages/json` | 요청 실패 / Request failed | `admin.ts`: 요청에 실패했습니다. / Request failed. |
| `admin_users_retry` | `messages/json` | 다시 불러오기 / Reload | `admin.ts`: 다시 시도 / Retry |
| `admin_users_tab_staff` | `messages/json` | 관리자 / Admins | `admin.ts`: 스태프 (SYSTEM) / Staff (SYSTEM) |
| `apple_iap_point_use_note` | `ads-impl-1107-w3.ts` | Apple 결제로 충전한 Point는 광고·상위노출에만 사용할 수 있습니다. 상품권·매장 주문에는 사용할 수 없습니다. / Point charged through Apple can only be used for ads and top exposure, not for gift certificates or store orders. | `points-ui.ts`: Apple 결제로 충전한 Point는 광고·홍보에만 사용할 수 있습니다. 상품권·매장 주문에는 사용할 수 없습니다. / Point charged through Apple can only be used for ads and promotions, not for gift certificates or store orders. |
| `gift_u2_detail_apple_only_note` | `ads-impl-1107-w3.ts` | Apple 결제로 충전한 {apple}P는 광고·상위노출에만 사용할 수 있습니다. / {apple}P charged through Apple can only be used for ads and top exposure. | `gift-certificate-u2.ts`: Apple 결제로 충전한 {apple}P는 광고·홍보에만 사용할 수 있습니다. / {apple}P charged through Apple can only be used for ads and promotions. |
| `gift_u2_err_apple_restricted` | `ads-impl-1107-w3.ts` | 보유 Point {total}P 중 이 결제에 사용할 수 있는 Point는 {usable}P입니다. Apple 결제로 충전한 Point는 광고·상위노출에만 사용할 수 있습니다. / You have {total}P, of which {usable}P can be used for this payment. Point charged through Apple can only be used for ads and top exposure. | `gift-certificate-u2.ts`: 보유 Point {total}P 중 이 결제에 사용할 수 있는 Point는 {usable}P입니다. Apple 결제로 충전한 Point는 광고·홍보에만 사용할 수 있습니다. / You have {total}P, of which {usable}P can be used for this payment. Point charged through Apple can only be used for ads and promotions. |
| `philife_write_ad_product_top_fixed_desc` | `ads-impl-1107-w1.ts` | 커뮤니티 피드에 {days}일간 노출됩니다. 피드 위쪽 자리는 1개(가장 최근 결제)이고, 나머지는 제자리에 ‘포인트 노출’로 보입니다. / Shown on the community feed for {days} days. One top spot per feed (latest payment); others show a “Promoted” label in their usual place. | `philife.ts`: 커뮤니티 피드 상단에 {days}일간 우선 노출됩니다. / Priority at the top of the community feed for {days} days. |
| `promo_sheet_community_immediate_note` | `ads-impl-1107-w1.ts` | 포인트 결제 즉시 노출됩니다. 피드 위쪽 자리는 1개(가장 최근 결제)이고, 나머지는 제자리에 ‘포인트 노출’로 보입니다. 관리자 승인이 없습니다. / Goes live immediately with Point. One top spot per feed (latest payment); others show a “Promoted” label in their usual place. No admin approval. | `points-ui.ts`: 포인트 결제 즉시 피드 상단에 노출됩니다. 관리자 승인이 없습니다. / Goes live at the top of the feed immediately with Point. No admin approval. |
| `promo_sheet_surface_community_home` | `ads-impl-1107-w1.ts` | 커뮤니티 홈 피드 / Community home feed | `points-ui.ts`: 커뮤니티 홈 피드 상단 / Community home feed top |
| `promo_sheet_surface_community_topic` | `ads-impl-1107-w1.ts` | 이 게시물 주제(토픽) 피드 / This post's topic feed | `points-ui.ts`: 이 게시물 주제(토픽) 피드 상단 / This post's topic feed top |
