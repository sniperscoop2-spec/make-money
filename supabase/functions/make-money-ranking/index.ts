import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors={"Access-Control-Allow-Origin":"https://sniperscoop2-spec.github.io","Access-Control-Allow-Headers":"content-type, authorization","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Vary":"Origin"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Cache-Control":"no-store"}});
async function sha256Hex(value:string){const d=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));return Array.from(d).map(x=>x.toString(16).padStart(2,"0")).join("");}
const url=()=>Deno.env.get("SUPABASE_URL")!;
const secret=()=>Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function db(path:string,init:RequestInit={}){const s=secret();const r=await fetch(`${url()}/rest/v1/${path}`,{...init,headers:{apikey:s,Authorization:`Bearer ${s}`,"Content-Type":"application/json",...(init.headers??{})}});const text=await r.text();if(!r.ok)throw new Error(`db:${r.status}`);return text?JSON.parse(text):[];}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  try{
    const auth=req.headers.get("Authorization")||"";const token=auth.startsWith("Bearer ")?auth.slice(7).trim():"";
    if(!token||token.length<32)return json({ok:false,error:"UNAUTHORIZED"},401);
    const tokenHash=await sha256Hex(token);
    const sessions=await db(`make_money_sessions?select=player_id,expires_at,revoked_at&token_hash=eq.${encodeURIComponent(tokenHash)}&limit=1`);
    const session=sessions?.[0];
    if(!session)return json({ok:false,error:"UNAUTHORIZED"},401);
    if(session.revoked_at||new Date(session.expires_at).getTime()<=Date.now())return json({ok:false,error:"SESSION_EXPIRED"},401);
    const body=await req.json().catch(()=>({}));
    const requested=Number(body?.limit);const limit=Number.isInteger(requested)?Math.min(Math.max(requested,1),50):50;
    const players=await db(`make_money_players?select=id,username,first_name,last_name,balance&order=balance.desc,created_at.asc,id.asc&limit=${limit}`);
    const ranking=(Array.isArray(players)?players:[]).map((p:any,i:number)=>({rank:i+1,display_name:[p.first_name,p.last_name].filter(Boolean).join(" ")||"Player",username:p.username||null,balance:Number(p.balance||0),is_me:p.id===session.player_id}));
    return json({ok:true,ranking});
  }catch(e){console.error(e);return json({ok:false,error:"RANKING_UNAVAILABLE"},500);}
});
