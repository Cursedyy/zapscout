import fs from "node:fs/promises";
import { parseEnv } from "node:util";
const env=parseEnv(await fs.readFile(".env","utf8"));
const backend=env.SUPABASE_URL||env.VITE_SUPABASE_URL;
const key=env.SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY;
const origin="https://zapscout.com.br";
async function fetchText(url,headers) {
 const response=await fetch(url,{headers,signal:AbortSignal.timeout(12000),cache:"no-store"});
 return {response,text:await response.text()};
}
async function publishedCode() {
 const {response,text}=await fetchText(origin+"/login");
 const seen=new Set();const bodies=[{url:origin+"/login",text}];
 let hasTimeout=false,hasConnectionMessage=false;
 for(let depth=0;depth<3;depth++) {
  const candidates=[];
  for(const body of bodies.splice(0)) {
   hasTimeout ||= body.text.includes("PrazoConexaoError");
   hasConnectionMessage ||= body.text.includes("Não foi possível verificar a entrada no servidor")||body.text.includes("Sessão ainda indisponível");
   for(const m of body.text.matchAll(/["']((?:\/assets\/|\.\/)[A-Za-z0-9._-]+\.m?js)["']/g)) {
    const u=new URL(m[1],body.url);
    if(u.origin===origin&&u.pathname.startsWith("/assets/")&&!seen.has(u.href)&&seen.size<30){seen.add(u.href);candidates.push(u.href);}
   }
  }
  const results=await Promise.all(candidates.map(async url=>{try{return {url,...await fetchText(url)}}catch{return null;}}));
  bodies.push(...results.filter(Boolean));
 }
 console.log(JSON.stringify({name:"published_login_code",status:response.status,assets:seen.size,hasTimeout,hasConnectionMessage}));
 return hasTimeout&&hasConnectionMessage;
}
for(let attempt=0;attempt<6;attempt++){
 try {if(await publishedCode())break;}catch(e){console.log(JSON.stringify({name:"published_login_code",failure:e.name}));}
 if(attempt<5)await new Promise(r=>setTimeout(r,20000));
}
const headers={apikey:key};
await Promise.all(["/auth/v1/health","/auth/v1/settings","/rest/v1/empresas?select=id&limit=0"].map(async path=>{
 const start=Date.now();
 try {
  const {response,text}=await fetchText(backend+path,headers);
  const report={name:path.split("?")[0],status:response.status,ms:Date.now()-start};
  if(!response.ok){
   const lower=text.toLowerCase();
   report.category=/paus|suspend/.test(lower)?"paused":/credit|balance|budget|billing/.test(lower)?"billing":/resource|memory|connection limit|too many clients/.test(lower)?"resources":/unavailable|not ready|upstream|connection/.test(lower)?"unavailable":"unclassified";
   try{const d=JSON.parse(text);if(typeof d.code==="string"&&/^[a-zA-Z0-9_-]{1,60}$/.test(d.code))report.code=d.code;}catch{}
  }
  console.log(JSON.stringify(report));
 } catch(e){console.log(JSON.stringify({name:path.split("?")[0],failure:e.name,ms:Date.now()-start}));}
}));

let confirmed=false;
for(let attempt=0;attempt<4;attempt++){
 try{confirmed=await publishedCode();}catch(error){console.log(JSON.stringify({name:"published_login_code",failure:error.name,attempt}));}
 if(confirmed)break;
 if(attempt<3)await new Promise(resolve=>setTimeout(resolve,20000));
}
if(!confirmed)process.exitCode=1;
