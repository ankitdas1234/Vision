// Real emotional brain + real decision code: how much each chemical rises after each event, and how the action chances change.
// Run: npx tsx scripts/compare-events.mts
(globalThis as any).localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
const { Limbic } = await import("../simulation/autonomous/src/limbic.ts");
const { Brain } = await import("../simulation/autonomous/src/brain.ts");
const IDS=["dopamine","serotonin","noradrenaline","adrenaline","cortisol","oxytocin","endorphin","acetylcholine","gaba","melatonin"];
const EV=["praise","gift","person_arrived","lonely","ignored","scold","poke","loud_noise"];
const ACTS=["wander","look_around","dance","rest","call_out","murmur","play","watch"];
const body:any={act:async()=>{},isBusy:()=>false,getPose:()=>({x:0,z:0,unit:1,headingDeg:0}),getWorld:()=>[]};
function run(kind:string|null, T:number){
  const L:any=new Limbic(); L.sim.step(3);
  const base={...L.state().nm};
  if(kind) L.feel(kind); let peak:any={...base}, peakEm=""; let t=0;
  while(t<T){ L.step(0.05); t+=0.05; const nm=L.state().nm; for(const k of IDS) if(Math.abs(nm[k]-base[k])>Math.abs(peak[k]-base[k])) peak[k]=nm[k]; }
  return {base,peak,st:L.state(),L};
}
function actionChances(L:any, person:boolean){
  const b:any=new Brain(body,{now:()=>1e6,getSenses:()=>({motion:0,brightness:.5,loudness:0,camera:false,mic:false,personPresent:person}),getChem:()=>L.state(),human:false});
  b.curiosity=.5;b.social=.4;b.boredom=.4;b.valence=.2;b.arousal=.4;b.fatigue=.1;b.recent=[];b.goals=[];if(person)b.presentSecs=()=>10;
  const sc=ACTS.map(a=>({a,u:b.score(a)})).filter(x=>Number.isFinite(x.u)).sort((x,y)=>y.u-x.u);
  const gap=sc[0].u-sc[1].u,T=Math.max(.06,Math.min(.32,b.exploreTemp*(gap<.25?1.15:.85)));
  const w=sc.map(x=>Math.exp((x.u-sc[0].u)/T)),tot=w.reduce((q,x)=>q+x,0);
  return sc.map((x,i)=>({a:x.a,u:x.u,p:100*w[i]/tot}));
}
const rows:any[]=[]; const calm=run(null,6); const calmP=actionChances(calm.L,false);
console.log("Resting values:",IDS.map(k=>`${k} ${calm.base[k].toFixed(2)}`).join(", "));
console.log("\nTABLE A: highest value each chemical reached in the 6 seconds after the event (resting value in brackets; change in brackets after)");
console.log("| Event | "+IDS.join(" | ")+" | Emotion after 6 s | Instinct |"); console.log("|"+"---|".repeat(IDS.length+3));
const res:any={};
for(const e of EV){ const r=run(e,6); res[e]=r;
  console.log(`| ${e} | `+IDS.map(k=>{const d=r.peak[k]-r.base[k]; return Math.abs(d)<0.02?"–":`${r.peak[k].toFixed(2)} (${d>0?"+":""}${d.toFixed(2)})`}).join(" | ")+` | ${r.st.emotion} | ${r.st.instinct} (${r.st.instinctConfidence.toFixed(2)}) |`); }
console.log("\nTABLE B: chance (%) of each action 6 seconds after the event (same drives each time: curiosity 0.5, social need 0.4, boredom 0.4, tiredness 0.1; only the emotional brain's chemistry and instinct differ)");
console.log("| Event | "+ACTS.join(" | ")+" |"); console.log("|"+"---|".repeat(ACTS.length+1));
const row=(n:string,c:any[])=>console.log(`| ${n} | `+ACTS.map(a=>{const x=c.find(y=>y.a===a);return x?x.p.toFixed(1):"n/a"}).join(" | ")+" |");
row("nothing happened (baseline, alone)",calmP);
for(const e of EV){ const person=["praise","gift","person_arrived","scold","poke"].includes(e); row(e+(person?" (person present)":" (alone)"),actionChances(res[e].L,person)); }
