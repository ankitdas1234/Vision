import { useState, useEffect, useCallback } from "react";

const NAV = [
  { id: "overview",      label: "Overview",         group: "Introduction" },
  { id: "how-it-works",  label: "How It Works",     group: "Introduction" },
  { id: "architecture",  label: "Architecture",     group: "Introduction" },
  { id: "tech-stack",    label: "Tech Stack",       group: "Reference" },
  { id: "api",           label: "API Endpoints",    group: "Reference" },
  { id: "vision-script", label: "Vision Script",    group: "Reference" },
  { id: "memory",        label: "Memory & Learning",group: "Reference" },
  { id: "database",      label: "Database",         group: "Reference" },
  { id: "setup",         label: "Local Setup",      group: "Reference" },
];

function tokenizeLine(line, lang) {
  if (lang === "visionscript") return tokenizeVisionScript(line);
  if (lang === "yaml") return tokenizeYaml(line);
  if (lang === "json") return tokenizeJson(line);
  return tokenizeShell(line);
}

function tokenizeVisionScript(line) {
  const tokens = [];
  let rest = line;

  const cm = rest.match(/^(\s*)(#.*)$/);
  if (cm) {
    if (cm[1]) tokens.push({ type: "plain", text: cm[1] });
    tokens.push({ type: "comment", text: cm[2] });
    return tokens;
  }

  while (rest.length > 0) {
    const str = rest.match(/^("(?:[^"\\]|\\.)*")/);
    if (str) { tokens.push({ type: "string", text: str[1] }); rest = rest.slice(str[1].length); continue; }
    const variable = rest.match(/^(\$[a-zA-Z_][\w]*)/);
    if (variable) { tokens.push({ type: "value", text: variable[1] }); rest = rest.slice(variable[1].length); continue; }
    const num = rest.match(/^(\d[\d.]*)/);
    if (num) { tokens.push({ type: "number", text: num[1] }); rest = rest.slice(num[1].length); continue; }
    const keyword = rest.match(/^([A-Z][A-Z0-9_]*)/);
    if (keyword) { tokens.push({ type: "keyword", text: keyword[1] }); rest = rest.slice(keyword[1].length); continue; }
    const op = rest.match(/^([><=+\-*/])/);
    if (op) { tokens.push({ type: "operator", text: op[1] }); rest = rest.slice(1); continue; }
    const word = rest.match(/^(\S+)/);
    if (word) { tokens.push({ type: "plain", text: word[1] }); rest = rest.slice(word[1].length); continue; }
    tokens.push({ type: "plain", text: rest[0] }); rest = rest.slice(1);
  }
  return tokens;
}

function tokenizeYaml(line) {
  const tokens = [];
  const cm = line.match(/^(\s*)(#.*)$/);
  if (cm) {
    if (cm[1]) tokens.push({ type: "plain", text: cm[1] });
    tokens.push({ type: "comment", text: cm[2] });
    return tokens;
  }
  const kvm = line.match(/^(\s*)([^:]+?)(\s*:\s*)(.*)$/);
  if (kvm) {
    if (kvm[1]) tokens.push({ type: "plain", text: kvm[1] });
    tokens.push({ type: "attr", text: kvm[2] });
    tokens.push({ type: "plain", text: kvm[3] });
    const val = kvm[4];
    if (val.startsWith('"') || val.startsWith("'")) tokens.push({ type: "string", text: val });
    else if (/^(true|false|null)$/.test(val)) tokens.push({ type: "keyword", text: val });
    else if (/^\d/.test(val)) tokens.push({ type: "number", text: val });
    else tokens.push({ type: "value", text: val });
    return tokens;
  }
  return [{ type: "plain", text: line }];
}

function tokenizeJson(line) {
  const tokens = [];
  let rest = line;
  while (rest.length > 0) {
    const key = rest.match(/^(\s*)("[^"]*")(\s*:\s*)/);
    if (key) {
      if (key[1]) tokens.push({ type: "plain", text: key[1] });
      tokens.push({ type: "attr", text: key[2] });
      tokens.push({ type: "plain", text: key[3] });
      rest = rest.slice(key[0].length);
      continue;
    }
    const str = rest.match(/^("(?:[^"\\]|\\.)*")/);
    if (str) { tokens.push({ type: "string", text: str[1] }); rest = rest.slice(str[1].length); continue; }
    const kw = rest.match(/^(true|false|null)\b/);
    if (kw) { tokens.push({ type: "keyword", text: kw[1] }); rest = rest.slice(kw[1].length); continue; }
    const num = rest.match(/^(-?\d[\d.]*)/);
    if (num) { tokens.push({ type: "number", text: num[1] }); rest = rest.slice(num[1].length); continue; }
    const op = rest.match(/^([{}\[\],:])/);
    if (op) { tokens.push({ type: "operator", text: op[1] }); rest = rest.slice(1); continue; }
    tokens.push({ type: "plain", text: rest[0] }); rest = rest.slice(1);
  }
  return tokens;
}

function tokenizeShell(line) {
  const tokens = [];
  let rest = line;

  if (/^\s*#/.test(rest)) {
    const indent = rest.match(/^(\s*)/)?.[1] ?? "";
    tokens.push({ type: "plain", text: indent });
    tokens.push({ type: "comment", text: rest.slice(indent.length) });
    return tokens;
  }

  const prompt = rest.match(/^([$>]\s+)/);
  if (prompt) {
    tokens.push({ type: "operator", text: prompt[1] });
    rest = rest.slice(prompt[1].length);
  }

  while (rest.length > 0) {
    const str = rest.match(/^("(?:[^"\\]|\\.)*"|'[^']*')/);
    if (str) { tokens.push({ type: "string", text: str[1] }); rest = rest.slice(str[1].length); continue; }
    const flag = rest.match(/^(--?[a-zA-Z][\w-]*)/);
    if (flag) { tokens.push({ type: "flag", text: flag[1] }); rest = rest.slice(flag[1].length); continue; }
    const num = rest.match(/^(\d[\d.]*)/);
    if (num) { tokens.push({ type: "number", text: num[1] }); rest = rest.slice(num[1].length); continue; }
    const kw = rest.match(/^(npm|npx|node|cd|cp|mv|rm|mkdir|curl|git|pio|docker|export|source)\b/);
    if (kw) { tokens.push({ type: "keyword", text: kw[1] }); rest = rest.slice(kw[1].length); continue; }
    const path = rest.match(/^([./~][\w./~-]+)/);
    if (path) { tokens.push({ type: "path", text: path[1] }); rest = rest.slice(path[1].length); continue; }
    const op = rest.match(/^([|&\\=<>])/);
    if (op) { tokens.push({ type: "operator", text: op[1] }); rest = rest.slice(1); continue; }
    const word = rest.match(/^(\S+)/);
    if (word) { tokens.push({ type: "plain", text: word[1] }); rest = rest.slice(word[1].length); continue; }
    tokens.push({ type: "plain", text: rest[0] }); rest = rest.slice(1);
  }
  return tokens;
}

const TOKEN_COLORS = {
  keyword:  "text-[#ff79c6]",
  string:   "text-[#f1fa8c]",
  comment:  "text-[#6272a4]",
  number:   "text-[#bd93f9]",
  operator: "text-[#ff79c6]",
  attr:     "text-[#50fa7b]",
  value:    "text-[#8be9fd]",
  flag:     "text-[#8be9fd]",
  plain:    "text-[#f8f8f2]",
  path:     "text-[#f1fa8c]",
};

function getLangDisplay(lang) {
  if (lang === "visionscript") return "VISION SCRIPT";
  if (lang === "yaml") return "YAML";
  if (lang === "json") return "JSON";
  return "SHELL";
}

/* ── Code Block ─────────────────────────────────────── */

const Block = ({ children, label, lang = "shell" }) => {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, "");
  const lines = code.split("\n");
  const langDisplay = getLangDisplay(lang);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="my-4 rounded-[10px] overflow-hidden border border-[#313244] bg-[#1e1e2e]">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#181825] border-b border-[#313244]">
        <span className="text-[11px] tracking-[0.1em] text-[#6272a4] font-medium font-mono">
          {label || langDisplay}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tracking-[0.12em] text-[#6272a4] uppercase font-mono">
            {langDisplay}
          </span>
          <button
            onClick={handleCopy}
            title="Copy"
            className={`border border-[#313244] rounded-[5px] px-2 py-0.5 cursor-pointer text-[10px] font-mono tracking-[0.05em] transition-all duration-150 flex items-center gap-1 ${
              copied
                ? "bg-[#313244] text-[#50fa7b]"
                : "bg-transparent text-[#6272a4]"
            }`}
          >
            {copied ? (
              <>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="#50fa7b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <rect x="4" y="1" width="7" height="8" rx="1.5" stroke="#6272a4" strokeWidth="1.2" />
                  <rect x="1" y="3" width="7" height="8" rx="1.5" stroke="#6272a4" strokeWidth="1.2" fill="#181825" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto py-3.5">
        <table className="border-collapse w-full table-fixed">
          <tbody>
            {lines.map((line, i) => {
              const tokens = tokenizeLine(line, lang);
              return (
                <tr key={i} className="leading-[1.75]">
                  <td className="w-[42px] text-right pr-4 pl-3.5 select-none text-[#44475a] text-xs align-top tabular-nums font-mono">
                    {i + 1}
                  </td>
                  <td className="pr-5 text-[12.5px] whitespace-pre align-top font-mono">
                    {tokens.map((tok, j) => (
                      <span key={j} className={TOKEN_COLORS[tok.type]}>
                        {tok.text}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ── Primitives ─────────────────────────────────────── */

const H1 = ({ children }) => (
  <h1 className="font-serif text-4xl font-normal tracking-tight text-[#0d0d0d] mb-2 leading-[1.15]">
    {children}
  </h1>
);

const H2 = ({ children }) => (
  <h2 className="font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-[#888] mt-10 mb-3.5 border-t border-[#f0f0f0] pt-4">
    {children}
  </h2>
);

const P = ({ children, className = "" }) => (
  <p className={`text-[14.5px] leading-[1.8] text-[#555] mb-4 font-sans ${className}`}>
    {children}
  </p>
);

const Code = ({ children }) => (
  <code className="font-mono text-xs bg-[#f4f4f2] px-1.5 py-0.5 rounded text-[#333]">
    {children}
  </code>
);

const Tag = ({ color = "bg-[#f4f4f2]", text = "text-[#666]", children }) => (
  <span className={`inline-block text-[11px] font-medium font-mono px-2 py-0.5 rounded-full ${color} ${text} mr-1.5 mt-1`}>
    {children}
  </span>
);

const Divider = () => <hr className="border-none border-t border-[#f0f0f0] my-8" />;

const Card = ({ title, desc, tag, tagColor = "bg-[#f4f4f2]", tagText = "text-[#666]" }) => (
  <div className="border border-[#ebebeb] rounded-[10px] px-[18px] py-4 mb-2.5 bg-white">
    <div className="flex items-center justify-between mb-1.5">
      <span className="font-sans text-sm font-semibold text-[#0d0d0d]">{title}</span>
      {tag && <Tag color={tagColor} text={tagText}>{tag}</Tag>}
    </div>
    <p className="text-[13.5px] text-[#777] leading-[1.65] m-0 font-sans">{desc}</p>
  </div>
);

const Step = ({ num, title, body, code, codeLabel, codeLang }) => (
  <div className="mb-8">
    <div className="flex items-baseline gap-3 mb-2">
      <span className="font-mono text-[11px] text-[#ccc] tracking-[0.05em]">{num}</span>
      <span className="font-serif text-xl text-[#0d0d0d]">{title}</span>
    </div>
    <P>{body}</P>
    {code && <Block label={codeLabel} lang={codeLang}>{code}</Block>}
  </div>
);

/* ── Pages ──────────────────────────────────────────── */

const OverviewPage = () => (
  <div>
    <H1>Vision</H1>
    <p className="text-[15px] text-[#999] mb-8 font-sans leading-relaxed">
      An intelligent physical robot — perceives, decides, remembers, and acts on its own.
    </p>
    <P>
      Vision is an ESP32-CAM driving a PCA9685 and 4 servos, backed by a TypeScript
      brain, a PostgreSQL/Neon database, OpenRouter for AI fallback, Google Drive
      for media storage, and a real-time React dashboard. It isn't a chatbot with
      a robot costume — the brain perceives on its own, makes rule-based safety
      decisions on its own, and only reaches for an LLM for a narrow set of things
      (exploration goals when genuinely alone, and AI fallback when its own memory
      comes up empty).
    </P>
    <P>
      <Code>MOCK_MODE=true</Code> (the default) runs the entire stack — server,
      dashboard, brain — with no physical hardware attached, clearly labeled as
      such in the UI, so the whole system can be developed against before any
      hardware is connected.
    </P>

    <Divider />
    <H2>What Vision actually does</H2>

    <Card title="Sees and recognizes" tag="Perception" tagColor="bg-[#e8f5e9]" tagText="text-[#2e7d32]"
      desc="Real face/object detection, pgvector nearest-neighbor face matching with multi-frame voting before an identity is ever confirmed — no single frame is trusted alone." />
    <Card title="Remembers, with provenance" tag="Memory" tagColor="bg-[#e8f5e9]" tagText="text-[#2e7d32]"
      desc="Four memory layers in strict priority order — static rules, verified learned facts, similarity-based conceptual recall, then AI fallback as a last resort." />
    <Card title="Asks instead of assuming" tag="Behavior" tagColor="bg-[#e3f2fd]" tagText="text-[#1565c0]"
      desc="When Vision isn't sure about a learned fact, it asks the admin out loud and listens for the answer — there's no dashboard button for this, on purpose." />
    <Card title="A real, bounded scripting language" tag="Compiler" tagColor="bg-[#e3f2fd]" tagText="text-[#1565c0]"
      desc="Vision Script compiles to a flat, fully-inspectable instruction list — loops unrolled, branches resolved, safety-bounded — never arbitrary code execution." />
    <Card title="One identity, however you meet it" tag="Identity" tagColor="bg-[#fce4ec]" tagText="text-[#880e4f]"
      desc="A dashboard account and a face Vision recognizes in person resolve to the same underlying person — not two disconnected records." />

    <Divider />
    <H2>The four subsystems</H2>
    <div className="font-mono text-[12.5px] border border-[#ebebeb] rounded-[10px] overflow-hidden">
      {[
        ["Perception", "Camera → detection → recognition", "server/src/perception/"],
        ["Brain",      "Per-cycle decisions + reactions",  "server/src/brain/"],
        ["Memory",     "Static → dynamic → conceptual → AI","server/src/memory/"],
        ["Commands",   "Single validated dispatch point",  "server/src/commands/"],
      ].map(([name, desc, path], i) => (
        <div
          key={name}
          className={`grid grid-cols-[1fr_2fr_1.4fr] gap-0 px-4 py-2.5 items-center ${
            i % 2 === 0 ? "bg-white" : "bg-[#fafafa]"
          } ${i < 3 ? "border-b border-[#f0f0f0]" : ""}`}
        >
          <span className="text-[#0d0d0d] font-medium">{name}</span>
          <span className="text-[#888]">{desc}</span>
          <span className="text-[#aaa] text-[11.5px]">{path}</span>
        </div>
      ))}
    </div>
  </div>
);

const HowItWorksPage = () => (
  <div>
    <H1>How It Works</H1>
    <p className="text-[15px] text-[#999] mb-8 font-sans">
      One brain cycle, from camera frame to a decision.
    </p>

    <Step num="01" title="A frame arrives"
      body="The ESP32-CAM ships a frame over HTTPS/WSS. It's checked against a whole-frame quality gate (blur, darkness, blown-out exposure, blank frame) before anything ML-heavy runs on it." />

    <Step num="02" title="Detection, cheapest first"
      body="A perceptual hash catches 'nothing changed since last frame' before real detection runs. Face/object detection only runs on frames that survive the earlier gates."
      codeLabel="server/src/perception/"
      codeLang="shell"
      code={`faceDetection.ts        # TinyFaceDetector CNN + 68 landmarks
faceQuality.ts           # size / pose / occlusion / blur scoring
faceEmbedding.ts         # 128-d (dlib) or 512-d (ArcFace) vector
personRecognition.ts     # pgvector nearest-neighbor + multi-frame voting`} />

    <Step num="03" title="Recognition needs 3 agreeing frames"
      body="A single close match is never enough — an identity only becomes CONFIRMED after 3 independent frames vote for the same person (server/src/perception/multiFrameIdentity.ts). Anything less stays PROVISIONAL, and nothing safety-relevant treats provisional as good enough." />

    <Step num="04" title="The brain decides"
      body="BrainOrchestrator.ts turns the recognized person/object into a structured observation, checks trust tier and mood, and matches reaction rules. Most of this is deterministic and rule-based — safety-critical decisions are never left to an LLM's judgment." />

    <Step num="05" title="Memory is checked in strict order"
      body="Static rules first (never silently overwritten), then verified dynamic facts, then conceptual similarity matching, and only then OpenRouter as a last resort — whose output is treated as a candidate, not automatically verified truth." />

    <Step num="06" title="A command is dispatched — or nothing is"
      body="Every hardware-affecting action passes through one place: CommandRegistry — schema validation, authorization, safety checks, then execution. STOP / CENTER / SAFE and Emergency Stop always work, in either AUTONOMOUS or MANUAL control mode." />
  </div>
);

const ArchitecturePage = () => (
  <div>
    <H1>Architecture</H1>
    <p className="text-[15px] text-[#999] mb-8 font-sans">
      Every layer of the Vision stack, and where it actually lives.
    </p>

    <H2>System diagram</H2>
  {/* Block */}

    <H2>Hardware</H2>
    {[
      { name: "1× ESP32-CAM", desc: "Camera + WiFi, drives the whole robot over HTTPS/WSS." },
      { name: "1× PCA9685", desc: "16-channel PWM driver for the servos." },
      { name: "4× servos", desc: "CH0/CH2 leg rotation (continuous), CH1/CH3 leg joint (positional). No neck servo — removed; the camera and HC-SR04 are fixed forward, and \"looking\" is done by turning the whole body." },
      { name: "1× HC-SR04", desc: "Ultrasonic sensor for obstacle detection and movement safety. Its 5V Echo pin must go through a level shifter — never direct to a GPIO." },
      { name: "Mic + speaker (I2S)", desc: "Audio in/out for STT and TTS." },
    ].map((c) => <Card key={c.name} title={c.name} desc={c.desc} />)}

    <H2>Folder responsibility</H2>
    <div className="font-mono text-xs">
      {[
        ["server/",              "TypeScript backend — API, brain, memory, commands, compiler"],
        ["server/src/packages/", "Shared types, command catalog, wire protocol"],
        ["server/tests/",        "The test suite"],
        ["dashboard/",           "React + Tailwind real-time dashboard"],
        ["firmware/esp32-cam/",  "ESP32-CAM firmware (PlatformIO, C++)"],
        ["database/",            "SQL schema + migrations"],
        ["docs/",                "Architecture and subsystem documentation"],
        ["scripts/",             "setup / seed / migrate / create-admin helpers"],
      ].map(([folder, desc], i, arr) => (
        <div
          key={folder}
          className={`grid grid-cols-[1.3fr_2.4fr] px-3.5 py-2.5 ${
            i % 2 === 0 ? "bg-white" : "bg-[#fafafa]"
          } border border-[#ebebeb] ${
            i === 0 ? "rounded-t-[10px]" : ""
          } ${i === arr.length - 1 ? "rounded-b-[10px]" : ""} ${
            i > 0 ? "border-t-0" : ""
          }`}
        >
          <span className="text-[#0d0d0d] font-medium">{folder}</span>
          <span className="text-[#777]">{desc}</span>
        </div>
      ))}
    </div>
    <P>
      <Code>server/</Code> and <Code>dashboard/</Code> are two independent npm
      projects, each with its own <Code>package.json</Code> — no monorepo
      tooling, no shared <Code>packages/*</Code>. Either one can be installed,
      built, tested, and deployed entirely on its own.
    </P>
  </div>
);

const TechStackPage = () => (
  <div>
    <H1>Tech Stack</H1>
    <p className="text-[15px] text-[#999] mb-8 font-sans">
      Everything Vision is actually built with.
    </p>

    {[
      {
        group: "Backend",
        items: [
          ["TypeScript + Express", "The server — API routes, the brain loop, memory, command dispatch."],
          ["Drizzle ORM", "Schema (server/src/database/schema.ts) and typed queries against Postgres."],
          ["Zod", "Request validation on every route that accepts a body."],
          ["Socket.IO", "Real-time push to the dashboard (telemetry, live camera, tracking)."],
          ["JWT + bcryptjs", "Session tokens and password hashing."],
        ],
      },
      {
        group: "Database",
        items: [
          ["PostgreSQL (Neon)", "The single source of truth — 50+ tables."],
          ["pgvector", "Stores face embeddings; nearest-neighbor search runs inside Postgres, not pulled into app memory."],
        ],
      },
      {
        group: "Perception & ML",
        items: [
          ["face-api (dlib ResNet-34)", "Default face embedding backend, 128-dimensional."],
          ["onnx-arcface", "Optional 512-dimensional backend — bring your own .onnx model."],
          ["CenterNet (COCO-80)", "Real object detection, with a heuristic/mock fallback."],
          ["OpenRouter", "AI fallback for memory, and real vision-LLM detection when configured."],
        ],
      },
      {
        group: "Audio",
        items: [
          ["EdgeTTS / OmniVoice / ElevenLabs", "Text-to-speech backends."],
          ["ElevenLabs / Groq (Whisper)", "Speech-to-text backends."],
        ],
      },
      {
        group: "Dashboard",
        items: [
          ["React + Tailwind", "The real-time dashboard UI."],
          ["Vite", "Dev server and build tool."],
        ],
      },
      {
        group: "Firmware & Infra",
        items: [
          ["PlatformIO (C++)", "ESP32-CAM firmware — servo/gait control, camera capture, I2S audio."],
          ["Google Drive", "Photo/audio media storage."],
          ["Render / Fly.io / Railway", "Server deployment target (also ships a Dockerfile)."],
        ],
      },
    ].map(({ group, items }) => (
      <div key={group}>
        <H2>{group}</H2>
        {items.map(([name, why]) => (
          <div key={name} className="flex gap-4 py-2.5 border-b border-[#f4f4f4]">
            <span className="font-mono text-[12.5px] text-[#0d0d0d] w-[220px] shrink-0 pt-0.5">
              {name}
            </span>
            <span className="text-[13.5px] text-[#666] leading-[1.65] font-sans">{why}</span>
          </div>
        ))}
      </div>
    ))}
  </div>
);

const ApiPage = () => (
  <div>
    <H1>API Endpoints</H1>
    <p className="text-[15px] text-[#999] mb-8 font-sans">
      A representative slice — the server has 27 route files. Every route beyond{" "}
      <Code>/api/auth/*</Code> requires an authenticated session; role checks
      (<Code>USER</Code> / <Code>TRUSTED</Code> / <Code>ADMIN</Code>) are enforced
      server-side.
    </p>

    {[
      { method: "POST", path: "/api/auth/register", desc: "Create an account. Accepts an optional webcam capture (imageBase64) that links the account to an existing recognized person, or creates a new one." },
      { method: "POST", path: "/api/auth/login", desc: "Email + password login; issues a session." },
      { method: "GET",  path: "/api/auth/me", desc: "The current session's user, including avatarUrl and personId." },
      { method: "GET",  path: "/api/people/:id", desc: "A recognized person's profile — firstMetPhotoUrl, mostRecentPhotoUrl, trust/relationship scores, category. ADMIN only." },
      { method: "GET",  path: "/api/people/:id/memories", desc: "Every learned fact about that person — source, confidence, verification status. Read-only; there is no verify/reject/correct route (see Memory & Learning)." },
      { method: "GET",  path: "/api/objects/:id", desc: "A recognized object's features, photos, and conceptual-memory trail." },
      { method: "POST", path: "/api/users/me/avatar", desc: "Upload/replace this account's own dashboard profile picture." },
      { method: "POST", path: "/api/users/me/link-face", desc: "Link an already-existing account to a recognized person, for someone who skipped the webcam step at signup." },
      { method: "POST", path: "/api/scripts/compile", desc: "Compile Vision Script source to a flat instruction list. Never touches hardware." },
      { method: "POST", path: "/api/scripts/execute", desc: "Execute a compiled script. Requires Manual control mode, same as any other movement command." },
      { method: "POST", path: "/api/commands/emergency-stop", desc: "Immediate stop. Works in either control mode." },
      { method: "GET",  path: "/api/system/health", desc: "Unauthenticated health check (what Render's health check hits)." },
    ].map(({ method, path, desc }) => (
      <div key={path} className="mb-3.5 border border-[#ebebeb] rounded-[10px] overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[#fafafa]">
          <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-[5px] ${
            method === "GET"
              ? "bg-[#e8f5e9] text-[#2e7d32]"
              : "bg-[#e3f2fd] text-[#1565c0]"
          }`}>
            {method}
          </span>
          <span className="font-mono text-[13px] text-[#0d0d0d]">{path}</span>
        </div>
        <div className="px-4 py-2.5">
          <p className="text-[13px] text-[#777] leading-relaxed m-0 font-sans">{desc}</p>
        </div>
      </div>
    ))}

    <H2>Example response — GET /api/people/:id</H2>
    <Block label="response" lang="json">{`{
  "id": "b2f1...",
  "name": "Ram",
  "category": "TRUSTED",
  "trustScore": 82,
  "visitCount": 14,
  "firstMetPhotoUrl": "https://drive.google.com/...",
  "mostRecentPhotoUrl": "https://drive.google.com/..."
}`}</Block>
  </div>
);

const VisionScriptPage = () => (
  <div>
    <H1>Vision Script</H1>
    <p className="text-[15px] text-[#999] mb-8 font-sans">
      A small, safe, line-oriented scripting language — never arbitrary JavaScript.
    </p>
    <P>
      Everything — loops unrolled, expressions folded, branches resolved — happens
      at compile time. The executor just runs a flat, fully-inspectable
      instruction list, exactly like any other command dispatch.
    </P>

    <H2>Example script</H2>
    <Block label="example.vscript" lang="visionscript">{`EYE_CENTER
WAIT 500
WALK_FORWARD 1000
WALK_STOP
AUDIO_SPEAK "Hello"
FIND_PERSON "Sam"
DANCE 20000

SET $angle 60
EYE_SET $angle

REPEAT 4 TIMES
  WALK_FORWARD 500
  TURN_LEFT 300
END

IF $angle > 90
  TURN_RIGHT 300
ELSE
  TURN_LEFT 300
END

RANDOM $look 30 150
EYE_SET $look`}</Block>

    <H2>Common commands</H2>
    <div className="font-mono text-[12.5px]">
      {[
        ["EYE_CENTER",                   "Centers the eye/head servos"],
        ["WALK_FORWARD <ms>",            "Walks forward for the given duration"],
        ["TURN_LEFT / TURN_RIGHT <ms>",  "Turns for the given duration"],
        ["DANCE <ms>",                   "Runs the dance routine"],
        ["FIND_PERSON \"<name>\"",       "Starts a search mission"],
        ["AUDIO_SPEAK \"<text>\"",       "Speaks the given text via TTS"],
        ["WAIT <ms>",                    "Sleeps"],
      ].map(([cmd, desc]) => (
        <div key={cmd} className="grid grid-cols-[1.6fr_2fr] py-2 border-b border-[#f4f4f4]">
          <span className="text-[#0d0d0d]">{cmd}</span>
          <span className="text-[#777] font-sans text-[13px]">{desc}</span>
        </div>
      ))}
    </div>

    <H2>Variables, arithmetic, randomness</H2>
    <P>
      <Code>SET $name value</Code> declares a variable — a literal, another
      variable, or a simple arithmetic expression (<Code>+ - * /</Code>,
      evaluated strictly left to right with no operator precedence). Using a
      variable before its <Code>SET</Code>, or a type mismatch, is a compile
      error — never a runtime crash, because there's no runtime evaluation
      left by the time this reaches the robot.
    </P>
    <P>
      <Code>RANDOM $name min max</Code> assigns a real random integer,
      resolved once at compile time — compiling the same script twice can
      produce different values, but a single compiled program is exactly as
      fixed as any other <Code>SET</Code>.
    </P>

    <H2>Compile vs. execute</H2>
    <P>
      The dashboard's Compiler page has a live terminal for running Vision
      Script one line at a time. <b>Compiling</b> is always allowed — no
      hardware is touched. <b>Executing</b> a compiled script requires Manual
      control mode, exactly like any other movement command, and there's a
      kill switch (ADMIN only) to disable the whole feature.
    </P>
  </div>
);

const MemoryPage = () => (
  <div>
    <H1>Memory &amp; Learning</H1>
    <p className="text-[15px] text-[#999] mb-8 font-sans">
      Four layers, checked in strict priority order — never a single flat lookup.
    </p>

    <H2>The priority chain</H2>
    <Block label="server/src/memory/MemoryManager.ts">{`1. Static      — admin-controlled rules, highest priority, never silently overwritten
2. Dynamic     — learned facts, only VERIFIED records count as "sufficient"
3. Conceptual  — multi-factor similarity match against known concepts
4. OpenRouter  — last resort; output is a candidate, not automatically verified truth`}</Block>

    <H2>Dynamic memory — verification status</H2>
    <P>
      Every learned fact carries a <Code>source</Code>, a <Code>confidence</Code>,
      and a <Code>verificationStatus</Code>: <Code>VERIFIED</Code>,{" "}
      <Code>UNVERIFIED</Code>, <Code>REQUIRES_REVIEW</Code>, or{" "}
      <Code>REJECTED</Code>. A fact entered with source <Code>ADMIN</Code> is
      auto-verified; anything else starts unverified or flagged for review
      based on its confidence.
    </P>
    <P>
      Getting a fact corrected doesn't happen from a dashboard button — there
      deliberately isn't one. Vision asks the admin about a flagged fact out
      loud (throttled to at most once every 10 minutes, and only when it
      recognizes the admin specifically), listens for a confirm / reject /
      spoken correction, and persists whichever one it hears.
    </P>
    <Block label="example exchange">{`Vision: "Quick thing — I picked up something about Ram:
         prefers quiet music. Did I get that right?"

Admin:  "No, actually he likes it loud."

Vision: "Got it, I'll remember it that way instead."`}</Block>

    <H2>Conceptual memory — similarity, not identity</H2>
    <P>
      Used when a query has no exact match in static or verified dynamic
      memory. Rather than requiring an exact identity match, it compares an
      observation against known concepts across multiple weighted dimensions:
    </P>
    <Block label="dimensions">{`shape · size · colour · dimensions/aspect ratio · texture ·
visual features · semantic features · context`}</Block>
    <P>
      <b>Example:</b> Vision observes a small yellow/green sphere on day 1 and
      stores it as concept <Code>BALL</Code>. On day 2 it observes a larger,
      differently-colored sphere — an exact match fails, but conceptual
      comparison scores high on shape/category, lower on size/colour. Result:
      <i>"This is also a type of ball, but it is different from the smaller
      ball I saw before."</i> — a genuine multi-dimension comparison, not a
      hallucinated guess. Below a sufficiency threshold (0.65 by default), the
      chain falls through to OpenRouter instead.
    </P>
  </div>
);

const DatabasePage = () => (
  <div>
    <H1>Database</H1>
    <p className="text-[15px] text-[#999] mb-8 font-sans">
      One schema file, no migration chain required to get started.
    </p>

    <H2>Fastest path — fresh database</H2>
    <Block label="terminal">{`# 1. Create a free project at neon.tech
# 2. Paste database/schema.sql into Neon's SQL Editor and run it
#    — every table, in one shot, no migration chain needed
# 3. Copy the connection string into DATABASE_URL in .env`}</Block>

    <H2>Updating an existing database</H2>
    <P>
      <Code>database/migrations/</Code> holds one file per schema change since{" "}
      <Code>0000_init.sql</Code>, each an idempotent{" "}
      <Code>ADD COLUMN IF NOT EXISTS</Code> / <Code>CREATE TABLE IF NOT
      EXISTS</Code> statement — for a database that predates a given change,
      not something you need to run if you're starting fresh from{" "}
      <Code>schema.sql</Code>.
    </P>

    <H2>What's in there</H2>
    <div className="font-mono text-[12.5px]">
      {[
        ["users",                  "Dashboard accounts — role, status, avatar, optional link to people"],
        ["people",                 "Every person Vision has recognized — trust score, category, visit count"],
        ["person_faces",           "Registered reference faces + pgvector embeddings"],
        ["person_observations",    "Every individual sighting, with its photo"],
        ["dynamic_memories",       "Learned facts — source, confidence, verification status"],
        ["conceptual_memories",    "Similarity-based concept matches, with per-match confidence"],
        ["objects",                "Recognized objects — category, description, observation count"],
        ["object_features",        "Shape/colour/size/texture per object"],
        ["sessions / audit_logs",  "Auth sessions and the audit trail"],
      ].map(([table, desc], i, arr) => (
        <div
          key={table}
          className={`grid grid-cols-[1.3fr_2.4fr] px-3.5 py-2.5 ${
            i % 2 === 0 ? "bg-white" : "bg-[#fafafa]"
          } border border-[#ebebeb] ${
            i === 0 ? "rounded-t-[10px]" : ""
          } ${i === arr.length - 1 ? "rounded-b-[10px]" : ""} ${
            i > 0 ? "border-t-0" : ""
          }`}
        >
          <span className="text-[#0d0d0d] font-medium">{table}</span>
          <span className="text-[#777]">{desc}</span>
        </div>
      ))}
    </div>
    <P className="mt-4">
      pgvector backs <Code>person_faces</Code>' embedding column with an HNSW
      index — nearest-neighbor face search runs as a real vector query inside
      Postgres, not pulled into the app and compared in JavaScript.
    </P>
  </div>
);

const SetupPage = () => (
  <div>
    <H1>Local Setup</H1>
    <p className="text-[15px] text-[#999] mb-8 font-sans">
      Server and dashboard running locally, no hardware required.
    </p>

    <H2>Prerequisites</H2>
    {[
      ["Node.js",        "Runs both server/ and dashboard/"],
      ["A Neon account", "Free-tier Postgres — database/README.md"],
      ["Git",            "Clone the repo"],
    ].map(([name, why]) => (
      <div key={name} className="flex gap-4 py-2 border-b border-[#f4f4f4] font-sans text-[13.5px]">
        <span className="font-mono text-[12.5px] text-[#0d0d0d] w-40 shrink-0">{name}</span>
        <span className="text-[#777]">{why}</span>
      </div>
    ))}

    <H2>Install &amp; run</H2>
    <Block label="terminal">{`npm run setup        # installs server/ and dashboard/ deps + creates .env from .env.example

# database — see database/README.md
# create a Neon project, paste database/schema.sql into its SQL Editor,
# copy the connection string into DATABASE_URL in .env

npm run seed          # optional: 4 servos (no neck), default gait, static memory
npm run dev:server    # http://localhost:4000
npm run dev:dashboard # http://localhost:5173`}</Block>

    <H2>Register your account</H2>
    <P>
      Open <Code>http://localhost:5173</Code> — you'll land on the public Home
      page. Register at <Code>/register</Code> (name/email/password). It
      includes an optional webcam capture: if you've met Vision in person
      before, your account links to that existing identity instead of
      starting fresh. Declining the camera never blocks signup — it can be
      linked later from Settings.
    </P>
    <P>
      There's no built-in admin login — admin accounts are provisioned
      directly in Neon, one per real admin:
    </P>
    <Block label="terminal">{`node scripts/create-admin.js`}</Block>

    <H2>Running with mock hardware</H2>
    <P>
      <Code>MOCK_MODE=true</Code> (the default) runs the full stack with no
      physical hardware attached — the UI clearly labels MOCK MODE and never
      claims real hardware is connected.
    </P>

    <H2>Firmware (real hardware only)</H2>
    <Block label="terminal">{`cd firmware/esp32-cam
# edit src/config/network_config.h with your WiFi + server URL + robot secret
pio run -t upload`}</Block>

    <H2>Run the tests</H2>
    <Block label="terminal">{`npm test`}</Block>
  </div>
);

const PAGES = {
  overview:        OverviewPage,
  "how-it-works":  HowItWorksPage,
  architecture:    ArchitecturePage,
  "tech-stack":    TechStackPage,
  api:             ApiPage,
  "vision-script": VisionScriptPage,
  memory:          MemoryPage,
  database:        DatabasePage,
  setup:           SetupPage,
};


export default function Docs() {
  const [current, setCurrent] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    const onResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const PageComponent = PAGES[current];
  const groups = [...new Set(NAV.map((n) => n.group))];

  const go = (id) => {
    setCurrent(id);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  };

  return (
    <div className="bg-white cool">
      {/* Header */}
      <header
        className={`sticky top-0 z-40 border-b border-[#ebebeb] transition-colors duration-200 ${
          scrolled ? "bg-white/92 backdrop-blur-md" : "bg-white"
        }`}
      >
        <div className="max-w-[1080px] mx-auto px-6 h-[54px] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <a href="/">
              <img src="/images/Vision.png" alt="Vision Logo" className="h-[26px]" />
            </a>
            <span className="font-serif text-lg text-[#0d0d0d]">Vision</span>
            <span className="font-mono text-[10px] text-[#bbb] tracking-[0.08em] mt-0.5">
              docs
            </span>
          </div>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="bg-transparent border-none cursor-pointer text-[#888] p-1 md:hidden"
            aria-label="menu"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              {menuOpen ? (
                <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              ) : (
                <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </header>

      <div className="max-w-[1080px] mx-auto px-6 flex gap-0 relative">
        {/* Sidebar */}
        <aside
          className={`w-[210px] shrink-0 sticky top-[54px] h-[calc(100vh-54px)] overflow-y-auto pt-8 pr-6 border-r border-[#f0f0f0] ${
            isDesktop || menuOpen ? "block" : "hidden"
          } ${
            !isDesktop
              ? "fixed left-0 bg-white z-[39] w-full h-[calc(100vh-54px)] border-r-0"
              : ""
          }`}
        >
          {groups.map((group) => (
            <div key={group} className="mb-7">
              <p className="font-mono text-[10px] font-medium tracking-[0.12em] uppercase text-[#ccc] mb-2 pl-2.5">
                {group}
              </p>
              <ul className="list-none">
                {NAV.filter((n) => n.group === group).map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => go(item.id)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-md text-[13.5px] font-sans cursor-pointer border-none transition-all duration-100 ${
                        current === item.id
                          ? "bg-[#f4f4f2] text-[#0d0d0d] font-medium"
                          : "bg-transparent text-[#888] font-normal"
                      }`}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        {/* Main */}
        <main
          className={`flex-1 min-w-0 max-w-[660px] ${
            isDesktop ? "pt-12 pb-20 pl-12" : "pt-6 pb-20"
          }`}
        >
          <PageComponent />

          {/* Prev / Next */}
          <div className="flex justify-between mt-16 pt-7 border-t border-[#f0f0f0]">
            {(() => {
              const idx = NAV.findIndex((n) => n.id === current);
              const prev = NAV[idx - 1];
              const next = NAV[idx + 1];
              return (
                <>
                  {prev ? (
                    <button
                      onClick={() => go(prev.id)}
                      className="bg-transparent border-none cursor-pointer text-left"
                    >
                      <div className="font-mono text-[10px] text-[#bbb] uppercase tracking-[0.1em] mb-1">
                        Previous
                      </div>
                      <div className="font-sans text-[13.5px] text-[#888]">
                        ← {prev.label}
                      </div>
                    </button>
                  ) : (
                    <div />
                  )}
                  {next ? (
                    <button
                      onClick={() => go(next.id)}
                      className="bg-transparent border-none cursor-pointer text-right"
                    >
                      <div className="font-mono text-[10px] text-[#bbb] uppercase tracking-[0.1em] mb-1">
                        Next
                      </div>
                      <div className="font-sans text-[13.5px] text-[#888]">
                        {next.label} →
                      </div>
                    </button>
                  ) : (
                    <div />
                  )}
                </>
              );
            })()}
          </div>
        </main>
      </div>
    </div>
  );
}