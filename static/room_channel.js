import { getRelayUrl } from "./lib.js";

const PREFIX = "xiaoyouxi_room_v1_";

function postStorage(channelKey, message) {
  const key = `${PREFIX}msg_${channelKey}`;
  const payload = JSON.stringify({ ...message, _ts: Date.now(), _nonce: Math.random().toString(16) });
  localStorage.setItem(key, payload);
  localStorage.removeItem(key);
}

export function createRoomTransport(channelKey, onMessage) {
  const name = `${PREFIX}${channelKey}`;
  const relayUrl = getRelayUrl();
  if (relayUrl) {
    let local = null;
    function createLocal() {
      if (local) return local;
      if ("BroadcastChannel" in window) {
        const ch = new BroadcastChannel(name);
        const handler = (e) => onMessage(e.data);
        ch.addEventListener("message", handler);
        local = {
          send: (msg) => ch.postMessage(msg),
          close: () => {
            ch.removeEventListener("message", handler);
            ch.close();
          },
        };
        return local;
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
      local = {
        send: (msg) => postStorage(channelKey, msg),
        close: () => window.removeEventListener("storage", handler),
      };
      return local;
    }

    const url = new URL(relayUrl, window.location.href);
    url.searchParams.set("channel", name);
    const ws = new WebSocket(url.toString());
    const queue = [];
    let closed = false;
    let useLocal = false;
    const sendRaw = (obj) => ws.send(JSON.stringify(obj));

    function switchToLocal() {
      if (useLocal) return;
      useLocal = true;
      const t = createLocal();
      while (queue.length) t.send(queue.shift().data);
    }

    const openTimer = window.setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) switchToLocal();
    }, 1500);

    ws.addEventListener("open", () => {
      window.clearTimeout(openTimer);
      if (useLocal) {
        ws.close();
        return;
      }
      while (queue.length && ws.readyState === WebSocket.OPEN) sendRaw(queue.shift());
    });
    ws.addEventListener("error", () => {
      window.clearTimeout(openTimer);
      if (!closed) switchToLocal();
    });
    ws.addEventListener("close", () => {
      window.clearTimeout(openTimer);
      if (!closed) switchToLocal();
    });
    ws.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse(String(e.data || ""));
        if (!msg || typeof msg !== "object") return;
        if (msg.type !== "msg") return;
        onMessage(msg.data);
      } catch {
        return;
      }
    });
    return {
      send: (msg) => {
        if (useLocal) {
          createLocal().send(msg);
          return;
        }
        const payload = { type: "msg", data: msg };
        if (ws.readyState === WebSocket.OPEN) sendRaw(payload);
        else queue.push(payload);
      },
      close: () => {
        closed = true;
        window.clearTimeout(openTimer);
        if (local) local.close();
        ws.close();
      },
    };
  }
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
