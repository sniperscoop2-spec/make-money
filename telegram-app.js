const AUTH_API='https://klvpeopoziausjvefaek.supabase.co/functions/v1/make-money-auth';
const MINING_API='https://klvpeopoziausjvefaek.supabase.co/functions/v1/make-money-mining';
const tg=window.Telegram?.WebApp;
const $=id=>document.getElementById(id);
let sessionToken=null;
let sessionExpiresAt=0;
let balance=0;

function fail(message){
  $('spinner').style.display='none';
  $('title').textContent='Connexion impossible';
  $('message').textContent=message;
}

function formatMM(value){
  return Number(value||0).toLocaleString('en-US',{maximumFractionDigits:4});
}

function setBalance(value){
  balance=Number(value||0);
  $('balance').textContent=formatMM(balance);
}

function randomOperationKey(){
  if(window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g,'');
  const bytes=new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}

function updateMiningTime(nextClaimAt){
  if(!nextClaimAt){$('nextClaim').textContent='Ready';return;}
  const target=new Date(nextClaimAt).getTime();
  const tick=()=>{
    const remaining=Math.max(0,target-Date.now());
    if(remaining<=0){$('nextClaim').textContent='Ready';$('claimMining').disabled=false;return;}
    const totalSeconds=Math.ceil(remaining/1000);
    const h=Math.floor(totalSeconds/3600);
    const m=Math.floor((totalSeconds%3600)/60);
    const s=totalSeconds%60;
    $('nextClaim').textContent=`${h}h ${m}m ${s}s`;
    $('claimMining').disabled=true;
    window.setTimeout(tick,1000);
  };
  tick();
}

async function claimMining(){
  if(!sessionToken || Date.now()>=sessionExpiresAt){
    $('miningStatus').textContent='Session expired. Reopen the Mini App.';
    return;
  }
  const button=$('claimMining');
  button.disabled=true;
  $('miningStatus').textContent='Claiming securely...';
  const operationKey=randomOperationKey();
  try{
    const r=await fetch(MINING_API,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${sessionToken}`},
      body:JSON.stringify({operation_key:operationKey}),
      cache:'no-store'
    });
    const data=await r.json().catch(()=>null);
    if(!r.ok||!data?.ok) throw new Error(data?.error||`HTTP ${r.status}`);
    setBalance(data.balance);
    const reward=Number(data.reward||0);
    $('miningReward').textContent=reward>0?`+${formatMM(reward)} MM`:'0 MM';
    $('miningStatus').textContent=reward>0?'Mining reward credited securely.':'Nothing to claim yet.';
    updateMiningTime(data.next_claim_at);
  }catch(e){
    $('miningStatus').textContent=e.message==='Failed to fetch'?'Mining server unavailable.':`Claim failed (${e.message}).`;
    button.disabled=false;
  }
}

async function start(){
  if(!tg){fail('Cette page doit être ouverte depuis Telegram.');return;}
  try{tg.ready();tg.expand();tg.disableVerticalSwipes?.();}catch{}
  const initData=tg.initData;
  if(!initData){fail('Telegram n’a fourni aucune donnée d’authentification. Ouvre la Mini App depuis le bot.');return;}
  try{
    const r=await fetch(AUTH_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData}),cache:'no-store'});
    const data=await r.json().catch(()=>null);
    if(!r.ok||!data?.ok)throw new Error(data?.error||`HTTP ${r.status}`);
    sessionToken=data.session.token;
    sessionExpiresAt=new Date(data.session.expires_at).getTime();
    const p=data.player;
    $('statusCard').hidden=true;
    $('profile').hidden=false;
    $('mining').hidden=false;
    $('name').textContent=[p.first_name,p.last_name].filter(Boolean).join(' ')||'Player';
    $('username').textContent=p.username?`@${p.username}`:'Telegram user';
    setBalance(p.balance);
    if(p.avatar_url){
      const img=document.createElement('img');
      img.src=p.avatar_url;
      img.alt='';
      img.referrerPolicy='no-referrer';
      $('avatar').replaceChildren(img);
    }
    $('claimMining').addEventListener('click',claimMining,{passive:true});
    $('claimMining').disabled=false;
  }catch(e){
    fail(e.message==='Failed to fetch'?'Serveur d’authentification inaccessible.':`Échec de l’authentification (${e.message}).`);
  }
}

start();
