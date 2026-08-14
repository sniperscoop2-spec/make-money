const NAV_PAGES=['mining','jobs','realEstate','casino','achievements','ranking'];
let navCurrent='home';
const PAGE_TITLES={mining:'⛏️ Mining',jobs:'💼 Jobs',realEstate:'🏢 Real Estate',casino:'🎰 Casino',achievements:'🏅 Achievements',ranking:'🏆 World Ranking'};

function navDisplay(el,visible){
  if(!el)return;
  const hidden=!visible;
  if(el.hidden!==hidden)el.hidden=hidden;
  const aria=String(hidden);
  if(el.getAttribute('aria-hidden')!==aria)el.setAttribute('aria-hidden',aria);
  const display=visible?'':'none';
  if(el.style.getPropertyValue('display')!==display)el.style.setProperty('display',display,'important');
  const visibility=visible?'':'hidden';
  if(el.style.getPropertyValue('visibility')!==visibility)el.style.setProperty('visibility',visibility,'important');
  const pointer=visible?'':'none';
  if(el.style.getPropertyValue('pointer-events')!==pointer)el.style.setProperty('pointer-events',pointer,'important');
}

function navSetPage(page){
  const valid=page==='home'||NAV_PAGES.includes(page)?page:'home';
  const authenticated=Boolean(window.mmSessionToken);
  navCurrent=valid;
  document.documentElement.dataset.mmPage=valid;
  document.body.dataset.mmPage=valid;

  document.querySelectorAll('.home-menu').forEach(el=>navDisplay(el,valid==='home'&&authenticated));
  document.querySelectorAll('.profile').forEach(el=>navDisplay(el,valid==='home'&&authenticated));
  navDisplay(document.getElementById('statusCard'),!authenticated);
  navDisplay(document.getElementById('backHome'),valid!=='home'&&authenticated);

  for(const id of NAV_PAGES){
    document.querySelectorAll(`#${id}`).forEach(el=>navDisplay(el,valid===id&&authenticated));
  }

  // Absolute isolation: only the selected category is allowed to occupy the page.
  document.querySelectorAll('.page-section').forEach(el=>navDisplay(el,valid===el.id&&authenticated));
  if(valid!=='home')document.querySelectorAll('.home-menu,.profile').forEach(el=>navDisplay(el,false));

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

  // If a module injects another menu/page later, enforce the current route.
  const observer=new MutationObserver(mutations=>{
    if(navCurrent==='home'||!window.mmSessionToken)return;
    if(!mutations.some(m=>m.type==='childList'))return;
    navSetPage(navCurrent);
  });
  observer.observe(document.body,{subtree:true,childList:true});

  navSetPage('home');
}

window.addEventListener('make-money-authenticated',()=>navSetPage('home'));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',navInit,{once:true});
else navInit();
