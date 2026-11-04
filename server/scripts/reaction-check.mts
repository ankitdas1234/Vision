// Full loop (real emotional brain + real decision code): 150 paired trials, with vs without a stimulus. Shows how his choices change after it.
// Run: npx tsx scripts/reaction-check.mts <loud_noise|scold|poke|...> [person]
(globalThis as any).localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
const KIND=process.argv[2]??"loud_noise" as any; const PERSON=process.argv[3]==="person";
const { Limbic } = await import("../simulation/autonomous/src/limbic.ts");
const { Brain } = await import("../simulation/autonomous/src/brain.ts");
function mulberry(a:number){return()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const body:any={act:async()=>{},isBusy:()=>false,getPose:()=>({x:0,z:0,unit:1,headingDeg:0}),getWorld:()=>[]};
async function trial(seed:number, noise:boolean){
  (Math as any).random=mulberry(seed); let t=1e6; const L:any=new Limbic(); L.sim.step(3);
  const b:any=new Brain(body,{now:()=>t,getSenses:()=>({motion:0,brightness:.5,loudness:0,camera:false,mic:false,personPresent:PERSON}),getChem:()=>L.state(),onFeel:(k:string,d?:string)=>L.feel(k,d),human:false});
  const out:any[]=[]; let last=b.lastDecisionInfo()?.at;
  for(let s=0;s<14;s++){ if(s===4&&noise) b.stimulus(KIND); for(let i=0;i<20;i++) L.step(0.05); t+=1000; b.tick(); await new Promise(r=>setImmediate(r));
    const d=b.lastDecisionInfo(); if(d&&d.at!==last){ last=d.at; out.push({s:s-4,a:d.action,em:L.state().emotion}); } }
  return out;
}
const N=150, win=(x:any)=>x.s>=0&&x.s<=8; const cnt=(arr:any[])=>{const c:any={};arr.forEach(x=>c[x.a]=(c[x.a]??0)+1);return c;};
const A:any[]=[],B:any[]=[]; let firstA:number[]=[],firstB:number[]=[],noDecA=0;
for(let i=0;i<N;i++){ const a=await trial(100+i,true), b=await trial(100+i,false); const wa=a.filter(win), wb=b.filter(win); A.push(...wa);B.push(...wb);
  if(wa.length) firstA.push(wa[0].s); else noDecA++; }
const share=(arr:any[],set:string[])=>(100*arr.filter(x=>set.includes(x.a)).length/Math.max(1,arr.length)).toFixed(1);
console.log(`${N} paired trials: same seed, with vs without a loud noise at second 0 (decisions in seconds 0 to 8 after the noise)`);
console.log(`decisions per trial: with noise ${(A.length/N).toFixed(2)}, without ${(B.length/N).toFixed(2)}; trials with no decision at all after the noise: ${noDecA}`);
console.log("action counts with noise   :",JSON.stringify(cnt(A)));
console.log("action counts without noise:",JSON.stringify(cnt(B)));
console.log(`share of decisions that are rest/look_around: with noise ${share(A,["rest","look_around"])} %, without ${share(B,["rest","look_around"])} %`);
console.log(`share that are dance/play/call_out/wander:   with noise ${share(A,["dance","play","call_out","wander"])} %, without ${share(B,["dance","play","call_out","wander"])} %`);
console.log(`decisions made while the label was FEARFUL/SURPRISED: ${(100*A.filter(x=>["FEARFUL","SURPRISED"].includes(x.em)).length/Math.max(1,A.length)).toFixed(1)} % of decisions in the window`);
const bysec:any={}; A.forEach(x=>{bysec[x.s]=bysec[x.s]??[];bysec[x.s].push(x)}); for(const s of Object.keys(bysec).sort((a,b)=>+a-+b)) console.log(`  second ${s}: ${bysec[s].length} decisions, ${(100*bysec[s].filter((x:any)=>["rest","look_around"].includes(x.a)).length/bysec[s].length).toFixed(0)}% rest/look_around, emotion mostly ${Object.entries(bysec[s].reduce((c:any,x:any)=>(c[x.em]=(c[x.em]??0)+1,c),{})).sort((p:any,q:any)=>q[1]-p[1])[0][0]}`);
