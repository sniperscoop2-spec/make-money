import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// One-off, manually-triggered utility: registers this project's Telegram bot
// webhook to point at make-money-telegram-webhook, with a secret token
// derived from the bot token itself (no extra secret storage needed). Not
// wired to any client and not called automatically -- run it once by hand
// after deploying/redeploying the webhook function, or if the bot token
// ever rotates.
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});
async function sha256Hex(value:string){const d=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));return Array.from(d).map(x=>x.toString(16).padStart(2,"0")).join("");}

Deno.serve(async req=>{
  try{
    const botToken=Deno.env.get("TELEGRAM_BOT_TOKEN");
    const supabaseUrl=Deno.env.get("SUPABASE_URL");
    if(!botToken||!supabaseUrl)return json({ok:false,error:"MISSING_CONFIG"},503);

    const secretToken=await sha256Hex(botToken);
    const webhookUrl=`${supabaseUrl}/functions/v1/make-money-telegram-webhook`;

    if(req.method==="GET" && new URL(req.url).searchParams.get("action")==="info"){
      const infoRes=await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      return json(await infoRes.json());
    }

    const res=await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        url:webhookUrl,
        secret_token:secretToken,
        allowed_updates:["pre_checkout_query","message"],
        drop_pending_updates:false
      })
    });
    const data=await res.json().catch(()=>null);
    return json({ok:Boolean(data?.ok),webhook_url:webhookUrl,telegram_response:data});
  }catch(e){
    console.error("telegram-setup error",e);
    return json({ok:false,error:"SETUP_ERROR"},500);
  }
});
