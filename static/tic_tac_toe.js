import { getOrCreateClientId, getPlayerName, getQueryParam, normalizeRoomCode, setPageTitle } from "./lib.js";
import { createRoomTransport } from "./room_channel.js";

const GAME_ID = "tic-tac-toe";

function sleep(ms) {
  return new Promise((r) => window.setTimeout(r, ms));
}

function otherSymbol(symbol) {
  return symbol === "X" ? "O" : "X";
}

function hostKey(room) {
  return `xiaoyouxi_room_host_${GAME_ID}_${room}`;
}

function ensureHost(room) {
  const key = hostKey(room);
  const exist = localStorage.getItem(key);
  if (exist) return exist;
  const val = getOrCreateClientId();
  localStorage.setItem(key, val);
  return val;
}

function winnerOf(board) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    const x = board[a];
    if (x && x === board[b] && x === board[c]) return x;
  }
  return "";
}

function bestMove(board, aiSymbol) {
  const me = aiSymbol;
  const opp = otherSymbol(me);

  function terminalScore(depth) {
    const w = winnerOf(board);
    if (w === me) return 10 - depth;
    if (w === opp) return depth - 10;
    if (board.every((x) => Boolean(x))) return 0;
    return null;
  }

  function minimax(turn, depth) {
    const t = terminalScore(depth);
    if (t !== null) return t;

    const isMax = turn === me;
    let best = isMax ? -999 : 999;
    for (let i = 0; i < 9; i += 1) {
      if (board[i]) continue;
      board[i] = turn;
      const s = minimax(otherSymbol(turn), depth + 1);
      board[i] = "";
      if (isMax) best = Math.max(best, s);
      else best = Math.min(best, s);
    }
    return best;
  }

  let bestIdx = -1;
  let bestScore = -999;
  for (let i = 0; i < 9; i += 1) {
    if (board[i]) continue;
    board[i] = me;
    const s = minimax(opp, 1);
    board[i] = "";
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function newGame() {
  return {
    board: Array.from({ length: 9 }, () => ""),
    turn: "X",
    winner: "",
    done: false,
  };
}

function main() {
  const roomRaw = getQueryParam("room");
  const roleRaw = getQueryParam("role");
  const aiRaw = getQueryParam("ai");
  const room = roomRaw ? normalizeRoomCode(roomRaw) : "";
  const clientId = getOrCreateClientId();
  const playerName = getPlayerName();

  setPageTitle("井字棋");

  const backLink = document.getElementById("backLink");
  const roomChip = document.getElementById("roomChip");
  const roleChip = document.getElementById("roleChip");
  const statusText = document.getElementById("statusText");
  const hintText = document.getElementById("hintText");
  const boardEl = document.getElementById("board");
  const resetBtn = document.getElementById("resetBtn");

  if (roomChip) roomChip.textContent = room ? `房间：${room}` : "单机";
  if (roleChip) roleChip.textContent = roleRaw ? String(roleRaw) : "";
  if (backLink && room) {
    const url = new URL("./room.html", window.location.href);
    url.searchParams.set("game", GAME_ID);
    url.searchParams.set("name", "井字棋");
    backLink.href = url.toString();
  }

  if (!boardEl) return;
  const cells = Array.from({ length: 9 }, (_, i) => {
    const btn = document.createElement("button");
    btn.className = "tttCell";
    btn.type = "button";
    btn.dataset.idx = String(i);
    btn.setAttribute("aria-label", `格子 ${i + 1}`);
    boardEl.appendChild(btn);
    return btn;
  });

  let transport = null;
  let ping = 0;
  let members = new Map();
  let hostId = room ? ensureHost(room) : clientId;
  let isHost = hostId === clientId;
  let seats = { X: "", O: "" };
  let game = newGame();
  let localMode = !room;
  let ai = { enabled: false, symbol: "O" };
  let aiTimer = 0;

  const wantAiFromRoom = Number(aiRaw || "0") > 0;
  if ((!room || isHost) && wantAiFromRoom) ai.enabled = true;

  function mySymbol() {
    if (seats.X === clientId) return "X";
    if (seats.O === clientId) return "O";
    return "";
  }

  function assignSeats() {
    const ids = Array.from(members.keys())
      .filter(Boolean)
      .slice()
      .sort((a, b) => a.localeCompare(b));
    seats = { X: ids[0] || "", O: ids[1] || "" };
  }

  function canHotseat() {
    if (!room) return true;
    const ids = Array.from(members.keys()).filter(Boolean);
    return ids.length < 2 && clientId === hostId;
  }

  function aiControlsSymbol(symbol) {
    if (!ai.enabled) return false;
    if (symbol !== ai.symbol) return false;
    if (!room) return true;
    return !seats[symbol];
  }

  function shouldAiAct() {
    if (!aiControlsSymbol(game.turn)) return false;
    if (game.done) return false;
    if (room) return isHost;
    return true;
  }

  function clearAiTimer() {
    if (!aiTimer) return;
    window.clearTimeout(aiTimer);
    aiTimer = 0;
  }

  function maybeRunAi() {
    if (!shouldAiAct()) {
      clearAiTimer();
      return;
    }
    if (aiTimer) return;
    aiTimer = window.setTimeout(() => {
      aiTimer = 0;
      if (!shouldAiAct()) return;
      const idx = bestMove(game.board, ai.symbol);
      if (idx < 0) return;
      if (applyMove(idx, ai.symbol)) {
        if (room) broadcastState();
        render();
      }
    }, 260);
  }

  function render() {
    const w = game.winner;
    const filled = game.board.every((x) => Boolean(x));
    const sym = mySymbol();
    const myTurn = sym && game.turn === sym;
    const hotseat = canHotseat();
    const spectator = room && !sym && !hotseat;
    const localHuman = otherSymbol(ai.symbol);
    const localMyTurn = !ai.enabled || game.turn === localHuman;

    for (const btn of cells) {
      const idx = Number(btn.dataset.idx || "0");
      const v = game.board[idx] || "";
      btn.textContent = v;
      if (game.done || Boolean(v) || spectator) {
        btn.disabled = true;
        continue;
      }
      if (!room) {
        btn.disabled = ai.enabled ? !localMyTurn : false;
        continue;
      }
      const hostHotseatTurn = isHost && hotseat && !aiControlsSymbol(game.turn);
      btn.disabled = !(myTurn || hostHotseatTurn);
    }

    if (roleChip) {
      const suffix = sym ? ` | 你是 ${sym}` : spectator ? " | 观战" : "";
      roleChip.textContent = `${roleRaw ? String(roleRaw) : ""}${suffix}`.trim() || (room ? "成员" : "单机");
    }

    if (statusText) {
      if (w) statusText.textContent = `${w} 获胜`;
      else if (game.done || filled) statusText.textContent = "平局";
      else if (room) {
        const who = game.turn === "X" ? "X" : "O";
        statusText.textContent = `${who} 回合${myTurn ? "（轮到你）" : ""}`;
      } else {
        statusText.textContent = `${game.turn} 回合`;
      }
    }

    if (hintText) {
      let hint = "";
      if (!room) {
        hint = ai.enabled
          ? `单机人机：你先手（${localHuman}），AI 是 ${ai.symbol}。`
          : "单机：点击落子，轮流走棋。";
      } else {
        const players = [seats.X, seats.O].filter(Boolean).length;
        if (players < 2) {
          hint = ai.enabled
            ? `已添加 AI：你先手（X），AI 是 ${ai.symbol}。`
            : hotseat
              ? "等待另一名玩家加入（当前可本机双人：你可以连续点击落子）。"
              : "等待玩家加入…";
        } else {
          hint = spectator ? "房间已满，当前为观战模式。" : "点击空格落子。";
        }
      }
      hintText.textContent = hint;
    }

    maybeRunAi();
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
      game,
      ai,
    });
  }

  function applyMove(idx, symbol) {
    if (game.done) return false;
    if (!Number.isInteger(idx) || idx < 0 || idx >= 9) return false;
    if (game.board[idx]) return false;
    if (symbol !== "X" && symbol !== "O") return false;
    if (symbol !== game.turn) return false;
    game.board[idx] = symbol;
    const w = winnerOf(game.board);
    if (w) {
      game.winner = w;
      game.done = true;
      return true;
    }
    const filled = game.board.every((x) => Boolean(x));
    if (filled) {
      game.done = true;
      return true;
    }
    game.turn = game.turn === "X" ? "O" : "X";
    return true;
  }

  function handleMoveRequest({ idx, from }) {
    if (!isHost || !room) return;
    const id = String(from || "");
    const i = Number(idx);
    let symbol = "";
    if (seats.X === id) symbol = "X";
    if (seats.O === id) symbol = "O";
    if (!symbol && canHotseat() && id === clientId && !aiControlsSymbol(game.turn)) symbol = game.turn;
    if (!symbol) return;
    if (applyMove(i, symbol)) {
      broadcastState();
      render();
    }
  }

  function resetGame() {
    game = newGame();
    render();
  }

  function onMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.gameId !== GAME_ID) return;
    if (room && String(msg.room || "") !== room) return;

    if (msg.type === "join") {
      if (!isHost || !room || !transport) return;
      const id = String(msg.clientId || "");
      const name = String(msg.name || "");
      if (!id || id === clientId) return;
      if (!members.has(id)) members.set(id, { id, name });
      else {
        const prev = members.get(id);
        members.set(id, { ...prev, name: name || prev?.name || "" });
      }
      assignSeats();
      const players = [seats.X, seats.O].filter(Boolean).length;
      if (players >= 2) ai.enabled = false;
      broadcastState();
      render();
      return;
    }

    if (msg.type === "state") {
      const incomingHost = String(msg.hostId || "");
      if (!incomingHost) return;
      hostId = incomingHost;
      isHost = hostId === clientId;

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
      seats = { X: String(s.X || ""), O: String(s.O || "") };
      if (!seats.X || !seats.O) assignSeats();

      const incomingAi = msg.ai && typeof msg.ai === "object" ? msg.ai : null;
      if (incomingAi) {
        ai = { enabled: Boolean(incomingAi.enabled), symbol: incomingAi.symbol === "X" ? "X" : "O" };
      }

      const incomingGame = msg.game && typeof msg.game === "object" ? msg.game : null;
      if (incomingGame && Array.isArray(incomingGame.board) && incomingGame.board.length === 9) {
        game = {
          board: incomingGame.board.map((x) => (x === "X" || x === "O" ? x : "")),
          turn: incomingGame.turn === "O" ? "O" : "X",
          winner: incomingGame.winner === "O" ? "O" : incomingGame.winner === "X" ? "X" : "",
          done: Boolean(incomingGame.done),
        };
      }

      render();
      return;
    }

    if (msg.type === "move") {
      if (!isHost) return;
      handleMoveRequest({ idx: msg.idx, from: msg.clientId });
      return;
    }

    if (msg.type === "reset") {
      if (!isHost || !room) return;
      resetGame();
      broadcastState();
      return;
    }
  }

  async function sendJoinLoop() {
    if (!room) return;
    transport = createRoomTransport(`${GAME_ID}_${room}`, onMessage);
    const joinMsg = { type: "join", gameId: GAME_ID, room, clientId, name: playerName };
    transport.send(joinMsg);
    ping = window.setInterval(() => {
      if (!transport) return;
      transport.send(joinMsg);
      if (isHost) broadcastState();
    }, 1200);

    members = new Map();
    members.set(clientId, { id: clientId, name: playerName });
    assignSeats();
    if (isHost) broadcastState();
    await sleep(50);
    render();
  }

  function cleanup() {
    if (ping) window.clearInterval(ping);
    ping = 0;
    if (transport) transport.close();
    transport = null;
    clearAiTimer();
  }

  window.addEventListener("beforeunload", cleanup);

  function localClick(idx) {
    if (game.done) return;
    if (ai.enabled && game.turn === ai.symbol) return;
    if (!applyMove(idx, game.turn)) return;
    render();
  }

  function onlineClick(idx) {
    if (!room) return;
    if (game.done) return;
    if (isHost) {
      const mine = mySymbol();
      const sym = mine || (canHotseat() && !aiControlsSymbol(game.turn) ? game.turn : "");
      if (!sym) return;
      if (applyMove(idx, sym)) {
        broadcastState();
        render();
      }
      return;
    }
    if (!transport) return;
    transport.send({ type: "move", gameId: GAME_ID, room, clientId, idx });
  }

  for (const btn of cells) {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx || "0");
      if (localMode) localClick(idx);
      else onlineClick(idx);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (localMode) {
        resetGame();
        return;
      }
      if (!room) return;
      if (isHost) {
        resetGame();
        broadcastState();
        return;
      }
      if (transport) transport.send({ type: "reset", gameId: GAME_ID, room, clientId });
    });
  }

  if (!room) {
    localMode = true;
    render();
    return;
  }

  localMode = false;
  sendJoinLoop();
}

main();
