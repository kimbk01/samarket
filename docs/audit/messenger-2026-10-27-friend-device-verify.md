# 친구 흐름 실기기 시험 (2026-10-27 09:48~10:04 PHT)

> 환경: Production `830f25db4`(코드 = `9cdb5e383`) · Samsung q테스트1 1.2.4 (13) · iPhone w테스트1 1.2 (15).
> 조작: Samsung 은 Claude(adb), iPhone 은 Claude(미러링, Owner 지시 10:00) — 앱 완전 종료·첫 수락은 Owner.
> 판정 근거: 운영 DB(`community_friend_requests`·`user_social_relations`·`notification_events`·`notification_deliveries`), 화면 캡처, WebView 응답.

## 결과

| # | 시험 | 결과 |
|---|---|---|
| F1 | Samsung 검색 결과 「친구 요청」 → iPhone 팝업 → Samsung 「요청 취소」(확인 창) | ✅ 요청 09:48:31 pending → 이름·사진 정상 팝업(Owner) → 취소 09:49:32 cancelled, iPhone 팝업 자동 닫힘(Owner). 다시 검색 시 「요청됨」·「요청 취소」 표시 |
| F2 | iPhone 앱 완전 종료 상태에서 요청 → 앱 켜서 수락 | 요청 09:52:50 pending · **푸시 0건(결함 FR-D1)** · 앱 켬 → 팝업 → 수락 09:58:02 · 양쪽 friend 행 09:58:02 · 수락 알림 Samsung 발송(sent) |
| F2 세 화면 | 친구 탭 · 방 상단 관계 바 · 프로필 | ✅ Samsung: 친구 탭 「w테스트1 온라인」·바 사라짐·「친구」 표시·목록 「?」 사라짐 / iPhone: 「새 친구 1 q테스트1」·바 없음·프로필 「친구」 |
| F3-1 | Samsung 친구 삭제(확인 창) | ✅ 10:01:56 양쪽 관계 행 삭제 · iPhone 친구 목록에서 즉시 빠짐 · 대화 목록 「?」 표시 · 방 재진입 시 「친구가 아닌 사용자」 바 |
| F3-2 | 다시 요청 → iPhone(방 화면) 팝업 → 거절 | ✅ 10:02:55 요청 → 팝업 → 거절(버튼 로딩 표시) 10:03:10 rejected · 「…친구 요청을 거절했습니다」 스낵바 |
| F3-3 | 거절 뒤 다시 요청 | 서버 차단 ✅(`POST /friend-requests` 400 `request_rejected`, 상태 rejected 유지) · **화면 안내 없음(결함 FR-D2)** |

## 결함

| ID | 내용 | 증거 | 원인 |
|---|---|---|---|
| FR-D1 | 같은 날 요청을 취소하고 다시 보내면 상대에게 알림·푸시가 안 간다(앱이 꺼져 있으면 요청을 모름) | 09:48 요청: event 1건·delivery sent / 09:52 재요청: event 0·delivery 0 · Owner 「푸시 없음」 | 재요청이 같은 요청 행(`9e658188`)을 다시 쓰고, 알림 중복 키가 `cm_friend_request:<요청 id>:<날짜>` 라 같은 날 두 번째가 중복으로 버려짐 |
| FR-D2 | 거절당한 뒤 「친구 요청」을 누르면 잠깐 로딩 뒤 아무 안내 없이 그대로 「친구 요청」 버튼 | 10:03:28·10:03:56 연속 캡처 · 응답 400 `request_rejected` | 화면이 `request_rejected` 를 안내하지 않고, 검색 결과도 거절 상태를 버튼에 반영하지 않음(코드 위치 미조사) |

## 관찰 (결함 판정 전 · 기록만)

- 검색 결과에서 「친구 요청」·「요청 취소」를 누르면 결과 창이 바로 닫혀 누른 결과를 그 자리에서 볼 수 없다(F1 2회).
- iPhone 이 대화방 안에 있을 때 상대가 친구를 삭제하면 방 상단 바가 실시간으로 바뀌지 않고, 다시 들어가야 보인다.
- iPhone 대화방 재진입이 최신 메시지가 아닌 앞쪽(07:57)에서 열리고 아래로 가기 버튼이 보였다.
- Samsung 친구 탭 진입 때 약 2초 흰 화면.
- iPhone 방 머리글에서 Samsung(앱 켜짐) 상태가 「자리 비움」으로 보인 때가 있다.

## NOT_PROVEN

- 알림을 눌러 해당 화면으로 이동(FR-4): FR-D1 로 iPhone 푸시가 없었고, Samsung 수락 알림은 앱이 앞에 있어 시스템 알림이 표시되지 않음.
- Xiaomi·태블릿.

## 시험 뒤 상태

- q테스트1 → w테스트1 요청 `9e658188` = rejected (거절 정책상 q 는 다시 요청 불가). 원복하려면 운영 DB 변경이 필요하다 — 승인 전 그대로 둔다.

## 수정 후 확인 (10:15~10:18 PHT, Production `c3e241c9f` READY, 두 앱 재시작)

| ID | 수정 | 확인 |
|---|---|---|
| FR-D1 | `4619386ab` 알림 중복 키 = 요청 id + 보낸 회차(created_at) | ✅ iPhone(미러링) w→q 요청 10:16:28 → event·delivery sent / 취소 → 같은 날 재요청 10:17:17 → **event 새로 1건(`…:2026-10-27T02:17:17.370645+00:00`)·delivery sent** · Samsung 팝업 2회 |
| FR-D2 | `c3e241c9f` 메신저 스낵바 = 공통 토스트 위치(하단 탭 위) + body 포털 | ✅ Samsung 수락 직후 「w테스트1님과 친구가 되었습니다.」 스낵바가 하단 탭 위에 보임 |

## 새 결함 (범위 밖 · 보고만)

| ID | 내용 | 증거 | 원인 |
|---|---|---|---|
| **FR-D3** | 한쪽이 거절한 뒤, 거절한 쪽(w)이 먼저 요청해 친구가 되어도 거절당한 쪽(q)은 **대화·통화가 막힌다** | 10:17:29 친구 성립(양쪽 friend 행) · 옛 q→w 요청 `9e658188` = rejected 그대로 · Samsung 방 「상대가 친구 요청을 거절해 대화·통화를 할 수 없어요」·입력창 막힘 · 목록 금지 표시 · 검색 「대화를 시작할 수 없습니다」 | 거절 판정(`fetchFriendRequestRejectedByPeer` → `direct-room-peer-relation.ts:57` `directMessageDenied: "rejected_by_peer"`)이 친구 여부와 관계없이 옛 거절 행만 본다. 거절한 사람이 직접 요청·친구가 돼도 그 거절 행이 정리되지 않는다 |

- 시험 계정 q·w 는 지금 친구이지만 q 쪽에서 w 에게 대화·통화가 막힌 상태다.

## FR-D3 수정 후 확인 (10:28~10:44 PHT, Production `7abadc9cb` READY)

- 수정 `7abadc9cb`: 거절한 사람이 직접 친구 요청을 보내면, 상대→나 방향 rejected 행을 보관함 「해제」와 같은 전이(rejected → cancelled)로 닫는다.
- 시험 (운영 DB 직접 변경 없이 앱 조작만):
  1. Samsung(q) 친구 삭제 10:28:50 → 양쪽 friend 행 삭제, q→w `9e658188` rejected 그대로.
  2. iPhone(w, 미러링) 방 바 「친구 추가」 10:43:23 → w→q `dda576aa` pending · **q→w `9e658188` rejected → cancelled (responded_at 10:43:23)**.
  3. 수락 전 q 쪽 확인(WebView): 방 bootstrap `directMessageDenied: null` · 친구 API `rejectedByPeerIds: []`.
  4. Samsung 수락 10:43:46 → 양쪽 friend:true · 대화 목록 w테스트1 금지 표시 사라짐.
  5. Samsung 방에서 메시지 「frd3check」 전송 → 운영 DB 10:44:28 저장 ✅ (입력창 정상).
- 판정: **FR-D3 실기기 통과**.
- 관찰(기록만): 메시지 전송 직후 Samsung 방이 최신 메시지 위치가 아닌 위쪽을 보여 줬다(키보드 열림 상태) — 앞의 「방 재진입 위치」 관찰과 같은 계열, 원인 미조사.
- 시험 뒤 상태: q·w 친구, 거절 행 없음(정상 상태로 복귀).
