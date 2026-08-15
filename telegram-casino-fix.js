// Roulette interaction hardening for the Telegram Mini App.
// The roulette bet grid is created dynamically after authentication, so direct
// listeners attached before that moment can miss the generated buttons.
(function(){
  let installed=false;

  function install(){
    if(installed)return;
    installed=true;

    // Capture the click before any stale direct listener can run.
    document.addEventListener('click',function(event){
      const button=event.target.closest?.('#rouletteBetChoices [data-choice]');
      if(!button)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const choice=button.dataset.choice;
      if(choice && typeof window.setRouletteChoice==='function'){
        window.setRouletteChoice(choice);
      }
    },true);
  }

  // telegram-casino.js is loaded before this file, but the casino DOM itself
  // can be populated later. Delegation means timing no longer matters.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
