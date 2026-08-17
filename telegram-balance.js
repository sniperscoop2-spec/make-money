const MM_BALANCE_API='https://klvpeopoziausjvefaek.supabase.co/functions/v1/make-money-balance';
let mmBalanceTimer=null,mmBalanceBusy=false;
const mmBalanceFormat=v=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:4});
function mmRenderBalance(value){
  const next=Number(value||0);
  const changed=Math.abs(next-Number(window.mmBalance||0))>1e-9;
  window.mmBalance=next;
  const balance=document.getElementById('balance');
  const header=document.getElementById('headerBalance');
  if(balance)balance.textContent=mmBalanceFormat(next);
  if(header)header.textContent=`${mmBalanceFormat(next)} MM`;
  if(changed)window.dispatchEvent(new CustomEvent('make-money-balance-updated',{detail:{balance:next}}));
}
async function mmRefreshBalance(){
  if(mmBalanceBusy||!window.mmSessionToken)return;
  const expires=Number(window.mmSessionExpiresAt||0);
  if(expires&&Date.now()>=expires){if(mmBalanceTimer){clearInterval(mmBalanceTimer);mmBalanceTimer=null;}return;}
  mmBalanceBusy=true;
  try{
    const r=await fetch(MM_BALANCE_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${window.mmSessionToken}`},cache:'no-store'});
    const d=await r.json().catch(()=>null);
    if(r.ok&&d?.ok)mmRenderBalance(d.balance);
    else if(r.status===401){if(mmBalanceTimer){clearInterval(mmBalanceTimer);mmBalanceTimer=null;}}
  }catch{}
  finally{mmBalanceBusy=false;}
}
function mmStartBalanceRealtime(){
  if(mmBalanceTimer)clearInterval(mmBalanceTimer);
  mmRefreshBalance();
  mmBalanceTimer=setInterval(mmRefreshBalance,2000);
}
window.addEventListener('make-money-authenticated',mmStartBalanceRealtime);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')mmRefreshBalance();});
if(window.mmSessionToken)mmStartBalanceRealtime();
