const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#999";
const store = { get: (k, d) => { try {
        return localStorage.getItem("vision.lab." + k) ?? d;
    }
    catch {
        return d;
    } }, set: (k, v) => { try {
        localStorage.setItem("vision.lab." + k, v);
    }
    catch { /* ignore */ } } };
function fit(cv, h) { const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || 360; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + "px"; const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); return { g, w, h }; }
const ACTION_COLOR = { wander: "#38bdf8", look_around: "#818cf8", dance: "#f472b6", rest: "#64748b", call_out: "#fbbf24", murmur: "#a78bfa", play: "#34d399", watch: "#fb923c", go_home: "#94a3b8", sleep: "#334155", idle: "#475569", inspect: "#22d3ee" };
const acol = (a) => ACTION_COLOR[a] ?? "#6b7280";
const bar = (v, color, lo = 0, hi = 1) => `<span class="lb"><i style="width:${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%;background:${color}"></i></span>`;
const n = (k, w) => `${k} ${w}${k === 1 ? "" : w.endsWith("e") && w !== "praise" ? "s" : w.endsWith("se") ? "s" : "s"}`;
const ago = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${(s / 3600).toFixed(1)} h ago`; };
export function initLab(d) {
    const root = $("lab"), btn = $("labBtn");
    if (!root || !btn)
        return;
    const tabs = Array.from(root.querySelectorAll("[data-tab]")), panes = Array.from(root.querySelectorAll("[data-pane]"));
    let cur = store.get("tab", "timeline"), timer = null;
    const open = (on) => { root.hidden = !on; btn.classList.toggle("on", on); store.set("open", on ? "1" : "0"); if (on)
        show(cur);
    else
        stop(); };
    const stop = () => { if (timer) {
        clearInterval(timer);
        timer = null;
    } };
    btn.addEventListener("click", () => open(root.hidden));
    root.querySelector("[data-close]")?.addEventListener("click", () => open(false));
    root.querySelector("[data-wide]")?.addEventListener("click", () => { root.classList.toggle("wide"); store.set("wide", root.classList.contains("wide") ? "1" : "0"); show(cur); });
    if (store.get("wide", "0") === "1")
        root.classList.add("wide");
    window.addEventListener("keydown", (e) => {
        const t = e.target;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
            return;
        if (e.key.toLowerCase() === "l" && !e.metaKey && !e.ctrlKey)
            open(root.hidden);
    });
    function show(name) {
        cur = name;
        store.set("tab", name);
        tabs.forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle("on", on); t.setAttribute("aria-selected", String(on)); });
        panes.forEach((p) => (p.hidden = p.dataset.pane !== name));
        stop();
        const live = { ai: renderAi, timeline: drawTimeline, mind: renderMind, personality: renderPersonality, scenarios: renderScenarioMenu, story: refreshStory, map: renderMap, people: renderPeople };
        live[name]?.();
        if (name === "timeline" || name === "mind" || name === "map")
            timer = setInterval(() => { if (name === "timeline" && hoverI != null)
                return; if (name === "map" && dragging)
                return; live[name](); }, name === "map" ? 700 : 2000);
    }
    tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.tab)));
    // ================= timeline
    let hoverI = null;
    const SER = { mood: true, energy: true, battery: true };
    let span = Number(store.get("span", "0"));
    const cv = $("labChart"), lane = $("labLane");
    const winRows = () => { const all = d.brain.timeline().rows; if (!span || !all.length)
        return all; const t1 = all[all.length - 1].t; return all.filter((r) => r.t >= t1 - span * 1000); };
    function drawTimeline() {
        const rows = winRows();
        const { g, w, h } = fit(cv, 140);
        const L = fit(lane, 14);
        g.clearRect(0, 0, w, h);
        const grid = css("--border-2");
        g.strokeStyle = grid;
        g.lineWidth = 1;
        g.setLineDash([3, 4]);
        for (const f of [0.25, 0.5, 0.75]) {
            g.beginPath();
            g.moveTo(0, h * f);
            g.lineTo(w, h * f);
            g.stroke();
        }
        g.setLineDash([]);
        if (rows.length < 2) {
            g.fillStyle = css("--text-3");
            g.font = "12px " + css("--font");
            g.fillText("Collecting… leave him running for a few seconds.", 12, h / 2);
            $("labDetail").innerHTML = "";
            return;
        }
        const X = (i) => (i / (rows.length - 1)) * (w - 2) + 1, Y = (v, lo, hi) => h - 8 - ((v - lo) / (hi - lo)) * (h - 16);
        const series = [["mood", (r) => r.v, css("--cyan"), -1, 1], ["energy", (r) => r.a, "#fb923c", 0, 1], ["battery", (r) => r.battery, css("--good"), 0, 1]];
        for (const [k, get, color, lo, hi] of series) {
            if (!SER[k])
                continue;
            g.strokeStyle = color;
            g.lineWidth = 1.8;
            g.lineJoin = "round";
            g.beginPath();
            rows.forEach((r, i) => (i ? g.lineTo(X(i), Y(get(r), lo, hi)) : g.moveTo(X(i), Y(get(r), lo, hi))));
            g.stroke();
            if (k === "mood") {
                g.lineTo(X(rows.length - 1), h);
                g.lineTo(X(0), h);
                g.closePath();
                const gr = g.createLinearGradient(0, 0, 0, h);
                gr.addColorStop(0, color + "33");
                gr.addColorStop(1, color + "00");
                g.fillStyle = gr;
                g.fill();
            }
        }
        // action lane
        L.g.clearRect(0, 0, L.w, 14);
        rows.forEach((r, i) => { const x0 = X(i), x1 = i < rows.length - 1 ? X(i + 1) : w; L.g.fillStyle = acol(r.action); L.g.fillRect(x0, 2, Math.max(1, x1 - x0 + 0.5), 10); });
        // event markers
        const t0 = rows[0].t, t1 = rows[rows.length - 1].t;
        const marks = d.brain.recentEvents().filter((e) => e.t >= t0 && /^(system|memory)$/.test(e.type) && /grew|space|woke|battery|sky|forgot|tripped|dream|learned|restored/i.test(e.text));
        g.fillStyle = css("--warn");
        for (const m of marks) {
            const x = ((m.t - t0) / Math.max(1, t1 - t0)) * (w - 2) + 1;
            g.beginPath();
            g.moveTo(x, h - 2);
            g.lineTo(x - 4, h - 10);
            g.lineTo(x + 4, h - 10);
            g.closePath();
            g.fill();
        }
        // hover line
        const i = hoverI == null ? rows.length - 1 : Math.min(rows.length - 1, hoverI);
        const x = X(i);
        g.strokeStyle = css("--text-2");
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
        const r = rows[i];
        const near = marks.find((m) => Math.abs(m.t - r.t) < Math.max(4000, (t1 - t0) / 40));
        $("labDetail").innerHTML = `<div class="ld-top"><span class="pill" style="--c:${acol(r.action)}">${esc(r.action.replace(/_/g, " "))}</span><span class="ld-why">because <b>${esc(r.why || "no strong reason")}</b></span><span class="ld-ago">${i === rows.length - 1 ? "now" : ago(t1 - r.t)}</span></div>
      <div class="ld-stats"><span>mood <b>${r.v.toFixed(2)}</b>${bar(r.v, css("--cyan"), -1, 1)}</span><span>energy <b>${r.a.toFixed(2)}</b>${bar(r.a, "#fb923c")}</span><span>battery <b>${Math.round(r.battery * 100)}%</b>${bar(r.battery, css("--good"))}</span></div>${near ? `<div class="ld-ev">▲ ${esc(near.text)}</div>` : ""}`;
        const ch = d.brain.timeline().changes().slice(-7).reverse();
        const lastT = d.brain.timeline().rows.at(-1)?.t ?? 0;
        $("labChanges").innerHTML = ch.map((c) => `<li><span class="dot" style="background:${acol(c.action)}"></span><b>${esc(c.action.replace(/_/g, " "))}</b><em>${esc(c.why || "")}</em><time>${ago(lastT - c.t)}</time></li>`).join("");
    }
    const hoverAt = (e) => { const r = cv.getBoundingClientRect(), rows = winRows(); if (rows.length < 2)
        return; hoverI = Math.round(((e.clientX - r.left) / r.width) * (rows.length - 1)); $("labLive").hidden = false; drawTimeline(); };
    cv.addEventListener("mousemove", hoverAt);
    cv.addEventListener("click", hoverAt);
    cv.addEventListener("touchmove", (e) => hoverAt(e.touches[0]), { passive: true });
    cv.addEventListener("mouseleave", () => { });
    $("labLive").addEventListener("click", () => { hoverI = null; $("labLive").hidden = true; drawTimeline(); });
    root.querySelectorAll("[data-ser]").forEach((c) => c.addEventListener("click", () => { SER[c.dataset.ser] = !SER[c.dataset.ser]; c.classList.toggle("off", !SER[c.dataset.ser]); drawTimeline(); }));
    root.querySelectorAll("[data-span]").forEach((c) => { c.classList.toggle("on", Number(c.dataset.span) === span); c.addEventListener("click", () => { span = Number(c.dataset.span); store.set("span", String(span)); hoverI = null; root.querySelectorAll("[data-span]").forEach((x) => x.classList.toggle("on", x === c)); drawTimeline(); }); });
    // ================= mind
    function renderMind() {
        const m = d.brain.mindView();
        const people = m.people.length ? m.people.map((p) => `<div class="mp"><div class="mp-h"><b>${esc(p.name)}</b>${p.sulking ? `<span class="tag bad">upset</span>` : ""}${p.gifts ? `<span class="tag">${p.gifts} gift${p.gifts > 1 ? "s" : ""}</span>` : ""}<em>${p.meetings} meeting${p.meetings === 1 ? "" : "s"}</em></div>
      <div class="mp-b"><span>trust</span>${bar(p.trust, css("--good"))}<span>warmth</span>${bar(p.warmth, "#f472b6")}<span>grudge</span>${bar(p.grudge, css("--bad"))}</div></div>`).join("") : `<p class="muted">Nobody yet. Say “my name is …” or press “Teach my face”.</p>`;
        const chips = (a, cls = "") => a.length ? a.map((x) => `<span class="chip2 ${cls}">${esc(x)}</span>`).join("") : `<span class="muted">none</span>`;
        $("labMindBody").innerHTML = `
      <section><h4>People</h4>${people}</section>
      <section><h4>What he knows about you</h4><div class="chips">${chips(Object.entries(m.facts).map(([k, v]) => `${k}: ${v}`))}</div>${m.forgotten.length ? `<h5>Slipped his mind</h5><div class="chips">${chips(m.forgotten, "dash")}</div>` : ""}</section>
      <section><h4>He wants to ask about</h4><div class="chips">${chips(m.topics.map((t) => (t.asked ? "✓ " : "· ") + t.phrase))}</div></section>
      <section><h4>How he has grown</h4>${m.milestones.length ? `<ul class="lab-list">${m.milestones.map((x) => `<li><b>${esc(x.note)}</b></li>`).join("")}</ul>` : `<p class="muted">Nothing big yet.</p>`}
        <p class="muted small">${n(m.stats.scolds, "scold")} · ${n(m.stats.praises, "praise")} · ${n(m.stats.gifts, "gift")} · ${n(m.stats.noises, "loud noise")} · ${n(m.interactions, "chat")}</p></section>
      <section><h4>Habits, tricks, dreams</h4><p><b>Habits</b> ${m.habits.length ? m.habits.map((h) => `${h.hour} ${h.action}`).join(" · ") : "<span class=muted>forming…</span>"}</p>
        <p><b>Tricks</b> ${m.tricks.length ? m.tricks.map((t) => `“${esc(t.phrase)}” → ${esc(t.does)} <span class="tag">${t.level}</span>`).join(" · ") : `<span class="muted">none — say “when I say spin, dance”</span>`}</p>
        <p><b>Last dream</b> ${m.dream ? esc(m.dream) : "<span class=muted>none yet</span>"}</p><p><b>Quirk</b> ${m.quirk ? esc(m.quirk) : "—"} · <b>Sore spots</b> ${m.painSpots}</p></section>`;
    }
    // ================= personality
    const KEYS = ["curious", "sociable", "calm", "bold", "agreeable"];
    const BLURB = { curious: "explores, asks", sociable: "seeks company", calm: "shrugs off bad news", bold: "tries new things", agreeable: "obeys, forgives" };
    function drawRadar(p) {
        const cvr = $("labRadar");
        const { g, w, h } = fit(cvr, 190);
        g.clearRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h) / 2 - 30, pt = (i, v) => [cx + Math.sin((i / 5) * 2 * Math.PI) * R * v, cy - Math.cos((i / 5) * 2 * Math.PI) * R * v];
        g.strokeStyle = css("--border-2");
        g.lineWidth = 1;
        for (const f of [0.33, 0.66, 1]) {
            g.beginPath();
            KEYS.forEach((_, i) => { const [x, y] = pt(i, f); i ? g.lineTo(x, y) : g.moveTo(x, y); });
            g.closePath();
            g.stroke();
        }
        g.fillStyle = css("--text-2");
        g.font = "11px " + css("--font");
        g.textAlign = "center";
        KEYS.forEach((k, i) => { const [x, y] = pt(i, 1.2); g.fillText(k, x, y + 4); });
        const poly = (src, fill, stroke, dash) => { g.beginPath(); KEYS.forEach((k, i) => { const [x, y] = pt(i, src[k]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.setLineDash(dash); g.strokeStyle = stroke; g.lineWidth = 1.6; if (fill) {
            g.fillStyle = fill;
            g.fill();
        } g.stroke(); g.setLineDash([]); };
        poly(d.PERSONALITIES.default, "", css("--text-3"), [4, 4]);
        poly(p, css("--purple") + "44", css("--purple"), []);
    }
    function renderPersonality() {
        const p = d.brain.personality();
        drawRadar(p);
        $("labSliders").innerHTML = KEYS.map((k) => `<label><span>${k}<small>${BLURB[k]}</small></span><input type="range" min="0" max="1" step="0.05" value="${p[k]}" data-k="${k}"><output>${(+p[k]).toFixed(2)}</output></label>`).join("");
        $("labSliders").querySelectorAll("input").forEach((el) => el.addEventListener("input", () => { el.nextElementSibling.textContent = (+el.value).toFixed(2); d.brain.setPersonality({ [el.dataset.k]: +el.value }); drawRadar(d.brain.personality()); }));
        $("labPresets").innerHTML = Object.keys(d.PERSONALITIES).map((k) => `<button type="button" class="chip2 btn" data-preset="${k}">${k}</button>`).join("");
        $("labPresets").querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => { d.brain.setPersonality(d.PERSONALITIES[b.dataset.preset]); renderPersonality(); }));
    }
    // ================= scenarios
    let scSel = "";
    const pers = () => Object.keys(d.PERSONALITIES);
    function renderScenarioMenu() {
        $("labScList").innerHTML = d.SCENARIOS.map((s) => `<button type="button" class="sc ${s.id === (scSel || d.SCENARIOS[0].id) ? "on" : ""}" data-sc="${s.id}"><b>${esc(s.name)}</b><em>${s.checks.map((c) => esc(c.label)).join(" · ")}</em></button>`).join("");
        $("labScList").querySelectorAll("[data-sc]").forEach((b) => b.addEventListener("click", () => { scSel = b.dataset.sc; renderScenarioMenu(); }));
        const o = pers().map((k) => `<option>${k}</option>`).join("");
        const A = $("labA"), B = $("labB");
        const a0 = A.value, b0 = B.value;
        A.innerHTML = o;
        B.innerHTML = o;
        A.value = a0 || "default";
        B.value = b0 || "timid";
    }
    const METRICS = [["valence", "mood", -1, 1, "--cyan"], ["arousal", "energy", 0, 1, "--warn"], ["trust", "trust", 0, 1, "--good"], ["grudge", "grudge", 0, 1, "--bad"]];
    $("labRun").addEventListener("click", () => {
        const sc = d.SCENARIOS.find((s) => s.id === (scSel || d.SCENARIOS[0].id));
        if (!sc)
            return;
        const out = [$("labA").value, $("labB").value].map((p) => d.runScenario(sc, p, d.makeHeadless));
        $("labResult").innerHTML = `<div class="cmp">${out.map((o) => `<div class="cmp-c"><h5>${esc(o.personality)}</h5>${METRICS.map(([k, n, lo, hi, c]) => `<div class="cmp-r"><span>${n}</span>${bar(o.vitals[k], css(c), lo, hi)}<b>${(+o.vitals[k]).toFixed(2)}</b></div>`).join("")}<div class="cmp-r"><span>asked for space</span><b>${o.vitals.space ? "yes" : "no"}</b></div>
      <div class="checks">${o.checks.map((c) => `<span class="tag ${c.pass ? "good" : "bad"}">${c.pass ? "✓" : "✗"} ${esc(c.label)}</span>`).join("")}</div></div>`).join("")}</div>`;
    });
    $("labRunAll").addEventListener("click", () => {
        const ps = pers();
        const rows = d.SCENARIOS.map((sc) => ({ sc, res: ps.map((p) => d.runScenario(sc, p, d.makeHeadless)) }));
        $("labResult").innerHTML = `<table class="matrix"><tr><th></th>${ps.map((p) => `<th>${p}</th>`).join("")}</tr>${rows.map((r) => `<tr><td>${esc(r.sc.name)}</td>${r.res.map((x) => { const n = x.checks.filter((c) => c.pass).length; return `<td class="${n === x.checks.length ? "ok" : "bad"}">${n}/${x.checks.length}</td>`; }).join("")}</tr>`).join("")}</table><p class="muted small">Checks passed per scenario and personality.</p>`;
    });
    // ================= story
    const refreshStory = () => { $("labStory").textContent = d.brain.story(); };
    $("labStoryRefresh").addEventListener("click", refreshStory);
    $("labStoryCopy").addEventListener("click", async () => { try {
        await navigator.clipboard.writeText($("labStory").textContent ?? "");
        d.addLog("story copied");
    }
    catch { /* ignore */ } });
    $("labStoryDl").addEventListener("click", () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([$("labStory").textContent ?? ""], { type: "text/plain" })); a.download = "vision-day.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
    // ================= map
    const mp = $("labMap");
    const RANGE = 36;
    let dragging = null;
    let pick = { x: 0, z: 12 };
    let kind = "box";
    const toPx = (x, z, w, h) => [w / 2 + (x / RANGE) * (w / 2), h / 2 - (z / RANGE) * (h / 2)];
    const toWorld = (e) => { const r = mp.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * 2 - 1, pz = 1 - ((e.clientY - r.top) / r.height) * 2; return { x: Math.round(px * RANGE * 2) / 2, z: Math.round(pz * RANGE * 2) / 2 }; };
    function renderMap() {
        const side = Math.min(380, (mp.parentElement?.clientWidth ?? 360) - 2);
        mp.style.width = side + "px";
        const { g, w, h } = fit(mp, side);
        g.clearRect(0, 0, w, h);
        g.fillStyle = css("--surface-2");
        g.fillRect(0, 0, w, h);
        g.strokeStyle = css("--border-2");
        g.lineWidth = 1;
        for (let v = -30; v <= 30; v += 10) {
            const [x] = toPx(v, 0, w, h), [, y] = toPx(0, v, w, h);
            g.beginPath();
            g.moveTo(x, 0);
            g.lineTo(x, h);
            g.moveTo(0, y);
            g.lineTo(w, y);
            g.stroke();
        }
        g.fillStyle = css("--text-3");
        g.font = "10px " + css("--mono");
        g.fillText("forward ↑", 6, 12);
        const px = (x, z) => toPx(x, z, w, h);
        for (const z of d.scenery.zones()) {
            const [x, y] = px(z.x, z.z);
            g.fillStyle = z.temp === "hot" ? "rgba(255,107,53,.28)" : "rgba(77,171,247,.28)";
            g.beginPath();
            g.arc(x, y, (z.r / RANGE) * (w / 2), 0, 7);
            g.fill();
        }
        for (const s of d.brain.avoidSpots()) {
            const [x, y] = px(s.x, s.z);
            g.strokeStyle = css("--bad");
            g.setLineDash([3, 3]);
            g.beginPath();
            g.arc(x, y, (s.r / RANGE) * (w / 2), 0, 7);
            g.stroke();
            g.setLineDash([]);
        }
        for (const o of d.scenery.list()) {
            const [x, y] = px(o.x, o.z);
            g.fillStyle = o.role === "charger" ? css("--good") : (o.color ?? css("--purple"));
            g.beginPath();
            if (o.shape === "cylinder" || o.shape === "sphere" || o.role === "charger")
                g.arc(x, y, 6, 0, 7);
            else if (o.shape === "cone") {
                g.moveTo(x, y - 7);
                g.lineTo(x + 6, y + 5);
                g.lineTo(x - 6, y + 5);
                g.closePath();
            }
            else
                g.rect(x - 6, y - 6, 12, 12);
            g.fill();
            g.fillStyle = css("--text-2");
            g.font = "10px " + css("--font");
            g.fillText(o.role === "charger" ? "⚡" : o.id.replace(/_\d+$/, ""), x + 9, y + 3);
        }
        const [hx, hy] = px(0, 0);
        g.fillStyle = css("--text-3");
        g.fillRect(hx - 2, hy - 2, 4, 4);
        const pose = d.scenery.pose();
        const [vx, vy] = px(pose.x, pose.z), a = (pose.heading * Math.PI) / 180;
        g.fillStyle = "#fff";
        g.beginPath();
        g.arc(vx, vy, 6, 0, 7);
        g.fill();
        g.strokeStyle = "#fff";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(vx, vy);
        g.lineTo(vx + Math.sin(a) * 14, vy - Math.cos(a) * 14);
        g.stroke();
        const [sx, sy] = px(pick.x, pick.z);
        g.strokeStyle = css("--purple");
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(sx, sy, 8, 0, 7);
        g.moveTo(sx - 12, sy);
        g.lineTo(sx + 12, sy);
        g.moveTo(sx, sy - 12);
        g.lineTo(sx, sy + 12);
        g.stroke();
        $("labPick").textContent = `x ${pick.x}, z ${pick.z}`;
        renderObjs();
    }
    let lastObjSig = "";
    function renderObjs() {
        const items = d.scenery.list(), zs = d.scenery.zones();
        const sig = JSON.stringify([items.map((o) => [o.id, o.x, o.z]), zs.map((z) => [z.id, z.x, z.z])]);
        if (sig === lastObjSig)
            return;
        lastObjSig = sig; // only rebuild the list when it changed, so buttons stay clickable
        const zrows = zs.map((z) => `<li><b>${esc(z.temp)} zone</b><em>${z.x}, ${z.z} · r ${z.r}</em><span><button type="button" data-rz="${esc(z.id)}" aria-label="Remove zone">×</button></span></li>`).join("");
        $("labObjs").innerHTML = (items.length || zs.length) ? zrows + items.map((o) => `<li><b>${esc(o.id)}</b><em>${esc(o.role ?? o.shape ?? "model")} · ${o.x}, ${o.z}</em><span><button type="button" data-mv="${esc(o.id)}" title="Move to the marked spot">move here</button><button type="button" data-rm="${esc(o.id)}" aria-label="Remove ${esc(o.id)}">×</button></span></li>`).join("") : `<li><em>Nothing placed. Click the map, pick a shape, press “Place”.</em></li>`;
        $("labObjs").querySelectorAll("[data-rz]").forEach((b) => b.addEventListener("click", () => { d.scenery.removeZone(b.dataset.rz); renderMap(); }));
        $("labObjs").querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { d.scenery.remove(b.dataset.rm); renderMap(); }));
        $("labObjs").querySelectorAll("[data-mv]").forEach((b) => b.addEventListener("click", async () => { await d.scenery.move(b.dataset.mv, pick.x, pick.z); renderMap(); }));
    }
    mp.addEventListener("mousedown", (e) => { const wpt = toWorld(e); const hit = d.scenery.list().find((o) => Math.hypot(o.x - wpt.x, o.z - wpt.z) < 2.5); pick = wpt; dragging = hit ? hit.id : null; renderMap(); });
    mp.addEventListener("mousemove", (e) => { if (e.buttons && dragging) {
        pick = toWorld(e);
        renderMap();
    } });
    window.addEventListener("mouseup", async (e) => { if (dragging) {
        const id = dragging;
        dragging = null;
        if (e.target === mp)
            await d.scenery.move(id, pick.x, pick.z);
        renderMap();
    } });
    root.querySelectorAll("[data-kind]").forEach((c) => c.addEventListener("click", () => { kind = c.dataset.kind; root.querySelectorAll("[data-kind]").forEach((x) => x.classList.toggle("on", x === c)); }));
    $("labAddObj").addEventListener("click", async () => {
        const size = Number($("labSize").value) || 2.5, name = $("labName").value.trim();
        if (kind === "hot" || kind === "cold") {
            d.scenery.addZone({ x: pick.x, z: pick.z, r: Math.max(3, size * 2), temp: kind });
            d.addLog(`placed a ${kind} zone at ${pick.x}, ${pick.z}`);
            renderMap();
            return;
        }
        const id = (name.replace(/[^\w-]/g, "_") || kind) + "_" + (d.scenery.list().length + 1), ch = kind === "charger";
        await d.scenery.add({ id, name: name || kind, shape: ch ? "cylinder" : kind, x: pick.x, z: pick.z, size: ch ? 1.2 : size, color: ch ? "#22c55e" : $("labColor").value, solid: !ch, known: true, role: ch ? "charger" : undefined });
        renderMap();
    });
    $("labClear").addEventListener("click", () => { if (confirm("Remove every object and zone you can see here?")) {
        d.scenery.clear();
        renderMap();
    } });
    $("labReset").addEventListener("click", async () => { await d.scenery.reset(); renderMap(); });
    $("labCopy").addEventListener("click", async () => { const json = JSON.stringify({ objects: d.scenery.list(), zones: d.scenery.zones() }, null, 2); try {
        await navigator.clipboard.writeText(json);
        d.addLog("scenery JSON copied: paste it into scenery.json");
    }
    catch {
        $("labStory").textContent = json;
        show("story");
    } });
    // ================= AI check: does the AI mind answer, how fast, and is it really the AI?
    const AI_PROMPTS = ["In one sentence, why does the sky turn orange at sunset?", "I'm feeling a bit tired today. What would you say to me?", "Describe a cloud as if you were a small curious robot."];
    // ================= people (photos and profiles from the camera)
    function renderPeople() {
        const box = $("labPeople"), list = d.people.list();
        if (!list.length) {
            box.innerHTML = `<p class="muted">${d.people.cameraOn() ? "No one yet. Face the camera and hold still for a second or two." : "Camera is off. Turn it on (right panel) and Vision will photograph new faces himself."}</p>`;
            return;
        }
        box.innerHTML = [...list].sort((a, b) => b.lastSeen - a.lastSeen).map((p) => `<div class="prof" data-id="${esc(p.id)}"><div class="prof-h"><b>${esc(p.name)}</b>${p.visitor ? `<span class="tag">visitor</span>` : ""}<span class="muted small">${p.photos.length} photo${p.photos.length === 1 ? "" : "s"} · seen ${p.seen}× · ${ago(Date.now() - p.lastSeen)}</span></div><div class="prof-ph">${p.photos.slice().reverse().map((x) => `<img src="${x.jpg}" alt="${esc(p.name)} photo" title="sharpness ${x.sharp}">`).join("") || `<span class="muted small">no photo yet</span>`}</div><div class="lab-row"><input data-name value="${esc(p.visitor ? "" : p.name)}" placeholder="rename" size="10" aria-label="New name"><button type="button" data-ren>Rename</button><button type="button" data-del>Delete</button></div></div>`).join("") + `<div class="lab-row"><button type="button" id="labPeopleClear">Delete all</button></div>`;
    }
    $("labPeople").addEventListener("click", (e) => {
        const t = e.target, row = t.closest("[data-id]");
        const id = row?.dataset.id;
        if (t.id === "labPeopleClear") {
            d.people.clear();
            return;
        }
        if (!id)
            return;
        if (t.matches("[data-del]"))
            d.people.remove(id);
        if (t.matches("[data-ren]")) {
            const v = row.querySelector("[data-name]").value.trim();
            if (v)
                d.people.rename(id, v);
        }
    });
    d.people.onChange(() => { if (cur === "people" && !root.hidden && !($("labPeople").contains(document.activeElement) && document.activeElement.tagName === "INPUT"))
        renderPeople(); });
    $("labSnap").addEventListener("click", async () => { const b = $("labSnap"); b.disabled = true; $("labSnapMsg").textContent = "looking…"; const r = await d.people.snap($("labSnapName").value.trim() || undefined); $("labSnapMsg").textContent = r.message; b.disabled = false; renderPeople(); });
    async function renderAi() { const h = await d.ai.health().catch(() => null); $("labAiHealth").innerHTML = h ? `<span class="tag ${h.llm?.configured ? "good" : "bad"}">${h.llm?.configured ? "key configured" : "no key"}</span> <span class="muted">${esc(h.llm?.provider ?? "")} ${esc(h.llm?.model ?? "")}</span>` : `<span class="tag bad">server unreachable</span>`; }
    $("labAiRun").addEventListener("click", async () => {
        const btn = $("labAiRun"), out = $("labAiResult");
        btn.disabled = true;
        btn.textContent = "Testing…";
        out.innerHTML = `<p class="muted">Asking ${AI_PROMPTS.length} questions…</p>`;
        const health = await d.ai.health().catch(() => null);
        const probes = [];
        for (const p of AI_PROMPTS) {
            probes.push(await d.ai.probe(p));
            out.innerHTML = `<p class="muted">${probes.length} of ${AI_PROMPTS.length} done…</p>`;
        }
        const v = d.ai.verdict(probes, health);
        out.innerHTML = `<div class="verdict ${v.level}"><b>${esc(v.headline)}</b></div>${v.notes.map((n) => `<p class="muted small">• ${esc(n)}</p>`).join("")}<ul class="lab-list probes">${probes.map((p) => `<li><span class="tag ${p.ok ? (p.source === "ai" ? "good" : "") : "bad"}">${p.ok ? esc(p.source ?? "ok") : esc(p.status)}</span><em>${esc(p.reply || "—")}</em><time>${p.ms} ms</time></li>`).join("")}</ul>`;
        btn.disabled = false;
        btn.textContent = "Run again";
        renderAi();
    });
    if (store.get("open", "0") === "1")
        open(true);
    else
        root.hidden = true;
}
