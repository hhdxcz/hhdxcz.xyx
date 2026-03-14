import { getOrCreateClientId, getPlayerName, getQueryParam, normalizeRoomCode, setPageTitle } from "./lib.js";
import { createRoomTransport } from "./room_channel.js";

const GAME_ID = "reaction";

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, Math.trunc(x)));
}

function now() {
  return Date.now();
}

function hostKey(room) {
  return `xiaoyouxi_room_host_${GAME_ID}_${room}`;
}

function ensureHost(room, clientId) {
  const key = hostKey(room);
  const exist = localStorage.getItem(key);
  if (exist) return exist;
  localStorage.setItem(key, clientId);
  return clientId;
}

function pickSeats(memberIds) {
  const ids = memberIds
    .filter(Boolean)
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 2);
  return { A: ids[0] || "", B: ids[1] || "" };
}

function main() {
  const roomRaw = getQueryParam("room");
  const roleRaw = getQueryParam("role");
  const room = roomRaw ? normalizeRoomCode(roomRaw) : "";
  const clientId = getOrCreateClientId();
  const playerName = getPlayerName();

  setPageTitle("反应测试");

  const backLink = document.getElementById("backLink");
  const roomChip = document.getElementById("roomChip");
  const roleChip = document.getElementById("roleChip");
  const statusText = document.getElementById("statusText");
  const playersText = document.getElementById("playersText");
  const padBtn = document.getElementById("padBtn");
  const readyBtn = document.getElementById("readyBtn");
  const resetBtn = document.getElementById("resetBtn");
  const hintText = document.getElementById("hintText");

  if (roomChip) roomChip.textContent = room ? `房间：${room}` : "单机";
  if (roleChip) roleChip.textContent = roleRaw ? String(roleRaw) : "";
  if (backLink && room) {
    const url = new URL("./room.html", window.location.href);
    url.searchParams.set("game", GAME_ID);
    url.searchParams.set("name", "反应测试");
    backLink.href = url.toString();
  }

  if (!(padBtn instanceof HTMLButtonElement)) return;

  let transport = null;
  let ping = 0;
  let hostId = room ? ensureHost(room, clientId) : clientId;
  let isHost = hostId === clientId;
  let members = new Map();
  let seats = { A: "", B: "" };

  let round = {
    id: "",
    phase: "idle",
    createdAt: 0,
    goAt: 0,
    goWindowMs: 0,
  };

  let local = {
    clicked: false,
    clickAt: 0,
    reactionMs: 0,
    foul: false,
  };

  let results = new Map();

  function mySeat() {
    if (seats.A === clientId) return "A";
    if (seats.B === clientId) return "B";
    return "";
  }

  function canPlay() {
    if (!room) return true;
    return mySeat() !== "";
  }

  function seatName(id) {
    const m = members.get(id);
    if (!m) return id.slice(0, 4);
    return String(m.name || id.slice(0, 4));
  }

  function updatePlayersText() {
    if (!playersText) return;
    if (!room) {
      playersText.textContent = "单机模式";
      return;
    }
    const a = seats.A ? `${seatName(seats.A)}（A）${seats.A === hostId ? " 房主" : ""}` : "A：等待加入";
    const b = seats.B ? `${seatName(seats.B)}（B）${seats.B === hostId ? " 房主" : ""}` : "B：等待加入";
    playersText.textContent = `${a}  |  ${b}`;
  }

  function setPad(state) {
    padBtn.classList.toggle("rxReady", state === "ready");
    padBtn.classList.toggle("rxWait", state === "wait");
    padBtn.classList.toggle("rxGo", state === "go");
    padBtn.classList.toggle("rxDone", state === "done");
  }

  function setHint(text) {
    if (hintText) hintText.textContent = text || "";
  }

  function setStatus(text) {
    if (statusText) statusText.textContent = text || "";
  }

  function resetLocal() {
    local = { clicked: false, clickAt: 0, reactionMs: 0, foul: false };
  }

  function resetRound() {
    round = { id: "", phase: "idle", createdAt: 0, goAt: 0, goWindowMs: 0 };
    results = new Map();
    resetLocal();
  }

  function render() {
    updatePlayersText();

    const seat = mySeat();
    const spectator = room && !seat;
    const enoughPlayers = !room || (seats.A && seats.B);

    if (spectator) {
      setStatus("观战中");
      setHint("房间已满，当前为观战模式。");
      padBtn.disabled = true;
      padBtn.textContent = "观战";
      setPad("done");
      if (readyBtn) readyBtn.disabled = true;
      if (resetBtn) resetBtn.disabled = true;
      return;
    }

    if (!enoughPlayers) {
      setStatus("等待玩家加入");
      setHint(isHost ? "等另一名玩家加入，或在另一个标签页加入同房间号。" : "等待房主开始。");
      padBtn.disabled = true;
      padBtn.textContent = "等待加入";
      setPad("ready");
      if (readyBtn) readyBtn.disabled = true;
      if (resetBtn) resetBtn.disabled = false;
      return;
    }

    if (round.phase === "idle") {
      setStatus("准备开始");
      setHint(isHost ? "点击“准备/下一局”开始一局。" : "等待房主开始。");
      padBtn.disabled = true;
      padBtn.textContent = "等待开始";
      setPad("ready");
      if (readyBtn) readyBtn.disabled = !isHost;
      if (resetBtn) resetBtn.disabled = !isHost;
      return;
    }

    if (round.phase === "wait") {
      setStatus("等待变绿…");
      setHint("不要提前点，提前点算犯规。");
      padBtn.disabled = !canPlay();
      padBtn.textContent = local.clicked ? "已点击" : "等待…";
      setPad("wait");
      if (readyBtn) readyBtn.disabled = true;
      if (resetBtn) resetBtn.disabled = !isHost;
      return;
    }

    if (round.phase === "go") {
      setStatus("快点！");
      setHint("立刻点击！");
      padBtn.disabled = !canPlay() || local.clicked;
      padBtn.textContent = local.clicked ? "已点击" : "点我！";
      setPad("go");
      if (readyBtn) readyBtn.disabled = true;
      if (resetBtn) resetBtn.disabled = !isHost;
      return;
    }

    if (round.phase === "done") {
      setPad("done");
      padBtn.disabled = true;
      padBtn.textContent = "本局结束";
      if (readyBtn) readyBtn.disabled = !isHost;
      if (resetBtn) resetBtn.disabled = !isHost;

      const a = results.get(seats.A);
      const b = results.get(seats.B);
      const fmt = (r) => {
        if (!r) return "--";
        if (r.foul) return "犯规";
        return `${r.reactionMs}ms`;
      };
      if (a && b) {
        const winnerId = String(results.get("winner") || "");
        const winName = winnerId ? seatName(winnerId) : "";
        setStatus(winName ? `胜者：${winName}` : "本局结束");
        setHint(`A：${fmt(a)}，B：${fmt(b)}`);
      } else {
        setStatus("本局结束");
        setHint("等待结算…");
      }
      return;
    }
  }

  function broadcastState() {
    if (!transport || !isHost || !room) return;
    transport.send({
      type: "state",
      gameId: GAME_ID,
      room,
      hostId,
      members: Array.from(members.values()),
      seats,
      round,
      results: Array.from(results.entries()),
    });
  }

  function computeWinner(a, b) {
    if (a.foul && b.foul) return "";
    if (a.foul && !b.foul) return b.clientId;
    if (!a.foul && b.foul) return a.clientId;
    if (a.reactionMs < b.reactionMs) return a.clientId;
    if (b.reactionMs < a.reactionMs) return b.clientId;
    return "";
  }

  function hostTryFinalize() {
    if (!isHost || !room) return;
    if (!seats.A || !seats.B) return;
    const a = results.get(seats.A);
    const b = results.get(seats.B);
    if (!a || !b) return;
    const w = computeWinner(a, b);
    results.set("winner", w);
    broadcastState();
    render();
  }

  function hostStartRound() {
    if (!isHost) return;
    resetLocal();
    results = new Map();
    const delay = clampInt(900 + Math.random() * 2100, 800, 3200);
    const createdAt = now();
    const goAt = createdAt + delay;
    const id = `${createdAt}_${Math.random().toString(16).slice(2)}`;
    round = { id, phase: "wait", createdAt, goAt, goWindowMs: 7000 };
    broadcastState();
    render();
  }

  function hostResetAll() {
    if (!isHost) return;
    resetRound();
    broadcastState();
    render();
  }

  function submitResult({ clickAt, foul }) {
    if (!room) return;
    if (!transport) return;
    transport.send({
      type: "result",
      gameId: GAME_ID,
      room,
      roundId: round.id,
      clientId,
      clickAt,
      foul: Boolean(foul),
    });
  }

  function onPadClick() {
    if (!canPlay()) return;
    if (local.clicked) return;
    const t = now();
    local.clicked = true;
    local.clickAt = t;

    if (round.phase === "wait") {
      local.foul = true;
      local.reactionMs = 0;
      submitResult({ clickAt: t, foul: true });
      render();
      return;
    }

    if (round.phase !== "go") return;

    const rt = clampInt(t - round.goAt, 0, 99999);
    local.reactionMs = rt;
    local.foul = false;
    submitResult({ clickAt: t, foul: false });
    render();
  }

  function tickPhase() {
    if (round.phase === "wait" && now() >= round.goAt) {
      round = { ...round, phase: "go" };
      if (isHost && room) broadcastState();
      render();
      return;
    }
    if (round.phase === "go") {
      const expired = now() - round.goAt > round.goWindowMs;
      if (expired) {
        round = { ...round, phase: "done" };
        if (isHost && room) {
          if (seats.A && !results.get(seats.A)) results.set(seats.A, { clientId: seats.A, foul: true, reactionMs: 0 });
          if (seats.B && !results.get(seats.B)) results.set(seats.B, { clientId: seats.B, foul: true, reactionMs: 0 });
          hostTryFinalize();
          broadcastState();
        }
        render();
      }
    }
  }

  function onMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.gameId !== GAME_ID) return;
    if (room && String(msg.room || "") !== room) return;

    if (msg.type === "join") {
      if (!isHost || !room) return;
      const id = String(msg.clientId || "");
      const name = String(msg.name || "");
      if (!id) return;
      if (!members.has(id)) members.set(id, { id, name });
      else {
        const prev = members.get(id);
        members.set(id, { ...prev, name: name || prev?.name || "" });
      }
      seats = pickSeats(Array.from(members.keys()));
      broadcastState();
      render();
      return;
    }

    if (msg.type === "state") {
      const incomingHost = String(msg.hostId || "");
      if (incomingHost) {
        hostId = incomingHost;
        isHost = hostId === clientId;
      }

      const arr = Array.isArray(msg.members) ? msg.members : [];
      const next = new Map();
      for (const m of arr) {
        if (!m || typeof m !== "object") continue;
        const id = String(m.id || "");
        const name = String(m.name || "");
        if (!id) continue;
        next.set(id, { id, name });
      }
      next.set(clientId, { id: clientId, name: playerName });
      members = next;

      const s = msg.seats && typeof msg.seats === "object" ? msg.seats : {};
      seats = { A: String(s.A || ""), B: String(s.B || "") };
      if (!seats.A || !seats.B) seats = pickSeats(Array.from(members.keys()));

      const r = msg.round && typeof msg.round === "object" ? msg.round : null;
      if (r) {
        round = {
          id: String(r.id || ""),
          phase: String(r.phase || "idle"),
          createdAt: Number(r.createdAt || 0),
          goAt: Number(r.goAt || 0),
          goWindowMs: clampInt(r.goWindowMs || 7000, 2000, 20000),
        };
        if (!["idle", "wait", "go", "done"].includes(round.phase)) round.phase = "idle";
      }

      const incoming = Array.isArray(msg.results) ? msg.results : [];
      const res = new Map();
      for (const [k, v] of incoming) {
        if (k === "winner") {
          res.set("winner", String(v || ""));
          continue;
        }
        const id = String(k || "");
        if (!id) continue;
        if (!v || typeof v !== "object") continue;
        res.set(id, {
          clientId: id,
          foul: Boolean(v.foul),
          reactionMs: clampInt(v.reactionMs || 0, 0, 99999),
        });
      }
      results = res;

      if (round.phase === "idle") resetLocal();
      render();
      return;
    }

    if (msg.type === "result") {
      if (!isHost || !room) return;
      if (String(msg.roundId || "") !== round.id) return;
      const id = String(msg.clientId || "");
      if (!id) return;
      const foul = Boolean(msg.foul);
      const clickAt = Number(msg.clickAt || 0);
      let reactionMs = 0;
      if (!foul && Number.isFinite(clickAt)) reactionMs = clampInt(clickAt - round.goAt, 0, 99999);
      results.set(id, { clientId: id, foul, reactionMs });
      if (round.phase !== "done") round = { ...round, phase: "done" };
      hostTryFinalize();
      broadcastState();
      render();
    }
  }

  function cleanup() {
    if (ping) window.clearInterval(ping);
    ping = 0;
    if (transport) transport.close();
    transport = null;
  }

  window.addEventListener("beforeunload", cleanup);

  if (padBtn) padBtn.addEventListener("click", onPadClick);

  if (readyBtn) {
    readyBtn.addEventListener("click", () => {
      if (!isHost) return;
      hostStartRound();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (!isHost) return;
      hostResetAll();
    });
  }

  if (!room) {
    round = { id: "local", phase: "idle", createdAt: 0, goAt: 0, goWindowMs: 7000 };
    members = new Map();
    members.set(clientId, { id: clientId, name: playerName });
    seats = { A: clientId, B: "" };
    isHost = true;

    const localStart = () => {
      resetLocal();
      results = new Map();
      const delay = clampInt(900 + Math.random() * 2100, 800, 3200);
      const createdAt = now();
      const goAt = createdAt + delay;
      round = { id: String(createdAt), phase: "wait", createdAt, goAt, goWindowMs: 7000 };
      render();
    };

    if (readyBtn) {
      readyBtn.disabled = false;
      readyBtn.addEventListener("click", localStart);
    }
    if (resetBtn) resetBtn.disabled = false;

    padBtn.disabled = true;
    render();
    window.setInterval(tickPhase, 30);
    return;
  }

  transport = createRoomTransport(`${GAME_ID}_${room}`, onMessage);
  members = new Map();
  members.set(clientId, { id: clientId, name: playerName });
  seats = pickSeats(Array.from(members.keys()));

  const joinMsg = { type: "join", gameId: GAME_ID, room, clientId, name: playerName };
  transport.send(joinMsg);
  ping = window.setInterval(() => {
    if (!transport) return;
    transport.send(joinMsg);
  }, 1200);

  window.setInterval(tickPhase, 30);
  render();
}

main();

