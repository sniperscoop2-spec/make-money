import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors={"Access-Control-Allow-Origin":"https://sniperscoop2-spec.github.io","Access-Control-Allow-Headers":"authorization, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Vary":"Origin","Cache-Control":"no-store"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
async function sha256Hex(value:string){const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));return Array.from(digest).map(x=>x.toString(16).padStart(2,"0")).join("");}
function serverKey(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(raw){try{const parsed=JSON.parse(raw);if(typeof parsed?.default==="string")return parsed.default;const first=Object.values(parsed??{}).find(x=>typeof x==="string");if(typeof first==="string")return first;}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??null;}
async function rpc(name:string,args:Record<string,unknown>){const url=Deno.env.get("SUPABASE_URL");const key=serverKey();if(!url||!key)throw new Error("server_credentials_unavailable");const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(args)});const text=await response.text();if(!response.ok)throw new Error(text||`rpc_${response.status}`);return text?JSON.parse(text):null;}
function operationKey(value:unknown){return typeof value==="string"&&/^[A-Za-z0-9_-]{16,128}$/.test(value)?value:"";}
function numberBet(value:unknown){const n=Number(value);return Number.isInteger(n)&&n>=10&&n<=100?n:null;}
function first(result:any){return Array.isArray(result)?result[0]:result;}

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({ok:false,error:"POST_REQUIRED"},405);
 try{
  const authorization=req.headers.get("authorization")??"";if(!authorization.startsWith("Bearer "))return json({ok:false,error:"UNAUTHORIZED"},401);
  const token=authorization.slice(7).trim();if(token.length<40||token.length>256)return json({ok:false,error:"UNAUTHORIZED"},401);
  const body=await req.json().catch(()=>({}));const action=typeof body?.action==="string"?body.action:"";const sessionHash=await sha256Hex(token);

  if(action==="status"){
   const row=first(await rpc("make_money_casino_status",{p_session_hash:sessionHash}));
   return json({ok:true,balance:Number(row?.balance??0),wagered_today:Number(row?.wagered_today??0),daily_wager_limit:Number(row?.daily_wager_limit??1000),house_edge:1/37,active_blackjack:row?.active_blackjack??null});
  }

  if(action==="roulette"){
   const bet=numberBet(body?.bet);const choice=typeof body?.choice==="string"?body.choice:"";const key=operationKey(body?.operation_key);if(bet===null)throw new Error("invalid_bet");if(choice!=="red"&&choice!=="black")throw new Error("invalid_choice");if(!key)throw new Error("invalid_operation_key");
   const row=first(await rpc("make_money_casino_roulette",{p_session_hash:sessionHash,p_bet:bet,p_choice:choice,p_operation_key:key}));
   return json({ok:true,game:"roulette",result_number:Number(row?.result_number??0),result_color:row?.result_color??"green",won:Boolean(row?.won),payout:Number(row?.payout??0),net_change:Number(row?.net_change??0),balance:Number(row?.balance??0),wagered_today:Number(row?.wagered_today??0),daily_wager_limit:Number(row?.daily_wager_limit??1000),house_edge:1/37});
  }

  if(action==="slots"){
   const bet=numberBet(body?.bet);const key=operationKey(body?.operation_key);if(bet===null)throw new Error("invalid_bet");if(!key)throw new Error("invalid_operation_key");
   const row=await rpc("make_money_casino_slots",{p_session_hash:sessionHash,p_bet:bet,p_operation_key:key});
   return json({ok:true,...first(row)});
  }

  if(action==="blackjack_start"){
   const bet=numberBet(body?.bet);const key=operationKey(body?.operation_key);if(bet===null)throw new Error("invalid_bet");if(!key)throw new Error("invalid_operation_key");
   const row=await rpc("make_money_casino_blackjack_start",{p_session_hash:sessionHash,p_bet:bet,p_operation_key:key});return json({ok:true,...first(row)});
  }

  if(action==="blackjack_action"){
   const roundId=typeof body?.round_id==="string"?body.round_id:"";const blackjackAction=typeof body?.blackjack_action==="string"?body.blackjack_action:"";const key=operationKey(body?.operation_key);if(!/^[0-9a-f-]{36}$/i.test(roundId))throw new Error("blackjack_round_not_found");if(blackjackAction!=="hit"&&blackjackAction!=="stand")throw new Error("invalid_blackjack_action");if(!key)throw new Error("invalid_operation_key");
   const row=await rpc("make_money_casino_blackjack_action",{p_session_hash:sessionHash,p_round_id:roundId,p_action:blackjackAction,p_operation_key:key});return json({ok:true,...first(row)});
  }

  return json({ok:false,error:"INVALID_ACTION"},400);
 }catch(error){
  const message=error instanceof Error?error.message:String(error);
  if(message.includes("invalid_or_expired_session"))return json({ok:false,error:"SESSION_EXPIRED"},401);
  if(message.includes("invalid_session"))return json({ok:false,error:"UNAUTHORIZED"},401);
  if(message.includes("invalid_operation_key"))return json({ok:false,error:"INVALID_OPERATION_KEY"},400);
  if(message.includes("invalid_bet"))return json({ok:false,error:"INVALID_BET"},400);
  if(message.includes("invalid_choice"))return json({ok:false,error:"INVALID_CHOICE"},400);
  if(message.includes("invalid_blackjack_action"))return json({ok:false,error:"INVALID_BLACKJACK_ACTION"},400);
  if(message.includes("blackjack_round_not_found"))return json({ok:false,error:"BLACKJACK_ROUND_NOT_FOUND"},404);
  if(message.includes("blackjack_round_finished"))return json({ok:false,error:"BLACKJACK_ROUND_FINISHED"},409);
  if(message.includes("insufficient_balance"))return json({ok:false,error:"INSUFFICIENT_BALANCE"},409);
  if(message.includes("daily_wager_limit_reached"))return json({ok:false,error:"DAILY_WAGER_LIMIT_REACHED"},409);
  if(message.includes("player_not_found"))return json({ok:false,error:"PLAYER_NOT_FOUND"},404);
  console.error("make-money-casino error",message);return json({ok:false,error:"CASINO_SERVER_ERROR"},500);
 }
});