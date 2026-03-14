export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 400 });
    const channel = url.searchParams.get("channel") || "";
    if (!channel) return new Response("missing channel", { status: 400 });
    const id = env.RELAY.idFromName(channel);
    const stub = env.RELAY.get(id);
    return stub.fetch(request);
  },
};

export class RelayRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 400 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    let msg;
    try {
      msg = JSON.parse(String(message || ""));
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    if (String(msg.type || "") !== "msg") return;
    const data = msg.data;
    const out = JSON.stringify({ type: "msg", data });
    for (const other of this.state.getWebSockets()) {
      if (other === ws) continue;
      try {
        other.send(out);
      } catch {
        continue;
      }
    }
  }

  webSocketClose() {}
  webSocketError() {}
}

