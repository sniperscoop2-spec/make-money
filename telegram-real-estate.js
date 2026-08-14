const REAL_ESTATE_API='https://klvpeopoziausjvefaek.supabase.co/functions/v1/make-money-real-estate';
const RE_AUTH_API='https://klvpeopoziausjvefaek.supabase.co/functions/v1/make-money-auth';
const reOriginalFetch=window.fetch.bind(window);
window.fetch=async(...args)=>{
  const response=await reOriginalFetch(...args);
  const requestUrl=typeof args[0]==='string'?args[0]:args[0]?.url||'';
  if(requestUrl===RE_AUTH_API){
    response.clone().json().then(data=>{
      if(data?.ok&&data?.session?.token){
        window.mmSessionToken=data.session.token;
        window.mmSessionExpiresAt=new Date(data.session.expires_at).getTime();
        window.dispatchEvent(new CustomEvent('make-money-authenticated'));
      }
    }).catch(()=>{});
  }
  return response;
};
let realEstateBusy=false;
let realEstateTimer=null;
let realEstateItems=[];

function reFormatMM(value){return Number(value||0).toLocaleString('en-US',{maximumFractionDigits:4});}
function reSessionValid(){return Boolean(window.mmSessionToken&&Date.now()<Number(window.mmSessionExpiresAt||0));}
function reOperationKey(){if(window.crypto?.randomUUID)return window.crypto.randomUUID().replace(/-/g,'');const b=new Uint8Array(24);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');}
function reSetBalance(value){const el=document.getElementById('balance');if(el)el.textContent=reFormatMM(value);}
function reClearTimer(){if(realEstateTimer){clearTimeout(realEstateTimer);realEstateTimer=null;}}
function reSchedule(){reClearTimer();const dates=realEstateItems.map(x=>x.next_claim_at).filter(Boolean).map(x=>new Date(x).getTime()).filter(Number.isFinite);if(!dates.length)return;const next=Math.min(...dates);realEstateTimer=setTimeout(()=>reRender(),Math.max(1000,next-Date.now()+100));}
function reCooldownText(next){if(!next)return 'Ready';const ms=new Date(next).getTime()-Date.now();if(!Number.isFinite(ms))return 'Unavailable';if(ms<=0)return 'Ready';const sec=Math.ceil(ms/1000),h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return h?`${h}h ${m}m ${s}s`:`${m}m ${s}s`;}
function reRender(){
  const list=document.getElementById('realEstateList');if(!list)return;list.replaceChildren();
  for(const item of realEstateItems){
    const row=document.createElement('div');row.className='property-row';
    const head=document.createElement('div');head.className='property-head';
    const name=document.createElement('strong');name.textContent=item.name;
    const type=document.createElement('span');type.textContent=item.property_type;
    head.append(name,type);
    const meta=document.createElement('div');meta.className='property-meta';
    const price=document.createElement('span');price.textContent=`Price: ${reFormatMM(item.price)} MM`;
    const income=document.createElement('span');income.textContent=`+${reFormatMM(item.income_per_day)} MM/day`;
    const owned=document.createElement('span');owned.textContent=item.owned_units>0?'Owned':'Not owned';
    meta.append(price,income,owned);row.append(head,meta);
    const button=document.createElement('button');button.type='button';
    const ownedNow=Number(item.owned_units||0)>0;
    if(!ownedNow){button.textContent=`Buy · ${reFormatMM(item.price)} MM`;button.disabled=realEstateBusy;button.onclick=()=>reAction(item,'buy');}
    else{const cd=reCooldownText(item.next_claim_at);button.textContent=cd==='Ready'?`Claim · ${reFormatMM(item.income_per_day)} MM`:`Claim in ${cd}`;button.disabled=realEstateBusy||cd!=='Ready';button.className=cd==='Ready'?'':'secondary';button.onclick=()=>reAction(item,'claim');}
    row.append(button);list.append(row);
  }
  reSchedule();
}
async function reLoad(){
  if(!reSessionValid())return;
  const status=document.getElementById('realEstateStatus');status.textContent='Loading properties securely...';
  try{
    const r=await reOriginalFetch(REAL_ESTATE_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${window.mmSessionToken}`},body:JSON.stringify({action:'list'}),cache:'no-store'});
    const data=await r.json().catch(()=>null);if(!r.ok||!data?.ok)throw new Error(data?.error||`HTTP ${r.status}`);
    realEstateItems=Array.isArray(data.properties)?data.properties.map(p=>({...p,price:Number(p.price||0),income_per_day:Number(p.income_per_day||0),owned_units:Number(p.owned_units||0)})):[];
    status.textContent=realEstateItems.length?'Buy one property and collect its income every 24 hours.':'No properties available.';reRender();
  }catch(e){status.textContent=e.message==='SESSION_EXPIRED'?'Session expired. Reopen the Mini App.':`Real Estate unavailable (${e.message}).`;}
}
async function reAction(item,action){
  if(realEstateBusy||!reSessionValid())return;
  realEstateBusy=true;reRender();
  const status=document.getElementById('realEstateStatus');status.textContent=action==='buy'?`Buying ${item.name} securely...`:`Claiming ${item.name} income securely...`;
  try{
    const r=await reOriginalFetch(REAL_ESTATE_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${window.mmSessionToken}`},body:JSON.stringify({action,property_id:item.property_id,operation_key:reOperationKey()}),cache:'no-store'});
    const data=await r.json().catch(()=>null);if(!r.ok||!data?.ok)throw new Error(data?.error||`HTTP ${r.status}`);
    reSetBalance(data.balance);status.textContent=action==='buy'?`${item.name} purchased.`:`Income credited: +${reFormatMM(data.reward)} MM.`;await reLoad();
  }catch(e){
    const messages={INSUFFICIENT_BALANCE:'Not enough MM.',ALREADY_OWNED:'You already own this property.',PROPERTY_NOT_OWNED:'You do not own this property.',PROPERTY_COOLDOWN:'Income is not ready yet.',PROPERTY_CLOCK_INVALID:'Property timer is invalid. Try again later.',OPERATION_KEY_REUSED:'This operation was already processed.',SESSION_EXPIRED:'Session expired. Reopen the Mini App.',RATE_LIMITED:'Too many requests. Try again in a minute.'};
    status.textContent=messages[e.message]||`Real Estate action failed (${e.message}).`;
  }finally{realEstateBusy=false;reRender();}
}
window.addEventListener('make-money-authenticated',()=>{const section=document.getElementById('realEstate');if(section){section.hidden=false;reLoad();}});
