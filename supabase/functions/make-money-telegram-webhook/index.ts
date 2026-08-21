import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Telegram bot webhook: handles Stars payment flow only (pre_checkout_query +
// successful_payment). Every other update type is acknowledged and ignored.
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});
async function sha256Hex(value:string){const d=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));return Array.from(d).map(x=>x.toString(16).padStart(2,"0")).join("");}
function serverKey(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(raw){try{const p=JSON.parse(raw);if(typeof p?.default==="string")return p.default;const v=Object.values(p??{}).find(x=>typeof x==="string");if(typeof v==="string")return v;}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??null;}
async function db(path:string,init:RequestInit={}){const u=Deno.env.get("SUPABASE_URL"),k=serverKey();if(!u||!k)throw new Error("server_credentials_unavailable");const r=await fetch(`${u}/rest/v1/${path}`,{...init,headers:{apikey:k,Authorization:`Bearer ${k}`,"Content-Type":"application/json",...(init.headers??{})}});const text=await r.text();if(!r.ok)throw new Error(text||`db_${r.status}`);return text?JSON.parse(text):null;}
async function rpc(name:string,args:Record<string,unknown>){const u=Deno.env.get("SUPABASE_URL"),k=serverKey();if(!u||!k)throw new Error("server_credentials_unavailable");const r=await fetch(`${u}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:k,Authorization:`Bearer ${k}`,"Content-Type":"application/json"},body:JSON.stringify(args)});const text=await r.text();if(!r.ok)throw new Error(text||`rpc_${r.status}`);return text?JSON.parse(text):null;}
async function tg(method:string,body:Record<string,unknown>){const token=Deno.env.get("TELEGRAM_BOT_TOKEN");if(!token)throw new Error("TELEGRAM_BOT_TOKEN_NOT_CONFIGURED");const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});return r.json().catch(()=>null);}

function parsePayload(payload:string){
  const m=/^([0-9a-f-]{36})\.([a-z0-9_]{1,32})\.[A-Za-z0-9_-]{8,64}$/.exec(String(payload||""));
  if(!m)return null;
  return {playerId:m[1],offerId:m[2]};
}

Deno.serve(async req=>{
  if(req.method!=="POST")return json({ok:true});
  try{
    const botToken=Deno.env.get("TELEGRAM_BOT_TOKEN");
    if(!botToken)return json({ok:false,error:"TELEGRAM_BOT_TOKEN_NOT_CONFIGURED"},503);
    const expectedSecret=await sha256Hex(botToken);
    const gotSecret=req.headers.get("x-telegram-bot-api-secret-token")??"";
    if(gotSecret!==expectedSecret){
      console.error("telegram webhook: bad secret token");
      return json({ok:false},401);
    }

    const update=await req.json().catch(()=>null);
    if(!update)return json({ok:true});

    // 1) Pre-checkout: must answer within 10s. Validate offer + price + player
    // BEFORE Telegram actually captures the Stars from the user.
    if(update.pre_checkout_query){
      const pcq=update.pre_checkout_query;
      const parsed=parsePayload(pcq.invoice_payload);
      let ok=false, errorMessage="Invalid order, please try again.";
      try{
        if(parsed && pcq.currency==="XTR"){
          const [offers,players]=await Promise.all([
            db(`make_money_shop_catalog?offer_id=eq.${encodeURIComponent(parsed.offerId)}&active=is.true&select=stars_price&limit=1`),
            db(`make_money_players?id=eq.${encodeURIComponent(parsed.playerId)}&select=id&limit=1`)
          ]);
          const offer=Array.isArray(offers)?offers[0]:null;
          const player=Array.isArray(players)?players[0]:null;
          if(offer && player && Number(offer.stars_price)===Number(pcq.total_amount)){
            ok=true;
          }
        }
      }catch(e){
        console.error("pre_checkout_query validation error",e);
      }
      await tg("answerPreCheckoutQuery", ok
        ? {pre_checkout_query_id:pcq.id, ok:true}
        : {pre_checkout_query_id:pcq.id, ok:false, error_message:errorMessage});
      return json({ok:true});
    }

    // 2) Successful payment: grant the purchase. Idempotent -- safe to retry.
    const payment=update.message?.successful_payment;
    if(payment){
      try{
        const result=await rpc("make_money_shop_grant_purchase",{
          p_invoice_payload:payment.invoice_payload,
          p_telegram_charge_id:payment.telegram_payment_charge_id,
          p_telegram_user_id:update.message?.from?.id ?? 0,
          p_stars_amount:payment.total_amount
        });
        const row=Array.isArray(result)?result[0]:result;
        const chatId=update.message?.chat?.id;
        if(chatId && row?.r_ok){
          const parts=[`Thanks! Your purchase is confirmed.`];
          if(Number(row.r_mm_granted)>0)parts.push(`+${Number(row.r_mm_granted).toLocaleString("en-US")} MM credited.`);
          if(row.r_boost_expires_at)parts.push(`Mining x${Number(row.r_boost_multiplier)} active until ${new Date(row.r_boost_expires_at).toUTCString()}.`);
          await tg("sendMessage",{chat_id:chatId,text:parts.join(" ")}).catch(()=>{});
        }
      }catch(e){
        // Logged for manual follow-up; the charge already succeeded on
        // Telegram's side, and make_money_shop_purchases + Telegram's own
        // charge id give us what we need to reconcile if this ever fires.
        console.error("successful_payment grant error",e,JSON.stringify(payment));
      }
      return json({ok:true});
    }

    return json({ok:true});
  }catch(e){
    console.error("telegram webhook error",e);
    return json({ok:true});
  }
});
