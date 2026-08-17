const MM_BALANCE_ANIMATION_MS=3000;
let mmBalanceAnimationTimer=null;
let mmLastAnimatedBalance=Number(window.mmBalance||0);

function mmInstallBalanceAnimationStyle(){
  if(document.getElementById('mmBalanceAnimationStyle'))return;
  const style=document.createElement('style');
  style.id='mmBalanceAnimationStyle';
  style.textContent=`
    .mm-balance-value{transition:color .25s ease,transform .25s ease,text-shadow .25s ease;}
    .mm-balance-value.mm-balance-up{color:#63e69a!important;text-shadow:0 0 14px rgba(99,230,154,.45);animation:mmBalanceUp .55s ease-out;}
    .mm-balance-value.mm-balance-down{color:#ff6b6b!important;text-shadow:0 0 14px rgba(255,107,107,.42);animation:mmBalanceDown .55s ease-out;}
    @keyframes mmBalanceUp{0%{transform:scale(1)}45%{transform:scale(1.08)}100%{transform:scale(1)}}
    @keyframes mmBalanceDown{0%{transform:scale(1)}35%{transform:scale(.94)}65%{transform:scale(1.03)}100%{transform:scale(1)}}
  `;
  document.head.appendChild(style);
}

function mmAnimateBalance(next){
  const previous=mmLastAnimatedBalance;
  mmLastAnimatedBalance=next;
  if(Math.abs(next-previous)<=1e-9)return;
  const direction=next>previous?'up':'down';
  const elements=[
    document.getElementById('balance'),
    document.getElementById('headerBalance'),
    document.getElementById('profileBalance')
  ].filter(Boolean);
  if(!elements.length)return;
  mmInstallBalanceAnimationStyle();
  if(mmBalanceAnimationTimer)clearTimeout(mmBalanceAnimationTimer);
  for(const element of elements){
    element.classList.remove('mm-balance-up','mm-balance-down','mm-balance-value');
    void element.offsetWidth;
    element.classList.add('mm-balance-value',direction==='up'?'mm-balance-up':'mm-balance-down');
  }
  mmBalanceAnimationTimer=setTimeout(()=>{
    for(const element of elements)element.classList.remove('mm-balance-up','mm-balance-down');
    mmBalanceAnimationTimer=null;
  },MM_BALANCE_ANIMATION_MS);
}

mmInstallBalanceAnimationStyle();
window.addEventListener('make-money-balance-updated',event=>{
  const next=Number(event?.detail?.balance);
  if(Number.isFinite(next))mmAnimateBalance(next);
});
window.addEventListener('make-money-authenticated',()=>{
  mmLastAnimatedBalance=Number(window.mmBalance||0);
});
