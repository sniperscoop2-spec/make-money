const NAV_PAGES=['mining','jobs','realEstate','casino','achievements','ranking'];
let navCurrent='home';
const PAGE_TITLES={mining:'⛏️ Mining',jobs:'💼 Jobs',realEstate:'🏢 Real Estate',casino:'🎰 Casino',achievements:'🏅 Achievements',ranking:'🏆 World Ranking'};

function navDisplay(el,visible){
  if(!el)return;
  el.hidden=!visible;
  el.setAttribute('aria-hidden',String(!visible));
  el.style.setProperty('display',visible?'':'none','important');
  el.style.setProperty('visibility',visible?'':'hidden','important');
  el.style.setProperty('pointer-events',visible?'':'none','important');
}

function navSetPage(page){
  const valid=page==='home'||NAV_PAGES.includes(page)?page:'home';
  const authenticated=Boolean(window.mmSessionToken);
  navCurrent=valid;
  document.documentElement.dataset.mmPage=valid;
  document.body.dataset.mmPage=valid;

  const home=document.getElementById('homeMenu');
  const profile=document.getElementById('profile');
  const status=document.getElementById('statusCard');
  const back=document.getElementById('backHome');
  const title=document.getElementById('pageTitle');

  navDisplay(status,!authenticated);
  navDisplay(profile,valid==='home'&&authenticated);
  navDisplay(home,valid==='home'&&authenticated);
  navDisplay(back,valid!=='home'&&authenticated);

  for(const id of NAV_PAGES){
    navDisplay(document.getElementById(id),valid===id&&authenticated);
  }

  if(title)title.textContent=valid==='home'?'MAKE MONEY':PAGE_TITLES[valid];
  window.scrollTo({top:0,behavior:'auto'});
  if(!authenticated)return;

  if(valid==='jobs'&&typeof window.mmLoadJobs==='function')window.mmLoadJobs();
  if(valid==='ranking'&&typeof window.mmLoadRanking==='function')window.mmLoadRanking();
  if(valid==='realEstate'&&typeof window.mmLoadRealEstate==='function')window.mmLoadRealEstate();
  if(valid==='achievements'&&typeof window.mmLoadAchievements==='function')window.mmLoadAchievements();
}

function navInit(){
  // One delegated handler guarantees every home menu button uses the same
  // page-isolation path, even if another script changes the DOM later.
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-page]');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    navSetPage(button.dataset.page);
  },true);

  const back=document.getElementById('backHome');
  if(back)back.addEventListener('click',event=>{
    event.preventDefault();
    event.stopImmediatePropagation();
    navSetPage('home');
  },true);

  navSetPage('home');
}

window.addEventListener('make-money-authenticated',()=>navSetPage('home'));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',navInit,{once:true});
else navInit();
