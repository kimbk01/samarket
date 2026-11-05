import UIKit
import Capacitor
import KakaoSDKAuth
import KakaoSDKCommon

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    private static let lifecycleWasInBackgroundKey = "dibay_lifecycle_was_in_background"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Lifecycle SSOT §5.2: only emit restore|fresh when OS restore vs cold is actually
        // distinguishable. `was_in_background` alone is NOT OS-restore evidence (user may
        // background → force-quit → relaunch). Consume the flag for diagnostics only.
        let defaults = UserDefaults.standard
        let wasInBackground = defaults.bool(forKey: Self.lifecycleWasInBackgroundKey)
        defaults.set(false, forKey: Self.lifecycleWasInBackgroundKey)
        if wasInBackground {
            // Prior background observed — insufficient to confirm OS task restore.
            DibayRootBridgeViewController.nativeRestoreHint = "unknown"
        } else {
            // No durable background mark (first launch / cleared defaults) → cold candidate.
            DibayRootBridgeViewController.nativeRestoreHint = "fresh"
        }
        NSLog(
            "[DibayLifecycle] native_restore_hint=%@ was_in_background=%d (background≠restore)",
            DibayRootBridgeViewController.nativeRestoreHint,
            wasInBackground ? 1 : 0
        )

        if let appKey = Bundle.main.object(forInfoDictionaryKey: "KAKAO_NATIVE_APP_KEY") as? String {
            let trimmed = appKey.trimmingCharacters(in: .whitespacesAndNewlines)
            let isPlaceholder = trimmed.isEmpty || trimmed.hasPrefix("$(") || trimmed.contains("YOUR_KAKAO")
            if !isPlaceholder {
                KakaoSDK.initSDK(appKey: trimmed)
            }
        }
        VoIPPushRegistry.shared.start()
        Self.logDibayBuildFingerprint()
        return true
    }

    // UIScene life cycle (iOS 27 SDK): UIKit no longer calls the app-level background/foreground/active
    // or open-URL/continue delegate methods. SceneDelegate is the only caller of the handlers below.
    // Single scene only (UIApplicationSupportsMultipleScenes = false).

    @MainActor private static var isInBackground = false

    @MainActor static func handleDidEnterBackground() {
        isInBackground = true
        UserDefaults.standard.set(true, forKey: Self.lifecycleWasInBackgroundKey)
        DibayActiveCallSessionManager.shared.onAppBackground()
    }

    /// sceneWillEnterForeground also fires on cold launch; the app-delegate life cycle only called
    /// applicationWillEnterForeground after a real background, so keep that condition.
    @MainActor static func handleWillEnterForeground() {
        guard isInBackground else { return }
        isInBackground = false
        DibayActiveCallSessionManager.shared.onAppForeground()
    }

    @MainActor static func handleDidBecomeActive() {
        DibayActiveCallSessionManager.shared.onAppForeground()
        ScreenAwakeBridge.shared.reapplyOnBecomeActive()
        CallV4SurfaceOwnerBridge.flushPending()
        // Gate 3 Step 11 — do NOT re-apply versionless Cap prefs on resume.
        // Final App Icon = versioned canonical A+B via Web → apply(appIconTotal:).
        _ = DibayAppIconDeliveryAdapter.applyFromCapBadgeCache()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    @MainActor static func handleOpenURLContext(_ context: UIOpenURLContext) {
        var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
        if let source = context.options.sourceApplication {
            options[.sourceApplication] = source
        }
        if let annotation = context.options.annotation {
            options[.annotation] = annotation
        }
        options[.openInPlace] = context.options.openInPlace
        _ = handleOpenURL(context.url, options: options)
    }

    @discardableResult
    @MainActor static func handleOpenURL(_ url: URL, options: [UIApplication.OpenURLOptionsKey: Any]) -> Bool {
        // KakaoTalk custom-scheme return: kakao{NATIVE_APP_KEY}://oauth
        // AuthController.handleOpenUrl is @MainActor — must run on main.
        if AuthApi.isKakaoTalkLoginUrl(url) {
            let keys = URLComponents(url: url, resolvingAgainstBaseURL: false)?
              .queryItems?
              .map(\.name)
              .joined(separator: ",") ?? ""
            var handled = false
            let run = {
              handled = AuthController.handleOpenUrl(url: url)
            }
            if Thread.isMainThread {
              run()
            } else {
              DispatchQueue.main.sync(execute: run)
            }
            NSLog(
              "[DIBAY_Kakao] open_url isKakaoTalkLoginUrl=1 handled=%d scheme=%@ queryKeys=%@",
              handled,
              url.scheme ?? "",
              keys
            )
            return handled
        }
        if url.scheme?.hasPrefix("kakao") == true {
            var handled = false
            let run = { handled = AuthController.handleOpenUrl(url: url) }
            if Thread.isMainThread { run() } else { DispatchQueue.main.sync(execute: run) }
            NSLog("[DIBAY_Kakao] open_url kakao_scheme handled=%d", handled)
            if handled { return true }
        }
        return ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: options)
    }

    @discardableResult
    @MainActor static func handleContinueUserActivity(_ userActivity: NSUserActivity) -> Bool {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
           let url = userActivity.webpageURL,
           AuthApi.isKakaoTalkLoginUrl(url)
        {
            let handled = AuthController.handleOpenUrl(url: url)
            NSLog("[DIBAY_Kakao] continue_userActivity handled=%d", handled)
            return handled
        }
        return ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }

    // Capacitor PushNotifications — alert APNs token bridge (NOT VoIP/PushKit).
    // Without this forward, registerForRemoteNotifications succeeds but JS never gets `registration`.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // iOS Delivery Adapter v1 — APNS aps.badge / badgeCount → SpringBoard (echo only).
    // Guest/logout/wrong-user: skip badge echo (tray may still be OS-shown for alert APNs;
    // logout clears delivered notifications + eligibility gates CallKit/tap).
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        let recipient = DibayMemberEventEligibilityStore.resolvePayloadRecipientUserId(from: userInfo)
        let present = DibayMemberEventEligibilityStore.presentDecision(payloadRecipientUserId: recipient)
        if present.ok {
            DibayAppIconDeliveryAdapter.applyFromPushUserInfo(userInfo)
        } else {
            NSLog("[DIBAY_PUSH] remote_badge_echo_skipped reason=%@", present.reason)
        }
        completionHandler(.noData)
    }

    private static func logDibayBuildFingerprint() {
        let info = Bundle.main.infoDictionary ?? [:]
        let sha = (info["DibayGitSha"] as? String) ?? "missing"
        let config = (info["DibayBuildConfiguration"] as? String) ?? "missing"
        let ts = (info["DibayBuildTimestamp"] as? String) ?? "missing"
        let dirty = (info["DibayGitDirty"] as? String) ?? "missing"
        let version = (info["CFBundleShortVersionString"] as? String) ?? "?"
        let build = (info["CFBundleVersion"] as? String) ?? "?"
        NSLog("[DIBAY_BUILD] native_fingerprint gitSha=%@ config=%@ timestamp=%@ dirty=%@ version=%@ build=%@",
              sha, config, ts, dirty, version, build)
    }

}
