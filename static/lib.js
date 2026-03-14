export function getQueryParam(name) {
  const url = new URL(window.location.href);
  const value = url.searchParams.get(name);
  return value === null ? "" : value;
}

export function setPageTitle(title) {
  document.title = title;
}

export function randomRoomCode(length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function getOrCreateClientId() {
  const key = "xiaoyouxi_client_id";
  const exist = localStorage.getItem(key);
  if (exist) return exist;
  const bytes = new Uint32Array(4);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes)
    .map((n) => n.toString(16).padStart(8, "0"))
    .join("");
  localStorage.setItem(key, id);
  return id;
}

export function normalizePlayerName(name) {
  const n = String(name || "").trim().replace(/\s+/g, " ");
  if (!n) return "";
  if (n.length > 12) return n.slice(0, 12);
  return n;
}

export function getPlayerName() {
  const key = "xiaoyouxi_player_name";
  const raw = localStorage.getItem(key) || "";
  const n = normalizePlayerName(raw);
  if (n) return n;
  const id = getOrCreateClientId();
  return `玩家${id.slice(0, 4)}`;
}

export function setPlayerName(name) {
  const key = "xiaoyouxi_player_name";
  const n = normalizePlayerName(name);
  if (!n) {
    localStorage.removeItem(key);
    return getPlayerName();
  }
  localStorage.setItem(key, n);
  return n;
}

export function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

export function deterministicRoomCodeFromIds(idA, idB, length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a = String(idA);
  const b = String(idB);
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  let x = fnv1a32(key);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    x = (x * 1664525 + 1013904223) >>> 0;
    out += alphabet[x % alphabet.length];
  }
  return out;
}

export function normalizeRoomCode(code) {
  return code.trim().toUpperCase();
}

export function isValidRoomCode(code) {
  if (code.length < 3 || code.length > 10) return false;
  return /^[A-Z0-9]+$/.test(code);
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

export function redirect127ToLocalhost() {
  if (window.location.protocol !== "http:" && window.location.protocol !== "https:") return false;
  if (window.location.hostname !== "127.0.0.1") return false;
  const url = new URL(window.location.href);
  url.hostname = "localhost";
  window.location.replace(url.toString());
  return true;
}

export function getRelayUrl() {
  const fromQuery = getQueryParam("relay").trim();
  const raw = fromQuery || (localStorage.getItem("xiaoyouxi_relay_url") || "").trim();
  if (!raw) return "";
  if (raw.startsWith("ws://") || raw.startsWith("wss://")) return raw;
  if (raw.startsWith("http://")) return `ws://${raw.slice("http://".length)}`;
  if (raw.startsWith("https://")) return `wss://${raw.slice("https://".length)}`;
  return raw;
}

export function setRelayUrl(url) {
  const v = String(url || "").trim();
  if (!v) localStorage.removeItem("xiaoyouxi_relay_url");
  else localStorage.setItem("xiaoyouxi_relay_url", v);
  return getRelayUrl();
}
