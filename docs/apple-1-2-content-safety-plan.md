# Apple App Store 1.2 — 콘텐츠 안전 P0/P1 수정 계획·승인 대기 항목

브랜치 `feat/apple-12-content-safety` 기준. 이 문서의 SQL·스토리지·약관·통화 항목은 **Owner 승인 전 실행하지 않는다.**
운영 DB 사실은 2026-11-05 읽기 전용 조회 결과다.

## 1. 승인 필요 DB 마이그레이션 (main 반영 전 적용)

`supabase/migrations/20271106100000_report_targets_store_review_and_feed_ad.sql`

- `store_reports.target_type` 허용값에 `review` 추가 (배달 리뷰 신고).
- `reports.target_type` 허용값에 `feed_ad` 추가 (광고 신고).
- 기존 행 변경·삭제 없음. 제약만 넓힌다.
- **운영 대조(2026-11-05 읽기 전용):**
  - 현재 CHECK 이름·값이 파일과 같다: `reports_target_type_check`(user·product·chat_room·chat_message·post·comment), `store_reports_target_type_check`(store·product). 파일은 여기에 `feed_ad`·`review` 만 더한다.
  - 기존 행: `reports` 10건(chat_room 1 · product 7 · user 2), `store_reports` 0건 → 새 CHECK 검증을 모두 통과한다.
  - 두 표에 사용자 트리거 없음. FK(`product_id→posts`·`room_id→product_chats`·`store_id→stores`)는 새 신고가 쓰지 않거나(광고: product_id null) 리뷰의 매장 id 를 넣으므로 충돌 없음.
- **관리자 처리 경로:**
  - 광고 신고: 통합 큐 RPC `admin_reports_unified_page` 가 ELSE 분기로 `product` 칸에 넣는다. 화면 라벨은 행의 `target_type`(feed_ad → 「광고」)로 표시한다. `admin_decide_trade_report` 의 반려·처리완료는 동작하고, 「숨김」은 게시물이 아니라 `post_not_found` 를 돌려준다 → 광고 중단은 기존 광고 관리 화면에서 한다.
  - 리뷰 신고: 통합 큐의 `store_reports` 원장으로 보이고, 처리 API(`/api/admin/store-reports/[id]`)는 대상 종류와 무관하게 상태만 바꾼다. 리뷰 숨김은 기존 `/api/admin/store-reviews` 로 한다.
- **API 호환:** 제약을 넓히기만 하므로 지금 운영 중인 코드(새 값을 보내지 않음)는 적용 전후 동작이 같다. 반대로 새 웹 코드를 마이그레이션 없이 배포하면 리뷰·광고 신고만 500(CHECK 위반)이 된다.
- **적용 순서:** ① 마이그레이션 적용(Owner 승인) → ② 위 CHECK 정의 재조회로 확인 → ③ main 반영(웹 배포). ① 없이 ③ 금지.
- **실패 시 복구:** 파일이 `begin … commit` 한 트랜잭션이라 중간 실패 시 자동으로 전부 되돌아간다(기존 CHECK 유지). 적용 후 되돌릴 때는 `feed_ad`·`review` 행이 0건인지 먼저 확인하고 이전 정의로 다시 만든다. 새 값 행이 있으면 삭제하지 않고(운영 데이터 삭제 금지) 롤백을 멈추고 보고한다.

## 2. P0-2 채팅 첨부 공개 URL

### 확인된 사실

- 운영 `storage.buckets` 에 `post-images`(public=true)만 있고 `messenger-media` 버킷은 **없다**.
- 코드에는 비공개 전환(C-4)이 이미 구현돼 있다.
  - `lib/community-messenger/server/messenger-media-bucket.ts`: `messenger-media` 버킷이 존재하고 public=false 일 때만 신규 업로드를 그쪽으로 보낸다. 없으면 `post-images`(공개) 유지.
  - `app/api/community-messenger/rooms/[roomId]/messages/[messageId]/media/route.ts`: 참가자(또는 `chats` 권한 관리자 + 감사) 확인 후 10분 서명 URL 로 302.
  - `lib/community-messenger/media/messenger-media-ref.ts`: 메시지 metadata 에 bucket/path 기록, 링크는 조회 라우트 경유.
- **확인된 보안 결함:** 메신저 첨부가 공개 버킷에 있어 URL 만 알면 비로그인으로 HTTP 200 열람된다(감사 시 직접 확인). 제3자 실제 유출 여부만 NOT_PROVEN 이다(유출로 단정하지 않는다).
- 공개 상태 기존 파일(2026-11-05 `storage.objects` 직접 조회, `{uid}/community/messenger-*` 경로): **580개 · 약 97.6MB · 62개 방**
  - messenger-image 412 (2026-04-16~10-30) · messenger-voice 146 (04-05~08-09) · messenger-file 22 (06-09~08-23)
  - 거래 채팅 첨부도 메신저 방으로 올라가므로 이 580개에 포함된다.
  - 감사 보고의 「360개」는 잘못 센 값이다. 같은 경로 기준 재조회 결과가 580개다.
- 레거시 거래 채팅 표(`chat_messages` 1,894행 · `product_chat_messages` 361행)에는 `post-images` 참조가 0건이다. 다만 레거시 송신 코드(`lib/chats/chat-image-bundle.ts`)는 지금도 `post-images` 공개 URL 만 받으므로, 이 경로로 새 이미지가 오면 공개 상태가 된다.
- `meeting-open-chat/` 경로 4개(2026-03-31·08-23)는 메신저 첨부 경로가 아니다(모임 오픈채팅 — 성격 미확인 NOT_PROVEN).
- **비공개 버킷을 만들어도 기존 580개는 공개 상태로 남는다.** 바뀌는 것은 생성 이후 새로 올리는 파일뿐이다.

### 전환 단계 (각 단계 Owner 승인)

1. **버킷 생성** — `supabase/manual-apply-messenger-media-private-bucket.sql` 적용.
   비공개 버킷 생성 + anon/authenticated 의 이 버킷 접근 RESTRICTIVE 차단. 기존 `post-images` 파일·정책 무변경.
   효과: 적용 후 최대 60초(음성 캐시) 내 신규 메신저 첨부가 비공개 버킷으로 간다. 기존 첨부 재생은 그대로(공개 URL 유지).
   롤백: env `MESSENGER_PRIVATE_MEDIA_BUCKET=off` → 신규 업로드가 다시 `post-images` 로. 이미 비공개에 올라간 파일은 조회 라우트로 계속 열람.
   실기기 확인: Android·iPhone 에서 이미지·음성·파일 전송 → 상대 수신·재생, 비참가자 계정으로 조회 라우트 403, 직접 public URL 404.
   코드 확인(로컬 테스트 `messenger-media-private-access.test.ts` 18건 PASS):
   - 업로드: 버킷이 있고 public=false 일 때만 비공개로 보냄, env off 면 레거시.
   - 조회: 참가자만 서명 URL, 비참가자 403, 메시지가 참조하지 않는 경로 404, 삭제 메시지·다른 방 별칭 거부.
   - 재생: 음성 `/messages/{id}/audio` 는 메시지에 기록된 버킷으로 서명(비공개 버킷 지원).
   - 푸시: 첨부 URL 을 싣지 않음(라벨만).
   - 새 메시지에 저장되는 `publicUrl` 은 열리지 않는 형식(`/object/public/messenger-media/...`)이다. 화면 표시는 조회 라우트로 바꿔 그리므로 영향이 없어야 하나, 실제 앱 화면은 버킷 적용 후 실기기로만 확인할 수 있다(NOT_PROVEN).
2. **레거시 거래 채팅 첨부** — 별도 설계 필요(클라이언트가 `post-images` 공개 URL 을 직접 보내는 구조). 이번 브랜치에서 변경하지 않음.
3. **기존 공개 파일 이전** — 파일 이동·원본 삭제·버킷 권한 변경은 별도 승인. 게시글 이미지(`post-images` 의 공개 게시물 사진)와 채팅 첨부가 같은 버킷에 섞여 있어, 버킷 전체를 비공개로 바꾸면 게시글 이미지가 깨진다 → 채팅 경로만 골라 복사 후 metadata 갱신, 확인 뒤 원본 삭제 순서로 설계해야 한다.

## 3. 약관 개정안 (게시 전 초안 — 게시는 Owner 승인 후)

### 재동의 영향

- **Owner 결정(2026-11-05): 기존 version 본문을 덮어쓰지 않고 새 version 으로 게시한다.** 이번 단계에서는 게시하지 않는다.
- 현재 게시 terms version = `2026-04-store-review` (ko 258자 · en 501자). 이미 금지 행위·신고·차단·기록 보관 문장이 있다. 무관용·24시간·제재 단계 문장은 없다.
- **현재 동의 게이트 동작(코드 확인):**
  - `hasStoreTermsConsent` 는 회원의 `terms_version`·`privacy_version` 이 게시된 ko version 과 **정확히 같아야** 동의로 본다.
  - 미동의 회원의 새 쓰기는 `signup_incomplete`(403)로 막히고 동의 화면으로 보내진다. 신고·차단·문의·나가기·본인 글 삭제·주문 이행 등은 예외(`member-consent-mutation-policy.ts`).
  - 「알림만 하고 동의는 유지」하는 모드는 **없다**.
- **따라서 지금 코드로 새 version 을 게시하면 = 기존 회원 전원 재동의 강제**가 된다.
  - 운영 회원(2026-11-05, 삭제·탈퇴 제외): 128명 — 현재 version 동의 112명, 동의 기록 없음 16명.
  - Owner 지시의 「130명」과 기준 차이가 있다(관리자·정지 포함 여부 등 — 미확인).
- **충돌(보고만, 임의 선택 안 함):** 「새 version 게시」와 「일괄 재동의 강제 금지」는 지금 코드로 동시에 만족할 수 없다. 둘 중 하나가 필요하다.
  1. 재동의를 받는다(새 version 게시 = 강제).
  2. 동의 게이트에 「이전 version 동의를 유효로 인정」하는 규칙을 추가한다(인증·동의 코드 변경 — 별도 승인 대상).
- 변경 내용이 법적으로 재동의가 필요한 「불리한 변경」인지는 **법률 판단 필요(NOT_PROVEN)**.

### 초안 (ko)

```
dibaY는 커뮤니티, 거래, 주문, 채팅 기능을 제공합니다.

[금지 콘텐츠·행위]
불법 행위, 사기, 혐오·차별 표현, 괴롭힘·위협, 성적 착취(아동 관련 콘텐츠 포함), 성매매 알선, 음란물, 폭력 조장, 개인정보 유출, 스팸, 타인 명의 도용을 금지합니다. dibaY는 이러한 콘텐츠와 이용자에 대해 무관용 원칙을 적용합니다.

[신고와 처리]
모든 게시물·댓글·프로필·채팅 메시지·리뷰·광고는 신고할 수 있습니다. 운영자는 일반 신고를 접수 후 24시간 이내에 1차 검토하며, 아동 안전·생명·신체 위협 등 긴급 신고를 우선 처리합니다.

[차단]
회원은 다른 회원을 차단할 수 있으며, 차단한 회원의 게시물·댓글·리뷰는 보이지 않고 메시지를 주고받을 수 없습니다.

[제재]
위반이 확인되면 콘텐츠 숨김·삭제, 기능 제한, 계정 정지 또는 영구 이용 정지 조치를 할 수 있습니다. 운영자는 심사와 안전을 위해 필요한 기록을 보관할 수 있습니다.

[계정]
회원은 본인 계정으로만 서비스를 이용해야 합니다. 필리핀 전화번호 인증이 필요한 기능은 정회원 인증 후에만 사용할 수 있습니다.

문의: support@dibay.app
```

### 초안 (en)

```
dibaY provides community, trade, order, and chat features.

[Prohibited content and conduct]
Illegal activity, fraud, hate or discriminatory speech, harassment or threats, sexual exploitation (including any content involving minors), solicitation of prostitution, pornography, incitement to violence, leaking personal information, spam, and impersonation are prohibited. dibaY has zero tolerance for such content and users.

[Reporting and review]
Any post, comment, profile, chat message, review, or ad can be reported. We complete an initial review of standard reports within 24 hours and prioritize urgent reports such as child safety or threats to life or safety.

[Blocking]
You can block other members. Posts, comments, and reviews from blocked members are hidden, and you cannot exchange messages with them.

[Enforcement]
When a violation is confirmed, we may hide or remove content, restrict features, or suspend or permanently ban the account. We may retain records needed for review and safety.

[Account]
Use the service only with your own account. Features that require Philippine phone verification are available only after full membership verification.

Contact: support@dibay.app
```

- 24시간 처리 측정: 관리자 신고 큐의 접수 시각(`created_at`)과 상태 변경 시각으로 계산한다. 이번 브랜치에서 별도 지표 화면은 만들지 않았다.
- 기존 게시물 자동 삭제·자동 제재 없음.

## 4. 통화·메신저 HARD LOCK 영향 분석 (구현 보류)

### 메신저 텍스트 금칙어 필터

- 대상 라우트: `app/api/community-messenger/rooms/[roomId]/messages/route.ts` POST (텍스트만). 통화 기록 메시지(`call_stub`)는 별도 경로 `app/api/community-messenger/calls/stub-message/route.ts`·`rooms/[roomId]/calls/route.ts` 가 쓴다.
- 제안: 위 POST 에서 `content` 만 검사해 400(`content_filter_blocked`)을 반환. `service.ts` 의 `sendCommunityMessengerMessage`·통화 함수·푸시 발송은 변경하지 않는다.
- 영향: 텍스트 전송 실패 응답 1종 추가 → 클라이언트 낙관적 메시지가 실패 상태로 남는 기존 경로를 탄다(실패 문구 노출 확인 필요). 통화 발신·수신·종료·VoIP/FCM 경로는 호출하지 않는다.
- 위험: 전송 지연(정규화·캐시 조회 1회), 오차단 시 메시지 미전송. 구 바이너리 영향 없음(웹 응답만).
- 통화 규정에 따라 **단독 커밋·실기기 행렬 검증·Owner 승인 후** 구현한다.

### 통화 기록 신고·차단

- 통화 기록 UI(`components/community-messenger/call-history/*`)에는 현재 신고·차단 동작이 없다.
- 제안: 통화 기록 행/상대 상세에 기존 `/api/community-messenger/reports`(reportType user)·기존 차단 경로를 붙이는 UI 만 추가. 통화 세션·기록 데이터는 변경하지 않는다.
- 이번 브랜치에서 통화 기록 파일은 변경하지 않았다(Owner 지시: 별도 승인 전 통화기록 수정 금지).

## 5. 금칙어 기본 목록

`lib/community-feed/banned-word-match.ts` — `BASELINE_BANNED_TERMS` 39개(ko 20 · en 12 · tl 7), 예외 문구 8개(시발점·병신년 등).
운영 목록(관리자 화면)이 비어 있어도 기본 목록이 적용된다. 운영 목록 추가는 Owner 확인 후.
