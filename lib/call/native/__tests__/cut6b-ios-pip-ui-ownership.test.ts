/**
 * CUT-6B — focused static lifecycle / ownership contracts for iOS PiP in-app continuation.
 * Swift XCTest harness is not in this repo CI path; these assert source ownership invariants.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../../../");
const pipOwner = path.join(
  ROOT,
  "ios/App/App/Call/Video/NativeVideoCallPipOwner.swift"
);
const uiHost = path.join(ROOT, "ios/App/App/Call/Video/NativeVideoCallUiHost.swift");
const vc = path.join(ROOT, "ios/App/App/Call/Video/NativeVideoCallViewController.swift");

function read(p: string): string {
  return readFileSync(p, "utf8");
}

describe("CUT-6B iOS PiP UI ownership contracts", () => {
  it("1–3: PipOwner owns ContentSource and releases fullscreen only on didStart (UI-only)", () => {
    const owner = read(pipOwner);
    const host = read(uiHost);
    expect(owner).toMatch(/class NativeVideoCallPipOwner/);
    expect(owner).toMatch(/private var pipController/);
    expect(owner).toMatch(/private var contentSource/);
    expect(owner).toMatch(/private var sourceAnchorView/);
    expect(owner).toMatch(/pictureInPictureControllerDidStartPictureInPicture/);
    expect(owner).toMatch(/releaseFullscreenForPip/);
    expect(host).toMatch(/RELEASE_FULLSCREEN_FOR_PIP/);
    expect(host).toMatch(/func releaseFullscreenForPip/);
    expect(host).toMatch(/Do not stopPip \/ finishIfActive \/ terminal here/);
    const releaseFn = host.match(
      /static func releaseFullscreenForPip\([\s\S]*?\n  static func /
    )?.[0] ?? "";
    expect(releaseFn.length).toBeGreaterThan(80);
    expect(releaseFn).not.toMatch(/finishIfActive\(/);
    expect(releaseFn).toMatch(/controller\.dismiss\(animated: false\)/);
    expect(releaseFn).toMatch(/terminal=0/);
  });

  it("4–6: restore reuses Runtime session path; no new call create / Agora join in restore", () => {
    const owner = read(pipOwner);
    const host = read(uiHost);
    expect(owner).toMatch(/restoreUserInterfaceForPictureInPictureStopWithCompletionHandler/);
    expect(host).toMatch(/func restoreFullscreenFromPip/);
    expect(host).toMatch(/forceRestoreFromPip/);
    expect(host).toMatch(/no_active_runtime_session/);
    expect(host).not.toMatch(/restoreFullscreenFromPip[\s\S]{0,1200}joinChannel/);
    expect(host).not.toMatch(/restoreFullscreenFromPip[\s\S]{0,1200}createOutgoing/);
  });

  it("7–10: terminal while PiP tears owner once; auto-present suppressed; VC does not own PiP controller", () => {
    const owner = read(pipOwner);
    const host = read(uiHost);
    const view = read(vc);
    expect(host).toMatch(/teardownForTerminal/);
    expect(host).toMatch(/shouldBlockAutoPresent|pip_active_app_usable/);
    expect(host).toMatch(/finish_if_active_no_fullscreen/);
    expect(owner).toMatch(/func teardownForTerminal/);
    expect(view).not.toMatch(/private var pipController/);
    expect(view).toMatch(/NativeVideoCallPipOwner\.shared\.configureIfNeeded/);
    expect(view).toMatch(/noteFullscreenControllerDeinit/);
  });

  it("CUT-6E: configure create-path restores fullscreenController after teardownSession", () => {
    const owner = read(pipOwner);
    const configure = owner.match(
      /func configureIfNeeded\([\s\S]*?\n  func setAutomaticPipFromInline/
    )?.[0] ?? "";
    expect(configure.length).toBeGreaterThan(200);
    expect(configure).toMatch(/teardownSession\(reason: "reconfigure"/);
    // After teardown, fullscreenController must be reassigned before pip create completes.
    const afterTeardown = configure.split(/teardownSession\(reason: "reconfigure"[^\n]*\n/)[1] ?? "";
    expect(afterTeardown).toMatch(/fullscreenController = fullscreen/);
    // willStart still requires fullscreen VC for reparent; didStart must not.
    const willStart =
      owner.match(
        /func pictureInPictureControllerWillStartPictureInPicture\([\s\S]*?\n  func pictureInPictureControllerDidStart/
      )?.[0] ?? "";
    const didStart =
      owner.match(
        /func pictureInPictureControllerDidStartPictureInPicture\([\s\S]*?\n  func pictureInPictureControllerDidStop/
      )?.[0] ?? "";
    expect(willStart).toMatch(/guard let vc = fullscreenController/);
    expect(willStart).toMatch(/reparentRemoteViewToPipForPipOwner/);
    expect(willStart).toMatch(/native_video_pip_entered/);
    expect(didStart).toMatch(/releaseFullscreenForPip/);
    expect(didStart).not.toMatch(/fullscreenController/);
  });
});
