const API='https://klvpeopoziausjvefaek.supabase.co/functions/v1/make-money-auth';
const tg=window.Telegram?.WebApp;
const $=id=>document.getElementById(id);
function fail(message){$('spinner').style.display='none';$('title').textContent='Connexion impossible';$('message').textContent=message;}
async function start(){
 if(!tg){fail('Cette page doit être ouverte depuis Telegram.');return;}
 try{tg.ready();tg.expand();tg.disableVerticalSwipes?.();}catch{}
 const initData=tg.initData;
 if(!initData){fail('Telegram n’a fourni aucune donnée d’authentification. Ouvre la Mini App depuis le bot.');return;}
 try{
   const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData}),cache:'no-store'});
   const data=await r.json().catch(()=>null);
   if(!r.ok||!data?.ok)throw new Error(data?.error||`HTTP ${r.status}`);
   const p=data.player;
   $('statusCard').hidden=true;
   $('profile').hidden=false;
   $('name').textContent=[p.first_name,p.last_name].filter(Boolean).join(' ')||'Player';
   $('username').textContent=p.username?`@${p.username}`:'Telegram user';
   $('balance').textContent=Number(p.balance||0).toLocaleString('en-US');
   if(p.avatar_url){const img=document.createElement('img');img.src=p.avatar_url;img.alt='';$('avatar').replaceChildren(img);}
 }catch(e){fail(e.message==='Failed to fetch'?'Serveur d’authentification inaccessible.':`Échec de l’authentification (${e.message}).`);}
}
start();