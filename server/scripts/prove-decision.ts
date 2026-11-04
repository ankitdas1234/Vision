// Proof: runs the REAL Brain in 6 situations, compares its scores with an independent re-written formula, and counts 20000 real picks.
// Run:  npx tsx scripts/prove-decision.ts
import { Brain } from "../simulation/autonomous/src/brain.ts";
const REST = { dopamine:.1, serotonin:.4, noradrenaline:.1, adrenaline:.05, cortisol:.1, oxytocin:.1, endorphin:.1, acetylcholine:.15, gaba:.3, melatonin:.1 };
function mulberry(a:number){return()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
type S = { name:string; c:number;s:number;b:number;v:number;ar:number;fat:number; person:boolean; nm:Partial<typeof REST>; emotion:string; instinct:string; conf:number; presentSecs?:number };
const SC:S[] = [
 {name:"1. Alone, bored, curious, calm", c:.7,s:.3,b:.7,v:.2,ar:.4,fat:.1,person:false,nm:{},emotion:"CALM",instinct:"OBSERVE",conf:.5},
 {name:"2. Person arrives and praises him", c:.5,s:.4,b:.4,v:.5,ar:.6,fat:.1,person:true,nm:{dopamine:.5,oxytocin:.4},emotion:"HAPPY",instinct:"APPROACH",conf:.6,presentSecs:10},
 {name:"3. Sudden loud noise (frightened)", c:.4,s:.3,b:.2,v:-.3,ar:.9,fat:.1,person:false,nm:{cortisol:.6,adrenaline:.7,noradrenaline:.6},emotion:"FEARFUL",instinct:"FLEE",conf:.8},
 {name:"4. Very tired, late, nobody around", c:.2,s:.3,b:.3,v:0,ar:.2,fat:.9,person:false,nm:{melatonin:.7},emotion:"CALM",instinct:"OBSERVE",conf:.4},
 {name:"5. Lonely: no visitors for a long time", c:.3,s:.9,b:.6,v:-.25,ar:.3,fat:.2,person:false,nm:{serotonin:.3},emotion:"SAD",instinct:"WITHDRAW",conf:.5},
 {name:"6. Person present and he is sad", c:.3,s:.6,b:.3,v:-.3,ar:.3,fat:.2,person:true,nm:{dopamine:.05,cortisol:.3},emotion:"SAD",instinct:"WITHDRAW",conf:.6,presentSecs:30},
];
const ACTS=["wander","look_around","dance","rest","call_out","murmur","go_home","play","watch"];
let t=1_000_000;
const body:any={act:async()=>{},isBusy:()=>false,getPose:()=>({x:0,z:0,unit:1,headingDeg:0}),getWorld:()=>[]};
// independent re-implementation of the first parts, written from the formulas only
function mine(a:string,s:S){
  const nm={...REST,...s.nm}; const dop=nm.dopamine-.1,cor=nm.cortisol-.1,oxy=nm.oxytocin-.1,mel=nm.melatonin-.1,ach=nm.acetylcholine-.15;
  const company=s.person; let u=NaN;
  if(a==="wander")u=.7*s.c+.2*s.b-(company?.35:0);
  if(a==="look_around")u=.25+.3*s.c*(1-s.ar)+.1*s.b;
  if(a==="dance")u=.3*Math.max(0,s.v)+.7*s.b+.15*s.ar-.35+(company?.4*Math.max(0,s.v):0);   // playful trait 0.5 -> 0
  if(a==="rest")u=.1+.6*Math.max(0,s.ar-.5)+(s.v<-.2?.3:0);
  if(a==="watch")u=company?.9+.3*s.s+0-Math.min(.6,(s.presentSecs??0)/120):NaN;               // shyness 0.5 -> 0
  if(a==="call_out")u=company?NaN:1.1*Math.max(0,s.s-.45);
  if(!Number.isFinite(u))return {u:NaN,base:NaN};
  const base=u;
  if(a==="wander")u+=.6*dop-.6*cor; if(a==="dance")u+=.6*dop-.8*cor; if(a==="look_around")u+=.5*ach;
  if(a==="watch"||a==="call_out")u+=.6*oxy; if(a==="rest")u+=.8*mel+.7*cor;
  return {u,base};
}
(async()=>{
  const rows:string[]=[]; let maxdiff=0, checked=0;
  for(const s of SC){
    vi_seed(1);
    const b:any=new Brain(body,{now:()=>t,getSenses:()=>({motion:0,brightness:.5,loudness:0,camera:false,mic:false,personPresent:s.person}),
      getChem:()=>({emotion:s.emotion,intensity:.7,because:"",nm:{...REST,...s.nm},asleep:false,instinct:s.instinct,instinctConfidence:s.conf,moodValence:s.v,moodArousal:s.ar} as any),human:false});
    b.curiosity=s.c;b.social=s.s;b.boredom=s.b;b.valence=s.v;b.arousal=s.ar;b.fatigue=s.fat;
    if(s.presentSecs!==undefined){ b.presentSecs=()=>s.presentSecs; }
    b.recent=[]; b.goals=[];
    const out:any[]=[];
    for(const a of ACTS){
      b.partsOut={}; const u=b.score(a); const p={...b.partsOut}; b.partsOut=null;
      if(!Number.isFinite(u)){continue;}
      const m=mine(a,s); const parts=p;
      if(Number.isFinite(m.u)){ const real=(parts["base feelings"]??0)+(parts["hormones"]??0); const d=Math.abs(real-m.u); maxdiff=Math.max(maxdiff,d); checked++; if(d>1e-9) console.log("MISMATCH",s.name,a,real,m.u); }
      out.push({a,u,parts});
    }
    out.sort((x,y)=>y.u-x.u);
    const gap=out[0].u-out[1].u, temp=Math.max(.06,Math.min(.32,b.exploreTemp*(gap<.25?1.15:.85)));
    const w=out.map(x=>Math.exp((x.u-out[0].u)/temp)), tot=w.reduce((q,x)=>q+x,0);
    // real choose() 20000 times
    const cnt:Record<string,number>={}; const N=20000; const rnd=mulberry(42); const orig=Math.random; (Math as any).random=rnd;
    for(let i=0;i<N;i++){ b.intention=null; b.recent=[]; const pick=b.chooseInner(); cnt[pick]=(cnt[pick]??0)+1; }
    (Math as any).random=orig;
    console.log(`\n=== ${s.name}\n    state: curiosity ${s.c}, social need ${s.s}, boredom ${s.b}, mood ${s.v}, alertness ${s.ar}, tiredness ${s.fat}, person present: ${s.person}, emotional brain says: ${s.emotion} / ${s.instinct} (${s.conf}); temperature ${temp.toFixed(3)}`);
    out.forEach((x,i)=>{ const top=Object.entries(x.parts).filter(([k,v]:any)=>Math.abs(v)>.005).map(([k,v]:any)=>`${k} ${v>0?"+":""}${v.toFixed(2)}`).join(", ");
      console.log(`    ${x.a.padEnd(11)} score ${x.u.toFixed(2).padStart(5)} | formula chance ${(100*w[i]/tot).toFixed(1).padStart(5)}% | measured over ${N} real picks ${(100*(cnt[x.a]??0)/N).toFixed(1).padStart(5)}%  <- ${top}`); });
  }
  console.log(`\nChecked ${checked} (situation, action) pairs: my own re-written formula vs the real code, base feelings + hormones. Largest difference: ${maxdiff.toExponential(2)}`);
})();
function vi_seed(n:number){}
