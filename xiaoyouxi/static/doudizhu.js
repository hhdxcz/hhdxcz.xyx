import { getQueryParam, setPageTitle } from "./lib.js";

const SUITS = ["♠", "♥", "♣", "♦"];
const RANK_LABEL = new Map([
  [3, "3"],
  [4, "4"],
  [5, "5"],
  [6, "6"],
  [7, "7"],
  [8, "8"],
  [9, "9"],
  [10, "10"],
  [11, "J"],
  [12, "Q"],
  [13, "K"],
  [14, "A"],
  [15, "2"],
  [16, "小王"],
  [17, "大王"],
]);

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

function cardLabel(card) {
  if (card.rank >= 16) return RANK_LABEL.get(card.rank) || String(card.rank);
  return `${card.suit}${RANK_LABEL.get(card.rank) || String(card.rank)}`;
}

function buildDeck() {
  const deck = [];
  let id = 1;
  for (let rank = 3; rank <= 15; rank += 1) {
    for (const suit of SUITS) {
      deck.push({ id: String(id++), rank, suit });
    }
  }
  deck.push({ id: String(id++), rank: 16, suit: "" });
  deck.push({ id: String(id++), rank: 17, suit: "" });
  return deck;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortHand(hand) {
  const suitOrder = new Map(SUITS.map((s, i) => [s, i]));
  return hand.slice().sort((x, y) => {
    if (x.rank !== y.rank) return x.rank - y.rank;
    return (suitOrder.get(x.suit) ?? 9) - (suitOrder.get(y.suit) ?? 9);
  });
}

function groupByRank(cards) {
  const m = new Map();
  for (const c of cards) {
    const list = m.get(c.rank) || [];
    list.push(c);
    m.set(c.rank, list);
  }
  return m;
}

function ranksSorted(map) {
  return Array.from(map.keys()).sort((a, b) => a - b);
}

function isConsecutive(ranks) {
  for (let i = 1; i < ranks.length; i += 1) {
    if (ranks[i] !== ranks[i - 1] + 1) return false;
  }
  return true;
}

function playText(play) {
  if (!play) return "";
  return play.cards.map(cardLabel).join(" ");
}

function selectCardsByRank(handByRank, rank, count) {
  const cards = handByRank.get(rank) || [];
  return cards.slice(0, count);
}

function pickSmallestSinglesExcluding(handByRank, excludeRanks, count) {
  const out = [];
  for (const r of ranksSorted(handByRank)) {
    if (excludeRanks.has(r)) continue;
    const cards = handByRank.get(r) || [];
    for (const c of cards) {
      out.push(c);
      if (out.length === count) return out;
    }
  }
  return [];
}

function pickSmallestPairsExcluding(handByRank, excludeRanks, countPairs) {
  const out = [];
  for (const r of ranksSorted(handByRank)) {
    if (excludeRanks.has(r)) continue;
    const cards = handByRank.get(r) || [];
    if (cards.length >= 2) {
      out.push(cards[0], cards[1]);
      if (out.length === countPairs * 2) return out;
    }
  }
  return [];
}

function detectPlay(cards) {
  const byRank = groupByRank(cards);
  const ranks = ranksSorted(byRank);
  const counts = ranks.map((r) => byRank.get(r)?.length || 0);
  const n = cards.length;

  const isJokerBomb = n === 2 && ranks.length === 2 && ranks[0] === 16 && ranks[1] === 17;
  if (isJokerBomb) {
    return { type: "joker_bomb", mainRank: 17, length: 2, cards: sortHand(cards) };
  }

  if (n === 1) {
    return { type: "single", mainRank: ranks[0], length: 1, cards: sortHand(cards) };
  }

  if (n === 2 && ranks.length === 1 && counts[0] === 2) {
    return { type: "pair", mainRank: ranks[0], length: 2, cards: sortHand(cards) };
  }

  if (n === 3 && ranks.length === 1 && counts[0] === 3) {
    return { type: "triple", mainRank: ranks[0], length: 3, cards: sortHand(cards) };
  }

  if (n === 4) {
    if (ranks.length === 1 && counts[0] === 4) {
      return { type: "bomb", mainRank: ranks[0], length: 4, cards: sortHand(cards) };
    }
    if (ranks.length === 2 && (counts[0] === 3 || counts[1] === 3)) {
      const tripleRank = counts[0] === 3 ? ranks[0] : ranks[1];
      return { type: "triple_single", mainRank: tripleRank, length: 4, cards: sortHand(cards) };
    }
  }

  if (n === 5) {
    if (ranks.length === 2 && (counts[0] === 3 || counts[1] === 3)) {
      const tripleRank = counts[0] === 3 ? ranks[0] : ranks[1];
      const pairRank = counts[0] === 2 ? ranks[0] : ranks[1];
      if (pairRank !== tripleRank) {
        return { type: "triple_pair", mainRank: tripleRank, length: 5, cards: sortHand(cards) };
      }
    }
  }

  const isStraight =
    n >= 5 &&
    ranks.length === n &&
    counts.every((c) => c === 1) &&
    ranks[ranks.length - 1] <= 14 &&
    isConsecutive(ranks);
  if (isStraight) {
    return {
      type: "straight",
      mainRank: ranks[ranks.length - 1],
      length: n,
      cards: sortHand(cards),
    };
  }

  const isDoubleStraight =
    n >= 6 &&
    n % 2 === 0 &&
    counts.every((c) => c === 2) &&
    ranks[ranks.length - 1] <= 14 &&
    isConsecutive(ranks);
  if (isDoubleStraight) {
    return {
      type: "double_straight",
      mainRank: ranks[ranks.length - 1],
      length: n,
      cards: sortHand(cards),
    };
  }

  if (n === 6 && ranks.length === 3) {
    const idx = counts.findIndex((c) => c === 4);
    if (idx >= 0) {
      return { type: "four_two", mainRank: ranks[idx], length: 6, cards: sortHand(cards) };
    }
  }

  if (n === 8 && ranks.length === 3) {
    const idx = counts.findIndex((c) => c === 4);
    if (idx >= 0 && counts.filter((c) => c === 2).length === 2) {
      return { type: "four_two_pair", mainRank: ranks[idx], length: 8, cards: sortHand(cards) };
    }
  }

  const tripleRanks = ranks.filter((r) => (byRank.get(r)?.length || 0) === 3);
  if (tripleRanks.length >= 2) {
    const tr = tripleRanks.slice().sort((a, b) => a - b);
    const maxTriple = tr[tr.length - 1];
    const validTripleRange = maxTriple <= 14;
    if (validTripleRange) {
      for (let m = tr.length; m >= 2; m -= 1) {
        for (let i = 0; i + m <= tr.length; i += 1) {
          const seq = tr.slice(i, i + m);
          if (!isConsecutive(seq)) continue;
          const rest = [];
          const seqSet = new Set(seq);
          for (const c of cards) if (!seqSet.has(c.rank)) rest.push(c);
          if (rest.length === 0) {
            return {
              type: "plane",
              mainRank: seq[seq.length - 1],
              length: n,
              cards: sortHand(cards),
              meta: { m },
            };
          }
          if (rest.length === m) {
            const restByRank = groupByRank(rest);
            const ok = Array.from(restByRank.values()).every((v) => v.length === 1);
            if (ok) {
              return {
                type: "plane_single",
                mainRank: seq[seq.length - 1],
                length: n,
                cards: sortHand(cards),
                meta: { m },
              };
            }
          }
          if (rest.length === 2 * m) {
            const restByRank = groupByRank(rest);
            const ok = Array.from(restByRank.values()).every((v) => v.length === 2);
            if (ok) {
              return {
                type: "plane_pair",
                mainRank: seq[seq.length - 1],
                length: n,
                cards: sortHand(cards),
                meta: { m },
              };
            }
          }
        }
      }
    }
  }

  return null;
}

function canBeat(play, lastPlay) {
  if (!play) return false;
  if (!lastPlay) return true;
  if (play.type === "joker_bomb") return lastPlay.type !== "joker_bomb";
  if (lastPlay.type === "joker_bomb") return false;
  const playIsBomb = play.type === "bomb";
  const lastIsBomb = lastPlay.type === "bomb";
  if (playIsBomb && !lastIsBomb) return true;
  if (!playIsBomb && lastIsBomb) return false;
  if (play.type !== lastPlay.type) return false;
  if (play.length !== lastPlay.length) return false;
  return play.mainRank > lastPlay.mainRank;
}

function findBestMove(hand, lastPlay) {
  const byRank = groupByRank(hand);

  const hasJokerBomb = (byRank.get(16)?.length || 0) >= 1 && (byRank.get(17)?.length || 0) >= 1;
  const jokerBombMove = hasJokerBomb
    ? detectPlay([byRank.get(16)[0], byRank.get(17)[0]])
    : null;

  const bombs = ranksSorted(byRank)
    .filter((r) => (byRank.get(r)?.length || 0) === 4)
    .map((r) => detectPlay(selectCardsByRank(byRank, r, 4)));

  function pickBombAbove(rank) {
    const b = bombs.find((x) => x && x.mainRank > rank);
    return b || null;
  }

  function pickSmallestBomb() {
    return bombs[0] || null;
  }

  function pickSingleAbove(rank) {
    for (const r of ranksSorted(byRank)) {
      if (r > rank) return detectPlay([selectCardsByRank(byRank, r, 1)[0]]);
    }
    return null;
  }

  function pickPairAbove(rank) {
    for (const r of ranksSorted(byRank)) {
      if (r <= rank) continue;
      const cards = byRank.get(r) || [];
      if (cards.length >= 2) return detectPlay(cards.slice(0, 2));
    }
    return null;
  }

  function pickTripleAbove(rank) {
    for (const r of ranksSorted(byRank)) {
      if (r <= rank) continue;
      const cards = byRank.get(r) || [];
      if (cards.length >= 3) return detectPlay(cards.slice(0, 3));
    }
    return null;
  }

  function pickTripleSingleAbove(rank) {
    for (const r of ranksSorted(byRank)) {
      if (r <= rank) continue;
      const cards = byRank.get(r) || [];
      if (cards.length < 3) continue;
      const single = pickSmallestSinglesExcluding(byRank, new Set([r]), 1);
      if (single.length !== 1) continue;
      return detectPlay(cards.slice(0, 3).concat(single));
    }
    return null;
  }

  function pickTriplePairAbove(rank) {
    for (const r of ranksSorted(byRank)) {
      if (r <= rank) continue;
      const cards = byRank.get(r) || [];
      if (cards.length < 3) continue;
      const pair = pickSmallestPairsExcluding(byRank, new Set([r]), 1);
      if (pair.length !== 2) continue;
      return detectPlay(cards.slice(0, 3).concat(pair));
    }
    return null;
  }

  function pickStraightAbove(lastMaxRank, len) {
    const usable = ranksSorted(byRank).filter((r) => r <= 14 && (byRank.get(r)?.length || 0) >= 1);
    if (usable.length < len) return null;
    for (let start = 3; start <= 14 - len + 1; start += 1) {
      const seq = [];
      for (let r = start; r < start + len; r += 1) {
        if (!byRank.get(r) || (byRank.get(r)?.length || 0) < 1) {
          seq.length = 0;
          break;
        }
        seq.push(selectCardsByRank(byRank, r, 1)[0]);
      }
      if (seq.length === len) {
        const p = detectPlay(seq);
        if (p && p.mainRank > lastMaxRank) return p;
      }
    }
    return null;
  }

  function pickDoubleStraightAbove(lastMaxRank, len) {
    const pairsCount = len / 2;
    for (let start = 3; start <= 14 - pairsCount + 1; start += 1) {
      const seq = [];
      for (let r = start; r < start + pairsCount; r += 1) {
        const cards = byRank.get(r) || [];
        if (cards.length < 2) {
          seq.length = 0;
          break;
        }
        seq.push(cards[0], cards[1]);
      }
      if (seq.length === len) {
        const p = detectPlay(seq);
        if (p && p.mainRank > lastMaxRank) return p;
      }
    }
    return null;
  }

  function pickPlaneAbove(lastMaxRank, m, wing) {
    for (let start = 3; start <= 14 - m + 1; start += 1) {
      const triples = [];
      for (let r = start; r < start + m; r += 1) {
        const cards = byRank.get(r) || [];
        if (cards.length < 3) {
          triples.length = 0;
          break;
        }
        triples.push(cards[0], cards[1], cards[2]);
      }
      if (triples.length !== m * 3) continue;
      const maxRank = start + m - 1;
      if (maxRank <= lastMaxRank) continue;
      const exclude = new Set(Array.from({ length: m }, (_, i) => start + i));
      if (wing === "none") {
        const p = detectPlay(triples);
        if (p) return p;
      }
      if (wing === "single") {
        const singles = pickSmallestSinglesExcluding(byRank, exclude, m);
        if (singles.length !== m) continue;
        const p = detectPlay(triples.concat(singles));
        if (p) return p;
      }
      if (wing === "pair") {
        const pairs = pickSmallestPairsExcluding(byRank, exclude, m);
        if (pairs.length !== 2 * m) continue;
        const p = detectPlay(triples.concat(pairs));
        if (p) return p;
      }
    }
    return null;
  }

  if (!lastPlay) {
    const straight = pickStraightAbove(-1, 5);
    if (straight) return straight;
    const tripleSingle = pickTripleSingleAbove(-1);
    if (tripleSingle) return tripleSingle;
    const pair = pickPairAbove(-1);
    if (pair) return pair;
    const single = pickSingleAbove(-1);
    if (single) return single;
    const bomb = pickSmallestBomb();
    if (bomb) return bomb;
    if (jokerBombMove) return jokerBombMove;
    return null;
  }

  const t = lastPlay.type;
  if (t === "single") return pickSingleAbove(lastPlay.mainRank) || pickBombAbove(-1) || jokerBombMove;
  if (t === "pair") return pickPairAbove(lastPlay.mainRank) || pickBombAbove(-1) || jokerBombMove;
  if (t === "triple") return pickTripleAbove(lastPlay.mainRank) || pickBombAbove(-1) || jokerBombMove;
  if (t === "triple_single")
    return pickTripleSingleAbove(lastPlay.mainRank) || pickBombAbove(-1) || jokerBombMove;
  if (t === "triple_pair")
    return pickTriplePairAbove(lastPlay.mainRank) || pickBombAbove(-1) || jokerBombMove;
  if (t === "straight")
    return pickStraightAbove(lastPlay.mainRank, lastPlay.length) || pickBombAbove(-1) || jokerBombMove;
  if (t === "double_straight")
    return (
      pickDoubleStraightAbove(lastPlay.mainRank, lastPlay.length) || pickBombAbove(-1) || jokerBombMove
    );
  if (t === "four_two") return pickBombAbove(lastPlay.mainRank) || jokerBombMove;
  if (t === "four_two_pair") return pickBombAbove(lastPlay.mainRank) || jokerBombMove;
  if (t === "plane") {
    const m = lastPlay.meta?.m || lastPlay.length / 3;
    return pickPlaneAbove(lastPlay.mainRank, m, "none") || pickBombAbove(-1) || jokerBombMove;
  }
  if (t === "plane_single") {
    const m = lastPlay.meta?.m || lastPlay.length / 4;
    return pickPlaneAbove(lastPlay.mainRank, m, "single") || pickBombAbove(-1) || jokerBombMove;
  }
  if (t === "plane_pair") {
    const m = lastPlay.meta?.m || lastPlay.length / 5;
    return pickPlaneAbove(lastPlay.mainRank, m, "pair") || pickBombAbove(-1) || jokerBombMove;
  }
  if (t === "bomb") return pickBombAbove(lastPlay.mainRank) || jokerBombMove;
  if (t === "joker_bomb") return null;
  return null;
}

function aiBid(hand) {
  const byRank = groupByRank(hand);
  const jokers = (byRank.get(16)?.length || 0) + (byRank.get(17)?.length || 0);
  const bombs = ranksSorted(byRank).filter((r) => (byRank.get(r)?.length || 0) === 4).length;
  const high =
    (byRank.get(15)?.length || 0) +
    (byRank.get(14)?.length || 0) +
    (byRank.get(13)?.length || 0) +
    (byRank.get(12)?.length || 0);
  const score = jokers * 2 + bombs * 3 + high;
  if (score >= 10) return 3;
  if (score >= 7) return 2;
  if (score >= 4) return 1;
  return 0;
}

function removeCardsFromHand(hand, cards) {
  const ids = new Set(cards.map((c) => c.id));
  return hand.filter((c) => !ids.has(c.id));
}

function renderHand(hand, selectedIds, canInteract) {
  const root = document.getElementById("myHand");
  if (!root) return;
  root.replaceChildren(
    ...sortHand(hand).map((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ddzCard";
      if (selectedIds.has(c.id)) b.classList.add("selected");
      b.dataset.cardId = c.id;
      b.textContent = cardLabel(c);
      b.disabled = !canInteract;
      b.addEventListener("click", () => {
        if (!canInteract) return;
        if (selectedIds.has(c.id)) selectedIds.delete(c.id);
        else selectedIds.add(c.id);
        renderHand(hand, selectedIds, canInteract);
      });
      return b;
    }),
  );
}

function setActionEnabled(enabled) {
  const playBtn = document.getElementById("playBtn");
  const passBtn = document.getElementById("passBtn");
  const hintBtn = document.getElementById("hintBtn");
  if (playBtn) playBtn.disabled = !enabled;
  if (passBtn) passBtn.disabled = !enabled;
  if (hintBtn) hintBtn.disabled = !enabled;
}

function setCounts(players) {
  const ai1Count = document.getElementById("ai1Count");
  const ai2Count = document.getElementById("ai2Count");
  if (ai1Count) ai1Count.textContent = `剩余：${players[1].hand.length} 张`;
  if (ai2Count) ai2Count.textContent = `剩余：${players[2].hand.length} 张`;
}

function setSeatTitles(players, landlord) {
  const ai1Title = document.getElementById("ai1Title");
  const ai2Title = document.getElementById("ai2Title");
  if (ai1Title) ai1Title.textContent = `${players[1].name}${landlord === 1 ? "（地主）" : ""}`;
  if (ai2Title) ai2Title.textContent = `${players[2].name}${landlord === 2 ? "（地主）" : ""}`;
}

function setLastPlays(texts) {
  const ai1Play = document.getElementById("ai1Play");
  const ai2Play = document.getElementById("ai2Play");
  if (ai1Play) ai1Play.textContent = texts[1] || "";
  if (ai2Play) ai2Play.textContent = texts[2] || "";
}

function updateLastPlayCenter(lastPlay) {
  const lastPlayText = document.getElementById("lastPlayText");
  if (!lastPlayText) return;
  lastPlayText.textContent = lastPlay ? `上家出牌：${playText(lastPlay)}` : "本轮自由出牌";
}

function updateBottomCards(text) {
  const el = document.getElementById("bottomCards");
  if (!el) return;
  el.textContent = text;
}

function initMeta() {
  const room = getQueryParam("room");
  const role = getQueryParam("role");
  const roomChip = document.getElementById("roomChip");
  const roleChip = document.getElementById("roleChip");
  if (roomChip) roomChip.textContent = room ? `房间：${room}` : "本地模式";
  if (roleChip) roleChip.textContent = role ? `身份：${role}` : "身份：玩家";
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

async function run() {
  setPageTitle("斗地主");
  initMeta();

  const resetBtn = document.getElementById("resetBtn");
  const playBtn = document.getElementById("playBtn");
  const passBtn = document.getElementById("passBtn");
  const hintBtn = document.getElementById("hintBtn");
  const bidDialog = document.getElementById("bidDialog");

  const players = [
    { name: "你", hand: [], isHuman: true },
    { name: "AI-1", hand: [], isHuman: false },
    { name: "AI-2", hand: [], isHuman: false },
  ];

  let landlord = -1;
  let bottom = [];
  let current = 0;
  let lastPlay = null;
  let lastPlayer = -1;
  let passCount = 0;
  let selectedIds = new Set();
  let lastPlayTexts = ["", "", ""];
  let phase = "idle";

  function setPhase(p) {
    phase = p;
  }

  function canHumanInteract() {
    return phase === "play" && current === 0;
  }

  function syncUI() {
    setCounts(players);
    setSeatTitles(players, landlord);
    setLastPlays(lastPlayTexts);
    updateLastPlayCenter(lastPlay);
    renderHand(players[0].hand, selectedIds, canHumanInteract());
    setActionEnabled(canHumanInteract());
    const passAllowed = !!lastPlay && current === 0 && lastPlayer !== 0;
    if (passBtn) passBtn.disabled = !passAllowed;
  }

  function showWinner(winnerIndex) {
    const role = winnerIndex === landlord ? "地主" : "农民";
    setStatus(`${players[winnerIndex].name}（${role}）获胜`);
    toast("点击“重新开始”再来一局");
    setPhase("end");
    selectedIds = new Set();
    syncUI();
  }

  function applyPlay(playerIndex, play) {
    players[playerIndex].hand = removeCardsFromHand(players[playerIndex].hand, play.cards);
    lastPlay = play;
    lastPlayer = playerIndex;
    passCount = 0;
    lastPlayTexts[playerIndex] = playText(play);
    if (playerIndex !== 0) {
      const pile = document.getElementById("centerPile");
      if (pile) pile.textContent = `${players[playerIndex].name} 出牌`;
    }
    if (players[playerIndex].hand.length === 0) {
      showWinner(playerIndex);
    }
  }

  function applyPass(playerIndex) {
    lastPlayTexts[playerIndex] = "不出";
    passCount += 1;
    if (passCount >= 2) {
      lastPlay = null;
      passCount = 0;
      current = lastPlayer;
      lastPlayTexts = ["", "", ""];
      setStatus(`轮到 ${players[current].name} 先出`);
    }
  }

  async function stepAITurn() {
    if (phase !== "play") return;
    const p = players[current];
    if (p.isHuman) return;
    setStatus(`轮到 ${p.name} 思考…`);
    syncUI();
    await sleep(650);
    const move = findBestMove(p.hand, lastPlay);
    if (move && canBeat(move, lastPlay)) {
      applyPlay(current, move);
      if (phase === "end") return;
      current = (current + 1) % 3;
      setStatus(`轮到 ${players[current].name}`);
      syncUI();
      await stepAITurn();
      return;
    }
    if (!lastPlay) {
      const fallback = findBestMove(p.hand, null);
      if (fallback) {
        applyPlay(current, fallback);
        if (phase === "end") return;
        current = (current + 1) % 3;
        setStatus(`轮到 ${players[current].name}`);
        syncUI();
        await stepAITurn();
      }
      return;
    }
    applyPass(current);
    if (phase === "end") return;
    if (phase === "play" && current === lastPlayer) {
      syncUI();
      await stepAITurn();
      return;
    }
    current = (current + 1) % 3;
    setStatus(`轮到 ${players[current].name}`);
    syncUI();
    await stepAITurn();
  }

  async function bidding() {
    setPhase("bid");
    const bids = [0, 0, 0];
    const start = Math.floor(Math.random() * 3);
    current = start;
    landlord = -1;
    updateBottomCards("底牌：3 张（叫完地主后翻开）");
    setStatus(`开始叫分（从 ${players[current].name} 开始）`);
    syncUI();

    async function humanPickBid() {
      if (!(bidDialog instanceof HTMLDialogElement)) return 0;
      bidDialog.returnValue = "";
      bidDialog.showModal();
      const buttons = bidDialog.querySelectorAll("button[data-bid]");
      return await new Promise((resolve) => {
        const cleanup = () => {
          for (const b of buttons) b.removeEventListener("click", onClick);
          bidDialog.close();
        };
        const onClick = (e) => {
          const t = e.currentTarget;
          const val = Number(t?.getAttribute("data-bid") || "0");
          cleanup();
          resolve(Number.isFinite(val) ? val : 0);
        };
        for (const b of buttons) b.addEventListener("click", onClick);
      });
    }

    for (let i = 0; i < 3; i += 1) {
      const idx = (start + i) % 3;
      current = idx;
      const p = players[idx];
      if (p.isHuman) {
        setStatus("请选择叫分");
        syncUI();
        bids[idx] = await humanPickBid();
        toast(`你选择：${bids[idx]} 分`);
      } else {
        setStatus(`${p.name} 叫分中…`);
        syncUI();
        await sleep(500);
        bids[idx] = aiBid(p.hand);
        lastPlayTexts[idx] = `叫 ${bids[idx]} 分`;
      }
      syncUI();
    }

    const max = Math.max(...bids);
    if (max === 0) return { ok: false };
    landlord = bids.findIndex((x) => x === max);
    return { ok: true };
  }

  function startPlay() {
    setPhase("play");
    const bottomCards = bottom.slice();
    players[landlord].hand = sortHand(players[landlord].hand.concat(bottomCards));
    bottom = [];
    current = landlord;
    lastPlay = null;
    lastPlayer = landlord;
    passCount = 0;
    lastPlayTexts = ["", "", ""];
    updateBottomCards(`底牌：${bottomCards.map(cardLabel).join(" ")}`);
    setStatus(`地主是 ${players[landlord].name}，轮到 ${players[current].name} 先出`);
    selectedIds = new Set();
    syncUI();
  }

  async function newRound() {
    const deck = shuffle(buildDeck());
    players[0].hand = sortHand(deck.slice(0, 17));
    players[1].hand = sortHand(deck.slice(17, 34));
    players[2].hand = sortHand(deck.slice(34, 51));
    bottom = deck.slice(51, 54);
    landlord = -1;
    lastPlay = null;
    lastPlayer = -1;
    passCount = 0;
    lastPlayTexts = ["", "", ""];
    selectedIds = new Set();
    updateBottomCards("底牌：3 张（叫完地主后翻开）");
    toast("");
    syncUI();

    const bidResult = await bidding();
    if (!bidResult.ok) {
      toast("无人叫地主，重新发牌");
      await sleep(600);
      await newRound();
      return;
    }
    setSeatTitles(players, landlord);
    updateBottomCards(`底牌：${bottom.map(cardLabel).join(" ")}`);
    startPlay();
    await stepAITurn();
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      toast("");
      setStatus("准备开始…");
      await newRound();
    });
  }

  if (playBtn) {
    playBtn.addEventListener("click", async () => {
      if (!canHumanInteract()) return;
      const selected = players[0].hand.filter((c) => selectedIds.has(c.id));
      const play = detectPlay(selected);
      if (!play) {
        toast("选中的牌型不合法");
        return;
      }
      if (!canBeat(play, lastPlay)) {
        toast("无法压过上家");
        return;
      }
      applyPlay(0, play);
      if (phase === "end") return;
      selectedIds = new Set();
      current = 1;
      setStatus(`轮到 ${players[current].name}`);
      syncUI();
      await stepAITurn();
    });
  }

  if (passBtn) {
    passBtn.addEventListener("click", async () => {
      if (!canHumanInteract()) return;
      if (!lastPlay || lastPlayer === 0) {
        toast("本轮你先出，不能不出");
        return;
      }
      selectedIds = new Set();
      applyPass(0);
      if (phase === "end") return;
      if (phase === "play" && current === lastPlayer) {
        syncUI();
        await stepAITurn();
        return;
      }
      current = 1;
      setStatus(`轮到 ${players[current].name}`);
      syncUI();
      await stepAITurn();
    });
  }

  if (hintBtn) {
    hintBtn.addEventListener("click", () => {
      if (!canHumanInteract()) return;
      const move = findBestMove(players[0].hand, lastPlay);
      if (!move || (lastPlay && !canBeat(move, lastPlay))) {
        toast("没有可出的牌");
        return;
      }
      selectedIds = new Set(move.cards.map((c) => c.id));
      toast("已帮你选中一手牌");
      syncUI();
    });
  }

  setStatus("点击“重新开始”开始一局斗地主");
  syncUI();
}

run();
