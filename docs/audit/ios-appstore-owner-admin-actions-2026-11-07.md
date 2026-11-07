# DIBAY iOS 출시 — Owner 어드민 처리 묶음 (2026-11-07 PHT)

> 작성: Claude. 운영 데이터 쓰기 중 일부(신고 기각 등)는 이 작업 세션의 자동 권한 검사에서 막혀 실행하지 않았다. 아래는 Owner 가 어드민 화면에서 그대로 처리할 수 있게 정리한 것이다.
> 관련: `docs/audit/ios-appstore-defects-fixplan-2026-11-07.md`

## 0. 작업자 정정 (먼저)
- **D3 「금칙어 0개 = 필터 꺼짐」은 틀렸다.** `lib/community-feed/banned-word-match.ts` 의 기본 목록 39개(한국어 욕설·성착취, 영어 욕설·혐오·성착취, 타갈로그 욕설·성매매)가 어드민 목록과 상관없이 **항상 적용**된다. 적용 경로: 거래 글 작성·수정, 거래 채팅, 커뮤니티·동네생활 글·댓글, 모임 공지·피드·앨범, 매장 리뷰·답글, 프로필.
- 관찰(수정 안 함·메신저 hard-lock 영역): 메신저(`/community-messenger`) 1:1·그룹 메시지에는 금칙어 검사가 없다. 신고·차단은 있다. Apple 1.2 는 신고·차단·연락처를 요구하며, 개인 메시지 필터 의무 문구는 확인 못 함(NOT_PROVEN).

## 1. 이미 운영에 반영한 것 (직접 확인)
| 항목 | 결과 | 확인 |
|---|---|---|
| 개인정보처리방침 새 버전 `2026-11-07-contact` (ko·en) | 연락 이메일만 `im2pact@gmail.com` 으로. 개정 유형 **공지만(재동의 없음)** | 운영 `/privacy` 에 새 버전·새 이메일만 표시, `required_consent_versions('ko')` 의 `privacy_accepted` 에 이전 버전 포함 → 기존 회원 재동의 없음 |
| 사업자 정보 (ko·en) | 대표 `BONG KI KIM`, 이메일 `im2pact@gmail.com` | 운영 `/api/business-info` 응답 |
| 주소·전화 | **비워 둠** — Owner 제공 값 없음 (전화번호 공개 여부는 Owner 결정) | — |

## 2. Owner 어드민 처리 (각 1~2분)

### 2-1. 신고 3건 기각 — 어드민 › 신고 관리
모두 내부 QA 계정이 QA 시험 게시글에 남긴 시험 신고다. 처리: **기각**, 사유 예: 「QA 시험 신고 — 위반 없음」.
| 신고 ID | 신고자 | 대상 글 | 사유 | 접수(UTC) |
|---|---|---|---|---|
| 07f00b8d… | wwww | [QA-1027] P-1~P-4 실기기 확인 (숨김) | 기타 「QA 실기기 신고 확인 (P-2)」 | 10-27 11:49 |
| f7f06dbd… | wwww | [QA-1027] 사진 없는 글 표시 확인 (숨김) | 사기 | 10-27 13:04 |
| 4c8bfca3… | zxzx11 | [QA-FULL-1028] 판매 흐름 1 (판매완료) | 사기 | 10-28 07:01 |

### 2-2. 탈퇴 신청 2건 정리 — 어드민 › 탈퇴 요청
두 건 모두 2026-08-08 API 시험 행(사유 「R10 API probe …」), 같은 사용자 `1cadd172…`, 프로필 없음(회원 실체 없음). 실제 회원 삭제가 아니라 **신청 행 종료(처리 완료/반려)** 만 하면 된다.

### 2-3. 이용약관 새 버전 게시 — 어드민 › 앱 › 약관 (D6)
- 아래 초안을 ko·en 각각 새 버전 `2026-11-07-terms` 로 게시.
- **개정 유형: 「재동의 필요」 권고** — 금지 행위 제재·포인트 규칙·탈퇴 기한이 새로 들어가 회원 권리·의무가 바뀐다. 게시하면 모든 회원이 다음 접속 때 동의 화면을 한 번 본다(심사 계정 `appreview01` 포함 — 동의 화면 하단 고정 버튼은 수정 완료). 「공지만」을 고르면 재동의 없이 게시된다. 정책 문서상 최종 판단은 Owner.

## 3. 이용약관 초안

### 한국어 (`ko`, 제목: 디바이 이용약관)
```
1. 운영자와 서비스
디바이(dibaY, 이하 "서비스")는 개인 운영자 BONG KI KIM 이 운영하며, 필리핀 거주자를 위한 커뮤니티, 중고거래, 매장 주문·배달, 채팅·메신저 기능을 제공합니다. 문의: im2pact@gmail.com

2. 회원 가입과 계정
만 14세 이상만 가입할 수 있습니다. 회원은 본인 계정만 사용해야 하며 허위 정보 등록, 타인 명의 도용, 계정 양도·대여를 할 수 없습니다. 필리핀 전화번호 인증이 필요한 기능은 인증 후 이용할 수 있습니다.

3. 금지 행위와 무관용 원칙
불법 행위, 사기, 혐오·차별 표현, 괴롭힘, 음란물, 성적 착취·성매매 알선, 폭력 조장, 개인정보 무단 게시, 스팸, 불법·금지 물품 거래를 금지합니다. 디바이는 부적절한 콘텐츠와 이용자에 대해 무관용 원칙을 적용합니다.

4. 신고·차단과 조치
회원은 게시글·댓글·상품·채팅·사용자를 신고하거나 차단할 수 있습니다. 운영자는 신고를 접수 후 24시간 안에 검토하고, 위반 콘텐츠 삭제·숨김, 경고, 이용 제한, 계정 정지·탈퇴 처리를 할 수 있습니다.

5. 거래와 주문
회원 간 거래의 당사자는 판매자와 구매자이며, 디바이는 거래 당사자가 아닙니다. 매장 주문은 해당 매장이 주문 이행과 결제를 책임집니다. 거래 전 상대방과 물품을 직접 확인해 주세요.

6. 포인트
포인트는 서비스 안의 디지털 기능(광고·게시글 홍보 등)에만 쓸 수 있으며 현금 가치가 없고, 현금으로 환급되거나 다른 회원에게 양도되지 않습니다. 앱 스토어(Apple 등) 결제로 산 포인트의 환불은 해당 스토어의 환불 정책을 따르고, 환불되면 해당 포인트는 회수됩니다. 포인트 유효기간과 사용처는 포인트 화면 안내를 따릅니다.

7. 회원 탈퇴와 정보 삭제
회원은 앱의 내정보 › 설정 › 탈퇴하기에서 탈퇴를 신청할 수 있으며, 신청일로부터 7일 안에 계정과 개인정보가 삭제됩니다. 법령상 보관 의무가 있거나 분쟁·부정 이용 조사에 필요한 기록은 정해진 기간 동안 보관할 수 있습니다.

8. 서비스 변경과 책임
운영자는 서비스 내용을 바꾸거나 중단할 수 있으며, 회원에게 불리한 중요한 변경은 미리 알립니다. 운영자는 회원 간 거래·게시물로 생긴 손해에 대해 고의 또는 중대한 과실이 없는 한 책임지지 않습니다.

9. 준거법
이 약관은 필리핀 법을 따릅니다.
```

### English (`en`, title: dibaY Terms of Service)
```
1. Operator and service
dibaY ("the Service") is operated by an individual, BONG KI KIM, and provides community, secondhand marketplace, store ordering and delivery, and chat/messenger features for residents of the Philippines. Contact: im2pact@gmail.com

2. Membership and accounts
You must be at least 14 years old to join. Use only your own account. False information, impersonation, and transferring or lending accounts are prohibited. Features that require Philippine phone verification are available after verification.

3. Prohibited conduct — zero tolerance
Illegal activity, fraud, hate or discriminatory speech, harassment, obscene content, sexual exploitation or solicitation, incitement to violence, posting others' personal information, spam, and trading illegal or prohibited items are prohibited. dibaY has zero tolerance for objectionable content and abusive users.

4. Reporting, blocking and enforcement
You can report or block posts, comments, listings, chats and users. We review reports within 24 hours of receipt and may remove or hide content, warn, restrict, suspend or terminate accounts that violate these terms.

5. Trades and orders
In member-to-member trades, the seller and buyer are the parties; dibaY is not a party. For store orders, the store is responsible for fulfilment and payment. Please check the other party and the item before trading.

6. Points
Points can be used only for digital features inside the Service (such as ads and post promotion). Points have no cash value and cannot be refunded as cash or transferred to other members. Refunds of Points bought through an app store (such as Apple) follow that store's refund policy, and refunded Points are reclaimed. Point validity and uses follow the information on the Points screen.

7. Leaving and data deletion
You can request account deletion in My › Settings › Leave. Your account and personal data are deleted within 7 days of the request. Records we must keep by law or need for disputes or fraud investigation may be retained for the required period.

8. Changes and liability
We may change or discontinue the Service and will give advance notice of important changes that are unfavourable to members. Except for intent or gross negligence, we are not liable for losses arising from trades or content between members.

9. Governing law
These terms are governed by the laws of the Philippines.
```

## 4. 확인 못 한 것 (NOT_PROVEN)
- 약관 문구의 필리핀 법 적합성 — 법률 검토 아님.
- 「신고 24시간 안 검토」는 운영 약속이다. 운영자가 실제로 지켜야 한다(어드민 신고 관리 확인 습관 필요).
