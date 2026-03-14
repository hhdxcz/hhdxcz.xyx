import { getPlayerName, setPageTitle, setPlayerName } from "./lib.js";

const games = [
  { id: "doudizhu", name: "斗地主", desc: "经典三人纸牌对战：叫地主、出牌、先走完获胜。" },
  { id: "mahjong", name: "麻将", desc: "四人摸打对局：摸牌、打牌、胡牌（简化规则）。" },
  { id: "guess-number", name: "猜数字", desc: "你出题我来猜，适合语音/文字互动。" },
  { id: "rps", name: "石头剪刀布", desc: "经典对战，快速开局，输赢立判。" },
  { id: "reaction", name: "反应测试", desc: "比拼手速与反应，谁先点谁赢。" },
  { id: "tic-tac-toe", name: "井字棋", desc: "三连成线获胜，策略与运气并存。" },
  { id: "word-chain", name: "成语接龙", desc: "输入成语/词语，接龙比拼记忆力。" },
  { id: "draw-guess", name: "你画我猜", desc: "选题作画+倒计时，猜中加分，支持撤销与调色。" },
  { id: "flying-chess", name: "飞行棋", desc: "掷骰起飞，绕圈回家，撞机回基地，先到先赢。" },
];

function createGameCard(game) {
  const btn = document.createElement("button");
  btn.className = "card";
  btn.type = "button";
  btn.setAttribute("role", "listitem");
  btn.dataset.gameId = game.id;
  btn.dataset.gameName = game.name;
  btn.innerHTML = `
    <p class="cardTitle">${game.name}</p>
    <p class="cardDesc">${game.desc}</p>
  `.trim();
  btn.addEventListener("click", () => {
    const url = new URL("./room.html", window.location.href);
    url.searchParams.set("game", game.id);
    url.searchParams.set("name", game.name);
    window.location.href = url.toString();
  });
  return btn;
}

function main() {
  setPageTitle("小游戏大厅");
  const nameChip = document.getElementById("playerNameChip");
  const nameBtn = document.getElementById("nameBtn");
  const nameDialog = document.getElementById("nameDialog");
  const nameInput = document.getElementById("nameInput");
  const nameSaveBtn = document.getElementById("nameSaveBtn");
  const nameCancelBtn = document.getElementById("nameCancelBtn");
  if (nameChip) nameChip.textContent = `名字：${getPlayerName()}`;
  if (nameBtn) {
    nameBtn.addEventListener("click", () => {
      const current = getPlayerName();
      if (nameDialog instanceof HTMLDialogElement && nameInput instanceof HTMLInputElement) {
        nameInput.value = current;
        nameDialog.showModal();
        window.setTimeout(() => nameInput.focus(), 0);
        return;
      }
      const next = window.prompt("请输入名字（最多 12 个字）", current);
      if (next === null) return;
      const saved = setPlayerName(next);
      if (nameChip) nameChip.textContent = `名字：${saved}`;
    });
  }

  function saveName() {
    const current = getPlayerName();
    if (!(nameInput instanceof HTMLInputElement)) return current;
    const saved = setPlayerName(nameInput.value);
    if (nameChip) nameChip.textContent = `名字：${saved}`;
    return saved;
  }

  if (nameSaveBtn && nameDialog instanceof HTMLDialogElement) {
    nameSaveBtn.addEventListener("click", () => {
      saveName();
      nameDialog.close();
    });
  }

  if (nameCancelBtn && nameDialog instanceof HTMLDialogElement) {
    nameCancelBtn.addEventListener("click", () => nameDialog.close());
  }

  if (nameInput && nameDialog instanceof HTMLDialogElement) {
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        saveName();
        nameDialog.close();
      }
    });
  }
  const root = document.getElementById("games");
  if (!root) return;
  root.replaceChildren(...games.map(createGameCard));
}

main();
