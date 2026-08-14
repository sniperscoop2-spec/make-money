const CASINO_API='https://klvpeopoziausjvefaek.supabase.co/functions/v1/make-money-casino';
let casinoBusy=false;
let casinoBet=10;
let casinoChoice='red';
const casinoOriginalFetch=window.fetch.bind(window);
function casinoSessionValid(){return Boolean(window.mmSessionToken&&Date.now()<Number(window.mmSessionExpiresAt||0));}
function casinoFormat(value){return Number(value||0).toLocaleString('en-US',{maximumFractionDigits:4});}
function casinoOperationKey(){if(window.crypto?.randomUUID)return window.crypto.randomUUID().replace(/-/g,'');const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');}
async function casinoFetch(body){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);try{return await casinoOriginalFetch(CASINO_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${window.mmSessionToken}`},body:JSON.stringify(body),cache:'no-store',signal:controller.signal});}finally{clearTimeout(timer);}}
function renderCasino(){const bets=document.querySelectorAll('#casinoBets [data-bet]');const choices=document.querySelectorAll('#casinoChoices [data-choice]');bets.forEach(button=>{button.disabled=casinoBusy||!casinoSessionValid()||Number(window.mmBalance||0)<Number(button.dataset.bet||0);button.classList.toggle('selected',Number(button.dataset.bet||0)===casinoBet);});choices.forEach(button=>{button.disabled=casinoBusy||!casinoSessionValid()||Number(window.mmBalance||0)<casinoBet;button.classList.toggle('selected',button.dataset.choice===casinoChoice);});}
function setCasinoStatus(message){const el=document.getElementById('casinoStatus');if(el)el.textContent=message;}
async function loadCasinoStatus(){if(!casinoSessionValid())return;try{const response=await casinoFetch({action:'status'});const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(data?.error||`HTTP ${response.status}`);const balance=Number(data.balance||0);window.mmBalance=balance;const balanceEl=document.getElementById('balance');if(balanceEl)balanceEl.textContent=casinoFormat(balance);const wagered=Number(data.wagered_today||0),limit=Number(data.daily_wager_limit||1000);const wageredEl=document.getElementById('casinoWagered');if(wageredEl)wageredEl.textContent=`${casinoFormat(wagered)} / ${casinoFormat(limit)} MM`;renderCasino();}catch(error){if(error.name!=='AbortError')setCasinoStatus('Casino status unavailable.');}}
async function playCasinoRoulette(){
  if(casinoBusy||!casinoSessionValid())return;
  if(!Number.isInteger(casinoBet)||casinoBet<10||casinoBet>100)return;
  if(casinoChoice!=='red'&&casinoChoice!=='black')return;
  if(Number(window.mmBalance||0)<casinoBet){setCasinoStatus('Not enough MM for this bet.');return;}
  casinoBusy=true;renderCasino();setCasinoStatus(`Roulette: ${casinoBet} MM on ${casinoChoice}...`);
  try{
    const response=await casinoFetch({action:'roulette',bet:casinoBet,choice:casinoChoice,operation_key:casinoOperationKey()});
    const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(data?.error||`HTTP ${response.status}`);
    const balance=Number(data.balance||0);window.mmBalance=balance;const balanceEl=document.getElementById('balance');if(balanceEl)balanceEl.textContent=casinoFormat(balance);window.dispatchEvent(new CustomEvent('make-money-balance-updated',{detail:{balance}}));
    const wagered=Number(data.wagered_today||0),limit=Number(data.daily_wager_limit||1000);const wageredEl=document.getElementById('casinoWagered');if(wageredEl)wageredEl.textContent=`${casinoFormat(wagered)} / ${casinoFormat(limit)} MM`;
    const color=data.result_color||'green';const number=Number(data.result_number||0);
    if(data.won)setCasinoStatus(`🎉 ${number} ${color} — +${casinoFormat(data.net_change)} MM. Balance: ${casinoFormat(balance)} MM.`);else setCasinoStatus(`🎲 ${number} ${color} — -${casinoFormat(casinoBet)} MM. Balance: ${casinoFormat(balance)} MM.`);
  }catch(error){const messages={INSUFFICIENT_BALANCE:'Not enough MM for this bet.',DAILY_WAGER_LIMIT_REACHED:'Daily casino wager limit reached.',SESSION_EXPIRED:'Session expired. Reopen the Mini App.',INVALID_BET:'Invalid bet.',INVALID_CHOICE:'Invalid roulette choice.',INVALID_OPERATION_KEY:'Invalid operation key.'};setCasinoStatus(error.name==='AbortError'?'Casino request timed out. Try again.':messages[error.message]||`Casino unavailable (${error.message}).`);}finally{casinoBusy=false;renderCasino();}
}
function bindCasino(){document.querySelectorAll('#casinoBets [data-bet]').forEach(button=>button.addEventListener('click',()=>{casinoBet=Number(button.dataset.bet);renderCasino();}));document.querySelectorAll('#casinoChoices [data-choice]').forEach(button=>button.addEventListener('click',()=>{casinoChoice=button.dataset.choice;playCasinoRoulette();}));renderCasino();}
window.addEventListener('make-money-authenticated',()=>{renderCasino();loadCasinoStatus();});
window.addEventListener('make-money-balance-updated',()=>renderCasino());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindCasino);else bindCasino();
