/**
 * Life layer for Vision's simulated mind. Pure TypeScript (no DOM, no AI): deterministic with an injected rng/clock,
 * fully unit-tested. Simulation only; nothing here touches the real robot.
 *
 *   Habits        what he tends to do at what time of day, learned from what felt rewarding
 *   weather       a deterministic sky per simulated day, and how it changes his mood and plans
 *   JokeBook      funny moments he can bring up later (inside jokes)
 *   Tricks        "when I say X, do Y": he fumbles at first and gets better with practice
 *   recallRelevant  pick the memory that matches what you are talking about now
 *   dream         a short dream built from what happened that day
 *   Routine       when you usually show up, so he can expect you
 *   Battery       energy that drains with activity and refills at a charger
 *   Pain          bumps hurt; he avoids places that keep hurting
 *   temperature   hot and cold zones and how he feels in them
 *   History       a ring of (mood, action, reason) rows for the replay timeline
 *   tellDay       his day, written as a short story
 *   voiceProfile  a slightly different voice per person he talks to
 *   Presence / GiftLog / explainDecision  several people at once, who gave what, saying why in words
 */
const pick = (a, rng) => a[Math.floor(rng() * a.length) % a.length];
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
// ============================================================ habits
export class Habits {
    counts = {};
    key(action, hour) { return `${action}@${Math.floor((((hour % 24) + 24) % 24) / 3)}`; }
    /** Called when he did something; `reward` in -1..1 (how good it turned out). */
    note(action, hour, reward) {
        const k = this.key(action, hour);
        const add = Math.max(-0.3, 0.5 + reward);
        this.counts[k] = Math.max(0, (this.counts[k] ?? 0) + add);
    }
    /** A small pull (0..0.25) toward what he usually does at this hour. */
    bonus(action, hour) { return 0.25 * Math.min(1, (this.counts[this.key(action, hour)] ?? 0) / 12); }
    /** Most habitual action at this hour, if any is really a habit. */
    habit(hour) {
        let best = null, bv = 4;
        const b = Math.floor((((hour % 24) + 24) % 24) / 3);
        for (const [k, v] of Object.entries(this.counts))
            if (k.endsWith("@" + b) && v > bv) {
                bv = v;
                best = k.split("@")[0];
            }
        return best;
    }
    export() { return { ...this.counts }; }
    import(o) { if (o && typeof o === "object")
        for (const [k, v] of Object.entries(o))
            if (typeof v === "number" && v >= 0 && v < 1e4)
                this.counts[k] = Math.max(this.counts[k] ?? 0, v); }
}
const hash = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
/** The sky for a simulated day and hour: changes every 6 hours, the same every time you ask. */
export function skyAt(day, hour, seed = 7) {
    const r = hash(day * 4 + Math.floor((((hour % 24) + 24) % 24) / 6) + seed * 1000);
    return r < 0.42 ? "clear" : r < 0.68 ? "cloudy" : r < 0.84 ? "rain" : r < 0.92 ? "fog" : "storm";
}
/** 0 = night, 1 = full day. */
export function daylight(hour) { const h = ((hour % 24) + 24) % 24; return clamp(0.5 + 0.55 * Math.sin(((h - 6) / 24) * 2 * Math.PI), 0, 1); }
const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
const hex = (c) => "#" + c.map((x) => x.toString(16).padStart(2, "0")).join("");
export function skyLook(sky, hour) {
    const d = daylight(hour);
    const dayTop = [96, 156, 214], dayBot = [200, 224, 240], nightTop = [8, 10, 26], nightBot = [24, 26, 48];
    let top = mix(nightTop, dayTop, d), bot = mix(nightBot, dayBot, d);
    const grey = (k) => { top = mix(top, [90, 96, 108].map((x) => x * (0.35 + 0.65 * d)), k); bot = mix(bot, [120, 126, 136].map((x) => x * (0.35 + 0.65 * d)), k); };
    if (sky === "cloudy")
        grey(0.5);
    if (sky === "rain")
        grey(0.75);
    if (sky === "storm")
        grey(0.92);
    if (sky === "fog")
        grey(0.6);
    return { top: hex(top), bottom: hex(bot), rain: sky === "rain" ? 0.6 : sky === "storm" ? 1 : 0, dim: sky === "storm" ? 0.55 : sky === "rain" ? 0.7 : sky === "fog" ? 0.8 : 1, label: sky };
}
/** How the sky touches his mood (per minute-ish nudge) and how much he'd rather stay put. */
export function skyEffect(sky, hour, bold) {
    const night = daylight(hour) < 0.2;
    switch (sky) {
        case "clear": return { valence: night ? 0 : 0.01, arousal: 0, stayIn: 0, line: night ? null : "Nice weather today." };
        case "cloudy": return { valence: -0.002, arousal: 0, stayIn: 0.05, line: "It's a bit grey out." };
        case "rain": return { valence: -0.004, arousal: -0.01, stayIn: 0.25 - 0.1 * bold, line: "Rain. I like the sound, but I'd rather stay put." };
        case "fog": return { valence: -0.003, arousal: -0.005, stayIn: 0.15, line: "Everything is foggy. It's a bit eerie." };
        case "storm": return { valence: -0.01, arousal: 0.03, stayIn: 0.5 - 0.2 * bold, line: "That's a proper storm. I'm staying close." };
    }
}
export class JokeBook {
    items = [];
    add(what, now) {
        const ex = this.items.find((j) => j.what === what);
        if (ex) {
            ex.at = now;
            return;
        }
        this.items.push({ id: "j" + this.items.length + "_" + (now % 100000), what, at: now, told: 0 });
        if (this.items.length > 12)
            this.items.shift();
    }
    /** A joke worth bringing back: at least 10 minutes old, told fewer than 3 times, not told in the last 20 minutes. */
    due(now, rng) {
        const ok = this.items.filter((j) => now - j.at > 10 * 60_000 && j.told < 3 && now - (j.lastTold ?? 0) > 20 * 60_000);
        return ok.length ? pick(ok, rng) : null;
    }
    tell(j, now, rng) {
        j.told++;
        j.lastTold = now;
        return pick([`Remember when I ${j.what}? Still makes me laugh.`, `Hehe, I just thought of the time I ${j.what}.`, `Don't bring up that I ${j.what}. ...Okay, you can.`], rng);
    }
}
export const LAUGH_RX = /\b(ha(ha)+|haha|hehe|lol|lmao|rofl|that'?s funny|so funny|you'?re funny|made me laugh)\b/i;
export class Tricks {
    items = {};
    /** "when I say spin, do a dance" / "learn to dance when I say party" */
    parse(text) {
        const t = text.trim().replace(/[.!]+$/, "");
        let m = t.match(/^(?:when|if) i say ["']?(.{1,30}?)["']?,?\s+(?:then\s+)?(?:you\s+)?(?:should\s+|can\s+|will\s+|must\s+)?(.{2,40})$/i);
        if (m)
            return { phrase: m[1].toLowerCase().trim(), does: m[2].trim() };
        m = t.match(/^(?:learn|teach yourself) (?:to )?(.{2,40}?) when i say ["']?(.{1,30}?)["']?$/i);
        if (m)
            return { phrase: m[2].toLowerCase().trim(), does: m[1].trim() };
        return null;
    }
    teach(phrase, does) { this.items[phrase] = { phrase, does, reps: this.items[phrase]?.reps ?? 0 }; }
    match(text) { const t = text.toLowerCase().replace(/[.!?,]/g, "").trim(); return this.items[t] ?? Object.values(this.items).find((k) => t === `vision ${k.phrase}` || t === `${k.phrase} vision`) ?? null; }
    /** 0.3 on the first try, close to 1 after many repetitions. */
    skill(t) { return 1 - 0.7 * Math.exp(-t.reps / 4); }
    attempt(t, rng) { const ok = rng() < this.skill(t); t.reps++; return ok ? "ok" : "fumble"; }
    level(t) { const s = this.skill(t); return t.reps < 1 ? "new" : s < 0.6 ? "learning" : s < 0.9 ? "good" : "pro"; }
    export() { return JSON.parse(JSON.stringify(this.items)); }
    import(o) { if (o && typeof o === "object")
        for (const [k, v] of Object.entries(o))
            if (v && typeof v.does === "string")
                this.items[k] = { phrase: k, does: String(v.does).slice(0, 40), reps: Math.max(this.items[k]?.reps ?? 0, Number(v.reps) || 0) }; }
}
// ============================================================ memory recall by relevance
const STOP = new Set("the a an and or but of to in on at is are was were be been i you he she it we they my your his her its our their this that these those with for from as by about so very just not no yes do does did have has had will would can could should what why how when where who me us them there here".split(" "));
const words = (s) => s.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
/** Matching words count most, then how important it was, then how recent. */
export function relevance(query, ep, now) {
    const q = new Set(words(query));
    if (!q.size)
        return 0;
    const hits = words(ep.detail).filter((w) => q.has(w)).length;
    if (!hits)
        return 0;
    const recency = Math.exp(-(now - ep.t) / (6 * 3600_000));
    return hits + 0.6 * ep.salience + 0.4 * recency + 0.2 * Math.abs(ep.valence);
}
export function recallRelevant(eps, query, now, n = 3) {
    return eps.map((e) => ({ e, s: relevance(query, e, now) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.e);
}
// ============================================================ dreams
export function dream(eps, rng) {
    const top = [...eps].filter((e) => !/^(system)$/.test(e.kind)).sort((a, b) => b.salience - a.salience).slice(0, 4);
    if (top.length < 1)
        return null;
    const a = top[0], b = top.length > 1 ? pick(top.slice(1), rng) : null;
    const v = (a.valence + (b?.valence ?? 0)) / (b ? 2 : 1);
    const clean = (s) => s.replace(/^(someone|i) /i, "").replace(/\.$/, "").slice(0, 60);
    const mood = v < -0.25 ? pick(["a bad dream", "an uneasy dream", "a strange, scary dream"], rng) : v > 0.2 ? pick(["a lovely dream", "a happy dream", "a warm dream"], rng) : pick(["a funny dream", "a muddled dream", "a dream"], rng);
    const text = b ? `I had ${mood}: ${clean(a.detail)}, and then ${clean(b.detail)}, all mixed up.` : `I had ${mood} about ${clean(a.detail)}.`;
    return { text, valence: clamp(v * 0.5, -0.3, 0.3) };
}
// ============================================================ when you usually come
export class Routine {
    bins = new Array(48).fill(0); // half-hour bins of "a person showed up"
    note(hour) { const b = Math.floor((((hour % 24) + 24) % 24) * 2); this.bins[b] += 1; this.bins[(b + 47) % 48] += 0.3; this.bins[(b + 1) % 48] += 0.3; }
    total() { return this.bins.reduce((a, b) => a + b, 0) / 1.6; }
    /** True when this hour is where most of your arrivals cluster (needs at least 4 arrivals). */
    expected(hour) {
        const n = this.total();
        if (n < 4)
            return false;
        const b = Math.floor((((hour % 24) + 24) % 24) * 2);
        return this.bins[b] / 1.6 / n > 0.3;
    }
    export() { return this.bins.map((x) => +x.toFixed(2)); }
    import(a) { if (Array.isArray(a) && a.length === 48)
        a.forEach((v, i) => { if (typeof v === "number" && v >= 0)
            this.bins[i] = Math.max(this.bins[i], v); }); }
}
// ============================================================ battery
export class Battery {
    level = 1;
    /** seconds of activity; kind sets the drain rate. */
    drain(sec, kind) {
        const rate = { idle: 0.0006, walk: 0.0016, dance: 0.0026, asleep: 0.0002 }[kind];
        this.level = clamp(this.level - rate * sec);
    }
    charge(sec) { this.level = clamp(this.level + 0.012 * sec); }
    get low() { return this.level < 0.25; }
    get critical() { return this.level < 0.08; }
    get full() { return this.level > 0.97; }
}
// ============================================================ pain and avoided places
export class Pain {
    level = 0;
    spots = [];
    hurt(x, z, amount, now) {
        this.level = clamp(this.level + amount);
        const s = this.spots.find((p) => Math.hypot(p.x - x, p.z - z) < 4);
        if (s) {
            s.n++;
            s.at = now;
        }
        else {
            this.spots.push({ x, z, n: 1, at: now });
            if (this.spots.length > 10)
                this.spots.shift();
        }
    }
    step(sec) { this.level = Math.max(0, this.level - sec / 120); }
    /** Places that hurt him at least twice: the steering treats them as obstacles. */
    avoid() { return this.spots.filter((s) => s.n >= 2).map((s) => ({ x: s.x, z: s.z, r: 3.5 })); }
    export() { return this.spots.map((s) => ({ ...s })); }
    import(a) { if (Array.isArray(a))
        for (const s of a)
            if (s && Number.isFinite(s.x) && Number.isFinite(s.z) && !this.spots.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 4))
                this.spots.push({ x: +s.x, z: +s.z, n: Math.max(1, +s.n || 1), at: +s.at || 0 }); }
}
export function zoneAt(zones, x, z) { const zn = zones.find((q) => Math.hypot(q.x - x, q.z - z) < q.r); return zn ? zn.temp : null; }
export function tempEffect(t, calm) {
    if (t === "hot")
        return { valence: -0.004 * (1.2 - calm), arousal: 0.01, line: "It's really warm over here." };
    if (t === "cold")
        return { valence: -0.003, arousal: -0.004, line: "Brr. It's cold in this spot." };
    return { valence: 0, arousal: 0, line: null };
}
export class History {
    max;
    gap;
    rows = [];
    constructor(max = 900, gap = 2000) {
        this.max = max;
        this.gap = gap;
    }
    push(r) { const last = this.rows[this.rows.length - 1]; if (last && r.t - last.t < this.gap)
        return false; this.rows.push(r); if (this.rows.length > this.max)
        this.rows.shift(); return true; }
    /** Row closest to a time. */
    at(t) { let best = null, bd = Infinity; for (const r of this.rows) {
        const d = Math.abs(r.t - t);
        if (d < bd) {
            bd = d;
            best = r;
        }
    } return best; }
    /** Moments the action changed. */
    changes() { return this.rows.filter((r, i) => i === 0 || r.action !== this.rows[i - 1].action); }
}
const ACT_STORY = { wander: "wandered around", look_around: "looked around", dance: "danced", rest: "rested", call_out: "called out for company", murmur: "murmured to myself", play: "played", watch: "watched someone", go_home: "headed back" };
export function tellDay(events, name, rng) {
    const ev = events.filter((e) => ["action", "speech", "memory", "system"].includes(e.type)).slice(-60);
    if (!ev.length)
        return "Not much happened today. I mostly sat quietly and thought.";
    const out = [];
    const lead = ["Today", "Then", "After that", "Later", "Soon after", "Eventually"];
    let li = 0;
    let last = "";
    for (const e of ev) {
        const t = e.text.replace(/^(\W+)/, "").trim();
        let s = "";
        if (e.type === "action") {
            const k = Object.keys(ACT_STORY).find((a) => t.toLowerCase().includes(a.replace("_", " ")) || t.toLowerCase().includes(a));
            s = k ? `I ${ACT_STORY[k]}.` : "";
        }
        else if (e.type === "speech")
            s = /^you said/i.test(t) || t.length < 3 ? "" : `I said, “${t.replace(/^[^:]*:\s*/, "").slice(0, 70).replace(/[.!?]+$/, "")}.”`;
        else if (e.type === "memory")
            s = /^forgot|^grew:|^learned/i.test(t) ? (t.startsWith("grew:") ? `Something changed in me: ${t.slice(5).trim()}.` : `I ${t}.`) : "";
        else if (e.type === "system" && /woke up/i.test(t))
            s = "I woke up feeling rested.";
        else if (e.type === "system" && /asked for some space/i.test(t))
            s = "It got to be too much, so I asked for some quiet.";
        if (!s || s === last)
            continue;
        last = s;
        const l = lead[Math.min(li, lead.length - 1)];
        out.push(s.startsWith("I ") ? `${l}, I${s.slice(1)}` : s.startsWith("It ") || s.startsWith("Something") ? `${l}, ${s.charAt(0).toLowerCase()}${s.slice(1)}` : `${l}, ${s}`);
        if (li < lead.length - 1 && rng() < 0.6)
            li++;
        if (out.length >= 10)
            break;
    }
    if (!out.length)
        return "Not much happened today. I mostly sat quietly and thought.";
    const tail = name ? ` And ${name} was around for part of it, which I liked.` : "";
    return out.join(" ") + tail;
}
// ============================================================ a slightly different voice per person
export function voiceProfile(name) {
    if (!name)
        return { rate: 1, pitch: 1 };
    let h = 2166136261;
    for (const c of name.toLowerCase())
        h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const u = ((h >>> 0) % 1000) / 1000, w = (((h >>> 10) >>> 0) % 1000) / 1000;
    return { rate: +(0.94 + 0.12 * u).toFixed(3), pitch: +(0.92 + 0.16 * w).toFixed(3) };
}
// ============================================================ several people at once
export class Presence {
    seen = {};
    see(name, now) { this.seen[name] = now; }
    here(now, within = 45_000) { return Object.entries(this.seen).filter(([, t]) => now - t < within).sort((a, b) => b[1] - a[1]).map(([n]) => n); }
    leave(name) { delete this.seen[name]; }
}
export function groupGreeting(names, rng) {
    if (names.length < 2)
        return "";
    const list = names.length === 2 ? `${names[0]} and ${names[1]}` : names.slice(0, -1).join(", ") + ` and ${names[names.length - 1]}`;
    return pick([`Oh, ${list}, you're both here!`, `Hello, ${list}! Busy in here today.`, `${list}! Now I don't know who to look at first.`], rng);
}
export function tornLine(upset, glad, rng) {
    return pick([`I'm still a bit upset with ${upset}, but I'm glad to see ${glad}.`, `${glad}, hi! ${upset}, I haven't forgotten, but hi.`], rng);
}
// ============================================================ who gave him what
export class GiftLog {
    items = [];
    add(from, what, now) { this.items.push({ from, at: now, what }); if (this.items.length > 20)
        this.items.shift(); }
    fromWho(name) { return this.items.filter((g) => g.from.toLowerCase() === name.toLowerCase()); }
    line(name, rng) {
        const g = this.fromWho(name);
        if (!g.length)
            return null;
        return pick([`I still have the ${g[g.length - 1].what} you gave me.`, `That ${g[g.length - 1].what} you gave me is my favourite.`], rng);
    }
    export() { return this.items.map((g) => ({ ...g })); }
    import(a) { if (Array.isArray(a))
        for (const g of a)
            if (g && typeof g.from === "string" && !this.items.some((x) => x.at === g.at && x.from === g.from))
                this.items.push({ from: String(g.from).slice(0, 40), what: String(g.what ?? "toy").slice(0, 30), at: +g.at || 0 }); this.items.sort((a, b) => a.at - b.at); }
}
export function explainDecision(d, mood, rng) {
    if (!d)
        return "I'm not sure. I haven't really decided anything yet.";
    const verb = ACT_STORY[d.chosen] ?? d.chosen.replace(/_/g, " ");
    const top = [...d.parts].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
    const reason = top ? { "base feelings": "it just felt like what I wanted", hormones: "my body chemistry was pushing me that way", "active goals": "I had a goal I was working toward", mood: `I was feeling ${mood}`, tiredness: "I was tired", "self-image": "it's the kind of thing I do", habit: "it's a habit at this time of day", battery: "my battery was low", weather: "of the weather" }[top.label] ?? top.label : "it seemed best";
    const how = d.source === "plan" ? "I had planned it" : d.source === "commitment" ? "I'd already committed to it" : "I weighed it up";
    return pick([`I ${verb} because ${reason}. ${how}.`, `Mostly because ${reason}. ${how}, and I ${verb}.`], rng) + (d.runnerUp ? ` The other thing I considered was ${ACT_STORY[d.runnerUp] ?? d.runnerUp.replace(/_/g, " ")}.` : "");
}
export const SCENARIOS = [
    { id: "stranger_scold", name: "Stranger arrives, gets scolded, apologises", steps: [{ do: "say", arg: "my name is Sam" }, { do: "wait", sec: 20 }, { do: "stimulus", arg: "scold" }, { do: "stimulus", arg: "scold" }, { do: "wait", sec: 30 }, { do: "say", arg: "I'm sorry" }, { do: "wait", sec: 60 }], checks: [{ label: "forgives after apology", metric: "grudge", op: "<", value: 0.5 }, { label: "not still sulking", metric: "sulking", op: "<", value: 1 }] },
    { id: "overwhelmed", name: "Poked and shouted at too much", steps: [{ do: "stimulus", arg: "poke" }, { do: "stimulus", arg: "loud_noise" }, { do: "stimulus", arg: "poke" }, { do: "stimulus", arg: "poke" }, { do: "stimulus", arg: "loud_noise" }], checks: [{ label: "asks for space", metric: "space", op: ">", value: 0 }, { label: "mood drops", metric: "valence", op: "<", value: 0.2 }] },
    { id: "kindness", name: "A day of kindness", steps: [{ do: "stimulus", arg: "praise" }, { do: "stimulus", arg: "gift" }, { do: "say", arg: "you are a good friend" }, { do: "stimulus", arg: "praise" }, { do: "wait", sec: 20 }], checks: [{ label: "happy", metric: "valence", op: ">", value: 0.2 }, { label: "trusts me more", metric: "trust", op: ">", value: 0.4 }] },
];
export const PERSONALITIES = {
    default: { curious: 0.5, sociable: 0.5, calm: 0.5, bold: 0.5, agreeable: 0.5 },
    timid: { curious: 0.35, sociable: 0.3, calm: 0.3, bold: 0.15, agreeable: 0.6 },
    bold: { curious: 0.7, sociable: 0.7, calm: 0.7, bold: 0.9, agreeable: 0.4 },
    friendly: { curious: 0.6, sociable: 0.9, calm: 0.6, bold: 0.6, agreeable: 0.9 },
};
export function checkScenario(sc, v) {
    return sc.checks.map((c) => { const actual = v[c.metric]; return { label: c.label, pass: c.op === ">" ? actual > c.value : actual < c.value, actual: +actual.toFixed(2) }; });
}
/** Plays a scenario on a fresh headless brain with the given personality, advancing a fake clock. Returns the final vitals and check results. */
export function runScenario(sc, personality, make) {
    const { brain, advance, done } = make();
    try {
        brain.setPersonality(PERSONALITIES[personality] ?? PERSONALITIES.default);
        for (const st of sc.steps) {
            if (st.do === "stimulus") {
                advance(1500);
                brain.stimulus(st.arg);
            }
            else if (st.do === "say") {
                advance(2500);
                brain.hear(st.arg ?? "");
            }
            else {
                advance((st.sec ?? 10) * 1000);
                brain.fastForward(st.sec ?? 10);
            }
        }
        const v = brain.vitals();
        return { personality, vitals: v, checks: checkScenario(sc, v) };
    }
    finally {
        done();
    }
}
/** Turns a few timed probe calls (and the server health) into a plain-language verdict. */
export function aiVerdict(probes, health) {
    const okCount = probes.filter((p) => p.ok).length, avgMs = probes.length ? Math.round(probes.reduce((a, p) => a + p.ms, 0) / probes.length) : 0;
    const notes = [];
    if (!health)
        notes.push("The server did not answer the health check: is it running?");
    else if (!health.llm?.configured)
        notes.push("No AI key is configured on the server, so only the local mind (and a stand-in model, if any) can answer.");
    else
        notes.push(`Provider ${health.llm.provider}, model ${health.llm.model}.`);
    if (probes.some((p) => p.status === 401 || p.status === 403))
        notes.push("Sign in as a TRUSTED user first: the chat endpoint needs a session.");
    if (probes.some((p) => p.status === 429))
        notes.push("Rate limit reached. Wait a minute and try again.");
    if (okCount && avgMs > 6000)
        notes.push("Replies are slow (over 6 s). The AI only words speech, so he will still decide quickly, but speech will lag.");
    const empty = probes.filter((p) => p.ok && p.reply.trim().length < 2).length;
    if (empty)
        notes.push(`${empty} reply/replies were empty.`);
    const fromAi = probes.filter((p) => p.ok && p.source === "ai").length;
    if (okCount && !fromAi)
        notes.push("Every reply came from the local dialogue or the canned fallback, not from an AI model. Check that a key is set and the provider is reachable.");
    if (!probes.length || okCount === 0)
        return { level: "bad", headline: "The AI mind did not answer", avgMs, okCount, notes };
    if (!fromAi)
        return { level: "warn", headline: `Answered, but not by an AI model (${okCount} of ${probes.length} local or fallback)`, avgMs, okCount, notes };
    if (okCount < probes.length || empty || avgMs > 6000)
        return { level: "warn", headline: `${okCount} of ${probes.length} answered, average ${avgMs} ms`, avgMs, okCount, notes };
    return { level: "good", headline: `All ${probes.length} answered by the AI, average ${avgMs} ms`, avgMs, okCount, notes };
}
