/**
 * Vitest Node 환경용 Agora RTC stub.
 * browser-only SDK 가 import 시 window 를 요구하므로 vitest.config alias 로 전역 대체한다.
 */
const noop = () => undefined;
const asyncNoop = async () => undefined;

const AgoraRTC = {
  createClient: () => ({
    join: asyncNoop,
    leave: asyncNoop,
    publish: asyncNoop,
    unpublish: asyncNoop,
    subscribe: asyncNoop,
    unsubscribe: asyncNoop,
    on: noop,
    off: noop,
    remoteUsers: [],
  }),
  createMicrophoneAndCameraTracks: async () => [],
  createCameraVideoTrack: async () => ({ play: noop, close: noop, setEnabled: asyncNoop }),
  createMicrophoneAudioTrack: async () => ({ play: noop, close: noop, setEnabled: asyncNoop }),
  getCameras: async () => [],
  getMicrophones: async () => [],
  getPlaybackDevices: async () => [],
  setParameter: noop,
};

export default AgoraRTC;
