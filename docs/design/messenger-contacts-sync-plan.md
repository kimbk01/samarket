# 메신저 연락처 동기화 + 친구 관리 — 단일 SSOT (v5)

- 작성: 2026-11-10 PHT · 상태: **정책 #1~#19 확정 (Owner 「권장값으로 확정」 2026-11-10) — 1a·1b 구현, 운영 DB 적용, 커밋, 배포 미승인**
- 이 문서가 유일한 기준. v1~v4 정의와 `messenger-contacts-hub-integration-audit.md` §G 수정 9건을 모두 통합했다. 다르면 이 문서가 우선.
- 기준 코드: `origin/main` = Production = `f10a59d` (Vercel 별칭 조회 2026-11-10).
- 관련 문서: 허브 재감사(A~F 구조·충돌·부하) `docs/design/messenger-contacts-hub-integration-audit.md` · 통합 시안 `docs/design/messenger-contacts-hub-integrated-mockup.html` (이전 시안 `messenger-contacts-sync-mockup.html` 은 하위 탭 구성 철회 표시)

## 0. Owner 지시·결정 원문
- 2026-11-10 지시: 「폰에 저장된 사람, 디바이에 가입된 저장 전화 번호로 자동 친구 추가」 · 「텔레그램의 방식으로」 · 「바이버, 텔레그램 구조로 … 매번 찾으면 서버 부하」 · 「동의된 부분, 새로고침 부분 … 폰에 저장된 사람은 디바이 가입시 등록」 · 「아이디를 변경 한다고 매번 다 불러 오는건 아닌듯 … 설치시 불러 오는 부분」 · 「통화시 일반 전화가 되냐?? 디바이 통화가 되느냐를 설정」 · 「이전의 회원도 동의 시 불러 오는 부분, 이후는 동의시 불러오는 부분, 전화번호 저장 친구가 가입시 가입 안내 메세지. 친구를 삭제 숨김 차단 해도 상대방은 모르는」
- 보완 지시 4건 (친구 관리 · 다중 기기 · 최종 보완 · 허브 재감사).
- **정책 결정 (2026-11-10)**: 「#16 승인: 연락처 자동 발견 + 친구 요청·수락 방식」 · 「#17 승인: 거래 채팅 상대 여부를 별도로 표시하지 않는다」 · 「#18 조건부: … 관대 방식은 승인하지 않는다. 트리거 실패 시 일관성 보장·오류 감지·복구·롤백 방식을 재설계하고 증명한다」 · 「#19 승인: … 삭제 여부를 안내한다. 권한 철회 후 업로드하지 않으며, 사용자의 삭제 선택을 정확히 반영한다」 · 이전 승인 #11·#12, 범위 제외 #13.
- 구현 전 필수 조건 1~8 (탭 구조 유지 · 거래·주문 요약·하위 화면 유지 · 친구 탭 섹션 + 별도 화면 · bootstrap·Realtime·방 진입 미연결 · 회귀 불허 · 트리거 정상·실패·동시성·롤백 검증 · 요청 수·DB 비용 검증 · 단일 SSOT).

## 0-1. 정정 이력 (작업자 오류)
| # | 오류 | 정정 |
|---|---|---|
| 1 | 「DIBAY 통화는 친구끼리만」 | 기본 `everyone`, 운영 142/142 |
| 2 | 「번호 70명 운영 변환 필요」 | PH `09…` 설계 형식. 실제 결함은 번호 없는 32명 |
| 3 | 친구 기준 = `community_messenger_friendships` | `user_social_relations`·`community_friend_requests` (앞 표는 2026-09-07 이후 새 행 없음) |
| 4 | `user_contact_entries(owner, phone_hmac)` | 기기 출처 표현 불가 → `contact_sources`·`contact_source_entries` |
| 5 | 친구 삭제·차단 API 뒤 `after()` 기록 | 기록 실패 시 재추천 → DB 트리거 |
| 6 | `signed_out` 상태 | 인증 코드 수정 필요 → 「마지막 사용」 |
| 7 | 1행 160 B | 실측 기반 320 B |
| 8 | 친구 화면 하위 탭 「전체 친구/연락처/요청」 | 기존 요청 카드·탭 구조 변경 → 철회, 친구 탭 섹션 1개 + 연락처 화면 |
| 9 | 새 알림 종류 `messenger_contact_joined` | 알림 코드 4곳 변경 → 철회, 기존 친구 알림 경로 |
| 10 | 트리거 영향 「무시 수준」 | 트리거 오류 = 친구 삭제 실패 가능 → §5 재설계 |
| 11 | 차단도 트리거로 기록 | 기존 차단 트리거와 같은 쌍 잠금 순서 문제 가능 + 차단 행은 해제 후에도 남음 → **차단은 트리거 없이 차단 표로 판정** |

---

## 1. 정책표
| # | 항목 | 값 | 상태 |
|---|---|---|---|
| 1 | 「번호로 나를 찾기」 기본값 | 모두 (설정에서 「서로 저장한 사람만」·「아무도」). 영향: 내 번호를 아는 사람은 내가 DIBAY 회원인지 알 수 있음 | 승인 (2026-11-10 권장값 확정) |
| 2 | 기존 회원 번호 등록 | 동의한 순간 (운영 일괄 채우기 없음) | 승인 (2026-11-10 권장값 확정) |
| 3 | 가입 안내 대상 | 가입 7일 안에 처음 동의한 신규 회원 | 승인 (2026-11-10 권장값 확정) |
| 4 | 번호 변경 시 안내 | 보내지 않음 | 승인 (2026-11-10 권장값 확정) |
| 5 | 친구 행 「내 연락처」 표시 | 표시 (연락처 매칭으로 계산, 친구 데이터 변경 없음) | 승인 (2026-11-10 권장값 확정) |
| 6 | 차단 해제 후 연락처 추천 | 하지 않음 (차단 이력 영구 제외) | 승인 (2026-11-10 권장값 확정) |
| 7 | 「상대방은 모름」 | A안: 알림 없음 + 차단·거절당한 쪽 문구 4개 중립화. 상대 목록에서 사라짐(F-9·§14-5)은 유지 | 승인 (2026-11-10 권장값 확정) |
| 8 | 유료 일반전화 | 넣지 않음 | 승인 (2026-11-10 권장값 확정) |
| 9 | 기본 통화 방식 설정 | 넣음 (4단계 · 통화 규정) | 승인 (2026-11-10 권장값 확정) |
| 10 | 미사용 기기 연락처 | 180일 뒤 그 기기 연락처만 삭제 (기기 하루 1회 사용 갱신 전제) | 승인 (2026-11-10 권장값 확정) |
| 11 | 새 기기 연락처 추가 | 1번 묻기 | 승인 |
| 12 | 다른 기기에서만 발견된 회원 | 「다른 기기」 표시, 휴대폰 전화 숨김 | 승인 |
| 13 | 특정 기기 원격 로그아웃 | 범위 제외 | 확정 |
| 14 | 친구 삭제 시 재추천 제한 | 양쪽 「이전 친구」. 부작용: 삭제당한 쪽도 상대를 연락처 추천에서 못 봄 (ID 검색 가능) | 승인 (2026-11-10 권장값 확정) |
| 15 | 기능 시작 전 삭제된 친구 | 기록 없음 → 1회 추천될 수 있음 | 승인 (2026-11-10 권장값 확정) |
| 16 | 자동 친구 추가 | **하지 않음** — 자동 발견 + 요청·수락 | 승인 |
| 17 | 거래·주문 상대 여부 표시 | **표시 안 함** | 승인 |
| 18 | 재추천 제한 기록 실패 처리 | §5-3 재설계 (조용히 무시 없음) | 승인 (2026-11-10) — 실행 증명(§5-4)은 1b 전 |
| 19 | OS 권한 철회 | 업로드 즉시 중단 + 「이 기기 연락처를 지울까요?」 1회 + 선택을 서버에 반영 | 승인 |

---

## 2. 변경 범위
### 2-1. 바뀌지 않는 것 (필수 조건 1·2·4·5)
- 메신저 탭 대화·친구·통화와 순서 상수 `MESSENGER_MAIN_SECTION_TAB_ORDER` · 대화 탭 칩·거래/주문 요약 칸·`/trade-chats`·`/delivery-chats` 하위 화면 · 하단 탭.
- bootstrap(full·critical·lite)·home-sync·Realtime 채널·방 진입 흐름 — **연락처 호출 0**.
- 거래·주문 방, 배지, 알림 종류·푸시 코드, 차단 규칙, 통화 정책(1~3단계).
- 인증·가입·전화 인증·로그아웃·세션 코드.
- 친구 TS 코드·RPC·계약(F-9 양쪽 삭제, §14-5 차단 시 정리).

### 2-2. 바뀌는 것
| 영역 | 변경 |
|---|---|
| 친구 DB | `user_social_relations` 에 **트리거 1개** (친구 행 DELETE 문장 단위) — 다른 표에 기록만 |
| 메신저 화면 | 친구 탭 「내 연락처의 DIBAY 회원」 섹션 · 연락처 화면 · 동의 화면 · 관리에 2줄(숨긴 추천·연락처 동기화) · 친구 행 「내 연락처」 표시 · 친구 추가 시트 연락처 탭(무동작 스위치 → 진입 버튼) · 설정 시트 무동작 스위치 2개 제거 · 권한 철회 안내 |
| 알림 | 새 종류 없음 — 기존 `appendUserNotification` (`notification_type:"status"`, `push_kind:"community"`, `meta.kind:"contact_joined"`) |
| 문구 (3-b) | 차단·거절당한 쪽 문구 4개 (#7) |
| 통화 (4단계) | 통화 선택 시트·기본 통화 방식·통화 문구 — 통화 규정 절차 |
| 신규 | DB 표 7 · RPC 5 · API 12 · 예약 작업 1 · 어드민 화면 1 + 회원 상세 섹션 · 네이티브 플러그인·권한 · 환경변수 1 |

---

## 3. 데이터 분리
| 구분 | 데이터 | 표 |
|---|---|---|
| 계정 공통 | 친구·요청·숨김·차단 | 기존 |
| | 재추천 제한 / 기록 실패분 | `contact_suppressions` / `contact_suppression_failures` |
| | 내 번호 등록 | `member_phone_lookup` |
| | 동의·계정 동기화·번호로 찾기·가입 알림·기본 통화·계정 목록 버전 | `messenger_contact_settings` |
| | 가입 안내 1회 기록 | `contact_join_notices` |
| 기기별 | 출처(동기화 켜짐·권한·기기 버전·세대·마지막 사용) | `contact_sources` |
| | 그 기기 번호 변환값 | `contact_source_entries` |
| 기기 안 | 이름·원 번호·비교 목록·초대 목록 | 서버로 안 보냄 |

---

## 4. 시나리오 S1~S15
| # | 시나리오 | 동작 |
|---|---|---|
| S1 | 가입·전화 인증 | 변경 없음 |
| S2 | 동의 | 기존·신규 회원 모두 **친구 탭 연락처 섹션의 「시작하기」 또는 친구 추가 시트 연락처 탭**에서 동의 화면 → 동의 기록 → 번호 등록(번호 있는 회원) → S3 |
| S3 | OS 권한 | 허용 → S4 / 거부 → 「권한이 꺼져 있어요 [설정 열기]」, 번호 등록 유지 |
| S4 | 불러오기 | 출처 등록 → 스냅숏 1,000개 조각 → 결과 |
| S5 | 친구 탭 | 기존 구성 그대로 + 내 프로필 아래 「내 연락처의 DIBAY 회원」 (최대 3명 + 모두 보기) |
| S6 | 행 동작 | 친구 ⋮ 기존 그대로 / 연락처 회원: 친구 추가·메시지(일반 1:1)·전화·추천에서 숨기기·차단 |
| S7 | 새로고침 | 앱 시작: 기기 안 비교 → 바뀐 것만 업로드 + 하루 1회 출처 사용 갱신 / 친구 탭 보일 때 버전 1회 / ⟳ 즉시 / ID·닉네임 변경 → 호출 없음 |
| S8 | 저장된 사람이 가입 | B 동의 → 등록 → B 번호를 가진 포함 출처의 회원 A → A 버전+1 → 가입 안내 1회 (#3 조건 · 상한 200 · 기존 친구 알림 경로) |
| S9 | 번호 변경 | 매일 정리 작업 또는 본인 호출 시 등록 갱신, 안내 없음 |
| S10 | 재설치·폰 교체 | 새 출처, 옛 출처 180일 또는 기기 목록 삭제 |
| S11 | 끄기·삭제·권한 철회 | §8 |
| S12 | 탈퇴 | 신규 표 정리 |
| S13 | 웹·Windows | 보기·관리만 |
| S14 | 친구 관리 | §5 |
| S15 | 다중 기기 | §10 |

---

## 5. 친구 관리 — 상태·일관성 (#18 재설계)

### 5-1. 제외 규칙 (연락처 목록 한 쿼리)
```
포함 출처 번호 합집합 ∩ member_phone_lookup
 − 나 · 탈퇴·제한 계정
 − 친구 (내 쪽 friend 행)                          → 친구 목록 「내 연락처」 표시
 − 차단 행이 있는 쌍 (어느 쪽이든, is_active 무관)    ← 차단은 기존 표로 판정 (트리거 없음)
 − contact_suppressions (나 → 상대)
 − contact_suppression_failures (나 → 상대, resolved_at IS NULL)   ← 복구 전에도 재추천 막음
 − 상대 discovery_policy 미충족
```

### 5-2. 확인된 사실 (운영 · 코드)
- 친구 삭제는 **한 문장**으로 양쪽 행 삭제: `removeFriendPairSaved` → `DELETE … WHERE relation_type='friend' AND (A→B OR B→A)` (`social-relations.ts:754-778`).
- 운영에 이미 트리거 1개: `trg_user_social_relations_blocked_clears_friend` (BEFORE INSERT/UPDATE OF relation_type, 차단 행이 들어오면 같은 방향 friend 행 DELETE). 이 내부 DELETE 도 새 트리거를 실행시킨다 → 차단 시 차단한 쪽 「이전 친구」 기록도 생김 (차단 판정은 차단 표가 따로 하므로 중복 무해).
- 친구 삭제 흔적은 기존 표에 신뢰할 수 있게 남지 않음 (friendships 표 미기록, requests `cancelled` 구분 불가). 차단 행은 해제 후에도 `is_active=false` 로 남음 (운영 활성 5·해제 2).

### 5-3. 재설계 — 「친구 작업 보호 + 조용한 누락 없음」
```sql
CREATE TRIGGER trg_usr_friend_delete_contact_suppress
AFTER DELETE ON public.user_social_relations
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION contact_suppress_on_friend_delete();

-- 함수 본문 (요지)
BEGIN
  BEGIN                                   -- ① 1차 기록 (하위 트랜잭션)
    INSERT INTO contact_suppressions (owner_user_id, target_user_id, reason, created_at)
    SELECT owner_user_id, target_user_id, 'former_friend', now()
    FROM old_rows WHERE relation_type = 'friend'
    ORDER BY owner_user_id, target_user_id          -- 같은 순서로만 잠금
    ON CONFLICT (owner_user_id, target_user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    BEGIN                                 -- ② 실패분 기록 (다른 표, 제약 최소)
      INSERT INTO contact_suppression_failures
        (owner_user_id, target_user_id, reason, sqlstate, message, created_at)
      SELECT owner_user_id, target_user_id, 'former_friend', SQLSTATE, left(SQLERRM, 300), now()
      FROM old_rows WHERE relation_type = 'friend';
      RAISE WARNING 'contact_suppress_failed sqlstate=% rows=%', SQLSTATE, (SELECT count(*) FROM old_rows);
    END;                                  -- ②도 실패하면 예외가 밖으로 → 친구 삭제도 함께 취소
  END;
  RETURN NULL;
END;
```
| 요구 | 보장 방식 | 근거 |
|---|---|---|
| **일관성** | 친구 삭제가 커밋되면 반드시 ① 제한 행 또는 ② 실패 행 중 하나가 **같은 트랜잭션**에 남는다. 둘 다 못 쓰면 친구 삭제도 취소 → 「삭제됐는데 기록 없음」 불가 | PL/pgSQL `EXCEPTION` 블록 = 하위 트랜잭션, 바깥 트랜잭션과 원자적 |
| **재추천 방지 (복구 전)** | 목록 쿼리가 ②의 미복구 행도 제외 (§5-1) | 설계 |
| **친구 작업 보호** | ①이 실패해도(제약·잠금 시간 초과·권한 등) 친구 삭제는 성공. 친구 삭제가 실패하는 경우는 ①·② 두 표 모두 쓰기 불가일 때뿐 (DB 전체 장애 수준) | 설계 |
| **조용한 무시 없음** | ② 행 영구 보존 + `RAISE WARNING` (Postgres 로그) + 어드민 「기록 실패 n건」 빨간 표시 + 매일 정리 작업이 미복구 건수를 감사 기록(`audit_logs`)에 남김 | 설계 |
| **복구** | 매일 정리 작업·어드민 「지금 복구」: ② → ① `INSERT … ON CONFLICT DO NOTHING` 후 `resolved_at`. 같은 행 재실행해도 결과 같음(멱등). 3회 실패 시 어드민 경고 유지 | 설계 |
| **동시성** | 문장 단위 1회 · 정렬된 순서로만 잠금 · `DO NOTHING`. 차단은 트리거 없음 → 새 잠금 경로는 「친구 삭제 문장 → 제한 표」 하나뿐. 같은 쌍 동시 삭제는 기존처럼 친구 행 잠금에서 먼저 직렬화되고, 두 번째 문장은 지울 행이 0 → 트리거 기록 0 | 기존 삭제 문장 구조 |
| **롤백** | `DROP TRIGGER` 즉시 (친구 동작 원상). 표는 남겨 목록 제외 계속. 트리거가 꺼졌던 동안의 친구 삭제는 기록 없음 → 그 기간 삭제분은 1회 재추천될 수 있음 (어드민에 꺼진 기간 표시) | 설계 |
| **계정 삭제 연쇄** | 두 표 모두 외래키 없음 → 연쇄 삭제 중에도 실패 없음, 고아 행은 매일 정리 | 설계 |

### 5-4. 증명 계획 (1b 착수 전 실행 · 지금은 NOT_PROVEN)
- 방식: 기존 사례 `supabase/tests/isolated/final-e2e/` 와 같은 **로컬 일회용 PostgreSQL 16** (Supabase 프로젝트·테스트 DB 아님). 운영 카탈로그에서 `user_social_relations`·기존 트리거·관련 표 정의를 읽기 전용으로 복사.
| 시험 | 기대 |
|---|---|
| T1 정상 삭제 | 친구 2행 삭제 + 제한 2행 |
| T2 ① 실패 주입 (제한 표 INSERT 권한 회수·CHECK 위반) | 친구 삭제 성공 + 실패 2행 + WARNING |
| T3 ①② 모두 실패 주입 | 친구 삭제 취소(행 그대로) + 오류 반환 |
| T4 차단 (기존 트리거 경유) | 차단 행 + 차단한 쪽 친구 행 삭제 + 제한 1행, 기존 동작 결과 동일 |
| T5 동시성: 같은 쌍에 「A 삭제 / B 삭제 / B 차단」 200회 병렬 | 교착·오류 건수 = 트리거 없는 기준선과 같음 |
| T6 복구 | 실패 행 → 제한 행, `resolved_at`, 재실행 멱등 |
| T7 롤백 | DROP 후 친구 삭제 정상·기록 없음, 재생성 후 정상 |
| T8 계정 삭제 연쇄 | 친구·차단 있는 계정 삭제 성공 |
| T9 목록 제외 | 미복구 실패 행 대상이 목록에서 빠짐 |
| T10 성능 | 친구 삭제 문장 시간 증가 측정 (기준선 대비) |
- 운영 적용 직후 (Owner 계정): 친구 삭제·차단 1회씩 → 행 확인 → 기존 화면 동작 확인. 결과는 PASS/FAIL 로 보고.

### 5-5. 전환표
| 현재 → 동작 | 친구 | 관리 | 재추천 제한 | 연락처 섹션 |
|---|---|---|---|---|
| 발견 → 친구 추가 | 요청 보냄 | 정상 | — | 「요청됨」 |
| 요청 → 수락 | 친구 | 정상 | 그대로 | 빠짐 (친구 목록) |
| 요청 → 거절 | 거절됨 | 정상 | — | 빠짐 |
| 발견 → 추천 숨김 | 없음 | 정상 | hidden | 빠짐 |
| 친구 → 숨김 | 친구 | 숨김 | — | 빠짐 |
| 친구 → 삭제 | 없음 | 정상 | former_friend (양쪽) 또는 실패 행 | 빠짐 |
| → 차단 | 없음 | 차단 | 차단 표 | 빠짐 |
| 차단 해제 | 없음 | 정상 | 차단 표 남음 | 빠짐 |
| 숨긴 추천 → 다시 보기 | 그대로 | 그대로 | 행 삭제 (차단 이력은 대상 아님) | 나타남 |

---

## 6. DB SSOT (신규 · 운영 적용 미승인)
```sql
member_phone_lookup        (user_id PK→profiles CASCADE, phone_hmac bytea UNIQUE, key_version, phone_verified_at_snapshot, updated_at)
messenger_contact_settings (user_id PK→profiles CASCADE, consented_at, consent_version, withdrawn_at,
                            account_sync_enabled bool DEFAULT true, discovery_policy DEFAULT 'everyone',
                            join_notify_enabled bool DEFAULT true, call_default DEFAULT 'ask',
                            account_list_version bigint DEFAULT 0, updated_at)
contact_sources            (id uuid PK, user_id→profiles CASCADE, install_ref bytea, platform,
                            sync_enabled bool, permission_state, revoke_choice text NULL,  -- #19: delete|keep
                            status active|removed, device_version, generation, pending_generation,
                            recent_batches jsonb, resync_count_day, resync_day, last_used_at, last_sync_at,
                            created_at, removed_at, UNIQUE(user_id, install_ref))
contact_source_entries     (source_id→contact_sources CASCADE, phone_hmac, client_ref, generation,
                            PK(source_id, phone_hmac), INDEX(phone_hmac))
contact_suppressions       (owner_user_id, target_user_id, reason hidden|former_friend, created_at,
                            PK(owner_user_id, target_user_id))                      -- 외래키 없음
contact_suppression_failures (id bigserial PK, owner_user_id, target_user_id, reason, sqlstate, message,
                            created_at, attempts int DEFAULT 0, resolved_at)        -- 외래키·CHECK 없음
contact_join_notices       (owner_user_id, joined_user_id, notified_at, PK(owner, joined))
```
- 포함 출처 = `status='active'` + 계정 동기화 켜짐 + 동의 유지 + 확정 세대. 기기 동기화 꺼짐·권한 철회 후 「유지」 선택 출처도 포함.
- 권한: service_role 전용, RLS 켜고 정책 없음. 트리거 함수 `SECURITY DEFINER`, `search_path=public,pg_temp`.
- RPC: `cm_contacts_register_source` · `cm_contacts_apply` · `cm_contacts_list` · `cm_contacts_match_new_member` · `cm_contacts_daily_maintenance(dry_run)`.

## 7. 동기화 규약
| 항목 | 규칙 | 응답 |
|---|---|---|
| 인증 | 로그인 필수 | 401 |
| 소유권 | `id=$source AND user_id=$user FOR UPDATE` | 404 |
| 설치 출처 | `sha256(user‖client_instance_id)` = `install_ref` | 403 |
| 같은 기기 동시 요청 | 출처 행 잠금 직렬화 | — |
| A·B 동시 | 출처별 잠금 → 계정 버전 1행 갱신 (잠금 순서 출처→계정 고정) | — |
| 중복 batch_id | 저장된 결과 반환, 쓰기 없음 | 200 |
| 늦은·순서 어긋난 업로드 | `base_version ≠ device_version` | 409 → 전체 스냅숏 (자기 출처만) |
| 409 반복 | 기기당 하루 3회 | 429 |
| 중지·삭제·철회·권한 철회 | 업로드 거부 | 410 |
| 스냅숏 부분 실패 | `pending_generation` 조각 → 마지막 조각에서 확정·이전 세대 삭제. 실패 시 이전 세대 유효 | — |
| 기기 사용 갱신 | 앱 시작 시 하루 1회 `POST /sources` (출처 재사용 + `last_used_at`) | — |
| 양 제한 | 1요청 1,000번호 · 분당 10 · 계정 하루 신규 3,000 | 429 |
| 목록 조회 | 친구 탭이 보일 때 1회, 60초 안 재진입 재호출 없음, 회원별 single-flight, `private, no-store` | — |

## 8. 보관·삭제
| 사건 | 서버 | 계정 목록 | 가입 매칭 | 기기 안 |
|---|---|---|---|---|
| 이 기기 동기화 끄기 | `sync_enabled=false`, 업로드 410 | 포함 | 포함 | 유지 |
| **OS 권한 철회 (#19)** | 감지 즉시 업로드 중단(`permission_state=denied`) → 안내 「이 기기에서 올린 연락처 n개를 지울까요? [지우기] [유지]」 → **지우기** = 출처 `removed` + 행 삭제 / **유지** = 업로드 중단만, `revoke_choice='keep'` 기록. 답 전 = 업로드 중단 상태로 대기 (다음 실행 때 다시 안내) | 지우기: 빠짐 / 유지·대기: 포함 | 같음 | 비교 목록 삭제 |
| 로그아웃 | 처리 없음 | 포함 | 포함 | 다른 회원 로그인 시 삭제 |
| 미사용 180일 (하루 1회 갱신 없음) | 그 출처 삭제 | 빠짐 | 빠짐 | 재실행 시 410 → 자동 스냅숏 |
| 이 기기 / 다른 기기 연락처 삭제 | 그 출처 삭제 | 빠짐 | 빠짐 | — |
| 계정 전체 동기화 끄기 | 업로드 410, 행 보관 | 숨김 | 빠짐 | 유지 |
| 계정 전체 연락처 삭제 | 모든 출처 삭제 | 빠짐 | 빠짐 | 다음 호출 시 삭제 |
| 동의 철회 | 전체 삭제 + 번호 등록 삭제 (동의 기록은 남김) | 빠짐 | 빠짐 · 나도 빠짐 | 삭제 |
| 탈퇴 | CASCADE + 정리 작업 | — | — | — |
| 재추천 제한·친구·숨김·차단 | 위 어떤 경우에도 유지 (철회·탈퇴 제외) | — | — | — |
- 문구: 계정 전체 「끄면 모든 기기에서 올리지 않고 목록도 숨겨요. 올린 연락처는 보관돼요」 / 이 기기 「끄면 변경만 안 올려요. 이미 올린 연락처는 계속 쓰여요」 / 권한 철회 「연락처 권한이 꺼졌어요. 이 기기 연락처는 더 이상 올리지 않아요. 이미 올린 n개를 지울까요? 다른 기기 연락처와 친구·숨김·차단은 그대로예요」.

## 9. 상대방은 모름 (#7)
알림 없음(전부) · 숨김·추천 숨김·이전 친구 표시는 상대에게 노출 없음 · A안 시 차단·거절당한 쪽 문구 「메시지를 보낼 수 없어요」·「채팅을 시작할 수 없어요」·「친구 요청을 보낼 수 없어요」 (`cm_social_blocked_message_denied`·`nav_messenger_blocked_target`·`cm_social_rejected_message_denied`·친구 요청 차단 문구), 통화 문구는 4단계.

## 10. 다중 기기 S15 (설계 대조 · 실행 NOT_PROVEN)
| # | 상황 | 결과 |
|---|---|---|
| 1 | A 동기화 → B 로그인 | B 출처 없음, A 결과 표시, B 에 없는 번호는 「다른 기기」, 「이 기기 연락처도 추가할까요?」 |
| 2 | B 거부 | B 보기만 |
| 3 | A·B 동의 | 합집합 1명 1행 |
| 4 | 같은 번호 | 1행, 안내 1회 |
| 5 | A 만 삭제 | 유지, A 에선 「다른 기기」 |
| 6 | B 만 추가 | 양쪽에 새 행 |
| 7 | A 로그아웃 | 변화 없음 |
| 8 | A 분실 → 모든 기기 로그아웃 | B 기기 목록에서 A 연락처 삭제 또는 180일 |
| 9 | B 재설치 | 새 출처 (설치 ID 유지 시 재사용 — NOT_PROVEN) |
| 10 | B 기기 중지 | B 번호 포함 |
| 11 | 계정 전체 삭제 | 비움 |
| 12 | 숨김·삭제·차단 후 B | 동일 적용 |
| 13 | 동시 새로고침 | 같은 최종 목록 |
| 14 | 늦은 업로드 | 409 → B 스냅숏 |
| 15 | B 권한 철회 | 업로드 중단 + 삭제 안내 (#19) |
| 16 | 스냅숏 중간 실패 | 이전 세대 유효 |
| 17 | 탈퇴 | 정리 |

## 11. 요청 수·DB 비용 (필수 조건 7)
- **기존 실측** (운영 `pg_stat_statements`, 2026-10-22 이후): bootstrap full 967회 평균 183 ms 최대 7.9 s · critical 877회 평균 99 ms · 친구 표 조회 0.1 ms · 친구 요청 RPC 4.7 ms. 10-23 과부하 이력 (bootstrap 재호출).
- **신규가 기존 경로에 더하는 호출: 0** (§2-1, §7).
- **신규 요청 (가정)**: 첫 동기화 기기당 3요청 1회 · 이후 하루 ~7요청 (변경분 0~1, 사용 갱신 1, 버전 확인 ~5) → 142명 ~1,000/일.
- **용량**: 1행 데이터 100 B·색인 키 73 B (검증) → 1행 ~320 B (계산) → 142명 ~23 MB (DB 336 MB 의 ~7%), 1만 1.6 GB, 10만 16 GB.
- **예약 작업**: 매일 20:10 UTC (04:10 PHT), 기존 정리 작업 19:30·19:50 과 분리.
- **NOT_PROVEN**: 신규 쿼리 실행 계획·시간, 디스크 한도·여유율. → 1a 적용 후 운영에서 `EXPLAIN` (빈 표·소량) + 로컬 일회용 DB 에 10만 회원 규모 합성 데이터로 실행 계획·시간 측정 → 기준: 목록 조회 50 ms 이하, 기존 bootstrap 호출 수·평균 변화 없음.

## 12. 단계 (구현 미승인)
| 단계 | 범위 | 검증 | 롤백 |
|---|---|---|---|
| 1a | 표 7·RPC 5·API 12·어드민 설정·예약 작업 (킬스위치 꺼짐, 트리거 없음) | typecheck·vitest·eslint · 로컬 일회용 DB 규모 측정 · 운영 적용 후 표·색인·RLS 조회 · 기존 bootstrap 호출 수 변화 0 | 킬스위치 · down 마이그레이션 · Vercel 되돌리기 |
| 1b | 트리거 1개 | §5-4 T1~T10 PASS 후 운영 적용 → Owner 계정 확인 | `DROP TRIGGER` |
| 2 | 네이티브 플러그인·권한 + 화면 (§13) | + i18n 검사 · 실기기 Android·iPhone · 친구 F-1~F-11·거래·주문·알림 회귀 · S15 주요 상황 | 킬스위치 |
| 3 | 가입 안내 · 어드민 집계 | 시험 가입 → 1회 | 어드민 끄기 |
| 3-b | 문구 4개 (#7) | 차단한 쪽/당한 쪽 실기기 | 문구 되돌림 |
| 4 | 통화 선택·기본 통화 방식·통화 문구 | 통화 규정 실기기 행렬 | 단독 커밋 되돌림 |

### 12-1. 1a 구현 기록 (2026-11-10 · Owner 「1a 진행」 · 운영 DB 미적용)
- 마이그레이션 `supabase/migrations/20271111090000_messenger_contacts_sync_1a.sql` — §6 표 7개 + **어드민 설정 표 2개** (`messenger_contacts_admin_settings`·`_logs`, 킬스위치 기본 꺼짐 · revision 저장) = 9개. 서버 함수 15개 (§6 의 5개를 실제 동작 단위로 나눔: 동의·철회·전체 삭제·출처 등록/변경/삭제·올리기·목록·가입 대상·번호 갱신 2·정리·어드민 저장·내부 2). 기존 표·함수·트리거 변경 없음. 트리거(1b) 없음.
- API: `app/api/community-messenger/contacts/**` 8개 파일 15개 동작 (§17) · 예약 작업 `app/api/cron/messenger-contacts-maintenance` (`10 20 * * *` UTC) · 어드민 `app/api/admin/messenger/contacts-settings` + 화면 `/admin/messenger/contacts`.
- 서버 코드 `lib/community-messenger/contacts/*` — 응답은 오류 코드만, `private, no-store`. 메신저 bootstrap·home-sync·Realtime·방 진입 경로에서 가져오지 않음 (vitest 계약으로 고정).
- 검증: 로컬 일회용 PG16 격리 시험 `supabase/tests/isolated/contacts-sync-1a/` 66개 PASS · 합성 규모(회원 10만·번호 행 100만) 측정 — 1행 259 B(색인 포함 실측), 목록 7.6 ms, 변경 없음 0.013 ms, 변경분 50개 1.6 ms, 스냅숏 1,000개 30.6 ms, 가입 대상 계산 2.6 ms, 정리 dry_run 6.4 ms (§11 의 320 B·50 ms 기준 충족, 운영 측정 아님).

## 13. 화면 변경 범위 (통합 시안 기준)
| 화면 | 현재 | 변경 | 단계 |
|---|---|---|---|
| 대화 탭·거래·주문 하위 화면·방 | 그대로 | 없음 | — |
| 통화 탭 | 그대로 | 없음 | — |
| 친구 탭 | 친구 추가·검색·관리 / 받은 요청 / 내 프로필 / 즐겨찾기 / 새 친구 / 친구 | 내 프로필 아래 섹션 1개 (동의 전 1줄 안내) · 친구 행 「내 연락처」 (#5) | 2 |
| 친구 추가 시트 「연락처」 탭 | 무동작 스위치 2개 | 동의 화면 / 연락처 화면 진입 버튼 | 2 |
| 메신저 설정 시트 | 무동작 스위치 2개 | 제거 (관리 → 연락처 동기화로) | 2 |
| 관리 (보관함·친구 관리 시트) | 숨김·차단·거절한 요청 | 「숨긴 추천」·「연락처 동기화」 2줄 | 2 |
| 신규 화면 | — | 동의 · 내 연락처의 DIBAY 회원(초대 포함) · 연락처 동기화(기기 목록) · 숨긴 추천 · 권한 철회 안내 | 2 |
| 친구 프로필 시트 | 버튼 전부 | 유지 / 통화 선택 (4단계) | 4 |
| 연락처 회원 프로필 | — | 친구 추가·메시지·전화·추천 숨김·차단 (거래·주문 여부 표시 없음 #17) | 2 |
| 분할 화면 (≥768px) | 목록 \| 상세 | 신규 화면은 오른쪽 칸 | 2 |

## 14. 회귀 위험 (필수 조건 5)
| 영역 | 위험 | 대응 |
|---|---|---|
| 친구 삭제·차단 | 트리거 | §5-3 (① 실패해도 성공, 둘 다 실패만 취소) · §5-4 시험 · DROP 롤백 |
| 계정 삭제 | 트리거 연쇄 | 외래키 없음 · T8 |
| 거래·주문 채팅 | 없음 (코드·데이터 미변경) | 2단계 회귀 확인 |
| 알림·푸시 | 기존 경로 재사용 | 친구 알림과 같은 dedupe 키 규칙 |
| 통화 | 1~3단계 없음 | 4단계 통화 규정 |
| 메신저 부하 | 첫 화면·Realtime 미연결 | §11 측정 기준 |
| 친구 탭 | 섹션 추가로 기존 요청·목록 동작 | F-1~F-11 계약 시험 재실행 |

## 15. 결함 (보고만)
주문 채팅 환불·환불 요청·취소 요청 상태 보내기 미차단 (FAIL) · 연락처 탭 스위치 무동작 (FAIL) · 번호 없는 인증 회원 32명 (FAIL, 보정 안 함 — 동의해도 다른 회원에게 안 보임) · 그룹방 차단 상대 송수신 계약 (NOT_PROVEN) · 거래 통화 오류 코드 미사용 · 거래 글 삭제 시 채팅 숨김 (NOT_PROVEN) · 친구 계약 문서 차단 서술 미갱신.

## 16. PASS / FAIL / NOT_PROVEN
| 항목 | 판정 |
|---|---|
| main = Production (`f10a59d`) | PASS |
| 거래·주문 = 같은 방 표, 친구 무관 | PASS |
| 친구 삭제 = 한 문장 양쪽 삭제 · 기존 차단 트리거 존재 | PASS (코드·운영 카탈로그) |
| 친구 삭제 이력 기존 표 신뢰 | FAIL → 트리거 필요 |
| §5-3 일관성 설계 | 설계 PASS (원자성 근거) / 실행 **NOT_PROVEN** (§5-4 미실행) |
| 신규 쿼리 비용·디스크 여유 | NOT_PROVEN |
| 통합 시안 | 데스크톱 브라우저 15개 바로가기 오류 0 / 실기기 NOT_PROVEN |

## 17. API (`/api/community-messenger/contacts…`, 로그인 필수)
`POST·DELETE /consent` · `GET·PATCH /settings` · `POST /sources` (등록·사용 갱신) · `GET /sources` · `PATCH /sources/[id]` (기기 동기화·권한 상태·#19 선택) · `DELETE /sources/[id]` · `POST /sync` · `GET /?v=&source_id=` · `DELETE /` · `GET /suppressions` · `POST·DELETE /suppressions/[userId]` · 예약 `POST /api/cron/messenger-contacts-maintenance`. 어드민: 연락처 동기화 집계(기록 실패 건수 포함)·운영 설정·회원 상세 출처 목록 — 번호·이름·HMAC 표시 없음.

## 18. 폐기 목록
`user_contact_entries` · 출처 없는 sync API · 온보딩 동의 · OTP `after()` · 친구 경로 `after()` 기록 · 차단 트리거 · `community_friend_requests.source` · `signed_out`·30일 · 새 알림 종류 · 친구 하위 탭 3개 · 160 B 가정 · 관대 방식(실패 무시).

참고: [Telegram contacts.getContacts](https://core.telegram.org/method/contacts.getContacts) · [Viber 연락처 동기화](https://help.viber.com/hc/en/articles/9067559172253)
