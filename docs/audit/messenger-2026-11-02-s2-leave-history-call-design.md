# 메신저 S-2 — 1:1 나가기·재참가 기록 하한 · 나간 방 통화 · 삭제 방 문구 (상세 설계서 · 2026-11-02)

> **구분:** 설계만 · 코드 변경 없음 · **Owner 승인 후 구현**. DB 함수·정책 변경(운영 적용)과 통화 코드 변경이 들어 있어 규정상 각각 승인이 필요하다.
> **기준:** Production `bf8344405` · `origin/main` 코드 전수 추적 · 운영 DB `ckdosyydvgzqwpbwuhon` **읽기 전용** 조회(2026-11-02 PHT).
> **기준 앱:** Owner 지정 텔레그램(§14-2) + 카카오톡. 선행 문서 `messenger-2026-11-02-remaining-risk-design.md` §9(S-1).

## 0. S-1 뒤 남은 위험 3건 — 무엇이고 왜 생기나

| # | 남은 위험 | 근본 원인 | 기준 앱 |
|---|---|---|---|
| H | 나갔다가 다시 참가한 사람이 **나가기 전 대화를 전부 다시 본다** | 나가기 = 참가 행 삭제. 메시지 읽기 경로에 「이 사람에게 어디부터 보여 줄지」 하한이 없음 | 카카오: 나가면 내 대화 삭제, 상대가 보내면 새 메시지부터. 텔레그램 「나만 삭제」도 내 기록만 지움 |
| C | 상대가 나간 방에서 **통화 버튼이 막힘** (상대가 다시 참가하기 전까지) | 통화 권한(`direct-call-permission.ts` `evaluateRoomGate`)과 통화 시작(`service.ts` `resolveRoomContextForCallSessionStart`)이 「상대가 참가자」를 요구 | 카카오: 나간 상대에게도 통화 가능, 통화 기록과 함께 방이 다시 생김 |
| D | 삭제된 1:1 방 사유가 **그룹용 문구** 「이 그룹은 더 이상 사용할 수 없습니다.」 | 서버 코드 `room_deleted` 를 그룹 문구에 묶어 둠 | — |

**운영 데이터 (읽기 전용):**
- 상대가 나간 일반 1:1 방 **11개** (S-1 보고의 「13」은 방 키 형식 필터 차이 — 정정). 마지막 활동 2026-06~10.
- 나갔다가 다시 참가해서 지금 **나가기 전 기록을 보고 있는 사람 15명 / 13개 방** (`joined_at` 이후보다 앞선 메시지 존재).
- 참가 행 `cleared_at` 열: **운영에 있으나 마이그레이션 파일에 없음(스키마 불일치)**, 값 0행, 쓰는 코드 0곳, 읽는 곳 1곳(사진 자동 저장 후보). 「대화 지우기」용으로 만들어 두고 쓰지 않은 열.

---

## H. 기록 하한 (Telegram 「Clear history for me」 구조)

### H.1 결정

- **하한 열 = 기존 `community_messenger_participants.cleared_at` 재사용.** 의미 「이 사람에게는 이 시각 이후 메시지만 보인다」. 새 열을 만들지 않는다(이미 운영에 있고, 사진 자동 저장이 같은 의미로 읽고 있음).
- **언제 채우나:** 일반 1:1 에서 참가 행이 **다시** 생길 때(`ensureDirectMessengerRoomParticipantsForPair` 의 INSERT·`left_at` 되살림)만, 그리고 그 방에 이미 메시지가 있을 때만 `cleared_at = now()`. 새 방은 null(전체 기록).
- **기존 사용자:** 15명은 `cleared_at` 이 null 이라 **지금 보이는 기록 그대로**(소급 변경 없음). 하한은 배포 뒤 새로 나갔다가 돌아오는 사람부터 적용.
- **나가기 확인 문구**를 기준 앱과 같게: `cm_ui_leave_confirm_direct` 「대화를 나가면 내 목록에서만 삭제됩니다.」 → 「나가면 내 대화 내용과 목록에서 삭제됩니다. 상대방의 대화는 그대로 남습니다.」

### H.2 판단이 필요한 한 가지 — 규정으로 결정

`ensureDirectMessengerRoomParticipantsForPair` 는 「나가서 지워진 행」과 「경합으로 빠진 행 복구」를 구분하지 못한다(svc:10727 주석). **결정: 행이 없으면 나간 것으로 본다.** 근거: 경합으로 행이 빠지는 경우는 방을 만드는 순간(메시지 0건)이라 「메시지가 있을 때만 하한」 조건에 걸리지 않는다. 운영 11개 방이 모두 나가기 흔적인지는 데이터로 구분할 수 없다(확인 못 함) — 다만 이 방들은 지금 상대에게 아무것도 전달되지 않는 상태라, 하한이 걸려도 현재 보이던 것을 빼앗지 않는다.

### H.3 바꾸는 곳 (전수 15곳 · `origin/main` 기준 줄 번호)

**서버 TS (웹)**
| # | 위치 | 변경 |
|---|---|---|
| 1 | svc:15452 `loadCommunityMessengerRoomSnapshotUncached` | 내 참가 행(이미 읽음)의 `cleared_at` 이후 메시지만 |
| 2 | svc:16584·16597 `…MessagesBefore` | 기준 메시지가 하한 이전이면 빈 목록, 목록에 하한 조건 |
| 3 | svc:16714 `…MessagesLatest` | 하한 조건 |
| 4 | svc:17013 `getCommunityMessengerRoomMessageById` | 하한 이전이면 `not_found` |
| 5 | svc:17101 답장 대상 · svc:18752·18812·18922·19028·19106 (숨기기·삭제·수정·반응·반응자) | 하한 이전 메시지면 `not_found` |
| 6 | svc:19173 음성 재생(`/audio` 라우트) · `messages/[messageId]/media/route.ts:73` | 하한 이전이면 403 |
| 7 | `messenger-image-auto-save-candidates.server.ts:43` | 이미 `cleared_at` 사용 — 변경 없음(자동 반영) |
| 8 | `getCommunityMessengerSingleRoomSummaryForViewer`(home-summary) | 방 미리보기 시각이 하한 이전이면 미리보기 비움 |
| 9 | 답장 인용 표시: 메시지 목록 조립 | 인용 원문이 하한 이전이면 인용을 「이전 메시지」로 대체(옛 내용 노출 방지) |

**DB 함수·정책 (마이그레이션 1개 · 운영 적용 Owner 승인)**
| # | 대상 (최신 정의) | 변경 |
|---|---|---|
| 10 | `community_messenger_room_messages_after` (`20270505121000:31`) | `created_at >= coalesce(p.cleared_at, '-infinity')` |
| 11 | `community_messenger_send_text_message` (`20270414160000:118`) | 답장 대상이 보낸 사람 하한 이전이면 `reply_not_found` |
| 12 | `community_messenger_bootstrap_rooms` · `…_bootstrap_lite_my_rooms_bundle` | `r.last_message_at < p.cleared_at` 이면 미리보기 null |
| 13 | RLS `community_messenger_messages_member_policy` (`20261207120000:388`) | 일반 참가 조건 + `created_at >= coalesce(cleared_at, '-infinity')` → 실시간 이벤트로 옛 메시지 수정·삭제가 전달되지 않음 |
| 14 | `dibay_cm_canonical_unread_count` (`20270505122000:81`) | `joined_at` 기준을 `greatest(joined_at, coalesce(cleared_at, joined_at))` 로 |
| — | `cleared_at` 열 | `add column if not exists` 로 마이그레이션 파일에 명시(운영은 무변경 — 스키마 불일치 해소) |

**기기 (웹)**
| # | 위치 | 변경 |
|---|---|---|
| 15 | `messenger-home-room-leave-client.ts:88` | 나가기 성공 시 IndexedDB 방 스냅샷 `invalidateLocalRoomSnapshot`(현재 호출 0곳) 호출 — 7일간 옛 메시지가 다시 그려지던 것 방지 |

**하한 설정:** svc:10772(`left_at` 되살림) · svc:10782(INSERT) — 일반 1:1 + 방에 메시지가 있을 때 `cleared_at = now()`.

### H.4 영향·위험

- 보낸 사람(남은 사람)은 하한이 없어 기록 그대로. 나간 사람은 돌아오면 새 메시지부터(기준 앱과 동일).
- 그룹·거래·주문 방: 하한 설정 조건이 「일반 1:1」뿐이라 `cleared_at` 이 null → 모든 필터가 무동작.
- 성능: 모든 필터는 이미 읽는 내 참가 행 값 1개 비교. RLS 는 `(room_id, user_id)` 고유 인덱스 조회 — 실시간 이벤트당 1회. 배포 전 `explain` 확인 항목.
- 구 바이너리: 웹·서버·DB만. 네이티브 무변경.
- 롤백: 웹 커밋 되돌림 + 함수·정책 이전 정의 재적용(마이그레이션 파일에 이전 정의 보존). `cleared_at` 값은 남아도 필터가 없으면 무동작.

---

## C. 상대가 나간 방에서 통화 (통화 변경 규정 적용 · 단독 커밋)

### C.1 현재 (코드 확인)
- 방 안 통화 버튼: 스냅샷 통화 판정 `canStartDirectCallBetweenUsers` → `evaluateRoomGate` 가 `!calleeIsParticipant` 면 `deny_room_state_mismatch` (`direct-call-permission.ts:265`).
- 서버 시작: `resolveRoomContextForCallSessionStart` 가 참가자에서 상대를 찾음 → 없으면 null → `room_not_found` (svc:19660·20072).
- 친구 목록·재발신은 방을 먼저 되살리고 걸기 때문에 이미 된다.

### C.2 변경
| # | 위치 | 변경 |
|---|---|---|
| C-1 | `direct-call-permission.ts` `loadRoomParticipantContext`·`evaluateRoomGate` | 방 키가 일반 1:1 pair 이고 상대가 그 키에 있으면 「상대 미참가」를 거부하지 않음(차단·거절·계정 제한·공개범위 판정은 그대로 먼저) |
| C-2 | svc `resolveRoomContextForCallSessionStart` | 참가자에 상대가 없으면 `generalDirectKeyPeerUserId` 로 상대 |
| C-3 | svc 통화 시작(권한 통과 뒤 · 세션 INSERT 전) | 상대 미참가면 S-1 의 `readmitLeftGeneralDirectPeerForSend` 로 상대 되살림 → 이후 세션·푸시·통화 기록·부재중 알림이 지금과 같은 방으로 감 |

### C.3 영향 분석 (규정 3번)
- **바뀌는 동작:** 상대가 나간 일반 1:1 에서 통화 시작 허용. 상대 수신 경로(VoIP·FCM·CallKit·수신 화면)·취소·거절·종료·부재중·통화 기록은 **코드 무변경** — 상대가 참가자로 되살아난 뒤 기존 경로를 탄다.
- **H 와의 관계:** 되살릴 때 `cleared_at = now()` → 상대는 통화 기록부터 보임(카카오와 같음).
- **구 바이너리:** 서버만 변경. 수신 푸시 형식 동일. 설치 버전 확인 필요(`user_devices.app_version` 조회는 구현 직전).
- **회귀 위험:** 권한 판정 조건 추가 → 테스트로 「참가자 둘 다 있음」「그룹」「거래·주문 키」「차단」 기존 결과 불변 고정.
- **롤백:** 단독 커밋 되돌림.
- **실기기 행렬:** Android↔iPhone — ① B 나감 → A 방에서 음성 발신 → B 수신·연결·종료, B 목록에 방 재등장(통화 기록부터) ② 영상 동일 ③ B 나감 + B 가 A 차단 → 발신 거부 ④ 기존 정상 1:1 음성·영상 발신·수신·거절·취소·부재중 무회귀 ⑤ 종료 직후 재발신.

---

## D. 삭제된 방 문구

`messenger-room-action-error-messages.ts:110` `room_deleted` → 새 키 `nav_messenger_room_deleted_error` 「삭제된 채팅방이라 메시지를 보낼 수 없습니다.」. `group_deleted` 는 그룹 문구 유지. 웹 1파일 + 문구 2줄.

---

## 반영 단위

| 단계 | 내용 | 승인 필요 |
|---|---|---|
| S-2a | H(웹 1~9·15) + D + 마이그레이션 **파일** | 구현 승인 |
| S-2b | 마이그레이션 **운영 적용**(10~14) — S-2a 배포 직후 | **DB 적용 승인** |
| S-2c | C (통화 단독 커밋) | **통화 변경 승인** |

S-2a 는 S-2b 적용 전에도 깨지지 않는다(웹 필터는 `cleared_at` 이 null 이면 무동작, 운영에 열이 이미 있음).

**로컬 검증:** typecheck 2종 · 관련 vitest(하한 필터·하한 설정·통화 권한 회귀) · eslint · 마이그레이션 SQL 문법(로컬 파싱).
**실기기 (H):** B 나감 → A 보냄 → B 방에 새 메시지만 · 옛 메시지 id 로 이전/이후 조회 0건 · A 가 옛 메시지 수정해도 B 화면 무변화 · B 나가기 직후 다시 열어도 옛 화면 안 그려짐 · 정상 1:1·그룹·거래·주문 기록 무변화.

---

## 구현 기록 (Owner 「S-2 전체 승인」 2026-11-02)

**발견:** 운영 방 첫 화면 RPC `get_community_messenger_room_bootstrap_snapshot` 은 이미 `created_at > cleared_at` 로 거르고 있었다 — `cleared_at` 은 원래 기록 하한으로 설계된 값이고 다른 경로만 빠져 있었다. 모든 경로를 같은 규칙(`>`)으로 맞췄다.

**설계와 다르게 한 것(같은 결과 · 위험 축소):**
- 답장 대상 확인(#11)을 1만 자 텍스트 전송 RPC 대신 그 RPC 를 부르는 유일한 서버 경로(`sendCommunityMessengerMessage`)에서 한다(`assertReplyTargetVisibleToSender`).
- 목록 미리보기(#12): critical·full·home-sync 스냅샷이 모두 lite 묶음 함수를 거치므로 lite 함수만 바꿨다(`community_messenger_bootstrap_rooms` 는 방 id 만 받아 보는 사람을 몰라 서버 요약에서 처리).
- 추가: 답장 메시지 실시간 bump 는 받는 사람 중 하한이 있으면 메시지 스냅샷을 빼고 보낸다(인용 원문 노출 방지 → HTTP 정합).
- 기록 하한 시각은 재참가 시각 −1초(바로 뒤 저장되는 메시지가 시계 차이로 가려지지 않게).
- 삭제 방 문구는 그룹 초대·가입에서도 쓰이므로 「삭제된 채팅방입니다.」(중립).

**S-2b 운영 적용:** 2026-11-02 15:3x PHT · `20271102130000_cm_direct_rejoin_history_floor` · 한 트랜잭션 · 확인: 함수 3개 정의 반영 · 정책 USING/WITH CHECK · 마이그레이션 기록 1행 · `cleared_at` 0행(현재 화면 무변화) · 실사용자로 lite·critical 실행 정상.

**확인 못 함:** phase11b `loadLatestMessagesByRoomIds`(시범 경로) 운영 사용 여부 — 이번에 바꾸지 않음.
