# 삭제된 그룹이 대화 목록에 남는 결함 — 원인 확인·설계안 (2026-11-14 PHT)

판정: **FAIL** — 방장이 삭제한 그룹이 다른 참여자(와 재설치·새 기기의 방장) 대화 목록에 계속 나오고, 누르면 「존재하지 않거나 접근할 수 없는 정보입니다」 후 목록으로 돌아간다.

## 0. 작업자 문제 먼저
- 그룹 감사 세션(2026-11-13)이 시험 그룹 「q테스트1」(dccc805f, 방장 zxzx11, 멤버 q테스트1)을 만들고 13:14:27 PHT 삭제했다. 확인은 **삭제한 방장 기기만** 보고 「목록에 없음」으로 적었다(`docs/design/group-chat-d15-d16-design-2026-11-13.md` 145행). 멤버 q테스트1 의 목록은 확인하지 않았다 → 이번 결함을 그때 놓쳤다.
- 2026-07-31 S2-4 구현(145492517)의 테스트는 원본 문자열·클라이언트 병합만 검사하고, **서버 목록이 삭제 방을 빼는지는 한 번도 검사하지 않았다**.

## 1. 실기 증거 (Samsung SM-M156S · 1.2.6(52) · q테스트1 · 운영 · 03:19~03:21 PHT)
| 방 | 결과 |
|---|---|
| 1:1 BK | PASS 열림 |
| 모임 그룹 Close days test (삭제 안 됨) | PASS 열림 |
| 일반 그룹 테스트 (삭제 안 됨) | PASS 열림 |
| 삭제된 그룹 q테스트1 | FAIL 재현 |
| iOS 그룹방 | NOT_PROVEN (시도 안 함) |

증거 파일: 공유 노트 폴더 `android-room-open-tests-0319/`.

## 2. 원인 (코드·운영 DB 로 확인)
| # | 확인 내용 | 근거 |
|---|---|---|
| C1 | 실제 운영 목록은 DB 함수 2개가 방 목록을 만든다: `community_messenger_bootstrap_lite_my_rooms_bundle`(home-sync·critical·full 스냅샷·`?lite=1`), `community_messenger_bootstrap_my_room_ids` + `community_messenger_bootstrap_rooms_v2`(full 목록·공유 대상) | `service.ts` fetchMyRoomsPayload 3585·3761행, 운영 pg_proc 호출 관계 조회 |
| C2 | 세 함수 모두 `deleted_at` 으로 거르지 않고 응답에도 넣지 않는다 | 운영 함수 정의 조회 (`rooms_v2` 반환 열에 deleted_at 없음). q테스트1 로 lite bundle 호출 → dccc805f 포함, deleted_at 키 없음 |
| C3 | S2-4 는 `deleted_at` 을 **테이블 직접 조회(함수가 없을 때만 쓰는 대체 경로)** 에만 추가했다. 운영이 실제로 쓰는 함수는 바꾸지 않았다 → 서버 쪽 목록 제외는 **처음부터 동작한 적이 없다** | `git show 145492517 -- lib/community-messenger/service.ts` |
| C4 | 그래서 클라이언트 제외 조건(`communityMessengerRoomIsInboxHidden`·`resolveMessengerHomeBucket`, deletedAt 기준)이 늘 null 을 받는다 | `types.ts` 261행, `inbox-pipeline/classification.ts` |
| C5 | 23~36분 뒤 들어간 414c57ae4·18d3a8993 는 서버를 고치지 않고 **기기별 localStorage 삭제 목록(tombstone) + 실시간 제거**로 덮었다. 삭제 순간 앱이 켜져 있던 기기·방장 기기에서만 사라지고, 앱이 꺼져 있던 멤버·재설치·새 기기에서는 다시 나온다 = **클라이언트 땜빵이 유일한 제외 수단**이 됨 | `group-delete-list-tombstone.ts`(localStorage `cm.group_deleted_room_ids.v1`), 테스트가 「서버는 이미 뺀다」를 전제로 작성(stale-list 테스트 100행) |
| C6 | 방 진입은 서버가 삭제 방을 거부한다(정상) → 목록에는 보이는데 들어가면 쫓겨나는 불일치 | `service.ts` 15524행, `CommunityMessengerRoomBootstrapGate.tsx:251` |

영향(운영 DB 03:18 PHT): 삭제됐는데 목록에 남는 참여 행 16행·4명 (q테스트1 6 · 메인관리자 5 · bbbb 4 · zxzx11 1). 같은 원인으로 **공유·전달 대상 목록**(`lib/community/share/list-community-share-targets.ts`)에도 삭제 그룹이 나올 수 있다 — 전송은 서버 송신 가드가 `room_deleted` 로 막음 (화면 표시는 NOT_PROVEN).

## 3. 「최근 변경이 섞여 들어온 것인가」 확인
| 변경 | 목록·삭제 처리 영향 | 판정 |
|---|---|---|
| #279 그룹 읽음 수 (11-14) | 파일 4개(읽음 수 조회)만 | 무관 |
| #286 메시지 전달 S6 (11-14) | 공유 대상에 `forwardable` 필드만 추가. 목록 함수 무변경 | 무관 (같은 결함을 물려받을 뿐) |
| d3f8cdcc7 그룹 사진 (11-13) | lite bundle 에 `avatar_url` 1필드 추가만 (마이그레이션 문장 대조) | 무관 |
| 20271108200100 B3 (11-08) | 목록 함수 3개에 `last_message_meta` 추가만, deleted_at 언급 0 | 무관 |
| 이동 잠금 `cm-deep-route-navigation-lock` | 메모리 값·2.5초 만료, 목록 이동은 항상 허용. 로그 `blocked_navigation` 은 되돌아간 뒤의 진단 기록 | 무관 |

→ 최근 작업이 몰래 바꾼 것은 없다. **2026-07-31 S2-4 의 설계 누락(C3)과 그것을 클라이언트로 덮은 땜빵(C5)** 이 원인이다.

## 4. 설계안 (원인별 · DB 만 · 앱 코드·네이티브 무변경)
계약: S2-4 커밋 「list/badge exclusion」, `communityMessengerRoomIsVisibleInMainChatInbox` 주석 「보관·차단 숨김·삭제 제외」 — 삭제 그룹은 목록에서 빠지는 것이 계약. 참여자·메시지 행은 보존(계약 「Preserve participants, messages」) → 행은 건드리지 않는다.

### D1 (C2·C3 해결) 목록 원천 함수 2개에 삭제 방 제외
- `community_messenger_bootstrap_lite_my_rooms_bundle`: `ranked` 의 조건 `and p.blocked_hidden_at is null` 뒤에 `and r.deleted_at is null` 추가.
- `community_messenger_bootstrap_my_room_ids`: `WHERE p.user_id = p_user_id` 뒤에 `AND r.deleted_at IS NULL` 추가. (rooms_v2 는 이 id 만 받으므로 따로 고치지 않음)
- 방식: 11-13 `20271114100000` 과 같은 「운영 정의를 읽어 정확한 문장 1회만 교체, 1회가 아니면 중단」 마이그레이션 1개.
- 이 두 함수를 감싸는 `get_community_messenger_home_sync_snapshot`·`get_cm_bootstrap_critical_snapshot`·`get_cm_bootstrap_full_snapshot` 와 공유 대상 목록이 자동으로 따라간다(호출 관계 운영 조회).
- 영향: `membership_total_count` 가 삭제 방만큼 줄어든다(보관함 숫자 등은 이미 deleted 제외 기준 — `countViewerArchivedRoomsForCritical`). home-sync 스냅샷 표는 TTL 5초라 옛 행이 곧 바뀐다.
- 구 앱 호환: 응답 모양 변화 없음(행만 빠짐) → 설치된 1.2.6(52)·iOS 구 빌드 그대로 동작.
- 롤백: 같은 방식으로 추가한 조건 문장을 되돌리는 replace.

### D2 (C5 정리) 클라이언트 tombstone 은 그대로 둔다
- 서버가 빼면 tombstone 은 「삭제 직후 화면에서 즉시 지우기」 역할로만 남는다. 지금 지우면 삭제 순간 화면 반영이 늦어지므로 이번 단계에서 바꾸지 않는다(변경 범위 최소).

### 검증
1. 코드: 마이그레이션 문장 대조 계약 테스트 1개(두 함수에 deleted 조건 존재), 관련 vitest·typecheck.
2. 운영 DB(적용 후, 읽기): q테스트1 로 두 함수 호출 → dccc805f 없음, 삭제 안 된 방 개수 변화 없음; 16행 대상 4명 모두 제외 확인.
3. 실기: Samsung q테스트1 목록에 「q테스트1」 그룹 없음 + 다른 방 3개(1:1·모임·일반 그룹) 열림 재확인. iOS·방장 기기는 NOT_PROVEN 으로 남기거나 가능하면 확인.

### 승인 필요
- 운영 DB 함수 변경이라 Owner 승인 후 적용(AGENTS.md 개발 프로세스 2번). 통화 경로 무관.

## 5. D1 적용 결과 (Owner 「D1 진행」 2026-11-14)
- 마이그레이션 `20271115010000_cm_room_list_exclude_deleted_groups.sql` + 계약 테스트 `group-room-delete-server-list-exclusion.test.ts`.
- 운영 시험 실행(트랜잭션 후 rollback, 03:28 PHT): q테스트1 목록 319 → 313 (삭제 그룹 6개 제외), rollback 후 319 복귀.
- **운영 DB 적용 03:29:17 PHT** — 단일 트랜잭션 + `schema_migrations` 기록. 적용 전 정의 백업과 적용 후 정의 diff = 함수마다 조건 1줄 추가만. EXECUTE 권한 변화 없음(postgres·service_role).
- 적용 후 운영 조회: 대상 4명(q테스트1 313 · 메인관리자 108 · zxzx11 157 · bbbb 24) 목록 함수 결과에 삭제 방 0개.
- 실기 (Samsung SM-M156S · 1.2.6(52) · q테스트1 · 운영 · 03:30~03:31 PHT, 앱 강제 종료 후 재시작): 대화 목록에 「q테스트1」 그룹 없음 — PASS. 1:1 BK·선양소주, 일반 그룹 테스트, 모임 그룹 Moim topic test 모두 열림 — PASS. `blocked_navigation` 0건.
- 남은 위험(보고만): 실행 중인 앱은 홈 목록 병합이 「서버 응답에 없는 이전 방을 유지」(`home-list-patch.ts` 808행, 계약)하므로 적용 전부터 켜져 있던 앱은 재시작 전까지 삭제 그룹이 남을 수 있다. iOS·방장 기기·공유 대상 화면은 NOT_PROVEN.
