"use strict";
/* Trading Lab · PAPER MONEY ONLY. The detail views that "How it works" opens on demand (collapsed "Details" sections,
   loaded only when opened): the SCORECARD in full (LabViews.ready) and the session JOURNAL (LabViews.journal). They use
   the helpers of lab.js (LabUI) and are drawn by about.js with ctx.head() empty: no page head of their own. */

window.LabViews = window.LabViews || {};

function ok2(x) { return x != null && Number.isFinite(x); }

/* ================================================================ READY */
LabViews.ready = async (el, ctx, wait) => {
  const U = LabUI, { sum } = ctx;
  el.append(...ctx.head(), wait);
  const [r, rules, practice] = await Promise.all([U.get("/api/lab/ready"), U.get("/api/lab/rules", 600_000).catch(() => null), U.get("/api/lab/practice", 120_000).catch(() => null)]);
  if (!ctx.alive()) return;
  wait.remove();
  if (r.state === "not_started") { el.replaceChildren(); labGate(el, "ready", r); return; }
  const C = Object.fromEntries((r.criteria || []).map((c) => [c.id, c]));
  const a1 = C.A1 || {}, b1 = C.B1 || {}, sc = r.scorecard || {}, tte = r.time_to_evidence || {};
  const tH = r.t_hurdle ?? (b1.threshold || {}).t ?? 3;

  const nSt = (s) => (r.criteria || []).filter((c) => c.status === s).length;
  const SHORT = { A1: "evidence", A2: "operations", B1: "significance", B2: "baselines", B3: "deflation", B4: "overfitting", B5: "drills", C1: "stop rule", C2: "measured costs", C3: "risk" };
  const failing = (r.criteria || []).filter((c) => c.status === "fails").map((c) => `${c.id} ${SHORT[c.id] || c.title.toLowerCase()}`);
  const verdictOn = a1.earliest || tte.earliest_a1;
  /* the status in words: "0 of 10" read as a failing grade while most criteria cannot be judged yet */
  const status = nSt("too_early") ? "Too early" : nSt("fails") ? "Not passed" : "All met";
  el.append(U.kpis(sum, [
    { label: "Pre-registered scorecard", tier: "hero", value: status,
      detail: [h("span", { class: "muted" }, nSt("too_early") && verdictOn ? `first verdict possible ${U.d(verdictOn)} · ` : ""),
        h("span", { class: "muted" }, `${U.int(r.met ?? 0)} met · ${U.int(nSt("fails"))} fail${failing.length ? ` (${sum.live_sessions ? "" : "history: "}${failing.join(", ")})` : ""} · ${U.int(nSt("too_early"))} too early`)] },
    { label: "Live sessions", tier: "major", value: [U.int((a1.value || {}).sessions ?? tte.live_sessions), h("span", { class: "of" }, " / 250")],
      detail: h("span", { class: "muted" }, `${U.int((a1.value || {}).trades)} of ${U.int((a1.threshold || {}).trades ?? 100)} closed trades (${U.famWord((a1.value || {}).family || "daily").toLowerCase()} family)`) },
    { label: U.tl("Live alpha t, before tax", `How far the live result after costs and before tax, beyond the market, is from zero, in standard errors. The bar this season is ${U.t3(tH)}.`), tier: "major",
      value: [h("span", {}, U.num((b1.value || {}).t, 2)), h("span", { class: "of" }, ` / ${U.t3(tH)}`)],
      detail: [progress(ok2((b1.value || {}).t) ? U.clamp(b1.value.t / (tH || 3)) : null, { kind: b1.status === "met" ? "ok" : "warn", target: 1 }),
        h("span", { class: "muted" }, `${b1.status === "met" ? "met" : b1.status === "fails" ? "fails" : "too early"} · min of iid and Newey-West t`)] },
    { label: "Earliest A1 can pass", value: U.d(a1.earliest || tte.earliest_a1), detail: h("span", { class: "muted" }, "250 live sessions") },
    { label: "Registered", value: U.d(sc.registered_on), detail: h("span", { class: "muted" }, `season ${sc.season || "—"} · ${U.int(sc.changes)} changes`) },
    { label: "Scorecard hash", value: h("span", { class: "mono" }, U.sha8(sc.sha256)), detail: h("span", { class: "muted" }, "SHA-256 of the registered file") },
  ]));

  /* ---------------- 1 SCOR · 2 WORD */
  const v = (c) => c.value || {}, t = (c) => c.threshold || {};
  const early = (c) => c.status === "too_early";
  const CRIT = {
    A1: (c) => ({ meter: progress(c.progress ?? U.clamp((v(c).sessions || 0) / (t(c).sessions || 250)), { kind: c.status === "met" ? "ok" : "warn", target: 1 }),
      val: `${U.int(v(c).sessions)} / ${U.int(t(c).sessions)} sessions · ${U.int(v(c).trades)} / ${U.int(t(c).trades)} trades` }),
    A2: (c) => ({ checks: [
      [v(c).live_mode_share >= t(c).live_mode_share, `committed live ${U.pct(v(c).live_mode_share, 0)} (≥ ${U.pct(t(c).live_mode_share, 0)})`],
      [v(c).sentinel_match >= t(c).sentinel_match, `sentinel match ${U.pct(v(c).sentinel_match, 1)} (≥ ${U.pct(t(c).sentinel_match, 0)}; ${U.int(v(c).sentinel_checks)} checks)`],
      [v(c).open_incidents <= (t(c).open_incidents ?? 0), `${U.int(v(c).open_incidents)} open data incidents`]] }),
    B1: (c) => { const tv = v(c).t; return { meter: progress(ok2(tv) ? U.clamp(tv / (t(c).t * 4 / 3)) : null, { kind: c.status === "met" ? "ok" : c.status === "fails" ? "bad" : "warn", target: 0.75 }), val: `t ${ok2(tv) ? sign(tv, U.NF[2]) : "n/a"} of ${U.t3(t(c).t)}` }; },
    B2: (c) => ({ checks: [
      [v(c).net > (t(c).net_gt ?? 0), `live after tax ${sign(v(c).net, fmt.p1)} > 0`],
      [ok2(v(c).sharpe) && ok2(v(c).sharpe_x1) ? v(c).sharpe > v(c).sharpe_x1 : null,
        ok2(v(c).sharpe) ? `Sharpe ${U.num(v(c).sharpe, 2)} > Europe ETF held (X1) ${U.num(v(c).sharpe_x1, 2)}` : "live Sharpe against the Europe ETF held (X1): n/a yet"],
      [ok2(v(c).sharpe) && ok2(v(c).sharpe_monkey) ? v(c).sharpe > v(c).sharpe_monkey : null,
        ok2(v(c).sharpe) ? `> random picks ${v(c).monkey || ""} ${U.num(v(c).sharpe_monkey, 2)}` : `against random picks ${v(c).monkey || ""}: n/a yet`]] }),
    B3: (c) => ({ meter: progress(ok2(v(c).dsr) ? v(c).dsr : null, { kind: c.status === "met" ? "ok" : "bad", target: t(c).dsr }), val: `DSR ${U.num(v(c).dsr, 2)} of ${U.num(t(c).dsr, 2)}${v(c).sessions ? ` · ${U.int(v(c).sessions)} sessions` : ""}` }),
    B4: (c) => ({ meter: progress(ok2(v(c).pbo) ? v(c).pbo : null, { kind: c.status === "met" ? "ok" : "bad", target: t(c).pbo }), val: `PBO ${U.num(v(c).pbo, 2)}, needs ≤ ${U.num(t(c).pbo, 2)}` }),
    B5: (c) => ({ checks: v(c).champion == null && !ok2(v(c).placebo_percentile) ? [[null, "n/a: no champion (counts as not met)"]] : [
      [v(c).placebo_percentile >= t(c).placebo_percentile, `placebo percentile ${U.pct(v(c).placebo_percentile, 0)} (≥ ${U.pct(t(c).placebo_percentile, 0)})`],
      [v(c).hs10_net > (t(c).hs10_net_gt ?? 0), `net at 10 bps ${sign(v(c).hs10_net, fmt.p1)} > 0`],
      [v(c).lag_net >= (t(c).lag_net_ge ?? 0), `one session late ${sign(v(c).lag_net, fmt.p1)} ≥ 0`],
      [v(c).halves_share_positive >= t(c).halves_share_positive, `halves positive ${U.pct(v(c).halves_share_positive, 0)} (≥ ${U.pct(t(c).halves_share_positive, 0)})`]] }),
    C1: (c) => ({ checks: [[(v(c).raised ?? 0) <= (t(c).raised_max ?? 0), `stop flag raised ${U.plural(v(c).raised ?? 0, "time")} in the last 120 sessions`]] }),
    C2: (c) => ({ checks: [
      [v(c).repriced_net > (t(c).repriced_gt ?? 0), `re-priced at measured spreads ${sign(v(c).repriced_net, fmt.p1)} > 0`],
      [v(c).main_x_net > (t(c).main_x_gt ?? 0), `hand-execution shadow ${sign(v(c).main_x_net, fmt.p1)} > 0`],
      [null, `${U.int(v(c).quote_sessions)} sessions with 22:50 quotes (needs 60)`]] }),
    C3: (c) => ({ checks: [
      [v(c).max_dd >= t(c).max_dd && (v(c).max_dd_pre ?? 0) >= t(c).max_dd, `max drawdown ${sign(v(c).max_dd, fmt.p1)} after tax, ${sign(v(c).max_dd_pre, fmt.p1)} before (≥ ${sign(t(c).max_dd, fmt.p0)})`],
      [v(c).worst >= t(c).worst && (v(c).worst_pre ?? 0) >= t(c).worst, `worst session ${sign(v(c).worst, fmt.p1)} after tax, ${sign(v(c).worst_pre, fmt.p1)} before (≥ ${sign(t(c).worst, fmt.p0)})`]] }),
  };
  const GROUPS = [["A", "Enough evidence, soundly recorded"], ["B", "Statistical tests"], ["C", "Stop rule, costs and risk"]];
  const critRow = (c) => {
    const f = (CRIT[c.id] || (() => ({})))(c);
    const since = c.status === "too_early" ? (c.earliest ? `earliest ${U.d(c.earliest)}` : "") : c.since ? `${c.status === "met" ? "met" : "failing"} since ${U.d(c.since)}` : "";
    return h("div", { class: `rule lab-crit ${c.status === "met" ? "met" : ""}` },
      h("span", { class: "ix" }, c.id), h("span", { class: "t" }, c.title, h("small", {}, c.code), " ", U.basis(c.basis)), U.status(c.status),
      f.meter ? h("div", { class: "row" }, f.meter, h("span", { class: "val" }, f.val)) : null,
      f.checks ? h("div", { class: "row lab-checks" }, f.checks.map(([p, txt]) => U.check(p, txt, early(c)))) : null,
      h("div", { class: "why" }, `${c.rule}${since ? ` · ${since}` : ""}`));
  };
  const W = r.wording || {};
  const word = (label, text) => (text ? h("div", { class: "w" }, h("div", { class: "section-l" }, label), h("p", {}, U.cite(text, (rules || {}).evidence))) : null);
  const cSCOR = card({ n: 1, code: "SCOR", title: "Criteria", span: 7, sub: `applies to ${sc.applies_to || "the main book"}`,
      body: [h("div", { class: "score lab-score" },
        h("div", {}, h("div", { class: "t" }, r.headline || ""), h("div", { class: "note" }, "Statuses: met, fails, too early. The scorecard never says more than this. Money criteria are after tax; B1 is before tax; C3 must pass on both lines."),
          h("div", { class: "pips lab-pips", "aria-hidden": "true" }, (r.criteria || []).map((c) => h("i", { class: c.status === "met" ? "on" : c.status === "fails" ? "off" : "" }))))),
        GROUPS.map(([g, label]) => [h("div", { class: "section-l" }, `${g} · ${label}`), h("div", {}, (r.criteria || []).filter((c) => c.id[0] === g).map(critRow))])],
      foot: "Criteria were fixed at registration; they may be made stricter (logged), never looser without a new season. Values show throughout, also while a status is too early." });
  const cWORD = card({ n: 2, code: "WORD", title: "What this means", badges: [badge("Fixed wording", "ref")],
      body: h("div", { class: "lab-word" },
        word("Headline", W.headline || r.headline),
        word("Too early", W.too_early),
        word("History", W.history),
        word("All met", W.all_met),
        word("Always shown", W.always),
        word("The expectation, stated at registration", W.expectation),
        !r.champion || !r.champion.id ? h("p", { class: "callout" }, "The champion is CASH, so the main book earns 0 and B1 and B2 cannot be met.") : null),
      foot: "These sentences are part of the registered scorecard and are shown exactly as registered." });

  /* ---------------- 3 TIME · 4 BAND */
  const tBox = h("div", { class: "chart fill" });
  const tp = r.t_path || [];
  const tb = tte.table || [], tb2 = Object.fromEntries((tte.table_t2 || []).map(([s, y]) => [s, y]));
  const yrs = (x) => (ok2(x) ? `${U.num(x, 1)} years` : "never at the current rate");
  const band = r.band || {};
  const cTIME = card({ n: 3, code: "TIME", title: "How long the evidence takes",
      body: [h("div", { class: "pair" },
        table({ caption: "Years to a t-statistic", cls: "compact", cols: [
          { key: "s", label: "Sharpe a year", num: true, fmt: (x) => U.num(x[0], 1) },
          { key: "y", label: "Years, t = 3", num: true, fmt: (x) => U.num(x[1], x[1] < 3 ? 2 : 0) },
          { key: "y2", label: "t = 2", num: true, title: "for reference only",  fmt: (x) => (tb2[x[0]] != null ? U.num(tb2[x[0]], tb2[x[0]] < 3 ? 2 : 0) : "—") }], rows: tb }),
        h("div", { class: "lab-lines" },
          ledger([
            { op: "", label: "History", small: `MAIN-HIST, alpha Sharpe ${U.num(tte.sharpe_hist_alpha, 2)}`, value: yrs(tte.years_to_t3_hist) },
            { op: "", label: "Live", small: tte.sharpe_live_alpha != null ? `alpha Sharpe ${U.num(tte.sharpe_live_alpha, 2)}, ${U.int(tte.live_sessions)} sessions` : "needs 60 live sessions", value: tte.sharpe_live_alpha != null ? yrs(tte.years_to_t3_live) : "—" },
            { op: "", label: "A1 earliest", small: "250 live sessions", value: U.d(tte.earliest_a1 || a1.earliest), cls: "total" }]),
          h("p", { class: "note" }, "For daily returns, t ≈ annual Sharpe × √years. More books do not shorten this: the scorecard judges one procedure, the main book."))),
        h("div", { class: "section-l" }, "Live alpha t of the main book, against sessions"),
        tp.length ? tBox : empty("Starts after 20 live sessions.")],
      foot: `The dashed line is this season's t = ${U.t3(tH)} hurdle (before tax); the dotted line projects today's t by √n at the current rate (arithmetic, not a forecast).` });
  const cBAND = card({ n: 4, code: "BAND", title: "Live against the backtest", span: 5,
      body: (band.live_mean || []).length ? [h("p", { class: "lede" }, "The main book's mean daily net return after n live sessions, inside the range its history implied (1–99% and 5–95% of a block bootstrap)."),
        U.svgBox(null, (w, H) => labFan(w, H, band), "lab-fill"),
        legend([{ c: "var(--s1)", style: "line", label: "Main book, live mean" }, { c: "var(--bench-1)", style: "box", label: "5–95%" }, { c: "var(--bench-3)", style: "box", label: "1–99%" }])]
        : empty("Starts after 20 live sessions."),
      foot: "Stop rule: after 60 live sessions, a live mean below the 5% line raises the stop flag (C1); below 1% the journal writes re-examine." });
  el.append(U.grid(cSCOR, h("div", { class: "span-5 lab-stack" }, cWORD, cTIME)));
  if (tp.length) {
    const last = tp[tp.length - 1], n0 = tte.live_sessions || tp.length;
    const proj = [];
    if (last[1] > 0 && n0 > 0) {
      const dt = new Date(`${last[0]}T12:00:00Z`);
      for (let k = 1, n = n0; k <= 520 && n < 1000; k++) {
        dt.setUTCDate(dt.getUTCDate() + 1);
        if (dt.getUTCDay() % 6 === 0) continue;
        n += 1;
        const tv = last[1] * Math.sqrt(n / n0);
        if (n % 5 === 0) proj.push([dt.toISOString().slice(0, 10), tv]);
        if (tv >= tH * 1.05) break;
      }
    }
    const first = tp[0][0], end = proj.length ? proj[proj.length - 1][0] : last[0];
    const res = U.lines(tBox, [
      { label: "Live alpha t", points: tp, style: "you", fmt: (x) => U.num(x, 2) },
      { label: `t = ${U.t3(tH)}`, points: [[first, tH], [end, tH]], style: "b1", tip: false },
      { label: "√n projection", points: proj.length ? [last, ...proj] : [], style: "b2", fmt: (x) => U.num(x, 2) }], { digits: 1 });
    if (res) tBox.after(U.legend([{ label: "Live alpha t", style: "you", value: U.num(last[1], 2) }, { label: `t = ${U.t3(tH)} hurdle`, style: "b1" }, { label: "√n projection at the current rate", style: "b2" }]));
  }

  /* ---------------- 5 DSR · 6 PBO */
  const ds = r.dsr || {}, pb = r.pbo || {}, rc = r.rc || {};
  const dsrRows = ds.rows || [];
  const cDSR = card({ n: 5, code: "DSR", title: "Deflated Sharpe", span: 7, flush: true,
      body: [U.pad(h("div", { class: "stats four" },
        stat(U.tl("Trials counted, N", "Every configuration ever tried on this price history. The more were tried, the higher the best one's result must be to count."), U.int(ds.n_trials), "from the trial ledger"),
        stat(U.tl("Effective trials", "Strategies that move together count as fewer independent tries."), U.num(ds.n_eff, 1), "correlated trials counted once"),
        stat(U.tl("Variance of Sharpes", "How much the strategies' results differ from one another; a wide spread makes a lucky best result likelier."), U.num(ds.v_daily, 4), "daily, across trials"),
        stat(U.tl("Noise bar, SR0", "The yearly Sharpe ratio the best of N strategies with no skill at all would be expected to show."), U.num(ds.sr0_ann, 2), "annual Sharpe the best noise trial would show")),
        ds.main ? h("p", { class: "lede" }, h("b", {}, "B3: "), `history and live joined (${U.int(ds.main.sessions)} sessions), DSR ${U.num(ds.main.dsr, 2)} against 0.95 needed.`) : null),
        ...U.showAll(dsrRows, U.phoneN(12), (list) => table({ caption: "Deflated Sharpe by book", cls: "compact", rowCls: (x) => (x.id === "MAIN-HIST" ? "you" : ""), cols: [
          { key: "id", label: "Book", fmt: (x) => h("span", { class: "tick" }, x.id) },
          { key: "s", label: "Sharpe, annual", num: true, fmt: (x) => (x.sharpe_ann == null ? U.na("no trades in the window") : U.snum(x.sharpe_ann, 2)) },
          { key: "T", label: "Sessions", num: true, fmt: (x) => U.int(x.T) },
          { key: "sk", label: U.tl("Skew", "Negative: losses come in rarer, larger lumps than gains. It lowers the deflated Sharpe."), sl: "Skew", num: true, hideSm: true, fmt: (x) => U.num(x.skew, 2) },
          { key: "ku", label: U.tl("Kurtosis", "How often extreme sessions happen; 3 is the normal curve. Fat tails lower the deflated Sharpe."), sl: "Kurtosis", num: true, hideSm: true, fmt: (x) => U.num(x.kurt, 1) },
          { key: "sr0", label: U.tl("SR0", "The noise bar for this book: the yearly Sharpe the best of N skill-free strategies would show."), sl: "SR0", num: true, hideSm: true, fmt: (x) => U.num(x.sr0_ann, 2) },
          { key: "dsr", label: U.tl("DSR", "Deflated Sharpe: the probability that the true Sharpe is above the noise bar SR0."), sl: "DSR", num: true, fmt: (x) => (x.dsr == null ? U.na("no trades in the window") : U.num(x.dsr, 2)) }], rows: list }), "books")],
      foot: "Validation window; sorted by book ID. DSR is the probability that the true Sharpe exceeds SR0, the bar a best-of-N noise strategy would clear. Today's index members (survivorship)." });
  const cPBO = card({ n: 6, code: "PBO", title: "Overfitting (PBO)", span: 7,
      body: [h("div", { class: "stats three" },
        stat(U.tl("PBO", "Probability of backtest overfitting: how often the strategy that led in one half of the history fell to the bottom half in the other."), U.num(pb.value, 2), `${pb.window || "validation"}`),
        stat("With live", U.num(pb.value_validation_live, 2), "B4 needs ≤ 0.05"),
        stat(U.tl("Splits", "Every way of cutting the history into 16 blocks and sharing them half and half between a learning and a testing side."), U.int(pb.splits), "ways to split the history in half")),
        h("div", { class: "section-l" }, U.gk("λ"), ": where the in-sample leader ranked out of sample"),
        (pb.logit_hist || []).length ? U.svgBox(null, (w, H) => labHist(w, H, pb.logit_hist), "lab-fill lab-hist") : empty("No splits yet."),
        h("dl", { class: "kv" }, h("dt", {}, "Slope, out-of-sample on in-sample"), h("dd", {}, U.snum(pb.slope, 2), ` · R² ${U.num(pb.r2, 2)}`),
          h("dt", {}, "Share of leaders negative out of sample"), h("dd", {}, U.pct(pb.p_oos_negative, 1))),
        pb.caveat ? h("p", { class: "note" }, prose(pb.caveat)) : null],
      foot: "PBO = the share of splits where the in-sample leader landed in the bottom half out of sample (λ ≤ 0). Never used alone." });
  el.append(U.grid(cBAND, cDSR));

  /* ---------------- 7 RC · 8 CALC */
  const ch = (r.champion || {}).id;
  const capRow = practice && (practice.capital || []).find((x) => x.id === ch);
  const eb = r.edge_bps || {};
  const calcBox = h("div");
  const amounts = [...new Set((r.costcalc || []).map((x) => x.amount))].sort((a, b) => a - b);
  const byKey = Object.fromEntries((r.costcalc || []).map((x) => [`${x.amount}|${x.n}`, x]));
  let grp = "FREE";
  const drawCalc = () => {
    const cell = (a, n, what) => { const x = byKey[`${a}|${n}`]; if (!x) return "—"; const txt = what === "rt" ? U.num(x.rt_bps[grp], 0) : U.pct(x.drag_pa_free, 0);
      return h("span", { class: x.below_min_ticket ? "lab-below" : "", "data-tip": `€${U.int(a)} in ${n} name${n > 1 ? "s" : ""}: ticket ${U.eur(x.ticket, 0)}${x.below_min_ticket ? " (below the €1,000 minimum ticket)" : ""}` }, txt, x.below_min_ticket ? "†" : ""); };
    calcBox.replaceChildren(table({ caption: "Round-trip cost and yearly drag by amount", cls: "compact",
      groups: [{ span: 1 }, { span: 3, label: `Round trip, bps · ${grp === "IT_FR" ? "IT and FR" : grp}` }, { span: 3, label: "Yearly drag, one round trip a session · FREE" }],
      cols: [{ key: "a", label: "Amount", num: true, fmt: (a) => U.eur(a, 0) },
        ...[1, 2, 3].map((n) => ({ key: `r${n}`, label: `${n} name${n > 1 ? "s" : ""}`, num: true, fmt: (a) => cell(a, n, "rt") })),
        ...[1, 2, 3].map((n) => ({ key: `d${n}`, label: `${n} name${n > 1 ? "s" : ""}`, num: true, fmt: (a) => cell(a, n, "drag") }))],
      rows: amounts }));
  };
  drawCalc();
  const cRC = card({ n: 7, code: "RC", title: "Reality Check", span: 5, badges: [badge("Information only", "ref")],
      body: [h("div", { class: "stats two" },
        stat("p-value", U.num(rc.p, 3), "share of resamples at least as good"),
        stat("Highest in the league", rc.best || "—", "the strategy tested"),
        stat("Resamples, B", U.int(rc.B), "bootstrap of validation returns"),
        stat("Statistic, V", U.num(rc.V, 3), "largest √T × mean net return")),
        h("div", { class: "section-l" }, "How p is found"),
        ledger([
          { op: "1", label: "V: the largest √T × mean return after tax", small: "among the 24 strategies, validation", value: U.num(rc.V, 3) },
          { op: "2", label: "Resample the sessions in blocks", small: "stationary bootstrap, mean block 10", value: `${U.int(rc.B)} times` },
          { op: "3", label: "Each time: the largest √T × (resampled − real mean)", small: "what luck alone produces", value: "V*" },
          { op: "=", label: "p: the share of V* at or above V", value: U.num(rc.p, 3), cls: "total" }]),
        h("p", { class: "lede" }, "The question: could the highest strategy in the league have done this well by luck, given how many were tried? A small p says luck is an unlikely explanation for the history. It is not a criterion: the deflated Sharpe (5 DSR) already counts every trial."),
        rc.note ? h("p", { class: "note" }, prose(rc.note)) : null],
      foot: ["Validation window. The test was implemented from its description in the literature; see ", link("Method and reading list", "#/about?open=method"), "."] });
  const cCALC = card({ n: 8, code: "CALC", title: "What a smaller amount would cost", span: 12,
      tools: [seg([["FREE", "No-tax names"], ["ES", "Spain"], ["IT_FR", "Italy, France"]], grp, (g) => { grp = g; drawCalc(); }, "Tax group"), h("span", { class: "grow" }), h("span", { class: "note" }, "† below the €1,000 minimum ticket")],
      body: [calcBox,
        h("div", { class: "two-col lab-two" },
          h("div", {}, h("div", { class: "section-l" }, `Edge per trade, champion's source (${eb.source || ch || "—"})`),
            ledger([
              { op: "", label: "Validation, before costs", value: U.bps(eb.validation) },
              { op: "−", label: "Validation, costs", value: U.bps(eb.validation_cost) },
              { op: "=", label: "Validation, net", value: ok2(eb.validation) && ok2(eb.validation_cost) ? h("span", { class: tone(eb.validation - eb.validation_cost) }, `${sign(eb.validation - eb.validation_cost, U.NF[1])} bps`) : "—", cls: "total" },
              { op: "", label: "Live, before costs", value: eb.live != null ? U.bps(eb.live) : "needs live trades" }]),
            capRow ? h("p", { class: "note" }, capRow.breakeven_eur != null ? `Capital drill (DR-CAP): break-even book for ${ch} ${U.eur(capRow.breakeven_eur, 0)}.` : `Capital drill (DR-CAP): no break-even inside the tested books (€1,000 to €25,000) for ${ch}.`) : null),
          h("div", {}, h("div", { class: "section-l" }, "The main book's tax ledger, by year"),
            ((r.tax || {}).by_year || []).length ? table({ caption: "Tax withheld by year", cls: "compact", cols: [
              { key: "y", label: "Year", fmt: (x) => String(x.year) },
              { key: "g", label: "Gains €", num: true, fmt: (x) => U.num(x.gains, 2) },
              { key: "l", label: "Losses €", num: true, fmt: (x) => U.snum(x.losses, 2) },
              { key: "u", label: "Credits used €", num: true, fmt: (x) => U.num(x.credits_used, 2) },
              { key: "t", label: "Withheld €", num: true, fmt: (x) => U.num(x.withheld, 2) }], rows: r.tax.by_year }) : h("p", { class: "note" }, "No paper sale yet."),
            h("p", { class: "note" }, "26% withheld at each paper sale; losses become credits for the same year and the next four; nothing is refunded.")))],
      foot: "Arithmetic on the fee schedule, not a suggestion of any amount. Round trip = 2 × €1 ÷ ticket + 2 × 0.05% + any tax; drag = round trip × 252 sessions." });
  el.append(U.grid(cPBO, cRC), U.grid(cCALC));

  /* ---------------- 9 PREG */
  const rc2 = Object.fromEntries((((rules || {}).scorecard || {}).criteria || []).map((c) => [c.id, c]));
  el.append(U.grid(card({ n: 9, code: "PREG", title: "What was registered", span: 12, flush: true,
    body: [U.pad(h("dl", { class: "kv lab-preg" },
      h("div", {}, h("dt", {}, "Season"), h("dd", {}, sc.season || "—")), h("div", {}, h("dt", {}, "Registered on"), h("dd", {}, U.d(sc.registered_on))),
      h("div", {}, h("dt", {}, "Changes since"), h("dd", {}, U.int(sc.changes))), h("div", {}, h("dt", {}, "Applies to"), h("dd", {}, sc.applies_to || "—")),
      h("div", { class: "wide" }, h("dt", {}, "SHA-256 of scorecard.json"), h("dd", { class: "lab-hash" }, sc.sha256 || "—")))),
      table({ caption: "Registered criteria", cls: "compact", stack: true, cols: [
        { key: "id", label: "ID", fmt: (c) => h("span", { class: "tick" }, c.id) },
        { key: "code", label: "Code", fmt: (c) => h("span", { class: "mono" }, c.code) },
        { key: "title", label: "Criterion", lead: true, fmt: (c) => h("span", { class: "nm" }, c.title) },
        { key: "rule", label: "Threshold", wide: true, fmt: (c) => h("span", { class: "lab-wrap" }, c.rule) },
        { key: "te", label: "Too early while", wide: true, fmt: (c) => { const x = rc2[c.id] || {}; return c.id === "A1" ? "below either" : c.id === "B1" ? "A1 not met" : c.id === "B5" ? "drills not finished" : c.id === "C2" ? `< ${x.min_quote_sessions || 60} quote sessions` : x.too_early_below ? `< ${x.too_early_below} live sessions` : "never"; } },
        { key: "st", label: "Status now", fmt: (c) => U.status(c.status) }], rows: r.criteria || [] })],
    foot: "The hash covers the registered file; any loosening would be a new season that restarts the live clock and raises B1's bar (3.000 in season 1, 3.205 in season 2, then 3.32 and 3.40)." })));
};

/* the fan of BAND: horizon n on x, mean daily net return on y (%), bands grey, live mean cyan */
function labFan(w, H, b) {
  const U = LabUI, pad = { l: 52, r: 10, t: 10, b: 24 };
  const n = (b.horizon || []).length, live = b.live_mean || [];
  const lastN = Math.max(live.length, 20);
  const N = Math.min(n, Math.max(lastN + 10, 30));
  const idx = [...Array(N).keys()];
  const vals = ["p01", "p05", "p95", "p99"].flatMap((k) => (b[k] || []).slice(0, N)).concat(live).filter(Number.isFinite);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const x = U.lin(1, N, pad.l, w - pad.r), y = U.lin(lo, hi, H - pad.b, pad.t);
  const area = (a, bb) => `M${idx.map((i) => `${x(i + 1).toFixed(1)},${y(b[a][i]).toFixed(1)}`).join("L")}L${idx.slice().reverse().map((i) => `${x(i + 1).toFixed(1)},${y(b[bb][i]).toFixed(1)}`).join("L")}Z`;
  const tk = U.ticks(lo, hi, 4), xt = U.ticks(1, N, w < 420 ? 4 : 6).filter((v) => v >= 1);
  return U.svg(w, H, `Band of the main book's mean daily net return over ${N} sessions; live mean after ${live.length} sessions ${sign(live[live.length - 1], fmt.p2)}`,
    tk.map((v) => [h("line", { x1: pad.l, x2: w - pad.r, y1: y(v), y2: y(v), class: v === 0 ? "zero" : "grid" }), U.t(pad.l - 6, y(v) + 4, sign(v, fmt.p1), { class: "ax", "text-anchor": "end" })]),
    xt.map((v) => U.t(x(v), H - 6, String(v), { class: "ax", "text-anchor": "middle" })),
    U.t(w - pad.r, H - 6, "sessions", { class: "ax", "text-anchor": "end", dy: "-12" }),
    h("path", { d: area("p01", "p99"), class: "fan1" }), h("path", { d: area("p05", "p95"), class: "fan2" }),
    h("polyline", { points: live.slice(0, N).map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(" "), class: "youl" }),
    live.length ? h("circle", { cx: x(Math.min(live.length, N)), cy: y(live[Math.min(live.length, N) - 1]), r: 3.5, class: "youdot", "data-tip": `After ${live.length} sessions: ${sign(live[live.length - 1], fmt.p2)} a session` }) : null);
}
/* the λ histogram of PBO: bars at or below zero count toward PBO */
function labHist(w, H, hist) {
  const U = LabUI, pad = { l: 40, r: 8, t: 8, b: 24 };
  const xs = hist.map((x) => x[0]), step = xs.length > 1 ? Math.min(...xs.slice(1).map((v, i) => v - xs[i])) : 1;
  const lo = Math.min(...xs) - step / 2, hi = Math.max(...xs) + step / 2, top = Math.max(...hist.map((x) => x[1]), 1);
  const x = U.lin(lo, hi, pad.l, w - pad.r), y = U.lin(0, top, H - pad.b, pad.t);
  const bw = Math.max(2, x(lo + step) - x(lo) - 2);
  return U.svg(w, H, "Histogram of λ across CSCV splits",
    U.ticks(0, top, 3).map((v) => [h("line", { x1: pad.l, x2: w - pad.r, y1: y(v), y2: y(v), class: "grid" }), U.t(pad.l - 6, y(v) + 4, U.int(v), { class: "ax", "text-anchor": "end" })]),
    hist.map(([c, n]) => h("rect", { x: x(c) - bw / 2, y: y(n), width: bw, height: Math.max(0, y(0) - y(n)), class: c <= 0 ? "neg" : "pos", "data-tip": `λ ${sign(c, U.NF[1])}: ${U.int(n)} splits${c <= 0 ? " (count toward PBO)" : ""}` })),
    h("line", { x1: x(0) + (hist.some((q) => q[0] === 0) ? bw / 2 + 1 : 0), x2: x(0) + (hist.some((q) => q[0] === 0) ? bw / 2 + 1 : 0), y1: pad.t, y2: H - pad.b, class: "zero" }),
    xs.filter((v, i) => i % Math.ceil(xs.length / 7) === 0).map((v) => U.t(x(v), H - 6, sign(v, U.NF[1]), { class: "ax", "text-anchor": "middle" })));
}

/* ================================================================ JOURNAL */
LabViews.journal = async (el, ctx, wait) => {
  const U = LabUI, { sum, params } = ctx;
  el.append(...ctx.head(), wait);
  const state = { month: params.get("month") || "", tag: params.get("tag") || "", book: params.get("book") || "" };
  const jurl = () => `/api/lab/journal?${new URLSearchParams(Object.entries(state).filter(([, v]) => v))}`;
  let j, rules, fb;
  try { [j, rules, fb] = await Promise.all([U.get(jurl()), U.get("/api/lab/rules", 600_000).catch(() => null), U.get("/api/lab/book?id=MAIN&window=live").catch(() => null)]); }
  catch (e) { if (!ctx.alive()) return; wait.remove(); el.append(U.errorCard(`The journal could not load: ${e.message}`)); return; }
  if (!ctx.alive()) return;
  wait.remove();
  if (j.state === "not_started") { el.replaceChildren(); labGate(el, "journal", j); return; }
  const k = j.kpi || {};
  state.month = j.month || state.month;
  el.append(U.kpis(sum, [
    { label: "Sessions journaled", tier: "hero", value: U.int(k.sessions_journaled), detail: h("span", { class: "muted" }, "live and catch-up, plus one entry per history month") },
    { label: "Catch-up share", tier: "major", value: U.pct(k.catchup_share, 1), detail: h("span", { class: "muted" }, "sessions committed after 22:30 the next day") },
    { label: "Corrections", tier: "major", value: U.int(k.corrections), detail: h("span", { class: "muted" }, "appended, never rewritten") },
    { label: "Last entry", value: U.d(k.last_entry), detail: h("span", { class: "muted" }, (j.entries || [])[0] ? `settled ${U.hm(j.entries[0].at)}` : "") },
    { label: "Months on file", value: U.int((j.months || []).length), detail: h("span", { class: "muted" }, (j.months || []).length ? `${month(j.months[j.months.length - 1])} → ${month(j.months[0])}` : "") },
    { label: "Runs logged", value: U.int((j.runs || []).length), detail: h("span", { class: "muted" }, `${U.int((j.runs || []).filter((x) => x.ok === false).length)} failed`) },
  ]));

  /* ---------------- 1 LOG · 2 CAL */
  const TY = { DECIDE: "reg", CHAMP: "reg", LEARN: "sys", LESSON: "sys", CORRECTION: "warn" };
  const logBody = h("div", { class: "lab-jlog" });
  const monthSel = h("select", { "aria-label": "Month" }, (j.months || []).map((m) => h("option", { value: m, selected: m === state.month ? true : null }, month(m))));
  const chipsBox = h("div", { class: "chips" });
  const drawChips = () => chipsBox.replaceChildren(chip("All tags", null, !state.tag, () => { state.tag = ""; refresh(); }),
    ...(j.tags || []).map((t) => chip(t, null, state.tag === t, () => { state.tag = state.tag === t ? "" : t; refresh(); })));
  const bookSeg = seg([["", "All books"], ["MAIN", "Main book"]], state.book, (b) => { state.book = b; refresh(); }, "Book");
  const drawEntries = (jj) => {
    const es = jj.entries || [];
    if (!es.length) { logBody.replaceChildren(empty(state.tag || state.book ? "No journal line matches these filters in this month." : "The journal starts with the first settled session.")); return; }
    /* a history month appears once per season (season 1's archived run, season 2's): each says which */
    const seasonOf = (e) => (e.lines || []).map((l) => l.season).find(Boolean) || (e.mode === "history" ? sum.previous_season : null);
    const SEASON = (s) => (s === sum.season ? `Season ${String(s).slice(1)}` : `Season ${String(s).slice(1)} archive`);
    const one = (e) => h("details", { class: "lab-sess", open: es.indexOf(e) === 0 ? true : null },
      h("summary", {}, h("span", { class: "dt" }, e.window && e.mode === "history" ? month(e.session.slice(0, 7)) : U.d(e.session)), U.mode(e.mode),
        e.mode === "history" && seasonOf(e) ? badge(SEASON(seasonOf(e)), seasonOf(e) === sum.season ? "ref" : "na") : null, e.partial ? badge("Partial", "warn") : null,
        h("span", { class: "grow" }), h("span", { class: "note" }, U.plural((e.lines || []).length, "line")),
        h("span", { class: "num" }, e.net_main != null ? ["main book ", signed(e.net_main, fmt.p2)] : "")),
      h("div", { class: "journal lab-log" }, (e.lines || []).map((l) => h("div", { class: "log" }, h("span", { class: `ty ${TY[l.tag] || ""}` }, l.tag),
        h("span", { class: "tx" }, prose(l.text), l.book && l.book !== "MAIN" ? h("span", { class: "sub" }, ` · ${l.book}`) : null)))),
      null);
    logBody.replaceChildren(...U.showAll(es, 5, (list) => h("div", { class: "lab-sessions" }, list.map(one)), "sessions"));
  };
  const refresh = async () => {
    drawChips();
    logBody.replaceChildren(skeleton(200));
    try { const jj = await U.get(jurl()); if (!el.isConnected) return; drawEntries(jj); }
    catch (e) { logBody.replaceChildren(empty(`Could not load: ${e.message}`)); }
  };
  monthSel.addEventListener("change", () => { state.month = monthSel.value; refresh(); });
  drawChips(); drawEntries(j);
  const cal = j.calendar || [];
  el.append(U.grid(
    card({ n: 1, code: "LOG", title: "Session journal", span: 8,
      tools: [h("label", { class: "field lab-inline" }, h("span", {}, "Month"), monthSel), bookSeg, chipsBox],
      body: logBody,
      foot: "One tag per line, written from fixed templates after each step. History months carry one fact-only entry; per-session history stays in the backtest." }),
    card({ n: 2, code: "CAL", title: "Session calendar", span: 4,
      body: cal.length ? labCalendar(cal) : empty("No live session yet."),
      foot: "Main book's net return by live session, in percent after costs. Hatched: catch-up or partial sessions. Select a day to open its desk as it was that night." })));

  /* ---------------- 3 FILL */
  const ids = ["MAIN", "MAIN-X", ...(((rules || {}).league) || []).map((x) => x.id)];
  let bookId = "MAIN";
  const fillBody = h("div");
  const drawFills = (bk) => {
    const fl = [...((bk && bk.fills) || [])].reverse();
    if (!fl.length) { fillBody.replaceChildren(U.pad(empty("No fills yet."))); return; }
    fillBody.replaceChildren(...U.showAll(fl, 15, (list) => table({ caption: "Fill blotter", cls: "compact", stack: true, rows: list, cols: [
      { key: "s", label: "Session", fmt: (f) => U.ds(f.session) },
      { key: "b", label: "Book", hideSm: true, fmt: (f) => h("span", { class: "tick" }, f.book || bookId) },
      { key: "side", label: "Side", fmt: (f) => badge(f.side === "buy" ? "Entry" : "Exit", f.side === "buy" ? "paper" : "") },
      { key: "n", label: "Name", lead: true, fmt: (f) => [h("span", { class: "nm" }, f.name || f.isin), h("span", { class: "sub" }, f.isin)] },
      { key: "sh", label: "Shares", num: true, fmt: (f) => U.int(f.shares) },
      { key: "mid", label: "Mid €", num: true, fmt: (f) => U.px(f.mid) },
      { key: "fill", label: "Fill €", num: true, fmt: (f) => U.px(f.fill) },
      { key: "fee", label: "Fee €", num: true, fmt: (f) => U.num(f.fee) },
      { key: "sp", label: "Spread €", num: true, fmt: (f) => U.num(f.spread) },
      { key: "ftt", label: "FTT €", num: true, fmt: (f) => U.num(f.ftt) },
      { key: "src", label: "Fill source", fmt: (f) => h("span", { class: "dim" }, f.source || "—") },
      { key: "r", label: "Reason", hideSm: true, fmt: (f) => h("span", { class: "dim" }, prose(f.reason || "")) }] }), "fills"));
  };
  drawFills(fb);
  const bookPick = h("select", { "aria-label": "Book" }, [...new Set(ids)].map((id) => h("option", { value: id }, U.NAME[id] ? `${id} · ${U.NAME[id]}` : id)));
  bookPick.addEventListener("change", async () => {
    bookId = bookPick.value;
    fillBody.replaceChildren(U.pad(skeleton(160)));
    try { drawFills(await U.get(`/api/lab/book?id=${encodeURIComponent(bookId)}&window=live`)); } catch (e) { fillBody.replaceChildren(U.pad(empty(/404/.test(e.message) ? `No book with ID ${bookId}.` : `Could not load: ${e.message}`))); }
  });
  el.append(U.grid(card({ n: 3, code: "FILL", title: "Fill blotter", span: 12, flush: true,
    tools: [h("label", { class: "field lab-inline" }, h("span", {}, "Book"), bookPick), h("span", { class: "grow" }), h("span", { class: "note" }, "Every live paper fill of the chosen book, newest first (last 500)")],
    body: fillBody,
    foot: "Fill = session-end mid ± 0.05% (assumed) for every book; the hand-execution shadow MAIN-X uses the 22:50 bid or ask when recorded (source: measured), else modelled." })));

  /* ---------------- 4 RUNS */
  const runs = j.runs || [];
  el.append(U.grid(card({ n: 4, code: "RUNS", title: "Run log", span: 12, flush: true,
    body: runs.length ? U.showAll(runs, 12, (list) => table({ caption: "Run log", cls: "compact", stack: true, rows: list, cols: [
      { key: "st", label: "Started", lead: true, fmt: (x) => U.when(x.started) },
      { key: "en", label: "Ended", fmt: (x) => U.when(x.ended) },
      { key: "k", label: "Kind", fmt: (x) => h("span", { class: "mono" }, x.kind || "—") },
      { key: "s", label: "Sessions", fmt: (x) => (x.sessions || []).map(U.ds).join(", ") || "—" },
      { key: "rq", label: "Requests", num: true, fmt: (x) => U.int(x.requests) },
      { key: "sec", label: "Seconds", num: true, fmt: (x) => U.num(x.secs, 1) },
      { key: "ok", label: "Result", fmt: (x) => (x.ok === false ? badge("Error", "bad") : badge("OK", "ok")) },
      { key: "er", label: "Error or reason", hideSm: true, fmt: (x) => h("span", { class: "dim" }, prose(x.error || x.reason || "")) }] }), "runs") : U.pad(empty("No runs yet.")),
    foot: "Requests to Lang & Schwarz go through the lab's governor: at least 1.5 s apart, at most 400 a day. Details on Data quality, the request budget." })));
};

/* the session calendar: weeks as columns, Monday–Friday as rows; colour steps by the size of the move, sign in the tooltip */
function labCalendar(cal) {
  const U = LabUI;
  const byDate = new Map(cal.map((c) => [c.session, c]));
  const dates = cal.map((c) => c.session).sort();
  const start = new Date(`${dates[0]}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(`${dates[dates.length - 1]}T12:00:00Z`);
  const weeks = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) weeks.push(new Date(d));
  const step = (x) => { const a = Math.abs(x || 0); return a < 0.0025 ? 1 : a < 0.01 ? 2 : a < 0.025 ? 3 : 4; };
  const up = cal.filter((c) => (c.net_main || 0) > 0.00005).length, dn = cal.filter((c) => (c.net_main || 0) < -0.00005).length;
  const nets = cal.map((c) => c.net_main).filter(Number.isFinite);
  const best = cal.reduce((a, c) => (c.net_main > (a ? a.net_main : -Infinity) ? c : a), null), worst = cal.reduce((a, c) => (c.net_main < (a ? a.net_main : Infinity) ? c : a), null);
  const mm = new Map();
  cal.forEach((c) => { const k = c.session.slice(0, 7); const x = mm.get(k) || { m: k, n: 0, up: 0, dn: 0, cu: 0, g: 1 }; x.n += 1; x.up += (c.net_main || 0) > 0.00005 ? 1 : 0; x.dn += (c.net_main || 0) < -0.00005 ? 1 : 0; x.cu += c.mode === "catchup" || c.partial ? 1 : 0; x.g *= 1 + (c.net_main || 0); mm.set(k, x); });
  const byMonth = [...mm.values()].map((x) => ({ ...x, r: x.g - 1 })).reverse();
  const shown = weeks.slice(-26);
  const cell = (w, di) => {
    const d = new Date(w); d.setUTCDate(d.getUTCDate() + di);
    const ds = d.toISOString().slice(0, 10), c = byDate.get(ds);
    if (!c) return h("span", { class: "x" });
    const cls = `${c.net_main > 0.00005 ? "u" : c.net_main < -0.00005 ? "d" : "f"}${step(c.net_main)}${c.mode === "catchup" || c.partial ? " hatch" : ""}`;
    return h("span", { class: `c ${cls}`, tabindex: "0", "data-tip": `${day(ds)} · main book ${sign(c.net_main, fmt.p2)}${c.mode === "catchup" ? " · catch-up" : ""}${c.partial ? " · partial" : ""}`, "aria-label": `${day(ds)}: ${sign(c.net_main, fmt.p2)}` },
      Math.abs(c.net_main || 0) < 0.00005 ? "0.0" : sign(c.net_main, U.PF[1]).replace("%", ""));
  };
  return [h("div", { class: "lab-cal", role: "grid", "aria-label": "Main book net return by session, in percent" },
    h("span", { class: "c0" }, "Week of"), ["Mon", "Tue", "Wed", "Thu", "Fri"].map((x) => h("span", { class: "dn" }, x)),
    shown.map((w) => [h("span", { class: "wk" }, dayShort(w.toISOString())), [0, 1, 2, 3, 4].map((di) => cell(w, di))])),
    weeks.length > shown.length ? h("p", { class: "note" }, `The last 26 weeks; earlier sessions are in the month table below.`) : null,
    h("div", { class: "lab-cal-key" }, h("span", {}, "Down"), [4, 3, 2, 1].map((s) => h("i", { class: `d${s}` })), h("i", { class: "f1" }), [1, 2, 3, 4].map((s) => h("i", { class: `u${s}` })), h("span", {}, "Up"), h("span", { class: "grow" }), h("span", {}, "% a session · steps 0.25, 1, 2.5")),
    h("div", { class: "stats two" },
      stat("Sessions", U.int(cal.length), `${U.int(up)} up · ${U.int(dn)} down · ${U.int(cal.length - up - dn)} flat`),
      stat("Median session", nets.length ? signed([...nets].sort((a, b) => a - b)[Math.floor(nets.length / 2)], fmt.p2) : "—", "main book, net"),
      stat("Highest", best ? signed(best.net_main, fmt.p2) : "—", best ? U.d(best.session) : ""),
      stat("Lowest", worst ? signed(worst.net_main, fmt.p2) : "—", worst ? U.d(worst.session) : "")),
    h("div", { class: "section-l" }, "By month, main book"),
    table({ caption: "Main book by month", cls: "compact", rows: byMonth, cols: [
      { key: "m", label: "Month", fmt: (x) => month(x.m) },
      { key: "n", label: "Sessions", num: true, fmt: (x) => U.int(x.n) },
      { key: "u", label: "Up · down", num: true, fmt: (x) => `${U.int(x.up)} · ${U.int(x.dn)}` },
      { key: "c", label: "Catch-up", num: true, fmt: (x) => U.int(x.cu) },
      { key: "r", label: "Net, compounded", num: true, fmt: (x) => signed(x.r, fmt.p2) }] })];
}
