import { getOrCreateClientId, getPlayerName, getQueryParam, normalizeRoomCode, setPageTitle } from "./lib.js";
import { createRoomTransport } from "./room_channel.js";

const GAME_ID = "draw-guess";
const MAX_PLAYERS = 16;

function now() {
  return Date.now();
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, Math.trunc(x)));
}

function pickWord() {
  const list = [
    "太阳",
    "月亮",
    "星星",
    "雨伞",
    "彩虹",
    "猫",
    "狗",
    "兔子",
    "恐龙",
    "汽车",
    "火车",
    "飞机",
    "自行车",
    "房子",
    "树",
    "花",
    "西瓜",
    "冰淇淋",
    "汉堡",
    "书",
    "电脑",
    "手机",
    "眼镜",
    "时钟",
    "钥匙",
    "足球",
    "篮球",
    "滑板",
    "吉他",
    "相机",
    "医生",
    "老师",
    "警察",
    "魔法棒",
    "礼物",
    "蛋糕",
  ];
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

function normalizeGuess(text) {
  return String(text || "").trim().toLowerCase();
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

function fitCanvas(canvas, ratio = window.devicePixelRatio || 1) {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * ratio));
  const h = Math.max(1, Math.floor(rect.height * ratio));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { ratio, w, h };
}

function main() {
  const roomRaw = getQueryParam("room");
  const roleRaw = getQueryParam("role");
  const room = roomRaw ? normalizeRoomCode(roomRaw) : "";
  const clientId = getOrCreateClientId();
  const playerName = getPlayerName();

  setPageTitle("你画我猜");

  const backLink = document.getElementById("backLink");
  const roomChip = document.getElementById("roomChip");
  const roleChip = document.getElementById("roleChip");
  const statusText = document.getElementById("statusText");
  const overlayText = document.getElementById("overlayText");
  const answerChip = document.getElementById("answerChip");
  const roundChip = document.getElementById("roundChip");
  const timerChip = document.getElementById("timerChip");
  const timerBar = document.getElementById("timerBar");
  const scoreList = document.getElementById("scoreList");
  const wordOptions = document.getElementById("wordOptions");
  const nextBtn = document.getElementById("nextBtn");
  const clearBtn = document.getElementById("clearBtn");
  const undoBtn = document.getElementById("undoBtn");
  const penBtn = document.getElementById("penBtn");
  const eraserBtn = document.getElementById("eraserBtn");
  const widthRange = document.getElementById("widthRange");
  const colorRow = document.getElementById("colorRow");
  const chatLog = document.getElementById("chatLog");
  const guessInput = document.getElementById("guessInput");
  const sendBtn = document.getElementById("sendBtn");
  const hintText = document.getElementById("hintText");
  const canvas = document.getElementById("canvas");

  if (roomChip) roomChip.textContent = room ? `房间：${room}` : "单机";
  if (roleChip) roleChip.textContent = roleRaw ? String(roleRaw) : "";
  if (backLink && room) {
    const url = new URL("./room.html", window.location.href);
    url.searchParams.set("game", GAME_ID);
    url.searchParams.set("name", "你画我猜");
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
  let drawerId = hostId;
  let fullDenied = false;

  let tool = { mode: "pen", width: 6, color: "#0f172a" };
  let drawing = false;
  let currentStroke = null;
  let strokes = [];

  let round = {
    id: "",
    phase: "idle",
    options: [],
    word: "",
    startedAt: 0,
    endsAt: 0,
    endedAt: 0,
    winnerId: "",
  };

  let timer = 0;
  let canvasSize = { ratio: 1, w: 1, h: 1 };

  const palette = ["#0f172a", "#1d4ed8", "#16a34a", "#dc2626", "#ea580c", "#a855f7", "#111827", "#ffffff"];

  function seatName(id) {
    if (id === clientId) return playerName;
    const m = members.get(id);
    if (m && m.name) return String(m.name);
    if (!id) return "";
    return `玩家${id.slice(0, 4)}`;
  }

  function setStatus(text) {
    if (statusText) statusText.textContent = text || "";
  }

  function setHint(text) {
    if (hintText) hintText.textContent = text || "";
  }

  function setOverlay(text) {
    if (!overlayText) return;
    overlayText.textContent = text || "";
    overlayText.classList.toggle("hidden", !text);
  }

  function setAnswer(text) {
    if (!answerChip) return;
    answerChip.textContent = text || "";
    answerChip.classList.toggle("hidden", !text);
  }

  function myIsDrawer() {
    return clientId === drawerId;
  }

  function canDraw() {
    if (!room) return true;
    return myIsDrawer() && members.has(clientId);
  }

  function addChatLine(text, kind = "") {
    if (!chatLog) return;
    const div = document.createElement("div");
    div.className = `dgLine ${kind}`.trim();
    div.textContent = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function memberIdsSorted() {
    return Array.from(members.keys())
      .filter(Boolean)
      .slice()
      .sort((a, b) => a.localeCompare(b));
  }

  function nextDrawer() {
    const ids = memberIdsSorted();
    if (!ids.length) return hostId;
    const idx = ids.indexOf(drawerId);
    const next = idx < 0 ? ids[0] : ids[(idx + 1) % ids.length];
    return next || hostId;
  }

  function setRoundChipText() {
    if (!roundChip) return;
    if (!round.id) {
      roundChip.textContent = "未开始";
      return;
    }
    const phaseLabel =
      round.phase === "choose" ? "选题" : round.phase === "draw" ? "作画" : round.phase === "done" ? "结算" : "等待";
    roundChip.textContent = `阶段：${phaseLabel}`;
  }

  function setTimerUI() {
    if (!timerChip || !timerBar) return;
    if (round.phase !== "draw" || !round.endsAt) {
      timerChip.textContent = "";
      timerChip.classList.add("hidden");
      timerBar.style.width = "0%";
      return;
    }
    timerChip.classList.remove("hidden");
    const total = 60000;
    const left = clampInt(round.endsAt - now(), 0, total);
    const sec = Math.ceil(left / 1000);
    timerChip.textContent = `剩余：${sec}s`;
    const pct = Math.max(0, Math.min(100, (left / total) * 100));
    timerBar.style.width = `${pct}%`;
  }

  function renderScores() {
    if (!scoreList) return;
    if (!room) {
      scoreList.replaceChildren();
      return;
    }
    const ids = memberIdsSorted();
    const items = ids
      .map((id) => {
        const m = members.get(id) || { id, name: "", score: 0 };
        return { id, name: seatName(id), score: Number(m.score || 0) };
      })
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    scoreList.replaceChildren(
      ...items.map((it) => {
        const span = document.createElement("span");
        span.className = "chip";
        const tag = it.id === drawerId ? "（画）" : it.id === round.winnerId ? "（猜中）" : "";
        span.textContent = `${it.name}${tag} ${it.score}`;
        return span;
      }),
    );
  }

  function broadcastState() {
    if (!transport || !isHost || !room) return;
    transport.send({
      type: "state",
      gameId: GAME_ID,
      room,
      hostId,
      members: Array.from(members.values()),
      drawerId,
      tool,
      strokes,
      round,
    });
  }

  function clearBoardLocal() {
    strokes = [];
    currentStroke = null;
    redraw();
  }

  function redraw() {
    canvasSize = fitCanvas(canvas);
    const { w, h } = canvasSize;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes) drawStroke(s);
  }

  function drawStroke(stroke) {
    if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 2) return;
    const { w, h, ratio } = canvasSize;
    ctx.strokeStyle = stroke.mode === "eraser" ? "rgba(255,255,255,0.92)" : String(stroke.color || tool.color);
    ctx.lineWidth = clampInt(stroke.width || tool.width, 2, 24) * ratio;
    ctx.beginPath();
    const pts = stroke.points;
    ctx.moveTo(pts[0].x * w, pts[0].y * h);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x * w, pts[i].y * h);
    ctx.stroke();
  }

  function pickOptions(count = 3) {
    const set = new Set();
    while (set.size < count) set.add(pickWord());
    return Array.from(set);
  }

  function hostStartChooseRound() {
    if (!isHost) return;
    if (members.size < 2) {
      setHint("至少需要 2 名玩家才能开始。");
      return;
    }
    drawerId = drawerId || hostId;
    const id = `${now()}_${Math.random().toString(16).slice(2)}`;
    round = {
      id,
      phase: "choose",
      options: pickOptions(3),
      word: "",
      startedAt: now(),
      endsAt: 0,
      endedAt: 0,
      winnerId: "",
    };
    clearBoardLocal();
    addChatLine("新的一局开始了：画手选题。", "sys");
    broadcastState();
    render();
  }

  function hostStartDraw(word) {
    if (!isHost) return;
    const w = String(word || "");
    if (!w) return;
    const startAt = now();
    const duration = 60000;
    round = {
      ...round,
      phase: "draw",
      word: w,
      options: [],
      startedAt: startAt,
      endsAt: startAt + duration,
      endedAt: 0,
      winnerId: "",
    };
    clearBoardLocal();
    transport?.send({ type: "clear", gameId: GAME_ID, room, roundId: round.id });
    broadcastState();
    render();
  }

  function hostClearBoard() {
    if (room && !(isHost || myIsDrawer())) return;
    clearBoardLocal();
    if (room) transport?.send({ type: "clear", gameId: GAME_ID, room, roundId: round.id, clientId });
    if (room && isHost) broadcastState();
  }

  function hostFinishRound({ winnerId = "", reveal = true } = {}) {
    if (!isHost) return;
    if (!round.id || round.phase === "idle" || round.endedAt) return;
    const w = String(winnerId || "");
    const endedAt = now();
    round = { ...round, phase: "done", endedAt, winnerId: w, endsAt: round.endsAt || endedAt };
    if (reveal) transport?.send({ type: "reveal", gameId: GAME_ID, room, roundId: round.id, word: round.word, winnerId: w });

    if (w) {
      const m = members.get(w) || { id: w, name: "", score: 0 };
      members.set(w, { ...m, score: Number(m.score || 0) + 2 });
      const d = members.get(drawerId) || { id: drawerId, name: "", score: 0 };
      if (drawerId) members.set(drawerId, { ...d, score: Number(d.score || 0) + 1 });
    }

    drawerId = nextDrawer();
    broadcastState();
    render();
  }

  function handleGuess(text) {
    if (room && !members.has(clientId)) return;
    const msg = String(text || "").trim();
    if (!msg) return;
    const mineDrawer = myIsDrawer();
    if (mineDrawer && room) {
      addChatLine("画手不能猜题。", "sys");
      return;
    }
    const payload = {
      type: "chat",
      gameId: GAME_ID,
      room,
      clientId,
      name: playerName,
      text: msg,
      ts: now(),
    };
    if (room && transport) transport.send(payload);
    else onMessage(payload);
  }

  function onMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.gameId !== GAME_ID) return;
    if (room && String(msg.room || "") !== room) return;

    if (msg.type === "full") {
      const to = String(msg.to || "");
      if (to !== clientId) return;
      fullDenied = true;
      if (ping) window.clearInterval(ping);
      ping = 0;
      setOverlay(`房间已满（最多 ${MAX_PLAYERS} 人），当前为观战模式。`);
      render();
      return;
    }

    if (msg.type === "join") {
      if (!isHost || !room || !transport) return;
      const id = String(msg.clientId || "");
      const name = String(msg.name || "");
      if (!id) return;
      if (!members.has(id) && members.size >= MAX_PLAYERS) {
        transport.send({ type: "full", gameId: GAME_ID, room, to: id, max: MAX_PLAYERS });
        return;
      }
      if (!members.has(id)) members.set(id, { id, name, score: 0 });
      else {
        const prev = members.get(id);
        members.set(id, { ...prev, name: name || prev?.name || "" });
      }
      if (!drawerId) drawerId = hostId;
      if (!members.has(hostId)) members.set(hostId, { id: hostId, name: seatName(hostId), score: 0 });
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
        next.set(id, { id, name, score: Number(m.score || 0) });
      }
      members = next;

      drawerId = String(msg.drawerId || hostId);
      const incomingTool = msg.tool && typeof msg.tool === "object" ? msg.tool : null;
      if (incomingTool) {
        tool = {
          mode: incomingTool.mode === "eraser" ? "eraser" : "pen",
          width: clampInt(incomingTool.width || 6, 2, 24),
          color: String(incomingTool.color || "#0f172a"),
        };
      }

      const incomingStrokes = Array.isArray(msg.strokes) ? msg.strokes : [];
      strokes = incomingStrokes
        .slice(0, 400)
        .map((s) => {
          if (!s || typeof s !== "object") return null;
          const pts = Array.isArray(s.points) ? s.points : [];
          const points = pts
            .slice(0, 2000)
            .map((p) => ({ x: Number(p?.x || 0), y: Number(p?.y || 0) }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
          return {
            by: String(s.by || ""),
            mode: s.mode === "eraser" ? "eraser" : "pen",
            width: clampInt(s.width || 6, 2, 24),
            color: String(s.color || "#0f172a"),
            points,
          };
        })
        .filter(Boolean);

      const r = msg.round && typeof msg.round === "object" ? msg.round : null;
      if (r) {
        round = {
          id: String(r.id || ""),
          phase: String(r.phase || "idle"),
          options: Array.isArray(r.options) ? r.options.map((x) => String(x || "")).filter(Boolean).slice(0, 6) : [],
          word: String(r.word || ""),
          startedAt: Number(r.startedAt || 0),
          endsAt: Number(r.endsAt || 0),
          endedAt: Number(r.endedAt || 0),
          winnerId: String(r.winnerId || ""),
        };
        if (!["idle", "choose", "draw", "done"].includes(round.phase)) round.phase = "idle";
      }

      redraw();
      render();
      return;
    }

    if (msg.type === "stroke") {
      if (String(msg.roundId || "") !== round.id) return;
      const from = String(msg.clientId || "");
      if (from !== drawerId) return;
      if (round.phase !== "draw" || round.endedAt) return;
      const s = msg.stroke;
      if (!s || typeof s !== "object") return;
      const pts = Array.isArray(s.points) ? s.points : [];
      const points = pts
        .slice(0, 2000)
        .map((p) => ({ x: Number(p?.x || 0), y: Number(p?.y || 0) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      const stroke = {
        by: from,
        mode: s.mode === "eraser" ? "eraser" : "pen",
        width: clampInt(s.width || 6, 2, 24),
        color: String(s.color || "#0f172a"),
        points,
      };
      strokes.push(stroke);
      drawStroke(stroke);
      if (isHost && room) broadcastState();
      return;
    }

    if (msg.type === "clear") {
      if (String(msg.roundId || "") && String(msg.roundId || "") !== round.id) return;
      const from = String(msg.clientId || "");
      if (room && from && from !== drawerId && from !== hostId) return;
      clearBoardLocal();
      if (isHost && room) broadcastState();
      return;
    }

    if (msg.type === "undo") {
      if (String(msg.roundId || "") !== round.id) return;
      const from = String(msg.clientId || "");
      if (from !== drawerId) return;
      for (let i = strokes.length - 1; i >= 0; i -= 1) {
        if (strokes[i]?.by === from) {
          strokes.splice(i, 1);
          break;
        }
      }
      redraw();
      if (isHost && room) broadcastState();
      return;
    }

    if (msg.type === "choose") {
      if (!isHost || !room) return;
      if (String(msg.roundId || "") !== round.id) return;
      if (round.phase !== "choose") return;
      const from = String(msg.clientId || "");
      if (from !== drawerId) return;
      const w = String(msg.word || "");
      if (!w || !round.options.includes(w)) return;
      hostStartDraw(w);
      return;
    }

    if (msg.type === "reveal") {
      const w = String(msg.word || "");
      const winner = String(msg.winnerId || "");
      if (w) addChatLine(`答案公布：${w}`, "sys");
      if (winner) addChatLine(`猜对了：${seatName(winner)}`, "sys");
      return;
    }

    if (msg.type === "chat") {
      const from = String(msg.clientId || "");
      const name = String(msg.name || "");
      const text = String(msg.text || "");
      if (!text) return;
      const who = from === clientId ? "你" : name || seatName(from);
      addChatLine(`${who}：${text}`, from === clientId ? "me" : "");

      if (room && isHost && round.id && round.phase === "draw" && !round.endedAt) {
        const guess = normalizeGuess(text);
        const answer = normalizeGuess(round.word);
        if (guess && answer && guess === answer) hostFinishRound({ winnerId: from });
      }
      return;
    }
  }

  function render() {
    const enough = !room || members.size >= 2;
    const ended = Boolean(round.endedAt);
    const spectator = room && !members.has(clientId);

    if (roleChip) {
      const suffix = room ? (spectator ? " | 观战" : myIsDrawer() ? " | 你在画" : " | 你在猜") : " | 单机";
      roleChip.textContent = `${roleRaw ? String(roleRaw) : ""}${suffix}`.trim() || suffix.trim();
    }

    setRoundChipText();
    setTimerUI();
    renderScores();

    if (!room) {
      setStatus("本地演示：建议同一浏览器开两个标签页加入同房间号。");
    }

    if (spectator) {
      setStatus("观战中");
      setHint(`房间人数已满（上限 ${MAX_PLAYERS}），可观看作画与聊天。`);
      setAnswer("");
      setOverlay(`房间已满（最多 ${MAX_PLAYERS} 人）`);
    } else if (room && !enough) {
      setStatus("等待玩家加入");
      setHint(isHost ? "等另一名玩家加入后点击“下一题”开始。" : "等待房主开始。");
      setAnswer("");
      setOverlay("等待玩家加入…");
    } else if (!round.id || round.phase === "idle") {
      setStatus("等待开始");
      setHint(isHost ? "点击“下一题”开始一局。" : "等待房主开始。");
      setAnswer("");
      setOverlay("等待开始…");
    } else if (round.phase === "choose") {
      setStatus(myIsDrawer() ? "轮到你选题" : `等待画手选题：${seatName(drawerId)}`);
      setHint(myIsDrawer() ? "选择一个题目开始作画。" : "请等待画手选择题目。");
      setAnswer("");
      setOverlay(myIsDrawer() ? "" : "画手选题中…");
    } else if (round.phase === "draw") {
      setStatus(myIsDrawer() ? "你是画手" : `画手：${seatName(drawerId)}`);
      setHint(myIsDrawer() ? "开始画吧（快捷键：Ctrl/⌘+Z 撤销）" : "输入文字猜测，猜中立即结束。");
      setOverlay("");
      setAnswer(myIsDrawer() ? `你在画：${round.word}` : "");
    } else if (round.phase === "done" || ended) {
      const winner = round.winnerId ? seatName(round.winnerId) : "";
      setStatus(winner ? `本局结束，胜者：${winner}` : "本局结束");
      setHint(isHost ? "点击“下一题”开始下一局。" : "等待房主下一题。");
      setOverlay("本局结束");
      setAnswer(round.word ? `答案：${round.word}` : "");
    }

    if (wordOptions) {
      const show = room && round.phase === "choose" && myIsDrawer() && round.options.length > 0;
      wordOptions.classList.toggle("hidden", !show);
      if (show) {
        wordOptions.replaceChildren(
          ...round.options.map((w) => {
            const b = document.createElement("button");
            b.className = "btn small";
            b.type = "button";
            b.textContent = w;
            b.addEventListener("click", () => {
              if (!transport || !room) return;
              transport.send({ type: "choose", gameId: GAME_ID, room, roundId: round.id, clientId, word: w });
            });
            return b;
          }),
        );
      } else {
        wordOptions.replaceChildren();
      }
    }

    const showTools = !spectator && myIsDrawer() && round.phase === "draw" && !round.endedAt;
    if (nextBtn) nextBtn.classList.toggle("hidden", !isHost);
    if (clearBtn) clearBtn.classList.toggle("hidden", !(showTools || isHost));
    if (undoBtn) undoBtn.classList.toggle("hidden", !showTools);

    if (penBtn) penBtn.classList.toggle("hidden", !showTools);
    if (eraserBtn) eraserBtn.classList.toggle("hidden", !showTools);
    if (widthRange) widthRange.classList.toggle("hidden", !showTools);
    if (colorRow) colorRow.classList.toggle("hidden", !showTools);

    const canType = spectator ? false : !room ? true : !myIsDrawer() && enough && round.phase === "draw" && !round.endedAt;
    if (guessInput instanceof HTMLInputElement) {
      guessInput.disabled = !canType;
    }
    if (sendBtn) {
      sendBtn.disabled = !canType;
    }
  }

  function pointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  function onDown(e) {
    if (!canDraw()) return;
    if (!round.id || round.phase !== "draw" || round.endedAt) return;
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    const p = pointFromEvent(e);
    currentStroke = { by: clientId, mode: tool.mode, width: tool.width, color: tool.color, points: [p] };
  }

  function onMove(e) {
    if (!drawing || !currentStroke) return;
    const p = pointFromEvent(e);
    const last = currentStroke.points[currentStroke.points.length - 1];
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (dx * dx + dy * dy < 0.00002) return;
    currentStroke.points.push(p);
    drawStroke({ ...currentStroke, points: [last, p] });
  }

  function onUp() {
    if (!drawing) return;
    drawing = false;
    if (!currentStroke || currentStroke.points.length < 2) {
      currentStroke = null;
      return;
    }
    const stroke = currentStroke;
    currentStroke = null;

    if (room) {
      if (!transport) return;
      if (!myIsDrawer()) return;
      strokes.push(stroke);
      transport.send({ type: "stroke", gameId: GAME_ID, room, roundId: round.id, clientId, stroke });
      return;
    }
    strokes.push(stroke);
    redraw();
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onUp);

  window.addEventListener("resize", () => redraw());

  if (penBtn) {
    penBtn.addEventListener("click", () => {
      tool = { ...tool, mode: "pen" };
      if (isHost && room) broadcastState();
    });
  }
  if (eraserBtn) {
    eraserBtn.addEventListener("click", () => {
      tool = { ...tool, mode: "eraser" };
      if (isHost && room) broadcastState();
    });
  }
  if (widthRange instanceof HTMLInputElement) {
    widthRange.value = String(tool.width);
    widthRange.addEventListener("input", () => {
      tool = { ...tool, width: clampInt(widthRange.value, 2, 22) };
      if (isHost && room) broadcastState();
    });
  }

  if (colorRow) {
    colorRow.replaceChildren(
      ...palette.map((c) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "dgColor";
        b.style.background = c;
        b.dataset.color = c;
        b.addEventListener("click", () => {
          tool = { ...tool, color: c, mode: "pen" };
          if (isHost && room) broadcastState();
        });
        return b;
      }),
    );
  }

  function doUndo() {
    if (!myIsDrawer() || (room && !members.has(clientId))) return;
    if (round.phase !== "draw" || round.endedAt) return;
    if (room && transport) {
      transport.send({ type: "undo", gameId: GAME_ID, room, roundId: round.id, clientId });
      return;
    }
    for (let i = strokes.length - 1; i >= 0; i -= 1) {
      if (strokes[i]?.by === clientId) {
        strokes.splice(i, 1);
        break;
      }
    }
    redraw();
  }

  if (undoBtn) undoBtn.addEventListener("click", doUndo);

  window.addEventListener("keydown", (e) => {
    const key = String(e.key || "");
    if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === "z") {
      e.preventDefault();
      doUndo();
    }
  });

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (!isHost) return;
      if (!round.id || round.phase === "idle" || round.phase === "done") {
        drawerId = drawerId || hostId;
        if (round.phase === "done") drawerId = nextDrawer();
        hostStartChooseRound();
        return;
      }
      addChatLine("房主跳过本题。", "sys");
      hostFinishRound({ winnerId: "" });
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      hostClearBoard();
    });
  }

  const doSend = () => {
    if (!(guessInput instanceof HTMLInputElement)) return;
    const text = guessInput.value;
    guessInput.value = "";
    handleGuess(text);
  };

  if (sendBtn) sendBtn.addEventListener("click", doSend);
  if (guessInput instanceof HTMLInputElement) {
    guessInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSend();
    });
  }

  function cleanup() {
    if (ping) window.clearInterval(ping);
    ping = 0;
    if (transport) transport.close();
    transport = null;
    if (timer) window.clearInterval(timer);
    timer = 0;
  }
  window.addEventListener("beforeunload", cleanup);

  if (!room) {
    members = new Map();
    members.set(clientId, { id: clientId, name: playerName, score: 0 });
    drawerId = clientId;
    round = { id: "", phase: "idle", options: [], word: "", startedAt: 0, endsAt: 0, endedAt: 0, winnerId: "" };
    setOverlay("");
    setAnswer("");
    redraw();
    render();
    if (nextBtn) nextBtn.classList.remove("hidden");
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        if (!round.id || round.phase === "idle" || round.phase === "done") {
          const id = `${now()}_${Math.random().toString(16).slice(2)}`;
          round = { id, phase: "choose", options: pickOptions(3), word: "", startedAt: now(), endsAt: 0, endedAt: 0, winnerId: "" };
          clearBoardLocal();
          addChatLine("新的一局开始了：选题。", "sys");
          render();
          return;
        }
        if (round.phase === "choose") {
          const w = round.options[0] || pickWord();
          const startAt = now();
          round = { ...round, phase: "draw", word: w, options: [], startedAt: startAt, endsAt: startAt + 60000, endedAt: 0, winnerId: "" };
          clearBoardLocal();
          render();
          return;
        }
        round = { ...round, phase: "done", endedAt: now() };
        render();
      });
    }
    if (wordOptions) wordOptions.classList.add("hidden");
    timer = window.setInterval(() => {
      setTimerUI();
    }, 200);
    return;
  }

  transport = createRoomTransport(`${GAME_ID}_${room}`, onMessage);
  members = new Map();
  members.set(clientId, { id: clientId, name: playerName, score: 0 });
  drawerId = hostId;

  const joinMsg = { type: "join", gameId: GAME_ID, room, clientId, name: playerName };
  transport.send(joinMsg);
  ping = window.setInterval(() => {
    if (!transport) return;
    transport.send(joinMsg);
    if (isHost) broadcastState();
  }, 1200);

  timer = window.setInterval(() => {
    if (isHost && round.phase === "draw" && round.endsAt && !round.endedAt && now() >= round.endsAt) {
      hostFinishRound({ winnerId: "" });
    }
    setTimerUI();
  }, 200);

  redraw();
  render();
}

main();
