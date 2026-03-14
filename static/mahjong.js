import { getPlayerName, getQueryParam, setPageTitle } from "./lib.js";

function sleep(ms) {
  return new Promise((r) => window.setTimeout(r, ms));
}

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg || "";
}

function setStatus(msg) {
  const el = document.getElementById("statusText");
  if (!el) return;
  el.textContent = msg || "";
}

const SUITS = [
  { key: "m", name: "万", start: 0 },
  { key: "p", name: "筒", start: 9 },
  { key: "s", name: "条", start: 18 },
];

const HONORS = [
  { id: 27, label: "东" },
  { id: 28, label: "南" },
  { id: 29, label: "西" },
  { id: 30, label: "北" },
  { id: 31, label: "中" },
  { id: 32, label: "发" },
  { id: 33, label: "白" },
];

function tileLabel(id) {
  for (const h of HONORS) if (h.id === id) return h.label;
  for (const s of SUITS) {
    if (id >= s.start && id < s.start + 9) return `${id - s.start + 1}${s.name}`;
  }
  return String(id);
}

function buildWall() {
  const wall = [];
  for (let id = 0; id < 34; id += 1) {
    const copies = id < 34 ? 4 : 0;
    for (let k = 0; k < copies; k += 1) wall.push(id);
  }
  for (let i = wall.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  return wall;
}

function countsFromHand(hand) {
  const c = new Array(34).fill(0);
  for (const t of hand) c[t] += 1;
  return c;
}

function isSuitTile(id) {
  return id >= 0 && id <= 26;
}

function suitIndex(id) {
  if (id >= 0 && id <= 8) return 0;
  if (id >= 9 && id <= 17) return 1;
  if (id >= 18 && id <= 26) return 2;
  return -1;
}

function rankInSuit(id) {
  if (id >= 0 && id <= 8) return id + 1;
  if (id >= 9 && id <= 17) return id - 9 + 1;
  if (id >= 18 && id <= 26) return id - 18 + 1;
  return -1;
}

function encodeCounts(counts) {
  return counts.join(",");
}

function canFormMelds(counts, memo) {
  const key = encodeCounts(counts);
  if (memo.has(key)) return memo.get(key);
  let i = 0;
  while (i < 34 && counts[i] === 0) i += 1;
  if (i >= 34) {
    memo.set(key, true);
    return true;
  }

  if (counts[i] >= 3) {
    counts[i] -= 3;
    if (canFormMelds(counts, memo)) {
      counts[i] += 3;
      memo.set(key, true);
      return true;
    }
    counts[i] += 3;
  }

  if (isSuitTile(i)) {
    const si = suitIndex(i);
    const r = rankInSuit(i);
    if (si >= 0 && r >= 1 && r <= 7) {
      const i1 = i + 1;
      const i2 = i + 2;
      if (suitIndex(i1) === si && suitIndex(i2) === si && counts[i1] > 0 && counts[i2] > 0) {
        counts[i] -= 1;
        counts[i1] -= 1;
        counts[i2] -= 1;
        if (canFormMelds(counts, memo)) {
          counts[i] += 1;
          counts[i1] += 1;
          counts[i2] += 1;
          memo.set(key, true);
          return true;
        }
        counts[i] += 1;
        counts[i1] += 1;
        counts[i2] += 1;
      }
    }
  }

  memo.set(key, false);
  return false;
}

function isWinningHand(hand) {
  if (hand.length % 3 !== 2) return false;
  const counts = countsFromHand(hand);
  for (let i = 0; i < 34; i += 1) {
    if (counts[i] < 2) continue;
    counts[i] -= 2;
    const memo = new Map();
    const ok = canFormMelds(counts, memo);
    counts[i] += 2;
    if (ok) return true;
  }
  return false;
}

function isWinningWithMeldCount(hand, meldCount) {
  const meldNeed = 4 - meldCount;
  const needTiles = 2 + meldNeed * 3;
  if (hand.length !== needTiles) return false;
  const counts = countsFromHand(hand);
  for (let i = 0; i < 34; i += 1) {
    if (counts[i] < 2) continue;
    counts[i] -= 2;
    const memo = new Map();
    const ok = canFormMelds(counts, memo);
    counts[i] += 2;
    if (ok) return true;
  }
  return false;
}

function solveMelds(counts, out, memo) {
  const key = encodeCounts(counts);
  if (memo.has(key)) return false;
  let i = 0;
  while (i < 34 && counts[i] === 0) i += 1;
  if (i >= 34) return true;

  if (counts[i] >= 3) {
    counts[i] -= 3;
    out.push({ kind: "triplet", tiles: [i, i, i] });
    if (solveMelds(counts, out, memo)) return true;
    out.pop();
    counts[i] += 3;
  }

  if (isSuitTile(i)) {
    const si = suitIndex(i);
    const r = rankInSuit(i);
    if (si >= 0 && r >= 1 && r <= 7) {
      const i1 = i + 1;
      const i2 = i + 2;
      if (suitIndex(i1) === si && suitIndex(i2) === si && counts[i1] > 0 && counts[i2] > 0) {
        counts[i] -= 1;
        counts[i1] -= 1;
        counts[i2] -= 1;
        out.push({ kind: "sequence", tiles: [i, i1, i2] });
        if (solveMelds(counts, out, memo)) return true;
        out.pop();
        counts[i] += 1;
        counts[i1] += 1;
        counts[i2] += 1;
      }
    }
  }

  memo.add(key);
  return false;
}

function findOneDecomposition(hand, meldCount) {
  const meldNeed = 4 - meldCount;
  const needTiles = 2 + meldNeed * 3;
  if (hand.length !== needTiles) return null;
  const counts = countsFromHand(hand);
  for (let i = 0; i < 34; i += 1) {
    if (counts[i] < 2) continue;
    counts[i] -= 2;
    const out = [];
    const memo = new Set();
    const ok = solveMelds(counts, out, memo);
    counts[i] += 2;
    if (ok && out.length === meldNeed) return { pair: i, melds: out };
  }
  return null;
}

function isMenzen(p) {
  return p.melds.every((m) => !m.open);
}

function isTerminalOrHonor(id) {
  if (!isSuitTile(id)) return true;
  const r = rankInSuit(id);
  return r === 1 || r === 9;
}

function allSimples(tiles) {
  for (const t of tiles) if (isTerminalOrHonor(t)) return false;
  return true;
}

function handAllTiles(p, extraTile = null) {
  const tiles = p.hand.slice();
  if (extraTile !== null && extraTile !== undefined) tiles.push(extraTile);
  for (const m of p.melds) tiles.push(...m.tiles);
  return tiles;
}

function seatWindId(seatIndex) {
  if (seatIndex === 0) return 27;
  if (seatIndex === 1) return 28;
  if (seatIndex === 2) return 29;
  return 30;
}

function isYakuhaiTile(id, seatIndex) {
  const seat = seatWindId(seatIndex);
  const round = 27;
  if (id === 31 || id === 32 || id === 33) return true;
  if (id === seat) return true;
  if (id === round) return true;
  return false;
}

function countYakuhaiTriplets(allMelds, seatIndex) {
  let c = 0;
  for (const m of allMelds) {
    if (m.kind !== "triplet" && m.kind !== "kan") continue;
    const id = m.tiles[0];
    if (isYakuhaiTile(id, seatIndex)) c += 1;
  }
  return c;
}

function evaluateYaku({ player, seatIndex, winType, meldCount }) {
  const tiles = handAllTiles(player);
  const decomp = findOneDecomposition(player.hand, meldCount);
  const meldsFromHand = decomp ? decomp.melds : [];
  const meldsAll = [
    ...player.melds.map((m) => ({ kind: m.type === "chi" ? "sequence" : m.type === "pon" ? "triplet" : "kan", tiles: m.tiles })),
    ...meldsFromHand,
  ];

  const yaku = [];
  let han = 0;

  if (player.riichi) {
    yaku.push("立直");
    han += 1;
  }

  if (winType === "tsumo" && isMenzen(player)) {
    yaku.push("门前清自摸和");
    han += 1;
  }

  if (allSimples(tiles)) {
    yaku.push("断幺九");
    han += 1;
  }

  const yh = countYakuhaiTriplets(meldsAll, seatIndex);
  for (let i = 0; i < yh; i += 1) {
    yaku.push("役牌");
    han += 1;
  }

  if (meldsAll.length === 4 && meldsAll.every((m) => m.kind === "triplet" || m.kind === "kan")) {
    yaku.push("对对和");
    han += 2;
  }

  return { han, yaku };
}

function winningWithYaku(player, seatIndex, handWithTile, winType) {
  const meldCount = player.melds.length;
  if (!isWinningWithMeldCount(handWithTile, meldCount)) return false;
  const temp = { ...player, hand: handWithTile };
  const res = evaluateYaku({ player: temp, seatIndex, winType, meldCount });
  return res.han > 0;
}

function chiOptions(hand, tile) {
  if (!isSuitTile(tile)) return [];
  const si = suitIndex(tile);
  const r = rankInSuit(tile);
  const counts = countsFromHand(hand);
  const opts = [];
  const makeId = (rank) => (si === 0 ? rank - 1 : si === 1 ? 9 + (rank - 1) : 18 + (rank - 1));
  const pushIf = (a, b) => {
    const ia = makeId(a);
    const ib = makeId(b);
    if (counts[ia] > 0 && counts[ib] > 0) opts.push([ia, ib, tile].slice().sort((x, y) => x - y));
  };
  if (r >= 3) pushIf(r - 2, r - 1);
  if (r >= 2 && r <= 8) pushIf(r - 1, r + 1);
  if (r <= 7) pushIf(r + 1, r + 2);
  const uniq = new Map();
  for (const o of opts) uniq.set(o.join("-"), o);
  return Array.from(uniq.values());
}

function sortHand(hand) {
  return hand.slice().sort((a, b) => a - b);
}

function tileScoreForDiscard(handCounts, id) {
  const c = handCounts[id] || 0;
  let score = 0;
  score += c * 3;
  if (isSuitTile(id)) {
    const si = suitIndex(id);
    const r = rankInSuit(id);
    if (r > 1 && suitIndex(id - 1) === si) score += (handCounts[id - 1] || 0) * 1.2;
    if (r < 9 && suitIndex(id + 1) === si) score += (handCounts[id + 1] || 0) * 1.2;
    if (r > 2 && suitIndex(id - 2) === si) score += (handCounts[id - 2] || 0) * 0.6;
    if (r < 8 && suitIndex(id + 2) === si) score += (handCounts[id + 2] || 0) * 0.6;
  }
  return score;
}

function pickAiDiscard(hand) {
  const counts = countsFromHand(hand);
  let bestId = hand[0];
  let bestScore = Infinity;
  const uniq = Array.from(new Set(hand));
  for (const id of uniq) {
    const s = tileScoreForDiscard(counts, id);
    if (s < bestScore) {
      bestScore = s;
      bestId = id;
    }
  }
  return bestId;
}

function initMeta() {
  const room = getQueryParam("room");
  const nameChip = document.getElementById("nameChip");
  const roomChip = document.getElementById("roomChip");
  if (nameChip) nameChip.textContent = `名字：${getPlayerName()}`;
  if (roomChip) roomChip.textContent = room ? `房间：${room}` : "本地模式";
  const backLink = document.getElementById("backLink");
  if (backLink) {
    const url = new URL("./room.html", window.location.href);
    const game = getQueryParam("game");
    const name = getQueryParam("name");
    if (game) url.searchParams.set("game", game);
    if (name) url.searchParams.set("name", name);
    if (room) url.searchParams.set("room", room);
    backLink.href = url.toString();
  }
}

function renderSeat({ titleId, metaId, riverId }, p) {
  const title = document.getElementById(titleId);
  const meta = document.getElementById(metaId);
  const river = document.getElementById(riverId);
  if (title) title.textContent = p.name;
  if (meta) {
    const r = p.riichi ? "｜立直" : "";
    meta.textContent = `手牌：${p.hand.length} 张｜副露：${p.melds.length} 组｜弃牌：${p.river.length} 张${r}`;
  }
  if (river) {
    const tail = p.river.slice(-12).map(tileLabel);
    river.textContent = tail.join(" ");
  }
}

function renderCenter(wallCount, lastDiscard, hint) {
  const wallText = document.getElementById("wallText");
  const lastText = document.getElementById("lastText");
  const hintText = document.getElementById("hintText");
  if (wallText) wallText.textContent = `牌山剩余：${wallCount} 张`;
  if (lastText) lastText.textContent = lastDiscard ? `最新打出：${tileLabel(lastDiscard)}` : "";
  if (hintText) hintText.textContent = hint || "";
}

function renderHand(hand, selectedIndex, disabledIndexes = null) {
  const root = document.getElementById("myHand");
  if (!root) return;
  const sorted = sortHand(hand);
  root.replaceChildren(
    ...sorted.map((id, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mjTile";
      btn.dataset.idx = String(idx);
      btn.textContent = tileLabel(id);
      if (selectedIndex !== null && idx === selectedIndex) btn.classList.add("selected");
      if (disabledIndexes && disabledIndexes.has(idx)) btn.disabled = true;
      return btn;
    }),
  );
}

function setBtnState({ canDiscard, canHu, canRiichi }) {
  const discardBtn = document.getElementById("discardBtn");
  const huBtn = document.getElementById("huBtn");
  const riichiBtn = document.getElementById("riichiBtn");
  if (discardBtn) discardBtn.disabled = !canDiscard;
  if (huBtn) {
    huBtn.classList.toggle("hidden", !canHu);
    huBtn.disabled = !canHu;
  }
  if (riichiBtn) riichiBtn.disabled = !canRiichi;
}

async function run() {
  setPageTitle("麻将");
  initMeta();

  const discardBtn = document.getElementById("discardBtn");
  const riichiBtn = document.getElementById("riichiBtn");
  const huBtn = document.getElementById("huBtn");
  const resetBtn = document.getElementById("resetBtn");
  const myHandEl = document.getElementById("myHand");

  const reactBar = document.getElementById("reactBar");
  const reactHuBtn = document.getElementById("reactHuBtn");
  const reactKanBtn = document.getElementById("reactKanBtn");
  const reactPonBtn = document.getElementById("reactPonBtn");
  const reactChiBtn = document.getElementById("reactChiBtn");
  const reactPassBtn = document.getElementById("reactPassBtn");

  const chiDialog = document.getElementById("chiDialog");
  const chiHint = document.getElementById("chiHint");
  const chiOptionsEl = document.getElementById("chiOptions");
  const chiCancelBtn = document.getElementById("chiCancelBtn");

  const players = [
    { name: getPlayerName(), hand: [], river: [], melds: [], riichi: false, riichiLocked: false, lastDrawn: null, isHuman: true },
    { name: "AI-1", hand: [], river: [], melds: [], riichi: false, riichiLocked: false, lastDrawn: null, isHuman: false },
    { name: "AI-2", hand: [], river: [], melds: [], riichi: false, riichiLocked: false, lastDrawn: null, isHuman: false },
    { name: "AI-3", hand: [], river: [], melds: [], riichi: false, riichiLocked: false, lastDrawn: null, isHuman: false },
  ];

  const seatMap = [
    null,
    { titleId: "p1Title", metaId: "p1Meta", riverId: "p1River" },
    { titleId: "p2Title", metaId: "p2Meta", riverId: "p2River" },
    { titleId: "p3Title", metaId: "p3Meta", riverId: "p3River" },
  ];

  let wall = [];
  let dealer = 0;
  let current = 0;
  let lastDiscard = null;
  let phase = "idle";
  let ended = false;

  let selectedIndex = null;
  let pendingDiscard = null;
  let reactResolve = null;
  let riichiDeclaring = false;
  let riichiAllowed = null;

  function hideReact() {
    if (reactBar) reactBar.classList.add("hidden");
  }

  function showReact({ canHu, canKan, canPon, canChi }) {
    if (!reactBar || !reactHuBtn || !reactKanBtn || !reactPonBtn || !reactChiBtn || !reactPassBtn) return Promise.resolve({ type: "pass" });
    reactBar.classList.remove("hidden");
    reactHuBtn.classList.toggle("hidden", !canHu);
    reactKanBtn.classList.toggle("hidden", !canKan);
    reactPonBtn.classList.toggle("hidden", !canPon);
    reactChiBtn.classList.toggle("hidden", !canChi);
    return new Promise((resolve) => {
      reactResolve = resolve;
    });
  }

  function resolveReact(action) {
    if (!reactResolve) return;
    const r = reactResolve;
    reactResolve = null;
    hideReact();
    r(action);
  }

  if (reactHuBtn) reactHuBtn.addEventListener("click", () => resolveReact({ type: "hu" }));
  if (reactKanBtn) reactKanBtn.addEventListener("click", () => resolveReact({ type: "kan" }));
  if (reactPonBtn) reactPonBtn.addEventListener("click", () => resolveReact({ type: "pon" }));
  if (reactChiBtn) reactChiBtn.addEventListener("click", () => resolveReact({ type: "chi" }));
  if (reactPassBtn) reactPassBtn.addEventListener("click", () => resolveReact({ type: "pass" }));

  function closeChiDialog() {
    if (chiDialog instanceof HTMLDialogElement) chiDialog.close();
  }

  if (chiCancelBtn) chiCancelBtn.addEventListener("click", () => closeChiDialog());

  function chooseChiOption(options, tile) {
    if (!(chiDialog instanceof HTMLDialogElement) || !chiOptionsEl || !chiHint) return Promise.resolve(null);
    return new Promise((resolve) => {
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        resolve(val);
      };
      const onClose = () => finish(null);
      chiDialog.addEventListener("close", onClose, { once: true });
      chiHint.textContent = `吃 ${tileLabel(tile)}：请选择组合`;
      chiOptionsEl.replaceChildren(
        ...options.map((o) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn";
          btn.textContent = o.map(tileLabel).join(" ");
          btn.addEventListener("click", () => {
            finish(o);
            closeChiDialog();
          });
          return btn;
        }),
      );
      chiDialog.showModal();
    });
  }

  function removeOneFromHand(p, id) {
    const idx = p.hand.indexOf(id);
    if (idx >= 0) p.hand.splice(idx, 1);
  }

  function removeNTiles(p, id, n) {
    for (let i = 0; i < n; i += 1) removeOneFromHand(p, id);
  }

  function discardBySortedIndex(p, idx) {
    const sorted = sortHand(p.hand);
    const tile = sorted[idx];
    removeOneFromHand(p, tile);
    return tile;
  }

  async function drawTile(pIndex) {
    if (wall.length <= 0) {
      ended = true;
      phase = "end";
      setStatus("流局（牌山用尽）");
      toast("点击“重新开始”再来一局");
      syncUI();
      return null;
    }
    const tile = wall.pop();
    players[pIndex].hand.push(tile);
    players[pIndex].hand = sortHand(players[pIndex].hand);
    players[pIndex].lastDrawn = tile;
    return tile;
  }

  function endWin({ winner, winType, from, tile }) {
    ended = true;
    phase = "end";
    const meldCount = players[winner].melds.length;
    const res = evaluateYaku({ player: players[winner], seatIndex: winner, winType, meldCount });
    const yakuText = res.yaku.length ? `｜${res.han}番：${res.yaku.join("、")}` : "";
    const base =
      winType === "tsumo"
        ? `${players[winner].name} 自摸胡（${tileLabel(tile)}）`
        : `${players[winner].name} 放炮胡（接 ${tileLabel(tile)}，来自 ${players[from].name}）`;
    setStatus(`${base}${yakuText}`);
    toast("点击“重新开始”再来一局");
    hideReact();
    syncUI();
  }

  function computeRiichiAllowed(p, seatIndex) {
    const sorted = sortHand(p.hand);
    const allowed = new Set();
    for (let i = 0; i < sorted.length; i += 1) {
      const tempHand = sorted.slice();
      tempHand.splice(i, 1);
      for (let t = 0; t < 34; t += 1) {
        const test = tempHand.concat([t]);
        const tempPlayer = { ...p, hand: test, riichi: true };
        if (winningWithYaku(tempPlayer, seatIndex, test, "ron")) {
          allowed.add(i);
          break;
        }
      }
    }
    if (allowed.size === 0) return null;
    return allowed;
  }

  function syncUI(hint = "") {
    for (let i = 1; i <= 3; i += 1) renderSeat(seatMap[i], players[i]);
    renderCenter(wall.length, lastDiscard, hint);
    const disabled = riichiDeclaring && riichiAllowed ? new Set(Array.from({ length: players[0].hand.length }, (_, i) => i).filter((i) => !riichiAllowed.has(i))) : null;
    renderHand(players[0].hand, selectedIndex, disabled);
    const canDiscard = phase === "discard" && current === 0 && !ended;
    const canHu = phase === "discard" && current === 0 && !ended && winningWithYaku(players[0], 0, players[0].hand, "tsumo");
    const canRiichi =
      phase === "discard" && current === 0 && !ended && !players[0].riichi && isMenzen(players[0]) && !!computeRiichiAllowed(players[0], 0);
    setBtnState({ canDiscard, canHu, canRiichi });
  }

  function resetRound() {
    wall = buildWall();
    for (const p of players) {
      p.hand = [];
      p.river = [];
      p.melds = [];
      p.riichi = false;
      p.riichiLocked = false;
      p.lastDrawn = null;
    }
    dealer = 0;
    current = dealer;
    lastDiscard = null;
    pendingDiscard = null;
    selectedIndex = null;
    ended = false;
    phase = "discard";
    riichiDeclaring = false;
    riichiAllowed = null;

    for (let r = 0; r < 13; r += 1) {
      for (let i = 0; i < 4; i += 1) players[i].hand.push(wall.pop());
    }
    players[dealer].hand.push(wall.pop());
    for (let i = 0; i < 4; i += 1) players[i].hand = sortHand(players[i].hand);
  }

  function canRon(idx, tile) {
    const p = players[idx];
    const test = p.hand.concat([tile]);
    return winningWithYaku({ ...p, hand: test }, idx, test, "ron");
  }

  function canPon(idx, tile) {
    const p = players[idx];
    if (p.riichiLocked) return false;
    const counts = countsFromHand(p.hand);
    return counts[tile] >= 2;
  }

  function canKan(idx, tile) {
    const p = players[idx];
    if (p.riichiLocked) return false;
    const counts = countsFromHand(p.hand);
    return counts[tile] >= 3;
  }

  function canChi(idx, tile, from) {
    const p = players[idx];
    if (p.riichiLocked) return [];
    if (idx !== (from + 1) % 4) return [];
    return chiOptions(p.hand, tile);
  }

  async function applyMeldCall({ caller, from, tile, type, chiTiles = null }) {
    const p = players[caller];
    const river = players[from]?.river;
    if (Array.isArray(river) && river.length && river[river.length - 1] === tile) river.pop();
    if (type === "pon") {
      removeNTiles(p, tile, 2);
      p.melds.push({ type: "pon", tiles: [tile, tile, tile], open: true, from });
      return;
    }
    if (type === "kan") {
      removeNTiles(p, tile, 3);
      p.melds.push({ type: "kan", tiles: [tile, tile, tile, tile], open: true, from });
      await drawTile(caller);
      return;
    }
    if (type === "chi" && chiTiles) {
      const other = chiTiles.filter((t) => t !== tile);
      for (const t of other) removeOneFromHand(p, t);
      p.melds.push({ type: "chi", tiles: chiTiles.slice(), open: true, from });
    }
  }

  async function resolveAfterDiscard(from, tile) {
    pendingDiscard = { from, tile };
    phase = "react";
    syncUI("等待响应…");

    const ron = [];
    for (let k = 1; k <= 3; k += 1) {
      const idx = (from + k) % 4;
      if (canRon(idx, tile)) ron.push(idx);
    }
    if (ron.length) {
      if (ron.includes(0)) {
        const action = await showReact({ canHu: true, canKan: false, canPon: false, canChi: false });
        if (action.type === "hu") {
          players[0].hand.push(tile);
          players[0].hand = sortHand(players[0].hand);
          endWin({ winner: 0, winType: "ron", from, tile });
          return true;
        }
      }
      const aiWinner = ron.find((i) => i !== 0);
      if (aiWinner !== undefined) {
        players[aiWinner].hand.push(tile);
        players[aiWinner].hand = sortHand(players[aiWinner].hand);
        endWin({ winner: aiWinner, winType: "ron", from, tile });
        return true;
      }
    }

    const candidates = [];
    for (let k = 1; k <= 3; k += 1) {
      const idx = (from + k) % 4;
      if (canKan(idx, tile)) candidates.push({ idx, type: "kan" });
    }
    for (let k = 1; k <= 3; k += 1) {
      const idx = (from + k) % 4;
      if (canPon(idx, tile)) candidates.push({ idx, type: "pon" });
    }
    const chiIdx = (from + 1) % 4;
    const chiOpts = canChi(chiIdx, tile, from);
    if (chiOpts.length) candidates.push({ idx: chiIdx, type: "chi", chiOpts });

    const humanKan = canKan(0, tile);
    const humanPon = canPon(0, tile);
    const humanChiOpts = canChi(0, tile, from);
    if (from !== 0 && (humanKan || humanPon || humanChiOpts.length)) {
      const action = await showReact({ canHu: false, canKan: humanKan, canPon: humanPon, canChi: humanChiOpts.length > 0 });
      if (action.type === "pass") {
      } else if (action.type === "kan") {
        await applyMeldCall({ caller: 0, from, tile, type: "kan" });
        current = 0;
        phase = "discard";
        selectedIndex = null;
        if (winningWithYaku(players[0], 0, players[0].hand, "tsumo")) {
          endWin({ winner: 0, winType: "tsumo", from: 0, tile: players[0].lastDrawn ?? players[0].hand[players[0].hand.length - 1] });
          return true;
        }
        syncUI("已杠，继续出牌。");
        return false;
      } else if (action.type === "pon") {
        await applyMeldCall({ caller: 0, from, tile, type: "pon" });
        current = 0;
        phase = "discard";
        selectedIndex = null;
        syncUI("已碰，继续出牌。");
        return false;
      } else if (action.type === "chi") {
        const pick = await chooseChiOption(humanChiOpts, tile);
        if (!pick) {
          syncUI("已放弃吃。");
        } else {
          await applyMeldCall({ caller: 0, from, tile, type: "chi", chiTiles: pick });
          current = 0;
          phase = "discard";
          selectedIndex = null;
          syncUI("已吃，继续出牌。");
          return false;
        }
      }
    } else {
      for (const c of candidates) {
        const p = players[c.idx];
        if (p.isHuman) continue;
        if (c.type === "kan" && Math.random() < 0.25) {
          await applyMeldCall({ caller: c.idx, from, tile, type: "kan" });
          current = c.idx;
          phase = "discard";
          if (winningWithYaku(players[c.idx], c.idx, players[c.idx].hand, "tsumo")) {
            endWin({
              winner: c.idx,
              winType: "tsumo",
              from: c.idx,
              tile: players[c.idx].lastDrawn ?? players[c.idx].hand[players[c.idx].hand.length - 1],
            });
            return true;
          }
          await aiTakeTurn(c.idx);
          return true;
        }
        if (c.type === "pon" && Math.random() < 0.2) {
          await applyMeldCall({ caller: c.idx, from, tile, type: "pon" });
          current = c.idx;
          phase = "discard";
          await aiTakeTurn(c.idx);
          return true;
        }
        if (c.type === "chi" && Math.random() < 0.18) {
          const pick = c.chiOpts[Math.floor(Math.random() * c.chiOpts.length)];
          await applyMeldCall({ caller: c.idx, from, tile, type: "chi", chiTiles: pick });
          current = c.idx;
          phase = "discard";
          await aiTakeTurn(c.idx);
          return true;
        }
      }
    }

    current = (from + 1) % 4;
    phase = "draw";
    pendingDiscard = null;
    await loop();
    return false;
  }

  async function aiTakeTurn(idx) {
    if (ended) return;
    const p = players[idx];
    setStatus(`轮到 ${p.name}…`);
    if (phase === "draw") {
      await sleep(450);
      await drawTile(idx);
      if (ended) return;
      if (winningWithYaku(p, idx, p.hand, "tsumo")) {
        endWin({ winner: idx, winType: "tsumo", from: idx, tile: p.lastDrawn ?? p.hand[p.hand.length - 1] });
        return;
      }
    }
    phase = "discard";
    syncUI();
    await sleep(450);

    if (!p.riichi && isMenzen(p) && Math.random() < 0.18) {
      const allowed = computeRiichiAllowed({ ...p, hand: p.hand.slice() }, idx);
      if (allowed && allowed.size) {
        p.riichi = true;
        p.riichiLocked = true;
        const pickIdx = Array.from(allowed)[Math.floor(Math.random() * allowed.size)];
        const tile = discardBySortedIndex(p, pickIdx);
        p.lastDrawn = null;
        p.river.push(tile);
        lastDiscard = tile;
        pendingDiscard = { from: idx, tile };
        syncUI();
        await resolveAfterDiscard(idx, tile);
        return;
      }
    }

    const tile = p.riichiLocked && p.lastDrawn !== null ? p.lastDrawn : pickAiDiscard(p.hand);
    removeOneFromHand(p, tile);
    p.lastDrawn = null;
    p.river.push(tile);
    lastDiscard = tile;
    pendingDiscard = { from: idx, tile };
    syncUI();
    await resolveAfterDiscard(idx, tile);
  }

  async function loop() {
    if (ended) return;
    if (current === 0) {
      setStatus("轮到你");
      if (phase === "draw") {
        await sleep(350);
        await drawTile(0);
        if (ended) return;
        phase = "discard";
      }
      syncUI("点击一张牌选择，然后点“打出”。");
      return;
    }
    await aiTakeTurn(current);
  }

  function startGame() {
    resetRound();
    setStatus("发牌完成");
    syncUI("庄家先出。");
    void loop();
  }

  if (myHandEl) {
    myHandEl.addEventListener("click", (e) => {
      if (ended) return;
      if (phase !== "discard" || current !== 0) return;
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const idx = Number(t.dataset.idx || "-1");
      if (!Number.isFinite(idx) || idx < 0) return;
      if (riichiDeclaring && riichiAllowed && !riichiAllowed.has(idx)) return;
      if (players[0].riichiLocked && !riichiDeclaring && players[0].lastDrawn !== null) {
        const tile = sortHand(players[0].hand)[idx];
        if (tile !== players[0].lastDrawn) return;
      }
      selectedIndex = idx;
      syncUI();
    });
  }

  if (riichiBtn) {
    riichiBtn.addEventListener("click", () => {
      if (ended) return;
      if (phase !== "discard" || current !== 0) return;
      if (players[0].riichi) return;
      if (!isMenzen(players[0])) {
        toast("副露后不能立直");
        return;
      }
      const allowed = computeRiichiAllowed(players[0], 0);
      if (!allowed) {
        toast("当前不能立直（未听牌）");
        return;
      }
      riichiDeclaring = true;
      riichiAllowed = allowed;
      selectedIndex = null;
      toast("立直：请选择要打出的牌");
      syncUI();
    });
  }

  if (discardBtn) {
    discardBtn.addEventListener("click", async () => {
      if (ended) return;
      if (phase !== "discard" || current !== 0) return;
      if (selectedIndex === null) {
        toast("先点击一张牌");
        return;
      }
      if (riichiDeclaring && riichiAllowed && !riichiAllowed.has(selectedIndex)) {
        toast("这张牌不能用于立直");
        return;
      }
      const p = players[0];
      if (p.riichiLocked && !riichiDeclaring && p.lastDrawn !== null) {
        const tile = sortHand(p.hand)[selectedIndex];
        if (tile !== p.lastDrawn) {
          toast("立直后只能打出摸到的牌");
          return;
        }
      }
      const tile = discardBySortedIndex(p, selectedIndex);
      p.river.push(tile);
      lastDiscard = tile;
      p.lastDrawn = null;
      selectedIndex = null;
      if (riichiDeclaring) {
        p.riichi = true;
        p.riichiLocked = true;
        riichiDeclaring = false;
        riichiAllowed = null;
        toast("立直！");
      }
      await resolveAfterDiscard(0, tile);
    });
  }

  if (huBtn) {
    huBtn.addEventListener("click", () => {
      if (ended) return;
      if (phase !== "discard" || current !== 0) return;
      if (!winningWithYaku(players[0], 0, players[0].hand, "tsumo")) {
        toast("当前不能胡（无役或未成和）");
        return;
      }
      const winTile = players[0].lastDrawn ?? players[0].hand[players[0].hand.length - 1];
      endWin({ winner: 0, winType: "tsumo", from: 0, tile: winTile });
    });
  }

  if (resetBtn) resetBtn.addEventListener("click", () => startGame());

  setStatus("点击“重新开始”开始一局麻将");
  syncUI();
}

run();
