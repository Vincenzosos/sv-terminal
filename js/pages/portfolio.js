"use strict";
/* My Portfolio (#/portfolio): your real Trade Republic savings, read-only. One page, most important first:
   (1) what it is worth, today's change, the gain since purchase, next to a reference fund; (2) the holdings: units,
   paid, worth now, gain, weight; (3) one chart against the reference fund; (4) "What if I switched everything to…" (the
   switch tracker, after tax); (5) costs and tax if everything were sold today; (6) the latest briefing and the alerts
   inbox; (7) updating the holdings (Trade Republic CSV or by hand); on this computer only, (8) price alerts and
   notification settings. Every number comes from /api/portfolio/*, /api/switch and /api/inbox (the server computes
   them); this file formats. The one exception is live re-pricing of what you hold (pfCashIfSold, the same formula as the
   server). Facts and arithmetic about what you hold, never advice. Colours come from tokens only. Short on purpose:
   numbers first, labels of 1-3 words; a needed explanation is a tooltip (title=) or a collapsed section. */

const PF_ISAC = "IE00B6R52259";                    // the reference fund of the chart (MSCI ACWI)
const PF_TXT = {
  PRICE_ONLY: "Prices only: Lang & Schwarz mid quotes in euros. Dividends are not added, so distributing funds look worse than they did.",
  WHAT_IF: "Today's holdings valued at past prices: not your own history (import your Trade Republic CSV for that).",
};
const PF = { base: null, ov: null, charts: [], els: {}, timers: [] };

/* ---------------------------------------------------------------- small helpers */
function pfPrefs() {
  try { return JSON.parse(localStorage.getItem("bussola-pf-prefs") || "{}") || {}; } catch (_) { return {}; }
}
function pfSave(patch) {
  const p = Object.assign(pfPrefs(), patch);
  try { localStorage.setItem("bussola-pf-prefs", JSON.stringify(p)); } catch (_) { /* private window: per-viewer convenience only */ }
  return p;
}
const pfP = (x, dp = 2) => (x == null || !Number.isFinite(x) ? "n/a" : sign(x, dp === 1 ? fmt.p1 : dp === 0 ? fmt.p0 : fmt.p2));
const pfE = (x) => sign(x, fmt.eur);
const pfU = (x) => (x == null || !Number.isFinite(x) ? "—" : unsigned(x, fmt.eur));
const pfN = (x) => (x == null || !Number.isFinite(x) ? "—" : unsigned(x, fmt.n2));
const pfOwner = () => !window.BussolaStatic;       // the app on this computer (the public site is read-only, even unlocked)
function pfChart(el, opts) { const c = makeChart(el, opts); if (c) PF.charts.push(c); return c; }

/* pure:cashIfSold */
/* Cash if you sold everything now: per position, sale value at the bid (cents), minus the tax on the gain (fund: 26% or the
   bond rate on value - units x cost without fees; ETC or share: 26% on value - fee - units x cost), minus EUR 1; plus cash.
   The same formula as portfolio_analytics.sale_tax; a test runs this function with node against the server. */
function pfCashIfSold(rows, bids, cash) {
  const c2 = (x) => Math.round(x * 100) / 100;
  let out = cash || 0, tax = 0, fees = 0, value = 0;
  for (const r of rows) {
    const p = bids[r.isin];
    if (p == null) continue;
    const S = c2(r.shares * p), C = c2(r.shares * r.tax_unit_cost);
    const G = r.kind === "etc" || r.kind === "share" ? c2(S - r.sale_fee - C) : c2(S - C);
    const T = c2((r.kind === "etc" || r.kind === "share" ? 0.26 : r.rate) * Math.max(0, G));
    value += S; tax += T; fees += r.sale_fee; out += c2(S - T - r.sale_fee);
  }
  return { cash: c2(out), tax: c2(tax), fees, value: c2(value) };
}
/* end pure */

/* live totals of what you hold (value at mid, today, gain, cash if sold at the bid) */
function pfLiveTotals(base) {
  let inv = 0, prev = 0, cost = 0;
  const bids = {};
  for (const p of base.positions) {
    inv += p.mid * p.shares; prev += (p.prev_close || p.mid) * p.shares; cost += p.cost;
    bids[p.isin] = p.bid;
  }
  const cif = pfCashIfSold(base.positions.map((p) => ({ isin: p.isin, shares: p.shares, tax_unit_cost: p.tax_unit_cost, kind: p.kind, rate: p.tax_rate.high, sale_fee: p.sale_fee })), bids, base.cash);
  return { inv, total: inv + base.cash, day: inv - prev, dayPct: prev ? inv / prev - 1 : null, gain: inv - cost, gainPct: cost ? inv / cost - 1 : null, cif };
}

/* ---------------------------------------------------------------- the page */
Pages.portfolio = {
  title: "My Portfolio",
  async render(el, params) {
    PF.els = {};
    const upd = pfOwner() ? h("button", { class: "btn", type: "button", onclick: () => pfImport() }, icon("upload", 14), "Update holdings") : null;
    el.append(pageHead(["My Portfolio", h("span", { id: "pf-small" }, "Trade Republic · read-only")], null, upd));
    const wait = h("div", {}, skeleton(150), skeleton(260));
    el.append(wait);
    let base, ov;
    try { [base, ov] = await Promise.all([api("/api/portfolio/holdings"), api("/api/portfolio/overview").catch(() => null)]); }
    catch (e) { wait.replaceWith(section("now", null, framed(`Your holdings could not load: ${e.message}`))); return; }
    if (Router.current !== "portfolio") return;
    PF.base = base; PF.ov = ov;
    wait.remove();
    const n = base.positions.length;
    const small = $("pf-small");
    if (small) small.textContent = `Trade Republic · ${n} ${n === 1 ? "holding" : "holdings"} · read-only`;
    if (!n) {
      el.append(section("now", "Your portfolio", framed("No holdings yet.", "Import your Trade Republic CSV or type your holdings by hand."),
        { tools: pfOwner() ? h("button", { class: "btn primary", type: "button", onclick: () => pfImport() }, "Import or type holdings") : null }));
      if (pfOwner()) el.append(pfUpdateSection(base));
      revealSection(params);
      return;
    }
    Live.want("page", base.positions.map((p) => p.isin));
    el.append(pfNow(base, ov), pfHoldings(base), pfPerfSection(base), pfSwitchSection(params), pfTaxSection(base), pfInboxSection());
    if (pfOwner()) el.append(pfUpdateSection(base), pfAlertsSection(params));
    statusSource();
    if ($("sb-src")) $("sb-src").title = `Holdings: ${base.source || "portfolio file"} · quotes: Lang & Schwarz, indicative`;
    revealSection(params);
  },
  onQuote(key, q, prev) {
    const base = PF.base;
    if (!base) return;
    const p = base.positions.find((x) => x.isin === key);
    if (!p) return;
    const dir = Live.dir(q, prev);
    p.mid = q.mid;
    if (q.bid) p.bid = q.bid; else p.bid = q.mid * (1 - 0.0005);
    const t = pfLiveTotals(base);
    if (PF.els.total) { PF.els.total.replaceChildren(...[].concat(eurFig(t.total))); flash(PF.els.total, dir); }
    if (PF.els.today) PF.els.today.replaceChildren(delta(t.day, null));
    if (PF.els.todayP) { PF.els.todayP.textContent = pfP(t.dayPct); PF.els.todayP.className = tone(t.dayPct); }
    if (PF.els.gain) PF.els.gain.replaceChildren(delta(t.gain, null));
    if (PF.els.gainP) { PF.els.gainP.textContent = pfP(t.gainPct); PF.els.gainP.className = tone(t.gainPct); }
    const row = document.querySelector(`.pf-hold tr[data-isin="${key}"]`);
    if (row) {
      const value = q.mid * p.shares, gain = value - p.cost;
      const set = (f, node) => { const c = row.querySelector(`[data-f="${f}"]`); if (c) c.replaceChildren(node); };
      set("value", pfN(value));
      set("gaine", signed(gain, fmt.n2));
      set("gainp", signed(gain / p.cost, fmt.p2));
    }
  },
  leave() {
    PF.timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
    PF.timers = [];
    PF.charts.forEach((c) => dropChart(c));
    PF.charts = [];
    hideTip();
  },
};

/* ================================================================ 1 · what it is worth */
function pfNow(base, ov) {
  const T = base.totals || {}, k = (ov || {}).kpi || {};
  const total = T.total_mid ?? (T.value_mid + base.cash);
  const yb = k.ytd_bench || {};
  PF.els.total = h("span", {}, eurFig(total));
  PF.els.today = h("span", {}, delta(T.day_eur, null));
  PF.els.todayP = h("span", { class: tone(T.day_pct) }, pfP(T.day_pct));
  PF.els.gain = h("span", {}, delta(T.gain_eur, null));
  PF.els.gainP = h("span", { class: tone(T.gain_pct) }, pfP(T.gain_pct));
  const tip = (label, text) => h("span", { title: text }, label);
  return section("now", null, [
    h("div", { class: "tiles" },
      h("div", { class: "tile hero" }, h("div", { class: "l" }, tip("Total value", "Holdings at the Lang & Schwarz mid, plus cash.")), h("div", { class: "v" }, PF.els.total)),
      h("div", { class: "tile" }, h("div", { class: "l" }, tip("Today", k.prev_session ? `Change since the ${dayShort(k.prev_session)} close.` : "Change since the last close.")), h("div", { class: "v sm" }, PF.els.today), h("div", { class: "d" }, PF.els.todayP)),
      h("div", { class: "tile" }, h("div", { class: "l" }, tip("Gain", `Value now against what you paid (${pfU(T.cost)}).${k.hand_entered ? " The average prices were typed from the Trade Republic app; importing the CSV makes the gain and the tax exact." : ""}`)),
        h("div", { class: "v sm" }, PF.els.gain), h("div", { class: "d" }, PF.els.gainP)),
      h("div", { class: "tile" }, h("div", { class: "l" }, tip("This year", "Price change of today's holdings since 31 December, next to a world index fund over the same days. Prices only.")),
        h("div", { class: "v sm" }, k.ytd_pct != null ? signed(k.ytd_pct, fmt.p1) : "—"),
        h("div", { class: "d muted" }, yb.pct != null ? [`${(yb.label || "reference").replace(/ \(.*\)$/, "")} `, signed(yb.pct, fmt.p1)] : null)))]);
}

/* ================================================================ 2 · holdings */
function pfHoldings(base) {
  const T = base.totals || {};
  const rows = base.positions.map((p) => ({ ...p, short: (p.name || "").replace(/ \([A-Z0-9]+\)$/, "") }));
  const tbl = table({ cls: "pf-hold", stack: true, caption: "Holdings",
    cols: [
      { key: "name", label: "Holding", lead: true, fmt: (p) => h("span", { class: "pf-nm" }, p.ticker ? h("span", { class: "tick" }, p.ticker) : null, h("span", { class: "nm" }, p.short)) },
      { key: "shares", label: "Units", num: true, fmt: (p) => fmt.n4.format(p.shares) },
      { key: "cost", label: "Paid €", num: true, fmt: (p) => pfN(p.cost) },
      { key: "value", label: "Value now €", sl: "Now €", num: true, fmt: (p) => h("span", { "data-f": "value" }, pfN(p.value_mid)) },
      { key: "gaine", label: "Gain €", num: true, fmt: (p) => h("span", { "data-f": "gaine" }, signed(p.gain_eur, fmt.n2)) },
      { key: "gainp", label: "Gain %", num: true, fmt: (p) => h("span", { "data-f": "gainp" }, signed(p.gain_pct, fmt.p2)) },
      { key: "weight", label: "Weight", num: true, fmt: (p) => fmt.p1.format(p.weight) }],
    rows, onrow: (p) => openInstrument(p.isin, p.name),
    foot: { name: "Cash", value: pfN(base.cash), weight: T.total_mid ? fmt.p1.format(base.cash / T.total_mid) : "" } });
  tbl.querySelectorAll("tbody tr").forEach((tr, i) => { tr.dataset.isin = rows[i].isin; });
  return section("holdings", "Holdings", tbl, { hint: `Paid = units × your average price. Value now at the Lang & Schwarz mid. ${base.source ? `Holdings from: ${base.source}.` : ""} Click a row for its card.` });
}

/* ================================================================ 3 · one chart against the reference fund */
function pfPerfSection(base) {
  const prefs = pfPrefs();
  let rng = ["1m", "ytd", "1y", "5y", "max"].includes(prefs.perfRange) ? prefs.perfRange : "1y";
  const box = h("div", { class: "chart" }), leg = h("div", { class: "legend" });
  const tools = seg([["1m", "1M"], ["ytd", "YTD"], ["1y", "1Y"], ["5y", "5Y"], ["max", "Max"]], rng, (r) => { rng = r; pfSave({ perfRange: r }); draw(); }, "Period");
  const sec = section("performance", "Value over time", [leg, box], { tools, hint: `${PF_TXT.WHAT_IF} ${PF_TXT.PRICE_ONLY} The grey line is a world index fund started with the same value: for comparison, not a suggestion.` });
  async function draw() {
    const ok = guard("pf-perf");
    box.style.opacity = 0.5;
    let s;
    try { s = await api(`/api/portfolio/series?range=${rng}&bench=${PF_ISAC}`); }
    catch (e) { if (ok()) { box.style.opacity = 1; box.replaceChildren(framed(`The chart could not load: ${e.message}`)); } return; }
    if (!ok()) return;
    box.style.opacity = 1;
    if (!s.dates || s.dates.length < 2) { box.replaceChildren(framed("Not enough price history for this period yet.")); return; }
    const c = pfChart(box, { digits: 0 });
    if (!c) return;
    const you = c.addAreaSeries(SERIES.you());
    you.setData(s.dates.map((t, i) => ({ time: t, value: s.total[i] })));
    let b = null;
    if (s.bench) { b = c.addLineSeries(SERIES.bench(1)); b.setData(s.dates.map((t, i) => (s.bench.rebased[i] == null ? null : { time: t, value: s.bench.rebased[i] })).filter(Boolean)); }
    c.timeScale().fitContent();
    crosshairTip(c, box, [{ series: you, label: "You", c: "var(--s1)", fmt: (v) => fmt.eur.format(v) }].concat(b ? [{ series: b, label: s.bench.label, c: "var(--bench-1)", fmt: (v) => fmt.eur.format(v) }] : []));
    const last = s.total[s.total.length - 1], first = s.total[0];
    leg.replaceChildren(...legend([{ c: "var(--s1)", label: "You", value: first ? pfP(last / first - 1, 1) : null, style: "area" },
      b ? { c: "var(--bench-1)", label: s.bench.label.replace(/ \(.*\)$/, ""), value: pfP(s.bench.pct, 1), style: "dash" } : null].filter(Boolean)).childNodes);
  }
  setTimeout(draw, 0);
  return sec;
}

/* ================================================================ 4 · what if I switched everything to… (the switch tracker) */
function pfSwitchSection(params) {
  const body = h("div", {}, skeleton(160));
  const sec = section("switch", "Switch instead", body);
  (async () => {
    let v;
    try { v = await cached("pf-switch", () => api("/api/switch"), 120_000); }
    catch (e) { body.replaceChildren(framed(`The switch tracker is not available: ${e.message}`)); return; }
    if (Router.current !== "portfolio") return;
    pfSwitchDraw(body, v, params.get("pick"));
  })();
  return sec;
}
function pfSwitchDraw(body, v, want) {
  if (v.status !== "ok") {
    const can = pfOwner() && v.can_start && v.status !== "error";
    body.replaceChildren(framed(v.status === "error" ? "The switch tracker stopped: its snapshot failed its check." : "The switch tracker has not started yet.",
      v.status === "error" ? (v.error || "") : ""),
    can ? h("div", { class: "actions" }, h("button", { class: "btn primary", type: "button", onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = "Taking today's snapshot (20–40 s)…";
      try { await post("/api/switch/start", {}); invalidate("pf-switch"); Router.render(); } catch (x) { b.disabled = false; b.textContent = "Start"; toast(x.message); }
    } }, "Start")) : null);
    return;
  }
  const rows = v.rows || [];
  const byIsin = new Map(rows.map((r) => [r.isin, r]));
  const prefs = pfPrefs();
  const refIsin = (rows.find((r) => r.code === (v.t0 || {}).ref_code) || {}).isin;
  let picks = (Array.isArray(prefs.switchPicks) ? prefs.switchPicks : [refIsin]).filter((i) => byIsin.has(i));
  if (want && byIsin.has(want) && !picks.includes(want)) picks = [want, ...picks].slice(0, 6);
  if (!picks.length && refIsin) picks = [refIsin];
  let showAll = false;
  const since = `${day(v.start.day)}`;
  const tableBox = h("div", { class: "vstack" });
  const input = h("input", { class: "inp", type: "search", placeholder: `Add a fund, e.g. ${rows.slice(0, 2).map((r) => r.code).join(", ")}`, "aria-label": "Add a fund to compare", list: "pf-sw-list", autocomplete: "off" });
  const dl = h("datalist", { id: "pf-sw-list" }, rows.map((r) => h("option", { value: `${r.code} · ${r.name}` })));
  const addPick = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) return;
    const r = rows.find((x) => `${x.code} · ${x.name}`.toLowerCase() === q) || rows.find((x) => x.code.toLowerCase() === q.split(" ")[0]) || rows.find((x) => x.name.toLowerCase().includes(q) || x.isin.toLowerCase() === q);
    if (!r) { toast("SWCH", `No tracked fund matches “${input.value.trim()}”.`); return; }
    if (!picks.includes(r.isin)) picks = [...picks, r.isin].slice(-6);
    pfSave({ switchPicks: picks });
    input.value = "";
    draw();
  };
  input.addEventListener("change", addPick);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addPick(); } });
  const stay = v.stay || {};
  const cols = [
    { key: "name", label: "Switch to", lead: true, fmt: (r) => h("span", { class: "pf-nm" }, h("span", { class: "tick" }, r.code), h("span", { class: "nm" }, r.name)) },
    { key: "net", label: "After tax €", num: true, fmt: (r) => pfN(r.net) },
    { key: "delta", label: "Vs staying €", num: true, fmt: (r) => signed(r.delta, fmt.n2) },
    { key: "delta_pct", label: "%", num: true, fmt: (r) => signed(r.delta_pct, fmt.p2) },
    { key: "x", label: "", fmt: (r) => (showAll ? "" : h("button", { class: "x", type: "button", "aria-label": `Remove ${r.code}`, onclick: (e) => { e.stopPropagation(); picks = picks.filter((i) => i !== r.isin); pfSave({ switchPicks: picks }); draw(); } }, "×")) }];
  function draw() {
    const list = showAll ? [...rows].sort((a, b) => (b.delta ?? -1e9) - (a.delta ?? -1e9)) : picks.map((i) => byIsin.get(i)).filter(Boolean);
    tableBox.replaceChildren(list.length ? table({ cls: "pf-switch", stack: true, caption: "Switch paths", rows: list, cols, rowCls: (r) => (r.isin === want ? "sel" : null) })
      : framed("No fund picked."),
    h("div", { class: "lab-more-b" }, h("button", { class: "btn sm ghost", type: "button", onclick: () => { showAll = !showAll; draw(); } }, showAll ? "My picks only" : `All ${rows.length} funds`),
      h("span", { class: "muted", style: "margin-left:12px" }, `${v.counts.ahead} of ${v.counts.tracked} ahead of staying`)));
  }
  draw();
  body.replaceChildren(
    h("div", { class: "pf-sw-stay" },
      h("div", {}, h("div", { class: "l", title: `What you would have in cash tonight after tax and fees (holdings worth ${pfU(stay.mv)}).` }, "Staying, after tax"), h("div", { class: "v" }, eurFig(stay.net))),
      h("div", {}, h("div", { class: "l", title: `The tax paid on ${dayShort(v.start.day)} (${pfU((v.t0 || {}).tax)}), fees and spreads, at equal returns.` }, "Switching costs"), h("div", { class: "v" }, h("span", { class: tone((v.rebuy || {}).timing) }, eurFig((v.rebuy || {}).timing, { signed: true }))))),
    h("div", { class: "pf-sw-add" }, input, dl, h("button", { class: "btn sm", type: "button", onclick: addPick }, "Add")),
    tableBox);
  body.className = "vstack";
  const hd = body.closest(".sec") && body.closest(".sec").querySelector("h2");
  if (hd) hd.title = `Paper arithmetic, nothing is traded: each path sold everything on ${since} (paying the tax and fees then) and bought one other fund. `
    + `Every path is valued as the cash left tonight after tax and fees, the fair comparison. ${v.rules_foot || ""}`;
  if (want) setTimeout(() => { const tr = body.querySelector("tr.sel"); if (tr) tr.scrollIntoView({ block: "center" }); }, 80);
}

/* ================================================================ 5 · costs and tax if sold today */
function pfTaxSection(base) {
  const body = h("div", {}, skeleton(120));
  const sec = section("costs", "Tax if sold today", body, { hint: "Arithmetic under the current Italian rules (regime amministrato: Trade Republic withholds the tax at the sale). Not a tax return." });
  (async () => {
    let tx, co;
    try { [tx, co] = await Promise.all([api("/api/portfolio/tax"), api("/api/portfolio/costs").catch(() => null)]); }
    catch (e) { body.replaceChildren(framed(`Not available: ${e.message}`)); return; }
    if (Router.current !== "portfolio") return;
    const t = tx.totals || {}, k = (co || {}).kpi || {}, sd = k.stamp_duty || {};
    const more = [
      ["Fund fees a year", k.fund_fees_year != null ? pfU(k.fund_fees_year) : "—", `TER ${fmt.p2.format(k.ter_weighted || 0)}, already inside the price.`],
      ["Stamp duty a year", sd.flag === "stamp_conflict" ? `€0 or ${pfU(sd.per_law)}` : pfU(sd.per_tr ?? sd.per_law), sd.flag === "stamp_conflict" ? "The law says 0.2%, Trade Republic's help page says none." : null],
      t.loss_credit_created ? ["Loss credit", pfU(t.loss_credit_created), `From the fee; usable until ${day(t.credit_expires)}.`] : null,
      ["Per €100 held", t.per_100 ? `€${fmt.n2.format(t.per_100.cash)} cash · €${fmt.n2.format(t.per_100.tax)} tax · €${fmt.n2.format(t.per_100.fees)} fees` : "—", null]].filter(Boolean);
    body.replaceChildren(h("div", { class: "pf-tax" },
      ledger([
        { label: "Holdings at bid", value: pfU(t.sale_value) },
        { op: "−", label: "Order fees", value: pfU(t.fees) },
        { op: "−", label: `Tax (${fmt.p0.format((tx.rules || {}).rate || 0.26)})`, value: pfU(t.tax) },
        { op: "+", label: "Cash", value: pfU(t.cash_included) },
        { op: "=", label: "Cash if sold", value: pfU(t.cash_if_sold), cls: "result" }]),
      h("dl", { class: "kv kv-read" }, more.map(([l, v, tp]) => [h("dt", { title: tp }, l), h("dd", {}, v)]))));
    body.className = "vstack";
  })();
  return sec;
}

/* ================================================================ 6 · briefing and alerts inbox */
function pfInboxSection() {
  const body = h("div", {}, skeleton(120));
  const sec = section("alerts", "Briefing and alerts", body, { fold: true });
  (async () => {
    let box;
    try { box = await api("/api/inbox"); }
    catch (e) { body.replaceChildren(framed(`The inbox is not available: ${e.message}`)); return; }
    if (Router.current !== "portfolio") return;
    const brief = box.find((i) => i.kind === "briefing" && i.briefing);
    const others = box.filter((i) => i !== brief);
    const unread = box.filter((i) => !i.read).length;
    const hd = sec.querySelector("summary h2");
    if (hd) hd.append(h("span", { class: "muted" }, unread ? ` · ${unread} new` : ""));
    const item = (i) => h("article", { class: `inbox-item${i.read ? "" : " unread"}` }, h("header", {}, h("b", {}, i.title), h("time", { datetime: i.at }, ago(i.at))), h("p", {}, prose(i.body)));
    body.replaceChildren(h("div", { class: "pf-inbox" },
      h("div", {}, h("div", { class: "lab-sub" }, "Latest briefing"),
        brief ? [item(brief), h("details", { class: "pf-brief" }, h("summary", {}, "The briefing"), briefingView(brief.briefing))]
          : framed("No briefing yet.")),
      h("div", {}, h("div", { class: "lab-sub" }, "Alerts"),
        others.length ? U_more(others, 4, (l) => h("div", { class: "pf-items" }, l.map(item)), "items") : framed("No alerts yet."))));
    if (pfOwner() && box.some((i) => !i.read)) post("/api/inbox/read", {}).then(() => updateBadge(0)).catch(() => {});
  })();
  return sec;
}
const U_more = (items, n, draw, noun) => LabUI.showAll(items, n, draw, noun);
function briefingView(b) {
  const p = b.portfolio || {};
  return h("div", { class: "brief" },
    h("h4", {}, "Your portfolio"),
    h("ul", {}, h("li", {}, `Total ${fmt.eur.format(p.total)}; today `, money(p.day_change), ` (${sign(p.day_change_pct, fmt.p2)}); since you bought `, money(p.gain, fmt.eur0), ` (${sign(p.gain_pct, fmt.p1)}).`),
      (p.positions || []).map((x) => h("li", {}, `${x.name}: `, pctEl(x.day_change_pct, fmt.p2), " today"))),
    b.markets && b.markets.length ? [h("h4", {}, "Markets"), h("ul", {}, b.markets.filter((m) => m.price && m.prev_close && m.group !== "index-proxy").map((m) =>
      h("li", {}, `${m.name}: ${fmt.n2.format(m.price)} `, pctEl(m.price / m.prev_close - 1, fmt.p2))))] : null,
    b.model ? [h("h4", {}, "Trading Lab (paper)"), h("p", {}, prose(b.model), " ", h("a", { href: "#/lab" }, "Open the Trading Lab"))] : null,
    b.rules && b.rules.length ? [h("h4", {}, "Rules met today"), h("ul", {}, b.rules.map((r) => h("li", {}, `${r.description} (${r.state.measured})`)))] : null,
    b.headlines && b.headlines.length ? [h("h4", {}, "In the news about what you hold"), h("ul", {}, b.headlines.map((n) => h("li", {}, h("a", { href: n.url, target: "_blank", rel: "noopener" }, n.title),
      h("span", { class: "muted small" }, ` — ${n.source}, ${ago(n.published)}`))))] : null,
    b.central_banks && b.central_banks.length ? [h("h4", {}, "Central banks"), h("ul", {}, b.central_banks.map((n) => h("li", {}, h("a", { href: n.url, target: "_blank", rel: "noopener" }, n.title), h("span", { class: "muted small" }, ` — ${n.source}`))))] : null,
    h("p", { class: "note" }, "Facts only."));
}

/* ================================================================ 7 · update holdings (this computer only): the button in the page head, and a collapsed section */
function pfUpdateSection(base) {
  const led = base.ledger || {};
  return section("update", "Update holdings", h("div", { class: "pf-upd" },
    h("p", {}, led.available ? `Last CSV: ${led.source || "imported"}${led.to ? `, rows up to ${day(led.to)}` : ""}` : `No CSV imported yet: ${base.source || "holdings from the portfolio file"}`),
    h("button", { class: "btn", type: "button", onclick: () => pfImport() }, icon("upload", 14), "Import a CSV or type holdings")),
  { fold: true, hint: "The file is read on this computer and saved only when you press Save. SV Terminal never asks for your Trade Republic PIN." });
}
/* the import, in the drawer: drop the CSV → what it found → check the table → Save. Or type the holdings by hand. */
async function pfImport() {
  const base = PF.base || await api("/api/portfolio/holdings");
  let notes = { trade_republic: { steps: [] } };
  try { notes = await cached("notes", () => api("/api/notes"), 3600_000); } catch (_) { /* steps are optional */ }
  const input = h("input", { type: "file", accept: ".csv,text/csv", "aria-label": "Choose your CSV export" });
  const drop = h("label", { class: "drop" }, input, icon("upload", 22), h("strong", {}, "Drop your Trade Republic CSV here"), h("span", {}, "or click to choose it."));
  const found = h("div"), edit = h("div"), msg = h("p", { class: "error" });
  let csvText = null, fname = null, confirm = ((base.ledger || {}).confirmed_pairs || []).map((x) => x.join("|"));
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) read(f); });
  input.addEventListener("change", () => { const f = input.files[0]; if (f) read(f); input.value = ""; });
  async function read(file) { msg.textContent = ""; csvText = await file.text(); fname = file.name; preview(); }
  async function preview() {
    const ok = guard("pf-preview");
    let p;
    try { p = await post("/api/portfolio/ledger/preview", { csv: csvText, filename: fname, confirm_pairs: confirm.map((x) => x.split("|")) }); }
    catch (e) { if (ok()) msg.textContent = `Could not read the file: ${e.message}`; return; }
    if (!ok()) return;
    const ask = p.pairs.filter((x) => x.status === "needs_confirmation");
    found.replaceChildren(h("dl", { class: "kv kv-read" },
      h("dt", {}, "Rows"), h("dd", {}, `${fmt.n0.format(p.rows)}, ${day(p.from)} to ${day(p.to)}`),
      h("dt", {}, "Not counted"), h("dd", {}, p.uncounted ? `${p.uncounted} rows (unrecognised or not confirmed)` : "none: every row counted"),
      h("dt", {}, "Match what is saved"), h("dd", {}, p.reconcile.every((r) => r.match) ? "yes" : `${p.reconcile.filter((r) => !r.match).length} holdings differ`),
      h("dt", {}, "Cash from the file"), h("dd", {}, `${fmt.eur.format(p.cash)} (saved now ${fmt.eur.format(p.cash_saved)})`)),
    ask.length ? [h("p", { class: "note" }, "Trade Republic does not document these row types. Tick the ones to count:"),
      ask.map((x) => h("label", { class: "pf-inline" }, h("input", { type: "checkbox", checked: confirm.includes(`${x.category}|${x.type}`) ? true : null, onchange: (e) => {
        const key = `${x.category}|${x.type}`; confirm = e.target.checked ? [...confirm, key] : confirm.filter((c) => c !== key); preview(); } }),
        ` ${x.category} · ${x.type}: ${x.count} rows, count as ${x.kind === "buy" ? "purchases" : "dividends"}`))] : null);
    editor(p);
  }
  function editor(p) {
    const src = p ? p.positions.map((x) => ({ isin: x.isin, name: x.name, shares: x.shares, avg_price: x.avg_cost_with_fees })) : base.positions.map((x) => ({ isin: x.isin, name: x.name, shares: x.shares, avg_price: x.avg_cost }));
    const tb = h("tbody");
    const add = (x = {}) => {
      const tr = h("tr", {},
        h("td", {}, h("input", { class: "inp", value: x.name || "", "aria-label": "Name", "data-k": "name" })),
        h("td", {}, h("input", { class: "inp", value: x.isin || "", "aria-label": "ISIN", "data-k": "isin", maxlength: "12" })),
        h("td", { class: "num" }, h("input", { class: "inp pf-num", type: "number", step: "any", min: "0", value: x.shares ?? "", "aria-label": "Units", "data-k": "shares" })),
        h("td", { class: "num" }, h("input", { class: "inp pf-num", type: "number", step: "any", min: "0", value: x.avg_price ?? "", "aria-label": "Average price", "data-k": "avg_price" })),
        h("td", {}, h("button", { type: "button", class: "x", "aria-label": "Remove row", onclick: () => tr.remove() }, "×")));
      tb.append(tr);
    };
    src.forEach(add);
    const cash = h("input", { class: "inp pf-num", type: "number", step: "0.01", value: p ? p.cash : base.cash, "aria-label": "Cash" });
    const err = h("p", { class: "error" });
    edit.replaceChildren(h("div", { class: "section-l" }, p ? "Check and save" : "Type your holdings"),
      h("p", { class: "note" }, p ? "The average price below includes buy fees, as the Trade Republic app may show it; the tax uses the average without fees from the file." : "Check the units and average prices against the Trade Republic app before saving."),
      h("div", { class: "table-wrap" }, h("table", { class: "table compact pf-edit" }, h("thead", {}, h("tr", {}, h("th", {}, "Name"), h("th", {}, "ISIN"), h("th", { class: "num" }, "Units"), h("th", { class: "num" }, "Avg price €"), h("th", {}))), tb)),
      h("div", { class: "pf-row" }, h("button", { type: "button", class: "btn ghost sm", onclick: () => add() }, "+ Add a holding"), h("label", { class: "pf-field" }, "Cash €", cash)),
      p && p.incomplete ? h("p", { class: "callout" }, `Your own return will be marked incomplete: ${p.uncounted} rows are not counted.`) : null,
      h("div", { class: "pf-row" }, h("button", { class: "btn primary", type: "button", onclick: save }, "Save")), err);
    async function save() {
      const positions = [];
      for (const tr of tb.rows) {
        const o = {};
        tr.querySelectorAll("input").forEach((i) => { o[i.dataset.k] = i.value.trim(); });
        if (!o.isin && !o.shares && !o.avg_price) continue;
        if (!o.shares || !o.avg_price) { err.textContent = `${o.name || o.isin || "A row"}: fill in units and average price.`; return; }
        positions.push({ isin: o.isin.toUpperCase(), name: o.name, shares: +o.shares, avg_price: +o.avg_price });
      }
      try {
        if (p) await post("/api/portfolio/ledger/save", { csv: csvText, filename: fname, positions, cash: parseFloat(cash.value) || 0, confirm_pairs: confirm.map((x) => x.split("|")) });
        else await post("/api/portfolio", { positions, cash: parseFloat(cash.value) || 0, source: "entered by hand", warnings: [] });
        toast("PF", "Holdings saved");
        invalidate("pf-isins", "pf-switch");
        closeDrawer();
        Router.render();
      } catch (e) { err.textContent = `Not saved: ${e.message}`; }
    }
  }
  editor(null);
  openDrawer({ code: "CSV", title: "Update holdings", body: [
    h("p", { class: "lede" }, prose(notes.trade_republic.intro || "Export your transactions from Trade Republic as a CSV and drop the file here.")),
    (notes.trade_republic.steps || []).length ? h("ol", { class: "steps" }, notes.trade_republic.steps.map((s) => h("li", {}, s))) : null,
    drop, msg, found, edit,
    h("p", { class: "note" }, "The file stays on this computer. SV Terminal never asks for your Trade Republic PIN.")] });
}

/* ================================================================ 8 · price alerts and notifications (this computer only) */
function pfAlertsSection(params) {
  const body = h("div", {}, skeleton(120));
  const sec = section("settings", "Price alerts", body, { fold: true, hint: "On this computer only. Rules are checked every 5 minutes while Lang & Schwarz quotes; each notifies once a day at most." });
  (async () => {
    let rl, s;
    try { [rl, s] = await Promise.all([api("/api/rules"), api("/api/settings")]); }
    catch (e) { body.replaceChildren(framed(`Not available: ${e.message}`)); return; }
    if (Router.current !== "portfolio") return;
    const insts = new Map();
    if (params.get("isin")) insts.set(params.get("isin"), params.get("name") || params.get("isin"));
    (PF.base ? PF.base.positions : []).forEach((p) => insts.set(p.isin, p.name));
    FUNDS.forEach((f) => { if (!insts.has(f.isin)) insts.set(f.isin, f.short_name); });
    const typeSel = h("select", { name: "type", class: "inp", "aria-label": "When" }, Object.entries(rl.types || {}).map(([k, v]) => h("option", { value: k }, v)));
    const isinSel = h("select", { name: "isin", class: "inp", "aria-label": "Instrument" }, [...insts].map(([k, v]) => h("option", { value: k }, v)));
    const value = h("input", { name: "value", type: "number", step: "any", class: "inp", "aria-label": "Level" });
    const valueLabel = h("span", {}, "Level (€)");
    const fields = () => { valueLabel.textContent = typeSel.value.startsWith("price_") ? "Level (€)" : "Percentage (%)"; };
    typeSel.addEventListener("change", fields);
    if (params.get("isin")) { typeSel.value = "drop_from_high"; isinSel.value = params.get("isin"); }
    fields();
    const err = h("p", { class: "error" });
    const form = h("form", { autocomplete: "off", class: "pf-ruleform" }, h("label", { class: "field" }, h("span", {}, "When"), typeSel),
      h("label", { class: "field" }, h("span", {}, "Instrument"), isinSel), h("label", { class: "field" }, valueLabel, value),
      h("button", { class: "btn", type: "submit" }, "Add rule"));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form).entries());
      try { await post("/api/rules", f); await post("/api/rules/check", {}); toast("PF", "Rule added"); Router.go("portfolio", { sec: "settings" }); } catch (x) { err.textContent = x.message; }
    });
    const rules = rl.rules || [];
    const time = h("input", { type: "time", value: s.briefing_time, class: "inp", "aria-label": "Daily briefing at" });
    const wk = h("input", { type: "checkbox", checked: s.briefing_weekdays_only ? true : null });
    const mac = h("input", { type: "checkbox", checked: s.mac_notifications ? true : null });
    const saveS = () => post("/api/settings", { briefing_time: time.value, briefing_weekdays_only: wk.checked, mac_notifications: mac.checked }).then(() => toast("PF", "Saved")).catch((e) => toast(e.message));
    [time, wk, mac].forEach((x) => x.addEventListener("change", saveS));
    const browserBtn = h("button", { class: "btn ghost sm", type: "button", disabled: !("Notification" in window) || Notification.permission !== "default" ? true : null,
      onclick: async () => { await Notification.requestPermission(); Router.go("portfolio", { sec: "settings" }); } }, "Notification" in window && Notification.permission === "granted" ? "Browser notifications are on" : "Also notify in this browser");
    body.replaceChildren(h("div", { class: "pf-alerts" },
      h("div", {}, h("div", { class: "lab-sub" }, "Your price rules"),
        rules.length ? rules.map((r) => h("div", { class: `rule${r.state.active ? " met" : ""}` }, h("div", {}, h("b", {}, r.description),
          h("small", {}, r.state.error ? ` Could not check: ${r.state.error}` : r.state.measured ? ` Now: ${r.state.measured}${r.state.active ? " — met" : ""}` : " Not checked yet")),
          h("button", { class: "x", type: "button", "aria-label": `Delete: ${r.description}`, onclick: async () => { await post(`/api/rules/${r.id}/delete`, {}); Router.go("portfolio", { sec: "settings" }); } }, "×")))
          : framed("No price rules yet.", "Add one below, or from a fund's card (search at the top)."),
        form, err),
      h("div", {}, h("div", { class: "lab-sub" }, "Notifications"),
        h("div", { class: "pf-set" }, h("label", { class: "field" }, h("span", {}, "Daily briefing at"), time),
          h("label", { class: "pf-inline" }, wk, " Weekdays only"), h("label", { class: "pf-inline" }, mac, " Mac notifications"), browserBtn))));
  })();
  return sec;
}
