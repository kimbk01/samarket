# 통화 잔여 위험 원인별 설계안 (2026-11-09)

상태: **설계안 승인 · R1 구현(Owner 「R1부터 구현」 2026-11-09) · R2~R5 미구현**. 선행: `docs/audit/call-outgoing-peer-name-design-2026-11-09.md` (`c89e0e37c`, Production 15:41 PHT 반영).
기준 코드: `origin/main` `5b5b203fc`. 시간 PHT. 운영 DB·Vercel 로그는 읽기 전용 조회.

## 0. Owner 지시

> 남은 위험이 없도록 철저히 분석해서 … 땜방이나 추측으로 하지 말고, 누수 누락 병목 까지 철저히 확인 해서 수정안을 보고 해라

## 1. 결함 목록 (증거 확정분만)

| # | 결함 | 분류 | 증거 | 영향 |
|---|---|---|---|---|
| R1 | 통화 확인창 이름 ≠ 실제 발신 이름 (남은 3곳) | 누락 | 코드 | 매장 주문 구매자: 확인창 「매장명」 → 발신 화면 **사장님 개인 닉네임** 노출. 거래 채팅: 확인창 「상대방」 고정, 발신 화면 이름 없음 |
| R2 | 앱 「통화 알림 점검」이 통화 수신 채널 꺼짐을 감지 못함 | 누락 | 코드 + 기기 dumpsys | 사용자가 통화 알림 채널을 꺼도 「정상」으로 안내 |
| R3 | 수신 확인(push-ack)이 다른 기기의 발송 행에 기록됨 | 오기록 | 운영 DB **22건/30일** | 다기기 사용자의 수신 여부를 잘못 판정 |
| R4 | 수신 화면 표시 결과가 서버에 없음 (Android 표시 결과·iOS 수신 자체) | 누락 | 운영 DB: iOS 수신 확인 **0/97건**, Android 수신 확인값 채널 중요도 **전부 -1000** | 「발신 안 됨」 같은 신고를 판정할 수 없음 (14:55 건이 이 이유로 미판정) |
| R5 | 친구 찾기 첫 발신이 방 생성 → 통화 생성 순차 왕복 | 병목 | Vercel 로그 | 방 없는 상대에게 첫 발신 시 약 0.85초 추가 대기 |

결함 아님으로 확인한 항목 (증거와 함께 제외):
- 15:37 BK→Shawn Park 30.2초 「취소」: 같은 기간 iPhone 발신 무응답 39건이 정상 「부재중」 처리 → 무응답 처리 결함 근거 없음. 또 이 시험은 수정 전 배포본 `77469ff47`에서 처리돼 이름 수정 판정에 쓸 수 없음.
- 김선희 Android 전체 화면 알림 권한 없음(36/40): 같은 조건에서 14일간 18건 정상 연결 → 14:55 실패 원인 근거 없음 (기기 설정 안내 대상일 뿐).
- 상대 프로필이 없는 방(탈퇴 등)의 이름: 진입 화면·서버 모두 실제 이름이 없음(「새 대화」/「회원xxxx」). 표시할 실제 이름이 존재하지 않으므로 변경 없음.
- 발신 생성 API 의 푸시 발송: 이미 응답 후 분리 실행(`startIncomingCallVoipDispatchDetached`) — 병목 아님.

## 2. 원인·수정안

### R1. 확인창 이름 ≠ 발신 이름 (웹 · 통화 이름 · 1커밋)

**원인 (코드 확정)**
- 방 헤더 음성 확인(`components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx` 340행 `voiceConfirmPeerLabel`)과 매장 주문 화면(`CommunityMessengerRoomPhase2StoreOrderChrome.tsx` 192행 `buyerVoicePeerLabel`)은 확인창에 매장명을 보여 주지만, 「발신」은 `vm.startManagedDirectCall("voice")` → `use-messenger-room-phase2-controller.ts` 735행 `snapshot.room.title` 을 넘김.
- 1:1 방 `title` 은 서버가 상대 프로필 이름으로 만듦(`service.ts` 2715행 `defaultDirectTitle = peerProfilesBase[0]?.label`) → 매장 주문 구매자는 **사장님 개인 닉네임**이 발신 화면·CallKit 에 표시. 계약 `resolveStoreOrderBuyerVoicePeerLabel` 주석 「매장명만, room.title 금지」 위반.
- 거래 채팅 `components/chats/TradeChatCallHeaderButtons.tsx`: 확인창 `peerLabel={t("common_partner")}`(「상대방」 고정), 발신 108행 이름 없음. 화면에는 `room.partnerNickname`(`ChatDetailView.tsx` 418행)이 있는데 전달 안 됨.
- 운영 사용량: 매장 주문 통화 마지막 07-24, 거래 통화 마지막 05-09 (전체 37·130건). 현재 사용은 적지만 경로는 열려 있음.

**수정**
1. `startManagedDirectCall(kind, dialPeerLabel?: string | null)` — 값이 오면 그 이름으로 발신, 없으면 기존 `snapshot.room.title`.
2. 방 헤더·매장 주문 화면의 확인창 「발신」이 **확인창에 표시한 같은 값**을 넘김 (`voiceConfirmPeerLabel`·`buyerVoicePeerLabel`). 판매자 쪽은 기존 그대로(room.title = 구매자 닉네임).
3. 거래 채팅: `TradeChatCallHeaderButtons` 에 `peerDisplayName` prop 추가 → `ChatDetailView` 가 `room.partnerNickname` 원본 전달. 확인창 표시 = `peerDisplayName || t("common_partner")`, 발신 = `peerDisplayName`(없으면 빈 값 → 발신 엔진이 서버 닉네임으로 채움, `c89e0e37c` 규칙).

**영향**: 웹 4파일(컨트롤러·헤더·매장 주문 화면·거래 버튼+호출부). 다른 `startManagedDirectCall` 호출처(1:1 점 메뉴·타임라인·친구 프로필 시트·헤더 통화 중 복귀)는 인자 없음 → 기존 동작 그대로. 서버·네이티브 무변경, 앱 재빌드 불필요.

### R2. 「통화 알림 점검」이 통화 채널 꺼짐 미감지 (웹 · 권한 점검 · 1커밋)

**원인 (코드 + 기기 확인)**
- 판정식 `anyIncomingChannelEnabled = !legacyBlocked || !voiceBlocked || !videoBlocked` (`NotificationReceiveGate.java` 81행, 웹 `android-native.adapter.ts` 46~50행 동일).
- `legacy` 채널 `dibay_calls_incoming_v7` 는 현재 수신 경로에서 만들지 않음 — 연결 기기 dumpsys: Xiaomi `8b37179f7d94` 에 `dibay_native_voice_incoming_v2`(중요도 4)만 있고 v7 없음. 없는 채널은 「꺼짐 아님」으로 판정 → **OR 식이 항상 참** → 실제 음성·영상 채널을 꺼도 「정상」.

**수정 (웹만)**
- `lib/permissions/permission-manager/adapters/android-native.adapter.ts`: 통화 채널 판정을 `!nativeVoiceChannelBlocked && !nativeVideoChannelBlocked` 로 (네이티브가 2026-06-29 `2a377f1cd` 부터 두 값을 넘김 → 설치된 모든 빌드 호환). 네이티브 합산값 `incomingCallChannelEnabled`·legacy 값은 판정에 쓰지 않음.
- 아직 만들어지지 않은 채널(첫 수신 전)은 「꺼짐 아님」 — 첫 수신 때 HIGH 로 생성되므로 기존과 같음.

**하지 않는 것 (회귀 방지)**: 네이티브 `NotificationReceiveGate` 는 바꾸지 않음. 이 값이 거짓이면 `IncomingCallPushDelivery.java` 44~63행이 **수신 화면 자체를 띄우지 않고 종료**하므로, 판정만 엄격하게 바꾸면 지금 울리는 전화가 안 울리게 됨.

**영향**: 웹 1파일. 바뀌는 동작 = 통화 채널을 끈 사용자에게만 「통화 알림 꺼짐」 안내 노출.

### R3. 수신 확인이 다른 기기 행에 기록 (서버 · 1커밋)

**원인 (DB 확정)**: `app/api/community-messenger/calls/[sessionId]/push-ack/route.ts` 56~64행이 같은 사용자의 **가장 최근** `call_ringing` 발송 행 1개만 고르고 `deviceId` 로 거르지 않음 → 기기 2대 이상이면 마지막 행에 덮어씀. 운영 30일: ack 기기 ≠ 행 기기 **22건**, 다기기 사용자 3행 중 1행만 ack(11-05·11-08 다수).

**수정**: 요청의 `deviceId` → `user_devices.device_id` 로 그 사용자 기기 행 id 조회 → 같은 `device_id` 의 발송 행에 기록. 일치 행이 없을 때만 기존(최근 행) + `deviceMatched:false` 표시. 응답 형식 무변경(구 앱 호환).
**영향**: 서버 1파일. 이 값을 읽는 `hasMissedCallPresentationEvidence`(`call-multi-device-authority.ts`)는 「어느 행이든 증거 있음」 판정이라 결과 불변.

### R4. 수신 화면 표시 결과 미보고 (네이티브 Android·iOS + 서버 · 앱 빌드 필요)

**원인 (코드·DB 확정)**
- Android: 수신 확인은 FCM 수신 직후 1회(`DibayFirebaseMessagingService.java` 207행) — 그 뒤 만료·이미 처리·서버 종료 상태·게스트·알림 권한 등으로 **화면을 띄우지 않고 끝나는 분기**(같은 파일 202·219·243·258행, `IncomingCallPushDelivery.java` 24·41·63행)의 결과는 서버에 없음. 또 ack 의 `channelImportance` 는 쓰지 않는 v7 채널을 재므로 **14일 전부 -1000** (의미 없음).
- iOS: VoIP 수신 확인 경로 없음 → iOS 수신 발송 97건 중 확인 **0건**.
- 결과: 14:55 「발신 안 됨」처럼 수신 폰에 벨이 떴는지 서버로 판정 불가.

**수정**
1. 서버 push-ack 에 선택 필드 `stage: "received" | "presented" | "suppressed"`, `reason`, `mediaChannelImportance` 추가 (없으면 기존 `received` 로 처리 → 구 앱 호환). `presented`/`suppressed` 는 같은 기기 행의 `provider_response.nativePresentation` 에 기록 (R3 기기 매칭 사용).
2. Android: 수신 Activity·알림을 실제로 띄운 지점(NativeVoice/NativeVideo `shouldHandleIncoming` 처리 후 표시 완료)에서 `presented`, 위 종료 분기마다 `suppressed`+이유 1회 전송 (기존 `IncomingCallPushAckHelper` 재사용, 4초 타임아웃·비동기 → 수신 지연 없음). `channelImportance` 는 통화 종류별 실제 채널(`dibay_native_voice/video_incoming_v2`) 값.
3. iOS: PushKit 수신 → `reportNewIncomingCall` 완료 콜백에서 `presented`(오류 시 `suppressed`+오류코드) 전송.
4. 판정 도구: 운영 조회 1개 쿼리로 callId → 기기별 `received/presented/suppressed` 확인 (문서에 쿼리 첨부).

**통화 규정 적용**: 네이티브 통화 수신 경로 변경 → 통화 단독 커밋·실기기 행렬 필수, 빌드 번호 증가는 Owner 일괄 빌드 때 1회 (`native-build-batched-later`). 표시 결과 전송은 **수신 동작에 관여하지 않는 사후 보고**만 (화면 표시 순서·조건 무변경).

### R5. 친구 찾기 첫 발신 순차 왕복 (웹·서버 · 성능 · 1커밋)

**측정 (11-09 14:55, Vercel 로그)**: 방 생성 `POST /rooms` 14:55:45.141 시작 → 45.98 완료(약 0.84초) **후** 통화 생성 `POST /rooms/{id}/calls` 46.164 시작 → 세션 생성 47.352 (1.19초). 방 안 재발신(14:56:07.510 → 08.874, 1.36초)은 방 생성 왕복 없음.
**원인**: `callV4ResolveOutgoingRoomId`(`call-v4-api.ts` 28행)가 방이 없으면 `POST /rooms` 를 기다린 뒤 통화 생성 → 클라이언트 왕복 2회.
**수정**: 통화 생성 API 가 `peerUserId` 만 받아도 서버 안에서 1:1 방 확보(기존 `POST /rooms` 와 같은 서버 함수·권한 검사) 후 세션 생성 → 왕복 1회. 클라이언트는 방이 없을 때 새 경로 사용. 확인창 열 때 방 미리 만들기는 **채택 안 함** — 취소 시 빈 방이 목록에 「메시지 없음」으로 남음(누수).
**영향**: 서버 통화 생성 경로 변경 → 통화 단독 커밋·실기기 행렬. 기존 `roomId` 경로 무변경.

## 3. 반영 순서·단위 (한 번에 한 원인)

| 순서 | 항목 | 단위 | 앱 빌드 |
|---|---|---|---|
| 1 | R1 확인창=발신 이름 | 웹 통화 단독 커밋 → main 1회 | 불필요 |
| 2 | R3 수신 확인 기기 매칭 | 서버 단독 커밋 → main 1회 | 불필요 |
| 3 | R2 통화 알림 점검 판정 | 웹 권한 단독 커밋 → main 1회 | 불필요 |
| 4 | R4 수신 표시 결과 보고 | 서버(호환 필드) 먼저 → 네이티브 Android·iOS 커밋 | **필요** (Owner 일괄 빌드) |
| 5 | R5 첫 발신 단일 왕복 | 서버+웹 통화 단독 커밋 | 불필요 |

각 단계: 최종 트리에서 `typecheck:build`·`typecheck:test`·관련 vitest·eslint 1회, `git show HEAD:<file>` 확인, main fast-forward 1회.

## 4. 롤백
각 항목 단독 커밋 → `git revert` 1개. R4 서버 필드는 선택 필드라 네이티브 미설치·롤백 상태에서도 기존 동작. DB 스키마 변경 없음(모두 `provider_response` JSON).

## 5. 검증 (실기기 · Production SHA 매회 기록 · 서버 시각 운영 DB 대조)
- R1: 매장 주문 구매자 음성 → 발신 화면 = 매장명 / 판매자 → 구매자 닉네임 / 거래 채팅 음성·영상 → 확인창·발신 화면 = 상대 닉네임 / 1:1 방 헤더·점 메뉴 이름 불변.
- R2: 시험 기기에서 음성 통화 채널 끄기 → 앱 점검 「꺼짐」 안내, 켜면 정상 (기기 설정 변경은 시험 후 원복).
- R3: 기기 2대 로그인 계정 수신 → 기기별 행에 각자 ack.
- R4: Android 화면 켜짐·잠김·앱 종료 / iPhone 잠김·앱 종료 수신 → `presented` 기록, 만료 푸시 → `suppressed:expired`.
- R5: 방 없는 상대 첫 발신 → `POST /rooms` 요청 0회, 세션 생성까지 시간 측정 비교.
- 공통 통화 행렬: Android↔iPhone 음성·영상 발신·수신, 거절, 벨 중 취소, 취소 후 지연 푸시 재울림 없음, 통화 중, 무응답 타임아웃, 종료 후 즉시 재발신.

## 6. 남는 것 (정직 표기)
- 14:55 「발신 안 됨」 1건은 R4 이전 데이터라 **앞으로도 원인 판정 불가**. R4 반영 후 재발 시 기기별 표시 결과로 판정.
- 이 문서의 결함은 모두 코드·운영 DB·Vercel 로그로 확인한 것이며, R1·R2 의 사용자 화면 결과는 실기기 미확인(NOT_PROVEN).
