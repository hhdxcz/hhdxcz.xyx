import http from "node:http";
import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 8787);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found");
});

const wss = new WebSocketServer({ server });

const channels = new Map();

function joinChannel(ws, channel) {
  const key = String(channel || "");
  if (!key) return;
  let set = channels.get(key);
  if (!set) {
    set = new Set();
    channels.set(key, set);
  }
  set.add(ws);
  ws._channels.add(key);
}

function leaveAll(ws) {
  for (const ch of ws._channels) {
    const set = channels.get(ch);
    if (!set) continue;
    set.delete(ws);
    if (set.size === 0) channels.delete(ch);
  }
  ws._channels.clear();
}

wss.on("connection", (ws) => {
  ws._channels = new Set();

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(String(buf || ""));
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    const type = String(msg.type || "");
    if (type === "join") {
      joinChannel(ws, msg.channel);
      return;
    }
    if (type !== "msg") return;
    const channel = String(msg.channel || "");
    const set = channels.get(channel);
    if (!set || set.size === 0) return;
    const payload = JSON.stringify({ type: "msg", channel, data: msg.data });
    for (const client of set) {
      if (client === ws) continue;
      if (client.readyState !== 1) continue;
      client.send(payload);
    }
  });

  ws.on("close", () => leaveAll(ws));
  ws.on("error", () => leaveAll(ws));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`relay listening on :${port}`);
});

