const MINING_MODULES_API='https://klvpeopoziausjvefaek.supabase.co/functions/v1/make-money-mining';
let miningModules=[];
let miningBusy=false;
const miningOriginalFetch=window.fetch.bind(window);
function miningSessionValid(){return Boolean(window.mmSessionToken&&Date.now()<Number(window.mmSessionExpiresAt||0));}
function miningOperationKey(){if(window.crypto?.randomUUID)return window.crypto.randomUUID().replace(/-/g,'');const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');}
function miningFormat(value){return Number(value||0).toLocaleString('en-US',{maximumFractionDigits:4});}
async function miningFetch(body){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);try{return await miningOriginalFetch(MINING_MODULES_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${window.mmSessionToken}`},body:JSON.stringify(body),cache:'no-store',signal:controller.signal});}finally{clearTimeout(timer);}}
function miningCurrent(){return miningModules.reduce((best,x)=>Number(x.level)>Number(best?.level||0)&&x.owned?x:best,null)||miningModules.find(x=>Number(x.level)===1)||null;}
function miningSyncAvailable(){
 const current=miningCurrent();
 if(!current)return;
 const next=current.next_claim_at?new Date(current.next_claim_at).getTime():NaN;
 const reward=document.getElementById('miningReward');
 if(!reward)return;
 if(Number.isFinite(next)&&next<=Date.now())reward.textContent=`+${miningFormat(current.rate_per_hour)} MM`;
 else if(Number.isFinite(next))reward.textContent='0 MM';
 if(Number.isFinite(next)&&next>Date.now())window.setTimeout(miningSyncAvailable,Math.min(next-Date.now()+50,2147483647));
}
function renderMiningModules(){
 const list=document.getElementById('miningModules'),summary=document.getElementById('miningModuleSummary');if(!list)return;list.replaceChildren();
 const current=miningCurrent();if(summary&&current)summary.textContent=`${current.name} · ${miningFormat(current.rate_per_hour)} MM/h`;
 for(const module of miningModules){
  const level=Number(module.level),owned=Boolean(module.owned),next=Number(current?.level||1)+1===level,canBuy=next&&!owned&&Number(window.mmBalance||0)>=Number(module.cost||0),locked=!owned&&!next;
  const card=document.createElement('div');card.className=`mining-module${owned?' active':''}${locked?' locked':''}`;
  const top=document.createElement('div');top.className='mining-module-top';
  const identity=document.createElement('div');identity.className='mining-module-identity';
  const icon=document.createElement('span');icon.className='mining-module-icon';icon.textContent=module.icon;
  const title=document.createElement('div');const name=document.createElement('strong');name.textContent=`Level ${level} · ${module.name}`;const description=document.createElement('small');description.textContent=module.description;title.append(name,description);identity.append(icon,title);
  const rate=document.createElement('strong');rate.className='mining-module-rate';rate.textContent=`${miningFormat(module.rate_per_hour)}/h`;top.append(identity,rate);card.append(top);
  const meta=document.createElement('div');meta.className='mining-module-meta';const cost=document.createElement('span');cost.textContent=level===1?'Free':`Upgrade · ${miningFormat(module.cost)} MM`;const status=document.createElement('span');status.textContent=owned?(level===Number(current?.level)?'ACTIVE':'OWNED'):next?'NEXT MODULE':'';meta.append(cost,status);card.append(meta);
  const button=document.createElement('button');button.type='button';button.className='mining-module-button';
  if(owned){button.textContent=level===Number(current?.level)?'Current module':'Available';button.disabled=true;}
  else{button.textContent=`Upgrade · ${miningFormat(module.cost)} MM`;button.disabled=miningBusy||!canBuy||locked;if(canBuy)button.onclick=()=>upgradeMiningModule(level);}
  card.append(button);list.append(card);
 }
 miningSyncAvailable();
}
async function loadMiningModules(){if(!miningSessionValid())return;try{const r=await miningFetch({action:'status'});const data=await r.json().catch(()=>null);if(!r.ok||!data?.ok)throw new Error(data?.error||`HTTP ${r.status}`);miningModules=Array.isArray(data.mining)?data.mining.map(x=>({...x,level:Number(x.level||0),cost:Number(x.cost||0),rate_per_hour:Number(x.rate_per_hour||0),owned:Boolean(x.owned)})):[];renderMiningModules();}catch(e){const summary=document.getElementById('miningModuleSummary');if(summary)summary.textContent=e.name==='AbortError'?'Timeout':'Unavailable';}}
async function upgradeMiningModule(level){if(miningBusy||!miningSessionValid())return;const module=miningModules.find(x=>Number(x.level)===Number(level));if(!module)return;miningBusy=true;renderMiningModules();const status=document.getElementById('miningStatus');if(status)status.textContent=`Upgrading ${module.name} securely...`;try{const r=await miningFetch({action:'upgrade',level:Number(level),operation_key:miningOperationKey()});const data=await r.json().catch(()=>null);if(!r.ok||!data?.ok)throw new Error(data?.error||`HTTP ${r.status}`);const balance=Number(data.balance||0);const balanceEl=document.getElementById('balance');if(balanceEl)balanceEl.textContent=miningFormat(balance);window.mmBalance=balance;window.dispatchEvent(new CustomEvent('make-money-balance-updated',{detail:{balance}}));if(status)status.textContent=`${module.name} upgraded. Production is now ${miningFormat(data.rate_per_hour)} MM/hour.`;await loadMiningModules();}catch(e){const messages={INSUFFICIENT_BALANCE:'Not enough MM.',INVALID_MINING_UPGRADE:'Upgrade the modules in order.',MINING_MODULE_NOT_FOUND:'Mining module unavailable.',OPERATION_REUSED:'This operation was already processed.',SESSION_EXPIRED:'Session expired. Reopen the Mini App.'};if(status)status.textContent=messages[e.message]||`Mining upgrade failed (${e.message}).`;}finally{miningBusy=false;renderMiningModules();}}
window.addEventListener('make-money-authenticated',()=>loadMiningModules());
window.addEventListener('make-money-balance-updated',()=>renderMiningModules());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(miningSessionValid())loadMiningModules();});else if(miningSessionValid())loadMiningModules();

/* Active miner animation: visual-only, no changes to mining economics or API behavior. */
(function installMiningAnimation(){
 const css='.mining-module.active .mining-module-icon{position:relative;animation:mmMinerBob 1.15s ease-in-out infinite;will-change:transform}.mining-module.active .mining-module-icon::after{content:"⛏";position:absolute;right:-8px;top:-10px;font-size:15px;transform-origin:80% 85%;animation:mmPickaxeSwing .72s ease-in-out infinite;filter:drop-shadow(0 2px 3px #0008);pointer-events:none}.mining-module.active .mining-module-icon::before{content:"✦";position:absolute;right:-9px;bottom:-5px;color:#63e69a;font-size:10px;opacity:0;animation:mmMiningSpark .72s ease-out infinite;pointer-events:none}.mining-module.active{box-shadow:0 0 0 1px #285d3d inset,0 8px 22px #63e69a12}.mining-module.active .mining-module-rate{animation:mmMiningRate 1.8s ease-in-out infinite}@keyframes mmMinerBob{0%,100%{transform:translateY(0) rotate(-2deg)}45%{transform:translateY(-2px) rotate(2deg)}70%{transform:translateY(1px) rotate(-1deg)}}@keyframes mmPickaxeSwing{0%,100%{transform:rotate(-38deg)}45%{transform:rotate(25deg)}60%{transform:rotate(32deg)}75%{transform:rotate(-8deg)}}@keyframes mmMiningSpark{0%,35%{opacity:0;transform:translate(0,0) scale(.5)}48%{opacity:1;transform:translate(3px,-3px) scale(1)}100%{opacity:0;transform:translate(8px,-10px) scale(.7)}}@keyframes mmMiningRate{0%,100%{text-shadow:0 0 0 #63e69a00}50%{text-shadow:0 0 10px #63e69a55}}@media(prefers-reduced-motion:reduce){.mining-module.active .mining-module-icon,.mining-module.active .mining-module-icon::before,.mining-module.active .mining-module-icon::after,.mining-module.active .mining-module-rate{animation:none}}';if(document.getElementById('mmMiningAnimationStyle'))return;const style=document.createElement('style');style.id='mmMiningAnimationStyle';style.textContent=css;(document.head||document.documentElement).appendChild(style);})();