"use strict";
/* SV Terminal · public snapshot, part 2 of 2. The public site is one read-only page, the Claude Portfolio (#/cp), paper
   money only. publish.py loads this file after the page files and before main.js on the published site; the app on the
   Mac never loads it. It marks the page as the public snapshot (body.pub: app.css then hides the app's search box and
   alerts bell) and keeps the live quote stream off. The rest is elsewhere: static.js serves the data, publish.py writes
   the disclaimer band and the footer into index.html, and cp.js says when the snapshot was taken. The file keeps its name
   from an earlier version of the site; publish.py, the tests and the README use it. */
(() => {
  if (!window.BussolaStatic) return;
  document.body.classList.add("pub");
  Live.connect = () => {};                          // no stream in a snapshot (static.js also replaces EventSource)
})();
