const CASINO_API='https://klvpeopoziausjvefaek.supabase.co/functions/v1/make-money-casino';
let casinoBusy=false,casinoBet=10,casinoChoice='red',casinoGame='roulette',blackjackRoundId=null,blackjackActive=false;
let rouletteAnimationFrame=null;
const casinoOriginalFetch=window.fetch.bind(window);
function casinoSessionValid(){return Boolean(window.mmSessionToken&&Date.now()<Number(window.mmSessionExpiresAt||0));}
function casinoFormat(value){return Number(value||0).toLocaleString('en-US',{maximumFractionDigits:4});}
function casinoOperationKey(){if(window.crypto?.randomUUID)return window.crypto.randomUUID().replace(/-/g,'');const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');}
async function casinoFetch(body){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);try{return await casinoOriginalFetch(CASINO_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${window.mmSessionToken}`},body:JSON.stringify(body),cache:'no-store',signal:controller.signal});}finally{clearTimeout(timer);}}
function setCasinoStatus(message){const el=document.getElementById('casinoStatus');if(el)el.textContent=message;}
function setBalanceFromCasino(value){const balance=Number(value||0);window.mmBalance=balance;const el=document.getElementById('balance');if(el)el.textContent=casinoFormat(balance);const hb=document.getElementById('headerBalance');if(hb)hb.textContent=`${casinoFormat(balance)} MM`;window.dispatchEvent(new CustomEvent('make-money-balance-updated',{detail:{balance}}));}
function updateWagered(value,limit=1000){const el=document.getElementById('casinoWagered');if(el)el.textContent=`${casinoFormat(value)} / ${casinoFormat(limit)} MM`;}
function casinoError(error,game){const m={INSUFFICIENT_BALANCE:'Not enough MM for this bet.',DAILY_WAGER_LIMIT_REACHED:'Daily casino wager limit reached.',SESSION_EXPIRED:'Session expired. Reopen the Mini App.',INVALID_BET:'Invalid bet.',INVALID_CHOICE:'Invalid roulette bet.',BLACKJACK_ROUND_FINISHED:'This blackjack round is already finished.',BLACKJACK_ROUND_NOT_FOUND:'Blackjack round not found.',PLAYER_NOT_FOUND:'Player account not found.',CASINO_SERVER_ERROR:`${game} server error.`,INVALID_OPERATION_KEY:'Invalid operation. Please retry.'};return error?.name==='AbortError'?'Casino request timed out.':m[error?.message]||`${game} unavailable (${error?.message||'unknown error'}).`;}
function renderCasino(){
 document.querySelectorAll('.casino-tab').forEach(b=>b.classList.toggle('active',b.dataset.game===casinoGame));
 document.querySelectorAll('.casino-game').forEach(g=>g.classList.toggle('active',g.id===`casino${casinoGame[0].toUpperCase()+casinoGame.slice(1)}`));
 document.querySelectorAll('.casino-bets [data-bet]').forEach(b=>{const selected=Number(b.dataset.bet)===casinoBet;b.classList.toggle('selected',selected);b.disabled=casinoBusy||!casinoSessionValid()||Number(window.mmBalance||0)<Number(b.dataset.bet);});
 document.querySelectorAll('#casinoRoulette [data-choice]').forEach(b=>{b.classList.toggle('selected',b.dataset.choice===casinoChoice);b.disabled=casinoBusy||!casinoSessionValid();});
 const rouletteSpin=document.getElementById('rouletteSpin');if(rouletteSpin)rouletteSpin.disabled=casinoBusy||!casinoSessionValid()||Number(window.mmBalance||0)<casinoBet;
 const start=document.getElementById('blackjackStart');if(start)start.disabled=casinoBusy||blackjackActive||!casinoSessionValid()||Number(window.mmBalance||0)<casinoBet;
 const actions=document.getElementById('blackjackActions');if(actions)actions.hidden=!blackjackActive;
 const hit=document.getElementById('blackjackHit'),stand=document.getElementById('blackjackStand');if(hit)hit.disabled=casinoBusy||!blackjackActive;if(stand)stand.disabled=casinoBusy||!blackjackActive;
 const spin=document.getElementById('slotsSpin');if(spin)spin.disabled=casinoBusy||!casinoSessionValid()||Number(window.mmBalance||0)<casinoBet;
}
function showGame(game){if(casinoBusy)return;casinoGame=game;renderCasino();}
function cardNode(card,hidden=false){const el=document.createElement('div');el.className=`bj-card${hidden?' hidden-card':''}`;if(hidden){el.textContent='🂠';return el;}const red=card.suit==='♥'||card.suit==='♦';el.innerHTML=`<span class="bj-rank ${red?'red':''}">${card.rank}</span><span class="bj-suit ${red?'red':''}">${card.suit}</span>`;return el;}
function renderBlackjack(data,revealDealer=false){const dealer=document.getElementById('bjDealerCards'),player=document.getElementById('bjPlayerCards');if(!dealer||!player)return;dealer.replaceChildren();player.replaceChildren();(data.dealer_cards||[]).forEach((c,i)=>dealer.append(cardNode(c,!revealDealer&&i>0)));(data.player_cards||[]).forEach(c=>player.append(cardNode(c,false)));const pv=document.getElementById('bjPlayerValue'),dv=document.getElementById('bjDealerValue');if(pv)pv.textContent=data.player_value??'—';if(dv)dv.textContent=revealDealer?(data.dealer_value??'—'):'?';requestAnimationFrame(()=>document.querySelectorAll('.bj-card').forEach((c,i)=>setTimeout(()=>c.classList.add('dealt'),i*70)));}
function blackjackMessage(status,payout){const map={active:'Your move.',blackjack:'🃏 BLACKJACK! +3:2',won:'🎉 You win!',lost:'💥 Dealer wins.',push:'🤝 Push — your bet is returned.'};return map[status]||`Result: ${status}${payout?` · +${casinoFormat(payout)} MM`:''}`;}
async function loadCasinoStatus(){if(!casinoSessionValid())return;try{const response=await casinoFetch({action:'status'});const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(data?.error||`HTTP ${response.status}`);setBalanceFromCasino(data.balance);updateWagered(data.wagered_today,data.daily_wager_limit);const active=data.active_blackjack;blackjackRoundId=active?.round_id||null;blackjackActive=Boolean(active);if(active){renderBlackjack(active,false);const s=document.getElementById('blackjackStatus');if(s)s.textContent='♠️ Resumed blackjack round — choose Hit or Stand.';}renderCasino();}catch(error){setCasinoStatus(casinoError(error,'Casino'));}}
function stopRouletteAnimation(){if(rouletteAnimationFrame!==null){cancelAnimationFrame(rouletteAnimationFrame);rouletteAnimationFrame=null;}}
function animateRouletteWheel(wheel,ball,duration=5000){
 stopRouletteAnimation();
 const start=performance.now();
 const firstPhase=3000;
 const firstAngle=1440;
 const tick=now=>{
   const elapsed=Math.min(duration,now-start);
   let angle;
   if(elapsed<=firstPhase){angle=firstAngle*(elapsed/firstPhase);}
   else{const t=(elapsed-firstPhase)/1000;angle=firstAngle+(480*t-120*t*t);}
   wheel.style.transform=`translate3d(0,0,0) rotate(${angle}deg)`;
   if(ball){const orbit=-angle*1.9;ball.style.transform=`translate(-50%,-50%) rotate(${orbit}deg) translateY(-67px)`;}
   if(elapsed<duration){rouletteAnimationFrame=requestAnimationFrame(tick);return;}
   rouletteAnimationFrame=null;
 };
 rouletteAnimationFrame=requestAnimationFrame(tick);
 return new Promise(resolve=>setTimeout(()=>{stopRouletteAnimation();wheel.style.transform='translate3d(0,0,0) rotate(1920deg)';if(ball)ball.style.transform=`translate(-50%,-50%) rotate(${-1920*1.9}deg) translateY(-67px)`;resolve();},duration));
}
async function playCasinoRoulette(){
 if(casinoBusy||!casinoSessionValid())return;
 if(!Number.isInteger(casinoBet)||casinoBet<10||casinoBet>100)return;
 if(!/^(red|black|odd|even|low|high|dozen[1-3]|column[1-3]|number-(?:0|[1-9]|[1-2][0-9]|3[0-6]))$/.test(casinoChoice))return;
 if(Number(window.mmBalance||0)<casinoBet){setCasinoStatus('Not enough MM for this bet.');return;}
 casinoBusy=true;renderCasino();
 const wheel=document.getElementById('rouletteWheel'),ball=document.querySelector('.roulette-ball'),result=document.getElementById('rouletteResult');
 if(result)result.textContent='…';
 const labels={red:'Red',black:'Black',odd:'Odd',even:'Even',low:'1–18',high:'19–36',dozen1:'1st 12',dozen2:'2nd 12',dozen3:'3rd 12',column1:'Column 1',column2:'Column 2',column3:'Column 3'};
 const label=casinoChoice.startsWith('number-')?`Number ${casinoChoice.slice(7)}`:(labels[casinoChoice]||casinoChoice);
 setCasinoStatus(`Roulette: ${casinoBet} MM on ${label} — la roue tourne...`);
 try{
   const request=casinoFetch({action:'roulette',bet:casinoBet,choice:casinoChoice,operation_key:casinoOperationKey()});
   const animation=wheel?animateRouletteWheel(wheel,ball,5000):Promise.resolve();
   const response=await request;const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(data?.error||`HTTP ${response.status}`);
   await animation;
   setBalanceFromCasino(data.balance);updateWagered(data.wagered_today,data.daily_wager_limit);
   if(result){result.textContent=Number(data.result_number);result.className=`roulette-number ${data.result_color}`;}
   if(data.won)setCasinoStatus(`🎉 ${data.result_number} ${data.result_color} — +${casinoFormat(data.net_change)} MM.`);else setCasinoStatus(`🎲 ${data.result_number} ${data.result_color} — -${casinoFormat(casinoBet)} MM.`);
 }catch(error){stopRouletteAnimation();if(wheel)wheel.style.transform='translate3d(0,0,0)';if(ball)ball.style.transform='translate(-50%,-50%) translateY(-67px)';setCasinoStatus(casinoError(error,'Roulette'));}
 finally{casinoBusy=false;renderCasino();}
}
async function startBlackjack(){if(casinoBusy||blackjackActive||!casinoSessionValid())return;if(Number(window.mmBalance||0)<casinoBet){setCasinoStatus('Not enough MM for this bet.');return;}casinoBusy=true;renderCasino();const status=document.getElementById('blackjackStatus');if(status)status.textContent='Dealing cards...';try{const response=await casinoFetch({action:'blackjack_start',bet:casinoBet,operation_key:casinoOperationKey()});const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(data?.error||`HTTP ${response.status}`);setBalanceFromCasino(data.balance);updateWagered(data.wagered_today,data.daily_wager_limit);blackjackRoundId=data.round_id;blackjackActive=data.status==='active';renderBlackjack(data,data.status!=='active');if(status)status.textContent=blackjackMessage(data.status,data.payout);if(data.status!=='active')blackjackRoundId=null;}catch(error){if(status)status.textContent=casinoError(error,'Blackjack');}finally{casinoBusy=false;renderCasino();}}
async function blackjackAction(action){if(casinoBusy||!blackjackActive||!blackjackRoundId)return;casinoBusy=true;renderCasino();const status=document.getElementById('blackjackStatus');if(status)status.textContent=action==='hit'?'Drawing a card...':'Dealer is playing...';try{const response=await casinoFetch({action:'blackjack_action',round_id:blackjackRoundId,blackjack_action:action,operation_key:casinoOperationKey()});const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(data?.error||`HTTP ${response.status}`);setBalanceFromCasino(data.balance);renderBlackjack(data,data.status!=='active');blackjackActive=data.status==='active';if(status)status.textContent=blackjackMessage(data.status,data.payout);if(!blackjackActive)blackjackRoundId=null;}catch(error){if(status)status.textContent=casinoError(error,'Blackjack');}finally{casinoBusy=false;renderCasino();}}
async function spinSlots(){if(casinoBusy||!casinoSessionValid())return;if(Number(window.mmBalance||0)<casinoBet){setCasinoStatus('Not enough MM for this bet.');return;}casinoBusy=true;renderCasino();const status=document.getElementById('slotsStatus'),machine=document.getElementById('slotMachine');if(status)status.textContent='Spinning...';if(machine){machine.classList.remove('slot-spinning','slot-win');void machine.offsetWidth;machine.classList.add('slot-spinning');}try{const response=await casinoFetch({action:'slots',bet:casinoBet,operation_key:casinoOperationKey()});const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(data?.error||`HTTP ${response.status}`);setTimeout(()=>{(data.symbols||[]).forEach((symbol,i)=>{const reel=document.getElementById(`slot${i}`);if(reel)reel.textContent=symbol;});if(machine)machine.classList.remove('slot-spinning');},650);setBalanceFromCasino(data.balance);updateWagered(data.wagered_today,data.daily_wager_limit);const win=Number(data.payout)>0;if(status)status.textContent=win?`🎉 WIN ×${data.multiplier} · +${casinoFormat(data.payout)} MM`:'No match — try again.';if(win&&machine)setTimeout(()=>machine.classList.add('slot-win'),680);}catch(error){if(machine)machine.classList.remove('slot-spinning');if(status)status.textContent=casinoError(error,'Slots');}finally{casinoBusy=false;renderCasino();}}
function bindCasino(){document.querySelectorAll('.casino-tab').forEach(button=>button.addEventListener('click',()=>showGame(button.dataset.game)));document.querySelectorAll('.casino-bets [data-bet]').forEach(button=>button.addEventListener('click',()=>{casinoBet=Number(button.dataset.bet);renderCasino();}));document.querySelectorAll('#casinoRoulette [data-choice]').forEach(button=>button.addEventListener('click',()=>{casinoChoice=button.dataset.choice;renderCasino();}));document.getElementById('rouletteSpin')?.addEventListener('click',playCasinoRoulette);document.getElementById('blackjackStart')?.addEventListener('click',startBlackjack);document.getElementById('blackjackHit')?.addEventListener('click',()=>blackjackAction('hit'));document.getElementById('blackjackStand')?.addEventListener('click',()=>blackjackAction('stand'));document.getElementById('slotsSpin')?.addEventListener('click',spinSlots);renderCasino();}
window.addEventListener('make-money-authenticated',()=>{renderCasino();loadCasinoStatus();});window.addEventListener('make-money-balance-updated',()=>renderCasino());if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindCasino);else bindCasino();