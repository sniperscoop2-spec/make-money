const AUTH_API='https://klvpeopoziausjvefaek.supabase.co/functions/v1/make-money-auth';
const MINING_API='https://klvpeopoziausjvefaek.supabase.co/functions/v1/make-money-mining';
const JOBS_API='https://klvpeopoziausjvefaek.supabase.co/functions/v1/make-money-jobs';
const tg=window.Telegram?.WebApp;
const $=id=>document.getElementById(id);
let sessionToken=null;
let sessionExpiresAt=0;
let balance=0;
let jobs=[];
let jobsBusy=false;
let jobsTimer=null;

function fail(message){$('spinner').style.display='none';$('title').textContent='Connexion impossible';$('message').textContent=message;}
function formatMM(value){return Number(value||0).toLocaleString('en-US',{maximumFractionDigits:4});}
function setBalance(value){balance=Number(value||0);$('balance').textContent=formatMM(balance);}
function randomOperationKey(){if(window.crypto?.randomUUID)return window.crypto.randomUUID().replace(/-/g,'');const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
function sessionValid(){return Boolean(sessionToken&&Date.now()<sessionExpiresAt);}
function updateMiningTime(nextClaimAt){
  if(!nextClaimAt){$('nextClaim').textContent='Ready';$('claimMining').disabled=false;return;}
  const target=new Date(nextClaimAt).getTime();
  if(!Number.isFinite(target)){$('nextClaim').textContent='Unavailable';$('claimMining').disabled=true;return;}
  const tick=()=>{
    const remaining=Math.max(0,target-Date.now());
    if(remaining<=0){$('nextClaim').textContent='Ready';$('claimMining').disabled=false;$('miningStatus').textContent='Your miner is ready.';return;}
    const totalSeconds=Math.ceil(remaining/1000),h=Math.floor(totalSeconds/3600),m=Math.floor((totalSeconds%3600)/60),s=totalSeconds%60;
    $('nextClaim').textContent=`${h}h ${m}m ${s}s`;
    $('claimMining').disabled=true;
    $('miningStatus').textContent='Mining is active. Come back when the timer reaches zero.';
    window.setTimeout(tick,1000);
  };
  tick();
}
async function claimMining(){
  if(!sessionValid()){$('miningStatus').textContent='Session expired. Reopen the Mini App.';return;}
  const button=$('claimMining');button.disabled=true;$('miningStatus').textContent='Claiming securely...';
  const operationKey=randomOperationKey();
  try{
    const r=await fetch(MINING_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${sessionToken}`},body:JSON.stringify({operation_key:operationKey}),cache:'no-store'});
    const data=await r.json().catch(()=>null);
    if(!r.ok||!data?.ok)throw new Error(data?.error||`HTTP ${r.status}`);
    setBalance(data.balance);
    const reward=Number(data.reward||0);
    $('miningReward').textContent=reward>0?`+${formatMM(reward)} MM`:'0 MM';
    $('miningStatus').textContent=reward>0?'Mining reward credited securely.':'Nothing to claim yet.';
    updateMiningTime(data.next_claim_at);
  }catch(e){$('miningStatus').textContent=e.message==='SESSION_EXPIRED'?'Session expired. Reopen the Mini App.':`Claim failed (${e.message}).`;button.disabled=false;}
}
function clearJobsTimer(){if(jobsTimer){clearTimeout(jobsTimer);jobsTimer=null;}}
function scheduleJobsRefresh(ms=60000){clearJobsTimer();jobsTimer=setTimeout(()=>loadJobs(false),ms);}
function renderJobs(){
  const list=$('jobsList');if(!list)return;list.replaceChildren();
  const active=jobs.find(j=>j.active);
  const activeBox=$('activeJob');
  if(active){activeBox.hidden=false;activeBox.replaceChildren();const strong=document.createElement('strong');strong.textContent=`Active job: ${active.name}`;const small=document.createElement('small');small.textContent=`${formatMM(active.income_per_hour)} MM/hour · ${formatMM(active.daily_cap)} MM/day maximum`;activeBox.append(strong,small);}else activeBox.hidden=true;
  for(const job of jobs){
    const row=document.createElement('div');row.className=`job-row${job.active?' active':''}`;
    const head=document.createElement('div');head.className='job-head';
    const name=document.createElement('span');name.className='job-name';name.textContent=job.name;
    const rate=document.createElement('span');rate.className='job-rate';rate.textContent=`${formatMM(job.income_per_hour)}/h`;
    head.append(name,rate);
    const meta=document.createElement('div');meta.className='job-meta';
    const cost=document.createElement('span');cost.textContent=job.unlocked?`Training complete · ${formatMM(job.earned_today)} / ${formatMM(job.daily_cap)} today`:`Training: ${formatMM(job.training_cost)} MM`;
    const cap=document.createElement('span');cap.textContent=`Cap ${formatMM(job.daily_cap)}/day`;meta.append(cost,cap);
    row.append(head,meta);
    const button=document.createElement('button');button.type='button';
    if(!job.unlocked){button.textContent=job.training_cost>0?`Train · ${formatMM(job.training_cost)} MM`:'Unlock free';button.disabled=jobsBusy||balance<job.training_cost;button.onclick=()=>jobAction(job,'unlock');}
    else if(job.active){button.textContent='Active';button.disabled=true;button.className='secondary';}
    else{button.textContent='Choose job';button.disabled=jobsBusy;button.className='secondary';button.onclick=()=>jobAction(job,'choose');}
    row.append(button);list.append(row);
  }
}
async function loadJobs(showLoading=true){
  if(!sessionValid())return;
  if(showLoading)$('jobsStatus').textContent='Loading jobs securely...';
  try{
    const r=await fetch(JOBS_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${sessionToken}`},body:JSON.stringify({action:'list'}),cache:'no-store'});
    const data=await r.json().catch(()=>null);
    if(!r.ok||!data?.ok)throw new Error(data?.error||`HTTP ${r.status}`);
    jobs=Array.isArray(data.jobs)?data.jobs.map(j=>({...j,training_cost:Number(j.training_cost||0),income_per_hour:Number(j.income_per_hour||0),daily_cap:Number(j.daily_cap||0),earned_today:Number(j.earned_today||0),unlocked:Boolean(j.unlocked),active:Boolean(j.active)})):[];
    $('jobsStatus').textContent=jobs.length?'Choose one job. Only one job can generate salary at a time.':'No jobs available.';
    renderJobs();scheduleJobsRefresh();
  }catch(e){$('jobsStatus').textContent=e.message==='SESSION_EXPIRED'?'Session expired. Reopen the Mini App.':`Jobs unavailable (${e.message}).`;}
}
async function jobAction(job,action){
  if(jobsBusy||!sessionValid())return;
  jobsBusy=true;renderJobs();$('jobsStatus').textContent=action==='unlock'?`Training for ${job.name}...`:action==='choose'?`Switching to ${job.name}...`:'Claiming salary...';
  try{
    const r=await fetch(JOBS_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${sessionToken}`},body:JSON.stringify({action,job_id:job.job_id,operation_key:randomOperationKey()}),cache:'no-store'});
    const data=await r.json().catch(()=>null);
    if(!r.ok||!data?.ok)throw new Error(data?.error||`HTTP ${r.status}`);
    setBalance(data.balance);
    $('jobsStatus').textContent=action==='unlock'?'Training completed.':action==='choose'?`${job.name} is now your active job.`:`Salary credited: +${formatMM(data.reward)} MM.`;
    await loadJobs(false);
  }catch(e){
    const messages={INSUFFICIENT_BALANCE:'Not enough MM.',JOB_LOCKED:'Complete the training first.',ALREADY_UNLOCKED:'Already trained.',JOB_NOT_ACTIVE:'This job is not active.',JOB_COOLDOWN:'Salary is not ready yet.',DAILY_LIMIT_REACHED:'Daily salary limit reached.',OPERATION_REUSED:'This operation was already processed.',SESSION_EXPIRED:'Session expired. Reopen the Mini App.'};
    $('jobsStatus').textContent=messages[e.message]||`Job action failed (${e.message}).`;
  }finally{jobsBusy=false;renderJobs();}
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
    sessionToken=data.session.token;sessionExpiresAt=new Date(data.session.expires_at).getTime();
    const p=data.player;
    $('statusCard').hidden=true;$('profile').hidden=false;$('mining').hidden=false;$('jobs').hidden=false;
    $('name').textContent=[p.first_name,p.last_name].filter(Boolean).join(' ')||'Player';
    $('username').textContent=p.username?`@${p.username}`:'Telegram user';setBalance(p.balance);
    if(p.avatar_url){const img=document.createElement('img');img.src=p.avatar_url;img.alt='';img.referrerPolicy='no-referrer';$('avatar').replaceChildren(img);}
    $('claimMining').addEventListener('click',claimMining,{passive:true});updateMiningTime(p.next_claim_at);await loadJobs();
  }catch(e){fail(e.message==='Failed to fetch'?'Serveur d’authentification inaccessible.':`Échec de l’authentification (${e.message}).`);}
}
start();
