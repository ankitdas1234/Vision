/**
 * Natural-behaviour helpers for Vision's simulated mind. Pure TypeScript (no DOM, no AI), deterministic
 * given an injected rng and clock, so everything here is unit-tested.
 *
 *   Micro          idle micro-movements: blinks, head tilts, weight shifts, glances, startle, stumble, eye contact
 *   TopicMemory    remembers what you told him (your exam, your dog, a bad day) and asks about it later
 *   curiosity      questions he wants to ask you, and how he reads your short answer
 *   backchannel    small acknowledgements ("mm-hm", "oh really?") when you tell him something
 *   hedge/quirk    hesitation and one small verbal habit that makes him recognisable
 *   MoodLog        why he feels what he feels, and a different tone each day
 *   reunion        how glad he is to see you again, by how long you were away
 *
 * Honest framing: this models human-like behaviour. It is not real feeling or consciousness.
 */
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
/**
 * Small involuntary movements that make a still body look alive. Call `update(dtSec, ctx)` every frame.
 * Everything fades back to zero, so it never fights with real actions (walking, dancing).
 */
export class Micro {
    rng;
    out = { tilt: 0, yaw: 0, squash: 0, hop: 0, lean: 0 };
    events = [];
    t = 0;
    nextBlink;
    blinkAt = -1;
    blinkLen = 0.15;
    nextTilt;
    tiltUntil = 0;
    tiltTarget = 0;
    nextShift;
    shiftTarget = 0;
    shift = 0;
    nextGlance;
    glanceUntil = 0;
    glanceTarget = 0;
    startleV = 0;
    startleHop = 0;
    stumbleT = -1;
    thinkSince = -1;
    thinkDir = 1;
    constructor(rng = Math.random) {
        this.rng = rng;
        this.nextBlink = 1 + rng() * 3;
        this.nextTilt = 5 + rng() * 6;
        this.nextShift = 6 + rng() * 8;
        this.nextGlance = 4 + rng() * 6;
    }
    /** A sudden fright: a small hop and a lean back that fades. `strength` 0..1. */
    startle(strength = 0.7) { this.startleV = -0.28 * strength; this.startleHop = 0.16 * strength; this.events.push("startle"); }
    /** A little trip: he pitches forward and catches himself. */
    stumble() { if (this.stumbleT < 0) {
        this.stumbleT = 0;
        this.events.push("stumble");
    } }
    /** Look away for a moment (thinking, shyness), then back. */
    glanceAway(forSec = 0.7) { this.glanceTarget = (this.rng() < 0.5 ? -1 : 1) * (0.14 + this.rng() * 0.08); this.glanceUntil = this.t + forSec; }
    update(dt, c) {
        dt = Math.min(dt, 0.1);
        this.t += dt;
        const o = this.out;
        const ease = (v, to, k) => v + (to - v) * Math.min(1, k * dt * 60);
        // asleep: eyes closed (slight squash), no fidgeting at all
        if (c.asleep) {
            o.squash = ease(o.squash, 0.025, 0.05);
            o.tilt = ease(o.tilt, 0.05, 0.03);
            o.yaw = ease(o.yaw, 0, 0.1);
            o.hop = ease(o.hop, 0, 0.2);
            o.lean = ease(o.lean, 0, 0.1);
            return o;
        }
        // blink: more often when wound up, long slow blinks when sleepy
        if (this.blinkAt < 0 && this.t >= this.nextBlink) {
            this.blinkAt = this.t;
            this.blinkLen = 0.13 + 0.12 * c.sleepiness;
        }
        let blink = 0;
        if (this.blinkAt >= 0) {
            const p = (this.t - this.blinkAt) / this.blinkLen;
            if (p >= 1) {
                this.blinkAt = -1;
                this.nextBlink = this.t + (2.2 + this.rng() * 4.5) * (1.3 - 0.5 * c.arousal) * (this.rng() < 0.15 ? 0.25 : 1);
            } // sometimes a double blink
            else
                blink = Math.sin(Math.PI * p) * 0.04;
        }
        // head tilt: held for a moment, more when listening (curious dog-like tilt)
        if (this.t >= this.nextTilt && this.t >= this.tiltUntil) {
            this.tiltTarget = (this.rng() < 0.5 ? -1 : 1) * (c.listening ? 0.10 + this.rng() * 0.06 : 0.04 + this.rng() * 0.05);
            this.tiltUntil = this.t + 1.2 + this.rng() * 2;
            this.nextTilt = this.tiltUntil + (c.listening ? 1.5 : 5) + this.rng() * (c.listening ? 3 : 10);
        }
        const tiltGoal = this.t < this.tiltUntil ? this.tiltTarget : 0;
        // shifting weight: slow sway from side to side when standing still
        if (this.t >= this.nextShift) {
            this.shiftTarget = (this.rng() - 0.5) * 0.05;
            this.nextShift = this.t + 7 + this.rng() * 12;
        }
        this.shift = ease(this.shift, c.walking || c.dancing ? 0 : this.shiftTarget, 0.012);
        // glances: eyes drift off now and then (not while someone is talking to him, unless he is thinking)
        if (!c.listening && this.t >= this.nextGlance && this.t >= this.glanceUntil) {
            this.glanceAway(0.5 + this.rng() * 0.8);
            this.nextGlance = this.t + 4 + this.rng() * 9;
        }
        if (c.thinking) {
            if (this.thinkSince < 0) {
                this.thinkSince = this.t;
                this.thinkDir = this.rng() < 0.5 ? -1 : 1;
            }
            this.glanceTarget = this.thinkDir * 0.2;
            this.glanceUntil = this.t + 0.15;
        }
        else
            this.thinkSince = -1;
        // eye contact: while he listens or talks his gaze settles straight on the person
        const yawGoal = this.t < this.glanceUntil ? this.glanceTarget : 0;
        // startle: kick then decay
        this.startleV *= Math.pow(0.9, dt * 60);
        this.startleHop *= Math.pow(0.86, dt * 60);
        // stumble: pitch forward, then catch with a small wobble
        let stumbleLean = 0;
        if (this.stumbleT >= 0) {
            this.stumbleT += dt;
            const p = this.stumbleT / 1.1;
            if (p >= 1)
                this.stumbleT = -1;
            else
                stumbleLean = Math.sin(Math.PI * Math.min(1, p * 1.6)) * 0.24 * (1 - p) + Math.sin(p * 18) * 0.03 * (1 - p);
        }
        // while walking there is a small chance per second to trip (about once every minute or two)
        if (c.walking && this.stumbleT < 0 && this.rng() < dt / 90)
            this.stumble();
        const fidget = c.walking || c.dancing ? 0.3 : 1; // fewer idle gestures while moving
        o.tilt = ease(o.tilt, tiltGoal * fidget + this.shift, 0.06);
        o.yaw = ease(o.yaw, yawGoal * fidget, 0.1);
        o.squash = blink * fidget;
        o.hop = this.startleHop;
        o.lean = this.startleV + stumbleLean;
        return o;
    }
}
const BEINGS = "dog|cat|puppy|kitten|mom|mum|dad|sister|brother|friend|grandma|grandpa|boss|teacher|baby|parents|wife|husband|partner|girlfriend|boyfriend";
const EVENTS = "exam|test|interview|presentation|meeting|trip|birthday|wedding|appointment|match|game|flight|deadline|surgery|party|date|class|race|concert|recital";
const FEELINGS = "sick|ill|tired|stressed|nervous|worried|anxious|sad|lonely|exhausted|upset|angry|scared";
/**
 * Pulls out things a friend would remember: an upcoming event, someone you care about, how you are feeling.
 * Deliberately simple (English only, a few patterns). Misses are fine; false alarms are avoided.
 */
export function extractTopics(text, now) {
    const t = text.trim().replace(/\s+/g, " ");
    const out = [];
    const add = (kind, phrase) => { if (phrase && !out.some((x) => x.phrase === phrase))
        out.push({ id: `${kind}:${phrase}`, kind, phrase, text: t.slice(0, 120), at: now }); };
    let m;
    const evRe = new RegExp(`\\b(?:i have|i've got|i got|i've|i have an?|there's)\\s+(?:an?\\s+|my\\s+|the\\s+)?(?:big\\s+|important\\s+|final\\s+)?(${EVENTS})\\b`, "i");
    if ((m = t.match(evRe)))
        add("event", `your ${m[1].toLowerCase()}`);
    const myEv = new RegExp(`\\bmy\\s+(?:big\\s+|final\\s+)?(${EVENTS})\\b`, "i");
    if ((m = t.match(myEv)))
        add("event", `your ${m[1].toLowerCase()}`);
    const being = new RegExp(`\\bmy\\s+(${BEINGS})\\b`, "i");
    if ((m = t.match(being)))
        add("being", m[1].toLowerCase() === "parents" ? "your parents" : `your ${m[1].toLowerCase()}`);
    const feel = new RegExp(`\\bi(?:'m| am| feel| have been feeling|'ve been feeling)\\s+(?:feeling\\s+|so\\s+|really\\s+|very\\s+|a bit\\s+)?(${FEELINGS})\\b`, "i");
    if ((m = t.match(feel)))
        add("feeling", m[1].toLowerCase());
    if ((m = t.match(/\bi(?:'m| am)\s+going\s+to\s+([a-z][a-z' -]{3,40}?)(?:\s+(?:tomorrow|tonight|today|later|soon|next \w+|this \w+))?(?:[.!?,]|$)/i)) && !/\bto (sleep|bed|go)\b/i.test(m[0]))
        add("plan", m[1].trim().toLowerCase());
    return out;
}
export class TopicMemory {
    items = [];
    lastAskAt = -1e12;
    constructor(items = []) { this.items = items.slice(-12); }
    learn(text, now) {
        const found = extractTopics(text, now);
        for (const f of found) {
            const i = this.items.findIndex((x) => x.id === f.id);
            if (i >= 0)
                this.items.splice(i, 1);
            this.items.push(f);
        }
        if (this.items.length > 12)
            this.items.splice(0, this.items.length - 12);
        return found;
    }
    /** A follow-up he could ask now, or null. Waits `minGapMs` after you said it, and never asks twice in a row too fast. */
    due(now, minGapMs = 180000, maxAgeMs = 3 * 86400000, spacingMs = 120000) {
        if (now - this.lastAskAt < spacingMs)
            return null;
        const c = this.items.filter((x) => !x.asked && now - x.at >= minGapMs && now - x.at <= maxAgeMs);
        return c.length ? c[c.length - 1] : null;
    }
    markAsked(t, now) { t.asked = true; this.lastAskAt = now; }
    question(t, rng) {
        switch (t.kind) {
            case "event": return pick([`By the way, how did ${t.phrase} go?`, `I keep wondering how ${t.phrase} went.`, `Oh, how did ${t.phrase} turn out?`], rng);
            case "being": return pick([`How is ${t.phrase} doing?`, `You mentioned ${t.phrase}. Is everything okay with them?`, `How's ${t.phrase}?`], rng);
            case "feeling": return pick([`Are you feeling any less ${t.phrase} now?`, `Earlier you said you were ${t.phrase}. Better now?`], rng);
            default: return pick([`Did you get to ${t.phrase}?`, `So, did you end up ${t.phrase.replace(/^(\w+)\b/, (w) => (w.endsWith("e") ? w.slice(0, -1) + "ing" : w + "ing"))}?`], rng);
        }
    }
}
// ------------------------------------------------------------ curiosity ---
export const CURIOUS_QUESTIONS = [
    { key: "favorite color", q: ["What's your favourite colour?", "Do you have a favourite colour?"] },
    { key: "favorite food", q: ["What's your favourite food?", "What do you like to eat the most?"] },
    { key: "likes", q: ["What do you like doing when you're free?", "What are you into? Any hobbies?"] },
    { key: "home", q: ["Where are you from?", "Where do you live?"] },
    { key: "favorite animal", q: ["What's your favourite animal?", "Do you like animals? Which ones?"] },
];
/** A question he is curious about, for something he does not know yet. Never repeats one he already asked. */
export function curiosityQuestion(facts, asked, rng) {
    const open = CURIOUS_QUESTIONS.filter((c) => !facts[c.key] && !asked.includes(c.key));
    if (!open.length)
        return null;
    const c = pick(open, rng);
    return { key: c.key, question: pick(c.q, rng) };
}
/** Reads a short answer to the question he just asked ("blue", "I like pizza", "it's pizza"). Null if it does not look like an answer. */
export function readAnswer(text, key) {
    const t = text.trim().replace(/[.!]+$/, "");
    if (!t || t.includes("?") || t.split(/\s+/).length > 7)
        return null;
    if (/^(no|nope|nothing|none|don'?t know|idk|not sure|why)\b/i.test(t))
        return null;
    const v = t.replace(/^(it'?s|its|i like|i love|i'd say|probably|maybe|mostly|i'm from|i am from|from|i live in|in)\s+/i, "").replace(/^(a|an|the)\s+/i, "").trim();
    return v.length >= 2 && v.length <= 40 ? v : null;
}
// --------------------------------------------------------- back-channels ---
/** True if `text` is you telling him something (not a question, not a command), so a small acknowledgement fits. */
export function isStatement(text) {
    const t = text.trim();
    if (!t || t.includes("?"))
        return false;
    if (/^(stop|go|walk|dance|turn|look|come|play|sit|wait|please|hey vision|vision)\b/i.test(t))
        return false;
    if (/^(what|why|how|when|where|who|which|can|could|do|does|did|is|are|will|would|should|tell me)\b/i.test(t))
        return false;
    return t.split(/\s+/).length >= 5;
}
/** Quick acknowledgements that match what you said (good news, bad news, plain news). */
export function backchannel(text, rng) {
    const t = text.toLowerCase();
    if (/\b(exam|test|interview|presentation|race|surgery|audition|recital|deadline)\b/.test(t) && !/\b(passed|finished|aced|done|failed|awful|terrible|sick|died)\b/.test(t))
        return pick(["Oh, good luck with that!", "That sounds big. You'll do fine.", "Ooh. I hope it goes well."], rng);
    if (/\b(sick|ill|tired|stressed|worried|nervous|anxious|scared|sad|lost|died|failed|hate|awful|terrible|bad day|angry|upset|broke)\b/.test(t))
        return pick(["Oh no.", "Ah, that sounds rough.", "Mm. I'm sorry.", "Oh. That's hard."], rng);
    if (/\b(got|won|passed|finished|love|loved|great|awesome|happy|excited|new|promoted|birthday|best)\b/.test(t))
        return pick(["Oh nice!", "That's great!", "Ooh, really?", "Wow, good for you."], rng);
    return pick(["Mm-hm.", "I see.", "Oh, really?", "Huh. Okay.", "Ah.", "Right, right."], rng);
}
// -------------------------------------------------------- hesitation, quirk -
/** Adds a small, human hesitation in front of a line (not when it is already hesitant). */
export function hedge(line, rng, p = 0.18) {
    if (!line || rng() >= p || /^(um|hmm|well|uh|oh|mm|ah|\*)/i.test(line))
        return line;
    return pick(["Hmm, ", "Well, ", "Um, ", "Let me think... "], rng) + lc(line);
}
export const QUIRKS = [
    { id: "hm", apply: (l, r) => (r() < 0.5 ? `${l} Hm!` : `Hm, ${lc(l)}`) },
    { id: "beep", apply: (l, r) => (r() < 0.5 ? `*beep* ${l}` : `${l} *beep*`) },
    { id: "right", apply: (l) => (/[.!]$/.test(l) && !/\?$/.test(l) ? l.replace(/[.!]$/, ", right?") : l) },
    { id: "tiny", apply: (l) => `${l} (tiny hop)` },
];
export function pickQuirk(rng) { return pick(QUIRKS, rng).id; }
/** Applies his one verbal habit now and then (about one line in eight), so he is recognisable but not annoying. */
export function applyQuirk(line, id, rng, p = 0.12) {
    const q = QUIRKS.find((x) => x.id === id);
    if (!q || !line || rng() >= p || line.length > 140)
        return line;
    return q.apply(line, rng);
}
/** A rare, friendly callback that only works because he remembers you. */
export function callback(ctx, rng) {
    if (ctx.trust < 0.55)
        return null;
    const pool = [];
    if (ctx.favoriteToy)
        pool.push(`Don't tell the ${ctx.favoriteToy}, but you're my favourite.`);
    if (ctx.name)
        pool.push(`${ctx.name}, you again? I was just starting to enjoy the quiet. Kidding!`);
    if (ctx.fact)
        pool.push(`I still remember ${ctx.fact}. I'm basically a good listener with legs.`);
    return pool.length ? pick(pool, rng) : null;
}
// ------------------------------------------------------------------ moods --
/** Remembers why his mood moved, so he can answer "why are you sad?" honestly. */
export class MoodLog {
    items = [];
    add(text, dv, at) { if (text && Math.abs(dv) >= 0.04) {
        this.items.push({ text, dv, at });
        if (this.items.length > 12)
            this.items.shift();
    } }
    /** The strongest recent cause pushing him the way he currently feels (sign of `mood`). */
    cause(now, sign, maxAgeMs = 20 * 60000) {
        const c = this.items.filter((x) => now - x.at < maxAgeMs && Math.sign(x.dv) === Math.sign(sign)).sort((a, b) => Math.abs(b.dv) - Math.abs(a.dv))[0];
        return c ? c.text : null;
    }
}
export function explainMood(mood0, valence, cause, dayCause, rng) {
    const why = cause ?? dayCause;
    // "calm" or "curious" do not explain a bad cause: say how it really feels
    const flat = ["calm", "neutral", "curious", "content", "alert"].includes(mood0);
    const mood = valence < -0.15 && flat ? "a bit down" : valence > 0.25 && flat ? "in a good mood" : mood0;
    if (valence > 0.25)
        return why ? pick([`I'm ${mood === "in a good mood" ? mood : "feeling " + mood}, mostly because ${why}.`, `${cap(why)}. So I'm ${mood === "in a good mood" ? mood : "pretty " + mood}.`], rng) : `I'm ${mood === "in a good mood" ? mood : "feeling " + mood}. Nothing special, it's just a good moment.`;
    if (valence < -0.15)
        return why ? pick([`I'm ${mood === "a bit down" ? mood : "a bit " + mood}. ${cap(why)}.`, `Honestly, ${why}. That's why I feel ${mood}.`], rng) : `I feel ${mood}, and I'm not sure why. Some moods just show up.`;
    return why ? `I'm okay, ${mood}. ${cap(why)}, but it's not much.` : `I'm okay. Just ${mood}.`;
}
/** The tone of a new day: some mornings are just better or worse, and he can say why. */
export function dayTone(rng) {
    const tone = clamp((rng() + rng() + rng() - 1.5) * 0.28, -0.25, 0.25); // roughly bell shaped around 0
    if (tone > 0.09)
        return { tone, cause: pick(["I woke up feeling good today", "I slept really well", "it's just a nice morning"], rng) };
    if (tone < -0.09)
        return { tone, cause: pick(["I woke up a bit grumpy", "I didn't sleep very well", "I just got out of bed on the wrong side"], rng) };
    return { tone, cause: null };
}
export const OWN_SORRY = [
    "Sorry I was a bit short with you earlier. I was having a rough morning.",
    "Hey, sorry if I was grumpy before. It wasn't about you.",
    "I think I snapped a little earlier. Sorry about that.",
];
/** Short, tired-grumpy replies on a bad day (only when he is not hurt by anyone in particular). */
export const GRUMPY_LINES = ["Hm.", "Can we do it later?", "Not really in the mood.", "Mm. Maybe.", "I'm a bit off today."];
// ----------------------------------------------------------------- reunion -
/** How he greets someone he has not seen for a while. Returns null when the gap is too short to mention. */
export function reunion(awayMs, warmth, name, rng) {
    const who = name ? `, ${name}` : "";
    if (awayMs < 5 * 60000)
        return null;
    if (awayMs < 30 * 60000)
        return pick([`Oh, you're back${who}!`, `There you are${who}.`], rng);
    if (warmth > 0.4)
        return pick([`${name ?? "You"}! I missed you!`, `You're back${who}! It felt like a long time.`, `Finally${who}! I was starting to wonder where you went.`], rng);
    return pick([`Oh, hello again${who}. It's been a while.`, `You're back${who}. Hi.`], rng);
}
// ============================================================ sound direction
/** Where a sound came from, relative to where he faces (0 = ahead, +90 = his right, 180 = behind). */
export function soundSide(bearing) {
    const b = (((bearing % 360) + 540) % 360) - 180;
    if (Math.abs(b) < 30)
        return "in front of me";
    if (Math.abs(b) > 150)
        return "behind me";
    return b > 0 ? "on my right" : "on my left";
}
export function soundLine(bearing, rng) {
    const w = soundSide(bearing);
    return pick([`What was that ${w}?`, `Something made a noise ${w}!`, `I heard that, ${w}.`], rng);
}
// ============================================================ jealousy
export const JEALOUS_RX = /\b(another robot|other robot|a new robot|my new (?:robot|assistant|friend|pet)|alexa|siri|chatgpt|google assistant|better than you|prefer (?:her|him|them|it) to you)\b/i;
/** A small, honest pang when he hears you like someone else better. Stronger the closer he is to you. */
export function jealousLine(warmth, rng) {
    if (warmth < 0.35)
        return pick(["Oh. Okay.", "Right. Good for them."], rng);
    return pick(["Oh... I see. Is it better than me?", "Hm. I'm a little jealous, honestly.", "Oh. That stings a bit. I thought we were doing fine."], rng);
}
export function jealousSight(otherName, closeName, rng) {
    return pick([`Oh, ${otherName}. ...Hi. I was just with ${closeName}.`, `Hm. ${otherName}'s here. I liked it when it was just us, ${closeName}.`], rng);
}
// ============================================================ interruptions and trailing off
export const INTERRUPTED = ["Oh, sorry, go ahead.", "Sorry, I was talking. You first.", "Oops, I'll stop. Go on."];
export const WAS_INTERRUPTED_BY_ME = ["Oh, sorry, I cut in.", "Sorry, I talked over you."];
/** Cut a long line off partway when he is tired or distracted: "I was going to say... never mind." */
export function trailOff(line, rng) {
    const words = line.split(/\s+/);
    if (words.length < 9)
        return line;
    const cut = Math.max(4, Math.floor(words.length * (0.45 + rng() * 0.2)));
    const head = words.slice(0, cut).join(" ").replace(/[.,;!?]+$/, "");
    return `${head}... ${pick(["never mind.", "where was I?", "sorry, I lost my train of thought.", "anyway."], rng)}`;
}
// ============================================================ forgetting
export const FORGET_AFTER_MS = 5 * 24 * 3600_000;
/**
 * Facts he has not heard about for a long time may fade. Returns the keys that faded this time.
 * Things you repeat stay (seenAt is refreshed); the longer ago and the less you mention it, the likelier it fades.
 */
export function fadeFacts(facts, seenAt, now, rng, after = FORGET_AFTER_MS) {
    const gone = [];
    for (const k of Object.keys(facts)) {
        const age = now - (seenAt[k] ?? now);
        if (age < after)
            continue;
        const p = Math.min(0.5, 0.15 + (age - after) / (after * 4));
        if (rng() < p)
            gone.push(k);
    }
    return gone;
}
export function forgotQuestion(key, rng) {
    const base = CURIOUS_QUESTIONS.find((c) => c.key === key)?.q[0] ?? `What's your ${key}?`;
    return pick([`I think I've forgotten something. ${base.replace(/^What's/, "What was").replace(/\?$/, " again?")}`, `Sorry, it's slipped my mind. ${base}`], rng);
}
export const MILESTONES = [
    { id: "trusting", test: (s) => s.maxTrust >= 0.85, shift: { sociable: 0.06, calm: 0.04 }, line: "I just realised I really trust you. That feels good.", note: "learned to trust someone" },
    { id: "hundred_chats", test: (s) => s.interactions >= 100, shift: { sociable: 0.05, agreeable: 0.03 }, line: "We've talked a hundred times now. I think I'm more of a talker than I was.", note: "a hundred conversations" },
    { id: "rough_patch", test: (s) => s.scolds >= 6, shift: { calm: -0.05, bold: -0.06, agreeable: 0.03 }, line: "I've been scolded a fair bit. I think I've become more careful.", note: "a rough patch" },
    { id: "spoiled", test: (s) => s.gifts >= 5, shift: { curious: 0.05, bold: 0.04 }, line: "So many gifts! I feel braver about trying new things.", note: "got lots of gifts" },
    { id: "thick_skin", test: (s) => s.noises >= 12, shift: { calm: 0.06, bold: 0.03 }, line: "Loud noises don't rattle me like they used to. I've toughened up.", note: "got used to loud noises" },
    { id: "missed_you", test: (s) => s.longAbsences >= 1 && s.maxTrust >= 0.6, shift: { sociable: 0.04, agreeable: 0.03 }, line: "Being away from you so long taught me I'd rather have company.", note: "was left alone a long time" },
    { id: "old_friends", test: (s) => s.days >= 7 && s.interactions >= 30, shift: { calm: 0.04, sociable: 0.04 }, line: "We've known each other a week now. It feels like we're old friends.", note: "a week together" },
];
const c01 = (x) => Math.min(1, Math.max(0, x));
/** Returns newly reached milestones (not in `done`), applying their lasting shifts to the personality. */
export function checkMilestones(stats, done, big5, now) {
    const hit = [];
    for (const m of MILESTONES) {
        if (done[m.id] || !m.test(stats))
            continue;
        done[m.id] = now;
        for (const [k, d] of Object.entries(m.shift))
            big5[k] = c01((big5[k] ?? 0.5) + d);
        hit.push(m);
    }
    return hit;
}
// ============================================================ boundaries: asking for space
/** Builds up when he is poked, shouted at or startled again and again. */
export class Overload {
    level = 0;
    at = 0;
    add(amount, now) { this.decay(now); this.level += amount; }
    decay(now) { if (this.at)
        this.level = Math.max(0, this.level - (now - this.at) / 90_000); this.at = now; }
    get(now) { this.decay(now); return this.level; }
    reset() { this.level = 0; }
}
export const SPACE_ASK = ["Okay, that's a lot. I need a little space, please.", "Please stop for a moment. I need a minute to settle.", "I'm overwhelmed. Can I have some quiet time?"];
export const SPACE_REPLIES = ["Please, I need a minute.", "Can I have a little space?", "...I'd like some quiet right now."];
export const SPACE_END = ["Thanks for giving me space. I feel better now.", "Okay. I'm calmer now. Thank you."];
export const SORRY_RX = /\b(sorry|apolog|my bad|i('| a)m here|take your time|it'?s ok|it'?s okay|no worries|calm down|breathe)\b/i;
