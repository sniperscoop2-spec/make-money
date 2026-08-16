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
  let applied=false;

  function applyInventoryFixes(){
    const status=document.getElementById('inventoryStatus');
    if(status)status.textContent='Secure inventory';

    if(!applied && typeof window.renderCatalog==='function'){
      const originalRenderCatalog=window.renderCatalog;
      window.renderCatalog=function(){
        const result=originalRenderCatalog.apply(this,arguments);
        const root=document.getElementById('catalogList');
        if(root){
          const cards=Array.from(root.children);
          cards.sort((a,b)=>{
            const getPrice=card=>{
              const text=card.querySelector('small')?.textContent||'';
              const match=text.match(/Sell\s+([\d,]+(?:\.\d+)?)\s+MM/i);
              return match?Number(match[1].replace(/,/g,'')):Number.POSITIVE_INFINITY;
            };
            return getPrice(a)-getPrice(b);
          });
          root.append(...cards);
        }
        return result;
      };
      applied=true;
    }
  }

  function run(){
    applyInventoryFixes();
    window.addEventListener('make-money-authenticated',applyInventoryFixes);
    window.addEventListener('make-money-inventory-updated',applyInventoryFixes);
    const retry=window.setInterval(()=>{
      applyInventoryFixes();
      if(applied)window.clearInterval(retry);
    },100);
    window.setTimeout(()=>window.clearInterval(retry),5000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();
})();
