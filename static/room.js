import {
  copyText,
  getQueryParam,
  getOrCreateClientId,
  getPlayerName,
  getRelayUrl,
  isValidRoomCode,
  normalizeRoomCode,
  randomRoomCode,
  redirect127ToLocalhost,
  setPageTitle,
  setRelayUrl,
} from "./lib.js";
import { createRoomTransport } from "./room_channel.js";

function setBusy(busy) {
  const joinBtn = document.getElementById("joinBtn");
  const matchBtn = document.getElementById("matchBtn");
  const createBtn = document.getElementById("createBtn");
  const roomCode = document.getElementById("roomCode");
  if (joinBtn) joinBtn.disabled = busy;
  if (matchBtn) matchBtn.disabled = busy;
  if (createBtn) createBtn.disabled = busy;
  if (roomCode) roomCode.disabled = busy;
}

function showResult({ title, code, hint }) {
  const result = document.getElementById("result");
  const resultTitle = document.getElementById("resultTitle");
  const resultCode = document.getElementById("resultCode");
  const resultHint = document.getElementById("resultHint");
  const startBtn = document.getElementById("startBtn");
  const lobbyBox = document.getElementById("lobbyBox");
  if (!result || !resultTitle || !resultCode || !resultHint || !startBtn || !lobbyBox) return;
  resultTitle.textContent = title;
  resultCode.textContent = code;
  resultHint.textContent = hint || "";
  result.classList.remove("hidden");
  startBtn.classList.add("hidden");
  lobbyBox.classList.add("hidden");
}

function initCopy() {
  const copyBtn = document.getElementById("copyBtn");
  const resultCode = document.getElementById("resultCode");
  if (!copyBtn || !resultCode) return;
  copyBtn.addEventListener("click", async () => {
    const code = resultCode.textContent || "";
    if (!code) return;
    await copyText(code);
    copyBtn.textContent = "已复制";
    window.setTimeout(() => (copyBtn.textContent = "复制"), 1200);
  });
}

function main() {
  if (redirect127ToLocalhost()) return;
  const gameId = getQueryParam("game");
  const gameName = getQueryParam("name");
  if (!gameId) {
    window.location.href = "./index.html";
    return;
  }

  const nameEl = document.getElementById("gameName");
  if (nameEl) nameEl.textContent = gameName || gameId;
  setPageTitle(`房间 - ${gameName || gameId}`);

  initCopy();

  if (window.location.protocol === "file:") {
    showResult({ title: "联机不可用", code: "请用 server.ps1 启动本地服务器打开页面", hint: "同一浏览器多窗口/多标签可联机；直接打开文件无法通信" });
    return;
  }

  const relayInput = document.getElementById("relayUrl");
  const saveRelayBtn = document.getElementById("saveRelayBtn");
  const clearRelayBtn = document.getElementById("clearRelayBtn");
  if (relayInput instanceof HTMLInputElement) relayInput.value = getRelayUrl();
  if (saveRelayBtn) {
    saveRelayBtn.addEventListener("click", () => {
      const raw = relayInput instanceof HTMLInputElement ? relayInput.value : "";
      setRelayUrl(raw);
      saveRelayBtn.textContent = "已保存";
      window.setTimeout(() => (saveRelayBtn.textContent = "保存"), 1200);
    });
  }
  if (clearRelayBtn) {
    clearRelayBtn.addEventListener("click", () => {
      if (relayInput instanceof HTMLInputElement) relayInput.value = "";
      setRelayUrl("");
      clearRelayBtn.textContent = "已清除";
      window.setTimeout(() => (clearRelayBtn.textContent = "清除"), 1200);
    });
  }

  const input = document.getElementById("roomCode");
  const joinBtn = document.getElementById("joinBtn");
  const createBtn = document.getElementById("createBtn");
  const startBtn = document.getElementById("startBtn");
  const lobbyBox = document.getElementById("lobbyBox");
  const memberList = document.getElementById("memberList");
  const addAiBtn = document.getElementById("addAiBtn");
  const removeAiBtn = document.getElementById("removeAiBtn");
  const hostStartBtn = document.getElementById("hostStartBtn");
  const lobbyHint = document.getElementById("lobbyHint");
  const clientId = getOrCreateClientId();
  const playerName = getPlayerName();
  let transport = null;
  let roomPing = 0;
  let currentRoom = "";
  let isHost = false;
  let hostId = "";
  let aiCount = 0;
  let members = new Map();

  function requiredPlayers() {
    if (gameId === "doudizhu") return 3;
    if (gameId === "mahjong") return 4;
    return 2;
  }

  function maxPlayers() {
    if (gameId === "doudizhu") return 3;
    if (gameId === "mahjong") return 4;
    if (gameId === "tic-tac-toe") return 2;
    if (gameId === "flying-chess") return 4;
    return requiredPlayers();
  }

  function maxAi() {
    if (gameId === "doudizhu") return 2;
    if (gameId === "mahjong") return 3;
    if (gameId === "tic-tac-toe") return 1;
    if (gameId === "flying-chess") return 3;
    return 0;
  }

  function hostKey(room) {
    return `xiaoyouxi_room_host_${gameId}_${room}`;
  }

  function ensureHost(room, preferredHostId = "") {
    const key = hostKey(room);
    const exist = localStorage.getItem(key);
    if (exist) return exist;
    const val = preferredHostId || clientId;
    localStorage.setItem(key, val);
    return val;
  }

  function setStartLink(code) {
    if (!startBtn) return;
    const room = normalizeRoomCode(code);
    if (gameId === "doudizhu") {
      const url = new URL("./doudizhu.html", window.location.href);
      url.searchParams.set("game", gameId);
      url.searchParams.set("name", gameName || gameId);
      url.searchParams.set("room", room);
      url.searchParams.set("role", isHost ? "房主" : "成员");
      startBtn.href = url.toString();
      startBtn.textContent = "进入斗地主";
      return;
    }
    if (gameId === "mahjong") {
      const url = new URL("./mahjong.html", window.location.href);
      url.searchParams.set("game", gameId);
      url.searchParams.set("name", gameName || gameId);
      url.searchParams.set("room", room);
      url.searchParams.set("role", isHost ? "房主" : "成员");
      startBtn.href = url.toString();
      startBtn.textContent = "进入麻将";
      return;
    }
    if (gameId === "tic-tac-toe") {
      const url = new URL("./tic-tac-toe.html", window.location.href);
      url.searchParams.set("game", gameId);
      url.searchParams.set("name", gameName || gameId);
      url.searchParams.set("room", room);
      url.searchParams.set("role", isHost ? "房主" : "成员");
      url.searchParams.set("ai", String(aiCount));
      startBtn.href = url.toString();
      startBtn.textContent = "进入井字棋";
      return;
    }
    if (gameId === "reaction") {
      const url = new URL("./reaction.html", window.location.href);
      url.searchParams.set("game", gameId);
      url.searchParams.set("name", gameName || gameId);
      url.searchParams.set("room", room);
      url.searchParams.set("role", isHost ? "房主" : "成员");
      startBtn.href = url.toString();
      startBtn.textContent = "进入反应测试";
      return;
    }
    if (gameId === "draw-guess") {
      const url = new URL("./draw-guess.html", window.location.href);
      url.searchParams.set("game", gameId);
      url.searchParams.set("name", gameName || gameId);
      url.searchParams.set("room", room);
      url.searchParams.set("role", isHost ? "房主" : "成员");
      startBtn.href = url.toString();
      startBtn.textContent = "进入你画我猜";
      return;
    }
    if (gameId === "flying-chess") {
      const url = new URL("./flying-chess.html", window.location.href);
      url.searchParams.set("game", gameId);
      url.searchParams.set("name", gameName || gameId);
      url.searchParams.set("room", room);
      url.searchParams.set("role", isHost ? "房主" : "成员");
      url.searchParams.set("ai", String(aiCount));
      startBtn.href = url.toString();
      startBtn.textContent = "进入飞行棋";
      return;
    }
    startBtn.href = "#";
    startBtn.textContent = "该游戏暂未实现";
  }

  function closeRoomTransport() {
    if (roomPing) window.clearInterval(roomPing);
    roomPing = 0;
    if (transport) transport.close();
    transport = null;
  }

  function renderLobby() {
    if (!lobbyBox || !memberList || !addAiBtn || !removeAiBtn || !hostStartBtn || !lobbyHint || !startBtn) return;

    lobbyBox.classList.remove("hidden");
    startBtn.classList.add("hidden");

    const humans = Array.from(members.values()).filter((m) => m.kind === "human");
    const total = humans.length + aiCount;
    const need = requiredPlayers();
    const cap = maxPlayers();

    memberList.replaceChildren(
      ...humans
        .slice()
        .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))
        .map((m) => {
          const span = document.createElement("span");
          span.className = "chip";
          const who = m.id === clientId ? String(m.name || "你") : String(m.name || "玩家");
          const hostTag = m.id === hostId ? "（房主）" : "";
          span.textContent = `${who}${hostTag}`;
          return span;
        }),
      ...Array.from({ length: aiCount }, (_, i) => {
        const span = document.createElement("span");
        span.className = "chip";
        span.textContent = `AI-${i + 1}`;
        return span;
      }),
    );

    const canAddAi = isHost && aiCount < maxAi() && total < cap;
    addAiBtn.classList.toggle("hidden", !canAddAi);
    if (canAddAi) addAiBtn.textContent = `添加一个AI（${aiCount}/${maxAi()}）`;

    const canRemoveAi = isHost && aiCount > 0;
    removeAiBtn.classList.toggle("hidden", !canRemoveAi);
    if (canRemoveAi) removeAiBtn.textContent = `减少一个AI（${aiCount}/${maxAi()}）`;

    const canRoomStart =
      gameId === "doudizhu" ||
      gameId === "mahjong" ||
      gameId === "tic-tac-toe" ||
      gameId === "reaction" ||
      gameId === "draw-guess" ||
      gameId === "flying-chess";
    hostStartBtn.classList.toggle("hidden", !isHost || !canRoomStart);
    hostStartBtn.disabled = total < need || !canRoomStart;

    if (isHost) {
      lobbyHint.textContent =
        !canRoomStart
          ? "该游戏暂未实现房间开始流程"
          : total < need
          ? `等待成员加入：当前 ${total}/${need}，可添加 AI 或等待其他人输入房间号加入。`
          : total < cap && maxAi() > 0
            ? `已满足开局人数（${need}人），可继续添加 AI（最多 ${cap} 人）或直接开始。`
            : `人数已满足 ${need} 人，点击“房主开始”进入游戏。`;
    } else {
      lobbyHint.textContent = `已加入房间：当前 ${total}/${need}，等待房主开始。`;
    }
  }

  function broadcastState() {
    if (!transport || !isHost || !currentRoom) return;
    transport.send({
      type: "state",
      gameId,
      room: currentRoom,
      hostId,
      aiCount,
      members: Array.from(members.values()),
    });
  }

  function onRoomMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.gameId !== gameId) return;
    if (String(msg.room || "") !== currentRoom) return;

    if (msg.type === "join") {
      const id = String(msg.clientId || "");
      const name = String(msg.name || "");
      if (!id) return;
      if (id === clientId) return;
      if (isHost) {
        if (!members.has(id)) members.set(id, { id, kind: "human", name });
        else {
          const prev = members.get(id);
          members.set(id, { ...prev, name: name || prev?.name || "" });
        }
        broadcastState();
        renderLobby();
      }
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
        next.set(id, { id, kind: "human", name });
      }
      next.set(clientId, { id: clientId, kind: "human", name: playerName });
      members = next;
      aiCount = Number(msg.aiCount || 0);
      if (!Number.isFinite(aiCount) || aiCount < 0) aiCount = 0;
      renderLobby();
      return;
    }

    if (msg.type === "start") {
      const from = String(msg.hostId || "");
      if (!from || from !== hostId) return;
      setStartLink(currentRoom);
      window.location.href = startBtn.href;
    }
  }

  function enterRoom(room, { preferredHostId = "" } = {}) {
    currentRoom = normalizeRoomCode(room);
    hostId = ensureHost(currentRoom, preferredHostId);
    isHost = hostId === clientId;
    members = new Map();
    members.set(clientId, { id: clientId, kind: "human", name: playerName });
    aiCount = 0;

    closeRoomTransport();
    transport = createRoomTransport(`${gameId}_${currentRoom}`, onRoomMessage);
    if (roomPing) window.clearInterval(roomPing);

    const joinMsg = { type: "join", gameId, room: currentRoom, clientId, name: playerName };
    transport.send(joinMsg);
    roomPing = window.setInterval(() => {
      if (!transport) return;
      transport.send(joinMsg);
      if (isHost) broadcastState();
    }, 1200);

    if (isHost) {
      broadcastState();
    } else {
      transport.send(joinMsg);
    }

    renderLobby();
  }

  if (addAiBtn) {
    addAiBtn.addEventListener("click", () => {
      if (!isHost) return;
      const need = requiredPlayers();
      const cap = maxPlayers();
      const humans = Array.from(members.values()).filter((m) => m.kind === "human").length;
      const total = humans + aiCount;
      if (aiCount >= maxAi() || total >= cap) return;
      aiCount += 1;
      broadcastState();
      renderLobby();
    });
  }

  if (removeAiBtn) {
    removeAiBtn.addEventListener("click", () => {
      if (!isHost) return;
      if (aiCount <= 0) return;
      aiCount -= 1;
      broadcastState();
      renderLobby();
    });
  }

  if (hostStartBtn) {
    hostStartBtn.addEventListener("click", () => {
      if (!isHost || !transport || !currentRoom || !startBtn) return;
      if (
        gameId !== "doudizhu" &&
        gameId !== "mahjong" &&
        gameId !== "tic-tac-toe" &&
        gameId !== "reaction" &&
        gameId !== "draw-guess" &&
        gameId !== "flying-chess"
      )
        return;
      const humans = Array.from(members.values()).filter((m) => m.kind === "human").length;
      const total = humans + aiCount;
      const need = requiredPlayers();
      if (total < need) {
        renderLobby();
        return;
      }
      setStartLink(currentRoom);
      transport.send({ type: "start", gameId, room: currentRoom, hostId });
      window.location.href = startBtn.href;
    });
  }

  const onJoin = () => {
    if (!(input instanceof HTMLInputElement)) return;
    const code = normalizeRoomCode(input.value);
    if (!isValidRoomCode(code)) {
      showResult({
        title: "房间号格式不正确",
        code: "--",
        hint: "请输入 3–10 位字母/数字，例如：A1B2C3",
      });
      return;
    }
    showResult({
      title: "已加入房间",
      code,
      hint: "在同一浏览器打开另一个标签页/窗口，输入相同房间号即可联机。",
    });
    enterRoom(code);
  };

  if (joinBtn) joinBtn.addEventListener("click", onJoin);
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") onJoin();
    });
  }

  if (createBtn) {
    createBtn.addEventListener("click", () => {
      const code = randomRoomCode(6);
      localStorage.setItem(hostKey(code), clientId);
      showResult({ title: "已创建房间", code, hint: "在同一浏览器打开另一个标签页/窗口，输入相同房间号加入；房主点击开始后进入游戏。" });
      enterRoom(code, { preferredHostId: clientId });
    });
  }
}

main();
