"use strict";
/* Start-up and the shell: three tabs (My Portfolio · Trading Lab · How it works), the search box for funds and shares,
   the keys (optional: Alt+1–3 tabs, / search, Esc closes), clock, connection state, the alerts badge, the router. The app is dark only. */

/* ---------------------------------------------------------------- funds, for the search box (the catalogue) */
let FUNDS = [];
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const loadFunds = () => cached("compare", () => api("/api/explore/list"), 600_000).then((d) => { FUNDS = d.funds || []; return FUNDS; }).catch(() => FUNDS);

/* ---------------------------------------------------------------- navigation */
function zoned(tz, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", weekday: "short", day: "numeric", month: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { wd: p.weekday, hh: +p.hour, mm: +p.minute, hm: `${p.hour}:${p.minute}`, hms: `${p.hour}:${p.minute}:${p.second}`, date: `${p.weekday} ${p.day} ${MONTHS[+p.month - 1]} ${p.year}` };
}
function syncNav(page) {
  const nav = NAV.find((n) => n.id === page) || NAV[0];
  const ws = MODES[nav.mode].ws;
  document.body.dataset.ws = ws;
  document.body.dataset.page = nav.id;
  document.querySelectorAll("#tabs a").forEach((a) => a.setAttribute("aria-current", a.dataset.nav === nav.id ? "page" : "false"));
  const tag = $("sb-ws");
  if (tag) {
    tag.textContent = ws === "paper" ? "PAPER" : "REAL MONEY";
    tag.title = ws === "paper" ? "Trading Lab: pretend money only, nothing reaches Trade Republic" : "My Portfolio: your real Trade Republic holdings (read-only)";
  }
  const disc = $("foot-disc");                          // the one-line disclaimer; the full text is in How it works › Legal
  if (disc) disc.textContent = ws === "paper" ? "Paper money · educational · not investment advice" : "Your own portfolio · facts, not advice";
  CUR_CODE = nav.code;
  statusSource();
}
function buildNav() {
  $("bell").append(icon("bell", 16));
  $("drawer-close").append(icon("close", 16));
  const skip = $("skip-link");                        // "Skip to content": the hash router owns #…, so focus the page by hand
  if (skip) skip.addEventListener("click", (e) => { e.preventDefault(); $("page").focus(); });
}
function updateBadge(n) {
  const b = $("badge");
  if (b) { b.hidden = !n; b.textContent = n; }
  $("bell").setAttribute("aria-label", n ? `Briefing and alerts, ${n} new` : "Briefing and alerts");
}

/* ---------------------------------------------------------------- search: funds in the catalogue, then any share, ETF or
   ETC that Lang & Schwarz quotes. Enter or a click opens its card (the drawer). */
const Search = { items: [], sel: -1, timer: null };
const searchIn = $("search-in"), searchList = $("search-list");
function searchShow(on) {
  searchList.hidden = !on;
  searchIn.setAttribute("aria-expanded", String(on));
}
function searchRender() {
  let group = null;
  searchList.replaceChildren(...Search.items.flatMap((it, i) => {
    const out = [];
    if (it.group !== group) { group = it.group; out.push(h("div", { class: "search-g", role: "presentation" }, group)); }
    out.push(it.info ? h("div", { class: "search-info", role: "status" }, it.label)
      : h("div", { role: "option", id: `sr-${i}`, "aria-selected": String(i === Search.sel), onmousedown: (e) => e.preventDefault(), onclick: () => searchPick(i),
        onmousemove: () => { if (Search.sel !== i) { Search.sel = i; searchMark(); } } },
        h("span", { class: "code" }, it.code || ""), h("span", { class: "nm" }, it.label, it.hint ? h("small", {}, it.hint) : null), it.mine ? badge("Yours", "you") : h("span")));
    return out;
  }));
  searchMark();
  searchShow(Search.items.length > 0);
}
function searchMark() {
  searchList.querySelectorAll("[role=option]").forEach((r) => r.setAttribute("aria-selected", String(r.id === `sr-${Search.sel}`)));
  const cur = $(`sr-${Search.sel}`);
  searchIn.setAttribute("aria-activedescendant", cur ? cur.id : "");
  if (cur) cur.scrollIntoView({ block: "nearest" });
}
function searchPick(i) {
  const it = Search.items[i];
  if (!it || it.info) return;
  searchIn.value = "";
  searchShow(false);
  searchIn.blur();
  document.body.classList.remove("search-on");
  openInstrument(it.isin, it.name);
}
async function searchResults(q) {
  const ql = q.toLowerCase();
  if (!q) { Search.items = []; searchRender(); return; }
  if (!FUNDS.length) await loadFunds();
  if (searchIn.value.trim() !== q) return;                             // typed on meanwhile
  const funds = FUNDS.filter((f) => (f.milan_ticker || "").toLowerCase().startsWith(ql) || f.short_name.toLowerCase().includes(ql) || f.isin.toLowerCase().includes(ql)).slice(0, 8)
    .map((f) => ({ group: "Funds in the list", code: f.milan_ticker, label: f.short_name.replace(/ \([A-Z]+\)$/, ""), hint: f.isin, isin: f.isin, name: f.short_name, mine: f.owned }));
  const direct = ISIN_RE.test(q.toUpperCase()) && !funds.length ? [{ group: "ISIN", code: "ISIN", label: q.toUpperCase(), hint: "open its card", isin: q.toUpperCase(), name: q.toUpperCase() }] : [];
  Search.items = [...funds, ...direct];
  if (q.length >= 2) Search.items.push({ group: "Shares, ETFs and ETCs", info: true, label: `Searching Lang & Schwarz for “${q}”…` });
  Search.sel = Search.items.findIndex((x) => !x.info);
  searchRender();
  clearTimeout(Search.timer);
  if (q.length < 2) return;
  Search.timer = setTimeout(async () => {
    let more = [], note = null;
    try {
      const r = await api(`/api/search?q=${encodeURIComponent(q)}`);
      const seen = new Set(FUNDS.map((f) => f.isin));
      more = r.filter((x) => !seen.has(x.isin)).slice(0, 10).map((x) => ({ group: "Shares, ETFs and ETCs", code: (x.type || "").slice(0, 4).toUpperCase(), label: x.name, hint: x.isin, isin: x.isin, name: x.name }));
    } catch (e) { note = `The share search is not available now (${e.message}).`; }
    if (searchIn.value.trim() !== q) return;
    Search.items = [...Search.items.filter((x) => !x.info), ...more];
    if (note || !Search.items.length) Search.items.push({ group: "Shares, ETFs and ETCs", info: true, label: note || `Nothing found for “${q}”. Try a name, a ticker or an ISIN.` });
    if (Search.sel < 0 || !Search.items[Search.sel] || Search.items[Search.sel].info) Search.sel = Search.items.findIndex((x) => !x.info);
    searchRender();
  }, 260);
}
function searchStep(dir) {
  for (let i = Search.sel + dir; i >= 0 && i < Search.items.length; i += dir) if (!Search.items[i].info) { Search.sel = i; break; }
  searchMark();
}
function focusSearch() {
  document.body.classList.add("search-on");
  searchIn.focus();
  searchIn.select();
}
searchIn.addEventListener("input", () => searchResults(searchIn.value.trim()));
searchIn.addEventListener("focus", () => { if (!FUNDS.length) loadFunds(); if (Search.items.length && searchIn.value.trim()) searchShow(true); });
searchIn.addEventListener("blur", () => setTimeout(() => { searchShow(false); if (!searchIn.value) document.body.classList.remove("search-on"); }, 120));
searchIn.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); searchStep(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); searchStep(-1); }
  else if (e.key === "Enter") { e.preventDefault(); if (Search.sel >= 0) searchPick(Search.sel); }
  else if (e.key === "Escape") { searchIn.value = ""; Search.items = []; searchShow(false); searchIn.blur(); document.body.classList.remove("search-on"); }
});
$("search-toggle").addEventListener("click", () => { if (document.body.classList.contains("search-on")) { document.body.classList.remove("search-on"); searchIn.blur(); } else focusSearch(); });

/* ---------------------------------------------------------------- keys: nothing needs them; they only save a click */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeDrawer({ restore: true }); hideTip(); return; }
  if (e.altKey && !e.metaKey && !e.ctrlKey && /^Digit[1-3]$/.test(e.code || "")) { e.preventDefault(); Router.go(NAV[+e.code.slice(5) - 1].id); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
  if (e.key === "/" && !window.BussolaStatic) { e.preventDefault(); closeDrawer(); focusSearch(); }
});
$("drawer-close").addEventListener("click", () => closeDrawer({ restore: true }));
$("drawer").addEventListener("click", (e) => { if (e.target === $("drawer")) closeDrawer({ restore: true }); });

/* ---------------------------------------------------------------- clock (Rome) */
function tickClocks() {
  const ct = $("clock-t");                              // the public site shows the snapshot time there instead (lock.js)
  if (ct && !window.BussolaStatic) ct.textContent = zoned("Europe/Rome").hm;
}

/* ---------------------------------------------------------------- inbox badge + browser notifications */
let lastSeen = null;
async function pollInbox() {
  try {
    const box = await api("/api/inbox");
    updateBadge(box.filter((i) => !i.read).length);
    const newest = box[0] && box[0].id;
    if (lastSeen && newest && newest !== lastSeen && "Notification" in window && Notification.permission === "granted") new Notification(`SV Terminal · ${box[0].title}`, { body: box[0].body, icon: "icon.svg" });
    lastSeen = newest;
  } catch (_) { /* server restarting, or the locked public site */ }
}

/* ---------------------------------------------------------------- start */
buildNav();
api("/api/glossary").then((g) => { GLOSSARY = g; }).catch(() => {});
if (!window.BussolaStatic) pollInbox();
tickClocks();
renderLive();
setInterval(tickClocks, 10_000);
if (!window.BussolaStatic) setInterval(pollInbox, 60_000);
setInterval(renderLive, 5_000);
window.addEventListener("hashchange", () => Router.render());
Router.render();
if (!window.BussolaStatic) setTimeout(loadFunds, 4000);       // the catalogue for the search box
