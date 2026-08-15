import Foundation

/**
 * Member private-event eligibility projection for iOS.
 *
 * NOT global auth SSOT — projection of web/session authenticated state.
 * Fail-closed: missing key ⇒ ineligible (guest must not present member CallKit UI).
 */
enum DibayMemberEventEligibilityStore {
  private static let defaultsKey = "dibay_member_event_eligible"

  static func setEligible(_ eligible: Bool, reason: String) {
    UserDefaults.standard.set(eligible, forKey: defaultsKey)
    DibayCallLog.infoCall(
      "[auth] member_event_eligible_set",
      callId: "none",
      detail: "eligible=\(eligible) reason=\(reason)"
    )
  }

  static func isMemberEventEligible() -> Bool {
    UserDefaults.standard.bool(forKey: defaultsKey)
  }
}
