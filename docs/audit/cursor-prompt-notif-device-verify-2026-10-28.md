# Cursor 실기 프롬프트 — 알림·푸시·뱃지·알림음 (2026-10-28)

> 이 문서를 Cursor 에 그대로 붙여 넣는다. 결과 보고는 Claude 가 운영 DB 로 한 줄씩 대조한다.
> 증거 없는 PASS, 측정 안 한 PASS, 다른 배포 결과를 섞은 PASS 는 모두 **허위 보고**로 처리한다.

---

## 0. 절대 규칙
1. **코드·DB 변경 금지.** 파일 수정·커밋·푸시·마이그레이션을 하지 않는다. 운영 DB `ckdosyydvgzqwpbwuhon` 은 **SELECT 만** 한다. `dibay-test`·`dibay-reset-qa` 는 조회도 금지.
2. **결함을 발견해도 고치지 않는다.** FAIL 로 기록하고 다음 시나리오로 간다. (원인 추측 금지 — 관찰 사실만)
3. **모든 PASS 에는 증거 3종을 붙인다.**
   - ① 화면 캡처 파일 경로
   - ② 운영 DB 조회 결과 원문(행 id·시각 포함)
   - ③ 시각(PHT, 초 단위)
   - 하나라도 없으면 NOT_PROVEN 이다.
4. **시나리오 시작마다 Production SHA 를 기록한다.**
   - Vercel Production 배포의 커밋 SHA 가 `e053417ca` 이거나 그 이후인지 확인한다.
   - 도중에 SHA 가 바뀌면 그 시나리오는 처음부터 다시 한다.
5. **테스트 주문·포인트 충전 요청은 실행 직전에 보고서에 한 줄로 적고 진행한다.**
   - 적을 내용: 매장·상품·총액, 또는 충전 금액.
   - 최소 금액으로 한다.
6. **시간은 PHT(UTC+8) 로 쓴다.** DB 의 UTC 값은 원문 그대로 붙이고 옆에 PHT 를 적는다.
7. **범위 밖 관찰은 맨 끝 「범위 밖 관찰」에만 적는다.** 예: `/mypage/trade` 하위 화면 Application error(거래 커밋 `c3ccec49a` 쪽). 알림 판정에 섞지 않는다.

## 1. 기기·계정 (운영 `user_devices` 기준)
| 약칭 | 기기 | 계정 | 앱 버전 | 오너 매장 |
|---|---|---|---|---|
| S | Samsung SM-M156S (adb `RFCY40PY2CA`) | q테스트1 `9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8` | 1.2.4 (13) | 맛업는식당 |
| X | Xiaomi 24076RP19G (adb `8b37179f7d94`) | zxzx11 `0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc` | 1.2.4 (13) | MAN-CHOO FOOD HUB |
| I | iPhone (미러링) | w테스트1 `edc8c2f0-2673-4ca8-9d63-92a609d556f4` | 1.2 (15) | 만두네집 |
| W | Mac 브라우저 `https://samarket.vercel.app` | S 와 같은 계정(동기화 확인용) | — | — |
| A | Mac 브라우저 관리자 | 관리자 계정 (Cursor 가 직접 로그인) | — | — |

- 시작 전 각 기기에서 앱을 **완전 종료 후 재시작**한다(웹 변경 반영). 재설치·재빌드는 하지 않는다.
- 설치 버전은 아래 쿼리로 확인해 표에 붙인다.
  ```sql
  select p.nickname, d.platform, d.app_version, d.is_active, d.last_seen_at
  from user_devices d join profiles p on p.id = d.user_id
  where d.user_id in ('9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8','0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc','edc8c2f0-2673-4ca8-9d63-92a609d556f4')
  order by d.last_seen_at desc;
  ```

## 2. 측정 도구 (모든 시나리오 공통)
- **푸시 발송·우선순위**
  ```sql
  select id, user_id, event_type, status, provider_response->>'priority' as priority,
         provider_response->>'reason' as reason, notification_event_id, created_at
  from notification_deliveries
  where created_at > '<시나리오 시작 UTC>' order by created_at;
  ```
- **알림 행**
  ```sql
  select id, user_id, type, category, room_id, title, body, unread, read_at, opened_at, created_at
  from notification_events
  where created_at > '<시나리오 시작 UTC>' order by created_at;
  ```
  - 회원 알림의 원본은 `notifications`(`id, user_id, title, body, is_read, read_at, meta->>'kind', link_url, created_at`) 이다.
- **기기 표시·채널** (Android)
  - `adb -s <기기> shell dumpsys notification --noredact`
  - 해당 알림의 `pkg=com.dibay.app` 블록에서 `channel=`, `when=`, `android.title`, `android.text` 원문을 붙인다.
- **앱 아이콘 숫자**
  - Android: 런처 화면 캡처.
  - iPhone: 홈 화면 캡처.
- **화면 숫자의 서버 값** (W 브라우저 개발자 도구 콘솔, 같은 계정으로 로그인한 상태)
  ```js
  await (await fetch("/api/me/notifications?unread_count_only=1")).json()   // 종 = A
  await (await fetch("/api/me/store-owner-hub-badge")).json()               // 오너 FAB: storeOrderChatUnread, orderAttention, inquiryAttention
  ```

## 3. 계약 (판정 기준 — `docs/audit/notification-defect-fix-design-2026-10-28.md` §1·§2)
| 위치 | 계약 숫자 |
|---|---|
| 헤더 알림종 · 알림센터 「전체」 | 회원 알림 A (메신저 소속 친구·선물·그룹 초대 제외, 오너 알림 제외) |
| 하단 「채팅」 | 1:1 + 그룹 + 거래 + 고객 주문 **방 수** |
| 하단 커뮤니티·거래·배달·내정보 | 숫자 없음 |
| 앱 아이콘 | A + B (오너 제외) |
| 오너 FAB 접힌 숫자 | **주문채팅 + 주문 처리 대기 + 문의 (합)** = `storeOrderChatUnread + orderAttention + inquiryAttention` |

| 이벤트 종류(`event_type`) | Android 우선순위 기대값 |
|---|---|
| chat_message · group_message · trade_message · 통화 | high (기존) |
| **trade_status · order_status · delivery_status** | **high (F1 수정)** |
| community_activity · admin_notice · 마케팅 · 친구 요청 | normal (기존 의도) |

---

## 4. 시나리오

각 시나리오 표의 모든 칸을 채운다. 칸마다 PASS / FAIL / NOT_PROVEN 과 증거를 적는다.

### T0. 기준값 (S·X·I·W)
- 기기마다 기록할 값:
  - 종 숫자
  - 알림센터 「전체」 숫자와 탭별 숫자
  - 하단 「채팅」 숫자
  - 앱 아이콘 숫자
  - W 콘솔의 `unread_count`
  - 오너 FAB 접힌 숫자 (배달 탭 `/stores` 에서 FAB 가 접힌 상태)와 `store-owner-hub-badge` 세 값
- 판정:
  - 종 = `unread_count`
  - 아이콘 = 종 + 하단 채팅
  - **FAB 접힌 숫자 = 세 값의 합 (F4)**
- 오너 FAB 가 화면에 안 보이면 그 사실과 캡처를 적는다. 표시 조건을 추측하지 않는다.

### T1. 1:1 메시지 (B) — X → S, S 앱은 백그라운드
| 칸 | 기대 |
|---|---|
| 발송 | `chat_message` sent · priority high |
| 표시 | S 알림창에 10초 안에 표시 · 제목 = 보낸 사람 · 내용 = 메시지 |
| 채널 | `dumpsys` channel 이 메신저 채널 |
| 숫자 | S 하단 채팅 +1 · **종 변화 없음** · 아이콘 +1 |
| 읽음 | 푸시 탭 → 방 열림 → 하단 채팅 −1 · 아이콘 −1 · W 하단 숫자가 10초 안에 같은 값 |

### T2. 가격 제안 (A · trade_status · **F1**) — X 가 S 의 판매중 상품에 가격 제안, S 앱 백그라운드
| 칸 | 기대 |
|---|---|
| 발송 | `notification_deliveries.event_type = trade_status` sent · **priority high** (수정 전 normal) |
| 도착 | 발송 시각 → S 표시 시각 차이(초)를 적는다. 수정 전 실측 2분 55초 |
| 문구 | 제목 「가격 제안이 도착했습니다」 · 내용 「{상품명} · {원가} → {제안가}」 |
| 숫자 | S 종 +1 · 「거래」 탭 +1 · 아이콘 +1 · 하단 채팅 변화 없음 |
| 읽음 | 알림센터 행 탭 → 상품 화면 이동 · 종 −1 · `notifications.is_read = true` · W 종 숫자가 10초 안에 −1 |

### T3. 가격 제안 수락 → 푸시 탭 읽음 (A · 방으로 이동 · **F2**) — S 가 T2 제안을 수락, X 앱 백그라운드
| 칸 | 기대 |
|---|---|
| 발송 | X 에 `trade_status` sent · **high** |
| 문구 | 제목 「가격 제안이 수락되었습니다」 · 내용 「{금액} 제안이 승인되어 채팅으로 이어집니다.」 |
| 푸시 탭 | X 알림창에서 **푸시를 직접 탭** → 거래 채팅방 열림 |
| **읽음** | 탭 직후 해당 `notification_events.read_at`(또는 `notifications.read_at`)에 값이 들어감 · X 종 −1 (**수정 전에는 방으로 가는 상태 알림이 푸시 탭으로 읽음 안 됐음**) |

### T4. 커뮤니티 댓글 (A · community_activity) — X 가 S 의 커뮤니티 글에 댓글
| 칸 | 기대 |
|---|---|
| 발송 | `community_activity` sent · priority **normal** (의도) |
| 문구 | 제목 「{X 닉네임}님이 댓글을 남겼어요」 · 내용 「게시글에서 확인해 주세요.」 |
| 숫자 | S 종 +1 · 「커뮤니티」 탭 +1 |

### T5. 고객 주문 → 오너 (C) · 고객 (A) — X(또는 I·W) 가 고객으로 S 매장 「맛업는식당」에 최소 금액 주문
실행 직전에 보고서에 한 줄로 적는다: 매장·상품·총액.

| 칸 | 기대 |
|---|---|
| 오너 발송 | S 에 `order_status` sent · high |
| 오너 문구 | 제목 「새 주문이 들어왔어요」 · 내용 「{주문번호} · {금액} · {n}개 품목」 |
| 오너 채널·소리 | `dumpsys` channel 이 오너 주문 채널(`delivery_order_created_owner` 계열) |
| 오너 숫자 | **S 회원 종 변화 없음** · 오너 FAB 「주문」 +1 · **FAB 접힌 숫자 = 세 값의 합 (F4)** · 오너 알림 목록 +1 |
| 30초·60초 미접수 | S 에 리마인드 푸시 · 제목 「아직 접수하지 않은 주문이 있어요」 · 내용 「{주문번호} · {초}초째 대기 중」 · 오너 알림센터에 같은 제목으로 표시(**F7**) |
| 접수 | S 가 접수 → 고객에게 `order_status` sent · high · 제목 「{매장} 주문이 접수됐어요」 · 내용 「조리가 시작되면 알려 드릴게요.」 · **고객 문구에 주문번호(SO…) 없음** |
| 고객 숫자 | 고객 종 +1 · 「주문·배달」 탭 +1 · 아이콘 +1 |
| 마무리 | 테스트 주문은 취소 처리하고, 취소 알림(오너 취소음 채널)도 같은 형식으로 기록 |

### T6. 알림 상세 삭제 (**F6·F8**) — S 알림센터에서 알림 1건 열기 → 상세 화면
| 칸 | 기대 |
|---|---|
| 제목·본문 | 상세 화면 제목·본문 = 알림센터 행 문구와 같음 |
| 휴지통 탭 | **확인창이 먼저 뜸** (바로 삭제되지 않음) · 「취소」 → 그대로 남음 |
| 실패 | 비행기 모드 켠 뒤 휴지통 → 확인 → **실패 토스트**가 3초 표시되고 화면에 머묾 |
| 성공 | 비행기 모드 끄고 다시 삭제 → 목록에서 사라짐 · 미읽음이었다면 종 −1 · DB 에서 삭제 기록 확인 |

### T7. 메신저 설정 알림 토글 (**F10**) — S 메신저 홈 → 설정 시트 → 알림 토글
| 칸 | 기대 |
|---|---|
| 실패 | 비행기 모드에서 토글 → **오류 안내 표시** |
| 성공 | 정상 상태에서 토글 → 내정보 알림 설정 화면에도 같은 값 · 원래 값으로 되돌림 |

### T8. 화면 표시 (**F11**) — 캡처만
- 확인할 화면: 알림센터 탭바·목록, 알림종 미리보기, 오너 알림 목록, 관리자 알림 목록(A).
- 판정 기준:
  - 선택 탭 글자: 흰색이 아닌 테마 색
  - 카드 모서리: 4px
  - 오너 목록 시간: 「오늘 오후 3:12」 형식 (앱 언어를 따름)
  - 관리자 미읽음 행: 노란색(amber) 대신 테마 경고색

### T9. 관리자 포인트 충전 승인 (A · 필수 푸시) — X 가 최소 금액 포인트 충전 요청 → A 에서 승인
실행 직전에 보고서에 한 줄로 적는다: 충전 금액.

| 칸 | 기대 |
|---|---|
| 관리자 | A 관리자 종에 처리 대기 +1 → 승인 후 −1 |
| 발송 | X 에 sent (필수 푸시 — X 의 알림 설정과 관계없이 발송) |
| 문구 | 제목 「{p}P가 충전됐어요」 · 내용 「현재 잔액 {b}P」 |
| 숫자 | X 종 +1 |

### T10. 아이폰 (I) — T1 과 T2 를 I 대상으로 1회씩 (보내는 쪽은 S)
| 칸 | 기대 |
|---|---|
| 발송 | `notification_deliveries` sent (APNs) |
| 표시 | 잠금 화면·알림센터 표시, 제목·내용 캡처 |
| 아이콘 | 홈 화면 아이콘 숫자 = I 의 A + B (W 에서 I 계정으로 조회하거나 DB 로 계산) |

### T11. 다른 기기 동기화 (S ↔ W, 같은 계정)
- S 에서 알림 1건 읽음 → W 종 숫자가 **새로고침 없이 10초 안에** −1 인지 확인한다. 걸린 초를 적는다.
- S 에서 「모두 읽음」 → W 종 0, 하단 채팅 숫자는 그대로.

---

## 5. 보고 형식 (이 형식 외 서술 금지)
1. **첫 줄:** 측정 시작·끝 시각(PHT) · Production SHA(시나리오별) · 기기별 앱 버전.
2. **표:** 시나리오 × 칸 = 판정 / 기대 / 실제 / 증거.
   - 증거 = 캡처 경로 + DB 행 id·시각 + `dumpsys` 원문 일부.
3. **FAIL 목록:** 재현 순서와 실제 값만 적는다. 원인 추정·수정 제안은 쓰지 않는다.
4. **NOT_PROVEN 목록:** 왜 측정하지 못했는지 사실만 적는다.
5. **범위 밖 관찰.**
6. **증거 파일:** `docs/audit/evidence/notif-device-2026-10-28-cursor/` 아래에 두고 경로만 보고한다. 커밋하지 않는다.
