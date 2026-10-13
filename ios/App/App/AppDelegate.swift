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

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        UserDefaults.standard.set(true, forKey: Self.lifecycleWasInBackgroundKey)
        DibayActiveCallSessionManager.shared.onAppBackground()
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        DibayActiveCallSessionManager.shared.onAppForeground()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        DibayActiveCallSessionManager.shared.onAppForeground()
        ScreenAwakeBridge.shared.reapplyOnBecomeActive()
        CallV4SurfaceOwnerBridge.flushPending()
        // Gate 3 Step 11 — do NOT re-apply versionless Cap prefs on resume.
        // Final App Icon = versioned canonical A+B via Web → apply(appIconTotal:).
        _ = DibayAppIconDeliveryAdapter.applyFromCapBadgeCache()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Swipe-kill during a live Native call: tell the server (best-effort) so the peer is not
        // left waiting for the both-sides-stale sweep. iOS has no durable terminal queue to retry.
        Self.endLiveNativeCallOnTerminate()
    }

    /// Bounded wait for the terminate `end` PATCH — stays well inside the iOS terminate budget (~5s).
    /// Request itself keeps the existing Native API timeout.
    private static let terminateEndWaitSeconds: TimeInterval = 3

    private static func endLiveNativeCallOnTerminate() {
        var liveSessionId: String?
        var liveIsVideo = false

        let voice = NativeVoiceCallRuntime.shared.snapshot()
        if let session = voice.session {
            switch voice.phase {
            case .accepted, .tokenPending, .joining, .connected, .outgoingStarting:
                liveSessionId = session.sessionId
            default:
                break
            }
        }
        if liveSessionId == nil, NativeVideoCallLane.isEnabled() {
            let video = NativeVideoCallRuntime.shared.snapshot()
            if let session = video.session, video.state == .connecting || video.state == .connected {
                liveSessionId = session.sessionId
                liveIsVideo = true
            }
        }

        guard let rawSid = liveSessionId else { return }
        let sid = rawSid.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sid.isEmpty else { return }
        if CallKitProvider.shared.isTerminalSuppressed(sessionId: sid)
            || CallKitProvider.shared.isCallKitEndCompleted(sessionId: sid)
        {
            DibayCallLog.info("ios_native_call_terminate_end_skipped", sessionId: sid, detail: "reason=terminal_seen")
            return
        }
        guard NativeCallServerEndOnce.claim(sessionId: sid) else {
            DibayCallLog.info("ios_native_call_terminate_end_skipped", sessionId: sid, detail: "reason=already_sent")
            return
        }

        DibayCallLog.info(
            "ios_native_call_terminate_end_started",
            sessionId: sid,
            detail: "media=\(liveIsVideo ? "video" : "voice")"
        )
        CallKitProvider.shared.markTerminalSuppressed(sessionId: sid, reason: "app_will_terminate")
        CallKitProvider.shared.endCallKitSession(sessionId: sid, logDetail: "app_will_terminate")

        let done = DispatchSemaphore(value: 0)
        let completion: (Bool, Int, String?) -> Void = { ok, status, error in
            DibayCallLog.info(
                "ios_native_call_terminate_end_patch_done",
                sessionId: sid,
                detail: "ok=\(ok ? 1 : 0) status=\(status) err=\(error ?? "")"
            )
            done.signal()
        }
        if liveIsVideo {
            NativeVideoCallApi.endAsync(
                callId: sid,
                clientEndedReason: NativeCallServerEndOnce.reasonAppTerminate,
                completion: completion
            )
        } else {
            NativeVoiceCallApi.endAsync(
                callId: sid,
                clientEndedReason: NativeCallServerEndOnce.reasonAppTerminate,
                completion: completion
            )
        }

        // Cookie / deviceId resolution hops through DispatchQueue.main — a plain semaphore wait on
        // main would deadlock, so pump the main run loop until done or the bounded deadline.
        let deadline = Date().addingTimeInterval(terminateEndWaitSeconds)
        while done.wait(timeout: .now()) == .timedOut {
            if Date() >= deadline {
                DibayCallLog.warn("ios_native_call_terminate_end_wait_timeout", sessionId: sid)
                break
            }
            _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
        }
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
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
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
           let url = userActivity.webpageURL,
           AuthApi.isKakaoTalkLoginUrl(url)
        {
            let handled = AuthController.handleOpenUrl(url: url)
            NSLog("[DIBAY_Kakao] continue_userActivity handled=%d", handled)
            return handled
        }
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
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
