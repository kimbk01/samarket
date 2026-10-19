# 채팅 Admin R1 — 인수인계 (새 클라우드 세션용)

## 0. 시작 방법 (새 세션 첫 지시로 그대로 사용)
```
저장소 kimbk01/samarket, 브랜치 claude/tender-brown-6esrai 를 이어서 작업한다.
먼저 AGENTS.md 의 「Claude 작업 효율 규정」과 docs/admin/dibay-admin-chat-handoff.md(이 문서),
docs/admin/dibay-admin-chat-audit-design.md(감사·설계)를 읽고, §3 남은 일만 처리한다.
감사·설계를 다시 하지 않는다. 배달 Admin 은 종료됐으므로 건드리지 않는다.
```

## 1. 상태
- 기준: main `ba2cfed7` (배달 종료 #72·#74·#75 포함) 위에 채팅 작업 2커밋 (설계 문서 + R1 WIP) + 마이그레이션 파일명 정정.
- **WIP — 미검증.** 5개 영역(A–E)을 병렬로 구현했고, 각 영역은 자기 테스트만 통과했다. 통합 typecheck·전체 vitest·build 는 아직 돌리지 않았다.
- **영역 C 는 중간에 중단됐다** (마지막 작업: 신고 큐 페이지의 문구 키 이름 변경 중). 남은 깨진 부분은 §3-1.
- main 병합·배포·DB 적용 없음. PR 없음.

## 2. 구현된 내용 (영역별)
| 영역 | 내용 | 주요 파일 |
|---|---|---|
| A 권한·열람 감사·증거 | 채팅·메신저·통화 Admin API 를 `chats` 권한으로(주문 채팅은 `chats`/`business`), 본문 열람은 GET 안에서 서버 감사(`chat_room.content_view`, 30분 dedupe), 신고·거래·주문 연결 없는 1:1·그룹 = super_admin + 사유 10자, 조치는 사유+CAS(409)+before/after 감사, 하드 삭제 super_admin·`DELETE`·사유·**신고 증거 연결 방 제외**·감사 | `lib/admin/chat-admin/chat-admin-guards.ts`, `chat-content-access-policy.ts`, `chat-room-hard-delete-plan.ts`, `lib/admin-community-messenger/admin-chat-moderation-cas.ts` |
| B 동일 데이터 | 거래 Admin → 사용자 실제 방(CM) 기준 조회·조치(레거시 전용 방은 읽기 전용 표시), 주문 채팅 Admin FK 없는 방 폴백 조회·첨부·상태 표시, Admin 메시지 최신 우선 + 「이전 메시지 더 보기」, 레거시 주문 방 생성 API → 정식 ensure, 상태 전이 시 나간 참가자 재가입 방지(`keep_left`), 도메인 상호 링크 | `lib/admin-chats/trade-messenger-*.ts`, `lib/admin-delivery-orders/store-order-room-lookup.ts`, `lib/admin-community-messenger/admin-message-page.ts`, `room-domain-links.ts` |
| C 메뉴·페이지 (**중단**) | 메뉴 재편 J-AMD-4(채팅 워크스페이스 섹션화), 채팅 신고 단일 큐(`/admin/chats/reported` + `/api/admin/chat/report-queue`), 목록 URL 상태·페이지, 상태 라벨 | `components/admin/admin-menu.ts`, `components/admin/chats/AdminChatReportQueuePage.tsx`, `lib/admin-chat-reports/list-chat-report-queue.ts`, `lib/admin/chat-admin/admin-chat-list-url-state.ts`, `lib/admin/status-labels/chat-status-labels.ts` |
| D 대시보드 | `/admin/messenger` = 지금 처리할 일(신고 3원천·상담 대기) / 운영 위험(24h 푸시 실패·통화 실패·멈춘 통화) / 상태(유형별 활성·보관·정지) / 장기(90일 미사용), 지표 단일 정의, Action Center 채팅 카드 → `/admin/messenger` | `lib/admin/metrics/chat-metrics.ts`, `load-chat-metrics.ts`, `lib/admin/domain-dashboard/load-messenger-domain-dashboard.ts` |
| E 첨부 보안 | 새 업로드 → 비공개 버킷 `messenger-media`(버킷 있을 때만, env `MESSENGER_PRIVATE_MEDIA_BUCKET=off` 롤백), 조회는 `GET /api/community-messenger/rooms/{roomId}/messages/{messageId}/media` (참가자 확인 → 10분 서명 URL, 레거시 공개 파일도 같은 경로), 앱 렌더링 전부 라우트 경유, Admin 은 `ctx=admin` | `lib/community-messenger/media/*`, `lib/community-messenger/server/messenger-media-*.ts`, `app/api/community-messenger/rooms/[roomId]/messages/[messageId]/media/route.ts` |

## 3. 남은 일 (이것만 한다)
1. **영역 C 마무리**
   - 정의 안 된 문구 키: `admin_chat_app_room_th` (AdminChatTable) 등 — typecheck 로 전부 찾아 `lib/i18n/catalog/admin-chat-r1-pages.ts` 에 ko/en 추가.
   - 신고 큐 페이지 문구 키 이름 변경이 중간에 멈췄다 — `AdminChatReportQueuePage.tsx` 와 카탈로그 키 일치.
   - 대시보드가 쓰는 URL 파라미터를 목록이 읽는지 확인: 방 목록 `domain`·`status`·`activity=7d`·`idle=90`, 신고 큐 `status=open&type=messenger|trade_chat|trade_report` (경계는 `chat-metrics.ts` 의 `chatActiveWindowFromIso`·`chatIdleCutoffIso`·`CHAT_REPORT_OPEN_STATUSES` 재사용).
   - 주문 채팅 목록(`AdminOrderChatList`) 폴백 방 표시·returnTo.
2. **알려진 실패**
   - `lib/admin/__tests__/admin-messenger-reference-contract.test.ts` 2건 (배너 문구 계약) — 현재 의도에 맞게 계약 갱신.
   - `npm run verify:call-authority-contract` FAIL — `lib/community-messenger/service.ts` 에 "Room-bound missed is the terminal call_stub Conversation B fact" 문구 없음. **main 에서도 같은지 먼저 확인** (영역 E 는 통화 코드를 건드리지 않았다고 보고). main 도 FAIL 이면 이번 범위 아님.
3. **통합 검증 (최종 HEAD 1회)**: `npm run typecheck:build` · 변경 파일 eslint · `npx vitest run` 전체 · `npm run verify:routes` · `verify:call-messenger-restore-hard-lock` · `verify:call-authority-contract` · `next build` 는 CI 에 맡김.
4. **PR 1개** → CI → main 병합 → Production 반영 확인 (운영 DB 로그로 새 쿼리·오류 확인). 웹 변경만이므로 네이티브 재빌드 불필요.
5. **DB 적용 (Owner 승인 범위 확인 후)**: `supabase/manual-apply-messenger-media-private-bucket.sql` (수동 적용 전용, migrations/ 밖) (비공개 버킷 생성 + RESTRICTIVE 정책, 비파괴). 적용 후 60초 내 새 업로드가 비공개 버킷으로 감 → 이미지·파일·음성 업로드·표시·저장 확인, 문제 시 env `off`.

## 4. 남은 위험 (기록만)
- 기존 첨부 파일은 공개 버킷에 그대로 — 예전 URL 은 여전히 열람 가능. 파일 이전은 별도 승인 마이그레이션.
- 레거시 거래 채팅(`app/api/chat/**`) 이미지 공개 유지.
- 거래 레거시 원장 쓰기(`chat_rooms`·`product_chat_messages`) 계속됨 — 정리는 Owner 결정 O-C5.
- 푸시 실패·통화 실패 지표의 링크 대상 목록 화면 없음 (대시보드에 「목록 준비 중」).
- 운영 `chat_reports` FK CASCADE 여부 미확인 → 신고 연결 방은 하드 삭제 대상에서 아예 제외.
- 메신저 방 목록 API 가 마지막 메시지 미리보기(본문 일부)를 반환 — 고스트 규칙 밖.

## 5. Owner 결정 대기 (설계 §9 그대로)
O-C1 고스트 입장 약관 근거 · O-C4 보존 기간 · O-C5 거래 레거시 정리 · O-C6 레거시 DROP · O-C11 본문 검색. 나머지(O-C2·3·7·8·9·10·12)는 이번 R1 에 Owner 방향대로 반영.
