import { getOrCreateClientId, getPlayerName, getQueryParam, normalizeRoomCode, setPageTitle } from "./lib.js";
import { createRoomTransport } from "./room_channel.js";

const GAME_ID = "flying-chess";
const MAX_PLAYERS = 4;
const PIECES_PER_PLAYER = 4;
const TRACK_LEN = 52;
const HOME_LEN = 6;
const FINISH_STEP = TRACK_LEN + HOME_LEN;

const COLORS = [
  { key: "R", name: "红", hex: "#ff4b3a", start: 13 },
  { key: "B", name: "蓝", hex: "#1ea7ff", start: 39 },
  { key: "Y", name: "黄", hex: "#ffcc1a", start: 26 },
  { key: "G", name: "绿", hex: "#34d399", start: 0 },
];

const MAPXY = [
  [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, -4, 0, 0, 0],
  [0, 0, 0, 0, 52, 0, 0, 60, 0, 0, 8, 0, 0, 0, 0],
  [0, 0, 0, 0, 51, 0, 0, 61, 0, 0, 9, 0, 0, 0, 0],
  [-5, 0, 0, 0, 50, 0, 0, 62, 0, 0, 10, 0, 0, 0, 0],
  [46, 47, 48, 49, 0, 0, 0, 63, 0, 0, 0, 11, 12, 13, 14],
  [45, 0, 0, 0, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 15],
  [44, 0, 0, 0, 0, 0, 0, 65, 0, 0, 0, 0, 0, 0, 16],
  [43, 90, 91, 92, 93, 94, 95, 99, 75, 74, 73, 72, 71, 70, 17],
  [42, 0, 0, 0, 0, 0, 0, 85, 0, 0, 0, 0, 0, 0, 18],
  [41, 0, 0, 0, 0, 0, 0, 84, 0, 0, 0, 0, 0, 0, 19],
  [40, 39, 38, 37, 0, 0, 0, 83, 0, 0, 0, 23, 22, 21, 20],
  [0, 0, 0, 0, 36, 0, 0, 82, 0, 0, 24, 0, 0, 0, -3],
  [0, 0, 0, 0, 35, 0, 0, 81, 0, 0, 25, 0, 0, 0, 0],
  [0, 0, 0, 0, 34, 0, 0, 80, 0, 0, 26, 0, 0, 0, 0],
  [0, 0, 0, -2, 33, 32, 31, 30, 29, 28, 27, 0, 0, 0, 0],
];

const TRACK_ORDER = [
  46, 47, 48, 49, 50, 51, 52, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45,
];

const HOME_CELLS = {
  R: [60, 61, 62, 63, 64, 65],
  Y: [70, 71, 72, 73, 74, 75],
  B: [80, 81, 82, 83, 84, 85],
  G: [90, 91, 92, 93, 94, 95],
};

const TRACK_INDEX = new Map(TRACK_ORDER.map((v, i) => [v, i]));

const SPECIAL_POS = {
  R: [8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52],
  Y: [21, 25, 29, 33, 37, 41, 45, 49, 1, 5, 9, 13],
  B: [34, 38, 42, 46, 50, 2, 6, 10, 14, 18, 22, 26],
  G: [47, 51, 3, 7, 11, 15, 19, 23, 27, 31, 35, 39],
};

function now() {
  return Date.now();
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, Math.trunc(x)));
}

function isAiId(id) {
  return String(id || "").startsWith("ai_");
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
  const ids = memberIds.filter(Boolean).slice(0, MAX_PLAYERS);
  const out = {};
  for (let i = 0; i < COLORS.length; i += 1) out[COLORS[i].key] = ids[i] || "";
  return out;
}

function newGame() {
  const players = COLORS.map((c) => ({
    color: c.key,
    pieces: Array.from({ length: PIECES_PER_PLAYER }, () => -1),
    finished: 0,
  }));
  return {
    startedAt: now(),
    players,
    turn: "R",
    phase: "await_roll",
    dice: 0,
    lastRoll: 0,
    diceAt: 0,
    rollerId: "",
    sixStreak: 0,
    last: "",
    winner: "",
    lastMoveTrace: null,
  };
}

function colorMeta(key) {
  return COLORS.find((c) => c.key === key) || COLORS[0];
}

function globalPos(colorKey, steps) {
  const meta = colorMeta(colorKey);
  return (meta.start + steps) % TRACK_LEN;
}

function isOnTrack(steps) {
  return steps >= 0 && steps < TRACK_LEN;
}

function isInHome(steps) {
  return steps >= TRACK_LEN && steps < FINISH_STEP;
}

function isFinished(steps) {
  return steps === FINISH_STEP;
}

function takeoffAllowed(dice) {
  return dice === 4 || dice === 6;
}

function trackValueAt(colorKey, steps) {
  const meta = colorMeta(colorKey);
  const idx = (meta.start + steps) % TRACK_LEN;
  return TRACK_ORDER[idx];
}

function cellValueAt(colorKey, steps) {
  if (isOnTrack(steps)) return trackValueAt(colorKey, steps);
  if (isInHome(steps)) return HOME_CELLS[colorKey]?.[steps - TRACK_LEN] || 0;
  if (isFinished(steps)) return 99;
  return 0;
}

function piecesAtTrackValue(game, value) {
  const out = [];
  for (const p of game.players) {
    for (let i = 0; i < p.pieces.length; i += 1) {
      const s = p.pieces[i];
      if (!isOnTrack(s)) continue;
      if (trackValueAt(p.color, s) === value) out.push({ color: p.color, piece: i });
    }
  }
  return out;
}

function groupByColor(items) {
  const map = new Map();
  for (const it of items) {
    const arr = map.get(it.color) || [];
    arr.push(it);
    map.set(it.color, arr);
  }
  return map;
}

function isBlockedByEnemyStack(game, movingColor, nextTrackValue) {
  const list = piecesAtTrackValue(game, nextTrackValue);
  if (!list.length) return false;
  const by = groupByColor(list);
  for (const [c, arr] of by.entries()) {
    if (c !== movingColor && arr.length >= 2) return true;
  }
  return false;
}

function simulateAdvance(game, colorKey, fromSteps, moveSteps) {
  let cur = fromSteps;
  let dir = 1;
  let remain = moveSteps;
  const pathValues = [];

  while (remain > 0) {
    let next = cur + dir;
    if (next > FINISH_STEP) {
      next = FINISH_STEP - (next - FINISH_STEP);
      dir = -1;
    }
    if (next < 0) {
      next = 0;
      dir = 1;
    }
    if (isOnTrack(next)) {
      const v = trackValueAt(colorKey, next);
      pathValues.push(v);
    }
    cur = next;
    remain -= 1;
  }

  return { to: cur, pathValues };
}

function simulateAdvanceSteps(game, colorKey, fromSteps, moveSteps) {
  let cur = fromSteps;
  let dir = 1;
  let remain = moveSteps;
  const pathSteps = [];
  while (remain > 0) {
    let next = cur + dir;
    if (next > FINISH_STEP) {
      next = FINISH_STEP - (next - FINISH_STEP);
      dir = -1;
    }
    if (next < 0) {
      next = 0;
      dir = 1;
    }
    cur = next;
    pathSteps.push(cur);
    remain -= 1;
  }
  return { to: cur, pathSteps };
}

function specialExtraFor(colorKey, steps) {
  if (!isOnTrack(steps)) return 0;
  const v = trackValueAt(colorKey, steps);
  const arr = SPECIAL_POS[colorKey] || [];
  const idx = arr.indexOf(v);
  if (idx < 0) return 0;
  return idx === 3 ? 16 : idx === 4 ? 12 : 4;
}

function simulateMoveSteps(game, colorKey, fromSteps, dice) {
  if (fromSteps === -1) {
    let cur = 0;
    const out = [-1, 0];
    const extra = specialExtraFor(colorKey, cur);
    if (extra > 0) {
      const sim = simulateAdvanceSteps(game, colorKey, cur, extra);
      out.push(...sim.pathSteps);
    }
    return out;
  }
  const sim = simulateAdvanceSteps(game, colorKey, fromSteps, dice);
  const out = [fromSteps, ...sim.pathSteps];
  const extra = specialExtraFor(colorKey, sim.to);
  if (extra > 0) {
    const sim2 = simulateAdvanceSteps(game, colorKey, sim.to, extra);
    out.push(...sim2.pathSteps);
  }
  return out;
}

function captureSingleEnemiesAtValue(game, movingColor, value) {
  const list = piecesAtTrackValue(game, value).filter((x) => x.color !== movingColor);
  if (!list.length) return;
  const by = groupByColor(list);
  const total = list.length;
  if (total !== 1) return;
  const victim = list[0];
  const vp = game.players.find((x) => x.color === victim.color);
  if (!vp) return;
  vp.pieces[victim.piece] = -1;
  vp.finished = vp.pieces.filter(isFinished).length;
}

function resolveLandingCollision(game, movingColor, value, movedRef) {
  const list = piecesAtTrackValue(game, value).filter((x) => x.color !== movingColor);
  if (!list.length) return;
  for (const hit of list) {
    const pp = game.players.find((x) => x.color === hit.color);
    if (!pp) continue;
    pp.pieces[hit.piece] = -1;
    pp.finished = pp.pieces.filter(isFinished).length;
  }
}

function maybeApplySpecial(game, colorKey, pieceIndex) {
  const p = game.players.find((x) => x.color === colorKey);
  if (!p) return;
  const s = p.pieces[pieceIndex];
  if (!isOnTrack(s)) return;
  const v = trackValueAt(colorKey, s);
  const arr = SPECIAL_POS[colorKey] || [];
  const idx = arr.indexOf(v);
  if (idx < 0) return;
  const extra = idx === 3 ? 16 : idx === 4 ? 12 : 4;
  const sim = simulateAdvance(game, colorKey, s, extra);
  p.pieces[pieceIndex] = sim.to;
  if (isOnTrack(sim.to)) {
    const lv = trackValueAt(colorKey, sim.to);
    resolveLandingCollision(game, colorKey, lv, { piece: pieceIndex });
  }
  p.finished = p.pieces.filter(isFinished).length;
}

function legalMovesFor(game, colorKey, dice) {
  if (!dice || dice < 1) return [];
  const p = game.players.find((x) => x.color === colorKey);
  if (!p) return [];
  const moves = [];
  for (let i = 0; i < p.pieces.length; i += 1) {
    const s = p.pieces[i];
    if (isFinished(s)) continue;
    if (s === -1) {
      if (takeoffAllowed(dice)) moves.push({ piece: i, kind: "takeoff" });
      continue;
    }
    const sim = simulateAdvance(game, colorKey, s, dice);
    if (sim.to === s) continue;
    moves.push({ piece: i, kind: "move" });
  }
  return moves;
}

function applyMove(game, colorKey, pieceIndex, dice) {
  const p = game.players.find((x) => x.color === colorKey);
  if (!p) return false;
  const idx = clampInt(pieceIndex, 0, PIECES_PER_PLAYER - 1);
  const from = p.pieces[idx];
  if (isFinished(from)) return false;

  if (from === -1) {
    if (!takeoffAllowed(dice)) return false;
    const lv = trackValueAt(colorKey, 0);
    p.pieces[idx] = 0;
    if (isOnTrack(0)) {
      resolveLandingCollision(game, colorKey, lv, { piece: idx });
    }
    p.finished = p.pieces.filter(isFinished).length;
    maybeApplySpecial(game, colorKey, idx);
  } else {
    const sim = simulateAdvance(game, colorKey, from, dice);
    if (sim.to === from) return false;
    p.pieces[idx] = sim.to;
    if (isOnTrack(sim.to)) {
      const lv = trackValueAt(colorKey, sim.to);
      resolveLandingCollision(game, colorKey, lv, { piece: idx });
    }
    p.finished = p.pieces.filter(isFinished).length;
    if (p.pieces[idx] !== -1) maybeApplySpecial(game, colorKey, idx);
  }

  for (const pp of game.players) {
    pp.finished = pp.pieces.filter(isFinished).length;
    if (pp.pieces.every(isFinished)) {
      game.winner = pp.color;
      game.phase = "done";
      return true;
    }
  }

  return true;
}

function nextTurn(current, seats) {
  const order = COLORS.map((c) => c.key);
  let idx = order.indexOf(current);
  for (let k = 0; k < order.length; k += 1) {
    idx = (idx + 1) % order.length;
    const key = order[idx];
    if (seats[key]) return key;
  }
  return current;
}

function main() {
  const roomRaw = getQueryParam("room");
  const roleRaw = getQueryParam("role");
  const aiRaw = getQueryParam("ai");
  const room = roomRaw ? normalizeRoomCode(roomRaw) : "";
  const clientId = getOrCreateClientId();
  const playerName = getPlayerName();

  setPageTitle("飞行棋");

  const backLink = document.getElementById("backLink");
  const roomChip = document.getElementById("roomChip");
  const roleChip = document.getElementById("roleChip");
  const turnChip = document.getElementById("turnChip");
  const diceChip = document.getElementById("diceChip");
  const statusText = document.getElementById("statusText");
  const hintText = document.getElementById("hintText");
  const rollBtn = document.getElementById("rollBtn");
  const passBtn = document.getElementById("passBtn");
  const resetBtn = document.getElementById("resetBtn");
  const movesEl = document.getElementById("moves");
  const canvas = document.getElementById("board");
  const diceOverlay = document.getElementById("diceOverlay");
  const diceFace = document.getElementById("diceFace");

  if (roomChip) roomChip.textContent = room ? `房间：${room}` : "单机";
  if (roleChip) roleChip.textContent = roleRaw ? String(roleRaw) : "";
  if (backLink && room) {
    const url = new URL("./room.html", window.location.href);
    url.searchParams.set("game", GAME_ID);
    url.searchParams.set("name", "飞行棋");
    backLink.href = url.toString();
  }

  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let transport = null;
  let ping = 0;
  let hostId = room ? ensureHost(room, clientId) : clientId;
  let isHost = hostId === clientId;
  let members = new Map();
  let seats = {};
  let game = newGame();
  let localMode = !room;
  let aiTarget = clampInt(aiRaw || 0, 0, 3);
  let aiLoop = 0;
  let diceAnim = 0;
  let lastDiceAtSeen = 0;
  let aiCooldownUntil = 0;
  let pieceHitAreas = [];
  let hoverPiece = -1;
  let selectedPiece = -1;
  let moveAnim = { color: "", piece: -1, steps: [], start: 0, duration: 0, until: 0 };
  let lastMoveToken = 0;
  let moveAnimRaf = 0;
  let boardSize = { ratio: 1, w: 1, h: 1 };
  let boardSkinReady = false;
  let boardSkin = null;
  const planeSpriteReady = { R: false, B: false, Y: false, G: false };
  const planeSpriteImage = { R: null, B: null, Y: null, G: null };
  const valueToGrid = new Map();
  for (let r = 0; r < MAPXY.length; r += 1) {
    for (let c = 0; c < MAPXY[r].length; c += 1) {
      const v = MAPXY[r][c];
      if (v) valueToGrid.set(v, { c, r });
    }
  }
  boardSkin = new Image();
  boardSkin.onload = () => {
    boardSkinReady = true;
    render();
  };
  boardSkin.src = "./static/flying_chess_board.svg";
  fetch("./static/flying_chess_board.svg")
    .then((r) => r.text())
    .then((svgText) => {
      const defs = svgText.match(/<defs>[\s\S]*?<\/defs>/i)?.[0];
      if (!defs) return;
      const useId = { R: "p-red-0", B: "p-blue-0", Y: "p-yellow-0", G: "p-green-0" };
      for (const c of COLORS) {
        const id = useId[c.key];
        if (!id) continue;
        const img = new Image();
        img.onload = () => {
          planeSpriteReady[c.key] = true;
          render();
        };
        img.src =
          "data:image/svg+xml;utf8," +
          encodeURIComponent(
            `<svg viewBox="-6.2 -6.2 12.4 12.4" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${defs}<use xlink:href="#${id}"/></svg>`,
          );
        planeSpriteImage[c.key] = img;
      }
    })
    .catch(() => {});

  function myColor() {
    for (const c of COLORS) {
      if (seats?.[c.key] === clientId) return c.key;
    }
    return "";
  }

  function spectator() {
    return room && !myColor();
  }

  function participantIds() {
    const allHumans = Array.from(members.keys())
      .filter((id) => !isAiId(id))
      .slice()
      .sort((a, b) => a.localeCompare(b));
    const bots = Array.from(members.keys())
      .filter((id) => isAiId(id))
      .slice()
      .sort((a, b) => a.localeCompare(b));
    const ids = [];
    if (hostId && !isAiId(hostId) && allHumans.includes(hostId)) ids.push(hostId);
    for (const id of allHumans) {
      if (id === hostId) continue;
      if (ids.length >= MAX_PLAYERS) break;
      ids.push(id);
    }
    for (const id of bots) {
      if (ids.length >= MAX_PLAYERS) break;
      ids.push(id);
    }
    return ids.slice(0, MAX_PLAYERS);
  }

  function aiId(i) {
    return `ai_${GAME_ID}_${room}_${i}`;
  }

  function ensureAiMembers() {
    if (!room || !isHost) return;
    const humans = Array.from(members.keys()).filter((id) => !isAiId(id)).length;
    const want = clampInt(aiTarget, 0, Math.max(0, MAX_PLAYERS - humans));

    for (const id of Array.from(members.keys())) {
      if (!isAiId(id)) continue;
      const n = Number(String(id).split("_").pop() || "0");
      if (!Number.isFinite(n) || n < 1 || n > want) members.delete(id);
    }
    for (let i = 1; i <= want; i += 1) {
      const id = aiId(i);
      if (!members.has(id)) members.set(id, { id, name: `AI-${i}` });
    }
  }

  function seatName(id) {
    if (id === clientId) return playerName;
    const m = members.get(id);
    if (m && m.name) return String(m.name);
    if (!id) return "";
    return `玩家${id.slice(0, 4)}`;
  }

  function setStatus(t) {
    if (statusText) statusText.textContent = t || "";
  }

  function setHint(t) {
    if (hintText) hintText.textContent = t || "";
  }

  function showDiceOverlay(value, at) {
    if (!diceOverlay || !diceFace) return;
    const v = clampInt(value, 1, 6);
    const runId = at || now();
    lastDiceAtSeen = runId;
    if (diceAnim) window.clearInterval(diceAnim);
    diceAnim = 0;
    diceOverlay.classList.remove("hidden");
    diceOverlay.classList.add("show");
    const start = now();
    diceAnim = window.setInterval(() => {
      const t = now() - start;
      if (t < 520) {
        diceFace.textContent = String(1 + Math.floor(Math.random() * 6));
        return;
      }
      diceFace.textContent = String(v);
      if (diceAnim) window.clearInterval(diceAnim);
      diceAnim = 0;
      window.setTimeout(() => {
        if (lastDiceAtSeen !== runId) return;
        diceOverlay.classList.remove("show");
        window.setTimeout(() => {
          if (lastDiceAtSeen !== runId) return;
          diceOverlay.classList.add("hidden");
        }, 120);
      }, 700);
    }, 60);
  }

  function fitCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * ratio));
    const h = Math.max(1, Math.floor(rect.height * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    boardSize = { ratio, w, h };
  }

  function drawBoard() {
    fitCanvas();
    const { w, h, ratio } = boardSize;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "#071b3a";
    ctx.fillRect(0, 0, w, h);

    const size = Math.min(w, h);
    const cell = size / 15;
    const ox = (w - cell * 15) / 2;
    const oy = (h - cell * 15) / 2;

    function roundRectPath(x, y, ww, hh, r) {
      const rr = Math.min(r, ww / 2, hh / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + ww - rr, y);
      ctx.quadraticCurveTo(x + ww, y, x + ww, y + rr);
      ctx.lineTo(x + ww, y + hh - rr);
      ctx.quadraticCurveTo(x + ww, y + hh, x + ww - rr, y + hh);
      ctx.lineTo(x + rr, y + hh);
      ctx.quadraticCurveTo(x, y + hh, x, y + hh - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.closePath();
    }

    function cellBox(c, r) {
      return { x: ox + c * cell, y: oy + r * cell, s: cell };
    }

    function cellCenter(c, r) {
      const minX = -88;
      const minY = -92;
      const viewW = 176;
      const viewH = 184;
      const gridMin = -78;
      const gridMax = 78;
      const step = (gridMax - gridMin) / 14;
      const xSvg = gridMin + step * c;
      const ySvg = gridMin + step * r;
      return {
        x: ox + ((xSvg - minX) / viewW) * (cell * 15),
        y: oy + ((ySvg - minY) / viewH) * (cell * 15),
      };
    }

    if (boardSkinReady && boardSkin) {
      ctx.drawImage(boardSkin, ox, oy, cell * 15, cell * 15);
    }
    let boardSnapshot = null;
    if (boardSkinReady) {
      boardSnapshot = document.createElement("canvas");
      boardSnapshot.width = w;
      boardSnapshot.height = h;
      const snapCtx = boardSnapshot.getContext("2d");
      if (snapCtx) snapCtx.drawImage(canvas, 0, 0);
    }

    function colorForValue(v) {
      if (v >= 1 && v <= 52) {
        const idx = TRACK_INDEX.get(v);
        const order = ["R", "Y", "B", "G"];
        const offset = 2;
        const key = order[((idx ?? 0) + offset) % 4] || "R";
        return colorMeta(key).hex;
      }
      if (v >= 60 && v <= 65) return colorMeta("Y").hex;
      if (v >= 70 && v <= 75) return colorMeta("B").hex;
      if (v >= 80 && v <= 85) return colorMeta("G").hex;
      if (v >= 90 && v <= 95) return colorMeta("R").hex;
      if (v === -2) return colorMeta("B").hex;
      if (v === -3) return colorMeta("Y").hex;
      if (v === -4) return colorMeta("R").hex;
      if (v === -5) return colorMeta("G").hex;
      return "rgba(148,163,184,0.25)";
    }

    function drawTile(c, r, v) {
      const { x, y, s } = cellBox(c, r);
      const pad = s * 0.08;
      const xx = x + pad;
      const yy = y + pad;
      const ss = s - pad * 2;
      const rad = ss * 0.22;

      const col = colorForValue(v);
      roundRectPath(xx, yy, ss, ss, rad);
      if (typeof col === "string" && col.startsWith("#")) {
        const bg = ctx.createLinearGradient(xx, yy, xx + ss, yy + ss);
        bg.addColorStop(0, rgba(lighten(col, 0.18), 1));
        bg.addColorStop(1, rgba(darken(col, 0.12), 1));
        ctx.fillStyle = bg;
        ctx.fill();

        const sheen = ctx.createLinearGradient(xx, yy, xx, yy + ss);
        sheen.addColorStop(0, "rgba(255,255,255,0.20)");
        sheen.addColorStop(0.55, "rgba(255,255,255,0.06)");
        sheen.addColorStop(1, "rgba(0,0,0,0.10)");
        ctx.fillStyle = sheen;
        ctx.fill();

        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1.4 * ratio;
        ctx.stroke();
      } else {
        const g = ctx.createLinearGradient(xx, yy, xx + ss, yy + ss);
        g.addColorStop(0, "rgba(255,255,255,0.12)");
        g.addColorStop(1, "rgba(0,0,0,0.18)");
        ctx.fillStyle = col;
        ctx.fill();
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1.2 * ratio;
        ctx.stroke();
      }

      if (v < 0) {
        const spec =
          v === -4
            ? { a: "G", b: "B", slash: 1, rot: Math.PI / 4 }
            : v === -3
              ? { a: "R", b: "G", slash: -1, rot: (3 * Math.PI) / 4 }
              : v === -2
                ? { a: "Y", b: "R", slash: 1, rot: (-3 * Math.PI) / 4 }
                : { a: "B", b: "Y", slash: -1, rot: -Math.PI / 4 };
        ctx.save();
        roundRectPath(xx, yy, ss, ss, rad);
        ctx.clip();
        if (spec.slash > 0) {
          ctx.beginPath();
          ctx.moveTo(xx, yy);
          ctx.lineTo(xx + ss, yy);
          ctx.lineTo(xx + ss, yy + ss);
          ctx.closePath();
          ctx.fillStyle = colorMeta(spec.a).hex;
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(xx, yy);
          ctx.lineTo(xx, yy + ss);
          ctx.lineTo(xx + ss, yy + ss);
          ctx.closePath();
          ctx.fillStyle = colorMeta(spec.b).hex;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(xx, yy);
          ctx.lineTo(xx + ss, yy);
          ctx.lineTo(xx, yy + ss);
          ctx.closePath();
          ctx.fillStyle = colorMeta(spec.a).hex;
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(xx + ss, yy);
          ctx.lineTo(xx + ss, yy + ss);
          ctx.lineTo(xx, yy + ss);
          ctx.closePath();
          ctx.fillStyle = colorMeta(spec.b).hex;
          ctx.fill();
        }
        ctx.restore();

        ctx.save();
        roundRectPath(xx, yy, ss, ss, rad);
        ctx.clip();
        ctx.strokeStyle = "rgba(15,23,42,0.65)";
        ctx.lineWidth = 1.2 * ratio;
        ctx.beginPath();
        if (spec.slash > 0) {
          ctx.moveTo(xx + 1, yy + 1);
          ctx.lineTo(xx + ss - 1, yy + ss - 1);
        } else {
          ctx.moveTo(xx + ss - 1, yy + 1);
          ctx.lineTo(xx + 1, yy + ss - 1);
        }
        ctx.stroke();
        ctx.restore();

        miniPlane(xx + ss * 0.27, yy + ss * 0.27, "#60a5fa", spec.rot);
      }
    }

    function drawSplitTile(c, r, colorA, colorB, slash) {
      const { x, y, s } = cellBox(c, r);
      const pad = s * 0.08;
      const xx = x + pad;
      const yy = y + pad;
      const ss = s - pad * 2;
      const rad = ss * 0.22;
      ctx.save();
      roundRectPath(xx, yy, ss, ss, rad);
      ctx.clip();
      if (slash > 0) {
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx + ss, yy);
        ctx.lineTo(xx + ss, yy + ss);
        ctx.closePath();
        ctx.fillStyle = colorMeta(colorA).hex;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx, yy + ss);
        ctx.lineTo(xx + ss, yy + ss);
        ctx.closePath();
        ctx.fillStyle = colorMeta(colorB).hex;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx + ss, yy);
        ctx.lineTo(xx, yy + ss);
        ctx.closePath();
        ctx.fillStyle = colorMeta(colorA).hex;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(xx + ss, yy);
        ctx.lineTo(xx + ss, yy + ss);
        ctx.lineTo(xx, yy + ss);
        ctx.closePath();
        ctx.fillStyle = colorMeta(colorB).hex;
        ctx.fill();
      }
      ctx.restore();
      roundRectPath(xx, yy, ss, ss, rad);
      ctx.strokeStyle = "rgba(15,23,42,0.55)";
      ctx.lineWidth = 1.3 * ratio;
      ctx.stroke();
      ctx.beginPath();
      if (slash > 0) {
        ctx.moveTo(xx + 1, yy + 1);
        ctx.lineTo(xx + ss - 1, yy + ss - 1);
      } else {
        ctx.moveTo(xx + ss - 1, yy + 1);
        ctx.lineTo(xx + 1, yy + ss - 1);
      }
      ctx.strokeStyle = "rgba(15,23,42,0.72)";
      ctx.lineWidth = 1.2 * ratio;
      ctx.stroke();
    }

    function parseHex(hex) {
      const h = String(hex || "").replace("#", "").trim();
      if (h.length !== 6) return { r: 255, g: 255, b: 255 };
      const n = Number.parseInt(h, 16);
      if (!Number.isFinite(n)) return { r: 255, g: 255, b: 255 };
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function mixRgb(a, b, t) {
      const tt = Math.min(1, Math.max(0, t));
      return {
        r: Math.round(a.r + (b.r - a.r) * tt),
        g: Math.round(a.g + (b.g - a.g) * tt),
        b: Math.round(a.b + (b.b - a.b) * tt),
      };
    }

    function rgba(c, a) {
      const aa = Number.isFinite(a) ? a : 1;
      return `rgba(${c.r},${c.g},${c.b},${aa})`;
    }

    function lighten(hex, t) {
      return mixRgb(parseHex(hex), { r: 255, g: 255, b: 255 }, t);
    }

    function darken(hex, t) {
      return mixRgb(parseHex(hex), { r: 0, g: 0, b: 0 }, t);
    }

    function miniPlane(x, y, colorHex, angle) {
      const s = cell * 0.24;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle || 0);
      ctx.fillStyle = colorHex;
      ctx.strokeStyle = "rgba(15,23,42,0.22)";
      ctx.lineWidth = 1.1 * ratio;
      ctx.beginPath();
      ctx.moveTo(s * 0.62, 0);
      ctx.quadraticCurveTo(s * 0.34, -s * 0.16, s * 0.08, -s * 0.18);
      ctx.lineTo(-s * 0.08, -s * 0.18);
      ctx.lineTo(-s * 0.25, -s * 0.34);
      ctx.lineTo(-s * 0.12, -s * 0.06);
      ctx.lineTo(-s * 0.62, -s * 0.2);
      ctx.lineTo(-s * 0.42, 0);
      ctx.lineTo(-s * 0.62, s * 0.2);
      ctx.lineTo(-s * 0.12, s * 0.06);
      ctx.lineTo(-s * 0.25, s * 0.34);
      ctx.lineTo(-s * 0.08, s * 0.18);
      ctx.lineTo(s * 0.08, s * 0.18);
      ctx.quadraticCurveTo(s * 0.34, s * 0.16, s * 0.62, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.arc(s * 0.18, 0, s * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const bases = [
      { key: "G", x: 0, y: 0 },
      { key: "R", x: 11, y: 0 },
      { key: "B", x: 0, y: 11 },
      { key: "Y", x: 11, y: 11 },
    ];
    const center = valueToGrid.get(99) || { c: 7, r: 7 };
    const cc = cellCenter(center.c, center.r);
    const planeSourceCenter = {
      B: { x: -61.8, y: 61.8 },
      G: { x: -61.8, y: -61.8 },
      R: { x: 61.8, y: -61.8 },
      Y: { x: 61.8, y: 61.8 },
    };

    function getPlaneSourceRect(colorKey) {
      if (!boardSnapshot) return null;
      const c0 = planeSourceCenter[colorKey];
      if (!c0) return null;
      const minX = -88;
      const minY = -92;
      const viewW = 176;
      const viewH = 184;
      const userW = 12.4;
      const userH = 12.4;
      const left = c0.x - userW / 2;
      const top = c0.y - userH / 2;
      const sx = ox + ((left - minX) / viewW) * (cell * 15);
      const sy = oy + ((top - minY) / viewH) * (cell * 15);
      const sw = (userW / viewW) * (cell * 15);
      const sh = (userH / viewH) * (cell * 15);
      return { sx, sy, sw, sh };
    }
    const planeSprites = { R: null, B: null, Y: null, G: null };

    function getPlaneSprite(colorKey) {
      const exist = planeSprites[colorKey];
      if (exist) return exist;
      const src = getPlaneSourceRect(colorKey);
      if (!src || !boardSnapshot) return null;
      const cw = Math.max(1, Math.round(src.sw));
      const ch = Math.max(1, Math.round(src.sh));
      const off = document.createElement("canvas");
      off.width = cw;
      off.height = ch;
      const octx = off.getContext("2d");
      if (!octx) return null;
      const inset = Math.max(0.6, Math.min(src.sw, src.sh) * 0.04);
      octx.drawImage(
        boardSnapshot,
        src.sx + inset,
        src.sy + inset,
        src.sw - inset * 2,
        src.sh - inset * 2,
        0,
        0,
        cw,
        ch,
      );
      planeSprites[colorKey] = off;
      return off;
    }

    const perCellOffsets = new Map();
    function offsetForKey(key) {
      const n = perCellOffsets.get(key) || 0;
      perCellOffsets.set(key, n + 1);
      if (n === 0) return { dx: 0, dy: 0 };
      const ring = [
        { dx: -cell * 0.16, dy: -cell * 0.16 },
        { dx: cell * 0.16, dy: -cell * 0.16 },
        { dx: -cell * 0.16, dy: cell * 0.16 },
        { dx: cell * 0.16, dy: cell * 0.16 },
      ];
      return ring[(n - 1) % ring.length];
    }

    const planeIconBase = cell * ((12.4 * 15) / 176);
    const planeCenterYOffset = 0;
    function planeShape(x, y, colorKey, angle, label, scale = 1) {
      const s = cell * 0.58;
      ctx.save();
      ctx.translate(x, y + planeCenterYOffset);
      ctx.rotate(angle);
      const sprite = planeSpriteReady[colorKey] ? planeSpriteImage[colorKey] : null;
      if (sprite) {
        const icon = planeIconBase * scale;
        ctx.drawImage(sprite, -icon / 2, -icon / 2, icon, icon);
        ctx.restore();
        return;
      }
      const colorHex = colorMeta(colorKey).hex;
      ctx.fillStyle = colorHex;
      ctx.strokeStyle = "rgba(15,23,42,0.35)";
      ctx.lineWidth = 1.3 * ratio;

      ctx.beginPath();
      ctx.moveTo(s * 0.62, 0);
      ctx.quadraticCurveTo(s * 0.34, -s * 0.16, s * 0.08, -s * 0.18);
      ctx.lineTo(-s * 0.08, -s * 0.18);
      ctx.lineTo(-s * 0.25, -s * 0.34);
      ctx.lineTo(-s * 0.12, -s * 0.06);
      ctx.lineTo(-s * 0.62, -s * 0.2);
      ctx.lineTo(-s * 0.42, 0);
      ctx.lineTo(-s * 0.62, s * 0.2);
      ctx.lineTo(-s * 0.12, s * 0.06);
      ctx.lineTo(-s * 0.25, s * 0.34);
      ctx.lineTo(-s * 0.08, s * 0.18);
      ctx.lineTo(s * 0.08, s * 0.18);
      ctx.quadraticCurveTo(s * 0.34, s * 0.16, s * 0.62, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(s * 0.18, 0, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(15,23,42,0.25)";
      ctx.lineWidth = 1 * ratio;
      ctx.stroke();

      ctx.fillStyle = "rgba(15,23,42,0.82)";
      ctx.font = `${Math.floor(cell * 0.22)}px ui-sans-serif, system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, s * 0.18, 0);
      ctx.restore();
    }

    function glowAt(x, y, mode) {
      ctx.save();
      const rr = mode === "selected" ? cell * 0.42 : cell * 0.36;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fillStyle = mode === "selected" ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.2)";
      ctx.fill();
      ctx.strokeStyle = mode === "selected" ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.75)";
      ctx.lineWidth = 1.6 * ratio;
      ctx.stroke();
      ctx.restore();
    }

    function posFor(colorKey, steps) {
      if (steps === -1) return null;
      if (isOnTrack(steps)) {
        const idx = (colorMeta(colorKey).start + steps) % TRACK_LEN;
        const v = TRACK_ORDER[idx];
        const p = valueToGrid.get(v);
        if (!p) return null;
        return { key: `t_${v}`, ...cellCenter(p.c, p.r) };
      }
      if (isInHome(steps)) {
        const idx = steps - TRACK_LEN;
        const v = HOME_CELLS[colorKey]?.[idx];
        const p = valueToGrid.get(v);
        if (!p) return null;
        return { key: `h_${colorKey}_${idx}`, ...cellCenter(p.c, p.r) };
      }
      if (isFinished(steps)) {
        const dx = colorKey === "Y" ? cell * 0.55 : colorKey === "G" ? -cell * 0.55 : 0;
        const dy = colorKey === "B" ? cell * 0.55 : colorKey === "R" ? -cell * 0.55 : 0;
        return { key: `f_${colorKey}`, x: cc.x + dx, y: cc.y + dy };
      }
      return null;
    }

    function baseSlot(colorKey, idx) {
      if (boardSkinReady) {
        const minX = -88;
        const minY = -92;
        const viewW = 176;
        const viewH = 184;
        const svgSlots = {
          R: [
            { x: 74.2, y: -61.8 },
            { x: 61.8, y: -61.8 },
            { x: 74.2, y: -74.2 },
            { x: 61.8, y: -74.2 },
          ],
          G: [
            { x: -61.8, y: -74.2 },
            { x: -61.8, y: -61.8 },
            { x: -74.2, y: -74.2 },
            { x: -74.2, y: -61.8 },
          ],
          B: [
            { x: -74.2, y: 61.8 },
            { x: -61.8, y: 61.8 },
            { x: -74.2, y: 74.2 },
            { x: -61.8, y: 74.2 },
          ],
          Y: [
            { x: 61.8, y: 74.2 },
            { x: 61.8, y: 61.8 },
            { x: 74.2, y: 74.2 },
            { x: 74.2, y: 61.8 },
          ],
        };
        const slots = svgSlots[colorKey];
        const p0 = slots?.[idx] || slots?.[0];
        if (p0) {
          return {
            x: ox + ((p0.x - minX) / viewW) * (cell * 15),
            y: oy + ((p0.y - minY) / viewH) * (cell * 15),
          };
        }
      }
      const box = bases.find((b) => b.key === colorKey);
      if (!box) return null;
      const p = cellBox(box.x, box.y);
      const slots = [
        { x: p.x + cell * 1.35, y: p.y + cell * 1.35 },
        { x: p.x + cell * 2.65, y: p.y + cell * 1.35 },
        { x: p.x + cell * 1.35, y: p.y + cell * 2.65 },
        { x: p.x + cell * 2.65, y: p.y + cell * 2.65 },
      ];
      return slots[idx] || slots[0];
    }

    function drawBaseVacancy(colorKey, idx) {
      const p = baseSlot(colorKey, idx);
      if (!p) return;
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, cell * 0.37, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(177,233,255,0.96)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1.1 * ratio;
      ctx.stroke();
      ctx.restore();
    }

    function angleFor(colorKey, steps) {
      if (steps === -1) {
        const v = TRACK_ORDER[colorMeta(colorKey).start % TRACK_LEN];
        const p = valueToGrid.get(v);
        if (!p) return 0;
        const a = baseSlot(colorKey, 0);
        const b = cellCenter(p.c, p.r);
        return Math.atan2(b.y - a.y, b.x - a.x);
      }
      const cur = posFor(colorKey, steps);
      const nxt = posFor(colorKey, steps + 1);
      if (cur && nxt) return Math.atan2(nxt.y - cur.y, nxt.x - cur.x);
      return 0;
    }

    function pointForStep(colorKey, pieceIdx, steps) {
      if (steps === -1) return baseSlot(colorKey, pieceIdx);
      const p = posFor(colorKey, steps);
      if (!p) return null;
      return { x: p.x, y: p.y };
    }

    function animPose(colorKey, pieceIdx) {
      if (!moveAnim || moveAnim.color !== colorKey || moveAnim.piece !== pieceIdx) return null;
      const steps = Array.isArray(moveAnim.steps) ? moveAnim.steps : [];
      if (steps.length < 2) return null;
      const t = now();
      const dur = Math.max(1, Number(moveAnim.duration || 1));
      const p = Math.max(0, Math.min(1, (t - moveAnim.start) / dur));
      const segN = steps.length - 1;
      const x = p * segN;
      const i = Math.min(segN - 1, Math.floor(x));
      const r = x - i;
      const a = pointForStep(colorKey, pieceIdx, steps[i]);
      const b = pointForStep(colorKey, pieceIdx, steps[i + 1]);
      if (!a || !b) return null;
      return {
        x: a.x + (b.x - a.x) * r,
        y: a.y + (b.y - a.y) * r,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }

    function finishedSpot(colorKey, pieceIdx) {
      const slots = [0, 1, 2, 3].map((i) => baseSlot(colorKey, i)).filter(Boolean);
      if (slots.length < 1) return null;
      let minX = slots[0].x;
      let maxX = slots[0].x;
      let minY = slots[0].y;
      let maxY = slots[0].y;
      for (const p of slots) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const x = colorKey === "G" || colorKey === "B" ? minX - cell * 0.85 : maxX + cell * 0.85;
      const y0 = minY - cell * 0.2;
      const gap = cell * 0.58;
      const k = clampInt(pieceIdx, 0, 3);
      return { x, y: y0 + k * gap };
    }

    pieceHitAreas = [];
    const mine = myColor();
    const mineTurn = mine && mine === game.turn;
    const legalSet =
      mineTurn && game.phase === "await_move"
        ? new Set(legalMovesFor(game, mine, clampInt(game.lastRoll || 0, 0, 6)).map((m) => m.piece))
        : new Set();
    const penaltySet = new Set();
    if (mineTurn && game.phase === "penalty") {
      const pMine = game.players.find((x) => x.color === mine);
      if (pMine) {
        for (let i = 0; i < pMine.pieces.length; i += 1) {
          if (pMine.pieces[i] !== -1 && !isFinished(pMine.pieces[i])) penaltySet.add(i);
        }
      }
    }

    for (const pl of game.players) {
      for (let i = 0; i < pl.pieces.length; i += 1) {
        if (pl.pieces[i] !== -1) drawBaseVacancy(pl.color, i);
      }
    }

    for (const pl of game.players) {
      for (let i = 0; i < pl.pieces.length; i += 1) {
        const s = pl.pieces[i];
        const label = String(i + 1);
        const ap = animPose(pl.color, i);
        if (ap) {
          planeShape(ap.x, ap.y, pl.color, ap.angle, label, 1);
          continue;
        }
        if (s === -1) {
          const bp = baseSlot(pl.color, i);
          if (!bp) continue;
          if (pl.color === mine && (legalSet.has(i) || penaltySet.has(i))) {
            pieceHitAreas.push({ piece: i, x: bp.x, y: bp.y, r: cell * 0.42 });
            if (selectedPiece === i) glowAt(bp.x, bp.y, "selected");
            else if (hoverPiece === i) glowAt(bp.x, bp.y, "hover");
          }
          planeShape(bp.x, bp.y, pl.color, angleFor(pl.color, -1), label, 1);
          continue;
        }
        if (isFinished(s)) {
          const p = finishedSpot(pl.color, i);
          if (!p) continue;
          planeShape(p.x, p.y, pl.color, angleFor(pl.color, -1), label);
          continue;
        }
        const p = posFor(pl.color, s);
        if (!p) continue;
        if (s === 0) {
          if (pl.color === mine && (legalSet.has(i) || penaltySet.has(i))) {
            pieceHitAreas.push({ piece: i, x: p.x, y: p.y, r: cell * 0.42 });
            if (selectedPiece === i) glowAt(p.x, p.y, "selected");
            else if (hoverPiece === i) glowAt(p.x, p.y, "hover");
          }
          planeShape(p.x, p.y, pl.color, angleFor(pl.color, s), label, 1);
          continue;
        }
        const off = offsetForKey(p.key);
        const px = p.x + off.dx;
        const py = p.y + off.dy;
        if (pl.color === mine && (legalSet.has(i) || penaltySet.has(i))) {
          pieceHitAreas.push({ piece: i, x: px, y: py, r: cell * 0.42 });
          if (selectedPiece === i) glowAt(px, py, "selected");
          else if (hoverPiece === i) glowAt(px, py, "hover");
        }
        planeShape(px, py, pl.color, angleFor(pl.color, s), label);
      }
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
      game,
    });
  }

  function applyHostRoll(fromId) {
    if (!isHost) return;
    if (game.phase !== "await_roll") return;
    const color = game.turn;
    const owner = seats?.[color] || "";
    if (room) {
      if (!owner || owner !== fromId) return;
    } else if (owner && owner !== fromId) return;
    const dice = clampInt(1 + Math.floor(Math.random() * 6), 1, 6);
    game.lastRoll = dice;
    game.diceAt = now();
    game.rollerId = String(fromId || "");
    if (dice === 6) game.sixStreak = clampInt((game.sixStreak || 0) + 1, 0, 3);
    else game.sixStreak = 0;

    if (game.sixStreak >= 3) {
      game.dice = 0;
      game.phase = "penalty";
      game.last = `${colorMeta(color).name}连续掷出三个6，选择一架回机场`;
      broadcastState();
      render();
      return;
    }

    game.dice = dice;
    const moves = legalMovesFor(game, color, dice);
    if (!moves.length) {
      game.last = `${colorMeta(color).name}掷出${dice}，无棋可走`;
      if (dice !== 6) {
        game.turn = nextTurn(game.turn, seats);
        game.sixStreak = 0;
      } else {
        game.last = `${game.last}，再来一次`;
      }
      game.dice = 0;
      game.phase = "await_roll";
    } else {
      game.phase = "await_move";
      game.last = `${colorMeta(color).name}掷出${dice}`;
    }
    broadcastState();
    render();
  }

  function applyHostMove(fromId, piece) {
    if (!isHost) return;
    if (game.phase !== "await_move") return;
    const color = game.turn;
    const owner = seats?.[color] || "";
    if (room) {
      if (!owner || owner !== fromId) return;
    } else if (owner && owner !== fromId) return;
    const legal = legalMovesFor(game, color, game.dice);
    const found = legal.find((m) => m.piece === Number(piece));
    if (!found) return;
    const lastDice = game.dice;
    const pBefore = game.players.find((x) => x.color === color);
    const fromSteps = pBefore ? pBefore.pieces[found.piece] : -1;
    const moveSteps = simulateMoveSteps(game, color, fromSteps, lastDice);
    const ok = applyMove(game, color, found.piece, lastDice);
    if (!ok) return;
    const pAfter = game.players.find((x) => x.color === color);
    const afterSteps = pAfter ? pAfter.pieces[found.piece] : -1;
    if (afterSteps !== -1 && moveSteps[moveSteps.length - 1] !== afterSteps) moveSteps.push(afterSteps);
    const segN = Math.max(1, moveSteps.length - 1);
    const dur = Math.max(220, segN * 140);
    moveAnim = { color, piece: found.piece, steps: moveSteps, start: now(), duration: dur, until: now() + dur };
    game.lastMoveTrace = { color, piece: found.piece, steps: moveSteps, token: now() };
    if (!isFinished(fromSteps) && isFinished(afterSteps)) {
      game.last = `${colorMeta(color).name}${found.piece + 1}号飞机到达终点`;
    }
    if (game.phase !== "done") {
      game.dice = 0;
      game.phase = "await_roll";
      if (lastDice === 6) {
        game.last = `${game.last}，再来一次`;
      } else {
        game.turn = nextTurn(game.turn, seats);
        game.sixStreak = 0;
      }
    }
    broadcastState();
    render();
  }

  function applyHostReset() {
    if (!isHost) return;
    game = newGame();
    moveAnim = { color: "", piece: -1, steps: [], start: 0, duration: 0, until: 0 };
    aiCooldownUntil = 0;
    broadcastState();
    render();
  }

  function applyHostPass(fromId) {
    if (!isHost) return;
    if (game.phase !== "await_roll") return;
    const color = game.turn;
    const owner = seats?.[color] || "";
    if (room) {
      if (!owner || owner !== fromId) return;
    } else if (owner && owner !== fromId) return;
    game.dice = 0;
    moveAnim = { color: "", piece: -1, steps: [], start: 0, duration: 0, until: 0 };
    game.last = "跳过";
    game.turn = nextTurn(game.turn, seats);
    game.phase = "await_roll";
    game.sixStreak = 0;
    broadcastState();
    render();
  }

  function applyHostPenalty(fromId, piece) {
    if (!isHost) return;
    if (game.phase !== "penalty") return;
    const color = game.turn;
    const owner = seats?.[color] || "";
    if (room) {
      if (!owner || owner !== fromId) return;
    } else if (owner && owner !== fromId) return;
    const p = game.players.find((x) => x.color === color);
    if (!p) return;
    const candidates = [];
    for (let i = 0; i < p.pieces.length; i += 1) {
      const s = p.pieces[i];
      if (s !== -1 && !isFinished(s)) candidates.push(i);
    }
    if (!candidates.length) {
      game.last = `${colorMeta(color).name}无可罚回的飞机`;
      game.turn = nextTurn(game.turn, seats);
      game.phase = "await_roll";
      game.dice = 0;
      game.sixStreak = 0;
      moveAnim = { color: "", piece: -1, steps: [], start: 0, duration: 0, until: 0 };
      broadcastState();
      render();
      return;
    }
    const idx = clampInt(piece, 0, PIECES_PER_PLAYER - 1);
    if (!candidates.includes(idx)) return;
    p.pieces[idx] = -1;
    moveAnim = { color: "", piece: -1, steps: [], start: 0, duration: 0, until: 0 };
    p.finished = p.pieces.filter(isFinished).length;
    game.last = `${colorMeta(color).name}罚回一架飞机`;
    game.turn = nextTurn(game.turn, seats);
    game.phase = "await_roll";
    game.dice = 0;
    game.sixStreak = 0;
    broadcastState();
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
      if (!id) return;
      if (!members.has(id)) members.set(id, { id, name });
      else {
        const prev = members.get(id);
        members.set(id, { ...prev, name: name || prev?.name || "" });
      }
      ensureAiMembers();
      seats = pickSeats(participantIds());
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
      const nextSeats = {};
      for (const c of COLORS) nextSeats[c.key] = String(s[c.key] || "");
      seats = nextSeats;
      if (msg.game && typeof msg.game === "object") game = msg.game;
      render();
      return;
    }

    if (msg.type === "action") {
      if (!isHost) return;
      const from = String(msg.clientId || "");
      const act = String(msg.act || "");
      if (act === "roll") applyHostRoll(from);
      if (act === "move") applyHostMove(from, msg.piece);
      if (act === "reset") applyHostReset();
      if (act === "pass") applyHostPass(from);
      if (act === "penalty") applyHostPenalty(from, msg.piece);
    }
  }

  function renderMoves() {
    if (!movesEl) return;
    movesEl.replaceChildren();
    const color = game.turn;

    if (game.phase === "penalty") {
      const p = game.players.find((x) => x.color === color);
      if (!p) return;
      for (let i = 0; i < p.pieces.length; i += 1) {
        const s = p.pieces[i];
        if (s === -1 || isFinished(s)) continue;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn small";
        b.textContent = `罚回飞机${i + 1}`;
        b.addEventListener("click", () => {
          const mine = myColor();
          if (room) {
            if (!mine || mine !== game.turn) return;
            if (isHost) applyHostPenalty(clientId, i);
            else transport?.send({ type: "action", gameId: GAME_ID, room, clientId, act: "penalty", piece: i });
            return;
          }
          if (isHost) applyHostPenalty(clientId, i);
        });
        movesEl.appendChild(b);
      }
      return;
    }

    if (game.phase !== "await_move") return;
    const legal = legalMovesFor(game, color, game.dice);
    if (!legal.length) return;
    for (const m of legal) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn small";
      b.textContent = m.kind === "takeoff" ? `起飞飞机${m.piece + 1}` : `移动飞机${m.piece + 1}`;
      b.addEventListener("click", () => {
        const mine = myColor();
        if (room) {
          if (!mine || mine !== game.turn) return;
          if (isHost) applyHostMove(clientId, m.piece);
          else transport?.send({ type: "action", gameId: GAME_ID, room, clientId, act: "move", piece: m.piece });
          return;
        }
        if (isHost) applyHostMove(clientId, m.piece);
      });
      movesEl.appendChild(b);
    }
  }

  function cloneGame(g) {
    return JSON.parse(JSON.stringify(g));
  }

  function aiChooseMove(color) {
    const dice = game.dice;
    const legal = legalMovesFor(game, color, dice);
    if (!legal.length) return null;

    const base = cloneGame(game);
    const baseSelf = base.players.find((p) => p.color === color);
    const baseFinished = baseSelf ? baseSelf.finished : 0;
    const baseOppAir = base.players
      .filter((p) => p.color !== color)
      .reduce((acc, p) => acc + p.pieces.filter((x) => x === -1).length, 0);

    let best = null;
    let bestScore = -1e9;

    for (const m of legal) {
      const sim = cloneGame(game);
      const beforeSelf = sim.players.find((p) => p.color === color);
      const beforeSteps = beforeSelf ? beforeSelf.pieces[m.piece] : -1;
      const ok = applyMove(sim, color, m.piece, dice);
      if (!ok) continue;
      const afterSelf = sim.players.find((p) => p.color === color);
      const afterFinished = afterSelf ? afterSelf.finished : 0;
      const afterOppAir = sim.players
        .filter((p) => p.color !== color)
        .reduce((acc, p) => acc + p.pieces.filter((x) => x === -1).length, 0);

      let score = 0;
      score += (afterFinished - baseFinished) * 10000;
      score += (afterOppAir - baseOppAir) * 180;
      if (sim.winner === color) score += 1000000;

      const afterSteps = afterSelf ? afterSelf.pieces[m.piece] : -1;
      if (afterSteps === -1 && beforeSteps !== -1) score -= 900;
      if (m.kind === "takeoff") score += 40;
      if (Number.isFinite(afterSteps)) score += clampInt(afterSteps, -1, FINISH_STEP) * 2;

      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }

    return best || legal[0];
  }

  function aiChoosePenaltyPiece(color) {
    const p = game.players.find((x) => x.color === color);
    if (!p) return 0;
    let best = -1;
    let bestSteps = Infinity;
    for (let i = 0; i < p.pieces.length; i += 1) {
      const s = p.pieces[i];
      if (s === -1 || isFinished(s)) continue;
      if (s < bestSteps) {
        bestSteps = s;
        best = i;
      }
    }
    return best >= 0 ? best : 0;
  }

  function maybeRunAi() {
    if (!room || !isHost) return;
    if (game.winner) return;
    const color = game.turn;
    const owner = seats?.[color] || "";
    if (!isAiId(owner)) return;
    const t = now();
    if (t < aiCooldownUntil) return;
    aiCooldownUntil = t + 700;

    if (game.phase === "await_roll") applyHostRoll(owner);
    else if (game.phase === "await_move") {
      const m = aiChooseMove(game.turn);
      if (m) applyHostMove(owner, m.piece);
    } else if (game.phase === "penalty") {
      const idx = aiChoosePenaltyPiece(game.turn);
      applyHostPenalty(owner, idx);
    }
  }

  function render() {
    if (room && isHost) {
      ensureAiMembers();
      seats = pickSeats(participantIds());
      if (!seats?.[game.turn]) game.turn = nextTurn(game.turn, seats);
    }
    if (turnChip) {
      const meta = colorMeta(game.turn);
      const owner = seats?.[game.turn] || "";
      const who = owner ? seatName(owner) : "空位";
      turnChip.textContent = `✈ 回合：${meta.name}（${who}）`;
    }
    if (diceChip) {
      const streak = clampInt(game.sixStreak || 0, 0, 3);
      const face = clampInt(game.lastRoll || 0, 0, 6);
      diceChip.textContent = `🎲 ${face || "-"}${streak ? `（连6:${streak}）` : ""}`;
    }

    const mine = myColor();
    if (!mine || mine !== game.turn || (game.phase !== "await_move" && game.phase !== "penalty")) {
      selectedPiece = -1;
      hoverPiece = -1;
    }
    const spec = spectator();
    const enough = !room || Object.values(seats).filter(Boolean).length >= 2;

    if (game.winner) {
      setStatus(`胜者：${colorMeta(game.winner).name}`);
    } else {
      setStatus(game.last || (enough ? "准备开始" : "等待玩家加入"));
    }

    if (spec) setHint("观战中：未分配颜色或已超出4人上限。");
    else if (room && !enough) setHint("至少 2 名玩家才建议开始。");
    else if (!mine) setHint("未分配颜色。");
    else if (mine !== game.turn) setHint(`你是：${colorMeta(mine).name}，等待 ${colorMeta(game.turn).name} 行动。`);
    else if (game.phase === "await_roll") setHint(`你是：${colorMeta(mine).name}，请掷骰。`);
    else if (game.phase === "await_move") setHint(`你是：${colorMeta(mine).name}，请选择要移动的飞机。`);
    else if (game.phase === "penalty") setHint(`你是：${colorMeta(mine).name}，连续三6：选择一架罚回机场。`);
    else setHint(`你是：${colorMeta(mine).name}`);

    if (rollBtn) {
      rollBtn.disabled = spec || game.phase !== "await_roll" || (room && mine !== game.turn) || Boolean(game.winner);
    }
    if (passBtn) {
      const canPass = !spec && game.phase === "await_roll" && (!room || mine === game.turn) && !game.winner;
      passBtn.disabled = !canPass;
    }
    if (resetBtn) resetBtn.disabled = room ? !isHost : false;

    const trace = game?.lastMoveTrace;
    if (trace && typeof trace === "object") {
      const tk = Number(trace.token || 0);
      if (tk && tk !== lastMoveToken) {
        const steps = Array.isArray(trace.steps) ? trace.steps.map((x) => Number(x)) : [];
        if (steps.length >= 2) {
          const segN = Math.max(1, steps.length - 1);
          const dur = Math.max(220, segN * 140);
          moveAnim = {
            color: String(trace.color || ""),
            piece: clampInt(trace.piece, 0, PIECES_PER_PLAYER - 1),
            steps,
            start: now(),
            duration: dur,
            until: now() + dur,
          };
        }
        lastMoveToken = tk;
      }
    }
    if (moveAnim.until && now() > moveAnim.until) {
      moveAnim = { color: "", piece: -1, steps: [], start: 0, duration: 0, until: 0 };
    }

    renderMoves();
    drawBoard();
    maybeRunAi();

    const at = Number(game.diceAt || 0);
    const v = clampInt(game.lastRoll || 0, 0, 6);
    if (at && v && at !== lastDiceAtSeen) showDiceOverlay(v, at);
    if (moveAnim.until && now() <= moveAnim.until && !moveAnimRaf) {
      moveAnimRaf = window.requestAnimationFrame(() => {
        moveAnimRaf = 0;
        render();
      });
    }
  }

  function localAssignSeats() {
    seats = { R: clientId, B: clientId, Y: "", G: "" };
    game.turn = "R";
  }

  if (rollBtn) {
    rollBtn.addEventListener("click", () => {
      if (localMode) {
        if (!isHost) return;
        applyHostRoll(clientId);
        return;
      }
      const mine = myColor();
      if (!mine || mine !== game.turn) return;
      if (isHost) applyHostRoll(clientId);
      else transport?.send({ type: "action", gameId: GAME_ID, room, clientId, act: "roll" });
    });
  }

  if (passBtn) {
    passBtn.addEventListener("click", () => {
      if (localMode) {
        if (game.phase !== "await_roll") return;
        game.turn = nextTurn(game.turn, seats);
        game.dice = 0;
        game.last = "跳过";
        game.sixStreak = 0;
        render();
        return;
      }
      const mine = myColor();
      if (!mine || mine !== game.turn) return;
      if (isHost) applyHostPass(clientId);
      else transport?.send({ type: "action", gameId: GAME_ID, room, clientId, act: "pass" });
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (localMode) {
        game = newGame();
        render();
        return;
      }
      if (!isHost) return;
      applyHostReset();
    });
  }

  function pickHoverPieceByEvent(ev) {
    const rect = canvas.getBoundingClientRect();
    const ratio = boardSize.ratio || window.devicePixelRatio || 1;
    const x = (ev.clientX - rect.left) * ratio;
    const y = (ev.clientY - rect.top) * ratio;
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (const a of pieceHitAreas) {
      const dx = x - a.x;
      const dy = y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= a.r * a.r && d2 < bestD) {
        bestD = d2;
        best = a.piece;
      }
    }
    return best;
  }

  canvas.addEventListener("mousemove", (ev) => {
    const p = pickHoverPieceByEvent(ev);
    const changed = p !== hoverPiece;
    hoverPiece = p;
    canvas.style.cursor = p >= 0 ? "pointer" : "default";
    if (changed) render();
  });

  canvas.addEventListener("mouseleave", () => {
    if (hoverPiece !== -1) {
      hoverPiece = -1;
      canvas.style.cursor = "default";
      render();
      return;
    }
    canvas.style.cursor = "default";
  });

  canvas.addEventListener("click", (ev) => {
    const piece = pickHoverPieceByEvent(ev);
    if (piece < 0) return;
    const mine = myColor();
    if (!mine || mine !== game.turn || game.winner) return;
    selectedPiece = piece;
    if (game.phase === "await_move") {
      if (localMode) {
        if (isHost) applyHostMove(clientId, piece);
      } else if (isHost) {
        applyHostMove(clientId, piece);
      } else {
        transport?.send({ type: "action", gameId: GAME_ID, room, clientId, act: "move", piece });
      }
      return;
    }
    if (game.phase === "penalty") {
      if (localMode) {
        if (isHost) applyHostPenalty(clientId, piece);
      } else if (isHost) {
        applyHostPenalty(clientId, piece);
      } else {
        transport?.send({ type: "action", gameId: GAME_ID, room, clientId, act: "penalty", piece });
      }
    }
  });

  window.addEventListener("resize", () => render());

  function cleanup() {
    if (ping) window.clearInterval(ping);
    ping = 0;
    if (aiLoop) window.clearInterval(aiLoop);
    aiLoop = 0;
    if (diceAnim) window.clearInterval(diceAnim);
    diceAnim = 0;
    if (transport) transport.close();
    transport = null;
  }
  window.addEventListener("beforeunload", cleanup);

  if (!room) {
    localMode = true;
    members = new Map();
    members.set(clientId, { id: clientId, name: playerName });
    hostId = clientId;
    isHost = true;
    localAssignSeats();
    render();
    return;
  }

  localMode = false;
  transport = createRoomTransport(`${GAME_ID}_${room}`, onMessage);
  members = new Map();
  members.set(clientId, { id: clientId, name: playerName });
  ensureAiMembers();
  seats = pickSeats(participantIds());
  game = newGame();

  const joinMsg = { type: "join", gameId: GAME_ID, room, clientId, name: playerName };
  transport.send(joinMsg);
  ping = window.setInterval(() => {
    if (!transport) return;
    transport.send(joinMsg);
    if (isHost) broadcastState();
  }, 1200);

  aiLoop = window.setInterval(() => {
    maybeRunAi();
  }, 250);

  if (isHost) broadcastState();
  render();
}

main();
