// Rest state -> after an event: how much each chemical, brain region and action chance changed (real code).
// Run: npx tsx scripts/rest-to-now.mts [praise|loud_noise|gift|scold|...]
(globalThis as any).localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
const { Limbic } = await import("../simulation/autonomous/src/limbic.ts");
const { Brain } = await import("../simulation/autonomous/src/brain.ts");
const { CHEMS } = await import("../simulation/autonomous/src/brainsim/chem.ts");
const kind = process.argv[2] ?? "praise"; const person = ["praise","gift","person_arrived","scold","poke"].includes(kind);
const L:any = new Limbic(); L.sim.step(3);
const regAvg=()=>{ const m=new Map<string,number[]>(); L.sim.nodes.forEach((n:any,i:number)=>{ const a=m.get(n.region.id)??[]; a.push(L.sim.activity[i]); m.set(n.region.id,a); }); const o:Record<string,number>={}; m.forEach((v,k)=>o[k]=v.reduce((p,q)=>p+q,0)/v.length); return o; };
const name:Record<string,string>={}; L.sim.nodes.forEach((n:any)=>name[n.region.id]=n.region.name.replace(/\s*\(.*\)/,""));
const body:any={act:async()=>{},isBusy:()=>false,getPose:()=>({x:0,z:0,unit:1,headingDeg:0}),getWorld:()=>[]};
const ACTS=["wander","look_around","dance","rest","call_out","murmur","watch"];
function chances(){ const b:any=new Brain(body,{now:()=>1e6,getSenses:()=>({motion:0,brightness:.5,loudness:0,camera:false,mic:false,personPresent:person}),getChem:()=>L.state(),human:false});
  b.curiosity=.5;b.social=.4;b.boredom=.4;b.valence=.2;b.arousal=.4;b.fatigue=.1;b.recent=[];b.goals=[];if(person)b.presentSecs=()=>10;
  const sc=ACTS.map(a=>({a,u:b.score(a)})).filter(x=>Number.isFinite(x.u)); const mx=Math.max(...sc.map(x=>x.u)); const gap=[...sc].sort((x,y)=>y.u-x.u); const g=gap[0].u-gap[1].u; const T=Math.max(.06,Math.min(.32,b.exploreTemp*(g<.25?1.15:.85)));
  const w=sc.map(x=>Math.exp((x.u-mx)/T)),tot=w.reduce((p,q)=>p+q,0); return sc.map((x,i)=>({...x,p:100*w[i]/tot})); }
const r0=regAvg(), nm0={...L.state().nm}, em0=L.state(), ch0=chances();
L.feel(kind); const peakNm={...nm0}, peakReg={...r0}; let t=0;
while(t<6){ L.step(0.05); t+=0.05; const nm=L.state().nm; for(const c of CHEMS) if(Math.abs(nm[c.id]-nm0[c.id])>Math.abs(peakNm[c.id]-nm0[c.id])) peakNm[c.id]=nm[c.id]; const r=regAvg(); for(const k in r) if(r[k]>peakReg[k]) peakReg[k]=r[k]; }
const em1=L.state(), ch1=chances();
const f=(x:number)=>x.toFixed(2), d=(x:number)=>(x>=0?"+":"")+x.toFixed(2);
console.log(`EVENT: ${kind}${person?" (person present)":" (alone)"}  - every number below comes from the real model; "now" = highest value within 6 seconds\n`);
console.log("TABLE 1 - chemicals\n| Chemical | Resting | Now (peak) | Change | Change in % |\n|---|---|---|---|---|");
for(const c of CHEMS){ const a=nm0[c.id],b=peakNm[c.id]; console.log(`| ${c.label} | ${f(a)} | ${f(b)} | ${d(b-a)} | ${(100*(b-a)/a).toFixed(0)} % |`); }
console.log("\nTABLE 2 - the 10 brain regions that rose most (activity 0 to 1)\n| Region | Resting | Now (peak) | Change |\n|---|---|---|---|");
Object.keys(r0).map(k=>({k,dd:peakReg[k]-r0[k]})).sort((a,b)=>b.dd-a.dd).slice(0,10).forEach(x=>console.log(`| ${name[x.k]} | ${f(r0[x.k])} | ${f(peakReg[x.k])} | ${d(x.dd)} |`));
console.log(`\nTABLE 3 - what he feels and wants to do (at rest -> after 6 s)\n| | Resting | Now |\n|---|---|---|\n| Emotion label | ${em0.emotion} | ${em1.emotion} |\n| Gut instinct | ${em0.instinct} (${f(em0.instinctConfidence)}) | ${em1.instinct} (${f(em1.instinctConfidence)}) |\n| Slow mood (-1 to 1) | ${f(em0.moodValence)} | ${f(em1.moodValence)} |`);
console.log("\nTABLE 4 - action score and chance (same curiosity/social/boredom each time)\n| Action | Score at rest | Score now | Change | Chance at rest | Chance now |\n|---|---|---|---|---|---|");
for(const a of ACTS){ const x=ch0.find(y=>y.a===a), y=ch1.find(z=>z.a===a); if(!x||!y) continue; console.log(`| ${a} | ${f(x.u)} | ${f(y.u)} | ${d(y.u-x.u)} | ${x.p.toFixed(1)} % | ${y.p.toFixed(1)} % |`); }
