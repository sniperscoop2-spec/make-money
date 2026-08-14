const NAV_PAGES=['mining','jobs','realEstate','casino','achievements','ranking'];
const PAGE_TITLES={mining:'⛏️ Mining',jobs:'💼 Jobs',realEstate:'🏢 Real Estate',casino:'🎰 Casino',achievements:'🏅 Achievements',ranking:'🏆 World Ranking'};
let navCurrent='home';
let navBound=false;

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

  // Exactly one page is visible. Home/profile never coexist with a category.
  navDisplay(document.getElementById('statusCard'),!authenticated);
  navDisplay(document.getElementById('profile'),valid==='home'&&authenticated);
  navDisplay(document.getElementById('homeMenu'),valid==='home'&&authenticated);
  navDisplay(document.getElementById('backHome'),valid!=='home'&&authenticated);
  document.querySelectorAll('.page-section').forEach(section=>{
    navDisplay(section,authenticated&&valid===section.id);
  });

  const title=document.getElementById('pageTitle');
  if(title)title.textContent=valid==='home'?'MAKE MONEY':PAGE_TITLES[valid];
  window.scrollTo(0,0);

  if(!authenticated)return;
  if(valid==='jobs'&&typeof window.mmLoadJobs==='function')window.mmLoadJobs();
  if(valid==='ranking'&&typeof window.mmLoadRanking==='function')window.mmLoadRanking();
  if(valid==='realEstate'&&typeof window.mmLoadRealEstate==='function')window.mmLoadRealEstate();
  if(valid==='achievements'&&typeof window.mmLoadAchievements==='function')window.mmLoadAchievements();
}

function navBindButtons(){
  if(navBound)return;
  navBound=true;
  const buttons=document.querySelectorAll('#homeMenu .menu-button[data-page]');
  buttons.forEach(button=>{
    button.addEventListener('click',function(event){
      event.preventDefault();
      event.stopPropagation();
      navSetPage(this.dataset.page);
    });
  });
  const back=document.getElementById('backHome');
  if(back){
    back.addEventListener('click',function(event){
      event.preventDefault();
      event.stopPropagation();
      navSetPage('home');
    });
  }
}

function navInit(){
  navBindButtons();
  navSetPage(Boolean(window.mmSessionToken)?'home':'home');
}

// Auth happens after this script loads, so bind/refresh again after authentication.
window.addEventListener('make-money-authenticated',()=>{
  navBindButtons();
  navSetPage('home');
});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',navInit,{once:true});
else navInit();

window.mmNavigate=navSetPage;
