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

  // Use ALL matching elements, not only getElementById(). This protects the
  // Mini App if another module ever creates a duplicate menu node.
  document.querySelectorAll('.home-menu').forEach(el=>navDisplay(el,valid==='home'&&authenticated));
  document.querySelectorAll('.profile').forEach(el=>navDisplay(el,valid==='home'&&authenticated));
  navDisplay(document.getElementById('statusCard'),!authenticated);
  navDisplay(document.getElementById('backHome'),valid!=='home'&&authenticated);

  for(const id of NAV_PAGES){
    document.querySelectorAll(`#${id}`).forEach(el=>navDisplay(el,valid===id&&authenticated));
  }

  if(valid!=='home'){
    // Absolute isolation: no Home menu/card can remain in the active category.
    document.querySelectorAll('.home-menu,.profile').forEach(el=>navDisplay(el,false));
    document.querySelectorAll('.page-section').forEach(el=>navDisplay(el,el.id===valid&&authenticated));
  }

  const title=document.getElementById('pageTitle');
  if(title)title.textContent=valid==='home'?'MAKE MONEY':PAGE_TITLES[valid];
  window.scrollTo({top:0,behavior:'auto'});
  if(!authenticated)return;

  if(valid==='jobs'&&typeof window.mmLoadJobs==='function')window.mmLoadJobs();
  if(valid==='ranking'&&typeof window.mmLoadRanking==='function')window.mmLoadRanking();
  if(valid==='realEstate'&&typeof window.mmLoadRealEstate==='function')window.mmLoadRealEstate();
  if(valid==='achievements'&&typeof window.mmLoadAchievements==='function')window.mmLoadAchievements();
}

function navInit(){
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

  // Guard against another script or WebView changing visibility after routing.
  const observer=new MutationObserver(()=>{
    if(navCurrent==='home')return;
    const authenticated=Boolean(window.mmSessionToken);
    if(!authenticated)return;
    document.querySelectorAll('.home-menu,.profile').forEach(el=>navDisplay(el,false));
    document.querySelectorAll('.page-section').forEach(el=>navDisplay(el,el.id===navCurrent));
  });
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','style','class']});

  navSetPage('home');
}

window.addEventListener('make-money-authenticated',()=>navSetPage('home'));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',navInit,{once:true});
else navInit();
