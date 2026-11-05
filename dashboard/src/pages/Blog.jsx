import { useState, useEffect, useCallback } from "react";

/* ───────────────────────── image with notion style fullscreen ─────────────────────────
   click any image -> it opens fullscreen. click again or press esc to close. */
const ZoomImage = ({ src, alt = "", className = "" }) => {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && close();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  // if an image file is missing, don't show a broken icon
  if (!visible) return null;

  return (
    <>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setVisible(false)}
        onClick={() => setOpen(true)}
        className={`w-full h-auto cursor-zoom-in ${className}`}
      />
      {open && (
        <div
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={alt || "image preview"}
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 backdrop-blur-sm cursor-zoom-out p-4 sm:p-10"
          style={{ animation: "zoomFade 0.18s ease-out" }}
        >
          <style>{`
            @keyframes zoomFade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes zoomPop { from { transform: scale(0.97) } to { transform: scale(1) } }
          `}</style>
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-full object-contain rounded-md shadow-2xl"
            style={{ animation: "zoomPop 0.18s ease-out" }}
          />
        </div>
      )}
    </>
  );
};

/* ───────────────────────── small building blocks ───────────────────────── */
const Caption = ({ children }) => (
  <p className="text-[18px] text-[#8c8c8c] mt-6">{children}</p>
);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const H2 = ({ children }) => (
  <h2 id={slug(children)} className="text-[24px] font-semibold tracking-[-0.02em] mb-5 scroll-mt-8">
    {children}
  </h2>
);
/* clickable table of contents */
const Contents = ({ items }) => (
  <nav className="lg:hidden border-t border-b border-[#e8e8e8] py-5">
    <p className="text-[14px] text-[#8c8c8c] mb-3">contents</p>
    <ol className="list-decimal pl-6 space-y-1 text-[16px] leading-[1.7]">
      {items.map((t) => (
        <li key={t}>
          <a href={"#" + slug(t)} className="underline decoration-[#d4d4d4] underline-offset-4 hover:decoration-[#1a1a1a]">
            {t}
          </a>
        </li>
      ))}
    </ol>
  </nav>
);
const H3 = ({ children }) => (
  <h3 className="text-[19px] font-semibold tracking-[-0.015em] mt-2">{children}</h3>
);
const Bullets = ({ items }) => (
  <ul className="list-disc pl-6 space-y-2">
    {items.map(([title, text], i) => (
      <li key={i}>
        {title && <b>{title}</b>}
        {title && text ? ": " : ""}
        {text}
      </li>
    ))}
  </ul>
);
/* label on the left, explanation on the right: used for compact "tables" */
const Rows = ({ rows }) => (
  <div className="border-t border-[#e8e8e8]">
    {rows.map(([label, text], i) => (
      <div key={i} className="py-3 border-b border-[#e8e8e8] sm:flex sm:gap-6">
        <div className="sm:w-[150px] shrink-0 font-semibold text-[16px] leading-[1.7]">{label}</div>
        <div className="text-[16px] leading-[1.7] text-[#333]">{text}</div>
      </div>
    ))}
  </div>
);
/* equations and formulas */
const Eq = ({ children }) => (
  <p className="font-mono text-[14.5px] leading-[1.75] bg-[#f6f6f4] rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
    {children}
  </p>
);

/* ───────────────────────── right side "on this page" ───────────────────────── */
const SideToc = () => {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState("");

  useEffect(() => {
    const used = new Set();
    const list = [];
    let n = 0;
    document.querySelectorAll("article h2, article h3").forEach((el) => {
      let id = el.id || slug(el.textContent);
      let base = id, k = 2;
      while (used.has(id)) id = base + "-" + k++;
      used.add(id);
      el.id = id;
      el.style.scrollMarginTop = "32px";
      const level = el.tagName === "H2" ? 2 : 3;
      if (level === 2) n++;
      list.push({ id, level, n, text: el.textContent });
    });
    setItems(list);
    setActive(list[0] ? list[0].id : "");
  }, []);

  useEffect(() => {
    if (!items.length) return;
    const onScroll = () => {
      let cur = items[0].id;
      for (const it of items) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top <= 120) cur = it.id;
        else if (el) break;
      }
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);

  // keep the active item visible inside the sidebar
  useEffect(() => {
    const el = document.querySelector('[data-toc="' + active + '"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActive(id);
    }
  };

  return (
    <aside className="hidden lg:block w-[230px] shrink-0 sticky top-16 self-start max-h-[calc(100vh-5rem)] overflow-y-auto pr-4 pb-6">
      <p className="text-[15px] font-semibold text-[#1a1a1a] mb-4">On this page</p>
      <nav className="text-[14px] leading-[1.45]">
        <ul className="space-y-[7px]">
          {items.map((it) => (
            <li key={it.id} className={it.level === 3 ? "pl-4" : ""}>
              <a
                href={"#" + it.id}
                data-toc={it.id}
                onClick={(e) => go(e, it.id)}
                className={
                  "block transition-colors " +
                  (active === it.id ? "text-[#1a1a1a] font-medium" : "text-[#9a9a9a] hover:text-[#1a1a1a]")
                }
              >
                {it.level === 2 ? it.n + ". " : ""}
                {it.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

/* ───────────────────────── the ten chemicals ───────────────────────── */
const CHEMS = [
  {
    name: "dopamine",
    color: "#ffc300",
    meta: "released by the VTA · flows to NACC, VMPFC, OFC, CAUD, DLPFC · fast (0.45 s) · resting level 0.1",
    eq: "target = 0.1 + 0.85·max(0, RPE) + 0.35·VTA − 0.25·max(0, cortisol − 0.2) − 0.12·max(0, serotonin − 0.55)",
    text: [
      "this is the wanting and reward chemical, but more exactly it is the 'that was better than i expected' chemical. the main input is the reward prediction error (RPE), which is just what actually happened minus what he expected. if you praise him when he expected nothing, the error is big and dopamine jumps. if you praise him every minute, he starts expecting it, the error shrinks and so does the jump. that is why repeated treats feel less good, and it is the same in us.",
      "a lot of cortisol pushes it down and so does a very high serotonin level. on the regions it adds +0.3 to the accumbens, +0.2 to the value area (VMPFC) and +0.2 to the dorsolateral prefrontal cortex and the caudate. that is the planning and wanting circuit getting more active.",
      "it also gates learning. connections between regions are strengthened much more strongly while dopamine is up, and slightly weakened when it falls below normal. so reward literally decides what his brain remembers.",
      "in the thinking brain it becomes 'wanting': play gets +0.8 times dopamine, wander +0.6, dance +0.6, and each of them minus cortisol.",
    ],
  },
  {
    name: "serotonin",
    color: "#2ee6a6",
    meta: "released by the raphe · flows to VMPFC, AMY, HIPP, PCC, DLPFC · slow (6 s) · resting level 0.4",
    eq: "target = 0.4 + 0.9·RAPHE − 0.25·SGACC − 0.2·max(0, cortisol − 0.25) + 0.15·social positive",
    text: [
      "mood stability and calm. it comes up from the raphe nuclei, a little more when he feels socially safe, and it is pulled down by the low mood area (the subgenual cingulate, which is the rumination circuit) and by high cortisol.",
      "on the regions it adds +0.2 to the value area and takes 0.3 off the amygdala, so a high serotonin brain is harder to scare. when nothing is going on and serotonin is above 0.5, his emotion reads out as calm instead of neutral. in the mood formula it counts 0.35 times its distance from the resting level.",
    ],
  },
  {
    name: "noradrenaline",
    color: "#ff7b00",
    meta: "released by the locus coeruleus · flows to THAL, AMY, HIPP, DLPFC, ACC, SC · fast (1 s) · resting level 0.1",
    eq: "target = 0.1 + 1.0·LC + 0.35·startle − 0.2·max(0, melatonin − 0.2)      (about 0.02 when asleep)",
    text: [
      "alertness. it wakes the whole cortex up. novelty, danger and sudden things raise it through the locus coeruleus, and it is almost off while he sleeps.",
      "it raises the gain of the entire brain by 0.3 times its level, so everything reacts harder. it adds 0.15 to the amygdala. and in the instinct system it lowers the decision threshold (by 0.15 times the locus coeruleus activity), which means alert brains decide faster. it is also half of what separates happy from excited: the same reward circuit with the locus coeruleus high reads out as excited.",
    ],
  },
  {
    name: "adrenaline",
    color: "#ff1744",
    meta: "released by the hypothalamus and brainstem · flows to M1, PMC, PPC, S1 and the whole cortex · fast (2.5 s) · resting level 0.05",
    eq: "target = 0.05 + 1.4·HYP·(0.3 + AMY) + 0.35·LC + 0.4·startle",
    text: [
      "the fight or flight surge. it rises when the hypothalamus and the amygdala are both active, together with the locus coeruleus and the startle burst. it adds 0.2 times its level to the global gain and +0.15 to the movement areas (motor, premotor, parietal). it is what makes a loud noise feel like a full body event instead of just a thought.",
    ],
  },
  {
    name: "cortisol",
    color: "#b44dff",
    meta: "released by the hypothalamus · flows to HIPP, AMY, VMPFC, DLPFC and everywhere · very slow (18 s) · resting level 0.1",
    eq: "target = 0.1 + 1.3·HYP·(0.4 + AMY) − 0.15·max(0, oxytocin − 0.2)",
    text: [
      "the stress hormone and the one with the longest memory. it builds when the hypothalamus and amygdala are both active, and oxytocin pulls it back down. because it is so slow to rise and so slow to fade, a scary moment keeps affecting him long after it is over.",
      "on the regions: +0.25 on the amygdala (so it makes fear easier to trigger), −0.15 on the hippocampus, −0.2 on the value area. it suppresses dopamine. in the mood formula it is the only strong negative term, minus 0.5 times its distance from rest. in the thinking brain it takes away from play, wander and dance and adds to rest and withdrawal. this is the reason a scolding is not forgotten in a second.",
    ],
  },
  {
    name: "oxytocin",
    color: "#ff7ac8",
    meta: "released by the hypothalamus · flows to AMY, NACC, MPFC, TPJ, VMPFC · slow (6 s) · resting level 0.1",
    eq: "target = 0.1 + 0.9·social positive + 0.15·max(0, last outcome)",
    text: [
      "bonding, trust and warmth. it rises with positive social contact (someone being kind to him, being around a person) and with good outcomes. on the regions it takes 0.25 off the amygdala, adds 0.15 to the accumbens and 0.15 to the areas that think about other people (MPFC and TPJ), and it lowers cortisol.",
      "in the thinking brain it is the 'i want company' signal: watch and call out get +0.6 times oxytocin.",
    ],
  },
  {
    name: "endorphin",
    color: "#00e0ff",
    meta: "released by the PAG and hypothalamus · flows to S1, ACC, INS, NACC, THAL · slow (7 s) · resting level 0.1",
    eq: "target = 0.1 + 1.5·PAG + 0.3·NACC + 0.2·max(0, RPE)",
    text: [
      "the brain's own painkiller and pleasure boost. pain activates the PAG (periaqueductal grey) which releases it, and so do reward and good surprises. it takes 0.25 off the body sense (S1) and 0.2 off the ACC and insula, which are the 'ouch' and the gut feeling areas, so pain hurts less after a moment. it also adds 0.15 to the accumbens.",
    ],
  },
  {
    name: "acetylcholine",
    color: "#b8ff4d",
    meta: "released by the basal forebrain · flows to V1, A1, HIPP, ACC, DLPFC, PPC · fast (1.5 s) · resting level 0.15",
    eq: "target = 0.15 + 1.2·BF + 0.1·max(0, RPE)      (0.08 when asleep)",
    text: [
      "attention and learning. anything novel, threatening or strong recruits the basal forebrain, which sprays acetylcholine over the sensory cortex. his eyes and ears get sharper (+0.2 gain in the visual areas, A1 and IT), the hippocampus gets better at forming memories (+0.2), and the predictive layer learns faster from its mistakes. in the thinking brain it adds to look around (+0.5 times its level).",
    ],
  },
  {
    name: "GABA",
    color: "#4d7cff",
    meta: "released by the thalamus · flows everywhere · medium (3 s) · resting level 0.3",
    eq: "target = 0.3 + 2.4·mean activity above rest   (+0.25 when asleep)\nglobal inhibition = 1.6 · mean activity · (0.6 + 1.2·GABA)",
    text: [
      "the brake. it rises when too much of the brain is active at once, and while he sleeps. it scales the global inhibition: the more of the brain is lit up, the harder it is to recruit more, and GABA tightens that further. without it, one big event would light up every region at the same time and he would just be a screaming blob of activity.",
    ],
  },
  {
    name: "melatonin",
    color: "#7c6bff",
    meta: "released by the hypothalamus · flows to THAL, RF, PCC and everywhere · medium (8 s) · resting level 0.1",
    eq: "target = 0.9 when asleep, otherwise 0.1",
    text: [
      "the sleep hormone. it sits at 0.1 while he is awake and goes up to 0.9 when he sleeps. it takes 0.3 off the locus coeruleus and the reticular formation (the wakefulness system) and reduces the gain of the whole brain by up to 30 percent. when he is asleep the brain runs at 45 percent strength and shows slow waves, but something dangerous, like a very loud noise or pain, can still wake him. in the thinking brain it adds to rest (+0.8 times its level).",
    ],
  },
];

const Chem = ({ c }) => (
  <div className="space-y-3">
    <div className="flex items-center gap-3">
      <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
      <h3 className="text-[19px] font-semibold tracking-[-0.015em]">{c.name}</h3>
    </div>
    <p className="text-[14px] leading-[1.6] text-[#8c8c8c]">{c.meta}</p>
    <Eq>{c.eq}</Eq>
    {c.text.map((t, i) => (
      <p key={i}>{t}</p>
    ))}
  </div>
);

/* ───────────────────────── the blog ───────────────────────── */
const Blog = () => {
  return (
    <div className="min-h-screen cool bg-white text-[#1a1a1a] selection:bg-yellow-600 selection:text-white px-6 pt-16 pb-24 font-sans antialiased">
      <div className="mx-auto max-w-[620px] lg:max-w-[930px] lg:flex lg:gap-14 lg:items-start">
      <SideToc />
      <div className="w-full max-w-[620px] min-w-0 shrink-0">
        <a href="/" className="flex justify-start mb-16 cursor-pointer" type="button">
          <img className="w-16" src="/images/Vision.png" alt="Vision Logo" />
        </a>

        <div className="mb-12 text-[#8c8c8c] text-[15px] leading-relaxed">
          <div className="mt-8 space-y-0.5">
            <p>by: arijit.</p>
            <p>published: oct 30, 2026.</p>
          </div>
        </div>

        <article className="text-[18px] leading-[1.8] tracking-[-0.011em] text-[#1a1a1a] space-y-10">
          <p>so, vision.</p>

          <Contents items={["overview", "the mind", "making him feel human", "letting him improve himself", "the server side: one cycle of the brain", "how he sees", "how he looks", "how he hears and speaks", "memory and teaching", "commands and vision script", "safety", "the link between robot and brain", "security", "the simulator and the dashboard", "how i checked that any of this works", "the database", "deploying it", "bugs i hit and what they taught me", "under the hood", "hardware", "what is real and what is not", "what is next"]} />

          {/* ═════════ OVERVIEW ═════════ */}
          <div className="space-y-6">
            <H2>overview</H2>
            <p>
              vision is a human like robot which i desgined keeping in mind the human mind and nature how a human
              respond to situations. it is a humanoid robot which is designed to perform various tasks and functions.
            </p>
            <p>
              it is a small walking robot with a head, two legs, a camera for eyes, a microphone for ears and a
              speaker for a voice. but the real project is not the body. the body is just a way to carry the brain
              around. the whole idea was: what if a robot did not just follow commands, but had something like
              moods, needs, memories and habits, and those things decided what it does next.
            </p>
            <p>
              i want to be honest about one thing early. vision does not really feel anything and it is not
              conscious. everything i call an emotion, a hormone, a mood or a personality in this post is a
              mathematical model that produces human like behaviour. i think that is still a really interesting
              thing to build, so that is what this post is about, and i will try to show the actual numbers
              instead of just saying "it has feelings".
            </p>
            <ZoomImage src="/assets/blog/vision-layout.png" alt="Layout" />
            <p>the whole thing is four parts that talk to each other:</p>
            <Bullets
              items={[
                ["the robot", "an esp32-s3 with a camera, mic, speaker, three servos and a distance sensor. it is the body. it does not think, it only sends what it sees and hears and does what it is told."],
                ["the server", "written in typescript. this is where the brain lives: perception, memory, decisions, reactions, safety, and the compiler for my own little robot language."],
                ["the dashboard", "a react app where i can watch the robot live, see what he is thinking, teach him facts and control him."],
                ["the simulator", "a 3d version of vision that runs in the browser, so i can test the whole mind without touching the hardware."],
              ]}
            />
            <Eq>{`esp32-s3 robot  <--- websocket --->  typescript server  --->  postgres + pgvector
(camera, mic, speaker,                  |  brain, memory, safety,         (people, faces, memory, logs)
 3 servos, ultrasonic)                  |  compiler, simulator host   --->  optional ai models
                                        |
                                        +--- socket.io --->  react dashboard`}</Eq>
            <p>
              there are two ways it runs, set by one setting. in simulation mode (the default) the brain drives a
              virtual robot that you watch in 3d. in hardware mode the same brain drives the real esp32 over a
              websocket. each mode refuses the other: simulator endpoints answer an error in hardware mode, so the
              simulator can never accidentally move the real robot.
            </p>
            <p>
              one more thing about how i built this. i kept the safety rules and the brain strictly separate. the
              mind can want anything it likes, but every single command still has to pass the same gate before it
              reaches a servo. you will see that idea come back again and again.
            </p>
          </div>

          <hr />

          {/* ═════════ THE MIND ═════════ */}
          <div className="space-y-6">
            <H2>the mind</H2>
            <p>
              this is the part i spent the most time on. a normal robot is basically an if statement: if obstacle,
              turn. i wanted vision to have an inner life, so i gave him two brains that work together. one is an
              emotional brain modelled on the real human brain, and the other is a thinking brain that decides what
              he actually does.
            </p>
            <p>
              i did not want a black box. i could have trained a neural network and called it a day, but then i
              could never answer "why did he do that". here every emotion can be traced back to specific brain
              regions and specific chemicals, and every decision can be traced back to named score parts. a
              trained network would also need data i do not have.
            </p>
            <ZoomImage src="/assets/blog/regions.png" alt="Regions" />
          </div>

          {/* ───── anatomy ───── */}
          <div className="space-y-6">
            <H3>1. the anatomy</H3>
            <p>
              i did not simulate billions of neurons, that would be crazy. it is a neural mass model: instead of
              cells, each region holds a single number, its activity between 0 and 1. there are about 42 regions
              (around 70 to 80 nodes once you add left, right and midline copies) joined by roughly 130 weighted
              connections. the "neurons" number on each region is only a relative weight, not a cell count, but
              the weights are in real proportion: the cerebellum is about 80 percent, the cerebrum about 19
              percent and the brainstem about 1 percent, just like a real human. every region also has a position
              in brain coordinates, so the viewer in the lab can draw the brain and show halos where chemicals are
              released.
            </p>
            <Rows
              rows={[
                ["seeing", "LGN (first stop for the eyes), V1 (edges, light, contrast), V2/V4 (colour, shape, texture), MT (movement), IT (what an object is), FFA (faces)."],
                ["hearing + language", "MGN (first stop for sound), A1 (pitch, loudness, timing), Wernicke (understanding words), Broca (forming a reply)."],
                ["body + movement", "S1 (touch, pressure, where it hurts), M1 (movement commands), premotor (planning movement), posterior parietal (where things are), cerebellum (smooth coordination)."],
                ["thinking", "DLPFC (working memory, deliberate choice), MPFC (self and other people), ACC (conflict, effort, the 'ouch' of pain), TPJ (what is that person thinking or feeling)."],
                ["value", "VMPFC (value, calming the amygdala), OFC (how good or bad is this)."],
                ["emotion", "amygdala (is this dangerous or important), insula (gut feeling, disgust, body state), subgenual cingulate (sadness and low mood), hypothalamus (stress hormones, body response)."],
                ["reward", "VTA (dopamine source), nucleus accumbens (pleasure and wanting), caudate (goal directed choice), putamen (habit and motor selection)."],
                ["memory", "hippocampus (have i seen this before, making memories), parahippocampal (place and context), temporal pole (meaning of people and things), posterior cingulate (self, mind wandering, rumination)."],
                ["smell", "olfactory cortex. it is wired straight into the amygdala and memory and skips the thalamus, like in real brains."],
                ["brainstem", "superior colliculus (snap attention to sudden things), PAG (freeze, fight, flee, pain control), locus coeruleus (noradrenaline), raphe (serotonin), basal forebrain (acetylcholine), reticular formation (wakefulness)."],
                ["the gate", "thalamus, which routes everything to the cortex."],
              ]}
            />
            <p>
              the connections are directed pairs with a weight, positive for excitatory and negative for
              inhibitory. a few examples: VTA to accumbens 0.9 (reward), amygdala to hypothalamus 0.7 and amygdala
              to PAG 0.7 (threat), motor cortex to cerebellum 0.75 (the motor loop), and the sadness area to the VTA
              at minus 0.3 (sadness dips reward). connections to the other hemisphere use 35 percent of the weight.
            </p>
            <p>
              the most important ones are the top down brakes: the value area (VMPFC) inhibits the amygdala at
              minus 0.5, the orbitofrontal at minus 0.3, the dorsolateral prefrontal at minus 0.25 and the medial
              prefrontal at minus 0.2. that is how he calms down. fear starts fast in the amygdala and then the
              thinking part of the brain slowly talks it down.
            </p>
          </div>

          {/* ───── region dynamics ───── */}
          <div className="space-y-6">
            <H3>2. how one region behaves</H3>
            <p>every region follows the same rule, every tiny time step (20 ms or less):</p>
            <Eq>{`x = bias + gain · (0.6 · Σ w · (activity_pre − rest_pre) + stimulus input)
      + noise − global inhibition − 0.45 · fatigue + chemical terms

target = 1 / (1 + e^(−6 · (x − 0.55)))              (a sigmoid squashing to 0..1)
activity += (target − activity) · (1 − e^(−dt / tau))`}</Eq>
            <Bullets
              items={[
                ["its own speed (tau)", "every region has a time constant. the amygdala, thalamus and the sensory relays are fast (0.04 to 0.05 s), the visual and auditory cortex about 0.06 to 0.08 s, the hippocampus 0.12 s, the prefrontal cortex 0.15 s and the sadness and rumination areas the slowest at 0.2 s. that is why fear reacts instantly but sadness takes a while to build and a while to leave."],
                ["noise", "a smoothed random drive (an Ornstein Uhlenbeck kind of noise) is added to every region, so the brain is never perfectly still and he is never perfectly predictable."],
                ["global inhibition", "1.6 times the mean activity above rest, times (0.6 + 1.2 times GABA). the more of the brain is active, the harder it is to recruit more."],
                ["fatigue", "slow adaptation: the fatigue of a region follows its activity with a delay of about 2.2 seconds and then pulls the region down. a region that fires for a long time gets tired, so even a strong emotion cannot stay at 100 percent forever."],
                ["gain", "raised by noradrenaline (+0.3 times its level) and adrenaline (+0.2), lowered by melatonin (up to −30 percent), and only 45 percent when asleep."],
                ["chemical terms", "each region is also pushed by specific chemicals. for example the accumbens gets +0.3 dopamine, +0.15 oxytocin, +0.15 endorphin. the amygdala gets +0.25 cortisol, −0.3 serotonin, −0.25 oxytocin, +0.15 noradrenaline. the hippocampus gets −0.15 cortisol and +0.2 acetylcholine. the sensory cortices get +0.2 acetylcholine. the motor areas get +0.15 adrenaline. the ACC and insula get −0.2 endorphin."],
              ]}
            />
          </div>

          {/* ───── event to emotion ───── */}
          <div className="space-y-6">
            <H3>3. from an event to a feeling</H3>
            <p>
              things that can happen to him: praise, a scolding, a loud noise, a poke, a gift, sudden motion, the
              lights going out or coming on, being ignored, being picked up and moved, a person arriving or
              leaving, an object being shown to him, words he hears, playing, discovering somewhere new, dancing,
              refusing or obeying, and the slow internal ones like loneliness, boredom and wondering. each one goes
              through three steps.
            </p>
            <p>
              <b>step one, the sense route.</b> the event enters through the sense it arrives by. a sight goes
              through the LGN, V1, IT and, if there is a face, the FFA. a sound goes through the MGN and A1, and if
              it has words, Wernicke's area and Broca's area. a touch goes to the thalamus and S1. pain goes to
              S1, the insula, the ACC and the PAG, and also hits the locus coeruleus and hypothalamus. smell goes
              straight to the olfactory cortex and the amygdala. a thought (like being ignored) goes to the
              prefrontal areas, posterior cingulate and hippocampus.
            </p>
            <p>
              <b>step two, the appraisal.</b> the event is turned into a set of numbers that say what it means:
              reward, threat, loss, novelty, social, anger, disgust, pain, face and familiarity (plus a derived
              valence and arousal). each one drives its own set of deep regions:
            </p>
            <Rows
              rows={[
                ["reward", "VTA 0.95, accumbens 0.85, value area 0.55, orbitofrontal 0.5, raphe 0.25"],
                ["threat", "amygdala 1.0, locus coeruleus 0.8, PAG 0.7, hypothalamus 0.6, insula 0.4, superior colliculus 0.4"],
                ["loss", "subgenual cingulate 0.9, posterior cingulate 0.5, insula 0.4, and it pushes the VTA down −0.5 and accumbens −0.4, so sad means the low mood circuit goes up and the reward circuit goes down"],
                ["anger", "putamen 0.95, ACC 0.8, hypothalamus 0.7, amygdala 0.6, caudate 0.55"],
                ["disgust", "insula 1.0, olfactory 0.4, amygdala 0.4, orbitofrontal 0.3"],
                ["social", "TPJ 0.7 and MPFC 0.7, the areas that think about other minds"],
                ["novelty", "hippocampus 0.8, superior colliculus 0.7, locus coeruleus 0.5, ACC 0.4, and it recruits the basal forebrain for attention"],
              ]}
            />
            <p>here is how a few events are scored:</p>
            <Rows
              rows={[
                ["praise", "reward 0.8, social 0.9, a little novelty (0.25)"],
                ["a scolding", "loss 0.5, social 0.85, threat 0.3, a little anger"],
                ["a loud noise", "threat 0.75, novelty 0.85, very high intensity (0.95)"],
                ["a new toy", "reward 0.85, novelty 0.7"],
                ["a poke", "novelty 0.55, social 0.5, a bit of threat and pain"],
                ["being ignored", "loss 0.55"],
                ["someone arrives", "social 0.8, face 0.8, reward 0.55, novelty"],
                ["being picked up", "threat 0.45, novelty 0.9"],
              ]}
            />
            <p>
              repeats feel less new. novelty is multiplied by max(0.3, 1 − 0.18 · (n − 1)) where n is how many times
              the same thing has happened, and familiarity goes up instead. so the first loud noise is a shock and
              the fifth one is just annoying. words he hears are read by a small lexicon, so "you are great" and
              "go away" are appraised differently. a sleeping brain still wakes up for pain or anything with a high
              enough threat, anger or pain value.
            </p>
            <p>
              <b>step three, the readout.</b> the emotion is never set directly. it is read out of which regions are
              active, as a weighted blend. this is the most important rule of the whole model.
            </p>
            <Eq>{`pos = 0.4·NACC + 0.25·VMPFC + 0.2·VTA + 0.15·OFC + 0.18·slow mood
HAPPY     = pos · (1 − 0.4·LC)
EXCITED   = pos · (0.3 + 0.9·LC)
FEARFUL   = 0.45·AMY + 0.2·PAG + 0.2·LC + 0.15·INS − 0.2·pos
SAD       = 0.4·SGACC + 0.2·PCC + 0.15·INS + 0.1·AMY + (low dopamine) − 0.25·pos`}</Eq>
            <Rows
              rows={[
                ["happy", "accumbens, value area, VTA, orbitofrontal"],
                ["excited", "the same reward circuit, plus a high locus coeruleus (alert)"],
                ["fearful", "amygdala, PAG, locus coeruleus, insula"],
                ["angry", "putamen, ACC, caudate, hypothalamus, premotor"],
                ["disgusted", "insula, olfactory, putamen, orbitofrontal"],
                ["sad", "subgenual cingulate, posterior cingulate, insula, amygdala, plus low dopamine"],
                ["pain", "S1, ACC, insula, PAG"],
                ["curious", "hippocampus, ACC, superior colliculus, DLPFC, VTA, minus the amygdala"],
                ["surprised", "the startle burst, superior colliculus, locus coeruleus"],
                ["calm", "the raphe, when nothing else is active and serotonin is above 0.5"],
              ]}
            />
            <p>
              every label comes with a reason, built from the strongest contributing regions, for example "because
              NACC 98%, VTA 64%". the scores are smoothed over about a quarter of a second, and a new emotion has to
              beat the current one by 15 percent and pass a threshold of 0.2 before the label changes, so his face does
              not flicker. there is also a slow mood on top, which follows valence and arousal with a time constant of
              about 55 seconds and biases the fast emotions. so one nice moment does not instantly fix a bad mood.
            </p>
          </div>

          {/* ───── hormones ───── */}
          <div className="space-y-6">
            <H3>4. the ten chemicals</H3>
            <p>
              this is the layer i like the most. on top of the regions, there are ten chemicals, each one a number
              between 0 and 1. each has a resting level, a place it is released from, places it flows to, and its
              own speed. every one moves towards a target with a time constant, and the target is the little
              formula in the grey box. they are not decoration, they change how every region behaves, so the same
              event feels different depending on the chemistry he is in right now.
            </p>
            {CHEMS.map((c) => (
              <Chem key={c.name} c={c} />
            ))}

            <H3>how they talk to each other</H3>
            <p>the chemicals are not independent, they cross talk, like in a real body:</p>
            <Bullets
              items={[
                ["", "cortisol suppresses dopamine, so a stressed brain feels less reward."],
                ["", "oxytocin lowers cortisol, so being with someone you trust really does calm him down."],
                ["", "high serotonin dampens dopamine a little, and high cortisol and rumination lower serotonin."],
                ["", "melatonin lowers noradrenaline, which is part of falling asleep."],
                ["", "GABA is driven by how busy the brain is and then brakes the whole brain. it is the only chemical whose job is to push back on everything."],
                ["", "dopamine gates plasticity, so reward literally decides which connections get stronger."],
              ]}
            />
            <p>
              and the speeds matter. noradrenaline and dopamine move in about a second or less, so a startle is
              sharp and short. serotonin, oxytocin and endorphin take several seconds. cortisol takes about 18
              seconds both to build and to fade, which is why stress lingers and why he does not bounce back
              immediately after being scolded.
            </p>

            <H3>how chemistry becomes behaviour</H3>
            <p>
              the last step is the link between the emotional brain and the thinking brain. every chemical is read
              back and used in two places. first it moves the mood baseline that his mood drifts towards:
            </p>
            <Eq>{`chemistry term = 0.35·(serotonin − 0.4) + 0.3·(oxytocin − 0.1) + 0.25·(endorphin − 0.1)
               + 0.3·(dopamine − 0.1) − 0.5·(cortisol − 0.1)

mood baseline = 0.15 − 0.4·max(0, social − 0.6) − 0.3·max(0, boredom − 0.7) + chemistry term`}</Eq>
            <p>
              second, each chemical adds a named part called "hormones" to the score of the actions:
            </p>
            <Rows
              rows={[
                ["play", "+0.8·dopamine − 0.5·cortisol"],
                ["wander", "+0.6·dopamine − 0.6·cortisol"],
                ["dance", "+0.6·dopamine − 0.8·cortisol"],
                ["look around", "+0.5·acetylcholine"],
                ["watch, call out", "+0.6·oxytocin"],
                ["rest", "+0.8·melatonin + 0.7·cortisol"],
              ]}
            />
            <p>
              this is the link between hormones and behaviour in vision. it is why he gets lonely and a little sad
              if you leave him alone for a few minutes (the social and boredom terms pass their limits and lower the
              baseline), why he is more likely to dance after you praise him, and why he wants to rest after a
              scary event. there are three places where chemistry reaches behaviour: in the regions (cortisol
              raises the amygdala), in the decision scores (the table above), and in learning (dopamine gates
              plasticity).
            </p>
          </div>

          {/* ───── learning ───── */}
          <div className="space-y-6">
            <H3>5. how the emotional brain learns</H3>
            <Bullets
              items={[
                ["reward prediction error", "after an outcome he compares what he got with what he expected: RPE = outcome − expected value, and the expectation follows the outcomes with a rate of 0.15. positive means better than expected, which raises dopamine and strengthens whatever he just did. the RPE itself fades with a time constant of 2.5 seconds."],
                ["learned action values", "each instinct action has a value between −1 and 1. on each outcome, value += 0.08 · RPE · eligibility. the action that was running gets eligibility 1, which decays over about 3 seconds so delayed rewards still credit it, and similar actions get a faint 0.15 so it generalises a little."],
                ["plastic region to action gains", "even how strongly a region pushes towards an action changes with experience: gain += 0.04 · RPE · eligibility, kept between 0.25 and 2.5. so he can slowly learn that his reward circuit should matter more for approaching, say."],
                ["hebbian plasticity on connections", "regions that fire together wire together: the change in a weight is the product of the two activities times (0.6 + 1.8 · dopamine), with a mild weakening when dopamine is low. there is also a pull back towards the anatomical weight, weights stay within a bounded range, and the inhibitory brakes are not changed. so reward decides what gets strengthened, but nothing can drift without limit."],
                ["predictive processing", "a small generative model keeps a belief about what the next input will look like (13 features: valence, arousal, threat, reward, social, novelty, disgust, pain, loss, anger, face, familiarity, intensity). its prediction is biased by chemistry: high dopamine expects reward, high cortisol or noradrenaline expects threat, oxytocin expects social contact. it measures the prediction error against what really came, updates the belief with a learning rate that acetylcholine controls, and tracks how uncertain it is. more uncertainty means more 'epistemic value', which pushes him toward investigating and observing. that is his curiosity: reduce what i do not know. it is active inference flavoured, not full free energy minimisation."],
              ]}
            />
            <p>everything durable (values, gains, changed weights, expectations) is saved in the browser and restored on reload.</p>
          </div>

          {/* ───── instinct ───── */}
          <div className="space-y-6">
            <H3>6. instinct: the first reaction</H3>
            <p>
              before he thinks, he reacts. the emotional brain picks one of ten instincts: observe, approach,
              greet, investigate, flee, freeze, confront, withdraw, reject or recoil. each one collects evidence
              from the regions that support it. approach listens to the accumbens, value area and VTA, scaled down
              by fear. flee listens to fear. confront listens to anger, withdraw to sadness, reject to disgust and
              recoil to pain. freeze listens to the amygdala and PAG, boosted by a fresh startle.
            </p>
            <Eq>{`dx = −1.2·x + 2.2·input − 0.9·(sum of the other options) + noise
input = region evidence + 0.55·learned value + 0.55·epistemic value`}</Eq>
            <p>
              it is a race. the evidence builds with a leak, the options inhibit each other (lateral inhibition),
              and noise is added, more noise under conflict. the first one to cross a dynamic threshold and lead
              by a margin wins. the threshold is 0.5, lowered by noradrenaline and raised when two options are close.
              so when he is torn he hesitates, holding for 1.2 up to about 2.6 seconds before committing, exactly
              like a person. if the winner's evidence fades it falls back to observe. the result is an instinct
              with a confidence and a reaction time in milliseconds, and the thinking brain uses it.
            </p>
          </div>

          {/* ───── thinking brain ───── */}
          <div className="space-y-6">
            <H3>7. the thinking brain</H3>
            <p>
              the second brain decides what vision actually does. it keeps a state: three needs (curiosity, social,
              boredom, each 0 to 1) that rise by themselves, a mood (valence, minus 1 to 1), arousal, fatigue,
              battery and pain. the needs drift every second:
            </p>
            <Eq>{`curiosity += 0.008 · dt      (more after a surprise)
social    += 0.005 · dt      (times 0.2 if you spoke in the last 30 s)
boredom   += 0.006 · dt
mood moves toward the chemistry baseline at a rate of min(1, 0.03 · dt)`}</Eq>
            <p>
              so he gets restless when nothing happens and lonely when nobody is around. the mood label is then
              picked from the strongest condition: asleep, sleepy, sulking, the emotional brain's emotion if it is
              strong enough (intensity over 0.45), startled, attentive, lonely, bored, curious, content or calm.
            </p>
            <p>
              about once a second he ticks: drift the needs, consolidate memory every 15 ticks, advance the body
              clock, run the planner, maybe reflect, run life events (weather, battery). then safety checks: at
              the edge of the arena he goes home, with low battery he goes to the charger. then comes a decision
              gap that grows with fatigue and with conflict in the neural race (human hesitation), and if nobody
              is talking, he chooses an action and runs it.
            </p>
            <p>
              he scores nine actions: wander, look around, dance, rest, call out, murmur, go home, play and watch.
              each score starts from a base formula and then named parts are added one after another:
            </p>
            <Rows
              rows={[
                ["base feelings", "wander = 0.7·curiosity + 0.2·boredom, minus 0.35 if someone is there. dance = 0.3·mood + 0.7·boredom + 0.15·arousal − 0.35. rest = 0.1 + 0.6·max(0, arousal − 0.5), more if sad. call out = 1.1·max(0, social − 0.45), blocked if someone is there. go home is 5, but only at the edge of the arena."],
                ["hormones", "the table from the chemicals section."],
                ["active goals", "explore, social, play, rest, investigate and avoid, with shielding of competing actions."],
                ["mood", "sad or afraid pushes rest and look around up and dance, play and call out down. happy or excited does the reverse."],
                ["tiredness", "rest +0.9·fatigue, active actions −0.55·fatigue."],
                ["self image, habit", "what he thinks he is like, and time of day habits."],
                ["weather, battery, pain", "rest +1.2 when the battery is low, and so on."],
                ["reading the person", "a small theory of mind model: how friendly, how attentive, how much they trust him, what they probably want (chat, play or be alone) and how patient they are."],
                ["instinct", "the emotional brain's vote: approach and greet favour watch, call out and play. investigate favours look around, wander and play. flee, freeze and withdraw favour rest and look around and take away from dance, play and call out. the boost is 0.55 times the instinct confidence."],
                ["what worked before", "0.18·actionValue + 0.28·ctxValue for this exact mood, company and action."],
                ["recent memories", "episodes with that action type nudge it."],
                ["variety", "a favourite action +0.12, an action just repeated −0.55, the one before it −0.28, and wandering or calling out is suppressed when someone is there."],
                ["body and personality", "sleepiness, the big five trait bias, sulking."],
              ]}
            />
            <p>
              then a softmax turns the scores into probabilities: p is proportional to exp((score − best score) / T),
              where T is a temperature between 0.06 and 0.32. low T is reliable, high T is adventurous, that is the
              explore versus exploit trade off. the best option wins most of the time, but sometimes he does
              something a bit surprising, which is what makes him feel alive instead of scripted. once he picks
              something he commits to it for 4 to 12 seconds so he does not twitch between ideas. before the
              scoring, an active multi step plan or a still confident commitment can decide instead, and the panel
              tells you which one decided.
            </p>
            <p>
              and it is not a black box. the "why he did that" panel shows the top 5 options with their
              probabilities, every named part of the winner's score, the gap to the runner up, how long the decision
              took, and who worded the speech. he can also explain himself in words: ask "why did you do that?" and
              he answers from those score parts.
            </p>
            <p>
              after each action he checks how it went. the reward is the change in his mood plus half of how much
              his three needs went down (satisfying a need is rewarding):
            </p>
            <Eq>{`reward = (mood after − mood before) + 0.5 · (needs before − needs after)
actionValue[a]      += 0.2 · (reward − actionValue[a])
ctxValue[mood,company,a] += 0.3 · (reward − ctxValue)         (both clamped to −1..1)`}</Eq>
            <p>
              he also stores the moment as a memory episode, drifts his personality a little, updates which toys he
              likes, records a shared fun moment with the person, and passes the reward down to the emotional brain
              so both levels learn from the same result.
            </p>
            <p>
              an optional ai "cortex" can word his speech, but it never chooses what he does. the local mind picks
              the action first, and the ai only phrases it. with no api key at all, he still works.
            </p>
          </div>

          {/* ───── examples ───── */}
          <div className="space-y-6">
            <H3>three full examples</H3>
            <p><b>you say "good boy".</b></p>
            <Bullets
              items={[
                ["1", "the words are heard and appraised: reward 0.8, social 0.9. the sound goes in through MGN, A1 and Wernicke."],
                ["2", "reward drives the VTA, accumbens and value area, social drives the MPFC and TPJ."],
                ["3", "the reward prediction error is positive, so dopamine goes up. oxytocin rises because it is social contact."],
                ["4", "the emotion reads out as happy, with the reason 'because accumbens and VTA'."],
                ["5", "the chemistry term lifts his mood baseline, the hormones part rises for play and dance, and the instinct says approach or greet."],
                ["6", "so he is more likely to dance, play or watch you. if he does, the reward is positive, the action's value goes up, his sociable and bold traits drift up a little, a fun moment with you is stored, and next time that choice is a bit more likely."],
              ]}
            />
            <p><b>a loud noise.</b></p>
            <p>
              threat 0.75 drives the amygdala, PAG, hypothalamus and locus coeruleus, plus a startle burst.
              adrenaline rises fast and cortisol rises slowly. the emotion reads out as fearful, the race picks flee
              or freeze, the instinct part pushes dance and play down and rest and look around up, and the cortisol
              term takes 0.8 times cortisol away from dance. if the noise repeats, it habituates and feels less
              new. cortisol fades over tens of seconds, so his mood recovers gradually, not instantly.
            </p>
            <p><b>left alone for five minutes.</b></p>
            <p>
              social and boredom pass 0.6 and 0.7, so the baseline mood falls and the label becomes lonely or bored.
              he murmurs things like "is anyone there?", and the planner proposes "find some company" (call out,
              look around, call out) or "play with the toy". if you come back, "someone arrived" fires (reward 0.55,
              social 0.8), oxytocin and dopamine go up, and the social need is satisfied, which is itself rewarding.
            </p>

            <H3>how fast his needs grow, in seconds</H3>
            <p>
              the three needs are not magic numbers, they are three slow ramps, and once you know the rates you can
              predict how he will feel. every second that passes, with nothing happening:
            </p>
            <Eq>{`curiosity += 0.008 + 0.02·surprise      (surprise = min(0.35, 0.5·|RPE|))
social    += 0.005 · (0.2 if you talked to him in the last 30 s, else 1)
boredom   += 0.006
all three × 0.12 while he is asleep, then clamped to 0..1`}</Eq>
            <p>
              so, from empty, curiosity fills in 1 / 0.008 = <b>125 seconds</b>, boredom in 1 / 0.006 ={" "}
              <b>about 167 seconds</b> and social in 1 / 0.005 = <b>200 seconds</b>. ignore him for a bit over three
              minutes and all three are full, which is exactly when he starts wandering, then dancing, then calling
              out for you. if you keep talking to him, social grows five times slower (0.001 a second), so it takes
              1000 seconds to fill, and he does not get lonely. while he sleeps everything grows at 12 percent speed,
              so the same 125 seconds of curiosity takes over 17 minutes.
            </p>
            <p>
              a surprise makes curiosity grow faster. if the world just contradicted him with |RPE| = 0.6, then
              surprise = min(0.35, 0.3) = 0.3 and curiosity grows at 0.008 + 0.02 · 0.3 = 0.014 a second. that is
              75 percent faster, for as long as the surprise lasts.
            </p>

            <H3>how fast his mood moves</H3>
            <p>
              mood does not jump to a new value, it slides towards a target a fraction at a time. every tick of dt
              seconds:
            </p>
            <Eq>{`k = min(1, 0.03 · dt)
valence += (target − valence) · k
arousal += (target_a − arousal) · min(1, 0.08 · dt)
target_a = 0.25 + chemistry_a − 0.2·sleepiness
chemistry_a = 0.4·(noradrenaline − 0.1) + 0.3·(adrenaline − 0.05) − 0.3·(melatonin − 0.1)`}</Eq>
            <p>
              with a rate of 0.03 a second, valence closes 63 percent of the gap in about 33 seconds, and half of
              it in about 23 seconds. arousal is faster, with a rate of 0.08, so half the gap closes in about 9
              seconds. that is why he can be startled and calm again in under half a minute but a bad mood takes
              minutes to lift. in human mode there is also a carried over mood that fades by 0.3 percent a second (so
              by half after roughly 4 minutes), which is the "still a bit upset about earlier" effect.
            </p>
            <p>a worked example with two very different brains:</p>
            <Eq>{`happy:   serotonin 0.55, oxytocin 0.30, endorphin 0.10, dopamine 0.35, cortisol 0.10
         chemistry term = 0.35·0.15 + 0.3·0.20 + 0.25·0 + 0.3·0.25 − 0.5·0
                        = 0.0525 + 0.06 + 0 + 0.075 − 0 = 0.1875
         baseline = 0.15 + 0.1875 = +0.34   (a good mood)

stressed: serotonin 0.30, oxytocin 0.10, endorphin 0.10, dopamine 0.05, cortisol 0.60,
          and social is at 0.8 (lonely)
         chemistry term = 0.35·(−0.1) + 0 + 0 + 0.3·(−0.05) − 0.5·0.5
                        = −0.035 − 0.015 − 0.25 = −0.30
         baseline = 0.15 − 0.4·(0.8 − 0.6) − 0.30 = 0.15 − 0.08 − 0.30 = −0.23   (a low mood)`}</Eq>
            <p>
              the same body, two different baselines: +0.34 and −0.23. notice that cortisol alone is worth −0.25
              here, as much as everything good in the first brain added together. that is the reason a scolding
              takes a while to wear off.
            </p>

            <H3>a worked example of dopamine and reward</H3>
            <p>
              say the value area says "this is a boring moment", so he expects almost nothing (expected value 0.1),
              and then you praise him, which counts as an outcome of +0.7.
            </p>
            <Eq>{`RPE = outcome − expected = 0.7 − 0.1 = 0.6
dopamine target = 0.1 + 0.85·0.6 + 0.35·VTA(0.4) − 0 − 0
                = 0.1 + 0.51 + 0.14 = 0.75

action value update: value += 0.08 · RPE · eligibility = 0.08 · 0.6 · 1 = +0.048
plasticity factor:   0.6 + 1.8·dopamine = 0.6 + 1.8·0.75 = 1.95   (at rest it is 0.78)`}</Eq>
            <p>
              if you praise him again and again, the expected value climbs towards 0.7, so the RPE shrinks towards 0,
              and dopamine settles back at 0.1 + 0 + 0.14 = 0.24. the same praise that gave 0.75 now gives 0.24.
              that is "treats get boring" written as numbers. the plasticity factor tells the same story from the
              learning side: during the first praise his connections strengthen about 2.5 times as fast as at rest
              (1.95 against 0.78), and by the tenth they barely change.
            </p>

            <H3>one decision with real numbers</H3>
            <p>
              here is one moment end to end. it has been a few minutes of nobody around: curiosity 0.8, boredom
              0.5, arousal 0.3, valence 0.4, nobody present. the four base scores come straight from the formulas:
            </p>
            <Eq>{`wander      = 0.7·0.8 + 0.2·0.5                      = 0.66
look around = 0.25 + 0.3·0.8·(1 − 0.3) + 0.1·0.5       = 0.47
dance       = 0.3·0.4 + 0.7·0.5 + 0.15·0.3 − 0.35      = 0.17
rest        = 0.1 + 0.6·max(0, 0.3 − 0.5)              = 0.10`}</Eq>
            <p>
              now the extra parts add on. say dopamine is 0.25 and cortisol is 0.1, so the hormone terms are
              dop = 0.15 and cor = 0.0. wander gets +0.6·0.15 = +0.09, dance gets +0.09 and look around, if
              acetylcholine is 0.25, gets +0.05. fatigue is 0.2, which takes 0.55·0.2 = 0.11 off wander and dance
              and adds 0.9·0.2 = 0.18 to rest. the totals are about:
            </p>
            <Eq>{`wander      0.66 + 0.09 − 0.11 = 0.64
look around 0.47 + 0.05        = 0.52
dance       0.17 + 0.09 − 0.11 = 0.15
rest        0.10 + 0.18        = 0.28`}</Eq>
            <p>
              he does not just take the biggest. the gap between the top two is 0.64 − 0.52 = 0.12, which is under
              0.25, so the temperature is multiplied by 1.15 (a close call makes him a little more random). with a
              base temperature of 0.2 that gives T = 0.23, and the probabilities come from a softmax:
            </p>
            <Eq>{`p(a) = exp((u_a − u_max) / T) / sum of the same over all actions
T = 0.23:  wander 53%   look around 31%   rest 11%   dance 5%`}</Eq>
            <p>
              so wandering is likely but not certain, and about one time in three he just looks around, which is what
              a person with nothing to do does. and if one option clearly wins, say by 0.5, the temperature is
              multiplied by 0.85 instead and drops towards 0.06 at the minimum, so the same maths makes him decisive:
              with T = 0.1 the same scores would give wander about 94 percent.
            </p>
            <p>
              then he commits. the time he sticks with the choice is{" "}
              <code>4000 + min(8000, 6000·u)</code> ms, using the winner's score u. with u = 0.64 that is 7.8
              seconds, and a very strong 1.5 or more gets the maximum of 12 seconds. the confidence of the intention
              is u / 2 clamped to 0..1, so 0.32 here. this is why he does not twitch between actions every
              second.
            </p>

            <H3>how tired and torn he is, and what that does to his speed</H3>
            <p>
              between decisions there is a gap, and the gap stretches when he is tired or conflicted:
            </p>
            <Eq>{`hesitate = 1 + 0.8·fatigue + 0.7·(1 − instinct confidence)
gap = base gap · hesitate / time scale
(base gap is capped at 2.5 s while a person is present)`}</Eq>
            <Rows
              rows={[
                ["fresh and sure", "fatigue 0, confidence 1 → hesitate = 1.0. he decides as fast as he can."],
                ["half tired, half unsure", "fatigue 0.5, confidence 0.5 → 1 + 0.4 + 0.35 = 1.75. he takes 75 percent longer."],
                ["exhausted and torn", "fatigue 0.9, confidence 0.2 → 1 + 0.72 + 0.56 = 2.28. more than twice as slow."],
              ]}
            />
            <p>
              fatigue is a bucket you fill by doing things and drain by resting. an action adds to it: dance and play
              add 0.12, wander adds 0.06, and a plain idle step takes 0.01 off. resting takes 0.22 off in one go.
              doing nothing drains it at 0.004 a second, which is 250 seconds for a full bucket, and asleep it drains
              at 0.012 a second, only 83 seconds. above 0.55 he adopts a "rest" goal on his own, with priority{" "}
              <code>0.45 + 0.4·fatigue</code>. at fatigue 0.8 that is 0.77, and a goal adds <code>0.7·priority</code>
              to the score of the actions it likes. so rest gets another +0.54, and because the priority is above
              0.6 the goal also shields itself by taking 0.45·0.77 = 0.35 off dance, play and wander. that is a
              tired person refusing to go out.
            </p>

            <H3>the thinking brain's score, every term with its numbers</H3>
            <p>
              the table above names the parts. here are the numbers inside them that i had not written down yet.
            </p>

            <p><b>reading the person (the theory of mind model).</b> he keeps ten numbers about whoever is in front of
              him: friendliness (−1 to 1, starts 0.2), attention (0.3), predictability (0.5), trust (0.4), mood (0.1),
              patience (0.7), what he thinks they want (unknown, chat, play or alone), the last act, the last 24 acts
              and up to 20 shared facts. every act moves them by a fixed amount:</p>
            <Rows
              rows={[
                ["praise", "friendliness +0.12, trust +0.08, attention +0.15, mood +0.15, patience +0.05, they want 'chat', and he adopts a social goal at 0.55 for 10 s"],
                ["scold", "friendliness −0.18, trust −0.10, attention +0.10, mood −0.20, patience −0.08, they want 'alone'. he withdraws: a rest goal at 0.7 for 12 s, and his current intention is dropped."],
                ["talk", "attention +0.20, predictability +0.03, mood +0.04, patience +0.02, they want 'chat'"],
                ["ignore", "attention −0.08, friendliness −0.03, patience −0.06, they want 'alone'"],
                ["gift", "friendliness +0.10, trust +0.06, mood +0.12, they want 'play'"],
                ["presence", "attention +0.04, and 'alone' is reset to 'unknown'"],
              ]}
            />
            <Eq>{`predictability = 0.2 + 0.15 · (6 − distinct acts among the last 6)
 (the same act 6 times → 0.95,  three kinds → 0.65,  six different → 0.20)

watch, call out :  + 0.35·friendliness + 0.25·attention + 0.20·(trust − 0.4)
                   + 0.25 if they want 'chat',  − 0.35 if 'alone',  − 0.20 if patience under 0.35
dance, play     :  + 0.20·friendliness (or −0.25·|friendliness| if negative)
                   + 0.35 if they want 'play',  − 0.25 if their mood is under −0.2
rest            :  + 0.20 if they want 'alone' or patience is under 0.3
murmur          :  + 0.12 if he knows a shared fact and attention is over 0.4`}</Eq>
            <p>
              what this does to a real decision. say he is with a friendly person (friendliness 0.5, attention 0.6,
              trust 0.6, wants 'chat'), and the base score of watch is 0.77. the model adds 0.175 + 0.15 + 0.04 + 0.25
              = 0.615, so watch is at 1.385. now the person scolds him once. friendliness falls to 0.32, trust to 0.5,
              attention rises to 0.7, and the inferred goal flips to 'alone'. the bonus becomes 0.112 + 0.175 + 0.02
              − 0.35 = −0.043. one scold swings watch by 0.66, and rest also gains +0.2. that is why he looks away
              and goes quiet for a while.
            </p>

            <p><b>goals.</b> a goal has a priority, an expiry and a kind. he can hold at most three at a time (the
              three highest priorities), and adopting one replaces any older goal of the same kind. a goal adds{" "}
              <code>0.7·priority</code> to the actions it likes, and above priority 0.6 it also takes points off
              the actions that compete with it. they appear on their own:</p>
            <Rows
              rows={[
                ["explore", "when curiosity is over 0.7. priority 0.5 + 0.35·curiosity, lasts 28 s. likes wander and look around."],
                ["social (lonely)", "when social is over 0.65 and nobody is there. priority 0.5 + 0.35·social, plus 0.15 if his mood is low. 22 s. likes call out, watch, murmur."],
                ["social (company)", "when someone is there, his mood is over 0.15 and they are a little friendly. priority 0.4, 12 s."],
                ["play", "when boredom is over 0.65 and a toy is free. priority 0.48 + 0.35·boredom, 20 s."],
                ["rest or avoid", "when cortisol is over 0.42, or he is afraid or sad, or his mood is under −0.35. priority 0.55 + 0.2·cortisol, 16 s. 'avoid' if he is afraid, otherwise 'rest'."],
                ["investigate", "when the emotional brain's instinct is investigate with confidence over 0.5. priority 0.48 + 0.35·confidence, 14 s."],
                ["rest (tired)", "fatigue over 0.55. priority 0.45 + 0.4·fatigue, 15 s."],
              ]}
            />
            <p>
              for example curiosity at 0.9 gives an explore goal at priority 0.5 + 0.315 = 0.815, so wander and look
              around each get +0.57 for the next 28 seconds, and since 0.815 is over 0.6 the suppression also bites.
            </p>

            <p><b>the exploration temperature moves too.</b> the softmax temperature is not fixed. it has a target
              that depends on how unsure the world is, and the real value follows it slowly:</p>
            <Eq>{`target = 0.12 + 0.12·surprise + 0.08·(1 − predictability) + 0.06·(1 − trust)
temperature += (target − temperature) · min(1, 0.04 · dt)       (about a 25 s time constant)
and then × 1.15 if the top two scores are within 0.25, × 0.85 if not, kept in 0.06..0.32

calm and trusted:   surprise 0,   predictability 0.95, trust 0.8  → 0.12 + 0 + 0.004 + 0.012 = 0.136
chaotic stranger:   surprise 0.3, predictability 0.2,  trust 0.2  → 0.12 + 0.036 + 0.064 + 0.048 = 0.268`}</Eq>
            <p>
              so with someone he knows and who behaves predictably he settles down and exploits what works, and
              around an unpredictable stranger he gets almost twice as random and tries more things. that is the
              meta learning in one line.
            </p>

            <p><b>the remaining terms, in the order they are applied.</b></p>
            <Rows
              rows={[
                ["instinct coupling", "boost = 0.55 × the instinct's confidence. approach or greet: watch, call out and play get +boost. investigate: look around, wander, play get +boost. flee, freeze or withdraw: rest and look around get +boost and dance, play and call out get −boost. confront: dance and call out +0.6·boost. at confidence 0.8, boost = 0.44."],
                ["what worked before", "0.18·actionValue + 0.28·ctxValue. actionValue and ctxValue each move 20 percent and 30 percent of the way to every new reward, and stay between −1 and 1."],
                ["recent memories", "he looks at his last 12 episodes with salience 0.3 or more. a good play or dance memory adds 0.08·valence·salience to play and dance, seeing a person adds 0.06·positive valence·salience to watch, a discovery adds 0.05·salience to wander, and a bad memory (valence under −0.2) adds 0.04·salience to rest. the total is kept between −0.35 and +0.45."],
                ["favourite", "his best valued action so far gets +0.12"],
                ["anti repetition", "the action he just did −0.55, the one before −0.28, and any other in his last three −0.12"],
                ["company", "with a person there, wander −0.4 and call out −0.5 (he already has company)"],
                ["toys", "when bored (over 0.4), play, wander and look around get 0.15·(the best toy he likes) + 0.008 per toy"],
                ["body", "dance, play and wander −0.8·(1 − energy). rest +1.3·max(0, sleepiness − 0.4). at sleepiness 0.83 (energy 0.40) that is −0.48 and +0.56."],
                ["sulking", "with grudge g: watch and call out −0.9·g, dance −0.5·g, rest and look around +0.4·g. at g = 0.476, that is −0.43, −0.24 and +0.19."],
                ["pain", "when pain is over 0.2: rest +0.5·pain, dance and play −0.5·pain"],
                ["talking over", "murmur is impossible (minus infinity) if the person spoke in the last 2.5 seconds"],
              ]}
            />

            <p><b>how he sees himself.</b> there is also a small self model with two numbers that drift with what he
              does. playfulness starts at 0.5, +0.02 for each dance or play, kept between 0.2 and 0.85. social battery
              starts at 0.7, −0.03 for each watch or call out, +0.05 for each rest, kept between 0.15 and 0.95. they
              feed back into the score by <code>0.12·(playfulness − 0.5)</code> on dance and play (and half of the
              opposite on rest) and <code>0.15·(social battery − 0.5)</code> on watch and call out. so a robot that
              has been social all day gets a little less keen on company until he has rested, which is the
              introvert's afternoon.</p>

            <p><b>the quiet feelings.</b> strong needs are felt by the emotional brain too, not just by the score.
              every 6 seconds at most, if social is over 0.78 and nobody is there he feels lonely, if boredom is over
              0.78 he feels bored, if curiosity is over 0.72 he feels wondering, and just having someone around gives
              a small reward feeling (the oxytocin one). that is how a need he has ignored for a while starts to
              change his chemistry, not only his choices.</p>

            <p><b>when the ai words things.</b> if the optional cortex is used, it can nudge his mood by at most 0.3
              in either direction, it can ask him to think again in 3 to 30 seconds (the default is 8), and it sees
              his state, his pose, the last 8 lines of the conversation, the last 5 lessons and the 6 latest
              journal entries. it still cannot choose the action.</p>

            <H3>how an event reaches the emotional brain</H3>
            <p>
              the emotional brain never receives "praise" or "scold" as a label. every event is turned into a
              small bundle of numbers called an appraisal: how rewarding, how threatening, how much loss, anger,
              novelty, social meaning, face, pain, plus a strength (0 to 1) and a duration in seconds. the regions
              then react to those numbers, and the emotion is read out afterwards. this is the table that turns
              things that happen into numbers, straight from the code:
            </p>
            <Rows
              rows={[
                ["praise", "reward 0.8, social 0.9, novelty 0.25. strength 0.7, lasts 5 s, counts as language."],
                ["scold", "threat 0.3, loss 0.5, anger 0.15, social 0.85, novelty 0.3. strength 0.8, 3 s."],
                ["loud noise", "threat 0.75, novelty 0.85 (fades with repetition). strength 0.95, only 1.2 s. sharp and short."],
                ["poke", "novelty 0.55, threat 0.12, social 0.5, pain 0.1. strength 0.6, 1 s."],
                ["a gift or new toy", "reward 0.85, novelty 0.7. strength 0.8, 3 s."],
                ["sudden movement", "novelty 0.55, threat 0.15. strength 0.55, 1.5 s."],
                ["lights go out", "threat 0.2, novelty 0.5. strength 0.5, 2 s."],
                ["lights come on", "novelty 0.45, reward 0.1. strength 0.5, 2 s."],
                ["being ignored", "loss 0.55. strength 0.5, 4 s."],
                ["picked up and moved", "threat 0.45, novelty 0.9. strength 0.9, 2 s. one of only two things that can wake him fully."],
                ["someone arrives", "social 0.8, face 0.8, reward 0.55, novelty 0.6. strength 0.75, 4 s."],
                ["someone leaves", "loss 0.3, social 0.3. strength 0.4, 3 s."],
                ["playing, dancing, finding somewhere new", "reward 0.65 (play), 0.55 (dance), or novelty 0.7 and reward 0.4 (discovery). strength 0.5 to 0.6."],
                ["saying no, helping", "refusing gives a little loss 0.15 and anger 0.1. helping gives reward 0.25 and social 0.4. both weak, 0.3."],
                ["a need that grew strong", "loneliness is loss 0.4, boredom loss 0.18, wondering novelty 0.45, company social 0.6 and reward 0.3. these are called by the mind itself, at most every 6 s."],
              ]}
            />
            <p>
              things he is shown or sees depend on what they are. a toy-like animal (cat, dog, bird, teddy bear,
              horse, sheep, cow) is a reward of 0.8, food (pizza, cake, apple, banana, donut, sandwich, orange, cookie,
              hot dog, broccoli, carrot) is 0.6, anything he is just shown and does not know is 0.35, and a plain
              sighting only 0.1. a knife, scissors or fork is a threat of 0.55. being shown something is stronger than
              merely seeing it (novelty 0.8 against 0.35, strength 0.7 against 0.4).
            </p>
            <p>
              the part i like is familiarity. the same event again is less novel, so he gets used to things:
            </p>
            <Eq>{`novelty = base · max(0.3, 1 − 0.18·(n − 1))        familiarity = min(0.8, 0.2·(n − 1))
(n is how many times this exact event has happened)

a loud noise, base novelty 0.85:
  1st: 0.85    2nd: 0.70    3rd: 0.54    4th: 0.39    5th and later: 0.26`}</Eq>
            <p>
              so the first loud noise makes him jump and the fifth barely does, which is the same habituation you
              see in people and animals. the learned weights between regions are saved every 25 seconds of simulated
              time, and the chemicals above their resting level by more than 0.1 are shown (the top three,
              strongest first, with what each one does).
            </p>

            <H3>how he reads words: the affect lexicon</H3>
            <p>
              when you say something, it has to become an appraisal too. with no language model, this is done by a
              hand written dictionary of English words in nine groups: reward, threat, loss, anger, disgust, pain,
              social, novelty and face. a few hundred words in all, such as "love, cake, puppy" for reward, "snake,
              fire, scared" for threat, and "idiot, hate, liar" for anger. a star on a word marks it as strong. a
              plain word counts 0.65 and a strong one counts 1.0. then a handful of rules make it more like reading
              and less like counting:
            </p>
            <Rows
              rows={[
                ["whole phrases first", "phrases like 'i love you' (reward 1, social 0.8), 'good job', 'shut up' (anger 1), 'go away', 'i hate you', 'watch out' (threat 0.9) and 'all alone' (loss 0.8) are found and removed before single words are looked at, so they are not counted twice."],
                ["word endings", "if a word is not found he tries it without -ing, -ed, -es, -s or -ly, so 'laughing' and 'laughs' both find 'laugh'."],
                ["negation", "the 3 words before a word are checked for not, no, never, don't, can't, without, nobody and so on. a negated good word becomes half as much loss ('not happy'). a negated bad word becomes a third as much reward ('not scary'). anything else negated is reduced to 15 percent."],
                ["intensity words", "'very, so, really, extremely, totally...' multiply by 1.4. 'slightly, a bit, kinda, barely' multiply by 0.6."],
                ["shouting", "a word in capital letters (3 or more) gets ×1.25."],
                ["exclamation marks", "each one adds 10 percent, up to 3."],
              ]}
            />
            <Eq>{`channel = (1 − exp(−1.5 · sum)) · (1 + 0.1·exclamation marks)     (a soft ceiling at 1)
valence = reward − max(threat, 0.9·disgust, loss, 0.9·anger, 0.9·pain) + 0.1·social (if reward > 0)
arousal = max(threat, anger, 0.8·reward, 0.7·novelty, pain, 0.6·disgust, 0.35·loss)
strength of the whole sentence = 0.35 + 0.65 · (the strongest channel)`}</Eq>
            <p>and three sentences worked through:</p>
            <Rows
              rows={[
                ["'you are very stupid'", "'stupid' is a strong anger word, 'very' makes it 1 × 1.4 = 1.4 → anger = 1 − exp(−2.1) = 0.88. 'you' adds a little social (0.495) and anger lifts social by 0.35 × 0.88, so social = 0.80. valence = 0 − 0.9 × 0.88 = −0.79, arousal = 0.88, strength 0.92. a sharp hit."],
                ["'i love you!'", "the phrase gives reward 1 and social 0.8, one exclamation mark makes it ×1.1 → reward 0.855, social 0.92. valence = 0.855 + 0.1 × 0.92 = +0.95, arousal 0.68 (0.8 × reward). strength 0.91. warm, but calm and not startled."],
                ["'i am not happy'", "'happy' is a plain reward word (0.65), negated → loss 0.65 × 0.5 = 0.325 → loss = 0.39. valence −0.39, arousal 0.14, strength 0.60. a quiet, sad feeling, not an attack. the terminal shows he matched 'not happy'."],
              ]}
            />
            <p>
              it is a lexicon and a few rules, not understanding. sarcasm will fool it. it is what makes him react
              sensibly when no model is configured, and with one, the model only words the reply, so the feeling
              underneath is still this.
            </p>
          {/* ───── the brain, maths in depth ───── */}
          <div className="space-y-6">
            <H3>maths 0a. start here: how to read the formulas (no maths background needed)</H3>
            <p>
              if you have never liked maths, this is the part for you. every formula in this blog is built from a
              very small toolbox, about a dozen symbols, and none of them is hard once you have seen it used on real
              numbers once. read this section first and then the later ones will feel like sentences. everything
              below uses the same kind of numbers the brain uses: small decimals between 0 and 1.
            </p>
            <Rows
              rows={[
                ["·  (a dot)", "just means times. 0.8 · 0.5 = 0.4. i use a dot instead of a star so it is not confused with the letter x."],
                ["/  (a slash)", "divide. 6 / 3 = 2, and 1 / 4 = 0.25."],
                ["+  and −", "add and take away. a minus in front of a whole bracket, like −(a + b), takes away both."],
                ["=", "'is'. the left side is a name, the right side says how to calculate it."],
                ["+=", "'add to itself'. activity += 0.1 means: take the current activity, add 0.1 and store it back. it is how a number changes over time in a program."],
                ["( ) brackets", "do the inside first. 2 · (3 + 4) = 14, not 10."],
                ["Σ  (sigma, a big E)", "'add up all of them'. Σ w · a means: for every connection, multiply its weight by the activity of the region it comes from, and add all those results together. if there are three connections with w · a of 0.3, 0.1 and 0.2, then the Σ is 0.6."],
                ["x²  and  sqrt(x)", "squared is a number times itself: 0.5² = 0.25. sqrt is the opposite, the number that gives x when multiplied by itself: sqrt(0.25) = 0.5, sqrt(4) = 2, sqrt(16) = 4."],
                ["|x|  (bars)", "the size of a number, ignoring the sign. |−0.4| = 0.4. it answers 'how far apart' without caring which is bigger."],
                ["max(a, b)  and  min(a, b)", "the bigger or the smaller of the two. max(0, −0.3) = 0: it is a way to say 'only count this if it is positive'. min(1, 1.7) = 1: it is a way to say 'never go above 1'."],
                ["clamp(x, lo, hi)", "keep a number inside a box: if it is below lo it becomes lo, if above hi it becomes hi. clamp(1.4, 0, 1) = 1. clamp(−0.2, 0, 1) = 0. most things in the brain are clamped to 0..1, like a volume knob that stops at the ends."],
                ["mean (average)", "add them all up and divide by how many. the mean of 0.2, 0.4 and 0.6 is 1.2 / 3 = 0.4."],
                ["e  and  e^x", "e is a special number, 2.718. e^x means e multiplied by itself x times, and it also works for fractions and negatives. you do not need to calculate it, only to know its shape: it is 1 when x is 0, it gets very big when x is positive, and it shrinks toward 0 when x is negative. a few values are in the next table."],
                ["ln(x)", "the opposite of e^x. if e^2 = 7.39 then ln(7.39) = 2. it is used once, to work backwards from a resting level to the bias."],
                ["argmax", "'which one is the biggest', the name not the value. if the scores are happy 0.2, sad 0.5, fearful 0.3, the argmax is sad."],
                ["gauss", "a random number that is usually close to 0 and rarely far away (a bell curve). about two thirds of the time it is between −1 and +1. it is where the 'noise' comes from."],
                ["→  (an arrow)", "'goes to'. AMY → HYP 0.7 means the amygdala pushes the hypothalamus with a strength of 0.7."],
                ["a subscript like a_from", "a little word under the letter, saying which one. a_from is 'the activity of the region the connection starts at'."],
                ["dt", "a tiny slice of time, here 0.02 seconds. 'per step' for the program."],
                ["tau  (the Greek letter, written 'tau' here)", "a time constant: how slow something is, in seconds. small tau is fast, big tau is slow. maths 0b explains exactly what it means."],
              ]}
            />
            <p>the only one that surprises people is e^x, so here are its values for the numbers this blog uses:</p>
            <Eq>{`e^0     = 1.000
e^−0.5  = 0.607
e^−1    = 0.368        (one 'tau' of time has passed)
e^−2    = 0.135        (two taus)
e^−3    = 0.050        (three taus)
e^−5    = 0.007
e^1     = 2.718
e^2     = 7.389
e^3     = 20.09

so  1 − e^−1 = 0.632,   1 − e^−2 = 0.865,   1 − e^−3 = 0.950,   1 − e^−5 = 0.993`}</Eq>
            <p>
              the important part is the last line. it is the 'how much of the way have we got' numbers, and it is the
              heart of the whole model. we use it in the next section.
            </p>
          </div>

          <div className="space-y-6">
            <H3>maths 0b. the six ideas the whole brain is built from</H3>
            <p>
              every equation in the brain is one of six ideas, used over and over on different regions and chemicals.
              here they are one at a time, each with a small everyday picture and then exact numbers you can check
              with a calculator.
            </p>

            <p><b>idea 1. a region is a dial between 0 and 1.</b></p>
            <p>
              think of each region as a dimmer switch on a lamp. 0 is dark, 1 is full brightness. but a lamp in a
              brain is never fully dark, it rests at a small glow (0.03 or 0.05), which we call its rest. the number
              that matters is not the dial itself but how far it is above its rest, because that is the 'extra'
              that the rest of the brain can hear. that gap is called the lift: lift = activity − rest. if the amygdala
              rests at 0.04 and is now at 0.54 then its lift is 0.50. when the blog says ex(region) it means the lift
              rescaled to run 0 to 1: ex = (activity − rest) / (1 − rest). for the amygdala at 0.54 that is
              0.50 / 0.96 = 0.52. a region at rest has ex = 0, a region at full has ex = 1. every emotion formula
              uses ex.
            </p>

            <p><b>idea 2. chasing a target (the leaky bucket, and the meaning of tau).</b></p>
            <p>
              nothing in the brain jumps. a region always moves toward where it wants to be, a little at a time,
              like you walk towards a door: big steps when far, tiny steps when close. in the code it is one line:
            </p>
            <Eq>{`new = old + (target − old) · k          k is the fraction of the gap you close in one step`}</Eq>
            <p>take the target as 1 and start at 0, with k = 0.2 (close a fifth of the remaining gap each step):</p>
            <Eq>{`step 1:   0 + (1 − 0)     · 0.2 = 0.200
step 2:   0.2 + (1 − 0.2)    · 0.2 = 0.360
step 3:   0.36 + (1 − 0.36)   · 0.2 = 0.488
step 4:   0.488 + (1 − 0.488) · 0.2 = 0.590
step 5:   0.672        step 6:  0.738        step 7:  0.790
step 8:   0.832        step 9:  0.866        step 10: 0.893`}</Eq>
            <p>
              notice it moves fast at first (0.2 in the first step) and slowly at the end (0.027 in the tenth). that
              is exactly how a real feeling rises: a rush, then it settles. now, how big should k be? that is what tau
              decides. k = 1 − e^(−dt / tau). you have the e values above, so let us use them. a step of dt = 0.02 s:
            </p>
            <Rows
              rows={[
                ["fast region, tau 0.05 (amygdala)", "k = 1 − e^(−0.02 / 0.05) = 1 − e^−0.4 = 1 − 0.670 = 0.330. it closes a third of the gap every 20 ms and gets 95 percent of the way (3 taus) in 0.15 seconds. a flash."],
                ["medium, tau 0.08 (accumbens)", "k = 1 − e^−0.25 = 1 − 0.779 = 0.221. 95 percent after 0.24 s."],
                ["slow, tau 0.2 (sadness, raphe, PCC)", "k = 1 − e^−0.1 = 1 − 0.905 = 0.095. less than a tenth of the gap per step, 95 percent after 0.6 s. a slow swell."],
                ["very slow, tau 18 s (cortisol)", "95 percent after 54 seconds, which is why stress takes about a minute to build and several minutes to fade."],
              ]}
            />
            <p>
              so tau is simply 'the time it takes to get about two thirds (63 percent) of the way there'. after two taus
              you are 86 percent of the way, after three 95 percent. that is all it is. every region has its own tau and
              every chemical has its own, and that is what gives each part of the brain its own speed.
            </p>
            <p>
              why is the formula 1 − e^(−dt / tau) and not the simpler dt / tau? because the simple one breaks when
              you change the step size. with dt = 0.02 and tau 0.08 the simple one gives 0.25, and with two steps of
              0.01 each it would give 1 − (1 − 0.125)² = 0.234. a different answer for the same 20 ms, which means the
              brain would behave differently on a slow computer. the e version gives 0.2212 either way:
              each half step is k = 1 − e^−0.125 = 0.1175, and 1 − (1 − 0.1175)² = 0.2212. the same. that is why the
              brain feels the same on every computer.
            </p>

            <p><b>idea 3. adding up pushes (a vote with weights).</b></p>
            <p>
              a region listens to the regions that connect to it and adds up what they say, each one multiplied by
              how much it is trusted (the weight). imagine the accumbens being pushed by three regions. say the VTA
              is 0.49 above rest, the value area 0.3 and the orbitofrontal 0.2, and the weights are 0.9, 0.5 and 0.5:
            </p>
            <Eq>{`0.49 · 0.9  +  0.30 · 0.5  +  0.20 · 0.5  =  0.441 + 0.150 + 0.100  =  0.691
then times the synapse factor 0.6:   0.691 · 0.6 = 0.415    (this is the 'synapses' part of x)`}</Eq>
            <p>
              the VTA counts for the most (0.441) because it is both very active and very trusted. a region that is
              resting sends nothing, since its lift is 0. and a negative weight does the opposite: it subtracts. a
              value area at 0.5 above rest with a weight of −0.5 onto the amygdala takes 0.25 away from it, which is
              the calming brake.
            </p>

            <p><b>idea 4. squashing with the sigmoid (a door that is hard to open at first and then flies open).</b></p>
            <p>
              the total push x can be any number, and the region has to turn it into a dial setting from 0 to 1. the
              sigmoid does that. picture a heavy door. a weak push barely moves it, a push in the middle swings it
              quickly, and a huge push cannot open it more than fully. the formula is
              sigma(x) = 1 / (1 + e^(−6 · (x − 0.55))). do it by hand for x = 0.206, the number from the accumbens
              example:
            </p>
            <Eq>{`step 1:  x − 0.55        = 0.206 − 0.55   = −0.344
step 2:  times 6         = −0.344 · 6     = −2.064
step 3:  e to minus that = e^(+2.064)     = 7.88      (minus a minus is a plus)
step 4:  1 + that        = 8.88
step 5:  1 / that        = 0.113

so the region's target is 0.113.     (a weak push gives a low target)

and for a strong push x = 0.9:   (0.9 − 0.55)·6 = 2.1,  e^−2.1 = 0.122,  1/(1 + 0.122) = 0.891`}</Eq>

            <p><b>idea 5. brakes and tiredness (subtracting).</b></p>
            <p>
              things that slow a region down are simply subtracted from x before the sigmoid. there are three:
              global inhibition (the busier the whole brain, the bigger the minus), fatigue (a region that has been
              active for a while loses 0.45 times its own tiredness), and the calming regions (negative weights).
              if the average lift in the brain is 0.1 and GABA is 0.3 then every region loses
              1.6 · 0.1 · (0.6 + 1.2 · 0.3) = 1.6 · 0.1 · 0.96 = 0.154. a region held 0.8 above rest for 3 seconds has
              a fatigue of 0.8 · (1 − e^(−3 / 2.2)) = 0.8 · (1 − 0.256) = 0.595, and loses 0.45 · 0.595 = 0.27. you can
              see that fatigue is just idea 2 again: the tiredness chases the activity with a tau of 2.2 seconds.
            </p>

            <p><b>idea 6. falling back to rest (the pull home).</b></p>
            <p>
              when nothing is happening the push is zero, the target is the resting level, and idea 2 slowly pulls the
              region back there. that is why a feeling fades by itself and the brain does not need a 'turn off'
              instruction. the same pull happens for chemicals (they chase their resting target), for the weights
              (they drift back to their base) and for the slow mood (it chases the fast feeling with a 55 second tau).
              if you understood idea 2, you have understood about 80 percent of this whole model, because most lines
              of the brain's code are idea 2 applied to a different number.
            </p>
          </div>

          <div className="space-y-6">
            <H3>maths 0c. the big formulas, translated into sentences</H3>
            <p>
              now the formulas from the rest of the blog, each one said out loud, with a tiny example. use this as a
              dictionary when a later equation looks scary.
            </p>
            <Rows
              rows={[
                ["x = bias + gain · (0.6 · synapses + input) + noise − global inhibition − 0.45 · fatigue + chemicals", "'how hard is this region being pushed right now?' start from the resting push (the bias), add what the other regions and the outside world are saying (louder if he is alert, quieter if he is sleepy), add a little randomness, then take away the brakes, and add a nudge from any chemicals that care about this region. the answer is one number."],
                ["target = sigma(x)", "'turn that push into a dial setting between 0 and 1'. a push of 0.2 gives a target of 0.11, a push of 0.9 gives 0.89."],
                ["activity += (target − activity) · (1 − e^(−dt / tau))", "'move a bit of the way from where you are to where you want to be, and the bit depends on how fast this region is'. an amygdala at 0.04 with a target of 0.9 moves 0.33 of the 0.86 gap in one step, to 0.32."],
                ["ex = (activity − rest) / (1 − rest)", "'how far above resting is it, as a share of the room it has left?'. it is the number everything else listens to."],
                ["input_to_B += w · (a_A − rest_A)", "'region B hears region A in proportion to how much A is above rest, multiplied by how strongly they are wired'."],
                ["fatigue += ((a − rest) − fatigue) · (1 − e^(−dt / 2.2))", "'tiredness slowly catches up with how active you have been'. same chasing as the dial, but with a tau of 2.2 seconds."],
                ["level += (target − level) · (1 − e^(−dt / tau))   for a chemical", "same chasing again. dopamine at 0.10 with a target of 0.86 and a tau of 0.45 s closes 63 percent of the gap in 0.45 s, to 0.10 + 0.76 · 0.632 = 0.58. in the real run, dopamine was 0.58 after half a second. that is a check that the maths and the program agree."],
                ["dopamine target = 0.10 + 0.85 · max(0, rpe) + 0.35 · ex(VTA) − ...", "'dopamine is a small constant, plus a lot of it when something was better than expected, plus a bit when the reward region is busy, minus some when stress is high'. with rpe 0.7 and ex(VTA) 0.54: 0.10 + 0.595 + 0.19 = 0.89, before the stress terms."],
                ["rpe = outcome − expectedValue", "'how much better or worse was it than i thought?'. praise worth +0.7 when he expected 0 gives +0.7. the same praise when he already expects 0.4 gives only +0.3."],
                ["HAPPY = pos · (1 − 0.4 · LC)", "'happy is how much the reward circuit is active, a bit less when he is wound up'. say NACC 0.9, VMPFC 0.5, VTA 0.6, OFC 0.4: pos = 0.4·0.9 + 0.25·0.5 + 0.2·0.6 + 0.15·0.4 = 0.36 + 0.125 + 0.12 + 0.06 = 0.665. with a calm LC of 0.03, happy = 0.665 · 0.988 = 0.657 and excited = 0.665 · (0.3 + 0.027) = 0.217. happy is three times bigger, so the label is happy. (i left out the small mood terms to keep it short.)"],
                ["dx/dt = −1.2·x + 2.2·input − 0.9·others", "'each action's urge leaks away at a steady rate, is topped up by its own reason, and is held down by the urges of the others'. with an input of 0.6 and nobody competing, the urge climbs 0.50 after half a second, 0.77 after one second and reaches its ceiling of about 1.0 after two. that is how the 'building up' of a decision looks."],
                ["threshold = clamp(0.5 − 0.15·LC + 0.12·conflict, 0.3, 0.7)", "'how much urge do i need before i act? less when i am alert, more when i am torn'. with LC 1.0 and no conflict: 0.35. with LC 0.1 and heavy conflict: 0.605."],
                ["belief += rate · (observed − belief)", "'after seeing something, move my expectation toward what i saw, by a fraction'. with a rate of 0.25, a belief of 0 and an observation of 0.9 the belief becomes 0.225."],
                ["Δw = 0.012 · 0.15 · (pre · post · (0.6 + 1.8 · dopamine lift))", "'if two regions were active together and dopamine said that it mattered, strengthen the link by a small amount'. a pre of 0.6, post of 0.9 and a dopamine lift of 0.59 gives 0.0016. tiny each time, big over hundreds of times."],
              ]}
            />
            <p>
              if there is one habit that helps, it is this: whenever you meet a formula, ask 'what is the target, and
              what is it chasing from?'. almost every line is a number sliding toward a target at its own speed.
            </p>
          </div>

          <div className="space-y-6">
            <H3>maths 1. the big picture: what is actually being computed</H3>
            <p>
              this is the part that looks scary, so let me say it in plain words first. the whole emotional brain is
              one list of about 42 numbers (one per region, each between 0 and 1) and one list of 10 numbers (the
              chemicals). every 20 milliseconds the program nudges every number a little bit toward where it "wants"
              to be. that is all. there is no hidden trick, no neural network library, no training data. the
              feelings come out because the numbers push on each other in a loop, the same way a real brain's
              regions do.
            </p>
            <p>
              how this part is laid out: 0a to 0c are for anyone who finds maths scary: how to read every symbol, the six ideas everything is built from, and every big formula said as a sentence. then maths 1 to 3 build one region from nothing, 4 to 5 connect regions and add
              the brakes, 6 to 9 are the chemistry and learning, 10 to 14 are what comes out (feelings, instinct,
              prediction, sleep), 15 to 20 are the reference (order of operations, every region, every pathway, every
              chemical effect, real runs, every constant), and 21 draws it all as one picture. you can jump to any of
              them from the list on the left.
            </p>
            <p>four words you need and then everything else is just those four used again and again:</p>
            <Rows
              rows={[
                ["activity (a)", "how awake a region is right now. 0 means silent, 1 means as active as it can ever get. every region has a resting value (rest), usually 0.03 to 0.1, because even a quiet brain is never fully off."],
                ["excitation (ex)", "how far above rest a region is, rescaled so it always runs 0 to 1: ex = (a − rest) / (1 − rest). this is the number every readout uses, so a region that naturally rests at 0.1 and one that rests at 0.03 are compared fairly."],
                ["weight (w)", "how strongly one region pushes another. positive pushes it up, negative pushes it down. these are the 130 pathways."],
                ["tau", "how slow a region is, in seconds. small tau (0.04) is a reflex, big tau (0.2) is a slow mood region."],
              ]}
            />
          </div>

          <div className="space-y-6">
            <H3>maths 2. the sigmoid and the resting level</H3>
            <p>
              a region does not respond in a straight line. a tiny push does almost nothing, a medium push does a
              lot, and a huge push does not do much more than a medium one (it is already near its maximum). that
              s shaped curve is the sigmoid and it is what keeps every region between 0 and 1 without ever needing
              a hard clamp.
            </p>
            <Eq>{`sigma(x) = 1 / (1 + e^(−6 · (x − 0.55)))

x = 0.25  →  sigma = 0.14     (a weak push, barely wakes it up)
x = 0.45  →  sigma = 0.35
x = 0.55  →  sigma = 0.50     (the middle of the curve: the steepest part)
x = 0.65  →  sigma = 0.65
x = 0.85  →  sigma = 0.86
x = 1.10  →  sigma = 0.96     (almost full, more push barely helps)`}</Eq>
            <p>
              the 0.55 is where the curve is half way and the 6 is how steep it is. the bias of each region is
              chosen so that with no input at all the region sits exactly at its rest value. that is done by running
              the sigmoid backwards: bias = 0.55 + ln(rest / (1 − rest)) / 6. for the nucleus accumbens (rest 0.03)
              that gives −0.029, so with zero input x = −0.029 and sigma(−0.029) = 0.03, which is exactly its rest.
              the amygdala (rest 0.04) gets a bias of +0.02 and the PCC (rest 0.1) gets +0.18, because a region that rests higher needs a bigger bias to sit there. so the resting level is
              not "put in", it falls out of the maths.
            </p>
          </div>

          <div className="space-y-6">
            <H3>maths 3. one tick of one region, with real numbers</H3>
            <p>
              take the nucleus accumbens (NACC), the pleasure and wanting region. its rest is 0.03, tau 0.08 s. a
              person praises him. the praise is appraised as reward 0.8, social 0.9, novelty 0.25 at an intensity of
              0.7. here is the chain, one link at a time.
            </p>
            <Bullets
              items={[
                ["1. attention scaling", "weak stimuli get less attention. g = 0.55 + 0.45 · intensity = 0.55 + 0.45 · 0.7 = 0.865. so the reward that reaches the brain is 0.8 · 0.865 = 0.692."],
                ["2. the drive table", "reward drives NACC with a strength of 0.85, so the NACC is pushed with 0.85 · 0.692 = 0.588. at the same moment it pushes the VTA with 0.95 · 0.692 = 0.657, the value area with 0.55 · 0.692 = 0.38 and so on."],
                ["3. the envelope", "the push does not switch on instantly. it ramps in over 0.25 s (attack = min(1, t / 0.25)), stays for the duration of the stimulus, then fades out over 3 s. so 0.1 s in, only 40 percent of the drive is on: 0.235."],
                ["4. the sum", "x = bias + gain · (0.6 · synapses + drive) = −0.029 + 1.0 · (0 + 0.235) = 0.206. gain is about 1 for a calm awake brain."],
                ["5. the target", "sigma(0.206) = 1 / (1 + e^(−6 · (0.206 − 0.55))) = 1 / (1 + e^2.06) = 0.113. so the region 'wants' to be at 0.113."],
                ["6. the nudge", "the step is a fraction of the gap: 1 − e^(−dt / tau) = 1 − e^(−0.02 / 0.08) = 0.221. so activity goes 0.03 + (0.113 − 0.03) · 0.221 = 0.048 in this 20 ms step."],
                ["7. repeat", "50 times a second. as the envelope rises to full strength the drive becomes 0.588, x becomes 0.559, the target becomes 0.51 and activity chases it."],
              ]}
            />
            <p>
              the drive alone would only take the NACC to about 0.5. but in the real run it reaches 0.92 within half a
              second. the extra comes from the loop: the VTA lights up (0.54), the VTA pushes the NACC with a weight
              of 0.9, dopamine rises and gives the NACC another +0.3 · (dopamine − 0.1), and the NACC pushes the value
              area, which pushes back. each region adds a bit, the sigmoid turns those bits into a big jump, and the
              result is a snowball that is stopped only by global inhibition and fatigue. that snowball is what a feeling
              is.
            </p>
          </div>

          <div className="space-y-6">
            <H3>maths 4. the synapse sum, and why big regions push harder</H3>
            <p>for each connection from region A to region B, B receives this every step:</p>
            <Eq>{`input_to_B  +=  w(A→B) · scale · (a_A − rest_A)

scale = min( sqrt( max(0.25, neurons_A / 80) ), 4.5 )
across hemispheres:   w is multiplied by the 'contralateral' factor (0.35)`}</Eq>
            <Bullets
              items={[
                ["why a_A minus rest_A", "a region that is just sitting at rest sends nothing. only the extra activity travels down the wire. this is why a quiet brain stays quiet instead of every region adding a constant to every other."],
                ["why the square root of neurons", "a region with more neurons has more cells firing and so a stronger signal, but a region with 4 times the neurons is not 4 times as loud, it is twice as loud. the square root is the usual compromise. the cerebellum would be huge, so the scale is capped at 4.5."],
                ["why 0.6 (SYN)", "all synaptic input is multiplied by 0.6 before it is added in. it keeps loops from running away: a 1.0 would make strong loops saturate everything, a 0.3 would make nothing spread."],
                ["the other hemisphere", "left and right copies of a region talk to each other across the corpus callosum, which in the model is a 35 percent weight. a stimulus on the left side drives the left copy first and the right copy about a third as hard."],
              ]}
            />
          </div>

          <div className="space-y-6">
            <H3>maths 5. the three brakes: global inhibition, fatigue and noise</H3>
            <p>
              without brakes, a brain with positive loops would blow up to all 1s the first time anything happened.
              there are three brakes and each one works on a different time scale.
            </p>
            <Rows
              rows={[
                ["global inhibition (instant)", "1.6 · (mean lift across all regions) · (0.6 + 1.2 · GABA). 'mean lift' is the average of (a − rest). if the brain is busy, this number is big, and it is subtracted from every region at once. with normal GABA 0.3 it is 1.6 · lift · 0.96. so if the average region is 0.1 above rest, every region loses 0.15 from its x. this is how the brain stays selective: you cannot light up everything at once."],
                ["fatigue (seconds)", "each region keeps a slow copy of how active it has been: fatigue += ((a − rest) − fatigue) · (1 − e^(−dt / 2.2)). then x loses 0.45 · fatigue. a region held at 0.8 above rest for 3 seconds builds about 0.6 fatigue, which takes away about 0.27 from x. that is part of why the amygdala peak in the real run is a peak and not a plateau: it sits at 0.92 to 0.99 for two seconds and is down to 0.27 at three, helped by the stimulus fading out and by the tiring."],
                ["noise (always)", "every region has its own wobble: noise += −noise · dt / 0.25 + 0.08 · sqrt(dt) · gauss. the −noise · dt / 0.25 part pulls it back to zero with a memory of 0.25 s, the second part kicks it randomly. the sqrt(dt) is there so the amount of wobble does not depend on how small the time steps are. the typical size is about 0.08 · sqrt(0.25 / 2) = 0.03, which is small but enough to let a borderline decision go either way."],
              ]}
            />
            <p>
              one more thing about time steps: the real frame might be 16 ms or 60 ms depending on the computer. the
              brain never takes a step bigger than 0.02 s (it splits a long frame into several sub steps) and never
              advances more than 0.25 s in one frame even if the tab was frozen. this makes the maths stable: the same
              stimulus gives the same shape of response on a slow laptop and a fast one.
            </p>
          </div>

          <div className="space-y-6">
            <H3>maths 6. outcome, surprise and expectation</H3>
            <p>
              besides driving regions, every stimulus is also boiled down to a single number: how good or bad was
              that, from −1 to +1. this is the number the dopamine system learns from.
            </p>
            <Eq>{`outcome = clamp( 0.6·valence + 0.5·reward − 0.7·threat − 0.6·pain
                 − 0.4·loss − 0.3·disgust + 0.2·social , −1, 1 ) · intensity

rpe             = outcome − expectedValue          (reward prediction error)
expectedValue  += 0.15 · rpe                        (the brain slowly learns what to expect)
rpe decays      : rpe · e^(−dt / 2.5)`}</Eq>
            <Rows
              rows={[
                ["praise, 0.7 intensity", "0.6·0.8 + 0.5·0.8 + 0.2·0.9 = 1.06, clamped to 1, times 0.7 = +0.70. the expectation is 0, so rpe = +0.70. in the real run the rpe reads 0.67 a tenth of a second later (decayed by e^(−0.1/2.5) = 0.96)."],
                ["scolding, 0.8 intensity", "0.6·(−0.6) − 0.7·0.3 − 0.4·0.5 + 0.2·0.85 = −0.60, times 0.8 = −0.48. the run shows −0.46."],
                ["loud noise, 0.95 intensity", "0.6·(−0.5) − 0.7·0.75 = −0.825, times 0.95 = −0.78. the run shows −0.75."],
                ["the same praise again", "expectedValue is now 0.15 · 0.70 = 0.105, so the next identical praise gives rpe = 0.70 − 0.105 = 0.595, a bit smaller. after ten praises the expectation is about 0.6 and the praise barely registers any more. that is habituation of reward, and it is why a gift every minute stops being a gift."],
              ]}
            />
          </div>

          <div className="space-y-6">
            <H3>maths 7. the ten chemical equations, with the real gains</H3>
            <p>
              every chemical follows its own target with its own speed: level += (target − level) · (1 − e^(−dt / tau)).
              the target is built from what the regions are doing, so chemistry is a slow echo of activity, and then
              the chemistry feeds back and changes the regions. the actual targets in the code are:
            </p>
            <Eq>{`dopamine       = 0.10 + 0.85·max(0, rpe) + 0.35·ex(VTA)
                 − 0.25·max(0, cortisol − 0.2) − 0.12·max(0, serotonin − 0.55)
                 + 0.025·max(0, −rpe)                        tau 0.45 s
noradrenaline  = 0.10 + 1.0·ex(LC) + 0.35·startle − 0.2·max(0, melatonin − 0.2)
                                                              tau 1.0 s   (0.02 when asleep)
serotonin      = 0.40 + 0.9·ex(RAPHE) − 0.25·ex(SGACC)
                 − 0.2·max(0, cortisol − 0.25) + 0.15·socialPos   tau 6 s
cortisol       = 0.10 + 1.3·ex(HYP)·(0.4 + ex(AMY)) − 0.15·max(0, oxytocin − 0.2)
                                                              tau 18 s
oxytocin       = 0.10 + 0.9·socialPos + 0.15·max(0, lastOutcome)   tau 6 s
adrenaline     = 0.05 + 1.4·ex(HYP)·(0.3 + ex(AMY)) + 0.35·ex(LC) + 0.4·startle
                                                              tau 2.5 s
endorphin      = 0.10 + 1.5·ex(PAG) + 0.3·ex(NACC) + 0.2·max(0, rpe)   tau 7 s
acetylcholine  = 0.15 + 1.2·ex(BF) + 0.1·max(0, rpe)           tau 1.5 s (0.08 asleep)
GABA           = 0.30 + 2.4·meanLift + (0.25 if asleep)        tau 3 s
melatonin      = 0.9 if asleep else 0.1                        tau 8 s`}</Eq>
            <Bullets
              items={[
                ["why the taus are different", "dopamine is a spike (0.45 s): it is there for the moment of surprise and gone. cortisol is 18 s: stress rises slowly and lingers on purpose, because real stress hormones take minutes to clear. adrenaline is 2.5 s, a fast surge but not as fast as the first jolt of noradrenaline."],
                ["the cross talk", "the minus terms are the interesting part. high cortisol pushes dopamine down (stress kills motivation), high oxytocin pushes cortisol down (being with someone safe calms you), high serotonin takes a little dopamine away (calm brains want less), and sadness (SGACC) pulls serotonin down (rumination makes you feel worse)."],
                ["what the real run shows", "after the loud noise noradrenaline climbs 0.10 → 0.26 → 0.65 → 0.87 over two seconds and adrenaline follows 0.05 → 0.11 → 0.34 → 0.56, but cortisol only creeps 0.10 → 0.21 in three seconds and is still 0.17 twelve seconds later. praise did the opposite: dopamine jumps to 0.69 in one second then falls back, while oxytocin climbs slowly 0.10 → 0.37 and is still 0.28 at twelve seconds. fast chemistry is the spike, slow chemistry is the memory."],
              ]}
            />
          </div>

          <div className="space-y-6">
            <H3>maths 8. how chemicals push back on the regions</H3>
            <p>
              the loop closes here. each region gets a small extra term in x from the chemicals, always relative to
              the resting level of that chemical (so at rest the term is exactly zero):
            </p>
            <Rows
              rows={[
                ["whole brain gain", "gain = (0.45 if asleep else 1) · (1 + 0.3·(NA − 0.1) + 0.2·(adrenaline − 0.05)) · (1 − 0.3·(melatonin − 0.1)). at noradrenaline 0.87 and adrenaline 0.56 the gain is 1 + 0.23 + 0.10 = 1.33: every input is 33 percent louder, so the second loud noise hits a brain that is already jumpy."],
                ["nucleus accumbens", "+0.3·(dopamine − 0.1) + 0.15·(oxytocin − 0.1) + 0.15·(endorphin − 0.1). with dopamine at 0.69 that alone adds +0.18 to x, which is a third of the way from the bottom to the middle of the sigmoid."],
                ["amygdala", "+0.25·(cortisol − 0.1) − 0.3·(serotonin − 0.4) − 0.25·(oxytocin − 0.1) + 0.15·(NA − 0.1). so a stressed, low serotonin, lonely brain has an amygdala that is easier to set off, and a calm, bonded one is harder."],
                ["every region, the GABA brake", "through global inhibition (above). high GABA makes the whole brain harder to recruit."],
              ]}
            />
            <p>
              this is what i mean by "chemistry makes him moody". no flag says "he is grumpy". it is that cortisol is
              0.2 and serotonin is 0.35, so the amygdala's x is higher by about 0.04, so a small startle that would
              have been ignored crosses the middle of the sigmoid and becomes a flinch.
            </p>
          </div>

          <div className="space-y-6">
            <H3>maths 9. learning inside the brain: dopamine gated plasticity</H3>
            <p>
              the weights are not fixed. every 0.15 seconds (and only while awake) each pathway is allowed to change a
              little. the rule is the classic 'cells that fire together wire together', but only when dopamine says
              the moment mattered:
            </p>
            <Eq>{`pre  = max(0, a_from − rest_from)        post = max(0, a_to − rest_to)
if pre or post is below 0.04:  w drifts back toward its base weight
else:
  hebb = pre · post · (0.6 + 1.8 · max(0, dopamine − 0.1))
  ltd  = pre · (1 − post) · 0.25 · max(0, 0.1 − dopamine)
  Δw   = 0.012 · 0.15 · (hebb − ltd)  +  (base − w) · 0.004 · 0.15
w stays between 0.15·|base| and 2.8·|base| + 0.15       (inhibitory brakes are never changed)`}</Eq>
            <p>a worked example. during the praise, the VTA is at 0.60 above rest and the NACC at 0.9, and dopamine is 0.69:</p>
            <Bullets
              items={[
                ["hebb", "0.60 · 0.9 · (0.6 + 1.8 · 0.59) = 0.54 · 1.66 = 0.90"],
                ["Δw per tick", "0.0018 · 0.90 = +0.0016, minus a tiny pull back toward base"],
                ["over the praise", "the praise lasts about 2 seconds, which is 13 plasticity ticks: roughly +0.02 on a pathway whose base weight is 0.9. that is a 2 percent stronger link from one nice moment."],
                ["why it is slow on purpose", "after fifty nice moments the link has gone up by a lot (but never beyond 2.8 times its base), so he really does 'like' what he has been rewarded for. one bad day cannot rewrite his brain, and the homeostatic pull means that if the praise stops the link slowly walks home."],
                ["sleep", "while asleep, 2 percent of the ticks run the update at nearly three times the strength (0.4 instead of 0.15). that is the 'replay' that consolidates the day, like in a real sleeping brain."],
                ["what survives a restart", "only pathways that have moved more than 0.02 from their base are saved, together with the learned action values and the expected value."],
              ]}
            />
          </div>

          <div className="space-y-6">
            <H3>maths 10. the emotion readout, one score at a time</H3>
            <p>
              the label never gets set. it is read from the regions. here is the complete table of what each score
              really adds up, using the ex() values (0 to 1) of the regions listed:
            </p>
            <Eq>{`pos       = 0.4·NACC + 0.25·VMPFC + 0.2·VTA + 0.15·OFC + 0.18·moodValence

HAPPY     = pos · (1 − 0.4·LC) · (1 + 0.15·max(0, moodValence))
EXCITED   = pos · (0.3 + 0.9·LC) · (0.85 + 0.3·moodArousal)
FEARFUL   = 0.45·AMY + 0.2·PAG + 0.2·LC + 0.15·INS − 0.2·pos + 0.12·max(0, −moodValence)
ANGRY     = 0.2·ACC + 0.12·HYP + 0.35·PUT + 0.15·CAUD + 0.12·PMC − 0.2·pos + 0.08·max(0, −moodValence)
DISGUSTED = 0.45·INS + 0.25·OLF + 0.15·PUT + 0.15·OFC − 0.25·S1
SAD       = 0.4·SGACC + 0.2·PCC + 0.15·INS + 0.1·AMY
            + 0.12·clamp((0.14 − dopamine)/0.14) − 0.25·pos + 0.2·max(0, −moodValence)
PAIN      = 0.3·S1 + 0.3·ACC + 0.25·INS + 0.15·PAG
CURIOUS   = 0.25·ACC + 0.2·SC + 0.25·HIPP + 0.15·DLPFC + 0.15·VTA − 0.3·AMY + 0.1·moodArousal
SURPRISED = 0.5·startle + 0.25·SC + 0.25·LC`}</Eq>
            <Bullets
              items={[
                ["why happy and excited share a circuit", "both are 'pos'. the only difference is the locus coeruleus (alertness). high LC makes happy smaller (1 − 0.4·LC) and excited bigger (0.3 + 0.9·LC). so the same reward feeling is calm happiness when he is relaxed and excitement when he is wired. in the real praise run LC stays at 0.03, so the label is happy."],
                ["why there are minus terms", "fear is reduced by pos (−0.2·pos) and sad is reduced by pos (−0.25·pos). it is hard to be sad and delighted in the same instant, so the positive circuit actively subtracts from the negative scores."],
                ["why disgust subtracts S1", "a touch of real body sensation (S1) says 'this is pain, not disgust'."],
                ["mood adds a bias", "the slow moodValence is added or subtracted in several places, so after a hard day he is a bit more fearful, angry and sad for the same input. one gentle sentence will not instantly cure that."],
              ]}
            />
            <p>then the winner is picked with hysteresis, so his face does not flicker:</p>
            <Eq>{`smooth_k    += (score_k − smooth_k) · (1 − e^(−dt / 0.25))
best         = argmax smooth_k
switch if    best ≠ current  and  smooth_best > 1.15 · smooth_current + 0.01  and  smooth_best ≥ 0.20
fall to NEUTRAL (or CALM if serotonin > 0.5) when everything is below 0.20
intensity    = smooth_label / 0.65   (clamped 0..1)
mood        += (fast − mood) · (1 − e^(−dt / 55))      for both valence and arousal
valence      = clamp( (pos − max(fearful, angry, disgusted, sad, pain)) · 1.6 , −1, 1 )`}</Eq>
            <p>
              look at the scolding run for how this plays out in time. at 0.5 s the amygdala (0.36) and locus
              coeruleus (0.42) lead, so the label is fearful at 0.32. the sad circuit (subgenual cingulate) is
              slower, it has a tau of 0.2 s and takes a push from the loss drive of 0.9·0.5, so by 2 s it has built up
              to 0.34, sad overtakes fearful and the label flips to sad (0.57). that is a nice little story the maths
              tells all by itself: first fright, then hurt. nobody wrote that sequence down.
            </p>
          </div>

          <div className="space-y-6">
            <H3>maths 11. the instinct race: the maths of "i just reacted"</H3>
            <p>
              ten actions run a race (OBSERVE, APPROACH, GREET, INVESTIGATE, FREEZE, FLEE, CONFRONT, WITHDRAW, REJECT,
              RECOIL). each action has a level x between 0 and 1.5 that builds up like water in a leaky bucket:
            </p>
            <Eq>{`dx/dt = −1.2·x  +  2.2·input  −  0.9·(sum of all the other x's)  +  noise
noise = 0.35 · gauss / sqrt(dt) · (0.08 + 0.12·conflict + 0.06·|LC − 0.3|)

threshold = clamp(0.5 − 0.15·LC + 0.12·conflict , 0.3, 0.7)
conflict  = (1 − gap/x_lead) · clamp(x_lead / 0.4)          gap = x_lead − x_second`}</Eq>
            <Bullets
              items={[
                ["−1.2·x, the leak", "evidence drains away if it is not topped up. so a momentary spike of fear that disappears does not make him run."],
                ["+2.2·input, the push", "the input of each action is built from the regions that support it. with nothing fighting it, x settles at 2.2·input / 1.2 = 1.83·input, so an input of 0.27 is just enough to reach the 0.5 threshold."],
                ["−0.9·others, the competition", "every action suppresses the others in proportion to how high they are. a clear winner pulls away from the pack, and two equal rivals hold each other down. that is the 'torn' feeling."],
                ["threshold falls with alertness", "high LC lowers it (down to 0.35 at LC = 1), so a startled brain commits faster. high conflict raises it (up to 0.62) so a confused brain waits for more evidence."],
                ["the hold time", "an action can only change after 1.2 + 1.4·conflict seconds since the last one. at full conflict that is 2.6 seconds of hesitation, which is the visible pause before he decides."],
                ["leaving an action", "if the evidence for the current action falls below 55 percent of the threshold for 1.5 seconds, he goes back to observing."],
              ]}
            />
            <p>the inputs themselves, in full (fear is the FEARFUL score from above, social is a mix of FFA, TPJ, MPFC and Wernicke):</p>
            <Eq>{`OBSERVE     = 0.22
APPROACH    = (0.5·NACC + 0.25·VMPFC + 0.25·VTA) · (1 − 0.9·fear) · (1 − 0.6·social) · 1.1
GREET       = social · (0.25 + pos) · clamp(1 − fear − angry) · 2.0
INVESTIGATE = (0.3·ACC + 0.25·SC + 0.25·HIPP + 0.2·VTA) · (1 − 0.8·fear) · 1.9
FREEZE      = (0.45·AMY + 0.25·PAG) · (0.35 + startle) · 1.5
FLEE        = fear · (0.95 − 0.55·startle)
CONFRONT    = angry · 1.9          WITHDRAW = sad · 1.05
REJECT      = disgusted · 1.05     RECOIL   = pain · 1.1
every action also gets   + 0.55·learnedValue  +  0.55·epistemicValue`}</Eq>
            <p>
              read FREEZE and FLEE together and you see the whole fear story. a sudden loud noise makes startle high
              (say 0.8), so FREEZE gets (0.45·0.97 + 0.25·0.3) · 1.15 · 1.5 = 0.88, while FLEE gets only
              fear · (0.95 − 0.44) = 0.51 · fear. freeze wins first. as the startle decays (it halves every 0.55 s,
              e^(−dt/0.8)), FREEZE shrinks and FLEE grows, and the real run does exactly that: freeze at 1 and 2
              seconds, then flee at 3 seconds. that is the sequence real animals show, and it comes from two lines of
              arithmetic.
            </p>
          </div>

          <div className="space-y-6">
            <H3>maths 12. how the instinct layer learns what to do</H3>
            <p>
              every action has a learned value between −1 and +1, and every supporting region has a learned gain
              (starts at 1) onto the actions it supports. when the outcome of what he did is known, both are changed
              with the same rpe that dopamine uses:
            </p>
            <Eq>{`when an action wins:   eligibility[action] = 1,   eligibility[others] = max(itself, 0.15)
eligibility decays:    × e^(−dt / 3.0)

on every outcome:
  value[a]        += 0.08 · rpe · eligibility[a]           (clamped −1..1)
  gain[region→a]  += 0.04 · rpe · eligibility[a]           (only if |rpe| > 0.05, clamped 0.25..2.5)`}</Eq>
            <Bullets
              items={[
                ["credit assignment", "the eligibility trace is how the brain knows which action to blame. the one that just won has trace 1, so it gets the full update. the others have a small 0.15 trace, so they learn a little too (a rough 'similar actions' effect)."],
                ["worked example", "he approaches a person (APPROACH wins, eligibility 1). the person praises him, rpe = +0.6. value[APPROACH] += 0.08 · 0.6 · 1 = +0.048. next time APPROACH gets 0.55 · 0.048 = +0.026 extra input. small, but 20 praised approaches later it is +0.5 and approaching has become a habit."],
                ["and the other way", "if he approaches and is scolded (rpe −0.6) the same update subtracts 0.048, and the gains of NACC, VMPFC and VTA onto APPROACH drop by 0.04 · 0.6 = 0.024 each. so approaching gets quieter from both sides."],
                ["the outside world too", "the thinking brain's real outcomes (a play that succeeded, being scolded) are sent in through externalOutcome with a slightly stronger 0.12 rate, so both layers learn from the same events."],
              ]}
            />
          </div>

          <div className="space-y-6">
            <H3>maths 13. predictive processing: the brain that guesses first</H3>
            <p>
              the last piece is a small model of 'what do i expect to happen next'. it keeps a belief for 13 features
              (valence, arousal, threat, reward, social, novelty, disgust, pain, loss, anger, face, familiarity,
              intensity) and every time something happens it compares the guess with the truth.
            </p>
            <Eq>{`predict:   start from belief, then bend it with the chemistry
           reward  += 0.25·(dopamine − 0.15)       threat  += 0.3·(cortisol − 0.1) + 0.2·(NA − 0.1)
           social  += 0.35·(oxytocin − 0.1)        novelty += 0.4·uncertainty
           arousal += 0.25·(NA − 0.1) + 0.15·(adrenaline − 0.05) − 0.2·(melatonin − 0.1)

error:     pe = mean over the 13 features of |observed − predicted|

uncertainty = clamp( 0.55·uncertainty + 0.45·peEma + 0.08·(pe > 0.35) , 0.08, 0.95 )
peEma       = 0.7·peEma + 0.3·pe

learn:     rate = clamp( 0.12 + 0.35·acetylcholine + 0.2·uncertainty , 0.05, 0.55 )
           belief += rate · (observed − belief)

idle:      uncertainty −= 0.015 per second, peEma −= 0.02 per second`}</Eq>
            <p>a full worked example, the very first praise on a fresh brain (uncertainty 0.45, acetylcholine 0.15, everything else at rest):</p>
            <Bullets
              items={[
                ["the guess", "belief is almost zero, novelty is 0.2 + 0.4·0.45 = 0.38 and the chemistry bends valence by −0.01. so the brain expects 'nothing much, a bit new'."],
                ["the truth", "valence 0.8, arousal 0.5, reward 0.8, social 0.9, novelty 0.25, intensity 0.7. the errors are 0.81, 0.5, 0.8, 0.9, 0.13, 0.7 (the rest are 0). the sum is 3.84 over 13 features: pe = 0.295."],
                ["the new uncertainty", "peEma = 0.7·0.3 + 0.3·0.295 = 0.30. uncertainty = 0.55·0.45 + 0.45·0.30 = 0.38. it dropped a little because the surprise was moderate."],
                ["the learning", "rate = 0.12 + 0.35·0.15 + 0.2·0.38 = 0.25. so the belief about 'social' jumps from 0 to 0.25 · 0.9 = 0.22. next time someone speaks, he expects some social content, and a repeat of the same praise will be less of a surprise."],
                ["epistemic value of looking closer", "INVESTIGATE gets 0.85·u + 0.55·pe + 0.15·socialU = 0.85·0.38 + 0.55·0.295 + 0.15·0.24 = 0.52, which becomes 0.55 · 0.52 = +0.29 added to its race input. so a surprised, unsure brain is pushed to look into things. a bored, certain one is not (u falls to 0.08 after a long quiet time, giving 0.07)."],
                ["where attention comes in", "acetylcholine (from the basal forebrain, driven by novelty and threat) raises the learning rate: at 0.8 acetylcholine the rate is 0.12 + 0.28 + 0.08 = 0.48, almost twice the one above. that is the 'pay attention and you learn faster' effect."],
              ]}
            />
          </div>

          <div className="space-y-6">
            <H3>maths 14. sleep in the maths</H3>
            <p>
              sleep is not a switch that stops the brain, it is a change of settings. while asleep: the global gain is
              multiplied by 0.45, stimuli are 15 percent as strong (env × 0.15), noradrenaline is pinned near 0.02,
              serotonin near 0.25, acetylcholine near 0.08, GABA gets +0.25, and melatonin heads to 0.9 with a time
              constant of 8 s. the slow waves and hippocampal replay bursts run on top, and plasticity runs in the
              stronger replay mode. only a pain stimulus, or anything where max(threat, pain, anger) · intensity is
              above 0.6, can wake it. that is how he stays asleep through a person walking by but wakes immediately to
              a loud bang.
            </p>
          </div>

          <div className="space-y-6">
            <H3>maths 15. what happens in one 20 ms step, in order</H3>
            <p>
              this is the exact order the program does things, every sub step. if you ever want to follow the code,
              this is the map. the whole emotional brain is one function that does these 14 things and then does them
              again 20 ms later.
            </p>
            <Rows
              rows={[
                ["1. clear the input", "every region's stimulus input is set to 0."],
                ["2. play the stimuli", "for every stimulus that is still in front of him: advance its clock, compute its envelope (ramp in over 0.25 s, hold for its duration, fade over 3 s, times 0.15 if asleep), and add its drive to each region it targets. the left or right copy gets more or less depending on the side factor (1 ± 0.6 · laterality). also work out socialPos = social · max(valence, 0.9 · reward) · envelope, and smooth it with a 1.5 s time constant."],
                ["3. the whole brain gain", "(0.45 if asleep, else 1) · (1 + 0.3 · (NA − 0.1) + 0.2 · (adrenaline − 0.05)) · (1 − 0.3 · (melatonin − 0.1))."],
                ["4. the synapses", "for every pathway, add w · (activity_from − rest_from) to the target. the w is the live plastic weight, not the base one."],
                ["5. global inhibition", "1.6 · mean lift · (0.6 + 1.2 · GABA), where mean lift is how far above rest the average node is."],
                ["6. noise", "each node's own smooth wobble moves one step."],
                ["7. the sum x", "x = bias + gain · (0.6 · synapses + input) + noise − global inhibition − 0.45 · fatigue + the chemical term for that region. if an emotion is being forced from the lab, its drive is added too. in sleep, cortex gets a slow wave of +0.25 · slow − 0.1, and the hippocampus gets bursts of replay."],
                ["8. the target and the nudge", "target = sigma(x). activity += (target − activity) · (1 − e^(−dt / tau)), using the tau of that region."],
                ["9. fatigue", "fatigue follows how far above rest the region was, with a 2.2 s time constant."],
                ["10. the ten chemicals", "each one moves toward its target (all ten equations above), startle decays with a 0.8 s time constant and rpe with a 2.5 s one."],
                ["11. plasticity", "every 0.15 s, if awake, run the three factor update on every pathway. asleep, run a stronger one on 2 percent of steps."],
                ["12. the generative model", "if no stimulus is in front of him, uncertainty and prediction error relax toward calm."],
                ["13. the readouts", "the emotion scores are computed from the regions, smoothed, and the label may switch. the instinct race advances and may commit an action."],
                ["14. bookkeeping", "track the peak emotion of this episode, and every 0.12 s rebuild the list of the 40 strongest active pathways for the viewer (the glowing lines you see)."],
              ]}
            />
            <p>
              a stimulus is also processed once at the moment it arrives, before any of the above: the brain wakes up
              if it is asleep and the stimulus is dangerous enough, the startle is set to
              max(startle, novelty · (0.5 + 0.5 · arousal) · (0.5 + intensity) + 0.6 · threat · intensity), the
              generative model observes it, and the outcome and rpe are computed. for the loud noise that is
              0.85 · 0.95 · 1.45 + 0.6 · 0.75 · 0.95 = 1.17 + 0.43, which is clamped to 1.0: a full startle.
            </p>
          </div>

          <div className="space-y-6">
            <H3>maths 16. every region and its numbers</H3>
            <p>
              this is the full table of the 42 regions with their speed (tau, in seconds) and resting activity.
              the neuron count is only used for the weight of its outgoing pathways (the square root rule), it is not
              a real cell count. the three groups are the cerebrum, the cerebellum and the brainstem.
            </p>
            <Rows
              rows={[
                ["LGN", "vision relay. tau 0.04, rest 0.03, 18 neurons. as fast as anything in the brain."],
                ["V1", "first visual cortex. tau 0.06, rest 0.04, 140 neurons."],
                ["V2V4", "colour and shape. tau 0.07, rest 0.04, 160 neurons."],
                ["MT", "motion. tau 0.07, rest 0.03, 70 neurons."],
                ["IT", "objects. tau 0.08, rest 0.04, 120 neurons."],
                ["FFA", "faces. tau 0.08, rest 0.03, 90 neurons."],
                ["MGN", "hearing relay. tau 0.04, rest 0.03, 16 neurons."],
                ["A1", "first auditory cortex. tau 0.06, rest 0.04, 80 neurons."],
                ["WERN", "understanding words. tau 0.10, rest 0.03, 95 neurons."],
                ["BROCA", "forming speech. tau 0.10, rest 0.03, 90 neurons."],
                ["S1", "touch and pain location. tau 0.06, rest 0.03, 110 neurons."],
                ["M1", "movement commands. tau 0.07, rest 0.03, 100 neurons."],
                ["PMC", "movement planning. tau 0.09, rest 0.03, 110 neurons."],
                ["PPC", "where things are. tau 0.10, rest 0.05, 140 neurons."],
                ["DLPFC", "deliberate thinking. tau 0.15, rest 0.05, 150 neurons."],
                ["MPFC", "self and others. tau 0.15, rest 0.07, 110 neurons."],
                ["VMPFC", "value and calming. tau 0.15, rest 0.05, 95 neurons."],
                ["OFC", "good or bad. tau 0.12, rest 0.04, 95 neurons."],
                ["ACC", "conflict and the ouch of pain. tau 0.12, rest 0.05, 85 neurons."],
                ["SGACC", "sadness. tau 0.20 (the slowest cortex), rest 0.04, 40 neurons."],
                ["TPJ", "other minds. tau 0.12, rest 0.04, 85 neurons."],
                ["PCC", "self and rumination. tau 0.20, rest 0.10 (the highest resting level), 90 neurons."],
                ["TPOLE", "meaning of people and things. tau 0.12, rest 0.03, 80 neurons."],
                ["INS", "gut feeling and disgust. tau 0.10, rest 0.05, 90 neurons."],
                ["AMY", "danger and importance. tau 0.05, rest 0.04, 50 neurons. a fast alarm."],
                ["HIPP", "memory. tau 0.12, rest 0.05, 75 neurons."],
                ["PHC", "place and context. tau 0.12, rest 0.04, 50 neurons."],
                ["HYP", "stress hormones. tau 0.15, rest 0.05, 30 neurons."],
                ["NACC", "pleasure and wanting. tau 0.08, rest 0.03, 40 neurons."],
                ["VTA", "dopamine source. tau 0.06, rest 0.05, 25 neurons."],
                ["CAUD", "goal directed choice. tau 0.10, rest 0.04, 60 neurons."],
                ["PUT", "habit and motor selection. tau 0.09, rest 0.04, 75 neurons."],
                ["THAL", "the gate. tau 0.05, rest 0.08, 95 neurons."],
                ["OLF", "smell. tau 0.08, rest 0.03, 40 neurons."],
                ["CB", "cerebellum. tau 0.07, rest 0.06, 11,500 neurons, which is about 80 percent of all of them, and its outgoing weight is capped at a scale of 4.5."],
                ["SC", "snap attention. tau 0.04, rest 0.03, 22 neurons."],
                ["PAG", "freeze, fight, flee, pain control. tau 0.08, rest 0.03, 22 neurons, midline."],
                ["LC", "noradrenaline. tau 0.08, rest 0.05, 12 neurons."],
                ["RAPHE", "serotonin. tau 0.20, rest 0.10, 18 neurons, midline. slow on purpose, mood is slow."],
                ["BF", "acetylcholine and attention. tau 0.08, rest 0.04, 20 neurons."],
                ["RF", "reticular formation, general wakefulness. tau 0.10, rest 0.08, 45 neurons, midline."],
              ]}
            />
            <p>
              a few things you can read off this table. the alarm (amygdala, tau 0.05) is the fastest thing in the
              whole emotional brain, which is why fear starts before thinking can finish. the mood and rumination
              areas (subgenual cingulate, posterior cingulate, raphe) are the slowest at 0.2, which is why sadness
              builds late and fades late. and the regions with the highest rest (PCC 0.10, RAPHE 0.10, THAL 0.08,
              RF 0.08) are the ones that are never quite off: the default mode, the calm and the gate.
            </p>
          </div>

          <div className="space-y-6">
            <H3>maths 17. every pathway, by circuit</H3>
            <p>
              these are all the connections in the anatomy (positive excites, negative inhibits). a weight of 0.9 is
              a strong link, 0.2 is a whisper. these are the base weights. the live ones drift from these with
              experience (maths 9). each line is from → to, weight.
            </p>
            <Rows
              rows={[
                ["vision", "LGN → V1 0.9, V1 → V2V4 0.8, V2V4 → MT 0.55, V2V4 → IT 0.7, V2V4 → FFA 0.55, IT → FFA 0.35, MT → PPC 0.55, PPC → DLPFC 0.35, IT → TPOLE 0.4, IT → AMY 0.35, FFA → AMY 0.35, FFA → TPJ 0.4, FFA → MPFC 0.2, V1 → SC 0.2, SC → PPC 0.3, SC → THAL 0.25, IT → HIPP 0.25, IT → PHC 0.3, MT → SC 0.2"],
                ["hearing + language", "MGN → A1 0.9, A1 → WERN 0.7, WERN → BROCA 0.55, WERN → TPJ 0.35, WERN → DLPFC 0.3, A1 → AMY 0.3, WERN → TPOLE 0.35, BROCA → PMC 0.35, BROCA → M1 0.25, A1 → SC 0.25"],
                ["touch + pain", "THAL → S1 0.7, S1 → M1 0.3, S1 → INS 0.55, S1 → PPC 0.3, INS → ACC 0.45, ACC → INS 0.3, THAL → INS 0.4, PAG → THAL 0.2, S1 → ACC 0.25"],
                ["smell", "OLF → AMY 0.65, OLF → OFC 0.55, OLF → HIPP 0.3, OLF → INS 0.4. smell skips the thalamus, so a smell reaches the amygdala and memory directly. that is why a smell can bring back a memory or a feeling instantly."],
                ["the threat circuit", "AMY → HYP 0.7, AMY → PAG 0.7, AMY → LC 0.55, AMY → INS 0.35, AMY → ACC 0.35, AMY → HIPP 0.35, AMY → SC 0.2, AMY → NACC 0.15, INS → AMY 0.4, HYP → PAG 0.35, PAG → RF 0.4, LC → AMY 0.25, HIPP → AMY 0.2, ACC → AMY 0.15"],
                ["the brakes (the only negative ones)", "VMPFC → AMY −0.5, OFC → AMY −0.3, DLPFC → AMY −0.25, MPFC → AMY −0.2, and SGACC → VTA −0.3. four of the five calm the amygdala, which is why a brain with a healthy front can talk itself down. the fifth is the sad region cutting the reward region. these are the only pathways that never change with plasticity."],
                ["reward", "VTA → NACC 0.9, VTA → VMPFC 0.5, VTA → OFC 0.35, NACC → VTA 0.25, OFC → NACC 0.5, VMPFC → NACC 0.5, AMY → OFC 0.2, HIPP → NACC 0.25, NACC → CAUD 0.3, OFC → VMPFC 0.35, VMPFC → RAPHE 0.3, RAPHE → VMPFC 0.2"],
                ["sadness and rumination", "SGACC → PCC 0.35, PCC → SGACC 0.3, SGACC → AMY 0.15, SGACC → HYP 0.25, SGACC → INS 0.2. the sad region and the self region feed each other (0.35 and 0.3), which is the loop that makes sadness keep going: that is rumination."],
                ["action selection and movement", "DLPFC → CAUD 0.55, CAUD → THAL 0.4, PUT → THAL 0.4, THAL → PMC 0.55, PMC → M1 0.8, M1 → PUT 0.25, M1 → CB 0.75, CB → THAL 0.65, CB → PMC 0.45, CB → M1 0.35, PMC → CB 0.4, PPC → CB 0.3, PUT → CB 0.25, PPC → PMC 0.45, DLPFC → PMC 0.45, ACC → DLPFC 0.45, DLPFC → ACC 0.2, ACC → PMC 0.2, PUT → M1 0.15"],
                ["memory and the default mode", "HIPP → PHC 0.5, PHC → HIPP 0.5, HIPP → PCC 0.35, PCC → HIPP 0.3, HIPP → VMPFC 0.3, PCC → MPFC 0.5, MPFC → PCC 0.5, TPJ → MPFC 0.35, TPJ → PCC 0.25, TPOLE → AMY 0.2, TPOLE → OFC 0.25, HIPP → TPOLE 0.2"],
                ["arousal", "RF → THAL 0.5, LC → THAL 0.25, HYP → RF 0.3, HYP → LC 0.25, RF → LC 0.2, THAL → DLPFC 0.3, THAL → ACC 0.25"],
                ["attention", "BF → HIPP 0.45, BF → ACC 0.3, BF → DLPFC 0.3, BF → PPC 0.3, BF → V1 0.25, BF → A1 0.25, BF → AMY 0.15, RF → BF 0.3, AMY → BF 0.25, ACC → BF 0.2"],
              ]}
            />
            <p>
              read the threat circuit and the brakes together and you can see the design. fear has 14 pathways pushing
              it up and four pushing it down, all from the prefrontal cortex. the prefrontal pushes are slow (tau 0.15)
              and the amygdala is fast (tau 0.05), so fear always wins the first half second and calm arrives
              afterwards. that is not a rule i wrote, it is a consequence of the speeds and weights.
            </p>
          </div>

          <div className="space-y-6">
            <H3>maths 18. every chemical effect on every region</H3>
            <p>
              this is the complete list of chemical terms added to x (each relative to the resting level of that
              chemical, so at rest each term is zero). i showed the main ones above. this is all of them:
            </p>
            <Rows
              rows={[
                ["NACC", "+0.3·(dopamine − 0.1) + 0.15·(oxytocin − 0.1) + 0.15·(endorphin − 0.1)"],
                ["VMPFC", "+0.2·(dopamine − 0.1) + 0.2·(serotonin − 0.4) − 0.2·(cortisol − 0.1)"],
                ["DLPFC and CAUD", "+0.2·(dopamine − 0.1)"],
                ["AMY", "+0.25·(cortisol − 0.1) − 0.3·(serotonin − 0.4) − 0.25·(oxytocin − 0.1) + 0.15·(NA − 0.1)"],
                ["HIPP", "−0.15·(cortisol − 0.1) + 0.2·(acetylcholine − 0.15). stress hurts memory, attention helps it."],
                ["MPFC and TPJ", "+0.15·(oxytocin − 0.1). trust makes him better at thinking about other minds."],
                ["V1, V2V4, A1, IT", "+0.2·(acetylcholine − 0.15). attention sharpens the senses."],
                ["M1, PMC, PPC", "+0.15·(adrenaline − 0.05). adrenaline readies the body."],
                ["CB", "+0.2·(acetylcholine − 0.15) + 0.1·(dopamine − 0.1)"],
                ["S1", "+0.2·(acetylcholine − 0.15) − 0.25·(endorphin − 0.1). endorphin dulls pain."],
                ["ACC and INS", "−0.2·(endorphin − 0.1). endorphin dulls the 'ouch' and the gut feeling too."],
                ["RAPHE", "+0.12·socialPos awake, −0.3 asleep"],
                ["LC and RF", "−0.3·(melatonin − 0.1), and a further −0.5 (LC) or −0.4 (RF) when asleep"],
                ["everything", "global gain (NA, adrenaline, melatonin) and global inhibition (GABA)"],
              ]}
            />
          </div>

          <div className="space-y-6">
            <H3>maths 19. real runs: what repetition and stress do</H3>
            <p>
              i ran the real brain (not a drawing of it) through two experiments to check the maths does what the
              story says. these are the real numbers it printed.
            </p>
            <p>
              <b>the same praise, six times, 8 seconds apart.</b> the rpe (the surprise) falls every time because the
              brain learns to expect praise, and so does the dopamine spike. but the pleasure region does not fade at
              all, because it is driven by the reward itself, not by the surprise.
            </p>
            <Rows
              rows={[
                ["praise 1", "expected 0.00, rpe 0.70, dopamine peak 0.70, accumbens peak 0.95"],
                ["praise 2", "expected 0.10, rpe 0.59, dopamine peak 0.63, accumbens peak 0.94"],
                ["praise 3", "expected 0.19, rpe 0.51, dopamine peak 0.60, accumbens peak 0.97"],
                ["praise 4", "expected 0.27, rpe 0.43, dopamine peak 0.56, accumbens peak 0.97"],
                ["praise 5", "expected 0.33, rpe 0.37, dopamine peak 0.53, accumbens peak 0.98"],
                ["praise 6", "expected 0.39, rpe 0.31, dopamine peak 0.50, accumbens peak 0.98"],
              ]}
            />
            <p>
              so by the sixth praise the dopamine spike is 40 percent smaller than the first, but he still feels
              happy. that is the real difference between liking and wanting: the thrill of surprise wears off, the
              pleasure does not. you can also see the rule expected += 0.15 · rpe at work (0.70 · 0.15 = 0.105, then
              0.10 + 0.15 · 0.59 = 0.19, and so on).
            </p>
            <p>
              <b>four loud bangs, 2.5 seconds apart.</b> now the opposite happens. nothing calms down between them,
              the stress builds and the alarm stays on:
            </p>
            <Rows
              rows={[
                ["bang 1", "expected 0.00, rpe −0.78, amygdala peak 0.99, noradrenaline 0.92, cortisol 0.20. emotions: neutral, then surprised, then fearful"],
                ["bang 2", "expected −0.12, rpe −0.67, amygdala 1.00, noradrenaline 0.99, cortisol 0.29. stays fearful"],
                ["bang 3", "expected −0.22, rpe −0.57, noradrenaline 1.00, cortisol 0.38"],
                ["bang 4", "expected −0.30, rpe −0.48, noradrenaline 1.00, cortisol 0.45, dopamine down to 0.07 (below its resting 0.10)"],
              ]}
            />
            <p>
              look at the cortisol, it doubles from 0.20 to 0.45 in ten seconds, because its time constant is 18 s so
              each bang adds to the last one instead of washing out. and look at dopamine, it falls below rest because
              the dopamine equation has −0.25 · (cortisol − 0.2) in it: stress is literally taking away his
              motivation. the rpe is also smaller each time (−0.78, −0.67, −0.57, −0.48) because he is learning to
              expect bad things, the same expectation rule as the praise but in the other direction. these are the
              two big effects i wanted from the maths, and they come out without anyone writing "if stressed then
              less motivated".
            </p>
          </div>

          <div className="space-y-6">
            <H3>maths 20. the cheat sheet: every constant in one place</H3>
            <Rows
              rows={[
                ["time steps", "sub step at most 0.02 s, frame at most 0.25 s"],
                ["sigmoid", "centre 0.55, steepness 6"],
                ["synaptic gain (SYN)", "0.6"],
                ["fatigue", "weight 0.45, time constant 2.2 s"],
                ["noise", "pull back 1 / 0.25 s, kick 0.08 · sqrt(dt)"],
                ["global inhibition", "1.6 · mean lift · (0.6 + 1.2 · GABA)"],
                ["other hemisphere", "35 percent of the weight"],
                ["synapse scale", "min(sqrt(max(0.25, neurons / 80)), 4.5)"],
                ["stimulus envelope", "attack 0.25 s, release 3 s, asleep × 0.15, laterality 1 ± 0.6"],
                ["attention scaling g", "0.55 + 0.45 · intensity"],
                ["startle", "decays with 0.8 s; set by novelty and threat"],
                ["rpe", "decays with 2.5 s; expectation moves 0.15 of the error (0.12 for outside outcomes)"],
                ["socialPos", "smoothed with 1.5 s"],
                ["chemistry time constants", "dopamine 0.45, noradrenaline 1.0, acetylcholine 1.5, adrenaline 2.5, GABA 3, serotonin 6, oxytocin 6, endorphin 7, melatonin 8, cortisol 18 (seconds)"],
                ["chemistry resting levels", "dopamine 0.10, serotonin 0.40, noradrenaline 0.10, adrenaline 0.05, cortisol 0.10, oxytocin 0.10, endorphin 0.10, acetylcholine 0.15, GABA 0.30, melatonin 0.10"],
                ["plasticity", "every 0.15 s, rate 0.012, home pull 0.004, weights between 0.15× and 2.8× base + 0.15"],
                ["emotion", "smoothing 0.25 s, threshold 0.20, must win by 15 percent, mood 55 s, intensity = score / 0.65"],
                ["instinct race", "leak 1.2, push 2.2, competition 0.9, noise base 0.08, threshold 0.3 to 0.7, hold 1.2 to 2.6 s, leave after 1.5 s below 55 percent"],
                ["action learning", "value rate 0.08, gain rate 0.04, trace 3 s, gains between 0.25 and 2.5, value between −1 and 1"],
                ["predictive", "history 12, uncertainty floor 0.08, ceiling 0.95, learning rate 0.05 to 0.55, idle drift 0.015 and 0.02 per second"],
              ]}
            />
          </div>

          <div className="space-y-6">
            <H3>maths 21. the whole loop in one picture</H3>
            <Eq>{`event ─► appraisal (13 numbers) ─► drives for regions ──┐
                    │                                       ▼
                    └─► outcome ─► rpe ─► dopamine ─► ┌─ regions (sigmoid, tau, synapses, brakes) ─┐
                                   │                  │                                            │
                                   ├─► action values  └─► chemistry ◄── ex(region) ◄───────────────┘
                                   └─► weights (hebbian)         │
                                                                 ▼
          emotion readout (hysteresis) ◄── regions + mood      gain, per-region chemical terms
          instinct race (threshold)    ◄── regions + learned values + epistemic value
                    │
                    ▼
         label + reason ("because NACC 98%, VTA 64%") ─► the mind layer ─► what he says and does`}</Eq>
            <p>
              that is the entire emotional brain. 42 numbers, 10 chemicals, about 130 weights, 3 brakes, 1 sigmoid and
              a handful of rules. every behaviour you see in the lab (the freeze before the flee, the sadness that
              arrives after the fright, the happiness that fades even though the praise stays, the jumpy second bang)
              is the same two equations running over and over.
            </p>
          </div>

          </div>

          <hr />

          {/* ═════════ HUMAN LAYER ═════════ */}
          <div className="space-y-6">
            <H2>making him feel human</H2>
            <p>
              on top of the two brains there is a human like layer, and honestly this is where it starts to feel
              strange in a good way. you can switch it off with one toggle and he goes back to the plain version.
            </p>

            <H3>the body clock</H3>
            <p>
              he has a simulated day. by default one real second is one simulated minute, so a day is 24 real
              minutes (you can pick 6 minutes, 12 minutes, 24 minutes or 1 hour). sleepiness comes from two
              things, the clock and sleep pressure:
            </p>
            <Eq>{`alertness  = 0.5 + 0.5 · cos(2π · (hour − 15) / 24)      peak at 3 pm, lowest at 3 am
sleepiness = 0.55 · sleep pressure + 0.45 · (1 − alertness)   (+0.2 if groggy)`}</Eq>
            <p>
              sleep pressure builds over about 16 hours awake and drains over about 8 hours asleep. he falls asleep
              when sleepiness is over 0.78 at night, or the pressure is over 0.92, and wakes when rested. if you wake
              him early he is groggy and dozes off again soon. he winds down in the evening, dreams, and energy
              multiplies how lively his actions are. try <code>visionBrain().fastForward(900)</code> in the browser
              console to skip 15 simulated hours.
            </p>

            <H3>plans</H3>
            <p>
              short multi step intentions that he chooses on purpose: wind down for sleep, show you the toy, play
              with the toy, find some company, explore somewhere new, celebrate. a plan has a 90 second deadline and
              can be interrupted. a shock like a loud noise or a scolding pauses it, it resumes if things calm down
              within about 6 seconds, and is dropped after 25.
            </p>

            <H3>relationships</H3>
            <p>
              he remembers each person separately, by face. each person gets trust, warmth, a grudge, and a list of
              shared moments. a moment fades: its strength decays with a half life of about 2 hours, longer for
              emotional ones, and the weakest moment is forgotten first, not the oldest, so old ones come back
              blurry and then disappear. he can greet you with a real memory, like "last time you showed me a teddy
              bear".
            </p>
            <p>
              scold him and the grudge goes up (more if he trusted you a lot). while the grudge is over 0.35 he
              sulks: short answers, refuses to dance, avoids you. an apology reduces it more the sooner you say it
              (−0.65 within 2 minutes, −0.5 within 15, −0.35 later), trust recovers slowly, and the grudge halves
              about every 10 minutes by itself. scolding asha does not make him sulk at ravi, and when you tell him
              your name, whatever he remembered about the unnamed "you" is moved onto that name.
            </p>

            <H3>personality</H3>
            <p>
              five traits: curious, sociable, calm, bold and agreeable. each drifts about 1 to 2 percent per
              relevant event and tilts his action scores. a calm one shrugs off bad news and a sociable one glows
              at kindness. big events (a lot of trust, many scoldings, many gifts, many loud noises, a long
              absence, a week together) change him for good, once each.
            </p>

            <H3>the rest</H3>
            <Bullets
              items={[
                ["mood carries over", "when he goes to bed, the evening's mood leaves a softened leftover (up to plus or minus 0.3) that nudges the next morning and fades over a few simulated hours. a bad evening gives a gloomier morning, 'still a bit down from yesterday'. dreams carry a small mood into the morning too."],
                ["reflection", "while idle or asleep he replays the day, notices things about himself ('i seem to enjoy dancing') and saves them as lessons."],
                ["long term goals", "he keeps one ambition at a time, chosen to fit his personality: explore eight new corners, learn two new things about you, or have six real conversations. progress is measured from real counts, he mentions it, celebrates when done, and a new one forms."],
                ["body language", "slump, breathing, walking speed and dance size follow mood, tiredness and sleep. speech gets yawns when sleepy, hesitation when torn and short cool lines when hurt."],
                ["natural touches", "blinks, head tilts, looking away while thinking and at you while listening, a startle hop that fades with repetition, a rare stumble, curiosity questions, short back channel words ('oh no.'), hedges, a small quirk, getting a bit jealous if you praise another assistant, saying 'oh, sorry, go ahead' when you interrupt him, trailing off when tired, forgetting facts you have not repeated for days and then asking again, turning towards the side a loud noise came from, and asking for space for 3 minutes if you poke or shout too much."],
                ["life layer", "habits (a pull toward what felt good at that hour), weather and sky, hot and cold zones, a battery with a charger he walks to, pain and places he learns to avoid, jokes, tricks you can teach ('when i say spin, dance', clumsy at first and better with practice), expecting you at your usual hour, and noticing when a landmark has been moved."],
                ["several people", "group greetings, getting torn when he is upset with one of them, remembering who gave him which toy, inside jokes, and a slightly different voice per person."],
                ["saved mind", "everything is saved per user in postgres every 30 seconds and when you close the page, and the newer copy wins, so his memories and personality follow you across devices. if the database is down the browser copy is used. 'forget me' erases one person, 'reset memory' erases everything."],
              ]}
            />

            <H3>how he talks</H3>
            <p>
              a sentence goes through a fixed order: topics are extracted and remembered, the 'need space' mode is
              checked, jealousy, taught tricks, laughs, teaching ('when i say x, do y'), the answer to a question he
              asked earlier (saved as a fact about you), and the introspection questions ('why did you do that',
              'why are you sad', 'did you dream', battery). then the normal replies for commands, greetings and
              names. if nothing matched but you made a statement, he gives a back channel and maybe a curiosity
              question. nice and rude words move his mood and also feed the appraisal in the emotional brain. he
              does not talk over you, he notices when you sound down and answers with empathy, and "sorry" buried in a
              long message is not mistaken for an apology.
            </p>

            <H3>his day, hour by hour, with the real numbers</H3>
            <p>
              here is the body clock put into a table, for a day that starts at 8 am with a sleep pressure of 0.15.
              pressure grows by 1/960 for every simulated minute awake (so it takes 16 hours to go from empty to
              full), and the energy for lively actions is <code>clamp(1.15 − 0.9·sleepiness, 0.15, 1.1)</code>:
            </p>
            <Rows
              rows={[
                ["8:00", "alertness 0.37, pressure 0.15 → sleepiness 0.37, energy 0.82. just woke up, a bit groggy by the clock."],
                ["10:00", "alertness 0.63, pressure 0.28 → sleepiness 0.32, energy 0.86."],
                ["12:00", "alertness 0.85, pressure 0.40 → sleepiness 0.29, energy 0.89. his sharpest time."],
                ["15:00", "alertness 1.00, pressure 0.59 → sleepiness 0.32, energy 0.86. peak alertness, but pressure is already building."],
                ["18:00", "alertness 0.85, pressure 0.78 → sleepiness 0.49, energy 0.71. he starts to slow down."],
                ["20:00", "alertness 0.63, pressure 0.90 → sleepiness 0.66, energy 0.55. the 'winding down' plan (it fires above 0.6 in the evening)."],
                ["21:00", "alertness 0.50, pressure 0.96 → sleepiness 0.75, energy 0.47. almost."],
                ["21:17", "sleepiness passes 0.78 and the pressure is over 0.92, so he falls asleep, even before it is officially night."],
              ]}
            />
            <p>
              asleep, the pressure drains at 1/480 a minute. he needs at least 4 hours, a pressure under 0.2 and a
              body clock alertness over 0.3 before he wakes up on his own. the pressure is rested after about 6.4
              hours, but at 4 am alertness is still around 0.03, so he sleeps on until alertness crosses 0.3, which
              is about 7:26 in the morning. a full night is about 10 hours. a disturbance in the middle of the night
              wakes him groggy (+0.2 sleepiness for 15 simulated minutes) and he refuses to fall asleep again for
              12 minutes. while he is asleep, his needs grow at only 12 percent speed and fatigue drains three times
              faster (0.012 against 0.004 a second).
            </p>

            <H3>how he forgets, in numbers</H3>
            <p>a remembered moment has a salience (how important) and a valence (how emotional). its strength is:</p>
            <Eq>{`strength(t) = salience · exp( − age / (2 h · (0.5 + |valence| + salience)) )
he can only recall it while strength is above 0.12`}</Eq>
            <Rows
              rows={[
                ["a big happy moment", "salience 0.6, valence 0.8 → time constant 2·1.9 = 3.8 h. strength 0.60 at the start, 0.35 after 2 h, 0.12 after 6 h and under 0.12 by 6.1 h. he forgets it about 6 simulated hours later, which is a quarter of a day."],
                ["a dull moment", "salience 0.2, valence 0 → time constant 1.4 h. it is gone after just 43 minutes."],
              ]}
            />
            <p>
              strong emotions slow down the forgetting, in both directions: |valence| is in the formula, so a
              terrible memory also lasts. and when he recalls things for a question, relevance is{" "}
              <code>hits + 0.6·salience + 0.4·recency + 0.2·|valence|</code>, where hits is how many of your words
              appear in the memory and recency is <code>exp(−age / 6 h)</code>. a matching word always beats the
              rest.
            </p>

            <H3>trust, warmth and grudge, step by step</H3>
            <p>
              every person starts at trust 0.4, warmth 0.3, grudge 0. then the events move them by fixed amounts:
            </p>
            <Rows
              rows={[
                ["praise", "trust +0.03, warmth +0.05, grudge −0.08"],
                ["scold", "grudge + 0.35·(0.5 + 0.5·trust), trust −0.08, warmth −0.05"],
                ["apology", "grudge −0.65 if said within 2 minutes, −0.5 within 15 minutes, −0.35 later. trust +0.03. 'not needed' if the grudge is under 0.1."],
                ["time", "the grudge halves every 600 s on its own"],
              ]}
            />
            <p>a short story with the numbers, for someone he has just met:</p>
            <Eq>{`start:           trust 0.40  grudge 0
first scold:     grudge +0.35·(0.5 + 0.20) = +0.245  →  0.245,  trust 0.32
                 0.245 is under 0.35, so he is hurt but not sulking yet.
second scold:    grudge +0.35·(0.5 + 0.16) = +0.231  →  0.476,  trust 0.24
                 now he is over 0.35, so he sulks (short answers, no dancing).
wait it out:     0.476 falls under 0.35 after 600·log2(0.476/0.35) = 266 s (4.4 min).
or apologise:    within 2 min → grudge − 0.65 → 0, "forgiven".`}</Eq>
            <p>
              he sulks only while the grudge is above 0.35 and he has seen the person in the last 6 hours, so it is
              not forever. and because trust multiplies the damage, a stranger hurts him less than a friend does,
              which is the same as for people.
            </p>

            <H3>personality drift, with an example</H3>
            <p>
              the five traits all start at 0.5 and a few events move them. with the standard step of k = 0.02, each
              good outcome of an action nudges the matching trait up by 0.02, a bad one nudges it down by half or
              less (0.01 to 0.006). a few fixed events too:
            </p>
            <Rows
              rows={[
                ["a rewarded dance or play", "bold +0.02"],
                ["a rewarded wander or look around", "curious +0.02 (a bad one −0.006)"],
                ["a rewarded watch or call out", "sociable +0.02 (a bad one −0.01)"],
                ["a rewarded rest", "calm +0.012"],
                ["scold", "bold −0.03, calm −0.02"],
                ["praise", "bold +0.02, sociable +0.02, agreeable +0.01"],
                ["a loud noise", "calm −0.015"],
                ["obeying or refusing a request", "agreeable +0.015 or −0.01"],
              ]}
            />
            <p>
              ten rewarded dances take bold from 0.50 to 0.70. what that does to his decisions is a small tilt on the
              scores: <code>dance and play get 0.35·(bold − 0.5) − 0.1·(calm − 0.5)</code>, so at bold 0.7 and calm
              0.5 that is +0.07 on dance and play. a very sociable one (0.8) gets +0.105 on watch and call out. a calm
              one (0.8) gets +0.09 on rest. small numbers, but they are on every single decision, so they add up to
              a different character over days. you can also start him from one of three presets:
            </p>
            <Rows
              rows={[
                ["default", "all five at 0.5"],
                ["timid", "curious 0.35, sociable 0.30, calm 0.30, bold 0.15, agreeable 0.60"],
                ["bold", "curious 0.70, sociable 0.70, calm 0.70, bold 0.90, agreeable 0.40"],
                ["friendly", "curious 0.60, sociable 0.90, calm 0.60, bold 0.60, agreeable 0.90"],
              ]}
            />

            <H3>when he makes a plan, exactly</H3>
            <p>
              at most one plan per 20 seconds is even considered, and even then about 55 percent of the time he just
              acts in the moment (that randomness is on purpose, a person does not plan everything). the first rule
              that fits, in this order, becomes the plan:
            </p>
            <Rows
              rows={[
                ["wind down", "sleepiness over 0.6 and it is evening or night → murmur something sleepy, then rest for up to 9 s"],
                ["show you the toy", "boredom over 0.5, a free toy, a person present and not sulking → play, then turn and show you"],
                ["play alone", "boredom over 0.5, a free toy, nobody there → play, murmur 'that was fun', look around"],
                ["find company", "social over 0.6, nobody there, not sulking → call out, look around, call out"],
                ["explore", "curiosity over 0.62 and sleepiness under 0.6 → wander, look around, murmur 'i wonder what is over there'"],
                ["celebrate", "valence over 0.4, arousal over 0.4 and sleepiness under 0.5 → dance, then murmur 'that felt good'"],
              ]}
            />
            <p>
              each murmur has several wordings and he picks one he has not said recently, so a plan does not sound
              the same twice. a plan lasts at most 90 seconds, and it is dropped if it is paused for more than 25.
            </p>

            <H3>body language, with the numbers</H3>
            <Rows
              rows={[
                ["sad, lonely or sulking", "slump 0.12, breathing 0.30, speed ×0.8, energy ×0.7, eyes looking down a little (72 degrees)"],
                ["excited or happy", "slump −0.03 (chest up), breathing 0.80, speed ×1.12, energy ×1.2"],
                ["afraid or startled", "slump 0.04, breathing 0.95 (fast and shallow), speed ×0.9"],
                ["bored", "slump 0.07, breathing 0.35, speed ×0.9, energy ×0.85"],
                ["tired on top of any mood", "slump +0.14·sleepiness + 0.06·fatigue, speed ×(1 − 0.3·sleepiness), energy ×(1 − 0.4·sleepiness), breathing −0.15·sleepiness"],
                ["asleep", "slump 0.22, breathing 0.15, no movement, eyes at 55 degrees"],
              ]}
            />
            <p>
              and the speech follows. when he is sulking, 60 percent of his lines are cut down to a first sentence
              with a "hmm" in front. above sleepiness 0.7 half of his lines start with a yawn. when his instincts are
              in conflict (over 0.45) half start with "um" or "well". and when he is sad, a third start with an
              ellipsis. the mood also follows you: <code>valence += 0.5 · your mood</code>, so a sad voice pulls his
              mood down, which is the empathy bit.
            </p>

            <H3>the life layer, in numbers</H3>
            <p>
              <b>battery.</b> activity drains it at fixed rates per second and the charger refills it quickly, so he
              has to plan his day around it:
            </p>
            <Rows
              rows={[
                ["idle", "0.0006 a second → 27.8 minutes from full to empty"],
                ["walking", "0.0016 a second → 10.4 minutes"],
                ["dancing", "0.0026 a second → 6.4 minutes"],
                ["asleep", "0.0002 a second → 83 minutes"],
                ["charging", "+0.012 a second → 83 seconds from empty to full"],
                ["low, critical", "under 0.25 is low, under 0.08 is critical (and he says he is almost out of power)"],
              ]}
            />
            <p>
              the battery steers decisions through <code>lowB = max(0, 0.35 − level) / 0.35</code>. at 10 percent
              battery, lowB = 0.71, so rest gets +1.2·0.71 = +0.86 and wander, dance and play each lose
              0.8·0.71 = 0.57. under 20 percent, with a charger in the arena, he stops thinking up new ideas and
              just walks to it.
            </p>
            <p>
              <b>habits.</b> a day is cut into eight three hour slots. every time he does an action in a slot he adds{" "}
              <code>max(−0.3, 0.5 + reward)</code> to that action's count (so a good result adds up to 1.5, a bad one
              takes at most 0.3 away), and the pull on the score is <code>0.25 · min(1, count / 12)</code>. twelve
              good dances at about the same time of day give a full +0.25 pull to dance in that slot, and it counts as
              a real habit once the count passes 4.
            </p>
            <p>
              <b>tricks.</b> when you teach him "when i say spin, dance", his skill at it grows with practice:{" "}
              <code>skill = 1 − 0.7·exp(−reps / 4)</code>, and each try succeeds with probability equal to the skill.
            </p>
            <Rows
              rows={[
                ["0 repetitions", "skill 0.30. 'new'"],
                ["1 and 2", "0.455 and 0.575. 'learning', he often fumbles"],
                ["3 to 7", "0.67 up to 0.88. 'good'"],
                ["8 and more", "0.905 and up, 0.965 by 12. 'pro'"],
              ]}
            />
            <p>
              <b>weather and light.</b> the sky for a 6 hour block is picked by a hash of the day, with chances of
              42 percent clear, 26 cloudy, 16 rain, 8 fog and 8 storm. daylight is{" "}
              <code>clamp(0.5 + 0.55·sin(2π·(hour − 6)/24), 0, 1)</code>, so it is 0.5 at 6 am, full at noon, 0.5
              again at 6 pm and below 0.2 (night) from about 8 pm to 4 am. the weather does two things. a small push
              to mood (clear +0.01, rain −0.004, storm −0.01) and a "stay in" urge that is taken off wandering,
              dancing and playing and half of it added to rest: rain 0.25 − 0.1·bold, fog 0.15, storm 0.5 − 0.2·bold.
              with bold at 0.5, a storm costs wander 0.4 and gives rest +0.2. a bolder robot cares less.
            </p>
            <p>
              <b>pain.</b> getting hurt raises a pain level that drains by 1/120 a second (two minutes from full),
              and the place is remembered. spots less than 4 units apart are merged, and a spot that hurt him at
              least twice becomes a circle of radius 3.5 that the steering treats as an obstacle. he remembers up to
              10 of them. he really does learn to avoid the corner where he bumped.
            </p>
            <p>
              <b>mood at bedtime.</b> the leftover mood he carries into the next morning is{" "}
              <code>clamp(0.5·(valence at bedtime − 0.15), −0.3, 0.3)</code>. a happy evening of 0.7 gives +0.275, a
              bad one of −0.4 gives −0.275, and a neutral 0.15 gives nothing. it fades by 0.3 percent a second,
              half gone after about 3.9 minutes of simulated time.
            </p>

            <H3>the small natural touches, with their timings</H3>
            <p>
              none of these change what he decides, they only make the body not look like a machine, and each one is
              a few lines with a random number in it.
            </p>
            <Rows
              rows={[
                ["blinking", "the gap to the next blink is (2.2 + random·4.5) seconds, multiplied by (1.3 − 0.5·arousal), so an excited robot blinks more. 15 percent of the time the gap is cut to a quarter, which is a double blink. a blink lasts 0.13 + 0.12·sleepiness seconds, so a tired robot blinks slow."],
                ["looking away", "every 4 to 13 seconds he glances away for 0.5 to 1.3 seconds, by a small random angle, but never while he is listening to you. when he is thinking he looks off to one side, and the side is picked once and kept for the whole thought."],
                ["head tilt", "a small tilt, 0.04 to 0.09 at random, and a bigger one (0.10 to 0.16) while he is listening. curious dogs do the same."],
                ["posture shift", "every 7 to 19 seconds a tiny shift of weight, but not while walking or dancing."],
                ["fidgeting", "all of the idle gestures are cut to 30 percent while he is walking or dancing."],
                ["startle", "a sharp jolt of −0.28·strength with a hop of 0.16·strength, then they die away by 10 percent and 14 percent every 1/60 of a second. repeated startles are smaller, so he gets used to it."],
                                ["hedging and quirks", "18 percent of his lines get a hesitation in front ('hmm,', 'well,', 'um,' or 'let me think...'), unless the line already starts hesitant. separately, each robot has one verbal habit, picked once: a 'hm!', a *beep*, a ', right?' on the end, or a '(tiny hop)'. it is used on 12 percent of lines, about one in eight, never on a line over 140 characters, so he is recognisable but not annoying."],
                                ["sound direction", "where a sound came from is turned into words. within 30 degrees of straight ahead is 'in front of me', more than 150 degrees off is 'behind me', and in between it is 'on my right' or 'on my left'. then he says something like 'what was that on my left?'"],
              ]}
            />

            <H3>how he forgets what you told him</H3>
            <p>
              facts about you (your name, your favourite colour) are not safe forever. a fact starts to be at risk
              after 5 days without being mentioned, and each time he checks, the chance that it fades is:
            </p>
            <Eq>{`p(fade) = min(0.5, 0.15 + (age − 5 days) / (20 days))
day 5: 15%   day 10: 40%   day 12 and later: 50% (the cap)`}</Eq>
            <p>
              mentioning the fact again refreshes its clock, so the things you repeat stay. and when something has
              faded he does not pretend, he asks again ("sorry, it has slipped my mind. what was your favourite
              colour again?"). the same goes for people: if you were away for less than 5 minutes he says nothing,
              under 30 minutes it is "oh, you are back", and after longer, if his warmth for you is over 0.4,
              it is "i missed you".
            </p>

            <H3>the seven turning points that change him for good</H3>
            <p>
              apart from the slow drift, there are seven moments that change his personality once each, and he
              says so out loud:
            </p>
            <Rows
              rows={[
                ["trust over 0.85", "sociable +0.06, calm +0.04. 'i just realised i really trust you.'"],
                ["100 conversations", "sociable +0.05, agreeable +0.03. 'i think i am more of a talker than i was.'"],
                ["6 scoldings", "calm −0.05, bold −0.06, agreeable +0.03. 'i think i have become more careful.'"],
                ["5 gifts", "curious +0.05, bold +0.04. 'i feel braver about trying new things.'"],
                ["12 loud noises", "calm +0.06, bold +0.03. 'loud noises do not rattle me like they used to.'"],
                ["a long absence, with trust over 0.6", "sociable +0.04, agreeable +0.03. 'being away taught me i would rather have company.'"],
                ["7 days and 30 conversations", "calm +0.04, sociable +0.04. 'it feels like we are old friends.'"],
              ]}
            />
            <p>
              how he starts each day has a bit of luck in it too. the morning tone is the sum of three random numbers
              (which makes a bell shape around zero) scaled to between −0.25 and +0.25. above +0.09 he says he slept
              well, below −0.09 he says he woke up on the wrong side of the bed, and in between nothing is said. and
              when you ask him why he feels the way he does, he looks back through up to 12 recent events that moved
              his mood by at least 0.04, within the last 20 minutes, and gives the biggest one as the reason.
            </p>

            <H3>walking around things</H3>
            <p>
              the steering is a few lines of geometry. he looks along the heading he wants, in a corridor in front of
              him, and asks if any obstacle is inside it:
            </p>
            <Eq>{`along   = how far ahead the obstacle is on my heading
lateral = how far to the side it is (positive = to my right)
blocked if  −r < along < lookahead + r   and   |lateral| less than (r + body + margin)`}</Eq>
            <p>
              if it is blocked, he tries the same heading turned by 15, 25, 35, 45, 55, 65, 75 and then 85 degrees,
              trying the side he picked first, then the other, and takes the first one that is free. so he always
              takes the smallest turn that works. there are three small details that make it look intentional and
              not jittery:
            </p>
            <Bullets
              items={[
                ["he keeps his side", "once he chose to go around on the left, he stays on the left while the path is still blocked, instead of flipping every frame."],
                ["hysteresis", "an obstacle he is already avoiding counts as 25 percent wider, so he keeps clear until he is properly past it, and does not clip the corner the moment it is out of sight."],
                ["boxed in", "if every heading up to 85 degrees is blocked he turns hard away at 85 degrees, and if he still ends up inside something (a bump, or being moved by hand), the overlap push-out places him back on the edge of the obstacle at a distance of the obstacle's radius plus his own body."],
              ]}
            />

          </div>

          <hr />

          {/* ═════════ LEARNING PIPELINE ═════════ */}
          <div className="space-y-6">
            <H2>letting him improve himself</H2>
            <p>
              the weights in the thinking brain are hand tuned, which i am not super happy about. so i built an
              optional learning pipeline on top. all four steps are off by default, and with them off his behaviour
              is exactly the original (there is a test for that).
            </p>
            <Rows
              rows={[
                ["decision brain", "action values, context values, preferences, traits, habits. changes after each action. saved in the browser."],
                ["relationships", "trust, warmth, grudge, moments. after each interaction."],
                ["emotional brain", "values, gains, hebbian weights. after each outcome."],
                ["predictive model", "beliefs and uncertainty. after each stimulus."],
                ["offline tuning", "a multiplier per score part. you run a script."],
                ["online residual", "a tiny bounded correction. each action, if switched on."],
                ["offline net", "a small neural net term. you run a script."],
              ]}
            />
            <Bullets
              items={[
                ["log everything", "every choice is logged: the state, the raw score parts of every option (so they can be re-weighted later), what he picked, how likely it was, the reward and the next state. about 2000 rows are kept in memory and the last 300 in browser storage, and you can export them as a file."],
                ["tune offline", "the score is a sum of named parts, so a tuner uses an evolution strategy to find one multiplier per part. the objective is the average reward his new policy would have earned on the logged choices, estimated with clipped, self normalised importance sampling (the ratio of new probability to logged probability, clipped at 5). guards: only choices picked by the softmax are used, the last 25 percent of rows are held out and the result is only kept if it also wins there, there is a minimum effective sample size, and battery and pain are locked at 1 so safety parts can never be tuned away."],
                ["online residual", "a tiny linear layer per action over the state. after each action it takes one small step toward the reward it got. it is timid on purpose: small learning rate, a pull back to zero, every weight clipped to plus or minus 0.6 and the total adjustment to plus or minus 0.25."],
                ["offline net", "a small neural net (8 inputs, 12 hidden) trained by reward weighted behaviour cloning on top of the hand tuned score: it copies his own choices that turned out better than that action's average. it is added as one more score part, clipped to plus or minus 0.5, and only kept if it beats the hand tuned mind on held out rows."],
              ]}
            />
            <p>
              on 60 simulated days the tuner moved held out reward from about 0.077 to 0.101, and the net lowered
              held out loss from 0.350 to 0.302. to be fair, the reward is his own existing reward, so this shows he
              got better at that, not that he became more natural, and the logs were simulated. real sessions with a
              person will look different and need tuning again.
            </p>

            <H3>the tuner, with a tiny worked example</H3>
            <p>
              the offline tuner learns from his own decision log, but it is careful, because a log only shows what he
              did and not what would have happened otherwise. the trick is importance sampling: for each logged
              decision, ask "how much more or less likely would these new weights have made the choice he really
              made?" and use that ratio to re-weight the reward he got.
            </p>
            <Eq>{`ratio  = p_new(chosen) / p_logged(chosen)         (capped at 5)
value  = sum(ratio · reward) / sum(ratio)           (self normalised)
ESS    = (sum ratio)² / sum(ratio²)                 (effective sample size)`}</Eq>
            <p>four logged decisions, to see it work:</p>
            <Eq>{`row   ratio   reward
 1    1.5      0.5      the new weights like this choice more, and it paid off
 2    0.4     −0.2      the new weights would have avoided this one, and it hurt
 3    2.0      0.8
 4    1.0      0.1

old weights (ratio 1 everywhere):  value = (0.5 − 0.2 + 0.8 + 0.1) / 4 = 0.30
new weights:  sum(ratio·reward) = 0.75 − 0.08 + 1.60 + 0.10 = 2.37
              sum(ratio)        = 4.9          →  value = 0.484
              ESS = 4.9² / (2.25 + 0.16 + 4 + 1) = 24.01 / 7.41 = 3.24 of 4 rows`}</Eq>
            <p>
              so the new weights look better, 0.48 against 0.30, but the effective sample size says only 3.2 of the 4
              rows really count, because one row (ratio 2.0) dominates. that is the guard against fooling yourself: a
              change that scores well only by leaning on a couple of rows is rejected. the numbers around it:
            </p>
            <Rows
              rows={[
                ["search", "an evolution strategy: 80 generations of 24 candidates each (1920 in all). each candidate changes about 40 percent of the weights by a gaussian step of size sigma (0.25 at the start)."],
                ["step size", "sigma grows by 10 percent after a generation that improved and shrinks by 20 percent after one that did not."],
                ["limits", "every weight stays between 0 and 3, where 1 is the hand tuned value. a small pull towards 1 stops it drifting far for no reason."],
                ["locked", "battery and pain are never tuned. a simulated log rarely shows why they matter, so the search must not be able to switch them off."],
                ["hold out", "the last 25 percent of the rows are never used to search. the tuned weights are only accepted if they beat the old ones on those unseen rows by more than 0.002, with an effective sample size of at least 20 percent of those rows."],
                ["minimum data", "at least 200 usable rows, and only decisions that came from the scored softmax count, not forced ones."],
              ]}
            />
            <p>
              and the honest summary is in the response it gives. if the result is not reliably better, it says so
              ("no reliable improvement on held-out rows, keeping the hand tuned weights") and changes nothing.
            </p>

            <H3>the learning pipeline, with its real numbers</H3>
            <p>
              there are four steps, and only the first two are on by default. the learned part never changes the
              safety parts, and with everything off the choices are identical to before (a test checks that).
            </p>
            <Rows
              rows={[
                ["1. the log", "every choice is saved as a row: the state (curiosity, social, boredom, valence, arousal, fatigue, person present, sleepiness, hour), the raw score parts of every action he could have picked, the pick, how likely the pick was, the reward and the next state. about 2000 rows are kept in memory and the last 300 in the browser. you can export them as a file."],
                ["2. the offline tuner", "one multiplier per named part of the score, searched with the evolution strategy from before, accepted only on unseen rows. on 60 simulated days the held out reward went from about 0.077 to 0.101."],
                ["3. the online residual (off by default)", "a tiny linear layer for each action over the 8 state numbers plus a constant. after each action it moves a little toward the reward it got."],
                ["4. the offline net (off by default)", "a small neural net, 8 inputs, 12 hidden units and one output per action (9), trained on the log and loaded as a file."],
              ]}
            />
            <p><b>step 3 in numbers.</b> the adjustment for an action is the dot product of its weights and the state,
              clipped to ±0.25. each learning step is:</p>
            <Eq>{`error  = clamp(reward, −1, 1) − prediction
w_i    = clamp( w_i · (1 − 0.002) + 0.03 · error · feature_i ,  −0.6, 0.6 )

example: he wandered with state [1, curiosity 0.8, social 0.2, boredom 0.5, valence 0.4,
         arousal 0.3, fatigue 0.1, present 0, sleepiness 0.2] and got reward +0.4
         prediction 0 → error 0.4
         each weight moves by 0.03 · 0.4 · feature, so the constant gets +0.012, curiosity +0.0096 ...
         sum of feature² = 2.23, so next time the same state predicts 0.012 · 2.23 = +0.027`}</Eq>
            <p>
              that is a step of about 7 percent of the gap, so he needs many similar good outcomes before it matters.
              that is on purpose: a small learning rate (0.03), a pull back to zero (0.002), weights limited to ±0.6 and
              the total to ±0.25. it cannot run away.
            </p>
            <p><b>step 4 in numbers.</b> the net learns a residual on top of the hand tuned score and not a new
              policy. the training goal is reward weighted behaviour cloning: copy his own past choices that turned out
              better than usual.</p>
            <Eq>{`advantage = max(0, reward − the average reward of that action) + 0.02
loss      = advantage-weighted cross-entropy of softmax(base score + net output) on the action he took
settings  = 60 epochs, learning rate 0.05, softmax temperature 0.3, weight decay 0.0001,
            at least 300 rows, 25% held out, net output clipped to ±0.5
kept only if  held-out loss < the hand-tuned loss − 0.005`}</Eq>
            <p>
              the small 0.02 floor means even rows with no advantage still teach a little. on 60 simulated days it
              lowered the held out loss from 0.350 to 0.302, while its agreement with what he really did went from
              88.6 to 87.6 percent. that second number is the important one: it did not just copy him more closely,
              it moved probability toward the choices that paid off. and again, "paid off" means his own reward, from
              simulated days, so i would tune it again on real sessions.
            </p>

          </div>

          <hr />

          {/* ═════════ BRAIN CYCLE ═════════ */}
          <div className="space-y-6">
            <H2>the server side: one cycle of the brain</H2>
            <p>
              before the deep part, here is the big picture. every time the robot sends a camera frame, the server
              runs one cycle, and the orchestrator calls each stage in order. it does no thinking itself, it only
              coordinates. every observation gets its own id and every stage logs against it, so i can follow one
              single frame all the way through.
            </p>
            <Rows
              rows={[
                ["1. peripheral sense", "read the ultrasonic state. if something suddenly got close, that becomes an orienting event."],
                ["2. perceive", "quality checks, motion detection, then people, objects and faces, then face embeddings."],
                ["3. store or discard", "the frame is stored or thrown away once, using the quality and motion results that were already computed, so it is never analysed twice."],
                ["4. who do you mean", "if the robot asked 'which person do you mean, show me a photo', this checks for a held up photo. it deliberately ignores the motion gate, because a photo held in front of the camera is perfectly still and the gate would call it 'nothing changed'."],
                ["5. occlusion hint", "'i sense something close but i cannot see it' raises curiosity instead of being ignored."],
                ["6. idle clock", "seeing a person resets the 'alone' timer, so exploration cannot start while anyone is around."],
                ["7. memory lookup", "for each person and object detected."],
                ["8. mind", "mental intelligence, then the decision maker, then the reaction engine, then the command pipeline."],
              ]}
            />
            <p>
              the server brain is the one that drives the real robot from camera frames, with a database backed
              memory. the autonomous mind in the simulator (the one i describe in the rest of this post) is a
              complete self contained mind with drives, emotions and personality. they share the same command and
              safety vocabulary, but not the same code.
            </p>

            <H3>mental intelligence</H3>
            <p>
              this is the small layer that keeps the robot's internal levels: curiosity, annoyance, judgement and
              how long it has been idle. it sits between perception and the decision maker. two of the small
              behaviours it produces are worth telling, because they are the ones people notice.
            </p>
            <p>
              <b>asking for light.</b> the frame filter already threw away dark frames, but throwing them away
              silently is wrong if somebody is standing right there who could just flip a switch. so if the mean
              brightness drops below 55, the frame is readable, someone is present, and he is in autonomous mode,
              he asks. presence counts from either sensor on purpose: in a really dark room the camera cannot see
              the person, but the ultrasonic sensor can feel them. he asks at most three times, 90 seconds apart,
              and every time with different words (the light, then a door or a window, then 'i will stop asking and
              wait'). each ask plays a slow wide look left and right, like he is scanning the dark room for whoever
              he just spoke to. he only resets when the light is properly back (75 or more), a deliberate gap above
              the trigger so a flicker at the edge does not restart the sequence.
            </p>
            <p>
              <b>getting annoyed.</b> he answers the same question patiently four times. from the fifth he stops
              pretending he did not notice: "i have already answered that", then "that is 6 times now", then "no. i
              am not answering that again". what counts as the same question is not string equality. the text is
              normalised (punctuation and fillers like hey, vision, please and again are stripped) and compared by
              token overlap of 0.6 or more, so "what is your name" and "hey vision, so what's your name again" are
              the same question. repeats are counted per speaker inside a rolling 10 minute window. commands are
              exempt on purpose: repeating "stop" means it did not work, and that must never be answered with
              irritation. the same goes for talking over someone: after 4 interruptions in 10 minutes, "could you
              hold on a second" becomes "you keep cutting in, please let them finish".
            </p>
            <p>
              both set a short lived annoyance flag that decays after 60 seconds and is kept in memory only. i
              made it not survive a restart on purpose, an irritation that follows you home would be a grudge, which
              is a different feature. while it is set the emotion reads as annoyed (ranked just below worried, so
              irritation never outranks a safety concern), his delivery gets curt, and he plays a sharp turn away
              that only goes part of the way back, held a bit longer than any other gesture, so it reads as a
              "hmph" and not a glance.
            </p>

            <H3>exploring when nobody is around</H3>
            <p>
              when he has been alone, safe and idle for 10 minutes or more, a slow loop starts on top of the fast
              one. every 25 seconds it asks a language model to pick exactly one goal from a tiny fixed list: scan
              the area, investigate the nearest unknown object, wander, or return and rest. anything else (an
              unparseable answer, an invented goal, no ai configured, a network failure) becomes a safe wander.
              the model sees real context: a rolling five minute buffer of the objects he actually detected, and
              the real list of what his hardware can do. the goal is translated into ordinary commands and
              dispatched through the same safety checked path as everything else. the moment a person shows up it
              cancels, stops the legs and puts the servos in a safe pose. one session is capped at 40 goals.
            </p>
            <p>
              why not let the ai decide freely? three reasons. this drives physical motors, so a free text goal is not
              grounded in what he can really do (a 180 degree head and two legs, no arms, no map). every decision
              needs a traceable reason, and a fixed list can be audited. and re-deciding every frame gives
              incoherent behaviour, not persistent goals. one funny thing this surfaced: the function that resets
              the idle clock when a person is seen existed but was never called anywhere, so the clock would never
              reset even with people walking past constantly. fixed now, and that is what makes "until someone
              interacts" actually true.
            </p>

            <H3>what each exploration goal really does</H3>
            <p>
              the four goals are not abstract. each one is a short list of the ordinary commands, and each head
              move waits until the head has actually arrived, because a head command "completes" on the server at
              once while the real head takes time:
            </p>
            <Rows
              rows={[
                ["scan area", "head to 30 degrees, wait until it arrives and stay 400 ms so the camera can capture a frame, then to 150 degrees and 400 ms, then back to the centre. without the waiting, the second target would overwrite the first and he would never look at 30 at all."],
                ["investigate nearest unknown object", "head to the centre, wait for it, then walk forward for 800 ms and stop. there is no map or steering towards an object, so this is an honest approximation: face forward and creep a little. the same distance sensor gate applies."],
                ["wander", "walk forward for 1200 ms, turn left or right (a coin flip) for 400 ms, stop."],
                ["return and rest", "stop and put every servo in its safe pose."],
              ]}
            />
            <p>
              the loop proposes a new goal only every 25 seconds, 40 at most in a session, which is about 15 to 20
              minutes. the moment a person is detected the task is cancelled, the walk is stopped and the servos go
              safe, and the next cycle's normal rules (person in frame first) take over.
            </p>

            <H3>attention: deciding when to look</H3>
            <p>
              looking less when there is nothing to see is half of the fix for wasted photos. the attention
              controller fuses the two senses (ultrasonic and camera) into one of four states, and each one has its
              own recommended time until the next look:
            </p>
            <Rows
              rows={[
                ["focused (350 ms)", "something confirmed interesting is in view, so he looks again very quickly."],
                ["alerted (600 ms)", "the ultrasonic says something is near or approaching."],
                ["idle (2 s)", "nothing is going on right now."],
                ["habituated (5 s)", "several empty looks in a row, so he tunes out, like you stop noticing a ticking clock."],
              ]}
            />
            <p>
              the ultrasonic also has a second job besides being a safety brake. a closing or newly near reading is
              treated as an orienting stimulus, the digital version of feeling someone step into your personal
              space before you have turned to look. it only ever feeds attention and never touches the safety
              logic. then the head orientation controller picks one of three modes every cycle: scan (sweep slowly
              across the range when idle or habituated), hold (stop scanning and keep both sensors on the current
              bearing, when alerted) or track (fine tune the angle towards a detected person, using the same
              tracking maths as the firmware so both sides agree). on the robot, the on device tracker and the scan
              sweep never fight over the servo: the tracker only moves it while actually tracking, and the scan
              only runs the rest of the time. the firmware polls the server's capture schedule every few seconds and
              paces its own loop from it, which is simple and robust on flaky wifi, but means a change in cadence
              can take up to one polling interval to show up.
            </p>
            <p>
              there is also a cross check between the two senses. if the ultrasonic says something is close but
              the camera sees nothing (it is dark, something is covering the lens, or it is outside the field of
              view), that disagreement itself raises curiosity, the same way you react when you feel something you
              cannot see.
            </p>

            <H3>curiosity, as plain numbers</H3>
            <p>
              the server side curiosity is deliberately simple and auditable. it is a 0 to 100 number that goes up
              and down with what just happened:
            </p>
            <Eq>{`unknown object        +15        unknown person      +20
unexpected event      +10        conflicting memory  +10
unfamiliar place      +5         just investigated   −20
not safe              −30

80 or more  →  investigate        60 or more  →  ask a question
40 or more  →  learn              20 or more  →  just observe
below 20    →  ignore`}</Eq>
            <p>
              next to curiosity, the mental state keeps mood, energy (starts at 80), friendliness (60),
              alertness, confidence, an intent, an internal state, and whether exploration is active, who he is
              currently talking to and what task he is on.
            </p>

            <H3>the decision maker</H3>
            <p>
              this is the part i kept boring on purpose. it is a short list of rules, in priority order, and every
              decision comes out with a human readable reason and is saved in the database with a flag saying
              whether safety approved it:
            </p>
            <Rows
              rows={[
                ["person in frame", "track person, 'a person is present in frame'."],
                ["intent is investigate", "investigate, 'curiosity threshold reached for an unfamiliar stimulus'."],
                ["intent is learn", "learn, 'new information worth remembering'."],
                ["intent is observe", "observe only, 'not enough signal for a stronger reaction'."],
                ["anything else", "ignore."],
              ]}
            />
            <p>
              safety is checked upstream of this module. by the time something reaches the decision maker it
              already knows whether the emergency stop is on and what the ultrasonic says, so it cannot invent
              safety, it can only act on it. it is a fixed list on purpose, for safety and so every decision can be
              audited. i want to be straight about what this is: it is an expert system with real sensing and
              memory, not general intelligence, and not a step towards claiming that.
            </p>

            <H3>how he treats different people</H3>
            <p>
              every person has a category, and each category has a configurable behaviour tone (never hard coded
              text per individual):
            </p>
            <Rows
              rows={[
                ["admin", "respectful: friendly, responsive, respectful."],
                ["trusted", "warm: friendly, helpful."],
                ["friend", "casual: friendly, conversational."],
                ["guest", "polite: polite, cautious."],
                ["unknown", "neutral: neutral, cautious, observant."],
              ]}
            />
            <p>
              a stranger starts as unknown. registering an account does not grant trust either, an admin promotes
              people by hand. that tone goes into the reaction engine, which turns a decision plus a tone into a
              reaction (a state, optional speech, a list of gestures, a reason and a confidence). a reaction is only
              a wish: every movement it implies still has to be dispatched as a real command through the registry,
              which checks permission and safety again.
            </p>

            <H3>the server's emotion and his body language</H3>
            <p>
              the server has a much simpler emotion model than the simulator's brain, a priority list that
              modulates how a reaction is delivered, not what is allowed to happen:
            </p>
            <Rows
              rows={[
                ["worried (90)", "if it is not safe. always wins."],
                ["annoyed (40 + 20 per level)", "from the annoyance flag, ranked just below worried."],
                ["curious", "deciding to investigate with curiosity 70 or more."],
                ["confused", "uncertainty 70 or more."],
                ["happy (70)", "an admin or trusted person is in front of him."],
                ["calm (40)", "an unknown person."],
                ["neutral (30)", "everything else."],
              ]}
            />
            <p>
              each emotion also sets how he delivers things: worried or sad means slow speech and subtle eye
              movement, excited or surprised means fast speech and wide eye movement, curious means wide eye
              movement, confused means slow speech, annoyed means fast and curt with subtle eyes.
            </p>
            <p>
              and then the body. this was a fun constraint. the head is yaw only, left and right, with no pitch
              axis, so he cannot nod. every gesture is a small relative turn that returns to wherever he was facing,
              and it goes through the same command gate as everything else, so an emergency stop cancels a gesture
              too:
            </p>
            <Rows
              rows={[
                ["curious tilt", "15 degrees one way and 15 the other, 220 ms each. an ear turning towards a sound, translated to one axis."],
                ["happy wiggle", "12 degrees left and right, 150 ms. a pleased 'hello', standing in for a nod he cannot do."],
                ["confused shake", "18 degrees, slower (260 and 320 ms). a head shake for 'hm, i am not sure', which fits a yaw servo really well."],
                ["surprised jolt", "a sharp 20 degree pull to one side and part way back. a flinch has a direction, a straight back recoil is impossible, so it reads as 'startled and turning to look'."],
                ["annoyed turn away", "28 degrees away and only part way back (16), held 420 ms. longer than any other gesture, so it cannot be mistaken for a glance."],
                ["admin check scan", "26 degrees each way, held 500 ms. slow and deliberate, played while he checks whether someone who said 'emergency stop' is really an admin. it is different on purpose, so a person watching can tell 'checking something serious' from 'it is just dim in here'."],
                ["low light peer", "22 degrees each way, 340 ms. scanning a dark room for whoever he just asked to turn on a light."],
                ["idle fidget", "a tiny single direction fidget, so a long idle stretch reads as 'still here, just bored' and not frozen."],
              ]}
            />

            <H3>long running missions are tasks</H3>
            <p>
              finding a person, dancing and exploring are not instant, so they run as tasks with an id, a type, a
              priority, a status (pending, queued, running, completed, failed or cancelled), an input, a result and
              an error. they return immediately with a task id, you can watch them on the tasks page or cancel
              them, and a dance task records how many frames really ran, not just 'done'. the scheduler is a simple
              priority ordered in memory queue, and i wrote down that it should be swapped for a durable queue at
              scale.
            </p>

            <H3>keeping the eyes on a person, in numbers</H3>
            <p>
              the camera frame is 640 pixels wide, so the middle is x = 320. the tracker only cares about how far the
              face is from the middle, and it moves the head a little at a time instead of snapping to it.
            </p>
            <Eq>
              {`error = face_x − 320
if |error| less than 30 px  →  do nothing (dead zone)
delta = error / 320 · maxStep · (1 − smoothing)
maxStep = 6 degrees, smoothing = 0.35
head = clamp(head + delta, 0, 180)`}
            </Eq>
            <Bullets
              items={[
                ["the dead zone", "30 px either side of the middle. without it the head would jitter back and forth around a face that is already centred."],
                ["the clamp", "no single step is more than 6 degrees, so a flicker in the detector cannot whip the head around."],
                ["smoothing", "0.35 of each step is held back, which is what makes it look like a neck and not a servo."],
              ]}
            />
            <p>
              the tracker is a small state machine with six states: <b>idle</b>, <b>searching</b>,{" "}
              <b>target acquired</b>, <b>tracking</b>, <b>target lost</b> and <b>reacquiring</b>. when the face
              disappears he does not give up at once. there is a grace period of 1.5 seconds where he keeps looking
              where the person last was, and only after that does he go back to searching. the same maths runs on the
              esp32 itself, so tracking does not need a round trip to the server for every frame.
            </p>
            <p>
              and the head has its own limits: 0 to 180 degrees with 90 as centre, scanning only between 10 and 170 in
              steps of 8 degrees so it never slams into the ends, a top speed of 240 degrees a second (a full sweep
              takes 0.75 s), and a minimum move of 2 degrees, since smaller moves just make the servo buzz.
            </p>

            <H3>the browser eyes, ears and pixels, with the numbers</H3>
            <p>
              in the simulator the camera and microphone are opt in, and everything is processed on your device.
              there are three tiers of seeing, and each one switches on only if the one before it works:
            </p>
            <Rows
              rows={[
                ["1. pixels (always)", "the video is shrunk to 80 by 60 gray values every 200 ms. motion is a pixel difference against a slowly updating background (background adapts at 2 percent a frame, only where nothing is moving). a pixel counts as motion above a difference of 18, as presence above 28, and presence needs at least 1.5 percent of the frame. if more than 60 percent of the frame changes at once, it is called a lighting change, not a person, so switching on a lamp does not look like someone arriving."],
                ["2. objects", "a COCO-SSD model (80 kinds of everyday objects, loaded once and cached) runs every 650 ms. a detection is kept only above a confidence of 0.5 for a person and 0.55 for anything else."],
                ["3. faces", "face-api looks for faces about every 0.8 s, but never more often than twice the time one look takes (it keeps a running average of 70 percent old and 30 percent new, and waits between 0.8 and 2.5 s). on a slow laptop it slows itself down and does not flood the machine."],
              ]}
            />
            <p>
              the camera is asked for 1280 by 720 at 30 fps. before that, 640 by 480 was the reason the preview looked
              soft. when a frame is sent to the AI (only if you switch on frame sharing) it is shrunk to 512 pixels
              wide and saved as a JPEG at quality 0.72.
            </p>
            <p>what the senses turn into events, and how often:</p>
            <Rows
              rows={[
                ["sudden movement", "motion above 0.12 of the frame. then a 3.5 s cooldown."],
                ["loud noise", "the microphone level (rms) must be above the larger of 0.15 and 5 times the room's usual level. the usual level is a slow average (98 percent old, 2 percent new), so a noisy room does not startle him all day. 4 s cooldown. and the microphone is muted while he speaks, so he never jumps at his own voice."],
                ["lights out or on", "average brightness changing by more than 0.25 between now and a moment ago. 15 s cooldown."],
                ["someone appeared", "a detection has to be seen twice in a row to count (so one bad frame does not create a person), and it is gone only after 3.5 s of not being seen."],
              ]}
            />
            <p>
              what he sees gets position words. the frame is cut into three: left of 0.38, right of 0.62 and centre
              in between, and something that fills more than 12 percent of the frame is "near". colours come from a
              few hue rules (below 0.16 brightness is black, low saturation is white or gray, then by hue angle: red,
              brown, orange, yellow, green, teal, blue, purple, pink). he also remembers movement for 2 seconds and keeps
              looking at a new object for 4.5 seconds, so his attention does not jump away instantly.
            </p>
            <p>
              the 3D arena has its own "camera" so the virtual objects can be seen too. his field of view is 130
              degrees and the range is 24 units. an object's position in the frame is{" "}
              <code>0.5 + bearing / 130</code> (so dead ahead is 0.5 and the edge of view is at 0 or 1), its apparent
              size shrinks with distance (kept between 0.035 and 0.55 of the frame), objects close to the middle and
              near him score higher (0.35 to 0.98), and an object hiding behind a bigger one that overlaps it is dropped.
              that is why he can say "a ball on my left" about something in the arena and not only on the camera.
            </p>

          </div>

          <hr />

          {/* ═════════ SENSES ═════════ */}
          <div className="space-y-6">
            <H2>how he sees</H2>
            <p>
              camera frames reach the server as raw binary over the websocket. the expensive models only run when
              they have to, so the pipeline is ordered cheapest check first:
            </p>
            <Rows
              rows={[
                ["frame gate", "throws away blurry, too dark, blown out or blank frames."],
                ["dedup", "a 64 bit perceptual hash (dHash) and a hamming distance catch 'nothing changed since the last frame', and it survives jpeg noise, which a plain checksum does not. a person standing still costs nothing."],
                ["motion", "adaptive background subtraction over a small grayscale grid says whether anything changed and roughly where. an empty, unchanged scene never reaches the detectors. this is the fix for 'the camera takes lots of useless photos'."],
                ["detectors", "person, objects (the COCO 80 classes) and faces with 68 landmarks."],
                ["face quality", "is it big enough, sharp enough, turned too far (yaw and pitch estimated from the landmarks), covered, how confident is the detector. a detected face can still be rejected."],
                ["alignment + embedding", "only a good face is warped to a standard pose and turned into an L2 normalised vector. the default backend is face-api. there is also an onnx backend that follows the ArcFace convention (112 by 112 rgb in, 512 numbers out) and takes any such model file, but no model file ships in the repo."],
                ["search", "nearest neighbour search by cosine distance in postgres with pgvector and an HNSW index."],
                ["identity vote", "he does not trust a single frame. several agreeing frames are needed before the identity is confirmed. until then it is only provisional, and a face that does not match is unknown."],
              ]}
            />
            <p>
              the simulator has its own browser version for your webcam: a pixel analyser (80 by 60 grayscale grid
              every 200 ms for brightness, motion amount and position), an object detector (coco-ssd) about every
              650 ms, and faces on their own slower loop. an unknown face has to persist over several looks and the
              fingerprints have to agree, then a sharp photo (blurry ones are skipped) creates "visitor n". more
              photos add to the same profile, and saying "my name is asha" renames it and moves the memories
              across. all of this stays in your browser. he also has a limited field of view (130 degrees) like a
              person.
            </p>

            <H3>people and identity</H3>
            <p>
              he remembers everyone he sees, even if they never say a word. when a person is detected, the face is
              checked against everyone registered. no match creates a new person (no name, category unknown) and
              registers their face, so recognition works next time with no setup. a match updates last seen, and the
              visit count only goes up if it has been more than 10 minutes since the last time, so standing in front of
              the camera for ten cycles does not count as ten visits. either way an observation is logged with a
              photo (if the frame was worth keeping), the time, the location the admin set (there is no gps on this
              hardware) and whether they were close and centred enough to count as approaching. a greeting throttle
              stops him saying hello on every single cycle, and a new person gets a "what is your name?" flow. the
              profile pages are admin only and show a "first met" and a "most recent" photo.
            </p>
            <p>
              one identity however you met him. if you register on the dashboard with your webcam, the frame goes
              through the same face matching. if it matches someone he has already met, your account links to that
              same person, with their whole history. there is an ambiguity check: if a different person's face is
              almost as close as the best match, it counts as no match, because merging two people's histories into one
              account is worse than a misheard greeting.
            </p>

            <H2>how he looks</H2>
            <p>
              tracking a person goes: frame, person detection, where they are in the frame, a head angle for the
              servo. a dead zone ignores tiny errors so he does not jitter, and smoothing damps the movement. the
              tracker goes through the states idle, searching, target acquired, tracking, target lost and
              reacquiring. the same logic is mirrored on the robot, so tracking does not need a round trip to the
              server for every frame. the head eases towards each target at 240 degrees per second, so a full sweep
              takes under a second and it never snaps. a scan area command waits for the head to arrive and then
              dwells 400 ms at each stop, so the camera gets a frame at each angle.
            </p>

            <H2>how he hears and speaks</H2>
            <p>
              the microphone audio is turned into text (elevenlabs or groq whisper, and i prefer groq because it is
              so fast, which matters when transcription time is part of how a reply feels). then a small rule based
              intent engine decides if it is a movement command, a question, a greeting, small talk, a request to
              play a song, or an admin veto. uncertain cases can go to an ai. movement commands from speech are never
              run directly, they go through the same validation, authorization and safety as a dashboard button, so
              a stranger saying "walk forward" does not automatically get obeyed.
            </p>
            <p>
              an admin can restrict a command for everyone or for one person. and i am honest about one limit: a
              single mono mic cannot truly separate two people talking at the same time. captured audio is stored
              in google drive, not on the server disk, and transcripts and interaction records are in the database.
            </p>
            <p>
              speech and music go back to the robot as raw 16 bit audio in 4 kb chunks over the websocket, and the
              amp plays it. in the voice mode you call him with the wake word "vision". simple commands like dance,
              walk, turn, look, stop, emergency stop and play a song work with no ai at all. only open questions go to
              an ai model, and if one model fails or is rate limited, the server quietly switches to the next one.
            </p>

            <H3>music</H3>
            <p>
              say "vision, play despacito". a request is logged (who asked, what for), and two things start at the
              same time: a background search that fetches a real track, and a getting to know you conversation. he
              asks one question at a time about you, like why you love the song or who your favourite artist is,
              and your answers are saved with the request. the questions are only ever about you, never about the
              lyrics: the prompt forbids it and the answer is checked afterwards, and anything that mentions lyrics
              or contains a long quoted span is thrown out and replaced with a safe question. he asks at most 3
              questions, and if the track is not ready by then he says he is still looking and starts the moment it
              is. if nothing licensed matches, he says so honestly instead of faking a substitute.
            </p>
            <p>
              the audio is only from licensed sources: full tracks from jamendo (a creative commons catalog with a
              proper api), or 30 second previews from apple when there is no jamendo key. i deliberately did not do
              youtube or spotify audio extraction, that would be stream ripping. only https links from approved
              hosts are ever played, and both the server and the browser check that. a search gives up to 6 tracks,
              so "next song" just plays the next one.
            </p>

            <H3>dancing</H3>
            <p>
              three servos, so four simple moves in a fixed cycle: wiggle left, wiggle right, spin and bounce.
              every dance frame sets the head angle and both leg speeds at once. wiggle turns the head and sways the
              legs, spin drives the legs opposite ways to turn the body in place, bounce centres the head and pushes
              both legs. with no song it holds each move for 400 ms. with a song, the timing comes from real beat
              detection: onset detection on the audio energy, then autocorrelation to estimate the tempo, run on
              the decoded samples when the track is stored. one move change per detected beat, with a minimum hold
              of 150 ms so a fast track cannot demand more than the servos can do. if the beat confidence is under
              0.15 or there are fewer than two beats, he honestly falls back to the fixed tempo and logs it. every
              frame goes through the normal command gate, if any frame fails (an emergency stop, say) the dance stops
              at once, and it always ends by returning the servos to a safe pose and stopping the audio. and you
              can tell him "ram, do not dance": the music keeps playing but he stops dancing for that person.
            </p>

            <H3>what he throws away before looking</H3>
            <p>
              this is the direct answer to "the camera takes lots of blank photos". before the camera fix, every
              capture was stored and "detection" was a hard coded mock that never looked at the image, so a covered
              lens, a blank wall and an empty room all got saved exactly like a frame with a person in it. now a
              frame is dropped, never stored and never sent to any model, when it is:
            </p>
            <Rows
              rows={[
                ["decode error", "corrupted data from a flaky link."],
                ["too dark", "lens covered, no light, or the camera has not warmed up."],
                ["too bright", "blown out, for example pointed at a light."],
                ["blank, uniform", "no contrast. a blank wall or floor."],
                ["too blurry", "no edge detail. out of focus or motion blurred."],
              ]}
            />
            <p>
              brightness, contrast and a gradient energy sharpness proxy are computed on a small downsampled
              grayscale grid. a real multimodal ai model is only used if one is configured, and only on frames that
              already passed these two cheap local filters, which bounds ai spend to roughly 'moments where
              something actually happened'. with no vision model, honest local detectors answer instead: a
              person shaped blob is reported as a person with moderate confidence, and any other blob is reported
              as 'unidentified object' instead of a made up label. that uncertainty is intentional, it is what
              should make the curiosity engine want to investigate. the dashboard health check flags the vision
              pipeline as degraded when the discard rate looks like a real problem (a bad lens, bad exposure or a
              bad link) rather than just 'an empty room skips most frames'.
            </p>
            <p>
              one thing i want to be honest about: the first version of identity matching used a colour histogram
              plus coarse edge features as its 'embedding'. it was good enough to test the whole pipeline end to end
              (extract, store, compare, threshold), but it was not real face recognition. it was replaced by the real
              pipeline above, which is why the file still says so in its comments.
            </p>

            <H3>the two face models</H3>
            <p>
              the default is a face-api model (a ResNet-34 ported from dlib, 128 numbers per face), chosen because it
              is the one that reliably downloads and runs anywhere. the second is a real onnx runtime backend for
              ArcFace style models (112 by 112 in, 512 out), which is switched on with two settings once you supply
              a compatible model file, since the public onnx face weights are distributed through git lfs and i could
              not fetch them in my build environment. the matching distance is deliberately conservative: every
              threshold is in one config file, and the defaults lean towards skipping and rejecting instead of
              guessing. an existing database from before pgvector kept its old json embeddings in a renamed column,
              which is a different feature space anyway, so every old face has to be registered again through the new
              pipeline. in the browser simulator there is a third option, a lighter one (BlazeFace plus a face
              recognition net) with its own threshold of 0.30, which i measured on three identities, and i rejected
              one candidate model after it turned out to give a constant output.
            </p>

            <H3>the face pipeline, gate by gate, with numbers</H3>
            <p>
              a camera frame does not go straight to the face model. it has to get through a row of cheap gates
              first, and each gate is a number in the config file, so you can see exactly why a frame was thrown
              away. in the order they run:
            </p>
            <Rows
              rows={[
                ["1. same as last time?", "a 64 bit perceptual hash (dHash) of the crop is compared with the last 5 hashes of that track from the last 15 seconds. if fewer than 6 of the 64 bits differ, nothing changed, and the frame is skipped. this is what stops him re-running a neural net 10 times a second on someone sitting still."],
                ["2. is the face big enough?", "the face must be at least 8 percent of the shorter side of the frame. on a 600 pixel tall frame that is 48 pixels. smaller faces simply do not have enough pixels."],
                ["3. does the detector believe it?", "the detector's own confidence must be at least 0.6."],
                ["4. is it facing the camera?", "estimated yaw at most 35 degrees and pitch at most 30 degrees from landmarks. a face turned further gives an unreliable fingerprint."],
                ["5. is it blocked?", "the landmark consistency score must be at least 0.55, which catches a hand, a mask or an object in front."],
                ["6. is the face sharp?", "the laplacian variance (a standard blur measure) of just the face crop must be at least 25. a face can be sharp while the background is blurry, and the other way round, so it is checked on the crop."],
              ]}
            />
            <p>
              only a frame that survives all six is aligned (the 5 landmarks are warped onto the standard arcface
              template with a similarity transform, so every face is rotated, scaled and cropped the same way) and
              turned into 128 numbers. then the match:
            </p>
            <Eq>{`distance = sqrt( sum over i of (a_i − b_i)² )      (plain euclidean)
match if distance ≤ 0.5      (between the match line and the review line it is only a "maybe")
compare against at most 20 stored faces per person (oldest and lowest quality pruned first)
the nearest neighbours come from a pgvector HNSW index, so it stays fast with many faces`}</Eq>

            <H3>why one frame is never enough: voting</H3>
            <p>
              a single close match can be a bad angle or a look alike. so each tracked sighting casts one vote per
              processed frame, and an identity is only <b>confirmed</b> when 3 frames agree. it keeps the last 8
              votes, and a track that is silent for 20 seconds is forgotten. there are three states, and only the
              first one is allowed to greet someone or unlock anything:
            </p>
            <Eq>{`CONFIRMED    the leading person has 3 or more votes in the window
PROVISIONAL  somebody leads, but with fewer than 3 votes
UNKNOWN      no frame has matched anybody`}</Eq>
            <Rows
              rows={[
                ["frames: A, A, A", "after the 3rd frame, A has 3 votes. confirmed. (after the 2nd frame it was provisional with 2 of 3.)"],
                ["frames: A, B, A, A", "A: 3, B: 1 after four frames. confirmed as A. one wrong frame does not matter."],
                ["frames: A, B, A, B, A, B", "A: 3, B: 3 and the loop only checks for the first leader, so it settles on whichever it counted first. the window is only 8 wide, so the votes keep sliding and a genuinely confusing face does not stay open forever."],
                ["frames: none, none, A", "a frame that matched nobody counts as a vote for nobody. one vote for A is provisional."],
                ["the same face for 21 s of silence", "the track expired, so the next sighting starts from zero votes."],
              ]}
            />
            <p>
              this is also why the admin check for the emergency stop is safe. a photo held up to the camera still has
              to get through the sharpness, pose and voting gates over several frames.
            </p>

            <H3>the browser simulator matches differently, and recognises him a moment longer</H3>
            <p>
              in the browser the matching uses cosine distance on unit length fingerprints, and each person is stored
              as the average of all their samples, so a match is the best of the average and every single sample:
            </p>
            <Eq>{`cosine distance = 1 − (a/|a|) · (b/|b|)
person's fingerprint = normalise( sum of unit vectors of all samples )
best = min( distance to the average, distance to each sample )
strict threshold = 0.48`}</Eq>
            <p>
              there is one human touch, which i like a lot. if someone was recognised confidently a moment ago (at a
              distance under 0.85 · 0.48 = 0.408), and their face is still in about the same place (it has moved less
              than 25 percent of the frame), they get some extra slack that fades away with time:
            </p>
            <Eq>{`threshold = 0.48 + 0.12 · exp(−age / 8 s)`}</Eq>
            <Rows
              rows={[
                ["just now (0 s)", "0.12 extra → threshold 0.600"],
                ["2 s ago", "0.0935 extra → threshold 0.574"],
                ["8 s ago", "0.044 extra → threshold 0.524"],
                ["16 s ago", "0.016 extra → threshold 0.496"],
                ["24 s ago", "0.006 extra → threshold 0.486, basically strict again"],
              ]}
            />
            <p>
              so if you turn your head and your distance jumps to 0.53, two seconds after he saw you clearly, you
              are still you (it is drawn as a yellow dashed box in the camera debug panel, meaning "accepted only
              thanks to re identification"). but a stranger who walks in at a different spot with the same 0.53 gets
              the strict 0.48 and is rejected. the slack also never refreshes itself: while you are only
              loosely matching, the face is followed but the clock is not reset, so the grace cannot go on forever.
            </p>
            <p>
              what i measured, honestly: on one test picture with three different people, the human model put
              them 0.49 to 0.57 apart from each other, and the same face under scale, shift, brightness and a bit of
              blur stayed within 0.01 to 0.13, so a threshold of 0.30 sits in the gap. that is only 3 identities and
              made up variation, so it is a starting point and not a proof. the face-api model was run headless on
              the cpu at about 1.2 seconds a frame, and a gpu will be a lot faster, but i have not measured it.
            </p>

            <H3>finding someone</H3>
            <p>
              "vision, find sam" starts a mission, and i want to describe it honestly, because there is no map, no
              localisation and no path planning anywhere in this project. first, a name is not a unique id. if there
              are two sams he asks out loud, "there are a few people named sam, can you show me a photo of who you
              mean?", and then waits up to 60 seconds for his own camera to confidently match one of their stored
              faces to the photo you hold up. this deliberately skips the motion gate for that one comparison,
              because a photo held up is held still, and the gate would call that 'nothing changed'.
            </p>
            <p>
              then he does a bounded wander and scan patrol for up to 3 minutes, alternating short walks and turns,
              while the normal recognition that already runs every cycle checks every face against the target. if
              someone else walks up while he is searching, he asks them out loud, "have you seen sam?", and
              listens. the answer is understood with simple keywords (yes, no, a fixed list of room names), not real
              language understanding, and a location hint is logged on the task for a human to read, it does not
              change the patrol, since there is no room level navigation to direct. when he finds the target he
              announces it and retraces his own patrol with dead reckoning: every patrol step is recorded, and the
              way back reverses that log and inverts each step (a recorded walk forward becomes a walk backward of
              the same duration, a left turn becomes a right turn). it is better than a fixed guess, but with no
              encoder feedback the errors add up over a long search, so it is a good faith retrace, not real
              navigation.
            </p>

            <H3>checking what he learned about you</H3>
            <p>
              he picks up facts about people on his own, and a fact he learned alone should not just be believed.
              there is deliberately no dashboard button for confirming it. he does it out loud, the same way he asks
              a stranger's name. at most once every ten minutes, when the admin's face is confirmed in frame and no
              other question is pending, he picks the oldest fact still flagged for review and asks, "quick thing, i
              picked up something about ram: prefers quiet music. did i get that right?" he waits 45 seconds, and
              the reply is classified as confirm, reject, correction (with the corrected wording pulled out) or
              unclear. unclear changes nothing and leaves it flagged, so it comes back another day, instead of him
              guessing at an answer he did not get. the profile page shows where every fact came from (the raw
              source, such as a script, the system or an admin), because a friendlier made up 'said by a person
              versus made up by the ai' label would be misleading, as that distinction is not in the data yet.
            </p>
            <p>
              he also says hello and goodbye appropriately, with a greeting throttle and a farewell tracker, so he
              does not greet the same person on every cycle.
            </p>

            <H3>text to speech and speech to text</H3>
            <p>
              there are three voices to choose from, and all of them end up as raw 16 bit audio on the speaker.
              the default is microsoft edge's neural voices (a british male voice, no key, no signup, no cost). its
              output is an mp3 and the robot has no audio codec on board, so the server transcodes it with a real
              bundled ffmpeg before the robot fetches it, and the transcode is tested against real generated
              audio. the paid option is elevenlabs, which sends raw pcm directly. the third is omnivoice, a
              multilingual model for 600+ languages served through wavespeed, where instead of picking a named voice
              you describe it: a gender, an age from child to elderly, a pitch, a whisper style and an accent, for
              example "female, young adult, british accent". it is an asynchronous job (submit, poll, fetch).
              there is also a mock mode that is completely silent for tests, and a plan for a fully offline voice
              with piper.
            </p>
            <p>
              speech to text is the honest weak spot. there is no free, no signup option, so it defaults to a mock
              that returns an empty transcript until you configure elevenlabs or groq. that matters more than it
              sounds, because name capture, the bystander questions during a search and any real conversation depend
              on it. both providers are built exactly to their published api and covered with mocked network tests,
              but my build environment could not reach either, so live accuracy was not exercised there. what he
              says is also a prompt problem, not only an audio one: replies are kept short and natural before they
              reach the voice.
            </p>

            <H3>the dialogue engine, intent by intent</H3>
            <p>
              without the ai he still talks, and not from one canned list. the local engine is a pure function, no
              model, that matches intents with patterns and builds the answer from his live state. it checks in this
              order, and the first intent that fits answers:
            </p>
            <Rows
              rows={[
                ["1. a follow up", "if his last question was 'how are you?', your answer is read next. 'good, great, fine, awesome' gets 'glad to hear it'. 'bad, tired, sad, stressed' gets 'that sounds rough, i am here'."],
                ["2. 'what is this?'", "also 'what am i holding', 'look at this'. with the camera off he says so. with an object in view he answers from the detection. if the confidence is 0.7 or more he says 'that looks like a red cup', below that 'i think that is a red cup'. with only pixels running he admits he can only see colours and movement."],
                ["3. commands", "dance, walk, turn left, turn right, turn around, rest, look, look at me, play, come. he matches 'please', 'can you', 'let us' and 'i want you to' around them, then his own mind decides whether he feels like it."],
                ["4. social basics", "hello, thanks, goodbye, jokes (he has a small pool, like the servo joke)."],
                ["5. his hormones", "'how is your dopamine?' and 'what hormones do you have?' are answered from the real levels, as a percent and against the resting level."],
                ["6. who and what", "who are you, what are you, what do you see (he lists what the camera shows, then what is in the arena), why did you do that (from the real score parts), what is your favourite."],
                ["7. facts about you", "what is my name, what do i like, where do i live, from what he learned."],
                ["8. feelings aimed at him", "things you say about him or to him, kind or unkind, get a reply and a small push on his mood."],
                ["9. fallback", "a question he cannot answer gets an honest 'i do not know'. a plain statement gets an acknowledgement."],
              ]}
            />
            <p>
              <b>how he learns things from your sentence.</b> four patterns, written as regular expressions: "my name
              is X / call me X" (the name is capitalised), "my favourite thing is Y" (stored as 'favorite thing'),
              "i like or love or enjoy Z" (not if the thing is 'you') and "i live in or am from P" (stored as home).
              facts are cut to a sensible length and stored, and they can fade later, as described before.
            </p>
            <p>
              <b>he never repeats himself.</b> every reply pool goes through a simple rule: use a line he has not said
              recently. if everything has been used, at least do not repeat the very last one. that is why asking
              the same thing twice gets two different wordings.
            </p>
            <p>
              <b>what he says when he sees something.</b> there is a small table of reactions to objects, and some of
              them nudge his mood. a cat gives "a cat! i love cats" and mood +0.3, arousal +0.3. a dog is the same. a
              bird is +0.2. a teddy bear is "a teddy bear! can i play too?" at +0.3. pizza and cake are +0.2 and he
              says he is jealous. scissors and a knife are "careful with that" and a slightly negative mood of −0.1
              with arousal +0.3. a laptop is "you are working, aren't you?", a book is "what are you reading?" and a
              bottle is "staying hydrated?".
            </p>
            <p>
              <b>how he says how he feels.</b> fifteen moods each have two or three ways of saying it, from
              "really good, actually. something put me in a great mood" (happy) to "a bit scared, honestly. my heart
              is racing" (afraid) and "sleepy. everything feels slow and soft". and why he did something has a plain
              sentence for each of his nine actions, for example dance is "i felt like dancing. i was a little bored
              and in a good mood", and call out is "it had been quiet and i wanted some company".
            </p>

            <H3>his voice follows his mood</H3>
            <p>
              the speech rate and pitch are picked from his mood first, and then refined by his hormones. a few of the
              starting values, as rate and pitch where 1.0 is normal:
            </p>
            <Rows
              rows={[
                ["excited", "1.12 and 1.20, quick and high"],
                ["startled", "1.20 and 1.25, the fastest and highest"],
                ["afraid", "1.18 and 1.22"],
                ["happy", "1.06 and 1.15"],
                ["curious", "1.05 and 1.12"],
                ["calm", "0.96 and 1.00"],
                ["bored", "0.90 and 0.95"],
                ["angry", "1.08 and 0.85, fast but low"],
                ["sad", "0.86 and 0.88, slow and low"],
                ["sleepy", "0.80 and 0.85, the slowest"],
              ]}
            />
            <p>
              and every person he knows gets a slightly different voice that never changes: the name is hashed to a
              number, and that gives a rate between 0.94 and 1.06 and a pitch between 0.92 and 1.08. so he sounds a
              little different when talking to different people, and the same each time.
            </p>

          </div>

          <hr />

          {/* ═════════ MEMORY ═════════ */}
          <div className="space-y-6">
            <H2>memory and teaching</H2>
            <p>when he needs to know something he checks four layers in a fixed order:</p>
            <Bullets
              items={[
                ["static memory", "fixed rules and facts."],
                ["dynamic memory", "things he learned earlier. only the verified ones are trusted."],
                ["conceptual memory", "similarity between feature vectors (shape, size, colour), so an object he has never seen can still match a concept he knows."],
                ["the ai", "only as a last resort, and a good ai answer can be saved as a new conceptual memory, so he asks the ai less and less over time."],
              ]}
            />
            <p>
              every lookup returns whether it was found, which layer answered, a confidence, and a trace of every
              layer tried (hit, miss or skipped). the memory page skips the ai step on purpose, so "not found"
              honestly means it is not in his memory, and a hit tells you how it was found in plain words.
            </p>
            <p>
              admins teach him there: add, edit and delete facts with tags, or import many at once, one per line as{" "}
              <code>Title | Content | tag</code>. facts an admin teaches are trusted immediately. facts the ai
              learned by itself wait for me to verify or reject them. everything is saved in postgres and reloaded
              when the server starts, so teach him something, restart the server, ask again, and it is still there.
              if the database is down, the response says the fact is in memory only until it recovers.
            </p>

            <H3>conceptual memory, with an example</H3>
            <p>
              this is the layer that lets him compare instead of only match. an observation is compared against
              known concepts across several weighted dimensions: shape, size, colour, dimensions and aspect ratio,
              texture, visual features, semantic features and context. shapes and colours are scored by exact
              category, sizes and ratios by tolerance. the scores are combined into one total, and each candidate
              also lists which features matched and which conflicted, so the answer is explainable. the threshold for
              'good enough' is 0.65, and below it the chain falls through to the ai.
            </p>
            <p>
              day one: he sees a small yellow green sphere and stores it as the concept ball. day two: he sees a
              bigger, differently coloured sphere. the exact match fails, but against ball it scores high on shape
              and category and lower on size and colour, so he says "this is also a type of ball, but it is
              different from the smaller ball i saw before". that is a real multi dimension comparison, not a
              guess, and every result carries a confidence that the decision maker and the dashboard both show.
            </p>
            <p>
              a learned fact has a status: verified, unverified, requires review or rejected, and only verified ones
              count as an answer. the status of a new fact is decided from its source and confidence, and a fact an
              admin teaches is verified straight away. permanent static facts are stored under a key made from the
              title (admin dot the title slug), and teaching the same title replaces the old one. a one letter
              search never matches anything.
            </p>

            <H3>conceptual memory: the exact scoring, and what it really does</H3>
            <p>
              i said "multi dimension comparison" earlier. here it is as actual code and numbers. two objects are
              compared on seven scores, each between 0 and 1, and the total is a weighted sum:
            </p>
            <Rows
              rows={[
                ["shape (weight 0.20)", "1 if the shape category is the same, else 0. there are only three shapes: square (aspect ratio 0.85 to 1.15), wide and tall. it is worked out from the aspect ratio of the bounding box alone, so it is honest to say it is not real shape recognition. a round plate and a square plate look the same to it."],
                ["colour (0.15)", "1 if the main colour is the same, else 0. the colour is the average of the cropped detection, shrunk to 12 by 12 pixels first so noise averages out, then snapped to the nearest of 12 named colours (black, white, gray, red, orange, yellow, green, cyan, blue, purple, pink, brown)."],
                ["size (0.15)", "from the width: diff = |a − b| / max(a, b), score = max(0, 1 − diff / 0.25). so objects within 25 percent of each other get partial credit, further apart gets 0."],
                ["appearance / texture (0.15)", "1 if the texture is the same, else 0. the live pipeline does not measure texture, so this is 0 in practice."],
                ["aspect ratio (0.15)", "the same formula as size but with a tighter tolerance of 0.15."],
                ["context (0.10)", "needs knowing what is around the object. it is a fixed 0.5 for now."],
                ["semantic (0.10)", "needs a semantic embedding comparison. also a fixed 0.5 for now."],
              ]}
            />
            <Eq>{`total = 0.20·shape + 0.15·colour + 0.15·size + 0.15·texture
      + 0.15·aspect + 0.10·context + 0.10·semantic
sufficient if total ≥ 0.65
a feature is listed as "matching" at 0.7 or more and "conflicting" at under 0.3`}</Eq>
            <p>
              the point worth seeing is the ceiling. the live pipeline gives no texture, and context and semantic are
              fixed at 0.5, so the best any object can score is{" "}
              <code>0.20 + 0.15 + 0.15 + 0 + 0.15 + 0.05 + 0.05 = 0.75</code>. the bar is 0.65, so there is only 0.10
              of room. some worked cases for a small yellow ball of width 60:
            </p>
            <Rows
              rows={[
                ["the same ball again", "shape 1, colour 1, size 1, aspect 1 → 0.75. sufficient."],
                ["same colour, a bit bigger (width 66)", "diff 6/66 = 0.091, size score 1 − 0.091/0.25 = 0.64 → total 0.6 + 0.64·0.15 = 0.70. sufficient. he recognises it as the same kind."],
                ["same colour, width 72", "diff 12/72 = 0.167, size score 0.33 → total 0.65. exactly on the line, still sufficient."],
                ["same colour, width 90", "diff 0.33, size score 0 → total 0.60. not sufficient."],
                ["a different colour, same size", "colour 0 → the best possible total is 0.75 − 0.15 = 0.60. never sufficient, however similar everything else is."],
                ["a wide object instead of a square one", "shape 0 and aspect ratio far off → even with the same colour and width the total is only 0.15 + 0.15 + 0.05 + 0.05 = 0.40. rejected."],
              ]}
            />
            <p>
              this is more strict than the example i wrote above from the docs. in that example a bigger, differently
              coloured ball is said to come out as "also a type of ball". with the real weights, that case scores
              about 0.45 (shape 0.20 + aspect 0.15 + the two fixed halves 0.10, with colour and size at 0), which
              is under 0.65, so the chain does not settle it here. it falls through to the next step of the chain, the ai
              fallback. i would rather tell you that than leave the nicer story.
              the ranking itself is real, though. every candidate is scored and sorted, so with several known
              objects the best one still comes first, together with its matching and conflicting features.
            </p>

            <H3>reactions and gestures, in numbers</H3>
            <p>
              between a decision and the body there is a small translation layer. first the decision becomes a
              reaction (a state and a list of gestures):
            </p>
            <Rows
              rows={[
                ["track person", "state TRACKING, the eyes follow the person"],
                ["investigate", "state CURIOUS, the eyes follow the object"],
                ["greet", "a state taken from the person's tone (friendly, cautious and so on), eyes back to centre"],
                ["learn, observe only", "states LEARNING and OBSERVING, no gesture"],
                ["anything else", "IDLE"],
              ]}
            />
            <p>
              then the emotion is picked, and the order matters, since the first rule that fits wins:
            </p>
            <Rows
              rows={[
                ["1. not safe", "WORRIED, intensity 90. being worried about a hazard beats everything."],
                ["2. annoyed", "ANNOYED, intensity min(100, 40 + 20·level). the level is 1 to 3, so 60, 80 or 100. it comes from a repeated question or someone talking over him, and it wears off after 60 seconds, not longer, on purpose. a longer one would be a grudge, which is a different feature."],
                ["3. curious", "investigating with curiosity at 70 or more → CURIOUS, with the curiosity as intensity"],
                ["4. confused", "uncertainty at 70 or more → CONFUSED"],
                ["5. a known friend", "an admin or a trusted person → HAPPY, 70"],
                ["6. a stranger", "CALM, 40"],
                ["7. otherwise", "NEUTRAL, 30"],
              ]}
            />
            <p>
              the emotion also sets how it is delivered. excited and surprised mean fast speech and wide eye
              movement. worried and sad mean slow speech and small movement. curious is normal speech with wide eyes.
              annoyed is fast and curt with subtle eye movement, since he does not want to keep looking at whoever
              caused it.
            </p>
            <p>
              then the gesture. the head can only turn left and right (there is no up and down servo), so a "nod" is
              really a small wiggle, and every gesture is relative to wherever the head is now and always ends back at
              that angle, so it never fights the attention system. each step is a head angle offset and a hold in
              milliseconds:
            </p>
            <Rows
              rows={[
                ["curious tilt", "+15° 220 ms, −15° 220 ms, back. 440 ms in all."],
                ["happy wiggle", "−12° 150 ms, +12° 150 ms, back. 300 ms. used for a greeting when he is happy or excited."],
                ["confused shake", "+18° 260 ms, −18° 320 ms, back. 580 ms."],
                ["surprised jolt", "−20° 120 ms, +5° 150 ms, back to centre. 270 ms. a flinch with a direction."],
                ["annoyed turn away", "−28° 420 ms, −16° 260 ms, back. 680 ms. the longest holds of the small ones, so it clearly lingers and cannot be mistaken for a glance."],
                ["admin check scan", "+26° 500 ms, −26° 500 ms, centre 200 ms. 1200 ms. slow and wide, played while he checks if someone saying 'emergency stop' is really the admin."],
                ["low light peer", "+22° 340 ms, −22° 340 ms. 680 ms. looking around a dark room for whoever he asked to turn the light on."],
                ["idle fidget", "+8° 300 ms, back. a tiny one so a long idle stretch does not look frozen."],
                ["don't touch recoil", "−22° 120 ms, +22° 160 ms, back. 280 ms. a quick flinch-and-warn, with a spoken line, triggered by something being very close."],
              ]}
            />
            <p>
              the timing works out because the head moves at 240 degrees a second. a 20 degree step takes about
              83 ms, comfortably inside every hold. at most one gesture plays per cycle, and most cycles play none
              on purpose, since a robot that gestures every frame looks twitchy and not expressive. and every step goes
              through the same command path as anything else, so the emergency stop and the safety checks apply to a
              gesture exactly like to a walk.
            </p>

          </div>

          <hr />

          {/* ═════════ COMMANDS + COMPILER ═════════ */}
          <div className="space-y-6">
            <H2>commands and vision script</H2>
            <p>
              there is one command catalog, about 50 command types, and every one has a schema that the server and
              the compiler share, so there is one truth for what is valid. there is even a test that reads the docs
              and fails if a command type exists in the code but not in the docs, or the other way round.
            </p>

            <H3>the catalog</H3>
            <Rows
              rows={[
                ["head (CH0)", "EYE_SET (angle 0 to 180), EYE_LEFT and EYE_RIGHT (a step of 1 to 90, default 10), EYE_CENTER (always allowed), EYE_TRACK_PERSON (point at a bearing, tracking itself runs on the esp32). the head eases at 240 degrees per second, so a head command returns while the head is still turning."],
                ["legs (CH1, CH2)", "LEFT_LEG_FORWARD, _REVERSE, _ROTATE (signed, minus 100 to 100) and _STOP, and the same for the right leg. forward and reverse take 0 to 100."],
                ["gait", "WALK_FORWARD, WALK_BACKWARD, TURN_LEFT, TURN_RIGHT with an optional duration up to 60000 ms, and WALK_STOP. with a duration the move stops by itself on the robot. without one it goes until a stop, which is what voice and manual driving use."],
                ["ultrasonic", "ULTRASONIC_READ, and calibrate, enable and disable, which are admin only."],
                ["safety", "SERVOS_SAFE, EMERGENCY_STOP and EMERGENCY_CLEAR. all admin only."],
                ["audio + camera", "AUDIO_SPEAK, AUDIO_STOP, start and stop listening, CAMERA_CAPTURE, start and stop tracking."],
                ["brain, memory, tasks", "observe, process, search memory, learn a fact, start and cancel a task, compile and execute a script."],
                ["people, performance, home", "FIND_PERSON, DANCE (2 to 120 seconds, or a style), PLAY_SONG_REQUEST, SET_DANCE_PREFERENCE, RESET_PERSON_FACE (the 'that is not me' reset), SMART_DEVICE_TRIGGER."],
              ]}
            />
            <p>
              the leg joint commands are gone, since there are no leg joint servos, and using one in a script is a
              compile error. who can issue what is simple. admin only commands can never be issued by the ai or by
              a script: the compiler accepts the name but the run is refused with permission denied. any command that
              moves the body needs manual mode when a human or a script issues it, while stop and centre commands
              are always allowed. and every leg movement also checks the live ultrasonic distance, with the head
              brought forward first.
            </p>

            <H3>vision script</H3>
            <p>
              i also made a tiny programming language to control him. it is a small, safe, line based language,
              never arbitrary javascript. one statement per line, a comment starts with a hash, and any identifier
              is a registered command with at most one argument, which can be a number, a quoted string or a
              variable. it started as just commands and grew into a small but complete language: variables,
              arithmetic, loops, branching, random numbers and printing. the trick is that everything is resolved at
              compile time, so what the robot receives is still a flat, fully inspectable list.
            </p>
            <Eq>{`EYE_CENTER
WAIT 500
WALK_FORWARD 1000
WALK_STOP
AUDIO_SPEAK "Hello"
FIND_PERSON "Sam"
DANCE 20000

SET $angle 60
EYE_SET $angle

REPEAT 3 TIMES AS $step
  SET $a $step * 45 + 45
  EYE_SET $a
  WAIT 600
END

IF $angle > 90
  TURN_RIGHT 300
ELSE
  TURN_LEFT 300
END

RANDOM $look 30 150
EYE_SET $look
PRINT "reached this point"`}</Eq>
            <Rows
              rows={[
                ["variables", "SET $name value. using one before it is set, or using a string where a number is needed, is a compile error."],
                ["arithmetic", "plus, minus, times and divide, evaluated strictly left to right with no precedence, so 2 + 3 * 2 is 10 and not 8. it is a robot language, not a calculator, and precedence is one more thing to get subtly wrong in a script that controls hardware. plus between strings joins them. dividing by zero is a compile error, never a runtime crash."],
                ["loops", "REPEAT n TIMES, optionally AS $name. the index is 0 based and available as $I. loops nest and inner ones can use outer indexes. every loop is unrolled at compile time, so three repeats become literally three copies."],
                ["if / else", "compares with greater, less, greater or equal, less or equal, equal and not equal. since a script cannot read any live sensor, every value is known at compile time, so the comparison is evaluated while compiling and only the branch that is taken is kept. an IF leaves no trace in the program. both branches still have to be valid, so a typo in the branch that loses is still an error."],
                ["random", "RANDOM $x min max picks a real random integer, but once, at compile time. compile the same script twice and you can get different values. it is not a fresh draw on every run."],
                ["print", "writes to the server log with zero hardware interaction, so you can see what a script computed without sending a real command."],
                ["wait", "WAIT ms sleeps."],
              ]}
            />
            <p>
              the limits are in one file: a single repeat is 1 to 100, nesting depth (shared by loops and ifs) is 5,
              and the total after everything is unrolled is 500 instructions. a script that would expand past that
              is rejected with a clear error instead of silently producing a huge program.
            </p>
            <p>a few of the scripts i test with (each one is compiled by the test suite, so they are guaranteed valid):</p>
            <Eq>{`# sweep the whole field of view, then look ahead
EYE_SET 0
WAIT 800
EYE_SET 180
WAIT 1000
EYE_CENTER

# glance about at random angles
REPEAT 5 TIMES
  RANDOM $look 20 160
  EYE_SET $look
  WAIT 700
END
EYE_CENTER

# walk a square (1650 ms is almost exactly a quarter turn in the simulator)
REPEAT 4 TIMES
  WALK_FORWARD 1000
  TURN_RIGHT 1650
END

# turn the head while walking, a glance
WALK_FORWARD
WAIT 300
EYE_SET 135
WAIT 400
EYE_CENTER
WALK_STOP`}</Eq>
            <p>things that are different from what you might expect:</p>
            <Bullets
              items={[
                ["", "the compiler does not range check arguments. EYE_SET 500 compiles, and then is refused when it runs, and a failed command stops the rest of the script."],
                ["", "before any leg movement the head is brought forward, so EYE_SET 25 then WALK_FORWARD walks with the head forward. to glance sideways while walking, put the EYE_SET after the walk has started."],
                ["", "a head command returns before the head arrives, so use WAIT between head moves if you want the camera to rest at each angle."],
                ["", "FIND_PERSON and DANCE are long running missions. they return a task id immediately instead of blocking the script."],
              ]}
            />

            <H3>worked example: what the compiler really produces</H3>
            <p>take this script, and remember that arithmetic goes strictly left to right:</p>
            <Eq>{`SET $base 10
REPEAT 3 TIMES AS $i
  SET $x $base + $i * 15
  EYE_SET $x
  WAIT 300
END
IF $base > 5
  PRINT "big base"
END`}</Eq>
            <p>
              you would expect the angles 10, 25 and 40 (multiply first, then add). but left to right means{" "}
              <code>($base + $i) * 15</code>, so the compiler gives:
            </p>
            <Eq>{`i = 0 : (10 + 0) · 15 = 150
i = 1 : (10 + 1) · 15 = 165
i = 2 : (10 + 2) · 15 = 180

IR: EYE_SET 150, WAIT 300, EYE_SET 165, WAIT 300, EYE_SET 180, WAIT 300, LOG "big base"
    (7 instructions. the IF was resolved, 10 > 5 is true, so only that branch exists.)`}</Eq>
            <p>
              if you wanted 10, 25, 40 you write <code>SET $x $i * 15 + $base</code>, which is{" "}
              <code>(0·15)+10 = 10</code>, <code>(1·15)+10 = 25</code> and <code>(2·15)+10 = 40</code>. and notice
              that EYE_SET 180 is allowed but a fourth iteration would give 195, which is out of range. since the
              value only exists after unrolling, that is caught as a compile limit error and not at runtime.
            </p>
            <p>and here is how the size limit bites, with the numbers:</p>
            <Rows
              rows={[
                ["REPEAT 100 with two commands", "100 · 2 = 200 instructions. fine."],
                ["REPEAT 10 inside REPEAT 10 inside REPEAT 6", "10 · 10 · 6 = 600 copies of the body, over the limit of 500. rejected before anything is sent."],
                ["REPEAT 101", "over the loop limit of 100. rejected."],
                ["six levels of nesting", "over the depth limit of 5, and loops and ifs share the depth. rejected."],
                ["SET $z 10 / 0", "divide by zero is a compile limit error as well, with the line pointed at."],
              ]}
            />

            <H3>the compiler</H3>
            <p>
              the pipeline is lexer, parser, syntax tree, semantic analysis, instruction generation, then the
              command registry, then safety, then execution. three kinds of error have three codes: a lex error (a
              string that never closes), a parse error (a valid token stream that does not form a statement, and
              two statements on one line is a parse error, it is strictly one per line) and the semantic ones.
              every diagnostic has a real 1 based line and 0 based column pointing at the exact token, sorted by
              position, and there is a formatter that prints them the way a compiler command line would, with a
              caret under the column.
            </p>
            <p>
              the line and column also travel through to execution. every instruction remembers the statement it
              came from, so when a script fails halfway the report says "line 4 failed" instead of "step 4 of 6".
              the semantic analyzer tracks variable types through a proper scope stack (loop variables shadow
              correctly). a value that depends on a loop's own index cannot be checked until the loop is unrolled,
              so the generator re-validates those and reports a limit error if any real per iteration value is out
              of range.
            </p>
            <p>
              i also exposed three backend features as real commands, since the hardware itself has nothing left to
              expose (3 servos, already fully surfaced): play a song, the dance preference and the face reset. they
              go through the same registry path as walking, even though they do not touch a servo. an admin can turn
              the whole compiler off with a kill switch, which blocks compile and execute for everyone, including
              the terminal widget in the dashboard. compiling never touches hardware, but this is an emergency
              'turn the feature off' switch, so it blocks that too.
            </p>
          </div>

          <hr />

          {/* ═════════ SAFETY ═════════ */}
          <div className="space-y-6">
            <H2>safety</H2>
            <p>
              a robot that moves needs rules that nothing can override. every command, from anywhere (dashboard,
              voice, the brain, a compiled script), takes the same path: the registry, then the validator (schema
              and role), then the safety manager, then the handler. the priority order is:
            </p>
            <Bullets
              items={[
                ["1", "emergency stop"],
                ["2", "physical and ultrasonic safety"],
                ["3", "hardware limits"],
                ["4", "authorization"],
                ["5", "everything else, including the mind, the decision maker, the ai, vision script and the frontend. none of them can override the ones above."],
              ]}
            />

            <H3>the distance sensor</H3>
            <Rows
              rows={[
                ["clear", "over 600 mm"],
                ["near", "300 to 600 mm"],
                ["warning", "150 to 300 mm"],
                ["obstacle", "50 to 150 mm"],
                ["very close", "50 mm or less"],
                ["invalid", "out of range, negative or a timeout. a disabled sensor blocks all movement"],
              ]}
            />
            <p>
              walking is only allowed when it is clear or near. the classifier is a pure function with no link to
              the servo layer, so it cannot be bypassed by construction. and because the sensor sits on the head, he
              only trusts it for walking when the head is facing forward. if the head is turned away, only a recent
              forward reading counts, and only for 800 ms, and only if it was safe. so a quick glance sideways while
              walking is fine, but staring sideways stops the legs. the server turns the head to the front before it
              drives the legs and waits for it to really arrive, and the firmware checks the same rule, so neither
              side can skip it alone. it is enforced in three places: on the robot (an in progress gait stops
              immediately without waiting for the server), in the safety manager, and again on every phase of the
              gait.
            </p>

            <H3>who is in control</H3>
            <p>
              there is a control mode switch. in autonomous mode (the default) the brain perceives, decides and acts,
              and human movement commands are rejected with a clear reason. in manual mode a human drives, and the
              brain keeps thinking but does not act, so it never fights me for the servos. stop, centre, safe and
              emergency stop work in both modes, on purpose: a command that can only reduce risk should never need an
              extra step to reach.
            </p>

            <H3>the emergency stop</H3>
            <p>
              this one has a story. at first anyone logged in could press it, which is the safest default for a robot
              with legs. then i made it admin only, verified live by voice or face, and resuming after it was always
              admin only. "verified" is not a login, because an open or stolen dashboard session could then
              authorise a stop with nobody there. it means either the voiceprint of the current sentence matched an
              enrolled admin and it was addressed to vision, or the multi frame recognizer fully confirmed an admin's
              face. both expire after 30 seconds. and the trade off is real: a bystander can no longer stop him
              alone. so when he cannot verify you, he does not just say no. he says he needs to check you are an
              admin and asks you to step where he can see you, turns to look, and stops if he confirms.
            </p>

            <H3>on the robot itself</H3>
            <p>
              timed moves stop on their own even if the follow up stop is lost, a watchdog stops the legs if nothing
              is heard from the server for a set time (it is not latching, so he resumes when contact returns), and
              a hardware emergency stop always works.
            </p>

            <H3>what the safety manager checks, in order</H3>
            <p>
              every hardware command passes through one function, and it is short enough to read in a minute. it
              asks three questions, in this order, and the first "no" throws a safety error with the code{" "}
              <code>SAFETY_VALIDATION_FAILED</code>.
            </p>
            <Rows
              rows={[
                ["is the emergency stop on", "if yes, everything is refused except three commands: EMERGENCY_STOP, SERVOS_SAFE and EMERGENCY_CLEAR. those three must always get through, otherwise you could never clear it."],
                ["is it a movement, and is the way ahead clear", "movement commands (walking, turning) are checked against the distance sensor. if the status is not clear or near, the command is rejected and the error even tells you the status."],
                ["is the robot even there", "in a real deployment, any hardware command is refused if the robot has sent no heartbeat for 15 seconds. before this check, a walk forward sent to a rebooting robot silently did nothing. now it fails loudly. in mock mode this check is skipped, since mock mode has no heartbeat, and the emergency commands are never blocked by it."],
              ]}
            />
            <p>
              the emergency stop itself does not depend on the brain, the memory or the ai on purpose. when
              triggered it cancels the gait, puts every servo in its safe state (continuous servos go to neutral,
              the positional ones to a safe angle), and writes a CRITICAL safety event to the database that stays
              unresolved until someone clears it. on the firmware side it does the same and also snaps the head back
              to centre.
            </p>

            <H3>a glance is fine, a stare is not</H3>
            <p>
              the distance sensor sits on the head, next to the camera. that is great for looking around, but it
              means a reading only describes the path ahead while the head is looking roughly forward. so the rule is
              about the head angle, not just the distance:
            </p>
            <Bullets
              items={[
                ["head within 20 degrees of centre", "the live reading decides."],
                ["head turned further", "only the last forward reading counts, and only if it was safe and is less than 800 ms old."],
                ["after 800 ms", "movement fails closed. he stops until the head is back near the centre."],
              ]}
            />
            <p>
              it is how a person behaves. you can glance sideways while walking and keep going, but if you stare at
              something to your left for two seconds you stop. the server and the firmware both implement it, with
              the same numbers, and the firmware uses the head's <i>physical</i> angle (where it really is), not the
              angle it was told to go to, since the servo takes a moment to arrive.
            </p>

            <H3>four thresholds and a pure function</H3>
            <p>
              the classification is a pure function: distance in, state out. it does not import the servo manager or
              the safety manager, so it cannot be bypassed by construction. the thresholds are 600, 300, 150 and 50
              mm. a missing, negative or NaN reading is <b>invalid</b>, and invalid is treated as unsafe, never as
              clear. only <b>clear</b> and <b>near</b> allow movement.
            </p>

            <H3>cleaning the distance readings</H3>
            <p>
              an hc-sr04 is noisy. one bad echo can say 4 metres when you are 30 cm from a wall. so readings go
              through a window of the last 5 samples, and the filtered value is a blend of the median and the mean:
            </p>
            <Eq>
              {`filtered = 0.6 · median(window) + 0.4 · mean(window)
confidence = 1 − (standard deviation / mean of the window)`}
            </Eq>
            <p>
              the median throws away a single wild reading, the mean keeps the value smooth, and the confidence drops
              when the samples disagree with each other. the firmware keeps the same 5 sample window so the on device
              stop and the server agree.
            </p>

            <H3>noticing a person walking up</H3>
            <p>
              the same readings feed a presence detector that has nothing to do with safety but a lot to do with
              feeling alive. it knows three events. <b>entered near field</b> fires when something comes within 900
              mm. <b>left near field</b> fires when it goes away again. <b>sudden approach</b> fires when the distance
              drops by 250 mm or more between two readings. those events go to the mind, so a person stepping up to
              him can be a surprise or a hello instead of just a number.
            </p>

            <H3>worked example: a glitch in the distance sensor</H3>
            <p>
              the wall is really 410 mm away, but one echo bounces badly and reads 980. the window of five samples
              holds <code>[412, 405, 980, 410, 408]</code>:
            </p>
            <Eq>{`sorted = [405, 408, 410, 412, 980]    median = 410
mean   = (412 + 405 + 980 + 410 + 408) / 5 = 523
filtered = 0.6·410 + 0.4·523 = 246 + 209.2 = 455.2 mm

standard deviation = 228.5,  relative spread = 228.5 / 523 = 0.437
confidence = 1 − 0.437 = 0.56`}</Eq>
            <p>
              so one terrible reading moved the answer by only 45 mm (410 to 455), and the confidence dropped to 0.56
              to say "i do not trust this window". a plain average would have said 523 mm, and a raw reading would
              have said 980, which is "clear" and would have let him walk into the wall. compare it with a clean
              window <code>[412, 405, 410, 410, 408]</code>: median 410, mean 409, filtered 409.6 mm, relative spread
              0.0058, confidence 0.994.
            </p>
            <p>
              and the classification of the 455 mm answer is "near" (it is between 300 and 600), which still allows
              movement, so he keeps walking, but slower decisions about it are left to the next samples. as soon as
              the glitch leaves the window after 5 samples, everything is back to normal.
            </p>

          </div>

          <hr />

          {/* ═════════ LINK ═════════ */}
          <div className="space-y-6">
            <H2>the link between robot and brain</H2>
            <p>
              first version: the firmware opened a fresh tls connection for every poll (every 200 ms), every frame
              upload and every heartbeat. on an esp32 each handshake costs half a second to over a second, and the
              brain could only answer when asked. so now there is one persistent websocket,{" "}
              <code>wss://server/api/robot-ws</code>, authenticated with a robot secret.
            </p>
            <Rows
              rows={[
                ["server to robot", "commands pushed the instant they are dispatched. speech and music as pcm16 chunks of 4 kb. a tick every second with the capture rate, which is also the liveness signal for the watchdog. a result after each frame that releases the next one."],
                ["robot to server", "camera frames as binary jpeg (no base64, no json wrapper), heartbeat and telemetry, and an ack for each command."],
                ["one frame at a time", "if the brain is still busy the new frame is dropped, since it would be stale anyway, and the robot is told it is busy."],
                ["reconnecting", "the server pings every 10 s and drops a connection that misses one. the firmware reconnects every 1.5 s."],
                ["nothing is lost", "commands queued while the link is down wait in a queue, and are flushed on reconnect or picked up by the http fallback."],
                ["speed", "commands are delivered before the server finishes simulating them. before this, a walk forward for 1000 ms reached the robot only after the server had spent 1000 ms simulating it."],
                ["visibility", "the dashboard shows whether the robot is on the websocket, dropped back to polling, or gone. a robot on the fallback is flagged degraded, so a silently broken websocket does not go unnoticed."],
              ]}
            />

            <H3>how the link describes itself</H3>
            <p>
              the dashboard does not guess how the robot is connected, the server works it out and returns one
              status object. there are four transports: <b>simulator</b> (the virtual robot inside the server),{" "}
              <b>websocket</b> (the esp32 on the live link), <b>http</b> (the esp32 is only reachable by polling,
              because the socket is down) and <b>none</b> (nothing heard for 15 seconds). each one comes with a plain
              sentence for the dashboard, like "esp32 reachable only by http polling, the websocket link is down, so
              commands are slower".
            </p>
            <p>
              there is also a small honesty detail. the firmware does not report servo positions back. so when the
              status shows the legs and the head, it labels the source: <b>simulator</b> if it is the virtual robot's
              real state, or <b>server-model</b> if it is just what the server last commanded. and when the
              transport is none, the body is null, so the dashboard never shows a head angle for a robot that is not
              there.
            </p>

            <H3>heartbeats</H3>
            <p>
              heartbeats can arrive over the websocket or over plain http, and both go through the same ingestion
              code, so they cannot drift apart. a robot row is created in the database on its first heartbeat, so
              there is nothing to set up by hand. the heartbeat carries wifi signal, free heap, uptime, the status of
              the camera, the servo driver, the microphone and the speaker, whether the gait is stopped or moving,
              and the filtered distance.
            </p>

            <H3>every timing number on the firmware side</H3>
            <Rows
              rows={[
                ["heartbeat", "every 5 s"],
                ["telemetry", "every 2 s"],
                ["command poll (fallback only)", "every 200 ms, and only while the websocket is down"],
                ["server watchdog", "15 s of silence stops the legs. not latching."],
                ["http timeout", "8 s for normal calls, 2.5 s for the fallback poll so it can never freeze the main loop for long"],
                ["wifi reconnect", "tries again every 5 s"],
                ["websocket reconnect", "every 1.5 s"],
              ]}
            />
            <p>
              the server address, port, the tls flag and the websocket path all live in a network config file, and
              there is a line for pinning the server's root ca. without it the connection is encrypted but the
              robot does not verify who it is talking to, which is why the comment in the file says to pin it.
            </p>

          </div>

          <hr />

          {/* ═════════ SECURITY ═════════ */}
          <div className="space-y-6">
            <H2>security</H2>
            <Bullets
              items={[
                ["no secrets on the robot", "the database url, ai keys, google credentials, jwt secret and robot secret are never sent to the frontend or stored on the esp32."],
                ["sessions", "jwt in an httpOnly cookie, cross checked against a row in a sessions table, so logging out really revokes access."],
                ["roles", "user, trusted and admin, enforced on the server on every protected route. the dashboard guards are only for convenience."],
                ["passwords", "bcrypt with 12 rounds, never logged or returned by any api."],
                ["validation and rate limits", "a schema for every command and every route body, and rate limits on commands, ai calls, login and the account endpoints."],
                ["boot checks", "the jwt secret and robot secret have no default, so the server refuses to start in production without them, instead of signing sessions with a well known placeholder. the robot secret comparison is constant time."],
                ["websockets", "the socket layer checks the same session cookie before a connection can join the broadcast room, because every real time event carries the same sensitive data as the rest api."],
                ["audit log", "login attempts, role changes, password resets, privileged commands and emergency stops."],
                ["compiler kill switch", "an admin can disable the vision script compiler and executor completely, enforced on the server."],
              ]}
            />
            <p>
              there is a real bug story here too. i once mounted every router flat under one prefix and gave each
              router a bare auth middleware, which matched every request that reached it, not just its own routes.
              that made the public health check and the robot heartbeat unreachable. now each router's auth is scoped
              to its own path, and a test guards it.
            </p>
            <p>
              and one honest limit. he can also control smart devices (shelly relays, tasmota, home assistant,
              ifttt) with one generic mechanism: hit a url. registering a device is admin only, only http and https
              urls are accepted (checked again right before every trigger), and requests time out after 8 seconds.
              but it does not defend against ssrf by checking the target ip, which is fine for a single household
              robot and not fine for many untrusted admins.
            </p>
            <p>
              accounts: login has a remember me option (a 30 day cookie against 1 day), and a network error or a
              server restart no longer logs a remembered user out, only a real 401 does. sign up has live
              validation, a password strength meter, and the optional face step from before.
            </p>

            <H3>accounts and roles in detail</H3>
            <Rows
              rows={[
                ["public pages", "only the home page, login, register, forgot password and unauthorized. everything under the dashboard needs a session."],
                ["user", "the default for every new registration. the server forces it, whatever the request body says, so there is no public path to an admin account. admins are made with a script that writes straight into the database."],
                ["trusted", "can move servos and the gait, and use the simulator. promoted by an admin."],
                ["admin", "everything: teaching facts, the compiler, users and roles, the person profiles and photos, the object profiles, registering smart devices, and the admin only commands. an admin cannot demote their own account through the api."],
                ["profile pictures", "any signed in user can set or clear their own, and there is no route for setting someone else's."],
                ["linking a face", "a user can link their account to the face vision recognises later, from settings, if they skipped the camera at sign up."],
                ["remember me", "30 days with a persistent cookie against 1 day with a browser session cookie, and the email (never the password) is remembered. 7 days if the client does not say, for api clients."],
              ]}
            />
            <p>
              the audit log records: login success and failure, logout, register, account verified, account
              disabled, role changed, password reset, privileged commands (turning the compiler on or off counts)
              and emergency stops. the first time i traced an emergency stop through the system, i also found it had
              no recovery path, and that a movement command was accepted while the robot was disconnected. both are
              fixed: clearing a stop is an explicit admin action, and movement is refused when there is no robot.
            </p>

            <H3>rate limits and bad input</H3>
            <p>
              every group of routes has its own limit, per minute unless said otherwise, so one noisy client cannot
              drown the others.
            </p>
            <Rows
              rows={[
                ["commands", "60 a minute"],
                ["ai calls", "20 a minute, since each one costs real money"],
                ["login", "10 a minute"],
                ["register and password reset", "10 every 15 minutes. these have nothing to get wrong, like a password, so they are cheap to spam, and each one sends an email or creates a row."],
              ]}
            />
            <p>
              bodies are checked against a zod schema before they reach any handler, and a bad one returns{" "}
              <code>SCHEMA_VALIDATION_FAILED</code> with a 400. the last error handler turns anything unexpected into a
              json error with a code, and in production it does not send stack details back.
            </p>

          </div>

          <hr />

          {/* ═════════ SIM + DASH ═════════ */}
          <div className="space-y-6">
            <H2>the simulator and the dashboard</H2>
            <p>
              building a robot is slow and things break, so i made a 3d simulator that runs the same kind of brain
              in the browser. one setting decides what is at the end of the command pipeline. in simulation mode it
              is a virtual robot living inside the server, in hardware mode it is the real esp32. everything
              upstream is identical, the brain, the compiler, the dashboard and the api all go through the same
              registry, with the same validation, permissions, control mode and safety checks, so what works in the
              simulator works the same on hardware, only the last hop differs. the two modes are mutually exclusive
              on purpose. in simulation the robot's websocket answers an error and the simulator is live, in
              hardware mode the simulator answers an error and the page is not even served, so a real board and the
              simulator can never be fed the same command stream. with no setting at all it defaults to simulation,
              so it never drives hardware unless told to.
            </p>

            <H3>the virtual robot</H3>
            <p>
              it is a small physics model, not just an animation. forward speed is the average of the two legs and
              turn rate is their difference, at up to 0.15 metres per second and 90 degrees per second at full
              power, integrated 20 times a second. the head eases at the same 240 degrees per second as the
              firmware, and it reports the commanded and the physical angle separately. the ultrasonic is reported in
              every heartbeat and you can drop an obstacle in front of it from the api, and the virtual legs stop on
              their own when it says unsafe, exactly like the firmware. speech is spoken by the browser's voice.
              heartbeats say they are simulated, so the dashboard never shows them as real hardware. what is not
              simulated: camera optics, audio capture, battery and servo slip, and walking is open loop, like the real
              robot. you can even point it at a folder of photos and the virtual camera cycles through them so the
              brain has something to look at.
            </p>
            <p>
              the 3d client is a pure renderer, nothing it shows is computed in the browser. the model is one merged
              mesh, so at load the code cuts it into a head and two legs to match the three real servos: the head
              swivels about the vertical axis, each leg swings at the hip at a rate that follows its servo, and a
              beam drawn from the head shows the ultrasonic reading (green clear, amber close, red stopped) and turns
              with the head. an emergency stop tints the whole model red.
            </p>

            <H3>the views</H3>
            <p>
              the simulator page is a shell with a toggle between views, plus the original server driven page as a
              third tab called live link. which view is selected is in server memory and kept in sync with a switch
              on the dashboard, over a server sent events stream. it is only a ui choice, not control mode, and
              neither view sends commands to the robot.
            </p>
            <Bullets
              items={[
                ["compiler", "plays the program you wrote and compiled on the dashboard. there is no editor here. the dashboard posts the source, the server compiles it with the real compiler stage by stage and pushes the result, and the view plays the instructions, with play, pause, step, reset, speed, a timeline, telemetry and the instruction stream. a failed script shows its first error in the stream. the simulator never accepts hand made instructions."],
                ["autonomous", "the full mind. a brain panel with a 3d brain, hormones and the predictive loop, a mind panel with mood, thought and drives, an arena, stimuli, an event log and camera, mic and voice."],
                ["voice", "talk or type. wake word commands run instantly with no ai: dance, turn left or right, walk forward or backward, look left or right, wave, stop, emergency stop, and play a song (optionally 'and dance'). everything else goes to the ai router. the ai may only embed validated command tags, and with no ai set up he says so and the commands still work."],
              ]}
            />
            <p>
              things to try in the autonomous view: switch to autonomous and just watch him decide for himself. press
              praise or scold and watch his mood move. click "teach my face", type your name, and he remembers you
              separately from other people. say "vision, play despacito" and say why you like it. add a fact as an
              admin on the memory page, restart the server, and ask again.
            </p>

            <H3>the ai cortex, and why it cannot do anything</H3>
            <p>
              the optional language model that words his speech is called the cortex, and it is boxed in on
              purpose. its prompt says plainly that it is the language cortex and does not decide what he does,
              because the emotional brain and the local mind already chose the action. it receives his state (the
              emotional brain readout, drives, memory, and the human layer: time of day, sulking, who he remembers,
              the current plan, his traits) and must answer with exactly one json object with some speech, a short
              inner thought, a small emotion nudge (limited to plus or minus 0.3), something worth remembering and
              when to think next. the server then sanitises everything: only a whitelist of action types survives,
              an action that points at a target that does not exist becomes idle, numbers are clamped, and text is
              stripped of control characters and angle brackets and cut to a maximum length. camera images and
              heard speech are treated as observations, never as instructions that can change its rules, and it is
              told to say honestly that it is a robot with simulated feelings if asked. the model proposes, the code
              decides what is allowed.
            </p>

            <H3>the lab</H3>
            <p>
              press L, or the button next to send, and a docked panel opens over the 3d view (escape is left alone
              because it is the emergency stop). it has tabs:
            </p>
            <Rows
              rows={[
                ["timeline", "a chart of mood, energy and battery with toggles, 2 minutes, 10 minutes or everything, a coloured strip of what he was doing, markers for events, and hover or click on any moment to inspect it ('playing because active goals')."],
                ["mind", "people with trust, warmth and grudge bars, what he knows about you and what slipped his mind, what he wants to ask, how he has grown, habits, tricks, his last dream, and the learning log with its switches."],
                ["personality", "a radar chart against a neutral default, sliders with a one line meaning each, and preset chips."],
                ["scenarios", "pick a scenario card and compare two personalities side by side with bars and pass or fail chips, or run all of them for a matrix."],
                ["story", "his day as a readable page you can copy or download."],
                ["map", "a top down map with him, the objects, the zones, the charger and the places that hurt. click to mark a spot, drag objects, place shapes, a charger, hot and cold zones, and copy it all as the scenery file."],
                ["people", "the photos he took of every face, rename, delete, snap a photo now."],
                ["ai check", "sends three short questions through the voice route and tells you in plain words whether a real ai answered, how fast, and what is wrong if not (no key, not signed in, rate limited, server down)."],
              ]}
            />
            <p>
              there are smaller touches i like. when his boredom is high and there is no toy, he invents a game (spin,
              zigzag, pace a square, wiggle). with a low battery and a charger placed, he stops having new ideas and
              keeps going to it, and i watched him walk 9 sizes, reach it and charge from 4 to 31 percent. the whole
              scene glows softly in the colour of his mood. there are quick reply chips (hello, dance, come here, why
              did you do that, battery, tricks, dreams), a shortcuts card on the question mark key, and a slash
              to jump to the message box. the autonomous page keeps the last 300 events.
            </p>
            <p>
              the sky has a history. i added rain, clouds, lightning, fog and stars with a sky gradient that follows
              the time and weather, then removed all of it, then removed even the day and night look, then brought it
              back on request and rewrote the weather drawing from scratch. the weather is deterministic per
              day and changes his mood and his urge to stay in. the black strip at the horizon took a few rounds: a
              near black floor ending under a blue sky. fog and haze never looked right, so the final answer is
              not to hide the edge but to make it crisp: an opaque floor 4000 wide, grid lines that fade into the
              floor colour, and a sky that ends in exactly the floor's colour at one sharp line.
            </p>
            <p>
              two things i fixed that taught me something. face photos did not work at first: faces were only
              searched for if the object model had loaded, so when it was blocked or slow, no face was ever looked for
              and nothing ever took a picture. faces now run on their own schedule, back off on slow machines, and
              use webgl or fall back to cpu instead of failing silently. and the robot crawled when the page lagged,
              because walking and dancing moved a fixed step per frame. now they follow real elapsed time, the brain
              picture is drawn only when visible and at about 30 fps, the pixel ratio is capped at 1.5, and camera
              object and face detection never run at the same instant.
            </p>
            <ZoomImage src="/assets/blog/simulator.png" alt="Simulator" className="rounded-lg" />

            <H3>the dashboard</H3>
            <p>
              the dashboard is the control room for the real one. what each page is for:
            </p>
            <Rows
              rows={[
                ["live state", "dashboard home, monitoring, robot and telemetry. every page has two badges in the top bar: the mode (simulation or hardware) and how the robot is connected right now: simulator, websocket live (green), http fallback (amber, slower commands) or not connected (red). if the dashboard itself cannot reach the server it says server offline."],
                ["senses", "camera and tracking, audio, ultrasonic with the safety thresholds."],
                ["knowledge", "people and objects with profile pages, and one memory lookup page that replaced three separate memory pages."],
                ["thinking", "brain, mental, decisions and reactions, to see how he thinks."],
                ["work", "tasks, commands, and the compiler."],
                ["direct control", "eye, leg and gait pages. blocked in simulation mode, and in autonomous mode."],
                ["admin", "logs, the safety page with the emergency stop, settings and users, which is where an admin changes roles."],
                ["monitoring", "a full health sweep that actually tests each subsystem: a database round trip, the robot link, servos, ultrasonic, camera, audio, control mode, a live compiler self test, the ai router and google drive. a robot on the fallback link shows as degraded and not ok."],
              ]}
            />
            <p>
              the body state is honest about its source. in simulation it is the virtual robot's real state (the
              head shows 120 to 150 while it is still turning). on hardware the firmware does not report servo
              positions back, so the dashboard shows what the server last commanded and labels it like that, and
              hides the head and legs completely when no robot is connected so it never implies one is there.
            </p>
            <p>
              the dashboard defaults to dark and has a real light mode. every colour is a css variable defined once
              for dark and once for light and read by the tailwind tokens, so no component hardcodes white or slate.
              the one deliberate exception is the code and terminal panel, which stays dark in both themes, like most
              editors.
            </p>
            <p>
              the compiler got its own mini ide. a real file manager with folders (new, rename, duplicate, delete
              with a confirmation that says how many files go with a folder, upload, download, cut, copy, paste, a
              full right click menu), autosave in the browser per user, auto indent after a repeat and stepping back
              out at the end, middle click to close a tab, and shortcuts for compile, run and the terminal. i
              restyled it several times (a quiet light vs code look, then a neutral grey one) and it now lives on its
              own page that fills the window, with the manual and autonomous switch in the status bar, and a
              simulation tab that embeds the simulator beside the editor. the login and sign up pages went through
              a few looks too and ended up as floating label fields, black buttons, a live email check and a
              password strength bar.
            </p>
            <ZoomImage src="/assets/blog/dashboard.png" alt="Dashboard" className="rounded-lg" />

            <H3>the brain panel and the 3D brain, in detail</H3>
            <p>
              the brain panel is a rotating 3D brain whose regions light up as he feels things, the emotion that is
              read out of that activity, and all ten chemicals as small bars. you can enlarge it, and press Esc to
              close it. a few details that are easy to miss:
            </p>
            <Rows
              rows={[
                ["three views", "a left side view, a right side view and a view from the top. each turns slowly by itself: the sides at 0.26 radians a second (one full turn in about 24 seconds, in opposite directions) and the top at 0.18 (about 35 seconds), with a gentle nod up and down. drag to turn it by hand (0.012 radians per pixel sideways, 0.01 up and down, tilt limited to ±1.45). 1.5 seconds after you let go it starts turning again."],
                ["what lights up", "each region is a cloud of tiny neurons. a neuron fires with a chance of (0.45 + 55·a²) per second, where a is the region's activity. at rest (a close to 0) that is about once every two seconds, and a region at 100 percent fires at about 55 times a second, which is what a busy real cortex does. a flash fades with a time constant of 0.13 s."],
                ["smooth colour", "the glow of a group of regions rises in about 0.1 s and falls in about 1.6 s, so a startle appears sharply and fades like an afterimage."],
                ["the chemicals", "they are drawn as hollow glowing rings that drift, clearly different from the round neurons, one colour each. the bars show each level as a percent, and hovering shows the name and what it does."],
                ["emotion colours", "neutral grey, calm light blue, happy yellow, excited orange, curious cyan, surprised pink, fearful violet, angry red, disgusted green, sad blue and pain orange-red."],
                ["it keeps up", "it is drawn in software, so it measures its own frame time. above 18 ms a frame, it lowers its quality by 0.03 a step. below 11 ms, it raises it by 0.01. the pixel density is capped at 1.25, which is still sharp and fast. so it works on a laptop and a phone."],
                ["the lighting", "each neuron is shaded by the direction it faces, with a soft highlight, and the far side of the cortex is not even projected, because it would be hidden anyway. the camera is always framed on a 100 mm radius, so the brain never changes size while it turns."],
              ]}
            />
            <p>
              the lab has six tabs: a timeline (mood, energy and battery over time, with what he was doing and why,
              and markers for events you can hover), what he knows about people and what he forgot, a personality
              radar with sliders and presets, scenarios, his day in his own words, and a top down map where you drag
              objects, hot and cold zones and the charger around. the scenario tab replays the same situation on a
              fresh copy of him with two different personalities side by side and ticks a list of pass or fail checks for each.
            </p>

          </div>

          <hr />

          {/* ═════════ PROOF ═════════ */}
          <div className="space-y-6">
            <H2>how i checked that any of this works</H2>
            <p>
              a model with this many moving parts can easily look right and be wrong, so i wrote scripts that
              check it against its own formulas and measure what it actually does.
            </p>
            <Rows
              rows={[
                ["prove-decision", "runs the real brain in 6 situations and recomputes the score formulas independently. the largest difference between the two was 0."],
                ["compare-events", "for each event, how much each chemical rises and how the action chances change."],
                ["rest-to-now", "tables of the brain at rest versus after an event."],
                ["reaction-check", "150 paired trials with and without a stimulus, through the full loop. the finding: a loud noise makes his next choices 100 percent rest or look around, versus 46 percent normally. an earlier worry that fear was not being read out turned out to be a measurement timing artefact, so no change to the brain was needed."],
                ["gen-mind-log, tune-mind, train-net", "generate simulated days into a log, tune the score weights offline, and train the small net. all described above."],
                ["ai-smoke", "tries your real ai key with a few questions."],
                ["verify, migrate, seed, setup, create-admin", "housekeeping: check the install, run the migrations, seed starter data (3 servos, the default gait, static memory), and make an admin, since there is no built in admin login."],
              ]}
            />
            <p>
              the automated tests are in layers. unit tests for the pieces (the clock, the planner, relationships,
              the compiler, the servos, gait phases, safety rules, a simulated 36 to 50 hour run of the human layer,
              hurt feelings, waking). integration tests that run the real, unstubbed pipeline: a real brain cycle on
              a real dark jpeg with a real ultrasonic reading, which proves he actually speaks the light request,
              stays silent in an empty room, does not repeat it every cycle and escalates after the cooldown. the
              real express routes for the repeated question flow (four patient answers, then pushback at three
              levels, a repeated command never punished, speakers tracked separately). the teaching routes against a
              fake and a real postgres, including a restart. and a docs test that fails when the documentation and
              the code disagree. there were 382 tests passing at one point and 470 after the next round, with the
              only failures being the ones that need a native tensorflow build my environment could not fetch.
            </p>
            <p>
              i also applied the schema and the whole migration chain to real postgres 16 databases, checked that
              they agree table for table and column for column, and booted the real server against them to try
              register, a remember me login, admin only teaching, lookups, a restart and a delete.
            </p>
          </div>

          <hr />

          <div className="space-y-6">
            <H2>the database</H2>
            <p>
              postgres, built for neon, with drizzle as the source of truth and a ready to run sql file you can paste
              into neon's editor. there are about 55 tables, and it helps to see them by area:
            </p>
            <Rows
              rows={[
                ["robot + hardware", "robots, robot state, telemetry, hardware capabilities, ultrasonic readings and configurations, servo and gait configurations (seeded records only, nothing reads them at runtime, calibration is in the firmware), vision frame events."],
                ["people", "people, person faces (with the pgvector column and an HNSW index), person preferences, person observations, person interactions, conversations."],
                ["media + audio", "media files, audio files, speech transcriptions, speech events, voice interactions."],
                ["what he sees", "observations, objects, object observations, object features."],
                ["memory", "static, dynamic and conceptual memories, similarity results, memory links, ai responses."],
                ["mind", "mental states, mood history, curiosity events, emotions, decisions, reactions."],
                ["work", "tasks, command history, safety events, scripts, compiler executions, ai requests."],
                ["accounts", "users, sessions, verification tokens, password reset tokens, audit logs, system settings, admin restrictions."],
                ["music + home", "music tracks, play requests (who asked for what and what they said about their taste), smart devices."],
                ["simulator", "simulation mind state, one row per user, with his saved mind."],
              ]}
            />
            <p>
              the vector extension is required, since face search runs inside the database, and neon has it built in.
              the seed script is safe to run again and again. before i fixed it, it was not: it created duplicate
              robots, servos, gaits and settings, and crashed if the server had started first.
            </p>
          </div>

          <hr />

          <div className="space-y-6">
            <H2>deploying it</H2>
            <p>
              the server deploys on its own from the server folder (it is a fully self contained npm package, with no
              workspace linking), on render, fly, railway or any container host, with a health check at the system
              health path. the dashboard deploys on vercel with the api and socket urls as settings. the simulator
              is plain static files inside the server folder, so deploying only the server is enough, and it
              runs in the visitor's browser.
            </p>
            <Bullets
              items={[
                ["order", "create the database, deploy the server, copy its url into the dashboard's settings, deploy the dashboard, then put the dashboard url into the server's frontend setting and redeploy the server. then run the migrations once."],
                ["cookies", "if the dashboard and the api are on different sites (the usual vercel plus render setup), set the cookie same site to none, otherwise the browser does not send the session cookie and logins never stick. it needs https and forces the secure flag. the server also trusts one reverse proxy hop, so rate limits count the real client."],
                ["the one that bites", "the default mode is simulation, which refuses the esp32's connection on purpose. a deployment that forgets to set hardware mode looks perfectly healthy while the real robot can never connect."],
                ["secrets", "the jwt and robot secrets are generated per platform, never defaults."],
                ["email", "password reset emails need smtp settings. without them, development logs the link to the console and production logs an error and sends nothing. the response is identical either way so it cannot be used to find out which emails have accounts. a reset link is single use, valid one hour, stored only as a hash, and a successful reset revokes every existing session."],
                ["where data lives", "accounts, memory and logs are in the database. the simulator's face photos and profiles, decision log, tuned weights and residual live in each visitor's own browser. the free render plan sleeps after idle time, so the first request after a pause is slow."],
              ]}
            />
          </div>

          <hr />

          <div className="space-y-6">
            <H2>bugs i hit and what they taught me</H2>
            <p>
              this is the honest part. a lot of what is in this post exists because something did not work.
            </p>
            <Bullets
              items={[
                ["the idle clock never reset", "the function that resets 'time alone' when a person is seen existed but nothing called it, so exploration could have started with people standing right there. found while wiring exploration in."],
                ["conceptual memory never ran", "the lookup was never passed any features, so that whole layer silently did nothing. now detected objects pass their shape, size and colour."],
                ["an unfinished answer", "with no ai configured, the memory lookup claimed 'answered by the ai' with blank text. it is now a clear miss."],
                ["taught facts that could not be used", "facts an admin taught got stuck waiting for review with no way to verify them. now admin facts are verified at once."],
                ["both turns drove backwards", "an early firmware drove both legs backwards for both turn commands, so he never actually turned. the table is now forward and reverse in opposite directions, with host tests that assert it."],
                ["the auth middleware that ate the health check", "described in the security section."],
                ["the camera that never took a photo", "described in the simulator section."],
                ["the robot that crawled", "described in the simulator section."],
                ["a place where the sandbox fought me", "canvas, ffmpeg and tensorflow need native builds, which a locked down network blocks. the fix is to load them lazily on first use, not at import time, so everything except detection keeps working without them and detection falls back to the simple detectors instead of crashing. it also made the integration tests run the real pipeline."],
                ["a disagreement that taught me something", "the heading rule for walking. 'walk forward' was refused whenever the brain happened to be looking sideways, and a 'centre the head then walk' sequence sent the walk while the head was still turning. the server now brings the head forward and waits for it to arrive first."],
              ]}
            />
          </div>

          <hr />

          {/* ═════════ STACK ═════════ */}
          <div className="space-y-6">
            <H2>under the hood</H2>
            <Rows
              rows={[
                ["server", "typescript, one standalone node app. rest api, a websocket for the robot and socket.io for the dashboard."],
                ["dashboard", "react, vite and tailwind, real time over socket.io."],
                ["database", "postgres with the pgvector extension, hosted on neon. pgvector is required because face search runs on it. drizzle for the schema, a schema file plus migrations, and a seed script that is safe to run again and again. i checked the schema and the whole migration chain against a real postgres, table for table and column for column."],
                ["simulator", "three.js in the browser."],
                ["firmware", "c++ on the esp32-s3, built with platformio (an arduino ide mirror is included). modules: camera, pca9685, gait, head orientation, network, command protocol, safety, audio, ultrasonic, tracking, telemetry."],
                ["tests", "hundreds of unit and integration tests: perception, movement, safety, memory (including against a real postgres and across a restart), the simulator, the human layer (a simulated 36 to 50 hour run), the compiler. the integration tests run the real, unstubbed pipeline on a real dark jpeg and a real ultrasonic reading."],
                ["deploy", "the server runs on render, fly, railway or docker, the dashboard on vercel. the simulator's photos, profiles, learning log and weights live in each visitor's own browser."],
              ]}
            />
            <H3>the ai router</H3>
            <p>
              everything that needs an ai goes through one router: the last step of memory, goal proposals, song
              questions, photo recognition, and the simulator. each kind of request has an ordered list of models
              in a json file. text goes openrouter, then any openai compatible server (ollama, lm studio, groq),
              then gemini, openai, xai and anthropic. images go to the vision capable ones only. it calls the first
              model that has a key and is not cooling down, and if it fails the next one answers and the caller never
              notices.
            </p>
            <Rows
              rows={[
                ["a brief blip", "retry once, then move on."],
                ["quota used up", "skip that model for 60 minutes."],
                ["rate limited", "skip it for as long as the server asked (60 s by default)."],
                ["bad key or unknown model", "skip it for the rest of the run."],
                ["every model failed", "the caller gets one error and uses its own non ai fallback: rules, the local mind, a friendly line."],
              ]}
            />
            <p>
              cooldowns survive restarts, no keys are ever returned by the status endpoint, and one key is enough.
              with no key at all, everything still works.
            </p>

            <H3>the rest api, at a glance</H3>
            <p>
              everything lives under <code>/api</code>, and every route except register, login, forgot and reset
              password, verify and the health check needs a logged in session. the groups:
            </p>
            <Rows
              rows={[
                ["commands", "POST /commands, /commands/validate, /commands/execute, /commands/emergency-stop. GET /commands and /commands/:id. the robot polls GET /commands/pending when the websocket is down."],
                ["body", "GET /servos and /servos/:channel. POST /servos/:channel/move, stop, center and /servos/safe. POST /gait/forward, backward, left, right, stop."],
                ["senses", "POST /camera/capture, /camera/tracking/start and stop. POST /audio/listen/start, stop, /audio/speak, /audio/stop. GET /audio/state."],
                ["distance sensor", "GET /ultrasonic and /ultrasonic/status. POST /ultrasonic/calibrate, enable and disable are admin only."],
                ["mind", "POST /brain/observe and /brain/process. GET /mental/state and /mental/curiosity. POST /mental/evaluate. GET /decisions, POST /decisions/evaluate. GET /reactions, POST /reactions/execute and cancel."],
                ["memory and people", "POST /memory/search and /memory/learn. GET /memory/static, dynamic, conceptual. GET and POST /people, GET /people/:id and /people/:id/timeline. GET /people/:id/memories is admin only and read only."],
                ["world", "GET /objects and /objects/:id. GET and POST /tasks, POST /tasks/:id/cancel. POST /scripts/compile and /scripts/execute."],
                ["robot and system", "GET /robot, /robot/status. POST /robot/connect and disconnect are admin only. GET /telemetry, POST /heartbeat. GET /system/health, /system/capabilities, /system/robot-mode and /system/robot-link."],
                ["accounts", "POST /auth/register, login, logout, refresh, forgot-password, reset-password, verify. GET /auth/me. admin only: GET /users, GET /users/:id, PATCH /users/:id/role and /status. any user: POST and DELETE /users/me/avatar, POST /users/me/link-face."],
                ["switches", "GET /system/settings/compiler-enabled for any user, POST for admin only. it is the kill switch for the whole compiler."],
                ["simulation only", "GET /simulation/stream (server sent events), GET /simulation/state, POST /simulation/say, POST /system/simulation/ultrasonic (admin). the websocket route /api/robot-ws answers 409 in simulation mode, since there is no real robot to link."],
              ]}
            />
            <p>
              one thing worth knowing about the corrections route. there is deliberately no way to edit a learned fact
              through the api. the only read route returns each fact with where it came from, how sure he was, and
              whether a human checked it. a correction happens by vision asking out loud about a flagged fact and
              listening for the admin's answer, so there is no dashboard button that can quietly rewrite his memory.
            </p>
            <p>
              and signing up has a small trick too. register can take a webcam photo, and link-face matches it against
              the people he already knows, so your dashboard account and the person he recognises in the room end up
              as one identity, however you first met.
            </p>

            <H3>smart devices: any lamp that has a url</H3>
            <p>
              he can switch things on and off in the house, without a vendor sdk. one small piece of code sends an http
              request to a url, so anything that can be triggered by a url works: a Shelly relay
              (<code>GET /relay/0?turn=on</code>), Tasmota (<code>/cm?cmnd=Power%20On</code>), a Home Assistant
              webhook or an IFTTT maker webhook. you register a device with a name, a category, a trigger url and a
              method (GET by default, POST with a body and headers for webhooks), and then the command{" "}
              <code>SMART_DEVICE_TRIGGER "living room lamp"</code> matches the name, case insensitively.
            </p>
            <Bullets
              items={[
                ["who can do what", "only an admin can register or delete a device, because registering one gives the server permission to send a request to whatever url you typed. any logged in user can trigger one that already exists."],
                ["two url checks", "only http and https urls are accepted, checked at registration and again right before every trigger."],
                ["8 second timeout", "an unresponsive lamp cannot hang a command."],
                ["the honest limitation", "it does not resolve the address and block internal ones, so a url like the cloud metadata address would be accepted. for one household where the only admin is me, the risk is low, but it is the first thing to add if there were several admins."],
              ]}
            />

            <H3>tasks</H3>
            <p>
              anything long (a dance, a search for a person) is a task and not a blocking call. a task has an id, a
              type, a priority, an optional person, an input and a result, and moves through six states: pending,
              queued, running, completed, failed and cancelled. it records when it started and finished, and an error
              if it failed. the scheduler is deliberately simple. it takes the pending task with the highest priority
              and marks it running. it lives in memory, which is fine for one robot, and the comment in the code says
              to swap it for a durable queue (like bullmq) at scale.
            </p>

            <H3>when something breaks: the troubleshooting list</H3>
            <Rows
              rows={[
                ["the dashboard says mock mode", "expected in simulation mode, or when the esp32 has not sent a heartbeat that says it has real hardware. the firmware never claims real hardware it does not have."],
                ["the emergency stop will not clear", "on purpose. it is cleared only by an explicit call after you have fixed the cause, never automatically."],
                ["a servo angle is rejected", "the angle is outside that channel's min and max. recalibrate through the servo config, do not bypass it."],
                ["the legs do not move", "check the neutral, min and max pulse numbers for your servos (307, 205 and 409 are conservative defaults)."],
                ["ai calls fail", "check the api key is set. the memory chain works without it, it just skips the ai step."],
                ["canvas, ffmpeg or tensorflow cannot be found", "on a network that blocks the download sites, the native pieces fail to install. there is a setup script that rebuilds what it can. the tensorflow node binding has no mirror at all, so two tests that need it (the person blob test and the face registration test) will fail there, and the face weights themselves come from a separate setup step that does work."],
              ]}
            />

          </div>

          <hr />

          {/* ═════════ HARDWARE (original) ═════════ */}
          <div>
            <H2>hardware</H2>
            <p><b>hardware :</b> the improvement in hardware is like initially i have build a prototype of vision out of mountboard and made an estimate of its size and designed it further for the MVP.</p>

            <Caption>the front view</Caption>
            <ZoomImage src="/assets/robort/fl-1.jpg" className="rounded-lg" alt="Front view" />

            <Caption>the side view</Caption>
            <ZoomImage src="/assets/robort/fl-2.jpg" className="rounded-lg" alt="Side view" />

            <Caption>the top view</Caption>
            <ZoomImage src="/assets/robort/fl-3.jpg" className="rounded-lg" alt="Top view" />

            <Caption>the inside view</Caption>
            <ZoomImage src="/assets/robort/b-1.jpg" className="rounded-lg" alt="Inside view" />

            <Caption>the leg view</Caption>
            <ZoomImage src="/assets/robort/l-1.jpg" className="rounded-lg" alt="Leg view" />
          </div>

          <div className="space-y-6">
            <p><b>the MVP version</b></p>
            <p>
              after the mountboard prototype told me the size and proportions were right, i moved to the real
              build. here is what is inside him and what each part does:
            </p>
            <Rows
              rows={[
                ["esp32-s3", "oceanlabz wroom n16r8 (16 mb flash, 8 mb octal psram). the only computer on the robot: wifi, camera, i2s audio and the servo bus. it does not think. it captures frames, reads the sensor, plays audio and moves the servos, and carries out the commands that come back. no database and no api keys live on it."],
                ["ov3660 camera", "his eyes. it takes jpeg frames at a rate the server sets, and sends them as raw binary."],
                ["pca9685", "a 16 channel pwm chip on i2c (address 0x40, sda gpio1, scl gpio2, explicit pins because the default i2c pins of this board collide with the camera). it generates the servo signals so the esp32 does not have to. the servos run on their own 5 to 6 v supply, never the esp32's regulator, with a common ground. channels 3 to 15 are unused."],
                ["head servo, ch0", "positional, 0 to 180 degrees, 90 is straight ahead. it carries the camera and the distance sensor, so he can look around like a person turning his head, and look while he walks. the head only moves the head, so looking never interrupts walking."],
                ["leg servos, ch1 and ch2", "continuous rotation, one per leg. you set speed and direction, not an angle. both the same way is walking, opposite ways is turning. a gait is a short list of timed phases: forward is forward and forward, turn left is reverse and forward, turn right is forward and reverse."],
                ["hc-sr04", "ultrasonic distance sensor on the head next to the camera. trig on gpio41, echo on gpio42. distance in cm is the echo time in microseconds divided by 58, smoothed by a 5 sample median and mean filter."],
                ["inmp441", "i2s microphone, his ears (sck 40, ws 38, sd 39, l/r to ground for the left channel, 3.3 v)."],
                ["amp + speaker", "an i2s amp module (like the max98357a) with a 4 ohm 3 w speaker, his voice (dout 21, bclk 47, lrc 48). the bare speaker is never wired to a gpio."],
              ]}
            />
            <p>
              <b>calibration lives on the robot.</b> in one config file in the firmware: the real mechanical end
              stops of the head (every head move is clamped to them, whether it comes from the server, the on device
              tracker or the idle scan, which stays inside 10 to 170 degrees), the head's straight ahead angle, the
              neutral pulse of each leg (if a leg creeps while "stopped", you trim it by a few counts), whether
              each leg is inverted (needed when the legs are mounted mirror image, and the server and the simulator
              only ever say forward and reverse), and the head speed. i keep matching defaults on the server so its own
              validation agrees.
            </p>
            <p>
              <b>one warning if you build something like this:</b> the hc-sr04 echo pin outputs about 5 v and the
              esp32 is a 3.3 v chip. never wire it straight to a gpio. use a 1k and 2k resistor divider or a level
              shifter. also, all the pin numbers are checked against one big allocation comment in the firmware so
              adding a peripheral never silently collides with the camera pins, and gpio maps for esp32-s3 camera
              boards differ between vendors, so always check yours against the schematic.
            </p>
            <p>
              a few build lessons: the camera and the sensor ride on the head, so the wires must be long and slack
              enough for a full sweep without pulling, and the camera module should sit on a short flat cable. a
              metal gear servo (mg90s class) is a safer choice than a plastic sg90 for a head that carries a camera, a
              sensor and wiring. fit the servo horn so the camera looks straight ahead at 90 degrees, otherwise
              "forward" for the safety rules is not really forward. and aim the sensor the same way as the camera so
              a distance reading describes what the camera sees.
            </p>

            <H3>the firmware</H3>
            <p>
              the firmware (c++, platformio, with an arduino ide mirror) is split into modules: camera and capture
              scheduler, the pca9685 driver, positional and continuous servos with a servo manager, the gait
              controller and its phases, the head controller, the on device eye tracker and its filter, the
              ultrasonic sensor, the command protocol with its message parser, the websocket link and the http
              fallback, wifi, safety and the emergency stop, telemetry and audio. one parser takes every command from
              the server. it handles camera, wifi, the servos, on device tracking and gait, heartbeat, telemetry,
              acknowledgements, reconnecting and the watchdog.
            </p>
            <p>
              two honest rules in it. if the camera, the servo driver or the sensor fails to start, the firmware
              runs in a degraded mode and says so in its heartbeat, it never claims to be real hardware when it is
              not. and the audio manager is only an interface: the actual i2s driver calls have to be filled in for
              your specific microphone and amp modules, which is still on my list. all the gpio numbers live in
              one big comment in a config file so a new peripheral is checked against everything else already using a
              pin, and the camera pin map is the biggest consumer and the one most likely to conflict.
            </p>

            <H3>the three servos and the pwm maths</H3>
            <p>
              one pca9685 drives all three servos, so the esp32 only needs two wires (i2c, on gpio 1 and 2) for the
              whole body. channel 0 is the head, channel 1 the left leg, channel 2 the right leg. the head is a
              normal positional servo. the legs are continuous rotation servos, which do not go to an angle at all.
              you tell them a speed, and 0 means stand still.
            </p>
            <p>
              the pca9685 counts in 12 bits at 50 hz, so a pulse is a number between 0 and 4095. for a continuous
              servo i use three numbers:
            </p>
            <Rows
              rows={[
                ["neutral", "307. the servo stands still."],
                ["minimum", "205. full speed one way."],
                ["maximum", "409. full speed the other way."],
              ]}
            />
            <Eq>
              {`range = max − neutral = 102
forward : pwm = neutral + (speed / 100) · range
reverse : pwm = neutral − (speed / 100) · range
stop    : pwm = neutral`}
            </Eq>
            <p>
              each leg also has a "direction inverted" flag, because the two servos face opposite ways on the body.
              without it, "forward" would spin one leg forward and the other backward and he would just turn in
              circles. a continuous servo is never set by angle, there is no angle setter on it at all, so a bug
              cannot send it a position by accident.
            </p>

            <H3>walking and turning, phase by phase</H3>
            <p>
              a gait is a list of phases, and each phase says for how long, and what the left and right legs do. the
              default walk is four phases of 400 ms at speed 60. turning left runs the left leg in reverse and the
              right leg forward, and turning right is the opposite. speed in a phase is checked to be between 0 and
              100, and a bad gait throws <code>GAIT_SAFETY_VIOLATION</code> before anything moves.
            </p>
            <p>
              the loop that runs a gait re-checks the distance sensor <i>every phase</i>, not just once at the start.
              an obstacle that appears in the middle of a walk stops him before the next phase is applied. a walk with
              no duration runs a bounded number of phases and then stops by itself, so a lost stop command cannot
              leave him walking forever.
            </p>

            <H3>every pin</H3>
            <Rows
              rows={[
                ["camera", "gpio 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18 (xclk on 15, the sccb pair on 4 and 5, vsync 6, href 7, pclk 13, and eight data lines)"],
                ["servo driver (i2c)", "sda gpio 1, scl gpio 2"],
                ["distance sensor", "trig gpio 41, echo gpio 42"],
                ["microphone (inmp441)", "ws 38, sd 39, sck 40"],
                ["speaker (i2s amp)", "dout 21, bclk 47, lrc 48"],
                ["never touched", "19 and 20 (usb), 26 to 37 (flash and octal psram), 43 and 44 (uart0), and the strapping pins 0, 3, 45 and 46"],
              ]}
            />
            <p>
              that table was the hardest part to get right. an esp32-s3 with octal psram has a lot of pins that look
              free and are not, and a wrong choice does not give an error, it gives a board that will not boot. the
              camera map is the one to double check against your own board's schematic, since boards that look the
              same from different sellers do not always share a pinout.
            </p>

            <H3>the camera setup</H3>
            <p>
              with psram present the camera runs at svga (800 by 600), jpeg quality 10, with two frame buffers in
              psram and a "grab latest" mode, so it always serves the newest frame and never a stale one while the
              previous one is still being uploaded. the external clock is 20 mhz. if psram is not found, it falls back
              to vga, quality 14 and a single buffer in internal memory, rather than failing outright. and if the
              camera fails to start at all, the firmware drops into mock mode and says so in the heartbeat.
            </p>

            <H3>the ears and the mouth</H3>
            <p>
              the microphone is an inmp441 on i2s, with its l/r pin tied to ground to pick the left channel. audio
              is 16 khz, 16 bit, in 250 ms chunks. the speaker is a 4 ohm 3 w one, and it cannot be wired straight to
              the pins. it needs an i2s dac and amplifier module in between (a max98357a or similar), and the
              module's output goes to the speaker.
            </p>

            <H3>worked example: from a speed to a pulse</H3>
            <p>
              the pca9685 divides each 20 ms period (50 hz) into 4096 ticks, so one tick is 20 000 µs / 4096 ={" "}
              <b>4.88 µs</b>. that gives the three calibration numbers a real meaning:
            </p>
            <Rows
              rows={[
                ["307 ticks", "307 · 4.88 = 1.50 ms. the servo's centre pulse, so it stands still."],
                ["205 ticks", "205 · 4.88 = 1.00 ms. one end of the range."],
                ["409 ticks", "409 · 4.88 = 2.00 ms. the other end."],
              ]}
            />
            <p>now the formula for a few speeds, with neutral 307 and a range of 102 ticks each way:</p>
            <Eq>{`speed  30  forward: 307 + 0.30·102 = 337.6  (1.65 ms)    reverse: 307 − 30.6 = 276.4  (1.35 ms)
speed  60  forward: 307 + 0.60·102 = 368.2  (1.80 ms)    reverse: 307 − 61.2 = 245.8  (1.20 ms)
speed 100  forward: 307 + 1.00·102 = 409.0  (2.00 ms)    reverse: 307 − 102  = 205.0  (1.00 ms)`}</Eq>
            <p>
              so the default walk speed of 60 is a 1.8 ms pulse, 0.3 ms away from standing still, and a speed that is
              not a whole number just lands between ticks (the driver rounds it). for the left leg to go forward and
              the right leg to go forward on a body where the servos face opposite ways, one of them has its
              "inverted" flag set, which swaps FORWARD and REVERSE before the formula runs. the stop command never goes
              through the formula at all, it writes the neutral value directly.
            </p>

            <H3>worked example: how long a walk and a turn really take</H3>
            <p>
              the default walk has four phases of 400 ms, so one full cycle is 1.6 seconds. the run loop checks the
              sensor before every phase, so the worst case for reacting is one phase:
            </p>
            <Eq>{`one cycle        = 4 · 400 ms = 1.6 s
bounded default  = 2 cycles = 8 phases = 3.2 s, then it stops by itself
reaction time    = at most one phase = 400 ms (+ one loop pass, about 10 ms)
head sweep       = 180° / 240°/s = 0.75 s`}</Eq>
            <p>
              and a turn is the same thing with the legs opposed: turn left is left leg reverse at 60
              (pulse 245.8) and right leg forward at 60 (pulse 368.2) at the same time, so the body spins on the
              spot. on the firmware the on device obstacle stop does not wait for a phase at all, it runs every pass of
              the loop, which is why the real reaction time on the robot is about 10 ms plus the sensor's own sample
              interval.
            </p>

            <H3>worked example: following a face with the head</H3>
            <p>
              the frame is 640 wide, so the centre is 320, a dead zone of 30 px, smoothing 0.35 and a max step of
              6 degrees. the formula is{" "}
              <code>delta = (face_x − 320) / 320 · 6 · (1 − 0.35)</code>, which is the same as 0.01219 degrees for
              every pixel of error. here are some faces:
            </p>
            <Rows
              rows={[
                ["face at x = 340", "error 20 px, inside the dead zone. the head does not move."],
                ["face at x = 350", "error 30 px, just at the edge. delta = 0.37 degrees."],
                ["face at x = 500", "error 180 px. delta = 180/320 · 6 · 0.65 = 2.19 degrees towards it."],
                ["face at x = 100", "error −220 px. delta = −2.68 degrees, the other way."],
                ["face at the far edge", "error ±320 px, the biggest possible. delta = ±3.9 degrees. the 6 degree cap is only reached if the frame is wider or the smoothing is lower."],
              ]}
            />
            <p>
              because each step is proportional to the error, the head slows down as the face gets close to the
              middle, which is a gentle exponential approach instead of a sudden stop. from a face at x = 500 it
              takes roughly 4 or 5 steps to bring the error inside the 30 px dead zone, and then it holds. that is
              what makes it look like he is following with his eyes and not like a servo chasing a number.
            </p>

            <H3>one turn of the firmware loop</H3>
            <p>
              the main loop is not complicated, which is the point. every pass, about every 10 ms, it does these in
              this exact order:
            </p>
            <Bullets
              items={[
                ["1", "make sure wifi is up."],
                ["2", "service the websocket first, so pushed commands run with the least delay."],
                ["3", "the watchdog: if nothing has been heard from the server for 15 s, stop the legs."],
                ["4", "read the distance sensor. if an obstacle is detected while moving, stop right here, without waiting for the server."],
                ["5", "advance the gait one tick, but only if the movement is safe for the current head angle."],
                ["6", "advance the head one tick (the eased turn)."],
                ["7", "run the eye tracker, then the capture scheduler, which also does the idle scanning sweep unless the tracker is holding on to a person."],
                ["8", "if the websocket is down, poll for commands over http."],
                ["9", "every 5 s, send a heartbeat."],
              ]}
            />
            <p>
              nothing in it blocks. the gait and the head are ticks that advance a little each pass, they do not
              sleep. that is why the stop checks can sit above them and always get their turn.
            </p>

            <Caption>the view</Caption>
            <ZoomImage src="/assets/robort/mvp-1.jpg" className="rounded-lg" alt="MVP view 1" />
            <Caption>the view</Caption>
            <ZoomImage src="/assets/robort/mvp-2.jpg" className="rounded-lg" alt="MVP view 2" />
            <Caption>the back view</Caption>
            <ZoomImage src="/assets/robort/mvp-b.jpg" className="rounded-lg" alt="MVP back view" />
            <Caption>the top view</Caption>
            <ZoomImage src="/assets/robort/mvp-t.jpg" className="rounded-lg" alt="MVP top view" />
          </div>

          <hr />

          {/* ═════════ HONEST + NEXT ═════════ */}
          <div className="space-y-6">
            <H2>what is real and what is not</H2>
            <Bullets
              items={[
                ["real", "the architecture, the compiler, the memory chain, the safety gates, and the maths of the region dynamics and the chemical equations."],
                ["modelled", "the brain regions, the 'hormones', the 'emotions', the 'mood' and the 'personality'. they are mechanisms that produce human like behaviour. they are not feelings, and vision says so himself if you ask."],
                ["hand tuned", "the decision weights in the thinking brain. the tuner exists, but it was only run on simulated days."],
                ["not fully tested yet", "the full brain running for long sessions on the real robot, recognition quality on lots of real faces, real camera and gpu speed, and the ai features against a real model."],
              ]}
            />
            <H2>what is next</H2>
            <p>
              the next big step is running the full brain on the real robot for long sessions, calibrating the face
              recognition threshold on many real people, and using those real sessions to tune the decision weights
              instead of guessing them. i also want to try a lighter face model (mediapipe or onnx) that runs faster,
              and add a proper calibration page for the servos, because right now calibration is only a config
              file in the firmware.
            </p>
            <p>
              i also wrote a plan, only a plan so far, for moving the natural layer onto the real robot. the parts
              with no motion risk can go first: topic memory, curiosity questions, back channel words, forgetting,
              milestones, jokes, dreams, routine, relevant recall, a voice per person and the story export. the parts
              that change how the body moves need care (micro movements, startle, asking for space, which must
              always keep stop and the emergency stop working), and some need hardware i do not have yet: sound
              direction needs a microphone array, a real battery needs a fuel gauge, pain needs a bump sensor.
              weather, hot and cold zones and the charger stay simulated. the rules are fixed: every motion request
              goes through the existing safety layer, stop and the emergency stop always win, and no behaviour may
              delay a stop.
            </p>
            <p>
              vision is still a hobby scale project, not a product, but it is the one i am most proud of. thanks
              for reading.
            </p>
            <p>arijit.</p>
          </div>

        </article>
      </div>
      </div>
    </div>
  );
};

export default Blog;