import { deterministicRoomCodeFromIds, getOrCreateClientId, getRelayUrl } from "./lib.js";

const CHANNEL = "xiaoyouxi_match_v1";

function now() {
  return Date.now();
}

function postStorage(message) {
  const key = "xiaoyouxi_match_message";
  const payload = JSON.stringify({ ...message, _ts: now(), _nonce: Math.random().toString(16) });
  localStorage.setItem(key, payload);
  localStorage.removeItem(key);
}

function createTransport(channelName, onMessage) {
  const relayUrl = getRelayUrl();
  if (relayUrl) {
    const url = new URL(relayUrl, window.location.href);
    url.searchParams.set("channel", channelName);
    const ws = new WebSocket(url.toString());
    const queue = [];
    const sendRaw = (obj) => ws.send(JSON.stringify(obj));
    ws.addEventListener("open", () => {
      while (queue.length && ws.readyState === WebSocket.OPEN) sendRaw(queue.shift());
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
        const payload = { type: "msg", data: msg };
        if (ws.readyState === WebSocket.OPEN) sendRaw(payload);
        else queue.push(payload);
      },
      close: () => ws.close(),
    };
  }
  if ("BroadcastChannel" in window) {
    const ch = new BroadcastChannel(channelName);
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

  const handler = (e) => {
    if (e.key !== "xiaoyouxi_match_message" || !e.newValue) return;
    try {
      const msg = JSON.parse(e.newValue);
      onMessage(msg);
    } catch {
      return;
    }
  };
  window.addEventListener("storage", handler);
  return {
    send: (msg) => postStorage(msg),
    close: () => window.removeEventListener("storage", handler),
  };
}

export function createMatchmaker({ gameId }) {
  const clientId = getOrCreateClientId();
  let active = false;
  let transport = null;
  let timer = 0;
  let resolved = false;
  let startedAt = 0;
  let resolveMatch = null;
  let rejectMatch = null;
  let pendingPromise = null;

  function stop() {
    active = false;
    if (timer) window.clearInterval(timer);
    timer = 0;
    if (transport) transport.close();
    transport = null;
  }

  function matchWith(otherId) {
    if (resolved) return;
    resolved = true;
    const room = deterministicRoomCodeFromIds(clientId, otherId, 6);
    stop();
    if (resolveMatch) resolveMatch({ room, otherId });
  }

  function onMessage(msg) {
    if (!active || resolved) return;
    if (!msg || typeof msg !== "object") return;
    if (msg.gameId !== gameId) return;

    if (msg.type === "request") {
      const otherId = String(msg.clientId || "");
      if (!otherId || otherId === clientId) return;
      const otherStartedAt = Number(msg.startedAt || 0);
      if (!Number.isFinite(otherStartedAt)) return;
      const mineFirst = startedAt < otherStartedAt || (startedAt === otherStartedAt && clientId < otherId);
      if (!mineFirst) {
        const room = deterministicRoomCodeFromIds(clientId, otherId, 6);
        transport.send({
          type: "accept",
          gameId,
          from: clientId,
          to: otherId,
          room,
        });
        matchWith(otherId);
      }
      return;
    }

    if (msg.type === "accept") {
      const to = String(msg.to || "");
      const from = String(msg.from || "");
      const room = String(msg.room || "");
      if (to !== clientId || !from || !room) return;
      if (room !== deterministicRoomCodeFromIds(clientId, from, 6)) return;
      matchWith(from);
    }
  }

  function start() {
    if (active) return pendingPromise;
    active = true;
    resolved = false;
    startedAt = now();
    transport = createTransport(`${CHANNEL}_${gameId}`, onMessage);
    pendingPromise = new Promise((resolve, reject) => {
      resolveMatch = resolve;
      rejectMatch = reject;
    });

    const req = { type: "request", gameId, clientId, startedAt };
    transport.send(req);
    timer = window.setInterval(() => {
      if (!active || resolved) return;
      transport.send(req);
    }, 450);

    return pendingPromise;
  }

  function cancel() {
    if (!active) return;
    stop();
    if (!resolved && rejectMatch) rejectMatch(new Error("cancelled"));
  }

  return { start, cancel, clientId };
}

