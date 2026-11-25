# F3 사진·동영상 보내기 — 글 보내기 경로로 합치기 · 실측·설계 (2026-11-25 PHT)

- 지시: Owner 「다음으로 넘어 가자」 → 전체 점검(`full-defect-audit-2026-11-25.md`) §5 순서 2 「F3」.
- 근거: Vercel 관측(동영상 11-25 12건 · 사진 11-16~25 26건) · 코드(main `71a6274`) · 보내기 3a 설계서. 운영 변경 없음.
- 확인: 운영 `/api/app/web-version` = `71a6274` (18:13 PHT) — F1(#594) 포함.

## 1. 실측 — 보내기 1번당 Supabase 호출
| 경로 | 1번당 | 표본 |
|---|---|---|
| 글(1:1) | **49** | 11-22 1건(`::post` 표지) |
| 동영상 | **약 67** | 11-25 12건, 810 |
| 사진 | **68~94** | 11-23 이후 8건 546 · 11-16 주 18건 1,909 |

동영상 1번(12건 평균) 표별 — 글과 차이 나는 것:
| 표 | 동영상 | 글 | 차이 |
|---|---|---|---|
| `community_messenger_rooms` | **10** | 4 | +6 |
| `community_messenger_participants` | **7** | 3 | +4 |
| 홈 목록 사본 즉시 재생성(`home_sync_snapshots` 2 · 사본 RPC 2 · 워터마크 2) | **6** | 사본 바뀜 표시 2 | +4 |
| 사장님 허브 배지(`hub_badge_user_unread_counters` 3 · `get_owner_hub_badge_snapshot` 3) | **약 6** | 글은 알림 효과 안에서 1번 | 약 +4 |
| 저장소 확인(`object/info` 2 · 서명 URL) | 약 3 | 0 | 동영상 고유(유지) |

## 2. 원인 (코드)
| 사실 | 근거 |
|---|---|
| 글은 전송 RPC(`community_messenger_send_text_message`)가 방 정보(종류·도메인·direct_key·받는 사람)를 돌려주고, 알림·방 bump 가 **그 값을 받아 씀**(재조회 없음) · 알림 이벤트는 응답 전 저장 · 푸시는 미리 읽은 값(3a)으로 묶어 보냄 · 사본은 「바뀜 표시」(2단계) | `messages/route.ts` `prefetched`·`known` · `community-messenger-send-post-ack-effects.ts` |
| 사진·동영상은 `appendTypedMessengerMessageAtomic` → 방 도메인을 따로 읽고(`loadRoomDomainForUnreadAuthority`) → **옛 알림 함수** `notifyCommunityMessengerMessageRecipients`(방 다시 읽음 → `notifyMessagePipeline`) → `invalidateOwnerHubBadgeForCommunityMessengerPeers`(받는 사람마다 배지 재계산) → `publishMessengerRoomBumpAfterMutation`(방·참가자 다시 읽음) · 사본 즉시 재생성 | `service.ts` `sendCommunityMessengerImageMessage`·`sendCommunityMessengerVideoMessage` · `messenger-video-upload-send.ts` |
| 3a·2단계 설계가 **글 보내기 경로만** 바꿨다(「통화·읽음·이미지 등 그 밖 호출부 무변경」) — 사진·동영상은 그때 범위 밖 | `message-send-fanout-stage2-design-2026-11-21.md` 181줄 |
- 회귀가 아니라 **범위 밖으로 남은 옛 경로**. 동영상 보내기(#578)가 같은 옛 경로로 새로 붙었다.

## 3. 설계
| 항목 | 내용 | 파일 |
|---|---|---|
| M-1 방 정보 한 번 | 사진·동영상 append 가 이미 읽은 방 도메인(+ `room_type`·`direct_key` 같은 select 에 추가)과 받는 사람을 결과로 돌려줌 → 알림·bump 가 글처럼 `known` 값으로 씀 | `room-unread-authority-rpc.ts` `appendTypedMessengerMessageAtomic` · `service.ts` 두 함수 |
| M-2 알림은 글과 같은 함수 | `notifyCommunityMessengerMessageRecipients` 대신 `runCommunityMessengerSendDurablePreAckEffects`(알림 이벤트 응답 전 저장) + `runCommunityMessengerSendDeferredPostAckEffects`(응답 뒤 푸시 — 3a 미리 읽기·동시 8개) · 미리보기 문구는 지금 문구(사진·동영상) 그대로 · 거래 장부 미러는 글 전용이라 사진·동영상은 끔 | `community-messenger-send-post-ack-effects.ts`(옵션 추가) · 사진·동영상 라우트 |
| M-3 사본 바뀜 표시 | 홈 목록 사본 즉시 재생성 대신 글과 같은 「바뀜 표시」 옵션 | 같은 효과 함수 |
| M-4 허브 배지 | 받는 사람별 재계산 대신 글 경로의 배지 무효화(효과 함수 안 1번) | 같은 효과 함수 |
| 유지 | 업로드 확인(저장소 info·서명 URL) · 멱등(deduped 는 알림 안 함) · 응답 모양 · 업로드 실패 정리 | — |
- 예상: 사진·동영상 1번당 **약 67~94 → 약 50**(글 수준). 추정 — 반영 뒤 실측으로 확인.
- 표지: 사진·동영상 라우트에도 `::post` 표지·받는 사람 단위를 붙여 보내기 단가를 같은 방식으로 잰다.

## 4. 영향·위험
| 항목 | 내용 |
|---|---|
| 바뀌는 동작 | 사진·동영상 알림 이벤트가 **응답 전 저장**으로 바뀜(글과 같음) — 응답이 수십 ms 늦어질 수 있음, 대신 알림 유실 없음 |
| 영향 화면 | 메신저 방 사진·동영상 보내기 · 받는 사람 푸시(Android·iPhone)·알림음·배지·홈 목록 최신 메시지 |
| 실기 확인 필요 | 사진 1장·여러 장·동영상 보내기 → 받는 쪽 푸시 문구·소리·배지 수·목록 갱신 (Android 85 · iPhone 64) |
| 통화 | 무관(통화 코드 무변경) |
| 운영 DB | 변경 없음 |
| 충돌 | 대기 중 #550(보내기 3b)이 같은 효과 함수를 고친다 — 이 작업 뒤 #550 을 다시 맞춘다 |
| 롤백 | Instant Rollback |
| 반영 | 메신저·알림 코드 → 배포 전 보고 · Owner 「병합」 뒤 |

## 5. NOT_PROVEN
- 방 표 10번이 함수별로 몇 번씩인지(관측은 라우트 단위) — 구현 때 시험으로 셈.
- 사진 1번당 값의 폭(68~94)이 장 수 때문인지.

## 6. 구현 (Owner 「구현 승인」 2026-11-25)
| 항목 | 구현 |
|---|---|
| M-1 | 송신 가드(`assertMessengerRoomSendAllowed`)가 이미 읽는 방 행에 `domain_identity_key`·`domain_identity` 2열을 더해 `room` 으로 돌려줌 → 라우트가 `knownRoom` 으로 넘김 → 서비스는 ① 같은 조건의 방·참가자 재확인(사진)·그룹 게이트 방 종류 조회를 건너뛰고 ② `appendTypedMessengerMessageAtomic(knownRoomDomain)` 이 방 조회를 건너뜀(규칙 `roomDomainFromKnown` = DB 조회 규칙과 같음, 안 맞으면 지금처럼 읽음) |
| M-2 | 새 `media-send-fanout.ts` — 글 보내기 라우트 P2 순서 그대로: 배지 target(병렬·`known`) ‖ 알림 이벤트 응답 전 저장(`parallelRecipients`·`deferAutoRead`) → 자동 읽음(target 뒤) → 응답 뒤 방 bump(`publishTextSendRoomBump`·`prefetched`)·푸시(3a 미리 읽기). 효과 함수 옵션 `mediaSend.previewText`: 미리보기는 지금 사진·동영상 문구, 멘션 없음, 엔진 그림자 없음(예전 경로에 없던 것) · 거래 장부 미러 없음(`itemTradeLedgerId: null`) |
| M-3·M-4 | 효과 함수 안 「바뀜 표시」 배지·사본 무효화 1번(받는 사람별 즉시 재생성 제거) |
| 받는 사람 | 전송 RPC `recipient_user_ids` — 운영 함수 정의 확인(19:2x PHT): `user_id <> 보낸 사람 AND left_at IS NULL` = 글 RPC 와 같은 규칙 |
| 예외 경로 | 서비스 클라이언트 없음 → 예전 알림 함수 + 예전 bump · `knownRoom` 없는 호출(파일 등 다른 경로) → 변경 없음 · deduped → 알림 없음(지금과 같음) |
| 표지 | 사진·동영상 라우트 `tagSupabaseCallRequest("post")` · 받는 사람 수 단위 |
| 응답 | 응답 본문에서 내부 `fanout`(받는 사람 목록) 제거 — 응답 모양은 지금과 같음 |
| 시험 | `media-send-fanout-f3.test.ts` 8건 |
