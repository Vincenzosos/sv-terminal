/* Markets Briefing (#/news), "The Night Gallery" (21 Nov 2026). The owner's references: websites as pictures on a curved
   wall around the viewer under a starry sky with an aurora, one lifted toward you, a label at the bottom left with "Step
   inside" and a quiet list on the right; and a tunnel of cards (now the entrance, once a session). His verdicts: "exceptional
   AND CLEAN, no extra stuff", no boxed tiles or sparklines, the phone like the PC, a scroll that works.
     Room   one circular room at night: one WebGL fragment shader draws the sky, the wall and the floor (half resolution,
            at most 30 frames a second, paused when hidden or under a dialog); one row of plates of the same size, each a
            picture (a map with logos, big figures, a logo mosaic, a poster); the focal plate sits on the screen plane at
            its CSS size, so its text and logos are crisp. All reading text lives in one label at the bottom left, with a
            quiet guide on the right (desktops) or a Contents sheet (tablets, phones), and one legal line. The page never
            scrolls: one controller owns the position for the wheel, the trackpad, touch, a mouse drag and the keys, and
            an exact critically damped spring draws it.
     Page   the same edition as a front page (24 Nov 2026): the lede and the close, a sticky row of sections, the map
            beside the biggest moves, each section's lead story first, the week ahead, the wire. Reduced motion, no WebGL,
            or the reader's choice (this browser only; stored as "list", the view's first name).
   Every story and wire line keeps its source, time and link; every ticker gets its logo or a monogram; a company card says
   where the company is listed. The data: GET /api/news/digest (newsroom.py). Nodes are built with h() only. Styles:
   css/site.css. */
(function () {
  "use strict";

  /* ================================================================ basics */
  const ok = (x) => x != null && Number.isFinite(x);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (t) => t * t * (3 - 2 * t);
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
  const narrow = () => innerWidth < 700;
  const LEGAL = "Facts, not investment advice · educational · paper-money site · summaries by Claude, an AI model";
  const PREF = "sv-news-view", HINT = "sv-news-hint", AT = "sv-news-at", SEEN = "sv-news-in";
  const ONCE = { hint: false, entrance: false };          // without storage: once per page load
  function keep(where, key, v) {
    try {
      const s = where === "session" ? sessionStorage : localStorage;
      if (v === undefined) return s.getItem(key);
      s.setItem(key, v);
    } catch (_) { /* a private window or blocked site data: the page works without it */ }
    return null;
  }
  /* the reader's view, remembered in this browser: "room" or "list" (v2's "tunnel" is the entrance now, so it reads as the room) */
  function pref(v) {
    if (v !== undefined) { keep("local", PREF, v); return v; }
    const p = keep("local", PREF);
    return p === "tunnel" ? "room" : p === "room" || p === "list" ? p : null;
  }
  /* WebGL, probed once a session (a cold probe can hold the main thread for long on a software renderer), and only when
     the room is the answer: the Page never waits for it */
  let GL_OK = null;
  const GLKEY = "sv-news-gl";
  const glKnown = () => GL_OK !== null || keep("session", GLKEY) === "1" || keep("session", GLKEY) === "0";
  function glOk() {
    if (GL_OK !== null) return GL_OK;
    const was = keep("session", GLKEY);
    if (was === "1" || was === "0") { GL_OK = was === "1"; return GL_OK; }
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      GL_OK = !!gl;
      const lose = gl && gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    } catch (_) { GL_OK = false; }
    keep("session", GLKEY, GL_OK ? "1" : "0");
    return GL_OK;
  }
  /* the room needs WebGL; reduced motion opens the Page unless the reader chose the room */
  const wantRoom = () => { const p = pref(); return p ? p === "room" : !still(); };
  const view = () => (wantRoom() && glOk() ? "room" : "list");

  /* ---------------------------------------------------------------- words and numbers */
  const newTab = () => h("span", { class: "sr-only" }, " (opens in a new tab)");
  const fmtTZ = (o) => new Intl.DateTimeFormat("en-GB", Object.assign({ timeZone: "Europe/Berlin", hourCycle: "h23" }, o));
  const F_TIME = fmtTZ({ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const F_DAY = fmtTZ({ weekday: "short", day: "numeric", month: "short" });
  const F_YEAR = fmtTZ({ weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const F_LONG = fmtTZ({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const F_WEEKDAY = fmtTZ({ weekday: "long" });
  const F_HM = fmtTZ({ hour: "2-digit", minute: "2-digit" });
  const parts = (f, d) => Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const dateOf = (iso) => new Date(/^\d{4}-\d\d-\d\d$/.test(iso || "") ? `${iso}T12:00:00Z` : iso);
  function when(iso, dateOnly) {
    const d = dateOf(iso);
    if (isNaN(d)) return "";
    if (dateOnly) { const p = parts(F_DAY, d); return `${p.weekday} ${p.day} ${p.month}`; }
    const p = parts(F_TIME, d);
    return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
  }
  const dayOf = (s) => when(s, true);
  const dayNum = (s) => { const d = dateOf(s); if (isNaN(d)) return ""; const p = parts(F_DAY, d); return `${p.weekday} ${p.day}`; };
  const weekday = (s) => { const d = dateOf(s); return isNaN(d) ? "the day" : F_WEEKDAY.format(d); };
  function edition(D, short) {
    const d = new Date(D && D.generated_at);
    if (isNaN(d)) return "";
    const p = parts(short ? F_YEAR : F_LONG, d), t = parts(F_HM, d);
    return `${p.weekday} ${p.day} ${p.month} ${p.year} · ${t.hour}:${t.minute} Berlin`;
  }
  const pct = (x, f = fmt.p1) => (ok(x) ? sign(x, f) : "—");
  const toneOf = (x) => (x > 0.00005 ? "nw-up" : x < -0.00005 ? "nw-down" : null);
  const pad = (n) => String(n).padStart(2, "0");
  const bp = (x) => `${x > 0 ? "+" : x < 0 ? MINUS : ""}${Math.abs(x)} bp`;
  const money = (bn) => (bn >= 1000 ? `$${(bn / 1000).toFixed(2)} trillion` : `$${Math.round(bn)} billion`);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const cap1 = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (_) { return ""; } };
  const sentences = (s) => String(s || "").trim().split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
  const FUNDS_NOTE = "Funds and commodities quoted by Lang & Schwarz (indicative, for personal use); Brent crude from Lang & Schwarz too (from FRED, with its dates, when no recent quote); the US 10-year yield from FRED. A fund's move is not its index's move.";
  const MAP_SOURCE = "Lang & Schwarz closes in US dollars, 23:00 Berlin; market values from shares outstanding in SEC filings.";
  /* a market's figures: the level for a rate, a yield or Brent; otherwise the change (a fund's price is not the index) */
  function tileFigures(t) {
    const chg = ok(t.change_bp) ? bp(t.change_bp) : pct(t.change, fmt.p2);
    const tone = ok(t.change_bp) ? toneOf(t.change_bp) : toneOf(t.change);
    let level = null;
    if (t.show_last && ok(t.last)) level = t.unit === "%" ? `${t.last.toFixed(2)}%` : t.unit === "$" ? `$${t.last.toFixed(2)}` : t.last.toFixed(4);
    return { chg, tone, level };
  }
  /* honest labels: the board's S&P 500 figure is the iShares fund's move, so it reads "S&P 500 ETF" */
  const labelOf = (b) => `${b.label}${/ETF/.test(b.what || "") ? " ETF" : ""}`;
  const chgEl = (b, cls) => {
    const f = tileFigures(b);
    return h("span", { class: [cls, f.tone].filter(Boolean).join(" ") || null, title: ok(b.change_bp) ? "basis points" : null }, f.chg);
  };
  const figText = (b) => { const f = tileFigures(b); return f.level ? `${f.level} ${f.chg}` : f.chg; };

  /* ---------------------------------------------------------------- the edition */
  const S = { D: null, stories: [], stops: [], el: null, mode: null, off: [], on: false, url: {}, plates: [], focal: -1,
    pos: 0, vel: 0, target: 0, walk: "idle", raf: 0, tPrev: 0, dirty: false, drag: null, anims: [], entering: false };
  function listen(target, type, fn, opt) {
    target.addEventListener(type, fn, opt);
    S.off.push(() => target.removeEventListener(type, fn, opt));
  }
  function flatten(D) {
    const out = [];
    (D.sections || []).forEach((s) => (s.items || []).forEach((it) => out.push(Object.assign({}, it, { sec: s.title, secId: s.id }))));
    out.forEach((it, i) => { it.n = i + 1; });
    return out;
  }
  const meta = (it) => `${it.source} · ${when(it.published, it.date_only)}`;
  const tickersOf = (it) => (it.tickers && it.tickers.length ? it.tickers : it.spark && it.spark.ticker ? [it.spark.ticker] : []);
  const mapOf = (key) => (!S.D ? null : key === "spx" ? S.D.map || null : (S.D.maps || {})[key] || null);
  const boardOf = (key) => ((S.D && S.D.board) || []).find((b) => b.key === key) || null;
  function mapKeys() {
    const keys = mapOf("spx") ? ["spx"] : [];
    ((S.D && S.D.board) || []).forEach((b) => { if (b.key !== "spx" && mapOf(b.key)) keys.push(b.key); });
    Object.keys((S.D && S.D.maps) || {}).forEach((k) => { if (!keys.includes(k) && mapOf(k)) keys.push(k); });
    return keys;
  }
  const mapName = (key) => { const b = boardOf(key), mp = mapOf(key); return (b && b.label) || (mp && mp.index) || (key === "spx" ? "S&P 500" : key.toUpperCase()); };
  /* the map's companies, in words: "The 200 largest companies", "The Nasdaq-100 companies in the S&P 500" */
  const ofText = (mp) => {
    const of = String(mp.of || "");
    return cap1(!of || /^the largest\b/i.test(of) ? `the ${mp.n} largest companies` : of.replace(/\s+by market value$/i, ""));
  };
  function rowOf(t) {
    if (!S.D || !t) return null;
    for (const mp of [S.D.map, ...Object.values(S.D.maps || {})]) {
      if (!mp) continue;
      const r = mp.rows.find((x) => x.t === t);
      if (r) return { r, mp };
    }
    return null;
  }
  const wireOf = (t) => ((S.D && S.D.wire) || []).filter((w) => t && w.ticker === t);
  const moverOf = (t) => (S.D && S.D.moves ? [...(S.D.moves.up || []), ...(S.D.moves.down || [])].find((y) => y.ticker === t) || null : null);
  /* a company has a card when the page knows it: on a map, on the wire or among the movers */
  const hasCard = (t) => !!t && (!!rowOf(t) || wireOf(t).length > 0 || !!moverOf(t));
  /* a company's name as people write it: "The Coca-Cola Company", not "Coca-Cola Company (The)"; "Workday", not
     "Workday, Inc." (the SEC's and the index's spellings) */
  const cleanName = (n) => String(n || "").trim().replace(/^(.*?)\s*\(The\)$/, "The $1").replace(/,?\s+Inc\.?(?=\s*\(|$)/, "").trim();
  const nameOf = (t) => {
    const x = rowOf(t);
    if (x) return cleanName(x.r.n);
    const mv = moverOf(t);
    if (mv) return cleanName(mv.name);
    const w = wireOf(t).find((y) => y.title.includes(":"));
    return w ? cleanName(w.title.slice(0, w.title.indexOf(":"))) : t;
  };
  /* a share class the page does not carry under that ticker (GOOGL in a story, GOOG on the map): the one it carries */
  const CLASS_ALIAS = { GOOGL: "GOOG", GOOG: "GOOGL", FOXA: "FOX", FOX: "FOXA", NWSA: "NWS", NWS: "NWSA", "BRK.B": "BRK-B", "BRK-B": "BRK.B", "BF.B": "BF-B", "BF-B": "BF.B" };
  const carried = (t) => (hasCard(t) || !CLASS_ALIAS[t] || !hasCard(CLASS_ALIAS[t]) ? t : CLASS_ALIAS[t]);
  /* the name on a poster: no "Inc.", "Corporation" or share class ("Alphabet", "Coca-Cola") */
  const shortCo = (n) => cleanName(n).replace(/\s*\(Class [A-Z]\)$/, "").replace(/^The\s+/, "")
    .replace(/,?\s+(?:Corporation|Corp\.?|Company|Co\.|Incorporated|plc|PLC|Ltd\.?|Limited|Holdings|Group)$/i, "").trim();

  /* the story's key figure, as its title (or else the first fact that has one) writes it: an amount, a percentage or a
     range of them, or basis points; the kicker is the words before it in its own clause ("ANTHROPIC RAISES" $93.5
     billion). A list stays whole ("NVIDIA, AMD, MICRON AND BROADCOM FALL" 12% to 14%): a comma cuts only a clause of
     more than six words. */
  const FIGURE = /(?:US)?[$€£]\s?\d[\d,.]*(?:\s?(?:billion|million|trillion))?|[+−-]?\d[\d,.]*\s?%(?:\s?to\s?[+−-]?\d[\d,.]*\s?%)?|\d+\s?(?:basis points|bp)\b/i;
  const nWords = (s) => (String(s).trim() ? String(s).trim().split(/\s+/).length : 0);
  function kickerOf(before) {
    let s = before;
    const strong = Math.max(s.lastIndexOf(";"), s.lastIndexOf(":"), s.lastIndexOf("("), s.lastIndexOf("—"));
    if (strong >= 0) s = s.slice(strong + 1);
    if (nWords(s) > 6 && s.lastIndexOf(",") >= 0) s = s.slice(s.lastIndexOf(",") + 1);
    for (const w of [" as ", " after ", " while "]) { const k = s.lastIndexOf(w); if (k >= 0) s = s.slice(k + w.length); }
    s = s.trim().replace(/^(?:The|A|An)\s+/, "");
    const n = nWords(s);
    return n >= 1 && n <= 6 && /^[A-Z0-9]/.test(s) ? s : "";
  }
  function keyFigure(it) {
    for (const text of [it.title || "", ...(it.facts || [])]) {
      const m = FIGURE.exec(text);
      if (m) return { fig: m[0].trim().replace(/[.,]+$/, ""), kick: kickerOf(text.slice(0, m.index)) };
    }
    return null;
  }
  /* a guide row's words (desktops): the whole title when it fits the row; else the title up to its key figure, or to its
     first clause break, or cut at a whole word; never an ellipsis, never a figure cut in two ("S&P 500 falls 3.7%",
     "Walmart raises its full-year sales outlook") */
  const GUIDE_MAX = 40, GUIDE_PX = 270;
  const DANGLING = /\s+(?:a|an|the|of|in|on|at|to|for|by|from|with|and|or|as|after|while|about|nearly|almost|over|under|than|more|its|their|alongside|amid|despite|against|toward|towards|into|through|across|above|below|ahead|before|since|until|per|via)$/i;
  function guideLabel(s) {
    if (s.kind !== "story") return s.label;
    const it = s.it, t = String(it.title || "").trim().replace(/[.!?]+$/, "");
    const fits = (x) => x.length <= GUIDE_MAX || textW(x, 13, 500) <= GUIDE_PX;
    if (fits(t)) return t;
    const m = FIGURE.exec(t);
    const toFig = m ? t.slice(0, m.index + m[0].length).replace(/[.,]+$/, "") : null;
    const after = m ? t.slice(m.index + m[0].length) : "";
    const figEnds = !!m && /^\s*(?:$|[,;:.)—]|(?:and|as|after|while|on|in|to|from|with|but|amid|despite|since|for|at|than|or)\b)/i.test(after);
    /* a figure never stands without what it measures: "$4.37 billion fourth-quarter revenue" up to the next break, or its
       last word ("revenue") */
    const what = m && !figEnds ? after.split(/[,;:.)—]|\s(?:as|after|while|on|in|to|from|with|but|amid|despite|since|for|at|than|above|below)\s/i)[0].trim() : "";
    const last = what.split(/\s+/).pop() || "", head = /^[a-z][a-z-]{2,}$/i.test(last) ? `${/^of\s/i.test(what) ? "of " : ""}${last}` : "";
    const cut = t.search(/[:;,]| as | after | while /);
    const clause = cut >= 12 || (cut > 0 && t[cut] === ":" && nWords(t.slice(0, cut)) >= 2) ? t.slice(0, cut).trim() : null;
    if (toFig && figEnds && fits(toFig)) return toFig;
    if (clause && fits(clause)) return clause;
    if (toFig && what && nWords(what) <= 3 && fits(`${toFig} ${what}`)) return `${toFig} ${what}`;
    if (toFig && head && fits(`${toFig} ${head}`)) return `${toFig} ${head}`;
    const tk = tickersOf(it);                                 // one company and a figure: "Analog Devices · $4.37 billion revenue"
    if (m && tk.length === 1) {
      const nm = nameOf(tk[0]), fig = m[0].trim().replace(/[.,]+$/, "");
      if (nm !== tk[0] && t.startsWith(nm)) {
        for (const x of [what && `${nm} · ${fig} ${what}`, head && `${nm} · ${fig} ${head}`, figEnds && `${nm} · ${fig}`]) if (x && fits(x)) return x;
      }
    }
    let w = t.slice(0, GUIDE_MAX + 1);
    w = w.slice(0, Math.max(w.lastIndexOf(" "), 1));
    if (m && m.index < w.length) w = t.slice(0, m.index).trim();
    /* never inside a list ("its October 19" | "and October 28 meetings"): back to before it, then no dangling word */
    if (/\d$/.test(w) && /^\s*(?:and|or|to|through|–|-)\s/i.test(t.slice(w.length))) {
      w = w.replace(/\s+(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+)?[$€£]?\d[\d,.]*%?$/i, "");
    }
    for (let k = 0; k < 3 && DANGLING.test(w); k++) w = w.replace(DANGLING, "");
    return w;
  }

  /* ---------------------------------------------------------------- logo tiles: one component everywhere */
  let LOGOS = new Set();
  const INST = [[/European Central Bank|\bECB\b/, "ECB"], [/Federal Reserve/, "Fed"], [/Bank of England/, "BoE"], [/Bank of Japan/, "BoJ"],
    [/Office for National Statistics/, "ONS"]];
  const initials = (s) => String(s || "").split(/[\s,]+/).filter((w) => /^[A-Z]/.test(w) && !/^(Of|The|For|And|In)$/.test(w)).map((w) => w[0]).join("").slice(0, 4);
  const shortName = (src) => { for (const [re, k] of INST) if (re.test(src || "")) return k; return initials(src); };
  const INST_FULL = { ECB: "European Central Bank", Fed: "Federal Reserve", BoE: "Bank of England", BoJ: "Bank of Japan", ONS: "Office for National Statistics" };
  const instName = (src) => { for (const [re, k] of INST) if (re.test(src || "")) return INST_FULL[k]; return String(src || ""); };
  /* a poster's kicker when its story has no figure: what kind of news it is, else its section */
  const KINDS = [[/\bminutes\b/i, "Minutes"], [/\b(?:speech|remarks|testimony)\b/i, "Speech"], [/\brate decision\b|\b(?:holds|raises|cuts|lowers|keeps)\b[^.]*\b(?:rates?|policy)\b/i, "Rate decision"],
    [/\bstatement\b/i, "Statement"], [/\b(?:guidance|outlook|forecast)\b/i, "Outlook"], [/\b(?:results|earnings|quarter)\b/i, "Results"],
    [/\b(?:acquire|acquisition|merger|to buy|takeover)\b/i, "Deal"]];
  const kindOf = (it) => { for (const [re, k] of KINDS) if (re.test(it.title || "")) return k; return it.sec || ""; };
  /* a title's first clause ("Futures turned lower Tuesday"), at most about six words */
  const firstClause = (title) => {
    let s = bare(title).split(/[:;—]|\s(?:as|after|while|amid|despite)\s/)[0].trim();
    if (s.length > 44) { s = s.slice(0, 45); s = s.slice(0, Math.max(s.lastIndexOf(" "), 1)); for (let k = 0; k < 3 && DANGLING.test(s); k++) s = s.replace(DANGLING, ""); }
    return s;
  };
  /* Some PNGs are upscaled favicons or wordmarks (21 Nov 2026): above 28px they blur (NVDA dithers) or cannot be read.
     Until the owner approves sharper files of 128px or more: a logo on a light ground is drawn at 28px, centered on its
     tile (still a logo, and crisp); a logo that fills its square or is a wordmark gives way to its monogram. */
  const SOFT_INSET = new Set(["NVDA", "AMD", "UNH", "HCA", "STX", "COHR"]);
  const SOFT_MONO = new Set(["EL", "TSN", "MS", "CPAY"]);
  const hasLogo = (t, px = 28) => !!t && LOGOS.has(t) && !(SOFT_MONO.has(t) && px > 28);
  /* a square at most 48px (the PNGs are 64px): the logo on a light plate once it loads, or the ticker as a monogram */
  function tile(t, px, o = {}) {
    const fs = Math.max(o.floor || 11, 0.3 * px);
    const most = clamp(Math.floor((0.92 * px) / (0.7 * fs)), 1, 4);
    const inset = !!t && SOFT_INSET.has(t) && px > 28;
    const el = h("span", { class: `nw-lt${o.cls ? ` ${o.cls}` : ""}${inset ? " is-inset" : ""}`, style: `--lt:${px.toFixed(1)}px;--lf:${fs.toFixed(1)}px`, "aria-hidden": "true" });
    const mono = (text) => { el.classList.remove("is-inset"); el.classList.add("is-mono"); el.replaceChildren(text); };
    if (o.inst) { el.classList.add("is-inst"); el.append(o.inst); return el; }
    if (o.more) { mono(o.more); return el; }
    if (hasLogo(t, px)) {
      const img = h("img", { src: `logos/${t.replace(".", "_")}.png`, alt: "", width: 64, height: 64, decoding: "async", draggable: "false" });
      img.addEventListener("load", () => el.classList.add("is-in"), { once: true });
      img.addEventListener("error", () => mono(String(t).replace(/\..*$/, "").slice(0, most)), { once: true });
      el.append(img);
      if (img.complete && img.naturalWidth) el.classList.add("is-in");
    } else mono(String(t || "").replace(/\..*$/, "").slice(0, most));
    return el;
  }
  const instTile = (src, px, o = {}) => tile(null, px, Object.assign({}, o, { inst: shortName(src) }));

  /* ================================================================ the map: a squarified treemap */
  function squarify(items, x, y, w, hgt) {
    const out = [];
    let rest = items.filter((it) => it.v > 0).sort((a, b) => b.v - a.v);
    const total = rest.reduce((a, b) => a + b.v, 0);
    if (!total || w <= 0 || hgt <= 0) return out;
    const k = (w * hgt) / total;
    const worst = (row, side) => {
      const s = row.reduce((a, b) => a + b.v * k, 0), mx = Math.max(...row.map((r) => r.v * k)), mn = Math.min(...row.map((r) => r.v * k));
      return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
    };
    while (rest.length) {
      const side = Math.min(w, hgt);
      const row = [rest[0]];
      let i = 1;
      while (i < rest.length && worst(row.concat(rest[i]), side) <= worst(row, side)) row.push(rest[i++]);
      const s = row.reduce((a, b) => a + b.v * k, 0);
      if (w >= hgt) {
        const rw = s / hgt;
        let yy = y;
        row.forEach((r) => { const rh = (r.v * k) / rw; out.push(Object.assign({}, r, { x, y: yy, w: rw, h: rh })); yy += rh; });
        x += rw; w -= rw;
      } else {
        const rh = s / w;
        let xx = x;
        row.forEach((r) => { const rw2 = (r.v * k) / rh; out.push(Object.assign({}, r, { x: xx, y, w: rw2, h: rh })); xx += rw2; });
        y += rh; hgt -= rh;
      }
      rest = rest.slice(row.length);
    }
    return out;
  }
  /* a move's color: graphite at zero, deepening to green or red by 3% (a signed number: the one place for them); both ends
     keep white type at 4.5:1 or more */
  function heat(m) {
    const t = Math.min(1, Math.abs(m || 0) / 0.03) ** 0.75;
    const base = [34, 38, 46], to = m >= 0 ? [24, 128, 74] : [196, 50, 58];
    const c = base.map((b, i) => Math.round(b + (to[i] - b) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }
  function sectorsOf(mp) {
    const by = new Map();
    mp.rows.forEach((r) => {
      if (!by.has(r.s)) by.set(r.s, { name: r.s, cap: 0, wm: 0, rows: [] });
      const s = by.get(r.s);
      s.cap += r.c; s.wm += r.c * r.m; s.rows.push(r);
    });
    const known = new Map((mp.sectors || []).map((s) => [s.name, s]));
    return [...by.values()].map((s) => ({ name: s.name, cap: s.cap, rows: s.rows, move: known.has(s.name) ? known.get(s.name).move : s.wm / s.cap }))
      .sort((a, b) => b.cap - a.cap);
  }
  let CTX = null;
  function textW(s, px, weight = 700, track = 0) {
    if (!CTX) CTX = document.createElement("canvas").getContext("2d");
    CTX.font = `${weight} ${px}px Inter, system-ui, sans-serif`;
    return CTX.measureText(s).width + track * px * String(s).length;
  }
  /* a sector's name where the whole one does not fit: a medium name, then a short one */
  const SEC_SHORT = { "Information Technology": ["Technology", "Tech"], "Communication Services": ["Communication", "Comm."],
    "Consumer Discretionary": ["Discretionary", "Discr."], "Consumer Staples": ["Staples", "Staples"], "Health Care": ["Health care", "Health"],
    "Real Estate": ["Real estate", "Real est."], Materials: ["Materials", "Mat."], Utilities: ["Utilities", "Util."],
    Industrials: ["Industrials", "Ind."], Financials: ["Financials", "Fin."], Energy: ["Energy", "Energy"] };
  function secName(name, room, px, weight, track = 0, upper = false) {
    const all = [name, ...(SEC_SHORT[name] || [])];
    for (const n of all) if (textW(upper ? n.toUpperCase() : n, px, weight, track) <= room) return n;
    return null;
  }
  const px1 = (v) => `${v.toFixed(1)}px`;
  const legend = () => h("div", { class: "nw-legend", "aria-hidden": "true" }, ["−3%", "−2%", "−1%", "0%", "+1%", "+2%", "+3%"].map((x, i) =>
    h("span", { style: `background:${heat((i - 3) / 100)}` }, x)));

  /* the map as a picture on a plate (the focal size w × h): no caption and no sector names, the label carries the words.
     In a big box the logo comes first (or the monogram), then the ticker, whole, at 9px or more, then its move */
  function mapPicture(mp, w, hgt) {
    const nodes = [];
    squarify(sectorsOf(mp).map((s) => ({ v: s.cap, s })), 0, 0, w, hgt).forEach((sr) => {
      squarify(sr.s.rows.map((r) => ({ v: r.c, r })), sr.x + 1, sr.y + 1, sr.w - 2, sr.h - 2).forEach((c) => {
        const bw = c.w - 2, bh = c.h - 2;
        if (bw <= 0.5 || bh <= 0.5) return;
        const t = c.r.t, mv = pct(c.r.m), side = Math.min(bw, bh);
        const showL = side >= 0.105 * w;
        const ls = showL ? Math.min(0.34 * side, 0.07 * w, 48) : 0, lift = showL ? ls + 4 : 0;
        let font = Math.min(bw / 4.4, bh / 3.2, 0.05 * w);
        if (showL) font = Math.min(font, (bh - ls - 12) / 2.6);
        font = Math.min(font, ((bw - 4) / Math.max(1, textW(t, 10))) * 10);
        const showT = font >= 9 && bh >= lift + font + 4;
        const showM = showT && 0.8 * font >= 9 && bh >= lift + 2.6 * font + 6 && textW(mv, 0.8 * font, 500) <= bw - 4;
        nodes.push(h("span", { class: "nw-mp", style: `left:${px1(c.x + 1)};top:${px1(c.y + 1)};width:${px1(bw)};height:${px1(bh)};background:${heat(c.r.m)};font-size:${Math.max(1, font).toFixed(2)}px` },
          showL ? tile(t, ls, { floor: 9, cls: "is-flat" }) : null, showT ? h("b", {}, t) : null, showM ? h("i", {}, mv) : null));
      });
    });
    return nodes;
  }

  /* the map you can use: sectors with their names (a header zooms into the sector), companies with their logos where they
     fit; a box opens the company's card. Phones: the sectors first, a sector opens its companies. */
  function treemap(mp, o) {
    const T = { mp, o, zoom: null, pick: null, layer: null, rects: [] };
    T.el = h("div", { class: `nw-tm${o.lit && o.lit.size ? " is-lit" : ""}`, role: "group",
      "aria-label": `${o.name || "The map"}: ${sectorsOf(mp).map((s) => `${s.name} ${pct(s.move)}`).join(", ")}` });
    let t = null, w0 = 0, h0 = 0;
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => {
        const w = T.el.clientWidth, hh = T.el.clientHeight;
        if (!w || !hh || (w === w0 && hh === h0)) return;
        clearTimeout(t);
        t = setTimeout(() => {                                  // a phone turned into a tablet (or back): its own map
          const ph = narrow(), was = T.zoom;
          if (ph !== !!T.o.phone) { T.o.phone = ph; T.zoom = null; }
          T.draw();
          if (was && !T.zoom && T.o.onZoom) T.o.onZoom(null, null);
        }, w0 ? 120 : 0);
      });
      ro.observe(T.el);
      T.stop = () => ro.disconnect();
    }
    T.setPick = (tk) => {
      T.pick = tk;
      T.el.classList.toggle("is-picking", !!tk);
      T.el.querySelectorAll(".nw-tm-box").forEach((b) => b.classList.toggle("is-pick", b.dataset.t === tk));
      const b = tk && T.el.querySelector(`.nw-tm-box[data-t="${CSS.escape(tk)}"]`);
      if (b) rove(T, b);
    };
    T.draw = () => { w0 = T.el.clientWidth; h0 = T.el.clientHeight; tmDraw(T); };
    /* one tab stop in the map (its boxes and its sectors' headers): the arrow keys move to the nearest one that way, Home
       and End to the first and the last */
    T.el.addEventListener("keydown", (e) => {
      const b = e.target.closest && e.target.closest(TM_STOPS);
      if (!b || e.altKey || e.ctrlKey || e.metaKey) return;
      const all = [...T.el.querySelectorAll(TM_STOPS)];
      const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
      let to = null;
      if (e.key === "Home") to = all[0];
      else if (e.key === "End") to = all[all.length - 1];
      else if (dir) {
        const c = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
        const [x0, y0] = c(b);
        let best = Infinity;
        all.forEach((el) => {
          if (el === b) return;
          const [x1, y1] = c(el), along = (x1 - x0) * dir[0] + (y1 - y0) * dir[1], across = Math.abs((x1 - x0) * dir[1] + (y1 - y0) * dir[0]);
          if (along <= 1) return;
          const score = along + 2 * across;
          if (score < best) { best = score; to = el; }
        });
      } else return;
      e.preventDefault();
      e.stopPropagation();
      if (to) { rove(T, to); to.focus({ preventScroll: true }); }
    });
    return T;
  }
  const TM_STOPS = ".nw-tm-box, .nw-tm-tile, .nw-tm-sh";
  function rove(T, el) {
    T.el.querySelectorAll(TM_STOPS).forEach((b) => { b.tabIndex = b === el ? 0 : -1; });
  }
  function tmDraw(T) {
    const W = T.el.clientWidth, H = T.el.clientHeight;
    if (!W || !H) return;
    const nodes = [], lit = T.o.lit || new Set();
    const secs = sectorsOf(T.mp);
    T.rects = squarify(secs.map((s) => ({ v: s.cap, s })), 0, 0, W, H);
    if (T.zoom) {
      const s = secs.find((x) => x.name === T.zoom);
      if (s) tmBoxes(T, s.rows, 0, 0, W, H, nodes, lit);
    } else if (T.o.phone) {
      T.rects.forEach((sr) => nodes.push(tmSector(T, sr, lit)));
    } else {
      T.rects.forEach((sr) => {
        const head = sr.w >= 80 && sr.h >= 50 ? 20 : 0;
        if (head) {
          const mv = pct(sr.s.move), room = sr.w - 2 - 10 - 6 - textW(mv, 11, 600, 0.02);
          const nm = secName(sr.s.name, room, 11, 600, 0.06, true);
          nodes.push(h("button", { type: "button", class: "nw-tm-sh", "data-s": sr.s.name, style: `left:${px1(sr.x + 1)};top:${px1(sr.y)};width:${px1(sr.w - 2)}`,
            "aria-label": `${sr.s.name}, ${mv}: zoom into its companies`, onclick: (e) => { if (!stale(T, e)) zoomIn(T, sr.s.name); } },
          nm ? h("span", { class: "n" }, nm) : null, h("span", { class: toneOf(sr.s.move) }, mv)));
        }
        tmBoxes(T, sr.s.rows, sr.x + 1, sr.y + head + 1, sr.w - 2, sr.h - head - 2, nodes, lit);
      });
    }
    /* drawn again (a resize, the header growing a line): the box or the tile that had the focus keeps it */
    const a = document.activeElement, sel = a && T.el.contains(a) && a.dataset
      ? (a.dataset.t ? `[data-t="${CSS.escape(a.dataset.t)}"]` : a.dataset.s ? `[data-s="${CSS.escape(a.dataset.s)}"]` : null) : null;
    T.layer = h("div", { class: "nw-tm-layer" }, nodes);
    T.el.replaceChildren(T.layer);
    const isBox = (n) => n.classList && (n.classList.contains("nw-tm-box") || n.classList.contains("nw-tm-tile"));
    const stops = nodes.filter((n) => isBox(n) || (n.classList && n.classList.contains("nw-tm-sh")));
    const back = sel && T.el.querySelector(sel);
    const cur = (back && stops.includes(back) && back) || stops.find((n) => T.pick && n.dataset.t === T.pick) || stops.find(isBox) || stops[0];
    stops.forEach((n) => { n.tabIndex = n === cur ? 0 : -1; });
    if (back) back.focus({ preventScroll: true });
  }
  /* a double click, or a click that lands within 400ms of the map opening (the second click of the one that opened it),
     opens nothing */
  const stale = (T, e) => (e && e.detail > 1) || !!(T.o.fresh && T.o.fresh());
  function tmBoxes(T, rows, x, y, w, hgt, nodes, lit) {
    const big = T.o.phone ? 72 : 62, W = T.el.clientWidth;
    squarify(rows.map((r) => ({ v: r.c, r })), x, y, w, hgt).forEach((c) => {
      const bw = c.w - 1, bh = c.h - 1;
      if (bw <= 0.5 || bh <= 0.5) return;
      const r = c.r, mv = pct(r.m), side = Math.min(bw, bh), on = lit.has(r.t);
      /* the logo first (or its monogram) in every big box, then the ticker, whole, at 9px or more, then the move at 11px */
      const showL = side >= big;
      const ls = showL ? clamp(0.32 * side, 18, 40) : 0, lift = showL ? ls + 4 : 0;
      let font = Math.min(bw / 4.2, bh / 3.4, 24);
      if (showL) font = Math.min(font, (bh - ls - 12) / 2.6);
      font = Math.min(font, ((bw - 6) / Math.max(1, textW(r.t, 10))) * 10);
      let showT = font >= 9 && bh >= lift + font + 4;
      const showM = showT && 0.78 * font >= 11 && bh >= lift + 2.6 * font + 8 && textW(mv, 0.78 * font, 500) <= bw - 6;
      let pill = null;
      if (on && !showT) {                                     // a lit box always names its company
        if (textW(r.t, 9) <= bw - 2 && bh >= 11) { font = 9; showT = true; }
        else {
          const above = c.y > 18, cx = clamp(c.x + 0.5 + bw / 2, 22, Math.max(22, W - 22));
          pill = h("span", { class: `nw-tm-pill${above ? "" : " is-below"}`, "aria-hidden": "true",
            style: `left:${px1(cx)};top:${px1(above ? c.y - 2 : c.y + bh + 2)}` }, r.t);
        }
      }
      const cls = `nw-tm-box${on ? " is-lit" : ""}${T.pick === r.t ? " is-pick" : ""}`;
      nodes.push(h("button", { type: "button", class: cls, "data-t": r.t, "aria-label": `${r.n} (${r.t}), ${mv}`,
        style: `left:${px1(c.x + 0.5)};top:${px1(c.y + 0.5)};width:${px1(bw)};height:${px1(bh)};background:${heat(r.m)};font-size:${Math.max(1, font).toFixed(1)}px`,
        onclick: (e) => { if (!stale(T, e) && T.o.onBox) T.o.onBox(r.t, e.currentTarget); } },
      showL ? tile(r.t, ls, { cls: "is-flat" }) : null, showT ? h("b", {}, r.t) : null, showM ? h("i", {}, mv) : null));
      if (pill) nodes.push(pill);
    });
  }
  /* phones: a sector a tile, colored by its move; its name (a shorter one in a narrow tile) and its move, and the logos of
     its three largest companies. In a lit view (the movers, the portfolio) the lit companies are listed inside their
     tiles instead: logo, ticker, move. */
  function tmSector(T, sr, lit) {
    const s = sr.s, w = sr.w - 4, hh = sr.h - 4, mv = pct(s.move);
    const held = s.rows.filter((r) => lit.has(r.t)).sort((a, b) => b.c - a.c);
    const wide = w >= 96 && hh >= 72, pad = wide ? 10 : 6, inner = w - 2 * pad;
    /* a tile too thin for any name across: its short name and move written upward */
    const thin = !wide && w < 40 && hh >= 56 && !held.length;
    /* a tile too low for two lines: its short name and move on one line, or nothing under 18px */
    const flat = !wide && !thin && !held.length && hh < 34;
    let name = thin ? secName(s.name, hh - 12 - textW(mv, 11, 700) - 6, 11, 600)
      : flat ? (hh >= 18 ? secName(s.name, w - 8 - textW(mv, 11, 700) - 5, 11, 600) : null)
        : wide ? s.name : secName(s.name, inner, 11, 600);
    let lines = name && wide && textW(name, 12, 600) > inner ? 2 : 1;
    if (wide && lines === 2 && hh < 2 * pad + 30 + 4 + 18 + 26) { name = secName(s.name, inner, 12, 600) || name; lines = textW(name, 12, 600) > inner ? 2 : 1; }
    const mFont = wide ? 18 : 12;
    let moved = !thin && !flat && w >= 40 && hh >= (name ? 34 : 18) && textW(mv, mFont) <= inner;
    let solo = null;
    if ((thin || flat) && !name && (thin || hh >= 16)) {
      const len = (thin ? hh : w) - 10;
      solo = secName(s.name, len, 11, 600) || (textW(mv, 11, 700) <= len ? mv : null);
    }
    let kids = null;
    if (held.length) {
      /* the lit companies, one line each: logo, ticker, move (the logo goes first where the line is too narrow; then the
         sector's own move, where the lines need its room) */
      const rowH = wide ? 25 : 22, ts = wide && w >= 140 ? 20 : 16, fs = wide ? 13 : 12;
      const needW = (r, logo) => (logo ? ts + 6 : 0) + textW(r.t, fs, 600) + 6 + textW(pct(r.m), fs, 600);
      const logo = held.every((r) => needW(r, true) <= inner);
      const head = name ? (wide ? 15 * lines : 14) + 4 : 0;
      let room = hh - 2 * pad - head - (moved ? mFont + 6 : 0);
      if (Math.floor((room + 3) / rowH) < held.length && moved) { moved = false; room += mFont + 6; }
      const fit = Math.max(0, Math.floor((room + 3) / rowH));
      const show = fit >= held.length ? held : held.slice(0, Math.max(0, fit - 1));
      const rest = held.length - show.length;
      kids = h("span", { class: `rows${wide ? "" : " is-tight"}` }, show.map((r) => h("span", { class: "row" },
        logo ? tile(r.t, ts, { cls: "is-flat" }) : null, h("b", {}, r.t), needW(r, false) <= inner ? h("i", {}, pct(r.m)) : null)),
      rest && fit ? h("span", { class: "row is-more" }, `+${rest} more`) : null);
    } else {
      /* the logos of its largest companies under the words: 28px in a big tile, else 22px (two or three, as they fit) */
      const free = hh - 2 * pad - (name ? (wide ? 15 * lines : 14) + 4 : 0) - (moved ? mFont + 4 : 0);
      const ls = w >= 120 && free >= 34 ? 28 : w >= 64 && free >= 26 ? 22 : 0;
      if (ls) {
        const n = clamp(Math.floor((inner + 6) / (ls + 6)), 1, 3);
        kids = h("span", { class: "ls" }, s.rows.slice().sort((a, b) => b.c - a.c).slice(0, n).map((r) => tile(r.t, ls)));
      }
    }
    return h("button", { type: "button", class: `nw-tm-tile${held.length ? " is-lit" : ""}${wide ? "" : " is-small"}${thin ? " is-thin" : ""}${flat ? " is-low" : ""}`, "data-s": s.name,
      style: `left:${px1(sr.x + 2)};top:${px1(sr.y + 2)};width:${px1(w)};height:${px1(hh)};background:${heat(s.move)}`,
      "aria-label": `${s.name}, ${mv}${held.length ? `, lit: ${held.map((r) => `${r.n} ${pct(r.m)}`).join(", ")}` : ""}: show its ${s.rows.length} companies`,
      onclick: (e) => { if (!stale(T, e)) zoomIn(T, s.name); } },
    thin || flat ? (name ? h("span", { class: "n" }, name, " ", h("span", { class: "m" }, mv)) : solo ? h("span", { class: "n" }, solo) : null)
      : [name ? h("span", { class: "n" }, name) : null, moved ? h("span", { class: "m" }, mv) : null],
    kids);
  }
  /* a zoom that grows from the sector's place (FLIP, 360ms), and back */
  function flip(layer, r, W, H, inward) {
    if (still() || !layer || !r) return;
    const sx = r.w / W, sy = r.h / H;
    const from = inward ? `translate(${r.x}px, ${r.y}px) scale(${sx}, ${sy})` : `translate(${-r.x / sx}px, ${-r.y / sy}px) scale(${1 / sx}, ${1 / sy})`;
    layer.animate([{ transform: from, opacity: 0.35 }, { transform: "none", opacity: 1 }], { duration: 360, easing: "cubic-bezier(.2, .7, .2, 1)" });
  }
  function zoomIn(T, name) {
    const r = T.rects.find((x) => x.s.name === name);
    T.zoom = name;
    tmDraw(T);
    flip(T.layer, r, T.el.clientWidth, T.el.clientHeight, true);
    if (T.o.onZoom) T.o.onZoom(name);
  }
  function zoomOut(T) {
    const name = T.zoom;
    T.zoom = null;
    tmDraw(T);
    flip(T.layer, T.rects.find((x) => x.s.name === name), T.el.clientWidth, T.el.clientHeight, false);
    if (T.o.onZoom) T.o.onZoom(null, name);
  }
  /* a card that follows the pointer over the boxes (mouse only): logo, name, ticker and sector, the move, the market value */
  function mapTip(T, hostEl) {
    const tip = h("div", { class: "nw-tip", hidden: true, "aria-hidden": "true" });
    hostEl.append(tip);
    let cur = null;
    T.el.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const b = e.target.closest && e.target.closest(".nw-tm-box");
      const x = b && rowOf(b.dataset.t);
      if (!x) { tip.hidden = true; cur = null; return; }
      if (cur !== b.dataset.t) {
        cur = b.dataset.t;
        const r = x.r;
        tip.replaceChildren(tile(r.t, 28), h("span", { class: "nm" }, h("b", {}, r.n), h("span", {}, `${r.t} · ${r.s}`)),
          h("span", { class: "fg" }, h("b", { class: toneOf(r.m) }, pct(r.m)), h("span", {}, `${money(r.c)} market value`)));
      }
      tip.hidden = false;
      const hr = hostEl.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
      let px = e.clientX - hr.left + 14, py = e.clientY - hr.top + 14;
      if (px + tw > hr.width - 8) px = e.clientX - hr.left - 14 - tw;
      if (py + th > hr.height - 8) py = e.clientY - hr.top - 14 - th;
      tip.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`;
    });
    T.el.addEventListener("pointerleave", () => { tip.hidden = true; cur = null; });
    T.el.addEventListener("pointerdown", () => { tip.hidden = true; });
  }

  /* ================================================================ the stops of the room */
  const STOCKS = ["ndx", "sx5e", "dax", "ftsemib", "nikkei"];
  const PLATE_SHORT = { us10y: "US 10-year" };              // a phone plate's label where the whole one would wrap
  const bare =(s) => String(s || "").trim().replace(/[.!?]+$/, "");
  /* the lede's first sentence is often the top story's title, word for word: then the cover is that story (its first fact
     as the deck, its source and link), and the walk does not show the same headline twice (the List keeps it) */
  function coverStory(D) {
    const first = sentences(D.lede)[0];
    return first ? S.stories.find((it) => bare(it.title) === bare(first)) || null : null;
  }
  /* weekdays from one date to a later one (a figure's age against the day most figures share) */
  const bdays = (from, to) => {
    let d = dateOf(from), n = 0;
    const e = dateOf(to);
    if (isNaN(d) || isNaN(e)) return 0;
    while (d < e && n < 40) { d = new Date(d.getTime() + 864e5); if (d.getUTCDay() % 6 !== 0) n += 1; }
    return n;
  };
  /* the figures for the masthead and the room: none more than three weekdays older than the rest (FRED's Brent can lag a
     week); every figure stays in "All the figures" with its day */
  const fresh = (board) => { const c = commonOf(board); return board.filter((b) => !b.as_of || !c || bdays(b.as_of, c) <= 3); };
  const staleOf = (board) => { const f = fresh(board); return board.filter((b) => !f.includes(b)); };
  function buildStops(D) {
    S.coverStory = coverStory(D);
    const st = [{ kind: "cover", label: "Today" }];
    const board = D.board || [];
    board.forEach((b) => { if (b.key !== "spx" && mapOf(b.key)) st.push({ kind: "map", key: b.key, b, mp: mapOf(b.key), label: `${mapName(b.key)} map` }); });
    const rest = fresh(board).filter((b) => b.key !== "spx" && !mapOf(b.key));
    const stocks = rest.filter((b) => STOCKS.includes(b.key)), other = rest.filter((b) => !STOCKS.includes(b.key));
    const group = (items, label) => { for (let i = 0; i < items.length; i += 6) st.push({ kind: "figs", items: items.slice(i, i + 6), label }); };
    group(stocks, stocks.some((b) => b.key === "ndx") ? "Stock markets" : "Europe and Japan");
    group(other, "Rates, currencies and commodities");
    S.stories.forEach((it) => { if (it !== S.coverStory) st.push({ kind: "story", it, label: it.title }); });
    if (D.moves && ((D.moves.up || []).length || (D.moves.down || []).length)) st.push({ kind: "movers", label: "Biggest moves" });
    if ((D.wire || []).length) st.push({ kind: "wire", label: "The wire" });
    if ((D.watch || []).length) st.push({ kind: "watch", label: "Week ahead" });
    return st;
  }
  const stopOfStory = (it) => (S.coverStory && it.id === S.coverStory.id ? 0 : S.stops.findIndex((s) => s.kind === "story" && s.it.id === it.id));
  const sourcesOf = (items) => {
    const n = new Map();
    items.forEach((b) => n.set(b.source, (n.get(b.source) || 0) + 1));
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]).join(" and ");
  };
  const GLOW = { central_banks: "18% 12%", economy: "86% 14%", companies: "14% 88%", markets: "88% 86%", policy: "50% 0%", what_moved: "50% 100%" };

  /* ---------------------------------------------------------------- the plates' pictures */
  function plateBody(s, G) {
    const D = S.D, w = G.w;
    if (s.kind === "cover" || s.kind === "map") {
      const mp = s.kind === "cover" ? D.map : s.mp;
      if (mp) return h("span", { class: "nw-pic nw-pic-map" }, mapPicture(mp, G.w, G.h));
      const d = new Date(D.generated_at), p = isNaN(d) ? null : parts(F_LONG, d);
      const big = s.kind === "cover" ? ["spx", "ndx"].map(boardOf).filter(Boolean) : [];
      if (big.length) {
        const small = (D.board || []).filter((b) => b.key !== "spx" && b.key !== "ndx").slice(0, 4);
        return h("span", { class: "nw-pic nw-pic-cover" },
          h("span", { class: "nw-pc-d" }, p ? `${p.weekday} ${p.day} ${p.month}` : "Today"),
          h("span", { class: "nw-pc-big" }, big.map((b) => {
            const f = chgEl(b, "f");                           // two figures side by side: the longer one sets no overflow
            f.style.fontSize = `${Math.min(10.4, 62 / Math.max(1, f.textContent.length)).toFixed(2)}cqw`;
            return h("span", { class: "nw-pc-b" }, h("span", { class: "k" }, labelOf(b)), f);
          })),
          small.length ? h("span", { class: "nw-pc-sm" }, small.map((b) => {
            const f = tileFigures(b);
            return h("span", { class: "nw-pc-s" }, h("span", { class: "k" }, PLATE_SHORT[b.key] || labelOf(b)),
              f.level ? h("span", { class: "f" }, f.level, " ", h("small", { class: f.tone }, f.chg)) : chgEl(b, "f"));
          })) : null);
      }
      return h("span", { class: "nw-pic nw-pic-date" }, p ? [h("b", {}, p.weekday), h("b", {}, `${p.day} ${p.month}`)] : h("b", {}, "Today"));
    }
    if (s.kind === "figs") {
      const items = s.items, latest = commonOf(items);
      const label = (b) => [labelOf(b), b.as_of && b.as_of !== latest ? h("span", { class: "nw-pf-d" }, ` · ${dayNum(b.as_of)}`) : null];
      /* five or six: a board, one column per kind on every row: the label, the level (rates, currencies, Brent; blank for a
         fund), the signed move; the moves in one right-aligned column. A late figure (FRED lags) says its day */
      if (items.length >= 5) {
        const levels = items.some((b) => tileFigures(b).level);
        return h("span", { class: `nw-pic nw-pic-board${levels ? " has-level" : ""}` }, items.map((b) => {
          const f = tileFigures(b), late = b.as_of && b.as_of !== latest;
          return h("span", { class: `nw-pb${late ? " is-late" : ""}` },
            h("span", { class: "nw-pb-k" }, h("span", { class: "nw-pb-n" }, h("span", { class: "is-long" }, labelOf(b)),
              PLATE_SHORT[b.key] ? h("span", { class: "is-short" }, PLATE_SHORT[b.key]) : null),
            late ? h("span", { class: "nw-pb-d" }, h("span", { class: "sep" }, " · "), dayNum(b.as_of)) : null),
            levels ? h("span", { class: "nw-pb-l" }, f.level || "") : null,
            chgEl(b, "nw-pb-f"));
        }));
      }
      return h("span", { class: `nw-pic nw-pic-figs is-${items.length === 4 ? "4" : "row"}` }, items.map((b) => {
        const f = tileFigures(b);
        return h("span", { class: `nw-pf${b.as_of && b.as_of !== latest ? " is-late" : ""}` }, h("span", { class: "nw-pf-k" }, label(b)),
          f.level ? h("span", { class: "nw-pf-f" }, f.level, h("small", { class: f.tone }, f.chg)) : chgEl(b, "nw-pf-f"));
      }));
    }
    /* the posters (stories, the wire, coming up) share two zones: at the top left the identity (the companies' logos, an
       institution's tile, the source company's tile) with the kicker beside it; at the bottom left the figure. The source's
       name is never repeated inside the plate (the label's meta line says it). */
    const poster = (glow, ident, beside, bottom) => h("span", { class: "nw-pic nw-pic-story" }, glow,
      h("span", { class: "nw-ps-top" }, ident ? h("span", { class: "nw-ps-id" }, ident) : null, beside || null),
      h("span", { class: "nw-ps-bot" }, bottom));
    const figure = (text) => h("span", { class: "nw-ps-fig", style: `font-size:${Math.min(22, 92 / (0.58 * String(text).length)).toFixed(2)}cqw` }, text);
    /* a display line: one to three balanced lines, about 9 to 13cqw */
    const display = (text, cls) => {
      const n = String(text).length, lines = n <= 16 ? 1 : n <= 34 ? 2 : 3, cpl = Math.ceil(n / lines) + 2;
      return h("span", { class: `nw-ps-dsp${cls ? ` ${cls}` : ""}`, style: `font-size:${Math.min(13, 160 / cpl).toFixed(2)}cqw` }, text);
    };
    const logoRow = (tks, ts) => tks.map((t) => h("span", { class: "nw-ps-lg" }, tile(t, ts, { floor: 9 }), h("b", {}, t)));
    if (s.kind === "story") {
      const it = s.it, tks = tickersOf(it), kf = keyFigure(it);
      const inst = !tks.length && (it.kind === "official" || INST.some(([re]) => re.test(it.source || "")));
      const glow = h("span", { class: "nw-pic-glow", style: `background:radial-gradient(70% 80% at ${GLOW[it.secId] || "50% 0%"}, rgba(108, 180, 255, 0.16), rgba(108, 180, 255, 0) 70%)` });
      const kick = kf && kf.kick ? h("span", { class: "nw-ps-kick" }, kf.kick) : null;
      /* no figure: a typographic poster, the kind of news over a display line (the company, the institution, or the
         title's first clause), so no plate is left with a lone logo */
      if (!kf) {
        const k = h("span", { class: "nw-ps-kick" }, kindOf(it));
        if (tks.length === 1) {
          const nm = shortCo(nameOf(carried(tks[0])));
          return poster(glow, logoRow(tks, Math.min(0.16 * w, 48)), k, display(nm && nm !== tks[0] ? nm : firstClause(it.title)));
        }
        if (tks.length > 1) {
          const ts = Math.min(0.125 * w, 48), shown = tks.length > 4 ? tks.slice(0, 3) : tks;
          const ident = [logoRow(shown, ts), tks.length > 4 ? h("span", { class: "nw-ps-lg" }, tile(null, ts, { floor: 9, more: `+${tks.length - 3}` }), h("b", {}, "more")) : null];
          return poster(glow, ident, null, [k, display(firstClause(it.title))]);
        }
        if (inst) return poster(glow, instTile(it.source, Math.min(0.16 * w, 48), { floor: 9 }), k, display(instName(it.source), "is-inst"));
        return poster(glow, null, h("span", { class: "nw-ps-kick" }, "Reported by"),
          h("span", { class: `nw-ps-emb is-press${String(it.source).length > 6 ? " is-long" : ""}` }, h("b", {}, it.source)));
      }
      if (tks.length) {
        const one = tks.length === 1, ts = Math.min((one ? 0.16 : 0.125) * w, 48);
        const shown = tks.length > 4 ? tks.slice(0, 3) : tks;
        const ident = [logoRow(shown, ts), tks.length > 4 ? h("span", { class: "nw-ps-lg" }, tile(null, ts, { floor: 9, more: `+${tks.length - 3}` }), h("b", {}, "more")) : null];
        return one ? poster(glow, ident, kick, kf ? figure(kf.fig) : null) : poster(glow, ident, null, [kick, kf ? figure(kf.fig) : null]);
      }
      return poster(glow, inst ? instTile(it.source, Math.min(0.16 * w, 48), { floor: 9 }) : null, kick, figure(kf.fig));
    }
    if (s.kind === "movers") {
      const ts = Math.min(0.105 * w, 48);
      const mv = [...(D.moves.down || []).slice(0, 5), ...(D.moves.up || []).slice(0, 5)];
      return h("span", { class: "nw-pic nw-pic-movers" }, mv.map((x) => h("span", { class: "nw-pm" }, tile(x.ticker, ts, { floor: 9 }), h("b", {}, x.ticker),
        h("span", { class: toneOf(x.move) }, pct(x.move)))));
    }
    if (s.kind === "wire") {                                  // the five largest filers, then the count
      const wire = D.wire || [], ts = Math.min(0.125 * w, 48);
      const cap = (t) => { const x = rowOf(t); return x ? x.r.c : 0; };
      const filers = [...new Set(wire.filter((x) => x.kind === "filing" && x.ticker).map((x) => x.ticker))]
        .sort((a, b) => (hasLogo(b, ts) - hasLogo(a, ts)) || cap(b) - cap(a)).slice(0, 5);
      return poster(null, filers.length ? logoRow(filers, ts) : null, null,
        [h("span", { class: "nw-ps-kick" }, "Releases and filings"), figure(String(wire.length))]);
    }
    /* the week ahead: one or two dates as a calendar (the day large, the time in Berlin, the event over up to three lines);
       three or four as rows (the day, then the event) */
    const all = watchSorted();
    if (all.length <= 2) {
      return h("span", { class: `nw-pic nw-pic-cal is-${all.length}` }, h("span", { class: "nw-ps-kick" }, "Week ahead"),
        h("span", { class: "nw-cal" }, all.map((x) => {
          const d = dateOf(x.when), p = isNaN(d) ? null : parts(F_DAY, d);
          return h("span", { class: "nw-cal-d" }, h("span", { class: "wd" }, p ? p.weekday : "Next"), h("b", { class: "dn" }, p ? `${p.day} ${p.month}` : ""),
            h("span", { class: "tm" }, [x.date_only ? null : `${hm(x.when)} Berlin`, x.source || null].filter(Boolean).join(" · ")), h("span", { class: "ev" }, x.what));
        })));
    }
    const ws = all.slice(0, 4), more = D.watch.length - ws.length;
    return h("span", { class: `nw-pic nw-pic-week is-${ws.length}` }, h("span", { class: "nw-ps-kick" }, "Week ahead"),
      h("span", { class: "nw-pwk" }, ws.map((x) => h("span", { class: "nw-pwk-r" }, h("b", {}, dayNum(x.when)), h("span", {}, x.what)))),
      more > 0 ? h("span", { class: "nw-pw-more" }, `+${more} more`) : null);
  }
  const watchSorted = () => ((S.D && S.D.watch) || []).slice().sort((a, b) => dateOf(a.when) - dateOf(b.when));
  /* what a screen reader hears for a plate */
  function plateLabel(s, i) {
    const n = S.stops.length, D = S.D, head = `${i + 1} of ${n}.`;
    if (s.kind === "cover" || s.kind === "map") {
      const key = s.kind === "cover" ? "spx" : s.key, mp = mapOf(key), b = boardOf(key);
      if (!mp) return `${head} Today: ${edition(D)}.`;
      return `${head} ${mapName(key)} map: ${ofText(mp).replace(/^The/, "the")}, colored by ${weekday(mp.as_of)}'s move.${b ? ` ${labelOf(b)} ${figText(b)}.` : ""}`;
    }
    if (s.kind === "figs") return `${head} ${s.label}: ${s.items.map((b) => `${labelOf(b)} ${figText(b)}`).join(", ")}.`;
    if (s.kind === "story") { const it = s.it; return `${head} ${it.sec}: ${it.title}. ${it.source}, ${when(it.published, it.date_only)}.`; }
    if (s.kind === "movers") {
      const f = (l) => l.slice(0, 5).map((x) => `${cleanName(x.name)} ${pct(x.move)}`).join(", ");
      return `${head} The biggest S&P 500 moves on ${dayOf(D.moves.as_of)}. Falls: ${f(D.moves.down || [])}. Rises: ${f(D.moves.up || [])}.`;
    }
    if (s.kind === "wire") return `${head} The wire: ${plural(D.wire.length, "release", "releases")}, unedited.`;
    return `${head} Week ahead: ${watchSorted().slice(0, 4).map((x) => `${dayOf(x.when)}, ${x.what}`).join("; ")}.`;
  }
  /* the label's words for a stop: eyebrow, title, deck, meta, actions */
  function words(i) {
    const s = S.stops[i], D = S.D;
    const story = (it) => ({ sec: it.sec, title: it.title, meta: meta(it),
      acts: [{ label: "Read the story", arrow: "→", main: true, run: () => openStory(it) }, { label: "Source", href: it.url }] });
    switch (s.kind) {
      case "cover": {
        const [first, ...rest] = sentences(D.lede);
        const cs = S.coverStory;
        /* the deck never repeats a stop's title; when the lede opens with the top story, the deck is its first fact */
        const deck = cs ? (cs.facts || [])[0] || "" : rest.filter((x) => !S.stories.some((it) => bare(it.title) === bare(x))).join(" ");
        /* under the day's sentence, the S&P 500 and the Nasdaq 100 (the plate shows them large when there is no map); on
           phones the actions keep to one row ("Page" is in the Contents sheet) */
        const small = G && (G.mode === "phone" || G.mode === "side");
        return { sec: "Today", title: first || "The day in markets", deck: first ? deck : "", meta: cs ? meta(cs) : null,
          figs: D.map ? ["spx", "ndx"].map(boardOf).filter(Boolean) : [],
          acts: [{ label: "Step inside", arrow: "→", main: true, run: () => go(i + 1) }, D.map ? { label: "Open the map", run: () => openMap("spx") } : null,
            small ? null : { label: "Read as a page", run: () => toPage(null) }, cs && cs.url && !D.map ? { label: "Source", href: cs.url } : null] };
      }
      case "map": {
        const mp = s.mp, b = s.b;
        return { sec: `Markets · ${dayOf(mp.as_of)} close`, title: mapName(s.key),
          deck: `${ofText(mp)}, sized by market value and colored by ${weekday(mp.as_of)}'s move.`,
          meta: [labelOf(b), " ", chgEl(b), ` · ${b.source}`], acts: [{ label: "Open the map", arrow: "→", main: true, run: () => openMap(s.key) }] };
      }
      case "figs":
        return { sec: `Markets · ${dayOf(commonOf(s.items))} close`, title: s.label, meta: sourcesOf(s.items),
          acts: [{ label: "All the figures", arrow: "→", main: true, run: () => openMarkets(s.items[0].key) }] };
      case "story": return story(s.it);
      case "movers":
        return { sec: `Markets · ${dayOf(D.moves.as_of)}`, title: "The biggest S&P 500 moves", meta: D.moves.source || "", deck: moversDeck(D.moves),
          acts: [D.map ? { label: "On the map", arrow: "→", main: true, run: openMovers } : null, { label: "Read as a page", run: () => toPage("nw-l-moves") }] };
      case "wire": {
        const banks = D.wire.filter((x) => x.kind !== "filing").length, files = D.wire.length - banks;
        const days = [...new Set(D.wire.map((x) => (x.time || "").slice(0, 10)))].sort();
        return { sec: "The wire", title: `${plural(D.wire.length, "release", "releases")}, unedited`,
          deck: "Every central bank release and S&P 500 current report of the window, with its source.",
          meta: [banks ? plural(banks, "central bank release", "central bank releases") : null, files ? plural(files, "company filing", "company filings") : null,
            days.length ? dayOf(days[days.length - 1]) : null].filter(Boolean).join(" · "),
          acts: [{ label: "Open the wire", arrow: "→", main: true, run: openWire }] };
      }
      default: {
        const [w0, ...then] = watchSorted();
        return { sec: "Week ahead", title: w0.what, meta: `${w0.source || ""}${w0.source ? " · " : ""}${when(w0.when, w0.date_only)}`,
          deck: then.length ? `Then: ${then.slice(0, 3).map((x) => `${dayNum(x.when)}, ${x.what}`).join("; ")}.` : "",
          acts: [D.watch.length > 1 ? { label: "All dates", arrow: "→", main: true, run: openWatch } : null, w0.url ? { label: "Source", href: w0.url, main: D.watch.length < 2 } : null] };
      }
    }
  }
  /* the biggest fall and the biggest rise in one paragraph, each with its reason when the desks wrote one */
  function moversDeck(m) {
    const one = (x, what) => (x ? `${what}: ${cleanName(x.name)}, ${pct(x.move)}.${x.why ? ` ${cap1(String(x.why).trim().replace(/[.]+$/, ""))}.` : ""}` : "");
    return [one((m.down || [])[0], "Biggest fall"), one((m.up || [])[0], "Biggest rise")].filter(Boolean).join(" ");
  }
  /* the Page view from the room, at a section */
  function toPage(id) {
    pref("list");
    rerender();
    if (id) requestAnimationFrame(() => jumpTo(id));
  }
  /* an action: one line of words (a link opens its source in a new tab) */
  function act(a) {
    if (!a) return null;
    if (a.href) {
      return h("a", { class: `nw-act${a.main ? " is-main" : ""}`, href: a.href, target: "_blank", rel: "noopener" },
        h("span", {}, a.label, " ", h("span", { "aria-hidden": "true" }, "↗")), newTab());
    }
    return h("button", { type: "button", class: `nw-act${a.main ? " is-main" : ""}`, onclick: a.run },
      h("span", {}, a.label, a.arrow ? [" ", h("span", { "aria-hidden": "true" }, a.arrow)] : null));
  }
  /* the stop a plate opens: a map, the figures, a story, the movers lit on the map, the wire, the next date's source */
  function primary(i) {
    const s = S.stops[i];
    if (!s) return;
    if (s.kind === "cover") { if (S.D.map) openMap("spx"); else go(i + 1); }
    else if (s.kind === "map") openMap(s.key);
    else if (s.kind === "figs") openMarkets(s.items[0].key);
    else if (s.kind === "story") openStory(s.it);
    else if (s.kind === "movers") openMovers();
    else if (s.kind === "wire") openWire();
    else if (s.kind === "watch") openWatch();
  }

  /* ================================================================ the room: geometry (one row of plates on a ring) */
  let G = null;
  function geo(W, H, N, legalH = 17) {
    const mode = W < 1200 && H < 520 && W > 1.3 * H ? "side" : W >= 1200 ? "desk" : W >= 700 ? "tablet" : "phone";
    const small = mode === "phone" || mode === "side";
    const topHud = small ? 64 : 84;
    const WORDS = mode === "side" ? 0 : mode === "desk" ? (H < 760 ? 220 : 250) : mode === "tablet" ? 236 : 250;
    /* the bottom, measured: the legal line (two or three lines on a phone) and, on phones and tablets, the next stop's line
       8px over it; a phone shorter than 560px keeps that room for the label (a swipe and the Contents walk on) */
    const legalB = mode === "phone" ? 12 : 22, next = mode === "tablet" || (mode === "phone" && H >= 560);
    const nextB = next ? Math.max(mode === "phone" ? 52 : 56, legalB + legalH + 8) : 0;
    const Lfree = mode === "phone" ? legalB + legalH + 16 : 64;
    const L = next ? nextB + 44 + (mode === "phone" ? 12 : 14) : Lfree, gap = small ? 20 : 24;
    const zTop = topHud + gap, zBot = mode === "side" ? H - 24 : H - L - WORDS - gap;
    const w0 = mode === "desk" ? clamp(0.37 * W, 440, 620) : mode === "tablet" ? (H > W ? clamp(0.7 * W, 400, 600) : clamp(0.56 * W, 400, 560))
      : mode === "phone" ? Math.min(0.86 * W, 340) : 0.46 * W;
    const w = Math.round(Math.max(200, Math.min(w0, 1.5 * (zBot - zTop))));
    const hgt = Math.round((2 * w) / 3);
    const P = Math.round((mode === "desk" ? 0.75 : mode === "tablet" ? 0.95 : mode === "phone" ? 1.8 : 1.1) * W);
    const g = Math.round(0.07 * w);
    const closed = N >= 14 && N <= 22;
    let R, step;
    if (closed) { step = (2 * Math.PI) / N; R = Math.max(P / 0.74, (w + g) / (2 * Math.sin(Math.PI / N))); }
    else { R = P / (N < 14 ? 0.74 : 0.52); step = 2 * Math.asin(Math.min(1, (w + g) / (2 * R))); }
    /* never under the top row: the plate starts 12px under its 40px buttons (a small phone's plate keeps its 200px) */
    const yc = Math.max(Math.round((zTop + zBot) / 2), Math.round((mode === "tablet" ? 62 : small ? 56 : 66) + 12 + hgt / 2));
    /* the label hangs from the plate: its top 48 / 52 / 56px under the plate's bottom, so the eyebrow sits at the same
       height on every stop; it may grow down to the next stop's line, or to the legal line where that line is off (the
       cover, short phones) */
    const wordsTop = Math.round(yc + hgt / 2 + (mode === "phone" ? 48 : mode === "tablet" ? 52 : 56));
    const wordsMax = Math.max(120, H - L - wordsTop), wordsFree = Math.max(wordsMax, H - Lfree - wordsTop);
    return { W, H, N, mode, WORDS, L, gut: mode === "desk" ? 40 : mode === "tablet" ? 32 : 20, w, h: hgt, g, r: Math.round(0.026 * w),
      yc, xc: Math.round(mode === "side" ? 0.29 * W : W / 2), P, R, step, closed, zf: R - P, wordsTop, wordsMax, wordsFree, next, nextB };
  }
  const nStops = () => S.stops.length;
  const norm = (t) => (G.closed ? t : clamp(t, 0, nStops() - 1));
  const wrapD = (d) => { const n = nStops(); return G.closed ? ((((d % n) + n + n / 2) % n) - n / 2) : d; };

  /* ---------------------------------------------------------------- the room: building it */
  function viewSwitch() {
    const b = (v, label) => h("button", { type: "button", "aria-pressed": String(S.mode === v), onclick: () => { if (S.mode !== v) { pref(v); rerender(); } } }, label);
    return h("div", { class: "nw-views", role: "group", "aria-label": "View" }, b("room", "Room"), b("list", "Page"));
  }
  const aboutBtn = (cls) => h("button", { type: "button", class: cls || "nw-link", onclick: openAbout }, "Sources and method");
  function roomView(D) {
    S.canvas = h("canvas", { class: "nw-sky", "aria-hidden": "true" });
    S.ring = h("div", { class: "nw-ring" });
    S.world = h("div", { class: "nw-world" }, S.ring);
    S.words = h("div", { class: "nw-words" });
    S.count = h("span", { class: "nw-count", "aria-hidden": "true" });
    S.toc = h("button", { type: "button", class: "nw-toc", "aria-haspopup": "dialog", onclick: openContents },
      h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", "aria-hidden": "true" },
        h("path", { d: "M2.5 4h11M2.5 8h11M2.5 12h11" })));
    /* the guide (desktops): short words for each stop, one tab stop (the current row), the arrow keys move inside it */
    S.guideRows = S.stops.map((s, i) => h("button", { type: "button", tabindex: "-1", title: s.kind === "story" ? s.label : null,
      onclick: () => go(i), onfocus: () => guideShow(i) },
    h("span", { class: "l" }, guideLabel(s)), h("span", { class: "n" }, pad(i + 1))));
    S.guideList = h("ol", {}, S.guideRows.map((b) => h("li", {}, b)));
    S.guide = h("nav", { class: "nw-guide", "aria-label": "Contents", onfocusout: (e) => { if (!S.guide.contains(e.relatedTarget)) guideShow(S.focal); },
      onkeydown: (e) => {
        const k = S.guideRows.indexOf(e.target);
        if (k < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
        const n = S.guideRows.length;
        const to = e.key === "ArrowDown" ? Math.min(n - 1, k + 1) : e.key === "ArrowUp" ? Math.max(0, k - 1) : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
        if (to < 0) return;
        e.preventDefault();
        e.stopPropagation();                                   // the room's own keys stay out of the list
        S.guideRows.forEach((b, j) => { b.tabIndex = j === to ? 0 : -1; });
        S.guideRows[to].focus({ preventScroll: true });
      } }, S.guideList);
    S.hint = h("p", { class: "nw-hint", "aria-hidden": "true" }, finePointer() ? "Scroll, swipe or use the arrow keys to walk the room" : "Swipe to walk the room",
      h("svg", { viewBox: "0 0 10 10", width: 10, height: 10, fill: "none", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" },
        h("path", { d: "M3.5 1.5L7 5L3.5 8.5" })));
    S.live = h("p", { class: "sr-only", "aria-live": "polite" });
    S.next = h("button", { type: "button", class: "nw-next", onclick: () => { if (S.entering) endEntrance(); if (S.focal >= nStops() - 1) go(0); else step(1); } });
    S.top = h("div", { class: "nw-top" },
      h("div", { class: "nw-top-l" }, h("h1", { id: "nw-h1", tabindex: "-1" }, "Markets Briefing"),
        h("p", { class: "nw-edition" }, h("span", { class: "is-long" }, edition(D)), h("span", { class: "is-short" }, edition(D, true))),
        deskLine(D)),
      h("div", { class: "nw-top-r" }, viewSwitch(), S.count, S.toc));
    S.legal = h("p", { class: "nw-legal" }, LEGAL, " · ", aboutBtn());
    S.stage = h("div", { class: "nw-stage", role: "region", "aria-roledescription": "gallery", "aria-label": "Markets Briefing, room view", tabindex: "-1" },
      S.canvas, S.top, S.world, h("div", { class: "nw-veil", "aria-hidden": "true" }), S.hint, S.words, S.guide, S.next, S.legal, S.live);
    return h("div", { class: "nw-room" }, S.stage);
  }
  function buildPlates() {
    const keepFocus = S.plates.includes(document.activeElement);
    S.plates = S.stops.map((s, i) => h("button", { type: "button", class: `nw-pl nw-pl-${s.kind}`, tabindex: "-1", "aria-label": plateLabel(s, i), hidden: true,
      style: `left:${-G.w / 2}px;top:${-G.h / 2}px;width:${G.w}px;height:${G.h}px;--pr:${G.r}px`, onclick: () => onPlate(i) },
    h("span", { class: "nw-pl-in", "aria-hidden": "true" }, plateBody(s, G))));
    S.ring.replaceChildren(...S.plates);
    S.focal = -1;
    S.dirty = true;
    if (keepFocus) S.refocus = true;
  }
  /* the geometry to the page: the perspective, the ring's center, the HUD's room */
  function relayout() {
    const W = S.stage.clientWidth || innerWidth, H = S.stage.clientHeight || innerHeight - 48;
    const was = G;
    /* the mode and the gutter first (they set the legal line's size), then the geometry around its measured height */
    const g0 = geo(W, H, nStops());
    S.stage.dataset.mode = g0.mode;
    S.stage.style.setProperty("--g", `${g0.gut}px`);
    G = geo(W, H, nStops(), S.legal.offsetHeight || 17);
    S.stage.style.setProperty("--next-b", `${G.nextB}px`);
    S.world.style.perspective = `${G.P}px`;
    S.world.style.perspectiveOrigin = `${G.xc}px ${G.yc}px`;
    S.ring.style.left = `${G.xc}px`;
    S.ring.style.top = `${G.yc}px`;
    S.stage.style.setProperty("--g", `${G.gut}px`);
    S.stage.style.setProperty("--words", `${G.wordsMax}px`);
    S.stage.style.setProperty("--words-top", `${G.wordsTop}px`);
    S.stage.style.setProperty("--L", `${G.L}px`);
    if (G.mode === "side") S.stage.style.setProperty("--legal-h", `${S.legal.offsetHeight}px`);
    /* the guide's rows: as many as fit between the label's top and the legal line, from 4 to 13 */
    S.gRows = clamp(Math.floor((G.H - G.wordsTop - 22 - (S.legal.offsetHeight || 17) - 18) / 26), 4, 13);
    S.stage.style.setProperty("--guide-h", `${26 * Math.min(S.gRows, nStops())}px`);
    if (!was || was.w !== G.w || was.h !== G.h) buildPlates();
    S.dirty = true;
    S.skyDirty = true;
    if (S.focal >= 0) { fillWords(S.focal); guideShow(S.focal); }
    if (S.hint.classList.contains("is-on") && !placeHint()) hideHint();
  }
  /* the hint: centered on the plate, 16px under it; never over the label (no room: no hint) */
  function placeHint() {
    if (!G || G.mode === "side") return false;
    const below = G.yc + G.h / 2, hh = S.hint.offsetHeight || 17, hw = S.hint.offsetWidth || 360;
    const w = S.words, apart = G.xc + hw / 2 < w.offsetLeft || G.xc - hw / 2 > w.offsetLeft + w.offsetWidth;
    const room = (apart ? G.H : w.offsetTop) - below - hh;
    if (room < 24) return false;
    S.hint.style.left = `${G.xc}px`;
    S.hint.style.top = `${Math.round(below + 16)}px`;
    return true;
  }

  /* ---------------------------------------------------------------- the room: placement (only while the walk moves) */
  /* the light on a plate: the lit one in full; its neighbors dimmed (0.70 at one stop) and half desaturated, so the eye
     goes to one plate (no filter at all on the lit plate, which stays crisp) */
  function shade(el, pull, ad) {
    el.style.setProperty("--lit", pull.toFixed(3));
    el.style.setProperty("--dim", (0.7 * (1 - pull) + 0.25 * clamp(ad - 1, 0, 1.2)).toFixed(3));
    const sat = 1 - 0.5 * (1 - pull);
    el.style.filter = sat < 0.995 ? `saturate(${sat.toFixed(3)})` : "";
  }
  function place() {
    const n = S.plates.length, pos = S.pos;
    if (!n) return;
    S.ring.style.transform = `translateZ(${G.P}px) rotateY(${(pos * G.step).toFixed(5)}rad)`;
    for (let i = 0; i < n && !S.entering; i++) {             // the entrance owns the plates while it plays
      const el = S.plates[i];
      const d = G.closed ? wrapD(i - pos) : i - pos, ad = Math.abs(d);
      const hide = ad >= 2.5;                                   // at most five plates are drawn
      if (el.hidden !== hide) el.hidden = hide;
      if (hide) continue;
      const pull = ad < 1 ? 1 - smooth(ad) : 0;
      el.style.transform = `rotateY(${(-(pos + d) * G.step).toFixed(5)}rad) translateZ(${(-G.R + pull * G.zf).toFixed(2)}px)`;
      shade(el, pull, ad);
      el.style.zIndex = String(100 - Math.round(10 * ad));
    }
    S.skyDirty = true;
    const f = ((Math.round(pos) % n) + n) % n;
    if (f !== S.focal) setFocal(f);
  }
  function setFocal(f) {
    const old = S.plates[S.focal];
    const hadFocus = (old && document.activeElement === old) || S.refocus;
    if (old) old.tabIndex = -1;
    S.focal = f;
    const cur = S.plates[f];
    cur.tabIndex = 0;
    if (hadFocus) { S.refocus = false; cur.focus({ preventScroll: true }); }
    const inGuide = S.guide.contains(document.activeElement);
    guideShow(f);
    S.guideRows.forEach((b, k) => {
      if (k === f) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
      if (!inGuide) b.tabIndex = k === f ? 0 : -1;             // the guide's one tab stop is the current row
    });
    const n = nStops();
    S.count.textContent = `${pad(f + 1)} / ${pad(n)}`;
    S.toc.setAttribute("aria-label", `Contents, stop ${f + 1} of ${n}`);
    swapWords(f);
    const last = f >= n - 1, to = S.stops[last ? 0 : f + 1];
    S.next.replaceChildren(h("span", { class: "k" }, last ? "From the top" : "Next"), h("span", { class: "l" }, to ? guideLabel(to) : ""),
      h("svg", { viewBox: "0 0 10 10", width: 10, height: 10, fill: "none", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
        h("path", { d: "M3.5 1.5L7 5L3.5 8.5" })));
    if (S.walked) hideHint();
  }
  /* the rows that fit (S.gRows), the current one in the middle, clamped at both ends (the list does not wrap); the fade
     only where rows go on */
  function guideShow(i) {
    if (!S.guideList) return;
    const k = S.gRows || 7, mid = Math.floor((k - 1) / 2), n = S.guideRows.length, y = clamp((mid - i) * 26, Math.min(0, (k - n) * 26), 0);
    S.guideList.style.transform = `translateY(${y}px)`;
    S.guide.classList.toggle("is-top", y === 0);
    S.guide.classList.toggle("is-end", y === Math.min(0, (k - n) * 26));
  }

  /* ---------------------------------------------------------------- the label: one at a time, out and in */
  function swapWords(i) {
    S.wordsWant = i;
    if (still() || !S.words.childElementCount || S.entering) { clearTimeout(S.wordsT); S.wordsT = 0; fillWords(i); return; }
    S.words.classList.add("is-out");
    clearTimeout(S.wordsT);                                    // a fast walk keeps it out; it comes back once, on the last stop
    S.wordsT = setTimeout(() => { S.wordsT = 0; fillWords(S.wordsWant); }, 120);
  }
  function fillWords(i) {
    const w = words(i), n = nStops(), cover = S.stops[i].kind === "cover";
    const had = S.words.contains(document.activeElement);    // a reader on an action keeps a place in the label
    /* the next stop's line: off on the cover (its "Step inside" is that step) and on short phones */
    const nextOn = G.next && !cover;
    S.next.hidden = !nextOn;
    const ttl = h("h2", { class: "nw-ttl" }, w.title);
    const figs = w.figs && w.figs.length ? h("p", { class: "nw-figs" }, w.figs.map((b) => h("span", { class: "nw-fg" }, h("span", { class: "k" }, labelOf(b)), " ", chgEl(b, "v")))) : null;
    const deck = w.deck && G.mode !== "side" ? h("p", { class: "nw-deck" }, w.deck) : null;
    const metaEl = w.meta && (!Array.isArray(w.meta) || w.meta.length) ? h("p", { class: "nw-meta" }, w.meta) : null;
    S.words.replaceChildren(...[h("p", { class: "nw-eye" }, h("b", {}, `${pad(i + 1)} / ${pad(n)}`), ` · ${w.sec}`), ttl, figs, deck, metaEl,
      h("div", { class: "nw-acts" }, w.acts.map(act))].filter(Boolean));
    const long = String(w.title).length > 90;
    const sizes = { desk: [40, 34, 24], tablet: [34, 30, 24], phone: [25, 22, cover ? 16 : 19], side: [22, 22, 18] }[G.mode];
    let fs = long ? sizes[1] : sizes[0];
    ttl.style.fontSize = `${fs}px`;
    S.words.classList.remove("is-out");
    /* the fit, measured without the max-height cap (a capped box would hide the overflow under it) against the real room
       (down to the next stop's line, or to the legal line): first the deck goes (in the side column, the meta line), then
       the title steps down 2px at a time to its floor, then the meta line; the cover's sentence is never cut: its index
       figures go before it would be */
    const side = G.mode === "side";
    const room = side ? S.words.clientHeight : nextOn ? G.wordsMax : G.wordsFree;
    if (!side) S.words.style.maxHeight = "none";
    const tall = () => (side ? S.words.scrollHeight > room + 1 : S.words.offsetHeight > room);
    if (tall() && deck) deck.remove();
    if ((side || cover) && tall() && metaEl) metaEl.remove();
    while (tall() && fs > sizes[2]) { fs -= 2; ttl.style.fontSize = `${Math.max(fs, sizes[2])}px`; }
    if (!side && tall() && metaEl && metaEl.isConnected) metaEl.remove();
    if (tall() && figs) figs.remove();
    /* the last resort: the title cut to the lines that fit (never fewer than two) */
    if (!side && tall()) {
      const lh = parseFloat(getComputedStyle(ttl).lineHeight) || 1.15 * fs;
      ttl.style.webkitLineClamp = String(Math.max(2, Math.floor((room - (S.words.offsetHeight - ttl.offsetHeight)) / lh)));
      ttl.classList.add("is-clamp");
    }
    /* room to spare after the title stepped down: the meta line, then the deck, come back where they fit */
    if (!side && !tall()) {
      const acts = S.words.querySelector(".nw-acts");
      for (const el of [metaEl, deck]) {
        if (!el || el.isConnected) continue;
        S.words.insertBefore(el, el === deck && metaEl && metaEl.isConnected ? metaEl : acts);
        if (tall()) el.remove();
      }
    }
    S.words.style.maxHeight = side ? "" : `${Math.max(room, 120)}px`;
    if (had) {
      const m = S.words.querySelector(".nw-act.is-main") || S.words.querySelector(".nw-act");
      if (m) m.focus({ preventScroll: true });
    }
  }

  /* ---------------------------------------------------------------- the walk: one owner of the position */
  function wake() { if (!S.raf && S.on) S.raf = requestAnimationFrame(frame); }
  function settle() {
    S.walk = "settle";
    if (still()) { S.pos = S.target; S.vel = 0; }
    wake();
  }
  function go(i) {
    if (!G || !S.on) return;
    const r = Math.round(S.pos);
    S.target = norm(r + wrapD(i - r));
    S.walked = true;
    settle();
  }
  /* where the spring is at this moment (the last frame can be late on a busy machine): the exact solution, not drawn */
  function posNow() {
    if ((S.walk !== "follow" && S.walk !== "settle") || !S.tPrev) return S.pos;
    const w = S.walk === "follow" ? 28 : 14, dt = clamp((performance.now() - S.tPrev) / 1000, 0, 0.25);
    const y = S.pos - S.target, c = S.vel + w * y;
    return S.target + (y + c * dt) * Math.exp(-w * dt);
  }
  function step(dir) {
    const t = norm(Math.round(S.target) + dir);
    if (Math.abs(t - posNow()) > 4) return;                  // at most four stops queued ahead
    S.walked = true;
    if (!G.closed && t === Math.round(S.target)) { nudge(dir); return; }
    S.target = t;
    settle();
  }
  function nudge(dir) {                                      // the end of the edition: a small push and back
    if (still()) return;
    const end = Math.round(S.target);
    S.target = end + 0.06 * dir;
    settle();
    clearTimeout(S.nudgeT);
    S.nudgeT = setTimeout(() => { S.target = end; settle(); }, 140);
  }
  function frame(now) {
    S.raf = 0;
    if (!S.on) return;
    const dt = Math.min(64, S.tPrev ? now - S.tPrev : 16) / 1000;
    /* the frame time, smoothed: on a slow machine (software WebGL) wheel events come as far apart as the frames, so the
       wheel's quiet gap grows with it; ten slow frames in a row stop the sky's own motion for the visit */
    if (S.tPrev) {
      const ms = Math.min(1000, now - S.tPrev);
      S.fms = S.fms ? 0.9 * S.fms + 0.1 * ms : ms;
      S.slowN = ms > 60 ? (S.slowN || 0) + 1 : 0;
      S.crawlN = ms > 200 ? (S.crawlN || 0) + 1 : 0;
      if ((S.slowN >= 10 || S.crawlN >= 3) && !S.lowFps) { S.lowFps = true; S.skyDirty = true; }
    }
    S.tPrev = now;
    if (S.walk === "follow" || S.walk === "settle") {
      if (still()) { S.pos = S.target; S.vel = 0; S.walk = "idle"; }
      else {
        const w = S.walk === "follow" ? 28 : 14;               // per second: an exact critically damped spring
        const y = S.pos - S.target, c = S.vel + w * y, e = Math.exp(-w * dt);
        S.pos = S.target + (y + c * dt) * e;
        S.vel = (S.vel - w * c * dt) * e;
        if (Math.abs(S.pos - S.target) < 0.0005 && Math.abs(S.vel) < 0.002) { S.pos = S.target; S.vel = 0; S.walk = "idle"; }
      }
      S.dirty = true;
    }
    const moving = S.walk !== "idle";
    if (moving && !S.stage.classList.contains("is-moving")) S.stage.classList.add("is-moving");
    if (S.dirty) { S.dirty = false; place(); if (!moving) rest(); }
    const sky = S.sky && !document.hidden && !anyDialog(), alive = sky && !still() && !S.lowFps;
    /* a slow machine: the sky follows the walk at most five times a second, and at once when it settles */
    const due = !S.lowFps || !moving || now - (S.skyT || 0) >= 200;
    if (sky && due && (S.skyDirty || (alive && now - (S.skyT || 0) >= 33))) {
      S.sky.draw(still() ? 42 : S.lowFps ? (S.skyFrozen = S.skyFrozen || (now - S.t0) / 1000) : (now - S.t0) / 1000);
      S.skyT = now;
      S.skyDirty = false;
    }
    if (moving || alive) S.raf = requestAnimationFrame(frame);
    else S.tPrev = 0;
  }
  /* the walk has settled on a stop */
  function rest() {
    if (S.drag || WH.active || !Number.isInteger(S.target) || S.entering) return;
    const n = nStops();
    if (G.closed && (S.target < 0 || S.target >= n)) { S.target = S.pos = ((S.target % n) + n) % n; place(); }
    S.stage.classList.remove("is-moving");
    const f = S.focal;
    if (S.stage.dataset.stop !== String(f)) {
      if (S.stage.dataset.stop !== undefined) {
        clearTimeout(S.annT);
        S.annT = setTimeout(() => {
          const s = S.stops[f], w = words(f);
          S.live.textContent = `${f + 1} of ${n}. ${s.kind === "story" ? s.it.sec : w.sec.split(" · ")[0]}. ${typeof w.title === "string" ? w.title : s.label}.`;
        }, 400);
      }
      S.stage.dataset.stop = String(f);
      S.stage.dataset.n = String(n);
      keep("session", AT, String(f));
    }
  }

  /* ---------------------------------------------------------------- the wheel: notches are stops, a trackpad follows */
  const QUIET = 150, STREAM = 30, TICK = 50, TRACK = 220;
  const WH = { active: false, kind: "steps", start: 0, origin: 0, acc: 0, sum: 0, dir: 0, n: 0, fast: 0, peak: 0, low: Infinity,
    decayed: false, small: 0, prev: 0, last: -Infinity, swallow: false, timer: 0, endT: -Infinity };
  /* the quiet gap that ends a gesture: 150ms, longer when the frames are slow (the events come as far apart as they) */
  const quietGap = () => Math.max(QUIET, 2.2 * (S.fms || 16));
  function onWheel(e) {
    if (!S.on || !G) return;
    if (e.ctrlKey) return;                                   // a pinch or ctrl + wheel: the browser zooms
    if (anyDialog()) return;                                 // the dialog scrolls natively
    e.preventDefault();
    if (S.entering) endEntrance();
    let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (e.deltaMode === 1) d *= 40; else if (e.deltaMode === 2) d *= G.H;
    if (!d) return;
    const t = e.timeStamp, gap = t - WH.last, quiet = quietGap();
    WH.last = t;
    const mag = Math.abs(d), dir = Math.sign(d);
    /* the gesture's quiet timer is late (a busy machine, not a pause): the same push goes on; anything else ends it */
    const late = WH.active && gap >= quiet;
    const goesOn = late && WH.kind === "follow" && dir === WH.dir && !(mag >= 8 && mag > 1.8 * Math.max(WH.prev, 1));
    if (late && !goesOn) wheelEnd();
    /* the end of an inertia tail is a tail, however late it comes (a slow machine spaces it out): the same way, no harder
       than the tail so far, within four quiet gaps of the gesture's end */
    if (WH.swallow && !WH.active && dir === WH.dir && mag <= Math.max(8, 1.2 * WH.low) && t - WH.endT < Math.max(1000, 4 * quiet)) {
      WH.low = Math.min(WH.low, mag);
      WH.endT = t;
      return;
    }
    const impulse = (gap >= quiet && !goesOn)
      || (WH.dir !== 0 && dir !== WH.dir && mag > 6)                                        // a reversal
      || (WH.active && WH.kind === "follow" && WH.decayed && mag > 10 && mag > 1.8 * WH.low)  // a new flick inside a tail
      || (WH.swallow && mag >= 8 && mag > 1.8 * WH.low);                                     // a new push after a tail
    if (WH.swallow && !impulse) { WH.low = Math.min(WH.low, mag); return; }                // the rest of an inertia tail
    if (!WH.active || impulse) wheelBegin(e, mag, dir);
    else {
      WH.fast = gap < STREAM ? WH.fast + 1 : 0;
      /* slow mouse ticks (macOS, about 4px each and alike), each a stop; a trackpad's events vary (they ramp up and
         decay), and on a slow machine they come as far apart as ticks, so only alike ones count */
      if (WH.kind === "follow" && WH.n === 1 && gap >= TICK && mag >= 4 && alike(mag, WH.peak)) wheelSteps();
      else if (WH.kind === "steps" && WH.ticks && !alike(mag, WH.peak)) wheelFollow();        // not ticks after all
      else if (WH.kind === "steps" && WH.fast >= 3) wheelFollow();                     // a coalesced trackpad stream after all
      else if (WH.kind === "steps" && e.deltaMode === 0 && mag < 0.6 * WH.peak) wheelFollow();   // a decaying stream: a trackpad
    }
    if (WH.kind === "steps") { if (WH.n === 0 || gap >= STREAM) step(dir); }
    else {
      if (!impulse) { WH.peak = Math.max(WH.peak, mag); if (mag < 0.6 * WH.peak) { WH.decayed = true; WH.low = Math.min(WH.low, mag); } }
      WH.acc += d;
      S.target = norm(WH.origin + clamp(WH.acc / TRACK, -3, 3));
      S.walk = "follow";
      S.walked = true;
      if (still()) S.pos = S.target;
      WH.small = mag < 1.5 ? WH.small + 1 : 0;
      wake();
    }
    WH.n += 1; WH.sum += d; WH.prev = mag;
    clearTimeout(WH.timer);
    /* a trackpad's push ends after the (frame-scaled) quiet gap; notches and ticks after 150ms: each is a stop already */
    WH.timer = setTimeout(wheelEnd, WH.kind === "follow" ? (WH.small >= 4 && WH.peak >= 8 ? 0 : quiet) : QUIET);   // tiny events end a push only as its tail
  }
  function wheelBegin(e, mag, dir) {
    wheelEnd();
    Object.assign(WH, { swallow: false, active: true, dir, n: 0, fast: 0, sum: 0, acc: 0, peak: mag, low: Infinity, decayed: false, small: 0, ticks: false });
    /* a push that stopped short of a stop and goes on the same way within 400ms is the same push (a slow scroll in bursts) */
    const carry = WH.carry && WH.carry.dir === dir && e.timeStamp - WH.carry.t < 400 ? WH.carry.acc : 0;
    WH.carry = null;
    WH.acc = WH.sum = carry;
    WH.start = WH.origin = Math.round(S.target);
    /* a notch: lines or pages, or a big pixel step; when the frames are slow a trackpad's events pile up into big ones too,
       so then only a whole multiple of 100 or 120 (a wheel's own step) counts */
    const slow = (S.fms || 16) >= 34, whole = (k) => mag >= k && Math.abs(mag / k - Math.round(mag / k)) < 0.01;
    WH.kind = e.deltaMode !== 0 || (mag >= 50 && (!slow || whole(100) || whole(120))) ? "steps" : "follow";
  }
  const alike = (a, b) => Math.abs(a - b) <= Math.max(2, 0.5 * b);
  function wheelSteps() { WH.kind = "steps"; WH.ticks = true; S.target = norm(WH.start); step(WH.dir); }
  function wheelFollow() { Object.assign(WH, { kind: "follow", ticks: false, origin: WH.start, acc: WH.sum, peak: 0, low: Infinity, decayed: false }); }
  function wheelEnd() {
    if (!WH.active) return;
    WH.active = false;
    clearTimeout(WH.timer);
    if (WH.kind === "follow") {
      /* a trackpad moves a stop from 24px (a stall in a slow stream must not count as a push); one lone small event is a
         mouse tick, and a tick is a stop */
      const a = Math.abs(WH.acc), tick = WH.n === 1 && a >= 4, moved = a >= 24 || tick;
      S.target = !moved ? WH.origin : norm(WH.origin + Math.sign(WH.acc) * Math.min(4, Math.max(1, Math.round(a / TRACK))));
      /* a push that moved: ignore its tail until a real new push; one that did not is no tail (it may go on) */
      WH.swallow = moved;
      WH.carry = moved ? null : { acc: WH.acc, dir: Math.sign(WH.acc) || WH.dir, t: WH.last };
      WH.low = WH.prev;
      WH.endT = WH.last;
    } else WH.swallow = false;                               // notches and ticks never swallow
    settle();
  }

  /* ---------------------------------------------------------------- touch, pen and a mouse drag */
  function onDown(e) {
    if (e.button !== 0 || anyDialog()) return;
    if (S.entering) endEntrance();
    const t = e.target;
    if (t.closest && t.closest("a, button:not(.nw-pl), [role='button'], .nw-guide, input, select, textarea")) return;
    S.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, origin: S.pos, axis: null, type: e.pointerType, moved: 0, samples: [{ t: e.timeStamp, m: 0 }] };
  }
  function onMove(e) {
    const g = S.drag;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.hypot(dx, dy) < 8) return;
      g.axis = g.type === "mouse" || Math.abs(dx) >= Math.abs(dy) ? "x" : "y";   // a mouse takes x only
      try { S.stage.setPointerCapture(e.pointerId); } catch (_) { /* a synthetic pointer */ }
      S.stage.classList.add("is-drag", "is-moving");
      S.walk = "drag";
      S.vel = 0;
      S.walked = true;
      wheelEnd();
    }
    const moved = g.axis === "x" ? -dx / (0.9 * G.w) : -dy / (0.5 * G.H);
    let p = g.origin + moved;
    if (!G.closed) {
      const hi = nStops() - 1;
      if (p < 0) p *= 0.35; else if (p > hi) p = hi + (p - hi) * 0.35;   // a rubber band past the ends
    }
    g.moved = moved;
    S.pos = S.target = p;
    g.samples.push({ t: e.timeStamp, m: moved });
    while (g.samples.length > 2 && e.timeStamp - g.samples[0].t > 100) g.samples.shift();
    S.dirty = true;
    wake();
  }
  function onUp(e, cancel) {
    const g = S.drag;
    if (!g || e.pointerId !== g.id) return;
    S.drag = null;
    S.stage.classList.remove("is-drag");
    if (!g.axis) return;                                     // under 8px: a tap, and the click passes
    const a = g.samples[0], b = g.samples[g.samples.length - 1];
    let vel = b.t > a.t ? (b.m - a.m) / ((b.t - a.t) / 1000) : 0;   // stops a second, from the last 100ms
    if (e.timeStamp - b.t > 80) vel = 0;                     // the finger rested before letting go
    let n = Math.round(g.moved + clamp(0.22 * vel, -2, 2));
    if (n === 0 && (Math.abs(g.moved) >= 0.12 || Math.abs(vel) >= 1.2)) n = Math.sign(g.moved || vel);
    n = clamp(n, -3, 3);
    S.target = norm(Math.round(g.origin) + n);
    S.vel = clamp(vel, -8, 8);                               // the spring takes the finger's speed
    settle();
    if (!cancel) {                                           // a drag that moved swallows the next click
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      S.stage.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => S.stage && S.stage.removeEventListener("click", swallow, { capture: true }), 0);
    }
  }
  function onPlate(i) {
    if (S.entering) endEntrance();
    if (i !== S.focal) go(i); else primary(i);
  }

  /* ---------------------------------------------------------------- keys */
  function onKey(e) {
    if (!S.on || anyDialog() || e.metaKey || e.ctrlKey || e.altKey) return;
    const tg = e.target;
    if (tg.closest && tg.closest("input, textarea, select, [contenteditable]")) return;
    if (S.entering) endEntrance();                           // any key ends the entrance
    const k = e.key, onCtl = !!(tg.closest && tg.closest("a, button"));
    let dir = 0;
    if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || k === "j" || k === "J") dir = 1;
    else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp" || k === "k" || k === "K") dir = -1;
    else if (k === " " && !onCtl) dir = e.shiftKey ? -1 : 1;
    if (dir) {
      e.preventDefault();
      if (e.repeat && e.timeStamp - (S.keyT || 0) < 160) return;   // auto-repeat: at most a step every 160ms
      S.keyT = e.timeStamp;
      step(dir);
      return;
    }
    if (k === "Home" || k === "End") { e.preventDefault(); go(k === "Home" ? 0 : nStops() - 1); return; }
    /* Enter opens the focal plate, unless a link or a button has the focus (it keeps its own Enter) */
    if (k === "Enter" && !onCtl && !(tg.closest && tg.closest("[role='button'], summary"))) { e.preventDefault(); primary(S.focal); }
  }

  /* ---------------------------------------------------------------- the hint, once */
  function showHint() {
    if (G.mode === "side" || ONCE.hint || keep("local", HINT) === "1") return;
    ONCE.hint = true;
    keep("local", HINT, "1");
    S.hintT = setTimeout(() => { if (!S.walked && placeHint()) S.hint.classList.add("is-on"); }, S.entering ? 1500 : 1200);
    S.hintT2 = setTimeout(hideHint, 7200);
  }
  function hideHint() { if (S.hint) S.hint.classList.remove("is-on"); clearTimeout(S.hintT); }

  /* the site's brand loader (index.html): while it is on screen (html[data-loader]) the entrance waits for it to lift
     ("sv:loader-done"), so the tunnel plays as the night opens; a loader that has not lifted within 5s (its own failsafe)
     means no entrance at all */
  function afterLoader(fn) {
    if (!document.documentElement.hasAttribute("data-loader")) { fn(); return; }
    let late = null;
    const go = () => { clearTimeout(late); if (S.on && S.mode === "room") fn(); };
    addEventListener("sv:loader-done", go, { once: true });
    late = setTimeout(() => removeEventListener("sv:loader-done", go), 5000);
  }

  /* ---------------------------------------------------------------- the entrance: the tunnel, once a session */
  function entrance() {
    S.entering = true;
    S.stage.classList.add("is-entering");
    /* a tunnel of cards around the axis, the focal plate straight ahead on it; the ring reads at once (the cards around
       start half lit) and every card flies to its place on the wall */
    const rx = (G.mode === "phone" ? 0.62 : 0.42) * G.W, ry = 0.62 * rx;
    const ease = "cubic-bezier(.22, .61, .36, 1)", DUR = 1500;
    const list = S.plates.map((el, i) => ({ el, d: G.closed ? wrapD(i - S.pos) : i - S.pos }))
      .sort((a, b) => Math.abs(a.d) - Math.abs(b.d) || a.d - b.d);
    S.anims = [];
    let last = 0;
    list.forEach((p, rank) => {
      const r1 = rank - 1, k = Math.floor(Math.max(0, r1) / 6), j = Math.max(0, r1) % 6, phi = ((j * 60 + k * 30 + 30) * Math.PI) / 180;
      const ad = Math.abs(p.d), pull = ad < 1 ? 1 - smooth(ad) : 0, far = ad >= 2.5;
      const a0 = (-S.pos * G.step).toFixed(5), a1 = (-(S.pos + p.d) * G.step).toFixed(5);
      const from = rank === 0 ? `rotateY(${a0}rad) translate3d(0px, 0px, ${-(G.P + 700)}px)`
        : `rotateY(${a0}rad) translate3d(${(rx * Math.cos(phi)).toFixed(1)}px, ${(ry * Math.sin(phi)).toFixed(1)}px, ${-(G.P + 700 + 650 * k)}px)`;
      const to = `rotateY(${a1}rad) translate3d(0px, 0px, ${(-G.R + pull * G.zf).toFixed(2)}px)`;
      p.el.hidden = false;
      shade(p.el, pull, ad);
      p.el.style.zIndex = String(100 - Math.round(10 * ad));
      const delay = 80 + 60 * Math.min(rank, 4), o0 = rank >= 1 && rank <= 11 ? 0.45 : 0;
      last = Math.max(last, delay + DUR);
      S.anims.push(p.el.animate([{ transform: from }, { transform: to }], { duration: DUR, delay, easing: ease, fill: "both" }));
      S.anims.push(p.el.animate(far ? [{ opacity: o0 }, { opacity: Math.max(o0, 0.8), offset: 0.35 }, { opacity: 0 }] : [{ opacity: o0 }, { opacity: 1 }],
        { duration: far ? DUR : 600, delay, easing: "ease", fill: "both" }));
    });
    const rise = (el, at, dy) => S.anims.push(el.animate([{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: "none" }],
      { duration: 500, delay: at, easing: "cubic-bezier(.2, .7, .2, 1)", fill: "both" }));
    rise(S.words, 900, 16);
    if (G.mode === "desk") rise(S.guide, 1100, 0);
    else { rise(S.count, 1100, 0); rise(S.toc, 1100, 0); rise(S.next, 1200, 0); }
    S.entT = setTimeout(endEntrance, last + 40);
  }
  function endEntrance() {
    if (!S.entering) return;
    S.entering = false;
    clearTimeout(S.entT);
    S.anims.forEach((a) => { try { a.cancel(); } catch (_) { /* gone */ } });   // every plate jumps to its place
    S.anims = [];
    if (S.stage) S.stage.classList.remove("is-entering");
    S.dirty = true;
    wake();
    if (S.fontsLate) { S.fontsLate = false; fontsArrived(); }
  }

  /* ================================================================ the sky, the wall and the floor: one shader */
  const VERT = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";
  const FRAG = `precision mediump float;
uniform vec2 uRes; uniform float uTime; uniform float uYaw; uniform float uYc; uniform float uP; uniform float uTop; uniform float uBase;
uniform vec3 uPool; uniform float uStep; uniform vec2 uPlate; uniform float uXc;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec2 fc = gl_FragCoord.xy;
  float x = fc.x - uXc;
  float y = (uRes.y - fc.y) - uYc;
  float s = sqrt(1.0 + (x / uP) * (x / uP));
  float top = -uTop * s;
  float base = uBase * s;
  float th = atan(x, uP) + uYaw;
  vec3 col;
  if (y < top) {
    float hgt = (top - y) / uRes.y;
    col = mix(vec3(0.034, 0.064, 0.150), vec3(0.010, 0.016, 0.046), smoothstep(0.0, 0.5, hgt));
    vec2 sp = vec2(th * 110.0, hgt * 95.0);
    vec2 cell = floor(sp); vec2 fcl = fract(sp) - 0.5; float hs = hash(cell);
    float tw = 0.55 + 0.45 * sin(uTime * (0.8 + hs * 2.5) + hs * 40.0);
    col += step(0.982, hs) * smoothstep(0.12, 0.0, length(fcl)) * tw * vec3(0.86, 0.91, 1.0) * smoothstep(0.02, 0.16, hgt);
    float ax = th * 1.7;
    float a = 0.0;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float wave = 0.045 * sin(ax * (0.85 + 0.35 * fk) + uTime * (0.035 + 0.02 * fk) + fk * 2.1) + 0.04 * (fbm(vec2(ax * 1.1 + fk * 7.0, uTime * 0.02)) - 0.5);
      float d = hgt - (0.07 + 0.06 * fk + wave);
      float rays = 0.30 + 0.95 * pow(fbm(vec2(ax * 9.5 + fk * 13.0, uTime * 0.07)), 1.6);
      float body = smoothstep(-0.014, 0.010, d) * (exp(-max(d, 0.0) * (5.0 + 2.4 * fk)) + 0.9 * exp(-max(d, 0.0) * 40.0));
      a += body * rays * (0.72 - 0.17 * fk);
    }
    a *= 0.55 + 0.45 * smoothstep(0.15, 0.75, fbm(vec2(ax * 0.45, uTime * 0.01)));
    vec3 aur = mix(vec3(0.26, 0.62, 1.0), vec3(0.46, 0.42, 1.0), smoothstep(0.05, 0.32, hgt));
    col += aur * a * 1.45 * smoothstep(0.0, 0.05, hgt);
    col += vec3(0.30, 0.55, 1.0) * exp(-hgt * 60.0) * 0.10;
  } else if (y <= base) {
    float t = (y - top) / max(1.0, base - top);
    col = mix(vec3(0.050, 0.060, 0.100), vec3(0.020, 0.026, 0.050), t);
    col += vec3(0.35, 0.60, 1.0) * exp(-(y - top) / (uRes.y * 0.0045)) * 0.30;
    float seam = abs(fract(th / uStep + 0.5) - 0.5) * uStep * uP / s;
    col += vec3(1.0) * smoothstep(1.4, 0.0, seam) * 0.022;
    vec2 q = vec2(x / (uPlate.x * 0.85), y / (uPlate.y * 0.95));
    col += vec3(0.22, 0.42, 0.95) * exp(-dot(q, q) * 1.4) * 0.17;
  } else {
    float t = (y - base) / max(1.0, uRes.y - uYc - base);
    col = mix(vec3(0.030, 0.052, 0.115), vec3(0.008, 0.012, 0.028), smoothstep(0.0, 1.0, t));
    vec2 q = vec2(x / uPool.y, (y - uPool.x) / uPool.z);
    col += vec3(0.16, 0.36, 0.95) * exp(-dot(q, q) * 1.2) * 0.55;
    col += vec3(0.30, 0.55, 1.0) * exp(-(y - base) / (uRes.y * 0.006)) * 0.22;
  }
  gl_FragColor = vec4(col, 1.0);
}`;
  function makeSky(canvas) {
    let gl;
    try { gl = canvas.getContext("webgl", { antialias: false, alpha: false, depth: false, powerPreference: "low-power" }); } catch (_) { gl = null; }
    if (!gl) return null;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
      return s;
    };
    try {
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const u = {};
      ["uRes", "uTime", "uYaw", "uYc", "uP", "uTop", "uBase", "uPool", "uStep", "uPlate", "uXc"].forEach((n) => { u[n] = gl.getUniformLocation(prog, n); });
      return {
        draw(t) {
          const k = (S.lowFps ? 0.35 : 0.5) * Math.min(2, devicePixelRatio || 1);
          const w = Math.max(2, Math.round(canvas.clientWidth * k)), hh = Math.max(2, Math.round(canvas.clientHeight * k));
          if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; gl.viewport(0, 0, w, hh); }
          const wall = G.P / G.R;
          gl.uniform2f(u.uRes, w, hh);
          gl.uniform1f(u.uTime, t);
          gl.uniform1f(u.uYaw, S.pos * G.step);
          gl.uniform1f(u.uXc, G.xc * k);
          gl.uniform1f(u.uYc, G.yc * k);
          gl.uniform1f(u.uP, G.P * k);
          gl.uniform1f(u.uTop, wall * 0.84 * G.h * k);
          gl.uniform1f(u.uBase, wall * 0.62 * G.h * k);
          gl.uniform3f(u.uPool, 0.62 * G.h * k, 0.62 * G.w * k, 0.16 * G.h * k);
          gl.uniform1f(u.uStep, G.step);
          gl.uniform2f(u.uPlate, G.w * k, G.h * k);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          if (!canvas.classList.contains("is-on")) canvas.classList.add("is-on");
        },
        drop() { const ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); },
      };
    } catch (e) {
      console.warn("Markets Briefing: the 3D sky is off", e && e.message);
      return null;
    }
  }

  /* ---------------------------------------------------------------- the room: start and stop */
  function startRoom(q) {
    document.documentElement.classList.add("nw-room");
    S.on = true;
    S.walked = false;
    G = null;
    relayout();
    const n = nStops();
    let at = 0;
    const it = q.story ? S.stories.find((x) => x.id === q.story) : null;
    if (it) at = stopOfStory(it);
    else { const v = parseInt(keep("session", AT), 10); if (v >= 0 && v < n) at = v; }
    S.pos = S.target = Math.max(0, at);
    S.vel = 0;
    S.walk = "idle";
    place();
    rest();
    listen(window, "wheel", onWheel, { passive: false });       // the whole window walks, the site bar too
    listen(S.stage, "pointerdown", onDown);
    listen(S.stage, "pointermove", onMove);
    listen(S.stage, "pointerup", (e) => onUp(e, false));
    listen(S.stage, "pointercancel", (e) => onUp(e, true));
    listen(window, "keydown", onKey);
    listen(window, "resize", () => { clearTimeout(S.resizeT); S.resizeT = setTimeout(() => { if (!S.on) return; endEntrance(); relayout(); wake(); }, 150); });
    listen(document, "visibilitychange", () => { if (!document.hidden) wake(); });
    const deep = !!(q.story || q.map || q.co);
    if (!deep && !still() && !ONCE.entrance && keep("session", SEEN) !== "1") afterLoader(entrance);
    ONCE.entrance = true;
    keep("session", SEEN, "1");
    showHint();
    S.t0 = performance.now();
    S.skyFrozen = 0;
    /* the plates and the label paint first; the sky's shader compiles after that paint (it can take long on a cold GPU) */
    const canvas = S.canvas;
    requestAnimationFrame(() => setTimeout(() => {
      if (!S.on || S.mode !== "room" || S.canvas !== canvas) return;
      S.sky = makeSky(canvas);
      if (!S.sky) { GL_OK = false; keep("session", GLKEY, "0"); draw(q); return; }   // the shader did not start: the Page, for this visit
      S.skyDirty = true;
      wake();
    }, 0));
  }
  /* Inter arrived after the first drawing (a cold visit does not wait for it): measure and draw the words again */
  function fontsArrived() {
    if (!S.on || !S.el) return;
    if (S.entering) { S.fontsLate = true; return; }          // after the entrance: its cards stay as they fly
    if (S.mode === "room" && S.stage && G) { buildPlates(); place(); }
    DLG.forEach((d) => { if (d.T && d.el.open) d.T.draw(); });
    if (S.listMap) S.listMap.draw();
  }
  function stop() {
    S.on = false;
    S.quiet = true;                                          // closing everything: no URL and no focus changes
    if (S.raf) cancelAnimationFrame(S.raf);
    S.raf = 0;
    S.tPrev = 0;
    S.off.forEach((f) => f());
    S.off = [];
    if (S.sky) S.sky.drop();
    S.sky = null;
    clearTimeout(WH.timer);
    Object.assign(WH, { active: false, swallow: false, last: -Infinity, dir: 0 });
    [S.wordsT, S.annT, S.entT, S.hintT, S.hintT2, S.nudgeT, S.resizeT].forEach(clearTimeout);
    S.anims.forEach((a) => { try { a.cancel(); } catch (_) { /* gone */ } });
    S.anims = [];
    S.entering = false;
    DLG.forEach((d) => { d.dead = true; if (d.T && d.T.stop) d.T.stop(); if (d.io) d.io.disconnect(); if (d.el.open) d.el.close(); });
    DLG.clear();
    STACK.length = 0;
    G = null;
    if (S.listMap && S.listMap.stop) S.listMap.stop();
    S.listMap = null;
    S.url = {};
    S.quiet = false;
    document.documentElement.classList.remove("nw-room", "nw-lock");
    S.drag = null;
    S.walk = "idle";
    S.stage = null;
    S.plates = [];
    S.focal = -1;
    S.mode = null;
  }

  /* ================================================================ what opens: one dialog per surface */
  const DLG = new Map();
  const STACK = [];                                          // the open dialogs, the top one last
  const anyDialog = () => { for (const d of DLG.values()) if (d.el.open) return true; return false; };
  const topDlg = () => { for (let i = STACK.length - 1; i >= 0; i--) if (STACK[i].el.open && !STACK[i].closing) return STACK[i]; return null; };
  /* Escape closes one layer at a time, the top one (a step back inside it first: the map's sector zoom). It is handled on
     the keydown itself: the browser lets a page cancel only the first of two Escape presses in a row, and it would close
     two dialogs opened together by a link (?map=spx&co=AAPL) with one press */
  function escape(e) {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    const d = topDlg();
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    d.escT = e.timeStamp;
    if (d.onEsc && d.onEsc()) return;
    closeDlg(d);
  }
  function surface(name, kind) {
    let d = DLG.get(name);
    if (d && d.el.isConnected) return d;
    d = { name, kind };
    d.head = h("div", { class: "nw-dlg-head" });
    d.body = h("div", { class: "nw-dlg-body" });
    d.inner = h("div", { class: "nw-dlg-in" }, h("span", { class: "nw-grab", "aria-hidden": "true" }), d.head, d.body);
    d.el = h("dialog", { class: `nw-dlg is-${kind} nw-d-${name}`, "aria-labelledby": `nw-${name}-h` }, d.inner);
    /* a hairline under the header once the body scrolls (a sentinel at the body's top, watched, not a scroll listener) */
    d.top = h("span", { class: "nw-dlg-top", "aria-hidden": "true" });
    if ("IntersectionObserver" in window) {
      d.io = new IntersectionObserver((en) => { const x = en[en.length - 1]; d.el.classList.toggle("is-scrolled", !x.isIntersecting); }, { root: d.body });
      d.io.observe(d.top);
    }
    d.el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { escape(e); return; }
      if (d.onKey) d.onKey(e);
    });
    d.el.addEventListener("cancel", (e) => {
      e.preventDefault();
      if (e.timeStamp - (d.escT || -1e9) < 100) return;      // the keydown above already handled it
      if (topDlg() === d) closeDlg(d);
    });
    d.el.addEventListener("close", () => closed(d));
    /* a click on the backdrop closes the dialog, but not the second click of the one that opened it (a double click);
       over the site bar (the map view leaves it in sight) the click also follows the link under it */
    d.el.addEventListener("click", (e) => {
      if (e.target !== d.el || e.detail > 1 || performance.now() - (d.openedAt || 0) < 400) return;
      const link = [...document.querySelectorAll("#site-bar a")].find((a) => {
        const r = a.getBoundingClientRect();
        return e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12;
      });
      closeDlg(d);
      const to = link && link.getAttribute("href");
      if (to && !/^#\/news\b/.test(to)) location.hash = to;
    });
    grabToClose(d);
    S.el.append(d.el);
    DLG.set(name, d);
    return d;
  }
  const closeBtn = (d) => h("button", { type: "button", class: "nw-x", "aria-label": "Close", onclick: () => closeDlg(d) }, icon("close", 16));
  function show(d, head, body, focusEl) {
    if (d.closing) { clearTimeout(d.closeT); d.closing = false; }      // opened again while it was closing: it stays
    if (!d.el.open) {
      /* the focus returns where the reader was; a button inside a dialog that is closing hands over that dialog's own */
      let back = document.activeElement;
      DLG.forEach((x) => { if (x !== d && x.closing && x.el.contains(back)) back = x.back; });
      d.back = back;
      d.seq = (d.seq || 0) + 1;
      d.openedAt = performance.now();
    }
    d.head.replaceChildren(...[head].flat(9).filter(Boolean), closeBtn(d));
    d.body.replaceChildren(d.top, ...[body].flat(9).filter(Boolean));
    d.body.scrollTop = 0;
    d.el.classList.remove("is-closing", "is-under", "is-scrolled");
    d.el.style.transform = "";
    if (!d.el.open) d.el.showModal();
    document.documentElement.classList.add("nw-lock");      // the page under a dialog holds still (css/site.css)
    const i = STACK.indexOf(d);
    if (i >= 0) STACK.splice(i, 1);
    STACK.push(d);
    STACK.forEach((x) => x.el.classList.toggle("is-under", x !== d && x.el.open));   // phones: the sheet under it steps back
    d.el.classList.toggle("is-over", STACK.some((x) => x !== d && x.el.open));
    const f = focusEl || d.head.querySelector(".nw-x");
    if (f) f.focus({ preventScroll: true });
    syncURL();
  }
  /* the page's own close: a 180ms fade, then closed at once (the close event may come a frame later; see closed) */
  function closeDlg(d) {
    if (!d || !d.el.open || d.closing) return;
    const done = () => { d.closing = false; if (d.el.open) { d.el.close(); closed(d); } };
    if (still()) { done(); return; }
    d.closing = true;
    d.el.classList.add("is-closing");
    d.closeT = setTimeout(done, 180);
  }
  function closed(d) {
    if (d.el.open || d.closedSeq === d.seq) return;          // a late event: already handled, or the dialog was opened again
    d.closedSeq = d.seq;
    clearTimeout(d.closeT);
    d.closing = false;
    d.el.classList.remove("is-closing");
    d.el.style.transform = "";
    const f = d.onClose;
    d.onClose = null;
    const i = STACK.indexOf(d);
    if (i >= 0) STACK.splice(i, 1);
    if (!anyDialog()) document.documentElement.classList.remove("nw-lock");
    d.el.classList.remove("is-under", "is-over");
    const top = topDlg();
    if (top) top.el.classList.remove("is-under");
    if (d.dead || S.quiet) return;                           // the page closed it on its way out (the event comes later)
    if (f) f();
    syncURL();
    let back = d.back;
    d.back = null;
    /* the opener may be gone: a plate that the walk hid, a label drawn again, a chip of a story drawn again, a button in a
       dialog that has closed; then the dialog still open under this one, or the room's lit plate, or the page's title */
    const gone = (el) => !el || !el.isConnected || !el.focus || !!el.closest("[hidden]") || (el.closest("dialog") && !el.closest("dialog").open);
    if (back && back.classList && back.classList.contains("nw-pl")) back = S.plates[S.focal] || back;
    if (gone(back)) {
      back = top ? top.head.querySelector(".nw-x")
        : S.mode === "room" && S.plates[S.focal] ? (S.words && S.words.querySelector(".nw-act.is-main")) || S.plates[S.focal]
          : document.getElementById("nw-h1");
    }
    if (back && !gone(back)) back.focus({ preventScroll: true });
    S.skyDirty = true;
    wake();                                                  // the sky resumes
  }
  /* ?story=, ?map= and ?co= while their dialog is open, written with replaceState */
  function syncURL() {
    if (S.quiet || !S.on || Router.current !== "news" || !/^#\/news\b/.test(location.hash)) return;
    const q = ["story", "map", "co"].filter((k) => S.url[k]).map((k) => `${k}=${encodeURIComponent(S.url[k])}`).join("&");
    const want = `#/news${q ? `?${q}` : ""}`;
    if (location.hash !== want) history.replaceState(history.state, "", `${location.pathname}${location.search}${want}`);
  }
  /* phones: a swipe down on the grabber or the header closes the sheet */
  function grabToClose(d) {
    let g = null;
    d.inner.addEventListener("pointerdown", (e) => {
      if (!narrow() || e.button !== 0) return;
      const t = e.target;
      if (!(t.closest && t.closest(".nw-grab, .nw-dlg-head")) || t.closest("button, a, [role='button']")) return;
      g = { id: e.pointerId, y: e.clientY, t: e.timeStamp, dy: 0 };
      try { d.inner.setPointerCapture(e.pointerId); } catch (_) { /* a synthetic pointer */ }
    });
    d.inner.addEventListener("pointermove", (e) => {
      if (!g || e.pointerId !== g.id) return;
      g.dy = Math.max(0, e.clientY - g.y);
      d.el.style.transform = `translateY(${g.dy}px)`;
    });
    const up = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const v = g.dy / Math.max(1, e.timeStamp - g.t);
      const shut = g.dy > 90 || (g.dy > 24 && v > 0.5);
      g = null;
      d.el.style.transform = "";
      if (shut) closeDlg(d);
    };
    d.inner.addEventListener("pointerup", up);
    d.inner.addEventListener("pointercancel", up);
  }
  const eyebrow = (...kids) => h("p", { class: "nw-dlg-eye" }, kids);
  const stopNum = (k) => (k >= 0 ? `${pad(k + 1)} / ${pad(nStops())} · ` : "");

  /* ---------------------------------------------------------------- a story */
  /* a company's chip: a button when the company has a card (on a map, on the wire or among the movers), else plain */
  function companyChip(t, size, cls) {
    /* another share class on the maps (GOOGL in the story, GOOG on the map): its name and card; no name at all: the ticker once */
    const k = carried(t), nm = nameOf(k), named = !!nm && nm !== k && nm !== t;
    const kids = [tile(LOGOS.has(t) ? t : k, size), named ? h("span", { class: "nm" }, k !== t ? nm.replace(/\s*\(Class [A-Z]\)$/, "") : nm) : null,
      h("span", { class: named ? "tk" : "nm" }, t)];
    return hasCard(k) ? h("button", { type: "button", class: cls, onclick: () => openCompany(k) }, kids) : h("span", { class: `${cls} is-plain` }, kids);
  }
  function openStory(it, o = {}) {
    if (!it) return;
    const d = surface("story", "modal");
    const n = S.stories.length, k = stopOfStory(it), tks = tickersOf(it);
    const walk = (dir, from) => {
      const nx = S.stories[(it.n - 1 + dir + n) % n];
      if (S.mode === "room" && S.on && G) go(stopOfStory(nx));
      openStory(nx, { focusAct: from });
    };
    d.onKey = (e) => {
      if (e.target.closest && e.target.closest("input, textarea")) return;
      if (n > 1 && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const a = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.act : null;
        walk(e.key === "ArrowLeft" ? -1 : 1, a || null);
      }
    };
    /* Previous and Next keep the focus on themselves as the sheet changes story */
    const prev = n > 1 ? h("button", { type: "button", class: "nw-act", "data-act": "prev", onclick: () => walk(-1, "prev") }, "‹ Previous") : null;
    const next = n > 1 ? h("button", { type: "button", class: "nw-act", "data-act": "next", onclick: () => walk(1, "next") }, "Next ›") : null;
    show(d, eyebrow(stopNum(k), h("b", {}, it.sec), ` · ${when(it.published, it.date_only)}`), [
      h("h2", { id: "nw-story-h", class: "nw-st-ttl" }, it.title),
      tks.length ? h("div", { class: "nw-chips" }, tks.map((t) => companyChip(t, 24, "nw-chip"))) : null,
      h("ol", { class: "nw-facts" }, (it.facts || []).map((f, j) => h("li", {}, h("span", { class: "nw-fn", "aria-hidden": "true" }, pad(j + 1)), h("span", {}, f)))),
      it.why ? h("h3", { class: "nw-why-h" }, "Why it matters") : null,
      it.why ? h("p", { class: "nw-why" }, it.why) : null,
      h("div", { class: "nw-srcrow" }, h("p", { class: "nw-srcline" }, `${it.source} · ${when(it.published, it.date_only)}${host(it.url) ? ` · ${host(it.url)}` : ""}`),
        h("div", { class: "nw-acts" }, act({ label: "Read the source", href: it.url, main: true }), prev, next)),
    ], o.focusAct === "prev" ? prev : o.focusAct === "next" ? next : null);
    S.url.story = it.id;
    d.onClose = () => { S.url.story = null; d.onKey = null; };
    syncURL();
  }

  /* ---------------------------------------------------------------- the map view */
  function openMap(key = "spx", o = {}) {
    const mp = mapOf(key);
    if (!mp) return;
    const d = surface("map", "stage");
    if (d.T && d.T.stop) d.T.stop();
    const b = boardOf(key), keys = mapKeys(), lit = o.lit || null;
    const title = o.title || mapName(key);
    const eye = h("p", { class: "nw-dlg-eye" });
    const ttl = h("h2", { id: "nw-map-h", class: "nw-mv-ttl" }, title);
    const setEye = (zoom, from) => {
      if (zoom) {
        const s = sectorsOf(mp).find((x) => x.name === zoom);
        eye.replaceChildren(h("button", { type: "button", class: "nw-back", onclick: () => zoomOut(T) }, "‹ All sectors"), ` · ${title}`);
        ttl.replaceChildren(zoom, ...(s ? [" ", h("span", { class: toneOf(s.move) }, pct(s.move))] : []));
      } else {
        eye.replaceChildren(h("b", {}, "The map"), ` · ${dayOf(mp.as_of)} close`);
        ttl.replaceChildren(title);
      }
      /* measured after the new nodes: the boxes, the header or "All sectors" may have taken the focus with them */
      const a = document.activeElement;
      const lost = !a || a === document.body || a === d.el || !d.el.contains(a);
      if (!lost || !T.el || !d.el.open) return;
      const to = zoom ? eye.querySelector(".nw-back")
        : [...T.el.querySelectorAll("[data-s]")].find((x) => from && x.dataset.s === from) || T.el.querySelector("[tabindex='0']");
      if (to) to.focus({ preventScroll: true });
    };
    const T = treemap(mp, { lit, phone: narrow(), name: title, onZoom: setEye, fresh: () => performance.now() - (d.openedAt || 0) < 400,
      onBox: (t, el) => { T.setPick(t); openCompany(t, "map"); const c = DLG.get("company"); if (c && el && el.isConnected) c.back = el; } });
    d.T = T;
    setEye(null);
    let pressed = null;
    const tabs = keys.length > 1 ? h("div", { class: "nw-seg", role: "group", "aria-label": "Index" }, keys.map((k) => {
      const on = k === key && !lit;
      const btn = h("button", { type: "button", "aria-pressed": String(on), onclick: () => { if (k !== key || lit) openMap(k, { focusTab: true }); } }, mapName(k));
      if (on) pressed = btn;
      return btn;
    })) : null;
    /* the words under the title: on phones the index's own figure comes first, whole, and the description clamps */
    const fig = b ? h("span", { class: "nw-nb" }, labelOf(b), " ", chgEl(b)) : null;
    const meta = o.meta ? [h("p", { class: "nw-mv-meta" }, o.meta, o.list ? h("span", { class: "nw-mv-list" }, " · ", o.list) : null), o.extra || null]
      : [h("p", { class: "nw-mv-meta is-wide" }, `${ofText(mp)}, sized by market value and colored by ${weekday(mp.as_of)}'s move`, fig ? [" · ", fig] : null),
        h("p", { class: "nw-mv-meta is-narrow" }, h("span", { class: "nw-mv-fig" }, fig ? [fig.cloneNode(true), " · "] : null, `colored by ${weekday(mp.as_of)}'s move`),
          h("span", { class: "nw-mv-of" }, ofText(mp)))];
    show(d, [h("div", { class: "nw-mv-l" }, eye, ttl, meta), tabs],
      [T.el, h("div", { class: "nw-mv-foot" }, legend(), h("p", { class: "nw-mv-src" }, MAP_SOURCE))], o.focusTab ? pressed : null);
    mapTip(T, d.body);
    T.draw();
    d.onEsc = () => { if (T.zoom) { zoomOut(T); return true; } return false; };
    d.onClose = () => { S.url.map = null; if (T.stop) T.stop(); d.T = null; d.onEsc = null; };
    S.url.map = o.url || key;
    syncURL();
  }
  function openMovers() {
    const m = S.D.moves || {}, down = (m.down || []).slice(0, 5), up = (m.up || []).slice(0, 5);
    const names = (l) => h("b", {}, l.map((x) => x.ticker).join(", "));
    openMap("spx", { lit: new Set([...down, ...up].map((x) => x.ticker)), title: "The biggest S&P 500 moves",
      meta: `The five biggest falls and rises among the ${(S.D.map || {}).n || 200} largest companies, ${dayOf(m.as_of)}`,
      list: [down.length ? ["Falls ", names(down)] : null, down.length && up.length ? " · " : null, up.length ? ["Rises ", names(up)] : null] });
  }
  async function openPortfolioMap() {
    let held = [];
    try { held = ((await api("/api/cp/holdings")).rows || []).map((r) => r.ticker).filter(Boolean); } catch (_) { held = []; }
    const mp = mapOf("spx");
    if (!mp || !S.on) return;
    if (!held.length) { openMap("spx"); return; }
    const on = held.filter((t) => mp.rows.some((r) => r.t === t)), off = held.filter((t) => !on.includes(t));
    openMap("spx", { lit: new Set(on), title: "Claude Portfolio's holdings", url: "cp",
      meta: `${on.length} of ${plural(held.length, "holding", "holdings")} among the ${mp.n} largest companies, colored by ${weekday(mp.as_of)}'s move`,
      extra: off.length ? h("p", { class: "nw-mv-chips" }, h("span", { class: "k" }, "Also held"),
        off.map((t) => (hasCard(t) ? h("button", { type: "button", class: "nw-mv-chip", onclick: () => openCompany(t) }, tile(t, 20), t)
          : h("span", { class: "nw-mv-chip" }, tile(t, 20), t)))) : null });
  }

  /* ---------------------------------------------------------------- a company's card: where it is listed */
  /* Every company the page names has a card: on a map (its listing, its figures), or on the wire or among the movers only
     (its logo, its name, its SEC filings by the CIK in the wire's link, the day's move when it is a mover); never a price
     the page does not have. */
  function openCompany(t, from) {
    if (!hasCard(t)) return;
    const x = rowOf(t), r = x ? x.r : null, mp = x ? x.mp : null, p = (mp && (mp.profiles || {})[t]) || {}, ex = p.x || [];
    const mover = moverOf(t), wires = wireOf(t), stories = S.stories.filter((it) => tickersOf(it).includes(t));
    const cikM = wires.map((w) => /\/edgar\/data\/(\d+)\//.exec(w.url || "")).find(Boolean);
    const cik = p.cik || (cikM ? cikM[1] : null);
    const d = surface("company", "side");
    const onMap = from === "map" && !!r;
    d.el.classList.toggle("from-map", onMap);
    const kv = (k, v) => (v ? h("div", { class: "nw-kv" }, h("dt", {}, k), h("dd", {}, v)) : null);
    const big = (v, lbl, cls) => h("div", { class: "nw-co-f" }, h("b", { class: cls || null }, v), h("span", {}, lbl));
    const filings = r ? [p.pe ? big(p.pe.toFixed(1), "price to earnings") : null, ok(p.rg) ? big(pct(p.rg), "revenue growth", toneOf(p.rg)) : null,
      ok(p.nm) ? big(unsigned(p.nm, fmt.p1), "net margin") : null].filter(Boolean) : [];
    const closeOf = (asOf) => ["Lang & Schwarz close, ", h("span", { class: "nw-nb" }, dayOf(asOf))];
    const figs = r ? h("div", { class: "nw-co-figs" }, big(pct(r.m), closeOf(mp.as_of), toneOf(r.m)), big(money(r.c), "market value"))
      : mover ? h("div", { class: "nw-co-figs is-one" }, big(pct(mover.move), closeOf((S.D.moves || {}).as_of), toneOf(mover.move))) : null;
    const where = r ? [h("h3", { class: "nw-co-h" }, "Where it is listed"),
      h("dl", { class: "nw-kvs" }, kv("Listing", ex.length ? `${ex.join(" and ")}, United States` : null),
        kv("Also traded", "Lang & Schwarz, Germany (this page's closes, in US dollars)"), kv("ISIN", p.isin)),
      h("h3", { class: "nw-co-h" }, "The company"),
      h("dl", { class: "nw-kvs" }, kv("Headquarters", p.hq), kv("Incorporated", p.inc), kv("Sector", r.s), kv("Industry", p.sub), kv("Fiscal year ends", p.fy))] : null;
    /* a story named here: the story sheet (already open on it: the card just closes) */
    const toStory = (it) => () => { const s = DLG.get("story"); closeDlg(d); if (!(s && s.el.open && S.url.story === it.id)) openStory(it); };
    const mapKey = r ? (mapOf("spx") && mapOf("spx").rows.some((y) => y.t === t) ? "spx" : mapKeys().find((k) => mapOf(k).rows.some((y) => y.t === t))) : null;
    show(d, h("div", { class: "nw-co-id" }, tile(t, 48), h("div", {}, h("h2", { id: "nw-company-h" }, nameOf(t)), h("p", {}, `${t}${ex.length ? ` · ${ex.join(", ")}` : ""}`))), [
      figs,
      where,
      filings.length ? h("h3", { class: "nw-co-h" }, "From its filings", p.period ? [" · twelve months to ", h("span", { class: "nw-nb" }, day(p.period))] : null) : null,
      filings.length ? h("div", { class: "nw-co-trio" }, filings) : null,
      stories.length || wires.length ? h("h3", { class: "nw-co-h" }, "In today's briefing") : null,
      stories.length || wires.length ? h("ul", { class: "nw-co-today" },
        stories.map((it) => h("li", {}, h("button", { type: "button", class: "nw-link", onclick: toStory(it) }, it.title))),
        wires.map((w) => h("li", {}, h("a", { href: w.url, target: "_blank", rel: "noopener" }, w.title, " ", h("span", { "aria-hidden": "true" }, "↗"), newTab())))) : null,
      h("div", { class: "nw-acts nw-co-acts" },
        cik ? act({ label: "SEC filings", main: true, href: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=&dateb=&owner=include&count=40` }) : null,
        !mapKey ? null : onMap ? act({ label: "Back to the map", run: () => closeDlg(d) })
          : act({ label: "Show on the map", run: () => { closeDlg(d); openMap(mapKey, { lit: new Set([t]), title: `${r.n} on the map` }); } })),
      h("p", { class: "nw-foot-note" }, r ? "Listing, headquarters and fiscal year: the company's SEC submissions. Figures: its own filings, as reported. Prices: Lang & Schwarz."
        : `Not among the ${(S.D.map || {}).n || 200} largest S&P 500 companies on this page's map: no listing details or market value here.${mover ? " Its move: Lang & Schwarz." : ""}`),
    ]);
    S.url.co = t;
    d.onClose = () => { S.url.co = null; const m = DLG.get("map"); if (m && m.T && m.T.pick === t) m.T.setPick(null); };
    syncURL();
  }

  /* ---------------------------------------------------------------- the figures: "All the figures" */
  function openMarkets(focusKey) {
    const d = surface("markets", "modal");
    const board = S.D.board || [];
    const GROUPS = [["Stocks", ["spx", "ndx", "sx5e", "dax", "ftsemib", "nikkei"]], ["Rates and currencies", ["us10y", "eurusd"]]];
    const named = new Set(GROUPS.flatMap((g) => g[1]));
    const groups = [...GROUPS.map(([title, keys]) => ({ title, items: board.filter((b) => keys.includes(b.key)) })),
      { title: "Commodities and crypto", items: board.filter((b) => !named.has(b.key)) }].filter((g) => g.items.length);
    const blocks = groups.map((g) => {
      const tally = new Map();
      g.items.forEach((b) => { const k = `${b.as_of}|${b.source}`; tally.set(k, (tally.get(k) || 0) + 1); });
      const common = [...tally.entries()].sort((a, b) => b[1] - a[1] || (b[0] > a[0] ? 1 : -1))[0][0];
      const [cDay, cSrc] = common.split("|");
      return h("section", { class: "nw-mk-g", "data-keys": g.items.map((b) => b.key).join(" ") },
        h("h3", { class: "nw-mk-h" }, g.title, h("span", { class: "nw-mk-hd" }, h("span", { class: "sep" }, " · "), `${dayOf(cDay)} · `, h("span", { class: "nw-nb" }, cSrc))),
        h("div", { class: "nw-mk-grid" }, g.items.map((b) => {
          const f = tileFigures(b);
          return h("div", { class: "nw-mk" },
            h("p", { class: "nw-mk-k" }, labelOf(b), mapOf(b.key) ? h("button", { type: "button", class: "nw-tag", onclick: () => openMap(b.key) }, "Map") : null),
            h("p", { class: "nw-mk-v" }, f.level ? [h("span", {}, f.level), " ", chgEl(b, "nw-mk-c")] : chgEl(b)),
            `${b.as_of}|${b.source}` !== common ? h("p", { class: "nw-mk-d" }, `${dayOf(b.as_of)} · ${b.source}`) : null);
        })));
    });
    show(d, eyebrow(h("b", {}, "The close"), ` · ${dayOf(commonOf(board))}`), [h("h2", { id: "nw-markets-h", class: "nw-dlg-ttl" }, "Markets"), blocks,
      h("p", { class: "nw-note" }, FUNDS_NOTE)]);
    /* the plate's group is tinted for 1.2s; the sheet scrolls only when that group is below the fold (never on phones,
       where it would open with its title and first figures cut) */
    const hit = focusKey && blocks.find((g) => g.dataset.keys.split(" ").includes(focusKey));
    if (hit) {
      if (!narrow() && hit !== blocks[0]) {
        requestAnimationFrame(() => {
          const b = d.body, bottom = hit.offsetTop + hit.offsetHeight;
          if (bottom > b.scrollTop + b.clientHeight) b.scrollTop = Math.max(0, Math.min(hit.offsetTop - 12, bottom - b.clientHeight + 16));
        });
      }
      hit.classList.add("is-hl");
      setTimeout(() => hit.classList.remove("is-hl"), 1200);
    }
  }

  /* ---------------------------------------------------------------- the wire */
  /* a wire line: the sender (its card, when there is one) and the link to the source with the item and its time. The day is
     the eyebrow's (or the day's subhead when the window spans several days), so a line shows only its time, or nothing
     for a filing dated to the day */
  function wireRow(w) {
    const bank = w.kind !== "filing";
    const who = bank ? String(w.source || "").replace(/^Federal Reserve Board$/, "Federal Reserve") : cleanName(w.title.split(":")[0]);
    const item = bank ? w.title : w.title.includes(":") ? w.title.slice(w.title.indexOf(":") + 1).trim() : w.title;
    const card = !bank && w.ticker && hasCard(w.ticker);
    const d = dateOf(w.time), tm = w.date_only || isNaN(d) ? "" : (({ hour, minute }) => `${hour}:${minute}`)(parts(F_HM, d));
    return h("li", { class: "nw-wr" }, bank ? instTile(w.source, 32) : tile(w.ticker || initials(who), 32),
      card ? h("button", { type: "button", class: "nw-wr-who", onclick: () => openCompany(w.ticker) }, who) : h("span", { class: "nw-wr-who" }, who),
      h("a", { class: "nw-wr-go", href: w.url, target: "_blank", rel: "noopener" }, h("span", { class: "it" }, item), tm ? h("span", { class: "tm" }, tm) : null,
        h("span", { class: "ar", "aria-hidden": "true" }, "↗"), newTab()));
  }
  function wireGroups(wire) {
    const newest = (a, b) => dateOf(b.time) - dateOf(a.time);
    const days = new Set(wire.map((w) => dayOf(w.time)));
    const ul = (list) => h("ul", { class: `nw-wl${list.length >= 4 ? " is-many" : ""}` }, list.map(wireRow));
    const lists = (list) => {
      const sorted = list.slice().sort(newest);
      if (days.size < 2) return ul(sorted);
      const by = new Map();
      sorted.forEach((w) => { const dd = dayOf(w.time); if (!by.has(dd)) by.set(dd, []); by.get(dd).push(w); });
      return [...by.entries()].map(([dd, ws]) => [h("p", { class: "nw-wday" }, dd), ul(ws)]);
    };
    return [["Central banks", wire.filter((w) => w.kind !== "filing")], ["Company filings", wire.filter((w) => w.kind === "filing")]]
      .filter((g) => g[1].length).map(([title, list]) => h("section", { class: "nw-wg" }, h("h3", { class: "nw-wg-h" }, title), lists(list)));
  }
  function openWire() {
    const wire = S.D.wire || [];
    if (!wire.length) return;
    const d = surface("wire", "side");
    const days = [...new Set(wire.map((w) => (w.time || "").slice(0, 10)))].sort();
    show(d, eyebrow(h("b", {}, "The wire"), ` · ${dayOf(days[days.length - 1])}`), [h("h2", { id: "nw-wire-h", class: "nw-dlg-ttl is-26" }, "Every release and filing, unedited"),
      h("p", { class: "nw-help" }, "A Form 8-K is a current report a company files with the SEC when something material happens; each line names its items. Each line opens its source."),
      wireGroups(wire)]);
  }

  /* ---------------------------------------------------------------- coming up, the method, the contents */
  function openWatch() {
    const d = surface("watch", "modal");
    const list = S.D.watch || [];
    show(d, eyebrow(h("b", {}, "Week ahead"), " · times in Berlin"), [h("h2", { id: "nw-watch-h", class: "nw-dlg-ttl" }, list.length === 1 ? "The next date" : "The next dates"), weekAhead(list)]);
  }
  function openAbout() {
    const d = surface("about", "modal");
    show(d, eyebrow(h("b", {}, "Markets Briefing")), [h("h2", { id: "nw-about-h", class: "nw-dlg-ttl" }, "Sources and method"),
      h("p", { class: "nw-prose" }, "Every weekday night, after the US close, two Claude desks, one for markets and companies and one for macro and policy, read candidates from primary sources: the Federal Reserve, the European Central Bank and the Bank of England, the current reports (8-K) that S&P 500 companies file with the SEC, and web searches for official statistics and for government and company releases. They write each story in their own words, with its source, time and link. Fixed rules then drop any story without an https link, from an aggregator or a blog, outside the time window, with a quotation, or with a summary its stories do not support. A news outlet is cited only when no primary page states the facts; GDELT headlines only help to find stories and are never cited."),
      h("p", { class: "nw-prose" }, "The wire lists every central bank release and S&P 500 current report of the window, unedited. Markets: funds and commodities quoted by Lang & Schwarz, in dollars or euros as marked, Brent crude included (from FRED, with its dates, when Lang & Schwarz has no recent quote), and the US 10-year yield from FRED."),
      h("p", { class: "nw-foot-note" }, `${LEGAL}. Not affiliated with Anthropic, the sources or the companies named; check the source before relying on any figure.`)]);
  }
  function openContents() {
    if (!S.on || S.mode !== "room") return;
    const d = surface("contents", "sheet");
    const rows = S.stops.map((s, i) => h("li", {}, h("button", { type: "button", class: "nw-cr", "aria-current": i === S.focal ? "true" : null,
      onclick: () => { closeDlg(d); go(i); } }, h("span", { class: "n" }, pad(i + 1)), h("span", { class: "l" }, s.label))));
    show(d, h("h2", { id: "nw-contents-h", class: "nw-c-ttl" }, "Contents"),
      [h("ol", { class: "nw-cl" }, rows), deskLine(S.D, "nw-c-desks"), h("div", { class: "nw-c-foot" }, viewSwitch(), aboutBtn("nw-act"))]);
    const cur = d.body.querySelector("[aria-current='true']");
    if (cur) d.body.scrollTop = Math.max(0, cur.offsetTop - d.body.clientHeight / 2 + cur.offsetHeight / 2);
  }

  /* ================================================================ the Page: the edition as a front page */
  /* 24 Nov 2026, the owner: "devi migliorare tutto, specialmente nei markets briefing"; a briefing that replaces the papers.
     The reading view (reduced motion, no WebGL, or the reader's choice): the masthead with the lede and the close, a sticky
     row of the sections (the one in view lit by an IntersectionObserver, never a scroll listener), the map beside the
     biggest moves, each section with its lead story first, the week ahead day by day, then the wire. Every story keeps its
     source, time and link; a company's chip opens its card. */
  /* the day most figures share; a figure of another day says its own */
  const commonOf = (items) => {
    const n = new Map();
    items.forEach((b) => { if (b.as_of) n.set(b.as_of, (n.get(b.as_of) || 0) + 1); });
    return [...n.entries()].sort((a, b) => b[1] - a[1] || (b[0] > a[0] ? 1 : -1)).map((x) => x[0])[0] || "";
  };
  const hm = (iso) => { const d = dateOf(iso); if (isNaN(d)) return ""; const p = parts(F_HM, d); return `${p.hour}:${p.minute}`; };
  /* the next edition: the next weekday night at 23:45 Berlin; left out once that night has passed (a late edition) */
  function nextEdition(D) {
    let d = dateOf(D.edition || String(D.generated_at || "").slice(0, 10));
    if (isNaN(d)) return "";
    do { d = new Date(d.getTime() + 864e5); } while (d.getUTCDay() % 6 === 0);
    return Date.now() > d.getTime() + 12 * 36e5 ? "" : `${dayOf(d.toISOString().slice(0, 10))}, 23:45 Berlin`;
  }
  /* the newsroom in one line, in both views: who writes it, from what, how much, and when the next edition comes; it opens
     Sources and method */
  function deskLine(D, cls) {
    if (!D) return null;
    const nx = nextEdition(D), wire = (D.wire || []).length;
    return h("p", { class: cls || "nw-desks" }, h("button", { type: "button", class: "nw-desks-b", onclick: openAbout },
      h("span", { class: "a" }, "Written overnight by two Claude desks from primary sources"),
      h("span", { class: "b" }, [plural(S.stories.length, "story", "stories"), wire ? plural(wire, "release or filing", "releases and filings") : null,
        nx ? `Next edition ${nx}` : null].filter(Boolean).map((x) => h("span", {}, x)))));
  }
  const F_KEY = fmtTZ({ year: "numeric", month: "2-digit", day: "2-digit" });
  const dayKey = (iso) => { const d = dateOf(iso); if (isNaN(d)) return ""; const p = parts(F_KEY, d); return `${p.year}-${p.month}-${p.day}`; };
  const extLink = (href, ...kids) => h("a", { href, target: "_blank", rel: "noopener" }, kids, "\u00a0", h("span", { "aria-hidden": "true" }, "↗"), newTab());   // the arrow never wraps alone
  /* the close: every figure on one line of the masthead, the label over the move (the level first for a rate) */
  function closeStrip(board) {
    /* only fresh figures: one of an earlier day is muted and says its day; one more than three weekdays old is left out
       here (named in the note) and stays in "All the figures" */
    const shown = fresh(board), out = staleOf(board);
    const common = commonOf(shown);
    const cell = (b) => {
      const f = tileFigures(b), other = b.as_of && b.as_of !== common;
      return h("li", { class: `nw-sc${other ? " is-late" : ""}`, title: `${b.what || labelOf(b)} · ${b.source}${b.as_of ? ` · ${dayOf(b.as_of)}` : ""}` },
        h("p", { class: "k" }, labelOf(b)),
        h("p", { class: "v" }, f.level ? [h("span", { class: "lv" }, f.level), " ", chgEl(b, "c")] : chgEl(b)),
        other ? h("p", { class: "d" }, `${dayOf(b.as_of)} close`) : null);
    };
    /* rows of equal length, never one figure alone on the last row: at most six a row on wide screens, five on tablets */
    const n = shown.length, cols = (k) => Math.ceil(n / Math.ceil(n / k));
    return h("section", { class: "nw-close", "aria-labelledby": "nw-l-close" },
      h("h2", { id: "nw-l-close", class: "nw-close-h" }, "The close", common ? h("span", {}, ` · ${dayOf(common)}`) : null),
      h("ul", { class: "nw-close-l", style: `--cols:${cols(6)};--cols-m:${cols(5)}` }, shown.map(cell)),
      h("p", { class: "nw-close-n" }, FUNDS_NOTE,
        out.length ? ` Left out as out of date: ${out.map((b) => `${labelOf(b)} (last quote ${dayOf(b.as_of)})`).join(", ")}.` : "", " ",
        h("button", { type: "button", class: "nw-link", onclick: () => openMarkets() }, "All the figures")));
  }
  /* the biggest moves: the falls, then the rises; one line each (logo, ticker and name, the move) and, when the desks
     wrote one, the reason under it, linked to its source */
  function moversBlock(mv) {
    const row = (x) => {
      const card = hasCard(x.ticker);
      const line = h(card ? "button" : "div", { type: card ? "button" : null, class: "nw-mvr-c", onclick: card ? () => openCompany(x.ticker) : null,
        "aria-label": card ? `${cleanName(x.name)} (${x.ticker}), ${pct(x.move)}: its card` : null },
      tile(x.ticker, 32), h("span", { class: "id" }, h("b", {}, x.ticker), h("span", { class: "nm" }, cleanName(x.name))),
      h("span", { class: `mv ${toneOf(x.move) || ""}`.trim() }, pct(x.move)));
      const why = x.why ? h("p", { class: "why" }, x.url ? extLink(x.url, x.why) : x.why) : null;
      return h("li", { class: `nw-mvr${why ? " has-why" : ""}` }, line, why);
    };
    const group = (title, list) => (list.length ? h("div", { class: "nw-mvg" }, h("h3", { class: "nw-mvg-h" }, title), h("ul", { class: "nw-mvl" }, list.slice(0, 5).map(row))) : null);
    return [group("Falls", mv.down || []), group("Rises", mv.up || [])];
  }
  /* the week ahead: one row a day (the day, then its dates: the time in Berlin, what, the source) */
  function weekAhead(list) {
    const by = new Map();
    list.slice().sort((a, b) => dateOf(a.when) - dateOf(b.when)).forEach((w) => {
      const k = dayKey(w.when) || "later";
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(w);
    });
    return h("ol", { class: "nw-wk" }, [...by.values()].map((ws) => {
      const d = dateOf(ws[0].when), p = isNaN(d) ? null : parts(F_DAY, d);
      return h("li", { class: "nw-wk-d" },
        h("p", { class: "nw-wk-day" }, p ? [h("span", { class: "wd" }, p.weekday), " ", h("span", { class: "dn" }, p.day), " ", h("span", { class: "mo" }, p.month)] : "Later"),
        h("ul", { class: "nw-wk-l" }, ws.map((w) => h("li", { class: "nw-wk-e" },
          h("p", { class: "t" }, w.date_only ? "" : hm(w.when)),
          h("div", { class: "b" }, h("p", { class: "w" }, w.what),
            w.source || w.url ? h("p", { class: "s" }, w.url ? extLink(w.url, w.source || host(w.url)) : w.source) : null)))));
    }));
  }
  /* a story: the headline, the source and time (the link), the companies, the facts, why it matters */
  /* solo: a section's only story, "Why it matters" beside it as a side note; wide: a lead across the page, its facts in two
     columns (wide screens) */
  function storyBlock(it, lead, shape) {
    const tks = tickersOf(it);
    const main = [h("h3", { class: "nw-art-h" }, it.title),
      h("p", { class: "nw-art-m" }, it.url ? extLink(it.url, it.source) : it.source, h("span", { class: "t" }, ` · ${when(it.published, it.date_only)}`)),
      tks.length ? h("div", { class: "nw-art-co" }, tks.map((t) => companyChip(t, 24, "nw-art-chip"))) : null,
      (it.facts || []).length ? h("ul", { class: "nw-art-f" }, it.facts.map((f) => h("li", {}, f))) : null];
    const solo = shape === "solo" && !!it.why;
    const why = it.why ? h("p", { class: "nw-art-why" }, h("b", {}, solo ? "Why it matters " : "Why it matters: "), it.why) : null;
    return h("article", { class: `nw-art${lead ? " is-lead" : ""}${solo ? " is-solo" : ""}${shape === "wide" ? " is-wide" : ""}`, id: `nw-${it.id}` },
      solo ? [h("div", { class: "nw-art-main" }, main), h("aside", { class: "nw-art-aside" }, why)] : [main, why]);
  }
  /* a story's height, roughly, at cpl characters a line: enough to balance a section's two columns */
  const estH = (it, cpl, lead) => {
    const lines = (x, c) => Math.max(1, Math.ceil(String(x || "").length / c));
    return (lead ? 40 : 28) * lines(it.title, lead ? 0.62 * cpl : 0.85 * cpl) + 84 + (tickersOf(it).length ? 50 : 0)
      + (it.facts || []).reduce((a, f) => a + 6 + 26 * lines(f, cpl), 0) + (it.why ? 14 + 24 * lines(it.why, cpl) : 0);
  };
  /* a section: its lead story; on wide screens the next two beside it and any others under the shorter column (an
     estimate of each story's height), so the two columns end close together */
  /* one story: it and its side note; three: the lead across the page, the other two side by side under it; two, or four and
     more: the lead with the next beside it, then each story under the shorter column */
  function sectionBlock(s, list) {
    const hid = `nw-l-${s.id}-h`;
    let grid;
    if (list.length === 1) grid = h("div", { class: "nw-sec-g is-solo" }, storyBlock(list[0], true, "solo"));
    else if (list.length === 3) {
      grid = h("div", { class: "nw-sec-g is-trio" }, storyBlock(list[0], true, "wide"), h("div", { class: "nw-sec-pair" }, list.slice(1).map((it) => storyBlock(it, false))));
    } else {
      const main = [list[0]], side = list.slice(1, 3);
      let hm = estH(list[0], 74, true), hs = side.reduce((a, it) => a + estH(it, 56, false), 0);
      list.slice(3).forEach((it) => { if (hm <= hs) { main.push(it); hm += estH(it, 74, false); } else { side.push(it); hs += estH(it, 56, false); } });
      grid = h("div", { class: `nw-sec-g${side.length ? " has-side" : ""}` }, h("div", { class: "nw-sec-main" }, main.map((it, j) => storyBlock(it, j === 0))),
        side.length ? h("div", { class: "nw-sec-side" }, side.map((it) => storyBlock(it, false))) : null);
    }
    return h("section", { class: "nw-ls nw-sec", id: `nw-l-${s.id}`, "aria-labelledby": hid },
      h("h2", { id: hid, class: "nw-ls-label", tabindex: "-1" }, s.title, h("span", { class: "nw-ls-n" }, plural(list.length, "story", "stories"))), grid);
  }
  function listView(D) {
    const [first, ...rest] = sentences(D.lede);
    const board = D.board || [], mv = D.moves || {}, watch = D.watch || [], wireL = D.wire || [];
    const secs = (D.sections || []).map((s) => ({ s, list: S.stories.filter((it) => it.secId === s.id) })).filter((x) => x.list.length);
    const head = (id, title, small, ...kids) => h("section", { class: "nw-ls", id, "aria-labelledby": `${id}-h` },
      h("h2", { id: `${id}-h`, class: "nw-ls-h", tabindex: "-1" }, title, small ? h("small", {}, small) : null), kids);
    const keys = mapKeys();
    let maps = null;
    if (keys.length) {
      /* the map inline: a sector header (a tile on phones) zooms into its companies; "All sectors" and Escape step out */
      const h2 = h("h2", { id: "nw-l-map-h", class: "nw-ls-h", tabindex: "-1" });
      const holder = h("div", { class: "nw-l-map" });
      let cur = null;
      const back = h("button", { type: "button", class: "nw-back nw-l-back", hidden: true, onclick: () => { if (S.listMap && S.listMap.zoom) zoomOut(S.listMap); } }, "‹ All sectors");
      const tabs = keys.length > 1 ? keys.map((x) => h("button", { type: "button", "aria-pressed": "false", onclick: () => { if (x !== cur) pick(x); } }, mapName(x))) : [];
      const seg = tabs.length ? h("div", { class: "nw-seg", role: "group", "aria-label": "Index" }, tabs) : null;
      const sub = h("p", { class: "nw-l-map-sub" });
      const pick = (k) => {
        if (S.listMap && S.listMap.stop) S.listMap.stop();
        cur = k;
        const mp = mapOf(k), b = boardOf(k), name = `The ${mapName(k)} map`;
        h2.textContent = name;
        sub.replaceChildren(`${ofText(mp)}, sized by market value, colored by ${weekday(mp.as_of)}'s move`, ...(b ? [" · ", h("span", { class: "nw-nb" }, labelOf(b), " ", chgEl(b))] : []));
        back.hidden = true;
        tabs.forEach((x, i) => x.setAttribute("aria-pressed", String(keys[i] === k)));   // the buttons stay: the focus stays
        const T = treemap(mp, { phone: narrow(), name, onBox: (t) => openCompany(t),
          onZoom: (zoom, from) => {
            const s = zoom ? sectorsOf(mp).find((x) => x.name === zoom) : null;
            h2.replaceChildren(name, ...(s ? [h("small", {}, s.name, " ", h("span", { class: toneOf(s.move) }, pct(s.move)))] : []));
            back.hidden = !zoom;
            const a = document.activeElement, lost = !a || a === document.body || !document.contains(a) || a === back;
            if (zoom && (lost || holder.contains(a))) back.focus({ preventScroll: true });
            else if (!zoom && lost) { const to = [...T.el.querySelectorAll("[data-s]")].find((x) => from && x.dataset.s === from) || T.el.querySelector("[tabindex='0']"); if (to) to.focus({ preventScroll: true }); }
          } });
        S.listMap = T;
        holder.replaceChildren(T.el);
        mapTip(T, holder);
        if (holder.isConnected) T.draw();
      };
      maps = h("section", { class: "nw-ls nw-l-mapsec", id: "nw-l-map", "aria-labelledby": "nw-l-map-h" },
        h("div", { class: "nw-ls-row" }, h("div", { class: "nw-ls-t" }, h2, sub), h("div", { class: "nw-ls-ctl" }, back, seg)), holder,
        h("div", { class: "nw-mv-foot" }, legend(), h("p", { class: "nw-mv-src" }, MAP_SOURCE)));
      maps.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.listMap && S.listMap.zoom) { e.preventDefault(); zoomOut(S.listMap); } });
      pick(keys[0]);
    }
    const movers = (mv.down || []).length || (mv.up || []).length
      ? head("nw-l-moves", "Biggest moves", `S&P 500 · ${dayOf(mv.as_of)}`, h("div", { class: "nw-mvgs" }, moversBlock(mv)),
        h("div", { class: "nw-l-acts" }, mapOf("spx") ? act({ label: "See them on the map", arrow: "→", run: openMovers }) : null),
        mv.source ? h("p", { class: "nw-note" }, mv.source) : null) : null;
    const wk = watch.length ? head("nw-l-watch", "Week ahead", "Times in Berlin", weekAhead(watch)) : null;
    const wdays = [...new Set(wireL.map((x) => (x.time || "").slice(0, 10)))].sort();
    const wire = wireL.length ? head("nw-l-wire", "The wire", `${wdays.length === 1 ? `${dayOf(wdays[0])} · ` : ""}every central bank release and S&P 500 current report, unedited`,
      h("p", { class: "nw-help" }, "A Form 8-K is a current report a company files with the SEC when something material happens; each line names its items and opens its source."),
      h("div", { class: "nw-wire-g" }, wireGroups(wireL))) : null;
    /* the sections' row: the map, the moves, each section, the week ahead, the wire; where the map and the moves sit side
       by side (1100px and wider) they are one button, "Map and moves" */
    const pair = !!(maps && movers);
    const toc = [pair ? ["nw-l-pkg", "Map and moves", "is-wide"] : null, maps ? ["nw-l-map", "Map", pair ? "is-narrow" : null] : null,
      movers ? ["nw-l-moves", "Moves", pair ? "is-narrow" : null] : null, ...secs.map((x) => [`nw-l-${x.s.id}`, x.s.title]),
      wk ? ["nw-l-watch", "Week ahead"] : null, wire ? ["nw-l-wire", "Wire"] : null].filter(Boolean);
    const snav = toc.length > 2 ? h("nav", { class: "nw-snav", "aria-label": "Sections" }, h("div", { class: "nw-wrap" },
      h("ul", { class: "nw-snav-l" }, toc.map(([id, label, cls]) => h("li", { class: cls || null }, h("button", { type: "button", "data-to": id, onclick: () => jumpTo(id) }, label)))))) : null;
    const lede = first || "The day in markets";
    /* the Room / Page switch needs the WebGL probe: drawn now when this session knows the answer, else once the page is idle */
    const sw = h("div", { class: "nw-l-sw" });
    const fillSw = () => { if (!sw.firstChild && S.mode === "list" && glOk()) sw.append(viewSwitch()); };
    if (glKnown()) fillSw();
    else (window.requestIdleCallback || ((f) => setTimeout(f, 300)))(() => { if (sw.isConnected) fillSw(); }, { timeout: 2500 });
    return h("div", { class: `nw-list${snav ? " has-snav" : ""}` },
      h("header", { class: "nw-hero" }, h("div", { class: "nw-stars", "aria-hidden": "true" }), h("div", { class: "nw-wrap" },
        h("div", { class: "nw-l-top" }, h("div", { class: "nw-l-mast" }, h("h1", { id: "nw-h1", tabindex: "-1" }, "Markets Briefing")), sw),
        h("div", { class: "nw-l-dateline" }, h("p", { class: "nw-l-ed" }, h("span", { class: "is-long" }, edition(D)), h("span", { class: "is-short" }, edition(D, true))),
          deskLine(D)),
        h("div", { class: "nw-l-lead" }, h("p", { class: "nw-l-eye" }, "Today"),
          h("p", { class: `nw-l-lede${lede.length > 120 ? " is-long" : ""}` }, lede),
          first && rest.length ? h("p", { class: "nw-l-deck" }, rest.join(" ")) : null),
        board.length ? closeStrip(board) : null)),
      snav,
      h("div", { class: "nw-wrap nw-front" },
        maps || movers ? h("div", { class: `nw-pkg${pair ? " is-pair" : ""}`, id: "nw-l-pkg" }, maps, movers) : null,
        secs.map((x) => sectionBlock(x.s, x.list)), wk, wire,
        h("footer", { class: "nw-l-foot" }, h("p", {}, LEGAL, " · ", aboutBtn()))));
  }
  /* a section from the row: scrolled to under the bars, its heading focused (no second scroll) */
  function jumpTo(id) {
    const el = document.getElementById(id === "nw-l-pkg" ? "nw-l-map" : id) || document.getElementById(id);   // the pair: its map's heading
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: still() ? "auto" : "smooth" });
    const t = el.querySelector("h2");
    if (t) t.focus({ preventScroll: true });
  }
  /* the row lights the section in view: the last one whose top has passed the bars */
  function spy() {
    const nav = S.el && S.el.querySelector(".nw-snav");
    if (!nav || !("IntersectionObserver" in window)) return;
    const btns = [...nav.querySelectorAll("button[data-to]")];
    const secs = btns.map((b) => document.getElementById(b.dataset.to)).filter(Boolean);
    const seen = new Map();
    const top = 48 + (nav.offsetHeight || 48) + 8;
    let last = null;
    const light = () => {
      /* only the buttons shown at this width ("Map and moves", or "Map" and "Moves") */
      const vis = secs.filter((s) => { const b = btns.find((x) => x.dataset.to === s.id); return b && b.getClientRects().length > 0; });
      let cur = null;
      vis.forEach((s) => { if (seen.get(s)) cur = cur || s; });
      if (!cur && vis.length && vis[0].getBoundingClientRect().top > top) cur = null;   // above the first section: none
      else cur = cur || (vis.includes(last) ? last : null);    // between two sections: the last one stays lit
      last = cur;
      btns.forEach((b) => { if (cur && b.dataset.to === cur.id) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
      const on = cur && btns.find((b) => b.dataset.to === cur.id), row = nav.querySelector(".nw-snav-l");
      if (on && row && row.scrollWidth > row.clientWidth + 1) {        // the lit section stays in sight in a row that scrolls sideways
        const l = on.offsetLeft - 20, r = on.offsetLeft + on.offsetWidth + 20;
        if (l < row.scrollLeft || r > row.scrollLeft + row.clientWidth) row.scrollTo({ left: Math.max(0, l), behavior: still() ? "auto" : "smooth" });
      }
    };
    const io = new IntersectionObserver((en) => { en.forEach((e) => seen.set(e.target, e.isIntersecting)); light(); },
      { rootMargin: `-${top}px 0px -55% 0px`, threshold: 0 });
    secs.forEach((s) => io.observe(s));
    S.off.push(() => io.disconnect());
  }

  function startList(q) {
    S.on = true;
    if (S.listMap) S.listMap.draw();
    spy();
    const card = q.story && document.getElementById(`nw-${q.story}`);
    if (card) {
      setTimeout(() => {
        card.scrollIntoView({ block: "center", behavior: still() ? "auto" : "smooth" });
        card.classList.add("is-ring");
        setTimeout(() => card.classList.remove("is-ring"), 1200);
      }, 60);
    }
  }

  /* ================================================================ the page */
  const quietPage = (cls, ...kids) => h("div", { class: `nw-list is-quiet${cls ? ` ${cls}` : ""}` }, h("header", { class: "nw-hero" }, h("div", { class: "nw-stars", "aria-hidden": "true" }),
    h("div", { class: "nw-wrap" }, kids)));
  /* while the edition loads: the masthead and the shapes of the lede and the close (still under reduced motion) */
  function loadingView() {
    const bar = (cls) => h("span", { class: `nw-sk ${cls}` });
    /* the room is coming: its night, one plate's outline and the label's lines (no WebGL yet) */
    if (wantRoom() && GL_OK !== false && keep("session", GLKEY) !== "0") {
      const mode = innerWidth >= 1200 ? "desk" : innerWidth >= 700 ? "tablet" : "phone";
      return h("div", { class: "nw-room is-loading" }, h("div", { class: "nw-stage nw-skroom", "data-mode": mode },
        h("div", { class: "nw-top" }, h("div", { class: "nw-top-l" }, h("h1", { id: "nw-h1", tabindex: "-1" }, "Markets Briefing"),
          h("p", { class: "nw-edition", role: "status" }, "Loading the latest edition…"))),
        h("span", { class: "nw-skr-pl", "aria-hidden": "true" }),
        h("span", { class: "nw-skr-w", "aria-hidden": "true" }, bar("is-eye"), bar("is-l1"), bar("is-l2"), bar("is-d1"))));
    }
    return quietPage(null, h("div", { class: "nw-l-top" }, h("div", { class: "nw-l-mast" }, h("h1", { id: "nw-h1", tabindex: "-1" }, "Markets Briefing"),
      h("p", { class: "nw-l-ed", role: "status" }, "Loading the latest edition…"))),
    h("div", { class: "nw-l-lead nw-skel", "aria-hidden": "true" }, bar("is-eye"), bar("is-l1"), bar("is-l2"), bar("is-d1"),
      h("span", { class: "nw-sk-row" }, Array.from({ length: 6 }, () => h("span", { class: "nw-sk-c" }, bar("is-k"), bar("is-v"))))));
  }
  /* no edition yet, or a failed load (then a way to try again without leaving the page) */
  function emptyView() {
    return quietPage("is-state", h("div", { class: "nw-l-top" }, h("div", { class: "nw-l-mast" }, h("h1", { id: "nw-h1", tabindex: "-1" }, "Markets Briefing"),
      h("p", { class: "nw-l-ed" }, S.failed ? "This edition could not load." : "The first edition is on its way: a new one every weekday night, after the US close."))),
    S.failed ? h("div", { class: "nw-l-acts" }, act({ label: "Try again", arrow: "→", main: true, run: () => { if (S.el && S.params !== undefined) Pages.news.render(S.el, S.params); } })) : null,
    h("p", { class: "nw-l-legal" }, LEGAL));
  }
  const query = (params) => ({ story: params && params.get("story"), map: params && params.get("map"), co: params && params.get("co") });
  /* ?story=, ?map= and ?co= open their dialogs, in that order (the card on top, its box picked on the map); then the URL is
     written again from what opened, so an unknown id or a map with no data leaves no trace */
  async function openFromQuery(q) {
    if (q.story && S.mode === "room") { const it = S.stories.find((x) => x.id === q.story); if (it) openStory(it); }
    if (q.map === "cp") await openPortfolioMap();
    else if (q.map && mapOf(q.map)) openMap(q.map);
    if (!S.on) return;
    if (q.co && hasCard(q.co)) {
      const m = DLG.get("map"), onMap = !!(m && m.el.open && m.T && m.T.mp.rows.some((r) => r.t === q.co));
      if (onMap) m.T.setPick(q.co);
      openCompany(q.co, onMap ? "map" : null);
      const box = onMap && m.T.el.querySelector(`.nw-tm-box[data-t="${CSS.escape(q.co)}"]`), c = DLG.get("company");
      if (box && c) c.back = box;
    }
    syncURL();
  }
  function draw(q = {}) {
    stop();
    const D = S.D;
    if (!D || D.state !== "live" || !S.stories.length) { S.el.replaceChildren(emptyView()); return; }
    S.mode = view();
    if (S.mode === "list") { S.el.replaceChildren(listView(D)); startList(q); }
    else {
      S.el.replaceChildren(roomView(D));
      startRoom(q);
      if (S.mode !== "room") return;                           // no WebGL after all: the List took over
    }
    openFromQuery(q);
    window.dispatchEvent(new Event("sv:ready"));               // the edition is on screen: the brand loader may lift
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const was = S.mode;
    const onMq = () => { if (view() !== was) draw(); };
    if (mq.addEventListener) { mq.addEventListener("change", onMq); S.off.push(() => mq.removeEventListener("change", onMq)); }
    listen(window, "keydown", (e) => { if (e.key === "Escape" && anyDialog() && !(e.target.closest && e.target.closest("dialog[open]"))) escape(e); }, true);
    /* the List's map follows the width itself (its observer), so a resize never rebuilds the page or drops a card */
  }
  function rerender() {
    window.scrollTo(0, 0);
    S.url = {};
    if (/^#\/news\?/.test(location.hash)) history.replaceState(history.state, "", `${location.pathname}${location.search}#/news`);
    draw({});
    const t = document.getElementById("nw-h1");
    if (t) t.focus({ preventScroll: true });
  }

  Pages.news = {
    title: "Markets Briefing",
    async render(el, params) {
      S.el = el;
      S.params = params || null;
      el.replaceChildren(loadingView());
      const [dg, lg] = await Promise.allSettled([api("/api/news/digest"), fetch("logos/index.json").then((r) => (r.ok ? r.json() : []))]);
      /* Inter, if it comes within 300ms; otherwise the page draws now and measures again when it arrives */
      let fontsIn = false;
      try {
        await Promise.race([Promise.all(["700 16px Inter", "600 16px Inter", "500 16px Inter"].map((f) => document.fonts.load(f))).then(() => { fontsIn = true; }),
          new Promise((r) => setTimeout(r, 300))]);
      } catch (_) { /* the fallback font measures close enough */ }
      if (!fontsIn && document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => { if (S.el === el && el.isConnected) fontsArrived(); });
      }
      if (!el.isConnected || Router.current !== "news") return;
      S.D = dg.status === "fulfilled" ? dg.value : null;
      S.failed = dg.status !== "fulfilled";
      LOGOS = new Set(lg.status === "fulfilled" && Array.isArray(lg.value) ? lg.value : []);
      S.stories = S.D ? flatten(S.D) : [];
      S.stops = S.D && S.D.state === "live" && S.stories.length ? buildStops(S.D) : [];
      /* the same pattern as the Claude Portfolio's title ("Claude Portfolio · by <author>", publish.py) */
      const who = (document.querySelector('meta[name="author"]') || {}).content;
      document.title = who ? `Markets Briefing · by ${who}` : "Markets Briefing";
      draw(query(params));
    },
    update(params) {
      if (!S.D || !S.mode) return true;
      const q = query(params);
      if (q.story && S.mode === "room") { const it = S.stories.find((x) => x.id === q.story); if (it) go(stopOfStory(it)); }
      if (q.story && S.mode === "list") startList(q);
      openFromQuery(q);
      return true;
    },
    leave() {
      stop();
      S.el = null;
    },
  };
})();
