// Casino interaction hardening and custom bet input support.
(function(){
  let installed=false;

  function install(){
    if(installed)return;
    installed=true;

    function installCustomBetInputs(){
      document.querySelectorAll('.casino-bets').forEach(group=>{
        const old=group.querySelector('button[data-bet="100"]');
        if(old){
          const input=document.createElement('input');
          input.type='number';
          input.min='10';
          input.removeAttribute('max');
          input.step='1';
          input.inputMode='numeric';
          input.placeholder='Custom MM (10+)';
          input.className='casino-custom-bet';
          input.setAttribute('aria-label','Custom bet amount in MM, minimum 10, limited only by balance');
          input.dataset.customBet='true';
          old.replaceWith(input);
        }
      });
      document.querySelectorAll('.casino-custom-bet').forEach(input=>{
        if(input.dataset.bound==='true')return;
        input.dataset.bound='true';
        const accept=value=>{
          if(typeof window.setCasinoBet!=='function')return;
          if(Number.isSafeInteger(value)&&value>=10&&value<=Number.MAX_SAFE_INTEGER&&value<=Number(window.mmBalance||0)){
            window.setCasinoBet(value);
          }
        };
        input.addEventListener('input',()=>{
          input.value=input.value.replace(/[^0-9]/g,'');
          const value=Number(input.value);
          accept(value);
        });
        input.addEventListener('change',()=>accept(Number(input.value)));
        input.addEventListener('keydown',event=>{
          if(event.key==='Enter'){
            event.preventDefault();
            accept(Number(input.value));
            input.blur();
          }
        });
      });
    }

    installCustomBetInputs();

    document.addEventListener('click',function(event){
      const button=event.target.closest?.('#rouletteBetChoices [data-choice]');
      if(!button)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const choice=button.dataset.choice;
      if(choice && typeof window.setRouletteChoice==='function')window.setRouletteChoice(choice);
    },true);

    window.addEventListener('make-money-authenticated',installCustomBetInputs);
    window.addEventListener('make-money-balance-updated',installCustomBetInputs);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();

/* Inventory UI fixes: secure loading label + catalog sorted by ascending sell value. */
(function(){
  const installInventoryFix=()=>{
    const status=document.getElementById('inventoryStatus');
    if(status)status.textContent='Secure inventory';

    if(typeof window.renderCatalog==='function' && !window.__mmCatalogSorted){
      const originalRenderCatalog=window.renderCatalog;
      window.renderCatalog=function(){
        if(Array.isArray(window.caseCatalog)){
          window.caseCatalog.sort((a,b)=>Number(a?.sell_value||0)-Number(b?.sell_value||0));
        }
        return originalRenderCatalog();
      };
      window.__mmCatalogSorted=true;
    }
  };

  const run=()=>{
    installInventoryFix();
    const observer=new MutationObserver(installInventoryFix);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('make-money-authenticated',installInventoryFix);
    window.addEventListener('make-money-inventory-updated',installInventoryFix);
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();
})();
