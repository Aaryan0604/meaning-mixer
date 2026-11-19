const fs=require('fs');
const d=require('wink-embeddings-sg-100d');
const words=Object.keys(d.vectors), D=d.dimensions;
const BLOCK=/fuck|shit|cunt|nigg|fag|porn|whore|slut|bitch|dick|cock|pussy|rape|nazi|anal$|penis|vagina|cum$|rapist|molest|jihad|terror|suicide|kill/;
const keep=[];
for(let i=0;i<words.length&&keep.length<30000;i++){const w=words[i];if(/^[a-z]{3,14}$/.test(w)&&!BLOCK.test(w))keep.push(w)}
const M=keep.map(w=>{const v=d.vectors[w].slice(0,D);const n=Math.hypot(...v)||1;return v.map(x=>x/n)});
let maxAbs=0;const all=[];for(const m of M)for(const x of m)all.push(Math.abs(x));all.sort((a,b)=>a-b);
const clipv=all[Math.floor(all.length*0.9999)];
const scale=127/clipv;
const buf=Buffer.alloc(keep.length*D);
M.forEach((m,i)=>m.forEach((x,j)=>buf.writeInt8(Math.max(-127,Math.min(127,Math.round(x*scale))),i*D+j)));
// hub score against 600 pseudo-random (seeded) words
let seed=12345;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;
const R=[];for(let i=0;i<600;i++)R.push(M[Math.floor(rnd()*keep.length)]);
const hubs=Buffer.alloc(keep.length);
M.forEach((m,i)=>{let s=0;for(const r of R){let t=0;for(let j=0;j<D;j++)t+=m[j]*r[j];s+=t}hubs[i]=Math.max(0,Math.min(255,Math.round((s/R.length)*255)))});

const FILLER=new Set(`north south east west northern southern eastern western northeast northwest southeast southwest central
along near around across among between within without toward towards against during before after above below behind beyond inside outside upon under over through into onto from onto via per
ever once often always never still already almost quite rather perhaps maybe just even also then there here however yet soon later again too very much many most more less least some any each every both either neither
came come coming comes went going goes gone getting gets got get said says say saying made make makes making took take takes taken taking gave give gives given giving put puts set sets left leave seen saw see sees seeing known know knows knew became become becomes being been having had has have does did done doing found find finds called call calls used use uses using want wanted wants need needed needs seems seemed seem look looked looks
vicinity area areas part parts side sides region regions thing things way ways kind kinds lot lots place places number numbers time times year years day days week weeks month months today yesterday tomorrow end ends began begin begins started start starts based including included includes include according
one two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty hundred thousand million billion first second third last next previous former latter
january february march april june july august september october november december monday tuesday wednesday thursday friday saturday sunday
other others another same such own different various several certain particular general common main major
new old good great high long little big small large best better well like likely
because although though while whether since until unless
mr mrs ms dr`.split(/\s+/));

keep.forEach((w,i)=>{ if(FILLER.has(w)) hubs[i]=255 });
console.log('filler flagged', keep.filter(w=>FILLER.has(w)).length);
fs.mkdirSync('out',{recursive:true});
fs.writeFileSync('out/words.txt',keep.join('\n'));
fs.writeFileSync('out/vectors.i8',buf);
fs.writeFileSync('out/hub.u8',hubs);
fs.writeFileSync('out/meta.json',JSON.stringify({count:keep.length,dims:D,scale,stopCount:250}));
console.log('words',keep.length,'clip',clipv.toFixed(3),'scale',scale.toFixed(1),'vec bytes',buf.length);
