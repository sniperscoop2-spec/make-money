/* Keep the displayed balance unchanged while roulette is resolving. */
(function installRouletteBalanceGuard(){
  if(window.__mmRouletteBalanceGuardInstalled)return;
  window.__mmRouletteBalanceGuardInstalled=true;
  let watcher=null;
  function releaseWhenFinished(button){
    if(watcher)clearInterval(watcher);
    watcher=setInterval(()=>{
      if(!button.disabled){
        clearInterval(watcher);
        watcher=null;
        window.mmBalanceRealtimePaused=false;
        if(typeof window.mmRefreshBalance==='function')window.mmRefreshBalance();
      }
    },50);
    setTimeout(()=>{
      if(watcher){clearInterval(watcher);watcher=null;window.mmBalanceRealtimePaused=false;if(typeof window.mmRefreshBalance==='function')window.mmRefreshBalance();}
    },16000);
  }
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('#rouletteSpin');
    if(!button||button.disabled)return;
    window.mmBalanceRealtimePaused=true;
    releaseWhenFinished(button);
  },true);
})();
