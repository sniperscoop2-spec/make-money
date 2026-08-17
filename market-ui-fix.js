(function(){
  'use strict';
  const ID='marketQuickHoldings';
  const STYLE='marketQuickHoldingsStyle';
  const money=v=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:4});

  function getAssets(){
    try{return Array.isArray(MARKET_ASSETS)?MARKET_ASSETS:[];}catch(e){return [];}
  }
  function getMarket(){
    try{return state&&state.market?state.market:null;}catch(e){return null;}
  }
  function installStyle(){
    if(document.getElementById(STYLE))return;
    const s=document.createElement('style');s.id=STYLE;
    s.textContent=`#${ID}{margin:12px 0 14px;padding:14px;border:1px solid #263142;border-radius:18px;background:#0b111a}#${ID}[hidden]{display:none!important}.mqh-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.mqh-head strong{font-size:16px;color:#f4f7fb}.mqh-head small{font-size:12px;color:#9aa7ba}.mqh-list{display:grid;gap:8px}.mqh-row{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #263142;border-radius:14px;background:#121a26}.mqh-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:11px;background:#1a2637;font-size:20px;flex:0 0 auto}.mqh-info{min-width:0;flex:1}.mqh-info strong{display:block;color:#f4f7fb;font-size:14px}.mqh-info small{display:block;color:#9aa7ba;font-size:11px;margin-top:3px}.mqh-value{text-align:right;white-space:nowrap}.mqh-value strong{display:block;color:#f4f7fb;font-size:13px}.mqh-value small{display:block;color:#9aa7ba;font-size:10px;margin-top:3px}.mqh-sell{border:0;border-radius:10px;background:#63e69a;color:#06110b;font:inherit;font-weight:900;padding:9px 12px;cursor:pointer;white-space:nowrap}.mqh-sell:disabled{opacity:.55;cursor:default}`;
    document.head.appendChild(s);
  }
  function render(){
    const screen=document.getElementById('marketScreen');
    const summary=screen?.querySelector('.market-summary');
    if(!screen||!summary)return;
    installStyle();
    let panel=document.getElementById(ID);
    if(!panel){
      panel=document.createElement('section');
      panel.id=ID;
      summary.insertAdjacentElement('afterend',panel);
    }
    const market=getMarket();
    const assets=getAssets();
    if(!market||!assets.length){panel.hidden=true;return;}

    const owned=assets.filter(a=>Number(market.holdings?.[a.symbol]||0)>0);
    if(!owned.length){panel.hidden=true;panel.replaceChildren();return;}

    panel.hidden=false;
    panel.innerHTML='<div class="mqh-head"><strong>Your Crypto</strong><small>Quick sell</small></div><div class="mqh-list"></div>';
    const list=panel.querySelector('.mqh-list');

    for(const a of owned){
      const qty=Number(market.holdings?.[a.symbol]||0);
      const price=Number(market.prices?.[a.symbol]||a.base||0);
      const value=qty*price;
      const row=document.createElement('div');
      row.className='mqh-row';
      row.innerHTML=`<span class="mqh-icon">${a.icon||'🪙'}</span><span class="mqh-info"><strong>${a.name}</strong><small>${a.symbol} · ${money(qty)} owned</small></span><span class="mqh-value"><strong>${money(value)} MM</strong><small>current value</small></span>`;

      const btn=document.createElement('button');
      btn.type='button';
      btn.className='mqh-sell';
      btn.textContent='Sell All';
      btn.addEventListener('click',()=>{
        try{
          const input=document.getElementById('marketAmountInput');
          if(!input||typeof marketSell!=='function')return;
          state.market.selected=a.symbol;
          const latestQty=Number(state.market.holdings?.[a.symbol]||0);
          const latestPrice=Number(state.market.prices?.[a.symbol]||a.base||0);
          input.value=String(Math.floor(latestQty*latestPrice));
          marketSell();
          setTimeout(render,100);
        }catch(e){console.error('Quick sell error:',e);}
      });
      row.append(btn);
      list.append(row);
    }
  }

  function formatRankingBalances(){
    const list=document.getElementById('rankingList');
    if(!list)return;
    list.querySelectorAll('.rank-row .coins').forEach(el=>{
      const raw=String(el.textContent||'').trim();
      const numeric=Number(raw.replace(/,/g,''));
      if(!Number.isFinite(numeric))return;
      const formatted=numeric.toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1});
      if(raw!==formatted)el.textContent=formatted;
    });
  }

  function hookRankingFormatting(){
    const list=document.getElementById('rankingList');
    if(!list||list.dataset.balanceFormatObserver==='1')return;
    list.dataset.balanceFormatObserver='1';
    const observer=new MutationObserver(()=>formatRankingBalances());
    observer.observe(list,{childList:true,subtree:true,characterData:true});
    formatRankingBalances();
  }

  // Jobs are paid from elapsed time. This override deliberately removes the
  // daily ceiling while keeping the existing hourly earning rate unchanged.
  function installUnlimitedSalary(){
    if(typeof window.processJobPay!=='function'||window.processJobPay.__unlimitedSalary)return;
    const unlimitedSalaryPay=function(){
      try{
        if(typeof resetJobDay==='function')resetJobDay();
        if(!state?.job)return false;
        const job=typeof getJob==='function'?getJob(state.job):null;
        if(!job||typeof jobCanWork==='function'&&!jobCanWork(job))return false;
        const now=Date.now();
        const minutes=Math.floor(Math.max(0,now-Number(state.lastJobPay||now))/60000);
        if(minutes<=0)return false;
        state.lastJobPay=Number(state.lastJobPay||now)+minutes*60000;
        state.jobRemainder=Number(state.jobRemainder||0)+minutes*jobMinuteRate(job);
        const pay=Math.floor(state.jobRemainder);
        if(pay<=0)return false;
        state.jobRemainder-=pay;
        state.jobToday=Number(state.jobToday||0)+pay;
        state.balance=Number(state.balance||0)+pay;
        return true;
      }catch(e){
        console.error('Unlimited salary error:',e);
        return false;
      }
    };
    unlimitedSalaryPay.__unlimitedSalary=true;
    window.processJobPay=unlimitedSalaryPay;

    if(typeof window.renderJobs==='function'&&!window.renderJobs.__unlimitedSalaryUI){
      const originalRenderJobs=window.renderJobs;
      const unlimitedRenderJobs=function(){
        originalRenderJobs();
        try{
          const active=state?.job&&typeof getJob==='function'?getJob(state.job):null;
          const next=document.getElementById('jobNextPay');
          const today=document.getElementById('jobEarnedToday');
          const pay=document.getElementById('activeJobPay');
          if(active){
            if(next)next.textContent='Next salary check in 1 min';
            if(today)today.textContent=`${Number(state.jobToday||0).toLocaleString('en-US')} earned today`;
            if(pay)pay.textContent=`${jobMinuteRate(active).toFixed(2)} coins / min · Unlimited salary`;
          }
          document.querySelectorAll('#jobsList .job-main small').forEach(el=>{
            const text=String(el.textContent||'');
            const match=text.match(/([\d,.]+)\s*coins\/day/);
            if(match)el.textContent=`${jobMinuteRate(active||getJob(el.closest('[data-job]')?.dataset.job)).toFixed(2)} coins / min · Unlimited`;
          });
          document.querySelectorAll('#trainingList .training-main small').forEach(el=>{
            el.textContent=String(el.textContent||'').replace(/\s*·\s*[\d,.]+\s*coins\/day\s*$/,' · Unlimited salary');
          });
        }catch(e){console.warn('Unlimited salary UI update failed:',e);}
      };
      unlimitedRenderJobs.__unlimitedSalaryUI=true;
      window.renderJobs=unlimitedRenderJobs;
    }
  }

  function hook(){
    installStyle();
    render();
    hookRankingFormatting();
    installUnlimitedSalary();
    setInterval(()=>{
      if(document.getElementById('marketScreen')?.classList.contains('active'))render();
      formatRankingBalances();
      installUnlimitedSalary();
      if(document.getElementById('jobsScreen')?.classList.contains('active')&&typeof renderJobs==='function'){
        // Keep the visible salary state consistent without changing the earning logic.
        try{renderJobs();}catch(e){console.warn('Jobs refresh failed:',e);}
      }
    },1000);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>setTimeout(hook,500),{once:true});
  }else{
    setTimeout(hook,500);
  }
})();
