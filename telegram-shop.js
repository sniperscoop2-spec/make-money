const SHOP_API='https://klvpeopoziausjvefaek.supabase.co/functions/v1/make-money-shop';
let shopOffers=[],shopBoost=null,shopBusy=false,shopLoaded=false;
const shopFmt=v=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:2});
function shopSetBalance(value){const n=Number(value||0);window.mmBalance=n;const bal=document.getElementById('balance');if(bal)bal.textContent=shopFmt(n);const hb=document.getElementById('headerBalance');if(hb)hb.textContent=`${shopFmt(n)} MM`;window.dispatchEvent(new CustomEvent('make-money-balance-updated',{detail:{balance:n}}));}
async function shopJson(body){if(!window.mmSessionToken)throw new Error('UNAUTHORIZED');const r=await fetch(SHOP_API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${window.mmSessionToken}`},body:JSON.stringify(body),cache:'no-store'});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(d?.error||`HTTP ${r.status}`);return d;}
function shopSetStatus(text,kind){const el=document.getElementById('shopStatus');if(!el)return;if(!text){el.hidden=true;el.textContent='';el.className='shop-status';return;}el.hidden=false;el.textContent=text;el.className=`shop-status${kind?` ${kind}`:''}`;}
function shopRenderBoost(){const el=document.getElementById('shopBoostStatus');if(!el)return;if(shopBoost?.active){const until=shopBoost.expires_at?new Date(shopBoost.expires_at):null;el.textContent=`Mining x${shopFmt(shopBoost.mining_multiplier)} active${until?` until ${until.toLocaleString()}`:''}.`;}else{el.textContent='Boost your mining or top up instantly with Telegram Stars.';}}
function shopRenderOffers(){const list=document.getElementById('shopOffers');if(!list)return;list.replaceChildren();for(const o of shopOffers){const card=document.createElement('div');card.className='shop-offer';const head=document.createElement('div');head.className='shop-offer-head';const title=document.createElement('strong');title.textContent=o.title;const price=document.createElement('span');price.className='shop-offer-price';price.textContent=`${o.stars_price} ⭐`;head.append(title,price);const desc=document.createElement('p');desc.textContent=o.description;const btn=document.createElement('button');btn.type='button';btn.textContent='Buy';btn.addEventListener('click',()=>shopBuy(o.offer_id,btn));card.append(head,desc,btn);list.append(card);}}
async function shopLoad(){shopSetStatus('');try{const d=await shopJson({action:'list'});shopOffers=Array.isArray(d.offers)?d.offers:[];shopBoost=d.boost||null;shopLoaded=true;shopRenderOffers();shopRenderBoost();}catch(e){shopSetStatus(`Could not load the shop (${e.message}).`,'error');}}
function shopBuy(offerId,btn){if(shopBusy)return;shopBusy=true;const buttons=document.querySelectorAll('#shopOffers button');buttons.forEach(b=>b.disabled=true);shopSetStatus('Creating your order...');
  shopJson({action:'create_invoice',offer_id:offerId}).then(d=>{
    const tg=window.Telegram?.WebApp;
    if(typeof tg?.openInvoice!=='function'){shopSetStatus('Open this app inside Telegram to pay with Stars.','error');return;}
    tg.openInvoice(d.invoice_link,status=>{
      if(status==='paid'){
        shopSetStatus('Purchase confirmed! Updating your balance...','success');
        shopRefreshAfterPurchase();
      }else if(status==='cancelled'){
        shopSetStatus('');
      }else{
        shopSetStatus(`Payment ${status}.`,'error');
      }
    });
  }).catch(e=>{shopSetStatus(`Could not start checkout (${e.message}).`,'error');}).finally(()=>{shopBusy=false;buttons.forEach(b=>b.disabled=false);});
}
async function shopRefreshAfterPurchase(){
  try{
    const r=await fetch('https://klvpeopoziausjvefaek.supabase.co/functions/v1/make-money-balance',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${window.mmSessionToken}`},cache:'no-store'});
    const d=await r.json().catch(()=>null);
    if(r.ok&&d?.ok)shopSetBalance(d.balance);
  }catch{}
  try{const d=await shopJson({action:'list'});shopOffers=Array.isArray(d.offers)?d.offers:[];shopBoost=d.boost||null;shopRenderOffers();shopRenderBoost();}catch{}
  if(typeof window.mmLoadHome==='function')window.mmLoadHome();
  if(typeof window.mmRefreshMining==='function')window.mmRefreshMining();
}
function shopOpen(){const sheet=document.getElementById('shopSheet');if(!sheet)return;sheet.hidden=false;if(!shopLoaded)shopLoad();else{shopRenderOffers();shopRenderBoost();}}
function shopClose(){const sheet=document.getElementById('shopSheet');if(sheet)sheet.hidden=true;}
function shopBind(){document.getElementById('homeShopButton')?.addEventListener('click',shopOpen);document.getElementById('shopClose')?.addEventListener('click',shopClose);document.getElementById('shopSheet')?.addEventListener('click',e=>{if(e.target.id==='shopSheet')shopClose();});window.addEventListener('make-money-authenticated',()=>{shopLoaded=false;});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',shopBind,{once:true});else shopBind();
