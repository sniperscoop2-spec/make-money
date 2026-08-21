import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const cors={"Access-Control-Allow-Origin":"https://sniperscoop2-spec.github.io","Access-Control-Allow-Headers":"authorization, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Vary":"Origin","Cache-Control":"no-store"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
async function sha256Hex(value:string){const d=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));return Array.from(d).map(x=>x.toString(16).padStart(2,"0")).join("");}
function serverKey(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(raw){try{const p=JSON.parse(raw);if(typeof p?.default==="string")return p.default;const v=Object.values(p??{}).find(x=>typeof x==="string");if(typeof v==="string")return v;}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??null;}
async function rpc(name:string,args:Record<string,unknown>){const url=Deno.env.get("SUPABASE_URL"),key=serverKey();if(!url||!key)throw new Error("server_credentials_unavailable");const r=await fetch(`${url}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(args)});const text=await r.text();if(!r.ok){let detail=text;try{const p=JSON.parse(text);detail=String(p?.message||p?.hint||p?.details||p?.code||text);}catch{}throw new Error(detail||`rpc_${r.status}`);}return text?JSON.parse(text):null;}
function randomNonce(len=32){const bytes=new Uint8Array(len);crypto.getRandomValues(bytes);return Array.from(bytes).map(x=>x.toString(16).padStart(2,"0")).join("").slice(0,len);}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({ok:false,error:"POST_REQUIRED"},405);
  try{
    const auth=req.headers.get("authorization")??"";
    if(!auth.startsWith("Bearer "))return json({ok:false,error:"UNAUTHORIZED"},401);
    const token=auth.slice(7).trim();
    if(token.length<40||token.length>256)return json({ok:false,error:"UNAUTHORIZED"},401);
    const sessionHash=await sha256Hex(token);
    const body=await req.json().catch(()=>({}));
    const action=typeof body?.action==="string"?body.action:"";

    if(action==="list"){
      const [catalog,boost]=await Promise.all([
        rpc("make_money_shop_get_catalog",{p_session_hash:sessionHash}),
        rpc("make_money_shop_get_boost_status",{p_session_hash:sessionHash})
      ]);
      const boostRow=Array.isArray(boost)?boost[0]:boost;
      return json({ok:true,offers:Array.isArray(catalog)?catalog:[],boost:{active:Boolean(boostRow?.active),mining_multiplier:Number(boostRow?.mining_multiplier??1),expires_at:boostRow?.expires_at??null}});
    }

    if(action==="create_invoice"){
      const offerId=typeof body?.offer_id==="string"?body.offer_id:"";
      if(!/^[a-z0-9_]{1,32}$/.test(offerId))return json({ok:false,error:"INVALID_OFFER"},400);
      const prep=await rpc("make_money_shop_prepare_invoice",{p_session_hash:sessionHash,p_offer_id:offerId});
      const row=Array.isArray(prep)?prep[0]:prep;
      if(!row?.player_id)return json({ok:false,error:"INVALID_OFFER"},404);

      const botToken=Deno.env.get("TELEGRAM_BOT_TOKEN");
      if(!botToken)return json({ok:false,error:"TELEGRAM_BOT_TOKEN_NOT_CONFIGURED"},503);

      const payload=`${row.player_id}.${row.offer_id}.${randomNonce(24)}`;
      if(payload.length>128)return json({ok:false,error:"PAYLOAD_TOO_LONG"},500);

      const invoiceRes=await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          title:String(row.title).slice(0,32),
          description:String(row.description).slice(0,255),
          payload,
          currency:"XTR",
          prices:[{label:String(row.title).slice(0,32),amount:Number(row.stars_price)}]
        })
      });
      const invoiceData=await invoiceRes.json().catch(()=>null);
      if(!invoiceRes.ok||!invoiceData?.ok||typeof invoiceData?.result!=="string"){
        console.error("createInvoiceLink failed",invoiceData);
        return json({ok:false,error:"INVOICE_CREATE_FAILED"},502);
      }
      return json({ok:true,invoice_link:invoiceData.result,offer:{offer_id:row.offer_id,title:row.title,description:row.description,stars_price:row.stars_price}});
    }

    return json({ok:false,error:"INVALID_ACTION"},400);
  }catch(error){
    const m=error instanceof Error?error.message:String(error);
    if(m.includes("invalid_or_expired_session"))return json({ok:false,error:"SESSION_EXPIRED"},401);
    if(m.includes("invalid_session"))return json({ok:false,error:"UNAUTHORIZED"},401);
    if(m.includes("invalid_offer"))return json({ok:false,error:"INVALID_OFFER"},400);
    console.error("make-money-shop error",m);
    return json({ok:false,error:"SHOP_SERVER_ERROR"},500);
  }
});
