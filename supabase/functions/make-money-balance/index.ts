import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors={
  "Access-Control-Allow-Origin":"https://sniperscoop2-spec.github.io",
  "Access-Control-Allow-Headers":"content-type, authorization",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json; charset=utf-8",
  "Vary":"Origin"
};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:cors});

async function sha(v:string){
  const d=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)));
  return Array.from(d).map(x=>x.toString(16).padStart(2,"0")).join("");
}
function secret(){
  const x=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(x){
    try{
      const p=JSON.parse(x);
      if(typeof p?.default==="string")return p.default;
      const v=Object.values(p??{}).find(v=>typeof v==="string");
      if(typeof v==="string")return v;
    }catch{}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??null;
}
async function db(path:string,o:RequestInit={}){
  const u=Deno.env.get("SUPABASE_URL"),s=secret();
  if(!u||!s)throw Error("server_credentials_unavailable");
  const r=await fetch(`${u}/rest/v1/${path}`,{...o,headers:{apikey:s,Authorization:`Bearer ${s}`,"Content-Type":"application/json",...(o.headers??{})}});
  const t=await r.text();
  if(!r.ok)throw Error(`db_error:${r.status}`);
  return t?JSON.parse(t):null;
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({ok:false,error:"POST_REQUIRED"},405);
  try{
    const auth=req.headers.get("Authorization")??"";
    const token=auth.startsWith("Bearer ")?auth.slice(7).trim():"";
    if(!/^[a-f0-9]{64}$/i.test(token))return json({ok:false,error:"SESSION_REQUIRED"},401);
    const tokenHash=await sha(token);
    const now=new Date().toISOString();
    const sessions=await db(`make_money_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(now)}&select=player_id&limit=1`);
    const session=Array.isArray(sessions)?sessions[0]:null;
    if(!session?.player_id)return json({ok:false,error:"SESSION_EXPIRED"},401);
    const players=await db(`make_money_players?id=eq.${encodeURIComponent(session.player_id)}&select=balance,updated_at&limit=1`);
    const player=Array.isArray(players)?players[0]:null;
    if(!player)return json({ok:false,error:"PLAYER_NOT_FOUND"},404);
    return json({ok:true,balance:Number(player.balance??0),updated_at:player.updated_at??null});
  }catch(e){
    console.error(e);
    return json({ok:false,error:"BALANCE_SERVER_ERROR"},500);
  }
});
