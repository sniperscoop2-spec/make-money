const NAV_PAGES=['mining','jobs','realEstate','casino','achievements','ranking'];
let navCurrent='home';
function navSetPage(page){
  const valid=page==='home'||NAV_PAGES.includes(page)?page:'home';
  navCurrent=valid;
  const authenticated=Boolean(window.mmSessionToken);
  const home=document.getElementById('homeMenu');
  const profile=document.getElementById('profile');
  if(home)home.hidden=valid!=='home'||!authenticated;
  if(profile)profile.hidden=valid!=='home'||!authenticated;
  for(const id of NAV_PAGES){const el=document.getElementById(id);if(el)el.hidden=valid!==id;}
  const title=document.getElementById('pageTitle');
  if(title)title.textContent=valid==='home'?'MAKE MONEY':({mining:'⛏️ Mining',jobs:'💼 Jobs',realEstate:'🏢 Real Estate',casino:'🎰 Casino',achievements:'🏅 Achievements',ranking:'🏆 World Ranking'})[valid];
  const back=document.getElementById('backHome');
  if(back)back.hidden=valid==='home'||!authenticated;
  window.scrollTo({top:0,behavior:'auto'});
  if(!authenticated)return;
  if(valid==='jobs'&&typeof window.mmLoadJobs==='function')window.mmLoadJobs();
  if(valid==='ranking'&&typeof window.mmLoadRanking==='function')window.mmLoadRanking();
  if(valid==='realEstate'&&typeof window.mmLoadRealEstate==='function')window.mmLoadRealEstate();
  if(valid==='achievements'&&typeof window.mmLoadAchievements==='function')window.mmLoadAchievements();
}
function navInit(){
  document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>navSetPage(button.dataset.page)));
  const back=document.getElementById('backHome');
  if(back)back.addEventListener('click',()=>navSetPage('home'));
  navSetPage('home');
}
window.addEventListener('make-money-authenticated',()=>navSetPage('home'));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',navInit);else navInit();
