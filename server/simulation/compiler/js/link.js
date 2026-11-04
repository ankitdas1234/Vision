/**
 * Compiler view <-> dashboard.
 *
 * There is no editor here. The script is written and compiled on the dashboard's Compiler page,
 * which posts it to /api/simulation/program. The server compiles it with the real compiler and
 * pushes the result as a `program` event; this file hands the instructions to the playback runtime
 * (sim.js) and plays them straight away when the dashboard's Run sent them.
 * Text from the server is only ever put on the page with textContent, never as HTML.
 */
(function () {
  'use strict';
  var logEl = document.getElementById('log');
  var lastSeq = 0;

  function say(msg) {
    if (!logEl) return;
    while (logEl.firstChild) logEl.removeChild(logEl.firstChild);
    var d = document.createElement('div');
    d.className = 'logmsg';
    d.style.padding = '10px 12px';
    d.textContent = msg;
    logEl.appendChild(d);
  }

  function load(p) {
    if (!p || !Array.isArray(p.instructions)) return;
    if (p.seq && p.seq === lastSeq) return;
    lastSeq = p.seq || 0;
    if (!p.ok) {
      var d = (p.diagnostics || [])[0];
      say('Compile failed' + (d ? ' (' + d.line + ':' + (d.column + 1) + ' ' + d.message + ')' : '') + '. Fix it on the dashboard and compile again.');
    }
    window.VisionSim.load({ sourceName: p.sourceName, instructions: p.instructions });
    if (p.autoplay && !p.replay && p.ok) window.VisionSim.play();
  }

  function start() {
    fetch('/api/simulation/program', { credentials: 'same-origin' }).then(function (r) {
      if (r.status === 401) return say('Log in on the Vision dashboard (same address), then reload.');
      if (r.status === 409) return say('The server is in hardware mode, so the simulator is disabled.');
      if (!r.ok) throw new Error('server ' + r.status);
      return r.json().then(function (j) { if (j.program) load(j.program); });
    }).catch(function () { say("Can't reach the Vision server. Compile a script on the dashboard once it is running."); });

    if (!window.EventSource) return;
    var es = new EventSource('/api/simulation/stream?only=program');
    es.addEventListener('program', function (e) { try { load(JSON.parse(e.data)); } catch (err) { /* ignore */ } });
  }

  say('Compile a script on the dashboard\'s Compiler page. It appears here.');
  if (window.VisionSim) start(); else document.addEventListener('vision-sim-ready', start);
})();
