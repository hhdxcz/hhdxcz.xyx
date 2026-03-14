const PREFIX = "xiaoyouxi_room_v1_";

function postStorage(channelKey, message) {
  const key = `${PREFIX}msg_${channelKey}`;
  const payload = JSON.stringify({ ...message, _ts: Date.now(), _nonce: Math.random().toString(16) });
  localStorage.setItem(key, payload);
  localStorage.removeItem(key);
}

export function createRoomTransport(channelKey, onMessage) {
  const name = `${PREFIX}${channelKey}`;
  if ("BroadcastChannel" in window) {
    const ch = new BroadcastChannel(name);
    const handler = (e) => onMessage(e.data);
    ch.addEventListener("message", handler);
    return {
      send: (msg) => ch.postMessage(msg),
      close: () => {
        ch.removeEventListener("message", handler);
        ch.close();
      },
    };
  }

  const storageKey = `${PREFIX}msg_${channelKey}`;
  const handler = (e) => {
    if (e.key !== storageKey || !e.newValue) return;
    try {
      const msg = JSON.parse(e.newValue);
      onMessage(msg);
    } catch {
      return;
    }
  };
  window.addEventListener("storage", handler);
  return {
    send: (msg) => postStorage(channelKey, msg),
    close: () => window.removeEventListener("storage", handler),
  };
}

