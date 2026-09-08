import Foundation

/**
 * Member private-event eligibility projection for iOS.
 *
 * Gates CallKit sustained ring + APNs alert presentation we control (foreground/tap)
 * + shared logout fail-closed with Android.
 *
 * NOT global auth SSOT — projection of web/session authenticated state.
 * Fail-closed: missing key ⇒ ineligible.
 *
 * CONTRACT (Wave-1 M1):
 *   eligible=true REQUIRES non-empty bound member user id in the same durable write.
 *   eligible=true with empty bound is refused without clearing existing presentable.
 *   eligible=false (logout/guest) clears both.
 *   Persistence must survive process death for PushKit wake before WebView bootstrap.
 */
enum DibayMemberEventEligibilityStore {
  private static let eligibleKey = "dibay_member_event_eligible"
  private static let boundUserKey = "dibay_bound_member_user_id"

  /// Atomic durable write — sole mutation entry for call presentation eligibility.
  @discardableResult
  static func setMemberCallEligibility(
    eligible: Bool,
    boundUserId: String?,
    reason: String
  ) -> (eligible: Bool, boundUserSet: Bool) {
    let safeReason = reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      ? "unspecified"
      : reason.trimmingCharacters(in: .whitespacesAndNewlines)
    let bound = (boundUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)

    if eligible && bound.isEmpty {
      // Wave-1 M1: refuse illegal eligible-without-bound WITHOUT clearing existing presentable.
      let currentEligible = UserDefaults.standard.bool(forKey: eligibleKey)
      let currentBound = boundMemberUserId()
      let presentable = currentEligible && !currentBound.isEmpty
      DibayCallLog.infoCall(
        "[auth] member_event_eligible_set",
        callId: "none",
        detail: "skipped_no_clear reason=\(safeReason):eligible_requires_bound_user presentable=\(presentable)"
      )
      return (presentable, !currentBound.isEmpty)
    }

    if !eligible {
      UserDefaults.standard.set(false, forKey: eligibleKey)
      UserDefaults.standard.removeObject(forKey: boundUserKey)
      UserDefaults.standard.synchronize()
      DibayCallLog.infoCall(
        "[auth] member_event_eligible_set",
        callId: "none",
        detail: "eligible=false reason=\(safeReason)"
      )
      DibayCallLog.infoCall(
        "[auth] bound_member_user_set",
        callId: "none",
        detail: "has_user=false reason=\(safeReason)"
      )
      return (false, false)
    }

    UserDefaults.standard.set(true, forKey: eligibleKey)
    UserDefaults.standard.set(bound, forKey: boundUserKey)
    UserDefaults.standard.synchronize()
    DibayCallLog.infoCall(
      "[auth] member_event_eligible_set",
      callId: "none",
      detail: "eligible=true reason=\(safeReason)"
    )
    DibayCallLog.infoCall(
      "[auth] bound_member_user_set",
      callId: "none",
      detail: "has_user=true reason=\(safeReason)"
    )
    return (true, true)
  }

  /// - Warning: Prefer ``setMemberCallEligibility(eligible:boundUserId:reason:)``.
  ///   Kept for call-site clarity in older logs; clears bound when ineligible.
  static func setEligible(_ eligible: Bool, reason: String) {
    if !eligible {
      _ = setMemberCallEligibility(eligible: false, boundUserId: nil, reason: reason)
    } else {
      // Eligible-only writes are illegal — coerce using current bound (may fail-closed).
      _ = setMemberCallEligibility(
        eligible: true,
        boundUserId: boundMemberUserId(),
        reason: "\(reason):setEligible_requires_existing_bound"
      )
    }
  }

  static func setBoundMemberUserId(_ userId: String?, reason: String) {
    let id = (userId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if id.isEmpty {
      // Clearing bound while leaving eligible=true is the TERMINATED divergence — fail-closed.
      _ = setMemberCallEligibility(eligible: false, boundUserId: nil, reason: "\(reason):bound_cleared")
      return
    }
    if UserDefaults.standard.bool(forKey: eligibleKey) {
      _ = setMemberCallEligibility(eligible: true, boundUserId: id, reason: reason)
      return
    }
    // Bound-only update while ineligible — do not enable presentation.
    UserDefaults.standard.set(id, forKey: boundUserKey)
    UserDefaults.standard.synchronize()
    DibayCallLog.infoCall(
      "[auth] bound_member_user_set",
      callId: "none",
      detail: "has_user=true reason=\(reason) eligible=false"
    )
  }

  static func boundMemberUserId() -> String {
    (UserDefaults.standard.string(forKey: boundUserKey) ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  static func isMemberEventEligible() -> Bool {
    healIllegalDurableStateIfNeeded()
    return UserDefaults.standard.bool(forKey: eligibleKey) && !boundMemberUserId().isEmpty
  }

  /// Clear legacy durable corruption: eligible=true with empty bound (CUT7 TERMINATED divergence).
  static func healIllegalDurableStateIfNeeded() {
    let eligibleFlag = UserDefaults.standard.bool(forKey: eligibleKey)
    let bound = (UserDefaults.standard.string(forKey: boundUserKey) ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard eligibleFlag && bound.isEmpty else { return }
    _ = setMemberCallEligibility(
      eligible: false,
      boundUserId: nil,
      reason: "heal_eligible_without_bound"
    )
  }

  /// Snapshot for PushKit cold-wake diagnostics (no PII beyond has_user / prefix).
  static func durableSnapshotDetail() -> String {
    healIllegalDurableStateIfNeeded()
    let eligibleFlag = UserDefaults.standard.bool(forKey: eligibleKey)
    let bound = boundMemberUserId()
    let prefix = bound.count >= 8 ? String(bound.prefix(8)) : bound
    return "eligibleFlag=\(eligibleFlag) hasBound=\(!bound.isEmpty) boundPrefix=\(prefix) presentable=\(isMemberEventEligible())"
  }

  /// Mirrors `lib/push/native/can-present-authenticated-notification.ts`.
  static func canPresentAuthenticatedNotification(payloadRecipientUserId: String?) -> Bool {
    presentDecision(payloadRecipientUserId: payloadRecipientUserId).ok
  }

  static func presentDecision(payloadRecipientUserId: String?) -> (ok: Bool, reason: String) {
    guard UserDefaults.standard.bool(forKey: eligibleKey) else {
      return (false, "member_event_ineligible")
    }
    let bound = boundMemberUserId()
    guard !bound.isEmpty else {
      return (false, "bound_user_missing")
    }
    let recipient = (payloadRecipientUserId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if !recipient.isEmpty && recipient != bound {
      return (false, "recipient_user_mismatch")
    }
    return (true, "present")
  }

  static func resolvePayloadRecipientUserId(from userInfo: [AnyHashable: Any]) -> String? {
    let keys = [
      "recipientMemberId",
      "recipient_member_id",
      "targetUserId",
      "target_user_id",
      "userId",
      "user_id",
      "recipientUserId",
      "recipient_user_id",
    ]
    for key in keys {
      if let raw = userInfo[key] as? String {
        let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { return t }
      }
    }
    return nil
  }
}
