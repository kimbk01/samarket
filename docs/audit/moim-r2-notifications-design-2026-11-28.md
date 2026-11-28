# 모임 R2 — 알림 결함 설계 (2026-11-28 12:17 PHT)

- 지시: Owner 「R2 설계 시작」(2026-11-28). 결정은 Owner 지시 「결정 사항은 권장안을 따른다」(같은 날)로 권장안을 확정해 적는다.
- 범위: 대감사 `docs/audit/moim-grand-audit-2026-11-28.md` §6 R2 = **N-01~N-08, W5**.
  - 같은 알림 문구 키를 바꾸므로 R3 의 U-10 중 **U9-02(리마인드 시각)·U9-03a(초대한 사람 역할)** 는 이 R2 로 옮긴다. 화면인 U9-03b(알림 줄 안 수락·거절)는 R3 에 남긴다.
  - 대감사 §3 P3 의 알림 항목도 이 R2 에서 처리한다. 다른 R 에 배정되지 않았다.
    - 거절 사유를 알림에 넣기
    - 내보내기 알림 중복 키가 분 단위
    - 모임장 변경 알림을 받는 사람
    - 시작 후 나간 사람에게 후기 안내가 감(P10-25)
  - D-2(묶기·멘션) 설계 정정도 알림 문서라서 R2 에 넣는다.
- 기준 코드: main `19720011b`(R1 병합 뒤). 운영 DB 함수 107개 md5 `49430fed…e184` 는 로컬 검증 DB 와 같다. 이 문서에 인용한 함수 정의는 로컬 검증 DB 에서 직접 읽었다.
- 배포 구분: **웹 + DB**. 네이티브 변경 없음, 앱 재빌드 없음.

---

## 0. 계약 원문 (설계 근거)

`docs/design/moim/moim-design-v1-2026-11-12.md`

- §7: 「읽음 처리는 `docs/dibay-notification-read-badge-policy.md` §2 를 따른다. **대상 화면에 들어갔을 때 읽음이 된다.**」
  - 정책 §2: 「`community_activity` | 게시글, 모임, 댓글, 멘션 대상 상세 진입 후」
- §7 표
  - 「`moim_schedule_cancelled` | **확정 참여자** | … | **X**」
  - 「`moim_schedule_reminder` | 확정 참여자」
  - 「`moim_comment` | 글쓴이·멘션 대상」
  - 「`moim_role_changed` | 대상」
  - 「`moim_sanctioned` | 모임장(차단 시 전체 멤버) | … | 필수」
- §7 끝: 「같은 종류의 알림은 묶는다: `dedupe_key` = `moim:{id}:{code}:{target}`」 → D-2 로 「묶기 뺌·멘션 보류」 확정(§6 문서 정정)
- P3: 「거절 → `rejected` + 신청자에게 `moim_join_rejected`(**사유 선택**)」
- P7: 「[역할 변경] → 부모임장 / 운영진 / **멤버** → 대상에게 `moim_role_changed`」
- P10: 「리마인드: 시작 24시간 전과 1시간 전에 **확정 참여자**에게」, 「종료 후 … 참여자에게 후기 작성 안내를 보낸다」
- P14: 「모든 제재는 … **모임장에게 `moim_sanctioned` 를 보낸다(필수 알림 — 사용자가 끌 수 없음)**」. 표에 `content_hide` 가 제재 단계로 있다.
- P15 어드민 삭제: 「소프트 삭제 … 복구할 수 있다」 / 「진행 중인 일정은 자동 취소된다」(종료)
- §8: 「기본정보 **수정** … 모임장에게 알린다」 · 「모든 쓰기 … **당사자에게 알린다**」(대감사 S8-common-notify)
- 승인 시안 U9(`moim-mockup-2026-11-12.html:446-447`)
  - 「토요일 정기 게임 **내일 오후 6시에** 시작해요.」
  - 「BGC 카페 탐방 **운영진 소희님이** 모임에 초대했어요.」

---

## 1. 결함별 원인 (코드로 확인)

| ID | 원인 | 증거 |
|---|---|---|
| N-01 | 리마인드 중복 키가 `moim:{kind}:{scheduleId}:{user}` 라서, 시간을 바꾼 뒤 새 시각 기준 알림이 저장소에서 「중복」으로 버려진다. 일정 수정은 `reminded_*_at` 를 비운다(R1 `moim_schedule_update`). | `cron/moim-schedules/route.ts:68-74` · `moim-notify.server.ts:96` |
| N-02 | `moim_comment_create` 가 글쓴이 id 를 멤버 여부와 상관없이 돌려준다. | `moim_comment_create` 끝 `'post_author_id', v_po.author_id` |
| N-03 | 사용자 라우트가 「멤버」로 내릴 때 보내지 않는다. | `members/[userId]/route.ts:23` `role !== "member"` |
| N-04 | 어드민 쓰기 가운데 알림이 없는 곳이 있다. 일정 취소 대상 목록을 돌려주지 않는 DB 함수도 있다. | 어드민 삭제·복구 `lifecycle/route.ts:22-23`<br>차단 해제 `admin/…/members/[userId]/route.ts:71-73`<br>콘텐츠 숨김·복구·삭제 `content/route.ts:40-50`<br>제재 해제 `sanctions/[sanctionId]/route.ts:21`<br>`moim__close_cleanup` 는 void |
| N-05 | 신고로 콘텐츠를 숨길 때 `moim_sanctioned` 는 모임 단위 단계(`moim_level`)가 있을 때만 보낸다. | `decision/route.ts:142-154` |
| N-06 | 모임 화면에 알림 읽음 호출이 없다. 서버의 읽음 API 도 모임 목적지를 모른다. | 서버 `read-thread/route.ts:13` 의 종류는 `chat_room·trade_room·order·community_post·call` 뿐 |
| N-07 | 문구 오류 3건 | 「{moim}에서 {role}이 됐어요」+「멤버」→「멤버이」(`moim-core.ts:184,25`)<br>24시간 창 = 시작 2~24시간 전인데 제목이 「내일 일정」(`:203`)<br>en 「your report about {moim}」(`:371,373`) |
| N-08a | 행위자를 넣지 않아 차단 관계가 적용되지 않는다. | `sendOne` 에 `sender_id`·`meta.actor_id` 없음 → `append-user-notification.ts:156` 검사가 늘 통과 |
| N-08b | 모임별 설정 조회가 실패하면 기본값(공지·일정 켜짐)으로 보낸다. | `filterMoimRecipientsByPref` `:138-141` 오류 무시 |
| N-08c | 가입 신청자 이름이 비면 「님이 …」가 된다. | `join/route.ts:31` 요청 본문 닉네임만 씀 |
| N-08d | 사용자 경로 내보내기·차단은 활동 멤버가 아니었어도(비회원 차단) 「내보내졌어요」를 보낸다. | `remove/route.ts:21`, `moim_member_remove` 가 `was_active` 를 돌려주지 않음 |
| N-08e | 크론이 먼저 「보냄」 표시를 하고 앱이 나중에 보낸다. 중간에 끊기면 그 리마인드는 다시 오지 않는다. 후기 안내도 `done` 이 된 뒤 한 번만 돌려줘서 같은 위험이 있다. | `moim_schedules_claim_reminders` 가 `update reminded_*` 후 반환 · `moim_schedules_finish_due` |
| N-08f | 일정 취소 알림이 **승인 대기자**에게도 간다. | `confirmed`+`requested`: `moim_schedule_cancel` · `moim_admin_content` · `moim_admin_report_decide` · `close/route.ts:32` |
| W5 | 3번 E1 의 「언어 조회 2회」 보고가 틀렸다. 실제는 50명 단위라 2×⌈N/50⌉회다. E1 이 약속한 초대·위임 요청 라우트도 아직 요청 안에서 보낸다. | `notification-user-language.ts:79-100`, `invites/route.ts:26`, `host-transfer/route.ts:22` |
| P3 | 거절 사유가 알림에 없다. | `join-requests/[requestId]/route.ts:28` vars 는 moim 뿐 |
| P3 | 중복 키가 분 단위라서 같은 분에 두 번 일어나면 두 번째가 버려진다. | 내보내기 `remove/route.ts:26`<br>역할 `members/[userId]/route.ts:28`<br>일정 신청 `join/route.ts:23`<br>일정 승인·거절 `participants/[userId]/route.ts:33` |
| P3 | 시작한 뒤에 나간 사람에게도 후기 안내가 간다. 나가기는 시작 전 일정만 취소한다. | `moim__deactivate_member` `starts_at > now()` · `finish_due` 확정자 전원 |
| U9-02 | 리마인드에 시각이 없다. | `moim-core.ts:204` 「곧 시작해요」 |
| U9-03a | 초대 알림에 초대한 사람의 역할이 없다. | `moim-core.ts:182` |

---

## 2. 같은 규칙 전수 목록 (대감사 §1 재발 방지)

규칙마다 걸린 **모든 경로**를 적었다. ✅ = 지금 맞음 · 🔧 = 이번에 고침 · — = 계약에 없음(하지 않음)

### R-a 받는 사람 = 지금 활동 멤버 (결과를 받는 당사자·신고자는 제외)
| 경로 | 상태 |
|---|---|
| 댓글 → 글쓴이 | 🔧 N-02 (DB: 활동 멤버일 때만 id 반환) |
| 후기 안내 → 확정 참여자 | 🔧 활동 멤버만(새 「보낼 후기」 조회에서 거름) |
| 리마인드 → 확정 참여자 | ✅ 나가면 시작 전 일정 참여가 취소된다(R1 `moim__deactivate_member`) |
| 일정 취소 → 확정 참여자 | ✅ (위와 같음) + 🔧 R-b |
| 가입 신청 → 승인권자 | ✅ `listMoimActorsFor` 활동 멤버 |
| 새 멤버 → 모임장 | ✅ `host_user_id`(R1 이 정합 보장) |
| 일정 신청 → 일정 호스트 | ✅ R1 A-07 이 나간 호스트를 모임장으로 넘김 |
| 공지·새 글·새 일정 → 멤버 | ✅ `listActiveMoimMemberIds` |
| 모임장 변경·종료·차단 → 전체 멤버 | ✅ 활동 멤버 |
| 신고 결과 → 신고자 | ✅ 멤버 여부와 무관(신고자 본인 결과) |

### R-b 일정 취소 알림 = 확정 참여자만
| 경로 | 상태 |
|---|---|
| 일정 직접 취소 `moim_schedule_cancel` | 🔧 `requested` 제외 |
| 어드민 일정 취소 `moim_admin_content` | 🔧 |
| 신고로 일정 숨김(=취소) `moim_admin_report_decide` | 🔧 |
| 모임 종료 `close/route.ts` | 🔧 DB 함수 반환값으로 바꿈(아래 R-f) |
| 어드민 모임 삭제 `moim_admin_delete` | 🔧 새로 보냄(N-04) |
| 계정 정리로 모임 종료 `moim_account_cleanup` | ✅ 다른 멤버가 0명일 때만 종료한다 → 받을 사람 없음 |

### R-c 중복 키 = 그 사건의 고유 값
| 종류 | 지금 | 바꿈 |
|---|---|---|
| 리마인드 24h·1h | 일정 id | 🔧 일정 id + **시작 시각** |
| 내보내기(사용자) | 모임:분 | 🔧 대상:밀리초 |
| 역할(사용자) | 대상:역할:분 | 🔧 대상:역할:밀리초 |
| 일정 신청 | 일정:사람:분 | 🔧 일정:사람:밀리초 |
| 일정 승인·거절 | 일정:분 | 🔧 일정:사람:밀리초 |
| 어드민 역할·내보내기·모임장 지정 | 밀리초 | ✅ |
| 그 밖(가입 신청·초대·위임·공지·글·일정 생성·취소·후기·제재·신고 결과·정보 수정) | 행 id | ✅ |

### R-d 사람이 한 활동 알림 = 행위자 차단 관계 적용 (결과·제재·필수 알림은 적용 안 함)
| 종류 | 행위자 | 상태 |
|---|---|---|
| 가입 신청 `moim_join_requested` | 신청자 | 🔧 |
| 새 멤버 `moim_member_joined` | 가입자 | 🔧 |
| 초대 `moim_invited` | 초대한 사람 | 🔧. 받는 사람이 나를 차단한 경우는 지금도 라우트가 막는다 |
| 공지·새 글 | 글쓴이 | 🔧 |
| 새 일정 | 만든 사람 | 🔧 |
| 댓글 | 댓글 쓴 사람 | 🔧 |
| 일정 신청 | 신청자 | 🔧 |
| 승인·거절·내보내기·역할·위임 요청·모임장 변경·취소·종료·제재·리마인드·후기·어드민 | — | 적용 안 함. 결과·필수 통지라서 내가 차단한 운영진이 한 조치라도 알아야 한다 |

### R-e 발송 = 응답 뒤 (`notifyMoimAfterResponse`)
| 라우트 | 상태 |
|---|---|
| 가입·초대 수락·공지·글·일정 생성·종료·위임 수락 | ✅ |
| 초대 보내기·위임 요청 | 🔧 (W5 — E1 약속) |
| 가입 승인·거절 · 내보내기 · 역할 · 댓글 · 일정 신청 · 일정 승인·거절 · 일정 취소 | 🔧 (같은 규칙) |
| 어드민 라우트 전부(내용·멤버·정보·제재·해제·삭제·복구·미접속 요청·신고 처리) | 🔧 (같은 규칙) |
| 계정 정리 `runMoimAccountCleanup` | ✅. 회원 삭제 흐름 안이라 그대로 기다린다(삭제 뒤에는 보낼 수 없음) |

### R-f 어드민 쓰기 → 당사자 알림 (§8)
| 어드민 쓰기 | 당사자 | 상태 |
|---|---|---|
| 정보 수정 | 모임장 | ✅ `moim_admin_info_updated` |
| 역할 변경 | 대상 | ✅ |
| 내보내기·차단(활동 멤버였을 때) | 대상 | ✅ |
| **차단 해제** | 대상 | 🔧 새 `moim_unbanned` |
| 모임장 지정 | 전체 멤버 | ✅ |
| 미접속 모임장 요청 승인·거절 | 요청자·전체 멤버 | ✅ |
| 일정 취소 | 확정 참여자 | ✅ + R-b |
| **글·댓글·사진 숨김·복구·삭제·삭제 복구** | 작성자 | 🔧 새 `moim_content_moderated` |
| 모임 제재 적용 | 모임장(차단 = 전체) | ✅ |
| **제재 해제** | 모임장(차단 해제 = 전체) | 🔧 새 `moim_sanction_released` |
| **모임 삭제** | 전체 멤버 + 취소된 일정 확정자 | 🔧 `moim_closed` 갈래 `admin_deleted` + `moim_schedule_cancelled` |
| **모임 복구** | 전체 멤버 | 🔧 새 `moim_restored` |
| 신고 처리 | 신고자·모임장·작성자 | ✅ 신고자 + 🔧 콘텐츠 숨김(N-05) |
| 신고 「검토 중」 표시 | — | — 상태만 바뀌고 당사자에게 바뀌는 것이 없다 |
| 카테고리·정책 | — | — 모임 단위 당사자가 없다 |
| (참고) 운영진이 모임 안에서 숨김 | — | — §8 은 어드민 규칙이다. P13 「모임 안 처리」에는 알림 규정이 없다 |

### R-g 읽음 = 알림이 여는 목적지 화면에 들어갔을 때
| 알림 이동 위치(`link_url`) | 화면 | 상태 |
|---|---|---|
| `/moim/{id}` | `MoimDetailScreen`(멤버 홈·공개 페이지 공통) | 🔧 |
| `/moim/{id}/posts/{postId}` | `MoimPostDetailScreen` | 🔧 |
| `/moim/{id}/schedules/{scheduleId}` | `MoimScheduleDetailScreen` | 🔧 |
| `/moim/{id}/manage/requests` | 가입 신청 목록 | 🔧 |
| `/moim/{id}/manage/members` | 멤버 관리 | 🔧 |
| `/moim/invites` | `MoimInvitesScreen` | 🔧 |
| `/moim` (삭제된 모임 알림 — 아래 N-04) | `MoimTabHome` | 🔧 |

### R-h 모임별 설정으로 거르는 곳 = 조회 실패 시 보내지 않음 (끌 수 있는 알림만)
| 호출처 | 상태 |
|---|---|
| 공지·새 글 `posts/route.ts` | 🔧 |
| 새 일정 `schedules/route.ts` | 🔧 |
| 리마인드 크론 | 🔧. 실패하면 보냄 표시를 하지 않아 다음 회차에 다시 시도한다(N-08e) |

---

## 3. 수정 설계

### 3-1. DB 마이그레이션 `20271128230000_moim_r2_notifications.sql` (운영 적용 = Owner 「DB 적용 승인」 뒤)

| 함수·열 | 바꾸는 것 | 결함 |
|---|---|---|
| `moim_comment_create` | 반환 `post_author_id` 를 **글쓴이가 그 모임 활동 멤버일 때만** 넣는다(아니면 null) | N-02 |
| `moim_member_remove` | 반환에 `was_active` 추가(어드민 함수와 같은 규칙) | N-08d |
| `moim_join` | `pending` 반환에 `nickname`(서버가 정한 v_nick) 추가. `moim_invite_respond` 의 승인제 경로는 이 반환을 그대로 넘긴다 | N-08c |
| `moim_schedule_cancel` · `moim_admin_content`(일정) · `moim_admin_report_decide`(일정) | 취소 알림 대상을 `confirmed` 만 | N-08f |
| `moim__close_cleanup` | void → **jsonb** `[{schedule_id, title, user_ids(확정자)}]`. 일정을 취소하기 전에 대상을 모은다. 반환형이 바뀌므로 drop 뒤 다시 만든다. 호출처 3곳은 `perform`/변수로 받는다 | N-04·R-b |
| `moim_close` | 반환에 `notify_user_ids`(활동 멤버) · `cancelled_schedules` 추가 → 라우트가 종료 전에 따로 읽던 조회 3회를 없앤다 | R-b |
| `moim_admin_delete` | 반환에 `name` · `notify_user_ids`(활동 멤버) · `cancelled_schedules` 추가 | N-04 |
| `moim_admin_restore` | 반환에 `name` · `notify_user_ids` 추가 | N-04 |
| `moim_admin_content`(글·댓글·사진) | 반환에 `author_id`(작성자·올린 사람) 추가 | N-04 |
| `moim_admin_sanction_revoke` | 반환에 `level` · `name` · `notify_user_ids`(차단 해제 = 활동 멤버, 그 밖 = 모임장) 추가 | N-04 |
| `moim_schedules_claim_reminders` | **표시하지 않고 고르기만** 한다(`for update skip locked` 유지). 반환은 지금과 같다(`starts_at` 포함) | N-08e |
| 새 `moim_schedules_ack_reminders(p_window, p_items jsonb)` | 보낸 일정만 `reminded_*_at = now()` 로 표시. 같은 `starts_at` 일 때만 표시해서, 그사이 시간이 바뀐 일정은 다음 회차에 새 시각으로 다시 고른다 | N-01·N-08e |
| 새 열 `moim_schedules.review_notified_at timestamptz` | 후기 안내를 보냈다는 표시. 마이그레이션 때 이미 `done` 인 행은 `finished_at` 으로 채운다(옛 일정에 후기 안내가 새로 가지 않게) | N-08e |
| 새 `moim_schedules_reviews_pending(p_limit)` | `done` · 미발송 · 끝난 지 24시간 안 · 모임 활동 중이고 차단 아님인 일정을 고른다. 받는 사람은 **확정 참여자 중 지금 활동 멤버**만 | N-08e·P10-25 |
| 새 `moim_schedules_ack_reviews(p_ids uuid[])` | `review_notified_at = now()` | N-08e |
| `moim_cron_tick` | 결과에 `reviews`(= reviews_pending) 추가. 나머지 단계는 같다 | N-08e |

- 함수 본문은 ASCII 만 쓴다(적용 도구 제약). 권한은 새 함수·반환형이 바뀐 함수 모두 `service_role` 만.
- 운영 데이터 영향: 데이터 수정은 `review_notified_at` 채우기 1건뿐이다. 적용 전에 대상 행 수를 읽기 전용으로 센다(대감사 기준 일정 0건 — 적용 전 다시 확인).

### 3-2. 알림 공용 모듈 `lib/moim/server/moim-notify.server.ts`

| 바꾸는 것 | 결함 |
|---|---|
| `sendOne` 의 `roleVar` 를 `keyVars: Record<string, MessageKey>` 로 넓힌다. 받는 사람 언어로 바꾸고 `notificationCopyMeta.varKeys` 로 저장한다. 역할·콘텐츠 종류(글/댓글/사진)에 쓴다 | N-04·U9-03a |
| `actorId?` 추가. 보내기 전에 **한 번에** 「행위자와 차단 관계(어느 쪽이든)인 받는 사람」을 빼고 보낸다(새 `listBlockedEitherWayAmong` — `user_social_relations` 1회 조회, 기존 `listBlockedByMeIds` 와 같은 SSOT 활성 차단 조건). 받는 사람마다 따로 차단을 묻지 않아 공지 100명에도 추가 호출은 1회다 | N-08a |
| `filterMoimRecipientsByPref`: 조회 오류면 1회 다시 묻고, 그래도 실패하면 **빈 목록**을 돌려준다(경고 로그). 끈 사람에게 가는 일은 없고, 리마인드는 표시 전이라 다음 회차에 다시 시도한다 | N-08b·R-h |
| `notifyMoimJoinRequested(name)`: 이름이 비면 대체 문구 키 `notify_member_fallback_name` 을 `keyVars` 로 넣는다(서버 닉네임이 와도 빈 경우 대비) | N-08c |
| `moimPaths.list()` = `/moim` 추가 | N-04 |
| 리마인드 시각 `formatMoimNotifyStart(lang, iso)` — `Asia/Manila` 기준. ko 「오후 6시」·「오후 6시 30분」, en 「6 PM」·「6:30 PM」. 받는 사람 언어로 만든다 | U9-02 |

### 3-3. 라우트

| 라우트 | 바꾸는 것 | 결함 |
|---|---|---|
| `join/route.ts` · `invites/[inviteId]/route.ts` | 신청 알림 이름 = RPC 반환 `nickname` · `actorId` = 신청자 | N-08c·a |
| `join-requests/[requestId]/route.ts` | 거절 사유가 있으면 갈래 `with_reason` 으로 「사유: {reason}」(최대 100자) · 응답 뒤 발송 | P3·R-e |
| `members/[userId]/remove/route.ts` | `was_active` 일 때만 · 키 대상:밀리초 · 응답 뒤 | N-08d·R-c·R-e |
| `members/[userId]/route.ts` | 「멤버」로 내릴 때도 보냄 · 키 밀리초 · 응답 뒤 | N-03·R-c·R-e |
| `invites/route.ts` | 초대한 사람 역할을 `keyVars.role` 로 · `actorId` · 응답 뒤 | U9-03a·N-08a·W5 |
| `host-transfer/route.ts` | 응답 뒤 | W5 |
| `posts/route.ts` · `schedules/route.ts` | `actorId` = 글쓴이·만든 사람 | N-08a |
| `posts/[postId]/comments/route.ts` | `actorId` = 댓글 쓴 사람 · 응답 뒤(글쓴이 null 이면 안 보냄) | N-02·N-08a·R-e |
| `schedules/[scheduleId]/join/route.ts` | `actorId` · 키 밀리초 · 응답 뒤 | N-08a·R-c·R-e |
| `schedules/[scheduleId]/participants/[userId]/route.ts` | 키 일정:사람:밀리초 · 응답 뒤 | R-c·R-e |
| `schedules/[scheduleId]/route.ts`(취소) | 응답 뒤(대상은 DB 가 확정자만) | R-b·R-e |
| `close/route.ts` | RPC 반환 `notify_user_ids`·`cancelled_schedules` 사용(사전 조회 3회 삭제) · 행위자 제외 | R-b |
| `cron/moim-schedules/route.ts` | ① 리마인드: 고르기 → 설정 거르기 → 보내기 → **보낸 일정만 ack**(1회 호출, 0건이면 호출 없음). 키 = 일정:시작시각. 24h 는 시작 날짜가 오늘이면 갈래 `today`, 내일이면 `tomorrow` + `{time}`<br>② 후기: `tick.reviews` 로 보내고 ack. `finish.done` 은 보내지 않는다(옛 반환은 무시) | N-01·N-08e·U9-02 |
| `admin/…/lifecycle/route.ts` | 삭제: 전체 멤버 `moim_closed` 갈래 `admin_deleted`(링크 `/moim`) + 취소된 일정 확정자 `moim_schedule_cancelled`<br>복구: 전체 멤버 `moim_restored`(링크 모임 홈) | N-04 |
| `admin/moim/content/route.ts` | 글·댓글·사진: 작성자에게 `moim_content_moderated` 갈래 `hidden`·`restored`·`deleted`·`undeleted` + `keyVars.type`(글/댓글/사진) | N-04 |
| `admin/…/members/[userId]/route.ts` | 차단 해제 → 대상 `moim_unbanned`(링크 모임 공개 페이지) | N-04 |
| `admin/moim/sanctions/[sanctionId]/route.ts` | 해제 → `moim_sanction_released` 갈래 = 단계(`unlist`·`warn`·`block`) | N-04 |
| `admin/moim/reports/[reportId]/decision/route.ts` | 콘텐츠 숨김(일정 제외 — 일정은 취소 알림이 간다)이 있으면<br>- 모임장에게 `moim_sanctioned` 갈래 `content_hide`<br>- 작성자(`target_owner_id`, 모임장과 같으면 1번만)에게 `moim_content_moderated` 갈래 `hidden`<br>채팅 메시지 숨김도 같다 | N-05 |
| 어드민 나머지 발송 라우트 | 응답 뒤 | R-e |

### 3-4. 알림 읽음 (N-06)

- 서버 `read-thread`
  - 종류 `moim` 과 이유 `moim_target_opened` 를 추가한다.
  - `threadId` 는 화면 경로다. 허용 형식만 받는다: `/moim`, `/moim/invites`, `/moim/{uuid}`, `/moim/{uuid}/posts/{uuid}`, `/moim/{uuid}/schedules/{uuid}`, `/moim/{uuid}/manage/requests|members`.
- 저장소 `markMoimTargetNotificationEventsRead(user, path)`
  - 읽음 처리 대상: 분류 `community_activity` + `display_payload->>routeUrl = path` + `legacyMeta.kind` 가 `moim_` 로 시작하는 안 읽은 행.
  - 경로가 정확히 같을 때만 읽는다. 모임 홈을 연다고 일정 알림까지 읽음이 되지 않는다.
- 화면: 공용 훅 `useMoimNotificationRead(path)`
  - 위 R-g 의 7곳에서 부른다.
  - 데이터를 다 읽어 화면이 보인 뒤 1회 부른다(정책 §1 「최신 콘텐츠 영역이 로드」).
  - 같은 경로를 60초 안에 다시 열면 생략한다. 기존 `postNotificationThreadRead` 의 single-flight 를 그대로 쓴다.
- 요청량: 화면을 열 때마다 HTTP 1회가 더 생긴다(로그인 확인 + 읽음 갱신 1 + 표적 정리). `read-thread` 는 지금 예산 표에 없는 라우트다. 실측 전 코드 계산값으로 `/api/me/notifications/read-thread` 를 `request-budget.ts` 에 등록하고, 7일 뒤 실측으로 내린다(내리기만).

### 3-5. 알림 종류·문구

**새 종류 4개**
- `moim_unbanned`
- `moim_content_moderated`
- `moim_sanction_released`
- `moim_restored`

등록할 곳:
- `notification-item-registry.ts` 의 `moim` 항목. 소리 키는 같은 항목 공용이다.
- `notification-preference-policy-registry.ts` 의 **필수(끌 수 없음)**. 어드민 조치 결과라서 §7 「결과 = X」 규칙을 따른다.

**새 갈래**
- `moim_closed_admin_deleted`
- `moim_sanctioned_content_hide`
- `moim_join_rejected_with_reason`
- `moim_schedule_reminder_24h_today`·`_tomorrow`. 기존 `_24h` 기본 키는 지우지 않는다. 이미 저장된 옛 알림 행이 그 키로 다시 그려지기 때문이다(§5). 기본 키 문구도 「곧 시작해요」 그대로 둔다.

**문구 (ko / en)** — 영어는 i18n SSOT §4 기준으로 짧게 쓴다.

| 키 | ko | en |
|---|---|---|
| role_changed body | {moim} 내 역할: {role} | Your role in {moim}: {role} |
| reminder_24h_today title/body | 오늘 일정 / {title} 일정이 오늘 {time}에 시작해요 | Meetup today / {title} starts today at {time} |
| reminder_24h_tomorrow title/body | 내일 일정 / {title} 일정이 내일 {time}에 시작해요 | Meetup tomorrow / {title} starts tomorrow at {time} |
| invited body | {role} {name}님이 {moim}에 초대했어요 | {name} ({role}) invited you to {moim} |
| report_result actioned/dismissed body | {moim}에서 신고하신 내용을 검토해 운영 정책에 따라 처리했어요 / … 운영 정책 위반을 찾지 못했어요 | We reviewed your report in {moim} and took action under our policy / … found no policy violation |
| join_rejected_with_reason body | {moim} 가입 신청이 거절됐어요. 사유: {reason} | Your request to join {moim} was declined. Reason: {reason} |
| closed_admin_deleted title/body | 모임 삭제 / 운영 정책에 따라 {moim} 모임이 삭제됐어요 | Group removed / {moim} was removed under our policy |
| restored title/body | 모임 복구 / {moim} 모임이 다시 열렸어요 | Group restored / {moim} is open again |
| unbanned title/body | 가입 제한 해제 / {moim} 모임에 다시 가입할 수 있어요 | You can join again / You can join {moim} again |
| content_moderated hidden·restored·deleted·undeleted | 제목 「콘텐츠 숨김」·「콘텐츠 복구」·「콘텐츠 삭제」·「콘텐츠 복구」 / 본문 「{moim} 내 {type}: 운영 정책에 따라 숨김」·「… 다시 보임」·「… 삭제」·「… 다시 보임」 | Your {type} in {moim} was hidden / restored / removed / restored under our policy |
| sanction_released unlist·warn·block | {moim} 모임의 노출 제한·경고·이용 제한이 풀렸어요 | {moim}: search limit / warning / restriction lifted |
| sanctioned_content_hide | 콘텐츠 숨김 / 운영 정책에 따라 {moim}의 콘텐츠가 숨겨졌어요 | Content hidden / Some content in {moim} was hidden under our policy |
| type 값 키 | 글 · 댓글 · 사진 | post · comment · photo |

- `{role}`·`{type}` 이 들어가는 문장은 받침 유무에 따라 조사가 틀리지 않게 **조사 없는 꼴**로 쓴다(N-07 재발 방지).
- 확정 문장은 구현 때 `check:i18n-quality` 를 통과시키고, 표를 PR 본문에 다시 붙인다.

### 3-6. 문서 정정 (계약은 Owner 결정에 맞춰 고친다)

| 문서 | 정정 |
|---|---|
| 계약 §7 마지막 줄 | 「같은 종류의 알림은 묶는다」 → **「묶지 않는다(알림 저장소가 행을 갱신하지 않음 · D-2). 멘션 알림은 미구현(보류 · D-2)」** · 중복 키 규칙 = 「사건 고유 값」(R-c) |
| 계약 §7 표 | 새 4종과 갈래를 추가한다(받는 사람·필수·이동 위치) |
| 계약 P14 | D-21 (아래) |
| `moim-bundle3-design-2026-11-28.md` E1 | 「언어 조회 2회」 → 「50명 단위 2회(2×⌈N/50⌉)」. 초대·위임 요청은 R2 에서 응답 뒤로 옮겼다고 기록한다(W5) |
| 대감사 문서 §6 | U9-02·U9-03a 를 R2 로 옮긴 사실 |

---

## 4. 결정 (Owner 지시 「결정 사항은 권장안을 따른다」로 확정)

| ID | 충돌·빈칸 | 확정(권장안) | 근거 |
|---|---|---|---|
| D-20 | 시안 U9 「알림 줄 안 수락·거절」 ↔ 알림 목록은 플랫폼 공용 화면(줄 안 동작 없음) | **R3 에서 처리**한다. 이번 R2 는 링크가 초대 화면(수락·거절 버튼 있음)으로 가는 지금 동작을 유지한다. | 플랫폼 화면 변경이라 알림 범위 밖 |
| D-21 | P14 「모든 제재 → 모임장」 ↔ 멤버 1명 이용 제한(`user_restrict`)을 모임장에게 알리면 다른 사람의 제재 사실이 드러난다 | **이용 제한은 제한받은 본인에게만** 알린다(지금 커뮤니티 제재 알림). 모임장 본인이 제한받으면 그것이 모임장 알림이다. 계약 P14 에 이 예외를 적는다. | 상대에게 조치 내용을 알리지 않는 P13 원칙 |
| D-22 | 어드민 조치 결과 새 4종을 끌 수 있는가 | **끌 수 없음(필수)**. 다른 결과 알림(승인·거절·내보내기·제재)과 같다 | §7 「결과 = X」 |
| D-23 | 모임장 변경 알림 받는 사람이 경로마다 다르다(사용자 수락 경로만 새 모임장 제외) | **「전체 활동 멤버 − 그 일을 한 사람」 한 규칙**으로 확정한다. 사용자 수락 = 새 모임장이 한 일이라 제외. 어드민·미접속 승인·탈퇴 위임은 사람 행위자가 없어 새 모임장도 받는다. 코드는 이미 이 규칙과 같다 → 문서에만 적는다 | 대감사 P3 「경로마다 다르다」의 실제 차이는 행위자 제외 하나뿐(코드 확인) |
| D-24 | 삭제된 모임 알림의 이동 위치(모임 홈은 404) | **모임 탭 `/moim`** | 404 로 보내지 않는다 |

---

## 5. 깨질 수 있는 것과 같은 단계에서 처리

| 바뀌는 것 | 영향받는 곳 | 처리 |
|---|---|---|
| `moim__close_cleanup` 반환형 | `moim_close`·`moim_admin_delete`·`moim_account_cleanup` | 같은 마이그레이션에서 세 함수를 다시 만든다 |
| 리마인드 표시 시점 | **DB 적용 ~ 웹 병합 사이**: 옛 코드는 ack 를 하지 않으므로 같은 일정이 10분마다 다시 골라진다 | 옛 코드의 중복 키(일정 id)가 같아 **저장소가 버린다**. 푸시도 다시 가지 않는다(중복이면 발송 안 함 — `append-user-notification.ts` `created.duplicate`). 대신 크론 1회당 고르는 비용이 생긴다. → 적용과 병합 사이를 짧게 둔다(아래 순서) |
| 후기 안내 | 옛 코드는 `finish.done` 으로 보낸다 | 새 열은 적용 때 채우고, 새 코드는 같은 키(일정 id)를 쓴다 → 옛 코드가 보낸 것은 새 코드가 다시 보내도 버려진다 |
| `moim_comment_create` 반환 null | 댓글 라우트만 사용(확인) | 라우트가 null 이면 보내지 않는다 |
| `moim_join` 반환 필드 추가 | 가입·초대 수락 라우트, 화면 | 필드 추가만이라 기존 사용처는 영향 없다 |
| 리마인드 문구 갈래 추가 | 이미 저장된 옛 알림 행의 `titleKey`(`_24h` 기본 키) | 기본 키를 남기고 새 갈래만 추가한다 → 옛 행도 그대로 그려진다 |
| `read-thread` 새 종류 | 다른 종류는 그대로 | 새 분기만 추가 |
| 설치된 앱 | 웹·서버만 바뀜 | 앱 재시작만 |

**적용 순서:** ① 마이그레이션 운영 적용(「DB 적용 승인」 뒤) → ② 바로 PR 병합(「병합」 뒤). 리마인드가 다시 골라지는 기간 = ①~② 사이뿐이고, 저장소 중복 키로 사용자에게는 영향이 없다.

---

## 6. 검증 계획

| 구분 | 내용 |
|---|---|
| 로컬 DB (PG17, R1 반영본) | 시나리오 B-01~B-14 적용 전·후<br>- 댓글 글쓴이가 나간 뒤 null<br>- 비회원 차단 `was_active=false`<br>- 취소 대상에서 대기자 제외(4경로)<br>- 종료·삭제가 `cancelled_schedules` 반환<br>- 리마인드 ack 전에는 다시 골라짐, ack 뒤에는 안 골라짐, 시간 변경 뒤 새 시각으로 다시 골라짐<br>- 후기 pending → ack, 나간 확정자 제외, 차단 모임 제외<br>- `moim_join` 의 nickname<br>- 제재 해제 반환 |
| 동작 시험 (vitest) | 대감사 R5: 문자열 대조가 아니라 동작<br>- 알림 모듈: 행위자 차단 거르기 1회 조회, 설정 조회 실패 → 빈 목록, keyVars 언어 변환<br>- 리마인드 시각 문구(오늘/내일, ko·en, 마닐라 시간)<br>- 크론: ack 는 보낸 것만, 0건이면 호출 없음<br>- 라우트: 멤버로 내림 알림, was_active false 미발송, 사유 갈래, 응답 뒤 발송<br>- 읽음: 경로 검증·정확히 같은 경로만 |
| 코드 검사 | `typecheck:build`·`typecheck:test`·`check:i18n-quality`·`test:ci`(백그라운드)·변경 파일 eslint 전후 비교·`verify:native-version-bump` |
| 독립 재감사 | 이 설계 체크리스트와 대감사 G4·G5 알림 행을 다시 대조한다(변경분만 보지 않음 — 대감사 R6) |
| 운영 (적용 뒤) | 함수 md5·권한·새 열 확인(읽기 전용) |
| NOT_PROVEN 으로 남는 것 | 실제 푸시 도착·벨 읽음 표시(실기기)<br>운영 리마인드 발송: 운영 일정 0건이라 발생 전에는 확인할 수 없음<br>`read-thread` 실측 요청량 |

---

## 7. 남는 위험 (숨기지 않음)

| 위험 | 이유 | 대응 |
|---|---|---|
| 리마인드 시각 `{time}` 은 받는 사람 언어로 만든 글자라서, 받은 뒤 앱 언어를 바꾸면 그 줄만 원래 언어 시각 표기로 남는다 | 저장 문구 다시 그리기(`varKeys`)는 키만 바꿀 수 있다 | 시각 숫자는 같다. 범위 밖 개선으로 기록한다 |
| 한 회차 안에서 보내는 도중 끊기면 일부 사람만 받고 ack 되지 않는다 | 다음 회차에 다시 보낸다 — 이미 받은 사람은 중복 키로 버려진다 | 유실 없음(중복도 없음) |
| 읽음 호출이 화면 열 때마다 1회 늘어난다 | 정책 §2 를 따르기 위한 최소 호출 | 60초 생략 · 예산 등록 · 7일 실측 |
| 멘션 알림 없음 | D-2 보류 | 계약에 「미구현」으로 적는다 |
