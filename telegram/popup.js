
const SUPABASE_URL="https://klvpeopoziausjvefaek.supabase.co";
const SUPABASE_KEY="sb_publishable_JsfHRYnBwhhJtcHKkHWu0g_il5Yu9Ge";
const AUTH_KEY="cryptoGamesGameSession";
let authSession=null;
let authBusy=false;
let currentProfile=null;

async function rpcDirect(name,args){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),5000);
 try{
   const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`,{
     method:"POST",
     mode:"cors",
     headers:{
       "apikey":SUPABASE_KEY,
       "Authorization":`Bearer ${SUPABASE_KEY}`,
       "Content-Type":"application/json",
       "Accept":"application/json"
     },
     body:JSON.stringify(args||{}),
     cache:"no-store",
     signal:controller.signal
   });
   const text=await res.text();
   let data=null;
   try{data=text?JSON.parse(text):null}catch{}
   if(!res.ok)throw new Error(data?.message||data?.error||data?.hint||text||`Supabase HTTP ${res.status}`);
   return data;
 }finally{
   clearTimeout(timer);
 }
}
async function rpcBackground(name,args){
 return new Promise((resolve,reject)=>{
   let done=false;
   const timer=setTimeout(()=>{
     if(done)return;
     done=true;
     reject(new Error("Background request timeout."));
   },6000);
   try{
     chrome.runtime.sendMessage({type:"supabase_rpc",name,args:args||{}},response=>{
       if(done)return;
       done=true;
       clearTimeout(timer);
       if(chrome.runtime.lastError){
         reject(new Error(chrome.runtime.lastError.message||"Background service unavailable."));
         return;
       }
       if(!response?.ok){
         reject(new Error(response?.error||"Background Supabase request failed."));
         return;
       }
       resolve(response.data);
     });
   }catch(e){
     if(done)return;
     done=true;
     clearTimeout(timer);
     reject(e);
   }
 });
}
async function rpc(name,args){
 try{
   return await rpcDirect(name,args);
 }catch(first){
   try{
     return await rpcBackground(name,args);
   }catch(second){
     const a=first?.message||"Direct request failed";
     const b=second?.message||"Background request failed";
     throw new Error(`Supabase: ${a} | Secours: ${b}`);
   }
 }
}
async function sb(path,options={}){
 const match=String(path).match(/^\/rest\/v1\/rpc\/([^?]+)/);
 if(!match)throw new Error("Unsupported Supabase request.");
 let args={};
 try{args=options.body?JSON.parse(options.body):{}}catch{}
 return rpc(decodeURIComponent(match[1]),args);
}
function authMessage(msg,isError=true){
 const el=document.getElementById("authMessage");
 if(el){el.textContent=msg||"";el.style.color=isError?"#ff777d":"#63e69a";}
}
function setAuthStorage(session,remember){
 authSession=session;
 const raw=JSON.stringify(session);
 localStorage.removeItem(AUTH_KEY);sessionStorage.removeItem(AUTH_KEY);
 (remember?localStorage:sessionStorage).setItem(AUTH_KEY,raw);
}
async function loadAuthSession(){
 try{
   const raw=localStorage.getItem(AUTH_KEY)||sessionStorage.getItem(AUTH_KEY);
   if(!raw)return null;

   const saved=JSON.parse(raw);
   if(!saved?.token){
     localStorage.removeItem(AUTH_KEY);
     sessionStorage.removeItem(AUTH_KEY);
     return null;
   }

   const data=await rpc("cg_session_me",{p_token:saved.token});

   if(!data?.authenticated){
     localStorage.removeItem(AUTH_KEY);
     sessionStorage.removeItem(AUTH_KEY);
     return null;
   }

   authSession=saved;
   currentProfile={
     id:data.id,
     username:data.username,
     balance:Number(data.balance||0)
   };
   return saved;

 }catch(e){
   // A network problem must not trap the extension in a fake logged-in state.
   localStorage.removeItem(AUTH_KEY);
   sessionStorage.removeItem(AUTH_KEY);
   authSession=null;
   currentProfile=null;
   console.warn("Session restore failed:",e);
   return null;
 }
}
async function registerAccount(){
 if(authBusy)return;
 authBusy=true;
 let authWatchdog=null;
 const username=document.getElementById("registerUsername").value.trim();
 const password=document.getElementById("registerPassword").value;
 const password2=document.getElementById("registerPassword2").value;
 if(username.length<3){authBusy=false;return authMessage("Username must be at least 3 characters.");}
 if(username.length>20){authBusy=false;return authMessage("Username must be 20 characters or less.");}
 if(!/^[a-zA-Z0-9_]+$/.test(username)){authBusy=false;return authMessage("Username: letters, numbers and _ only.");}
 if(password.length<6){authBusy=false;return authMessage("Password must be at least 6 characters.");}
 if(password!==password2){authBusy=false;return authMessage("Passwords do not match.");}
 try{
   authMessage("Creating account…",false);
   authWatchdog=setTimeout(()=>authMessage("Connexion au serveur en cours…",false),5000);
   const data=await rpc("cg_register",{p_username:username,p_password:password});
   if(!data?.success){if(authWatchdog)clearTimeout(authWatchdog);return authMessage(data?.message||"Unable to create account.");}
   const session={token:data.token};
   setAuthStorage(session,document.getElementById("rememberMe")?.checked!==false);
   currentProfile={id:data.id,username:data.username,balance:Number(data.balance||0)};
   
   if(authWatchdog)clearTimeout(authWatchdog);
   enterGame();
 }catch(e){if(authWatchdog)clearTimeout(authWatchdog);authMessage(`ERROR: ${e?.message||"Unable to create account."}`)}

 finally{authBusy=false;}
}
async function loginAccount(){
 if(authBusy)return;
 authBusy=true;
 let authWatchdog=null;
 const username=document.getElementById("loginUsername").value.trim();
 const password=document.getElementById("loginPassword").value;
 if(!username||!password){authBusy=false;return authMessage("Enter your username and password.");}
 if(!/^[a-zA-Z0-9_]+$/.test(username)){authBusy=false;return authMessage("Invalid username.");}
 try{
   authMessage("Signing in…",false);
   authWatchdog=setTimeout(()=>authMessage("Connexion au serveur en cours…",false),5000);
   const data=await rpc("cg_login",{p_username:username,p_password:password});
   if(!data?.success){if(authWatchdog)clearTimeout(authWatchdog);return authMessage(data?.message||"Invalid username or password.");}
   setAuthStorage({token:data.token},document.getElementById("rememberMe").checked);
   currentProfile={id:data.id,username:data.username,balance:Number(data.balance||0)};
   
   if(authWatchdog)clearTimeout(authWatchdog);
   enterGame();
 }catch(e){if(authWatchdog)clearTimeout(authWatchdog);authMessage(`ERROR: ${e?.message||"Unable to connect to the account server."}`)}

 finally{authBusy=false;}
}
let feedbackBalanceSnapshot=null;
const STORAGE_KEY="cryptoGamesState";
function getPlayerStorageKey(){
  return currentProfile?.id ? `${STORAGE_KEY}_${currentProfile.id}` : STORAGE_KEY;
}
const DAY=86400000;
const miners=[
 {level:1,name:"Phone Miner",icon:"📱",cost:0,daily:500,description:"Your first miner is free."},
 {level:2,name:"GPU Miner",icon:"🖥️",cost:1500,daily:800,description:"A more efficient GPU setup."},
 {level:3,name:"Pro Miner",icon:"⚡",cost:3500,daily:1300,description:"A more powerful mining setup."},
 {level:4,name:"ASIC Miner",icon:"💰",cost:7500,daily:2200,description:"Specialized mining hardware."},
 {level:5,name:"Mega Miner",icon:"🎁",cost:100000,daily:4000,description:"A high-end mining setup."},
 {level:6,name:"Quantum Miner",icon:"🚀",cost:30000,daily:7500,description:"A high-performance quantum mining rig."},
 {level:7,name:"Fusion Miner",icon:"☢️",cost:90000,daily:13000,description:"Advanced energy-efficient mining."},
 {level:8,name:"Industrial Miner",icon:"🏭",cost:250000,daily:23000,description:"A serious industrial mining operation."},
 {level:9,name:"Orbital Miner",icon:"🛰️",cost:700000,daily:42000,description:"Next-generation orbital hardware."},
 {level:10,name:"Singularity Miner",icon:"🌌",cost:2000000,daily:80000,description:"The ultimate fictional mining machine."}
];
const MARKET_ASSETS=[
 {symbol:"BITX",name:"Bitcoin X",icon:"₿",base:1000,vol:.045,yield:.0002},
 {symbol:"ETHX",name:"Ethereum X",icon:"Ξ",base:450,vol:.035,yield:.00025},
 {symbol:"SOLX",name:"Solana X",icon:"S",base:180,vol:.06,yield:.00015},
 {symbol:"DOGX",name:"Doge X",icon:"D",base:25,vol:.08,yield:.0001},
 {symbol:"XRPX",name:"XRP X",icon:"X",base:90,vol:.055,yield:.00012},
 {symbol:"ADAX",name:"Cardano X",icon:"A",base:65,vol:.05,yield:.00011}
];
const MARKET_UPDATE_MS=15000;
const MARKET_HOUR_MS=3600000;
const MARKET_HISTORY_MAX=40;
const MARKET_HOURLY_EVENTS=[
 {text:"Bullish momentum · buyers are pushing prices up.",min:.045,max:.09},
 {text:"Market correction · prices are cooling down.",min:-.085,max:-.04},
 {text:"High volatility · big moves across the market.",min:-.06,max:.06},
 {text:"Positive sentiment · investors are becoming more confident.",min:.025,max:.07},
 {text:"Profit taking · some traders are selling.",min:-.07,max:-.025},
 {text:"Calm market · small moves with low volatility.",min:-.025,max:.025}
];
const MARKET_FEE=.01;

function ensureGameState(){
 if(!state || typeof state!=="object"){
   state=JSON.parse(JSON.stringify(DEFAULT));
 }
 if(!state.market || typeof state.market!=="object")state.market={};
 const dm=DEFAULT.market||{};
 state.market={...dm,...state.market};
 state.market.prices={...(dm.prices||{}),...(state.market.prices||{})};
 state.market.previousPrices={...(dm.previousPrices||{}),...(state.market.previousPrices||{})};
 state.market.holdings={...(dm.holdings||{}),...(state.market.holdings||{})};
 state.market.costBasis={...(dm.costBasis||{}),...(state.market.costBasis||{})};
 state.market.history={...(dm.history||{}),...(state.market.history||{})};
 if(!state.market.selected||!MARKET_ASSETS.some(a=>a.symbol===state.market.selected))
   state.market.selected=MARKET_ASSETS[0]?.symbol||"BITX";
 if(!Number.isFinite(Number(state.market.lastUpdate)))state.market.lastUpdate=Date.now();
 if(!Number.isFinite(Number(state.market.lastHourlyEvent)))state.market.lastHourlyEvent=Date.now();
 if(!state.market.lastEventText)state.market.lastEventText="Market activity is warming up.";
 if(!Array.isArray(state.minerInventory))state.minerInventory=[1];
 if(!state.minerInventory.length)state.minerInventory=[1];
 if(!state.realEstateOwned||typeof state.realEstateOwned!=="object")state.realEstateOwned={};
 if(!state.realEstateMarket||typeof state.realEstateMarket!=="object")state.realEstateMarket={};
 if(!Array.isArray(state.trainedJobs))state.trainedJobs=[];
 if(!state.jobDayStamp)state.jobDayStamp=new Date().toISOString().slice(0,10);
 if(!Number.isFinite(Number(state.balance)))state.balance=Number(DEFAULT.balance||0);
 return state;
}

function enterGame(){
 if(gameStarted)return;
 gameStarted=true;

 // Authentication succeeded: switch UI immediately.
 const auth=document.getElementById("authScreen");
 if(auth){
   auth.classList.remove("active");
   auth.style.setProperty("display","none","important");
 }
 const app=document.querySelector(".app");
 if(app)app.style.setProperty("display","block","important");

 document.querySelectorAll(".screen").forEach(s=>{
   if(s.id!=="authScreen"&&s.id!=="rankingScreen")s.classList.remove("active");
 });
 const first=document.querySelector(".screen:not(#authScreen):not(#rankingScreen)");
 if(first)first.classList.add("active");

 updateAccountUI();

 // Only now initialize the actual game.
 Promise.resolve().then(async()=>{
   try{
     await init();
     ensureGameState();
     
     if(typeof render==="function")render();
   }catch(e){
     console.error("Game initialization error:",e);
   }
 });
}
function showLogin(){
 authMessage("");
 document.getElementById("authLoginPanel").hidden=false;
 document.getElementById("authRegisterPanel").hidden=true;
 authMessage("");
}
function showRegister(){
 authMessage("");
 document.getElementById("authLoginPanel").hidden=true;
 document.getElementById("authRegisterPanel").hidden=false;
 authMessage("");
}
async function logoutAccount(){
 const token=authSession?.token;

 // Local logout must happen immediately. Never let a network request
 // keep the user stuck on the authentication screen.
 localStorage.removeItem(AUTH_KEY);
 sessionStorage.removeItem(AUTH_KEY);
 authSession=null;
 currentProfile=null;
 gameStarted=false;
 gameInitialized=false;

 // Hide the complete game shell (including the fixed top balance/header).
 const app=document.querySelector(".app");
 if(app){
   app.style.setProperty("display","none","important");
 }
 const p=document.getElementById("accountPanel");
 if(p)p.hidden=true;

 const auth=document.getElementById("authScreen");
 if(auth){
   auth.style.removeProperty("display");
   auth.style.display="flex";
   auth.classList.add("active");
 }

 document.querySelectorAll(".screen").forEach(s=>{
   if(s.id!=="authScreen")s.classList.remove("active");
 });

 showLogin();

 // Server-side session cleanup is best-effort and cannot block logout.
 if(token){
   rpc("cg_logout",{p_token:token}).catch(()=>{});
 }
}
function updateAccountUI(){
 if(!currentProfile)return;
 const name=currentProfile.username||"Player";
 const n=document.getElementById("accountName");if(n)n.textContent=name;
 const pn=document.getElementById("accountPanelName");if(pn)pn.textContent=name;
 const pe=document.getElementById("accountPanelEmail");if(pe)pe.textContent="";
}
async function syncPlayerBalance(){
 if(!authSession?.token||!currentProfile)return false;
 try{
   const data=await rpc("cg_update_balance",{p_token:authSession.token,p_balance:Number(state.balance||0)});
   if(data?.balance!==undefined){
     currentProfile.balance=Number(data.balance);
     state.balance=Number(data.balance);
     return true;
   }
 }catch(e){
   console.warn("Balance sync failed:",e);
 }
 return false;
}
async function loadRanking(){
 const list=document.getElementById("rankingList");
 if(!list)return;
 list.innerHTML='<div class="ranking-subtitle">Loading...</div>';
 try{
   const rows=(await rpc("cg_top_players",{p_limit:100})||[]);
   list.innerHTML=rows.map((p,i)=>`<div class="rank-row ${currentProfile?.id===p.id?"me":""}">
     <span class="rank">#${i+1}</span><span>${escapeHtml(p.username)}</span>
     <span class="coins">${Number(p.balance||0).toLocaleString("en-US",{maximumFractionDigits:1})}</span>
   </div>`).join("")||'<div class="ranking-subtitle">No players yet.</div>';
 }catch(e){list.innerHTML=`<div class="auth-message">${escapeHtml(e.message)}</div>`}
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

const REAL_ESTATE_ASSETS=[
 {id:"studio",type:"property",name:"Small Studio",icon:"🏠",price:5000,daily:120},
 {id:"apartment",type:"property",name:"City Apartment",icon:"🏢",price:15000,daily:360},
 {id:"house",type:"property",name:"Family House",icon:"🏡",price:40000,daily:1000},
 {id:"office",type:"business",name:"Small Office",icon:"🏬",price:75000,daily:1900},
 {id:"cafe",type:"business",name:"Neighborhood Cafe",icon:"☕",price:150000,daily:4200},
 {id:"store",type:"business",name:"Retail Store",icon:"🏪",price:300000,daily:9000},
 {id:"warehouse",type:"property",name:"City Warehouse",icon:"🏭",price:600000,daily:20000},
 {id:"hotel",type:"property",name:"Boutique Hotel",icon:"🏨",price:1200000,daily:42000},
 {id:"mall",type:"business",name:"Shopping Mall",icon:"🏬",price:3000000,daily:110000},
 {id:"restaurant",type:"business",name:"Premium Restaurant",icon:"🍽️",price:7500000,daily:290000},
 {id:"tower",type:"property",name:"Business Tower",icon:"🏙️",price:18000000,daily:720000}
];
const JOBS=[
 {id:"delivery",name:"Delivery Rider",icon:"🛵",daily:500,training:0,trainingName:"No training"},
 {id:"support",name:"Support Agent",icon:"🎧",daily:800,training:1000,trainingName:"Customer Support"},
 {id:"designer",name:"Junior Designer",icon:"🎨",daily:1200,training:2200,trainingName:"Design Basics"},
 {id:"developer",name:"Junior Developer",icon:"💻",daily:1800,training:4000,trainingName:"Web Development"},
 {id:"analyst",name:"Data Analyst",icon:"📊",daily:2500,training:7000,trainingName:"Data Analytics"},
 {id:"manager",name:"Project Manager",icon:"📋",daily:3400,training:11000,trainingName:"Project Management"},
 {id:"engineer",name:"Software Engineer",icon:"🧑‍💻",daily:4500,training:18000,trainingName:"Advanced Programming"},
 {id:"trader",name:"Market Trader",icon:"🚀",daily:6000,training:30000,trainingName:"Financial Markets"},
 {id:"architect",name:"Solution Architect",icon:"🏗️",daily:8000,training:50000,trainingName:"Systems Architecture"},
 {id:"director",name:"Tech Director",icon:"👔",daily:11000,training:85000,trainingName:"Executive Leadership"}
];


const CASE_ITEMS=[
 {id:"coin_burst",name:"Coin Burst",icon:"🪙",rarity:"Common",value:100},
 {id:"silver_chip",name:"Silver Chip",icon:"⚪",rarity:"Common",value:200},
 {id:"energy_cell",name:"Energy Cell",icon:"🔋",rarity:"Common",value:300},
 {id:"gold_chip",name:"Gold Chip",icon:"🟡",rarity:"Uncommon",value:600},
 {id:"neon_core",name:"Neon Core",icon:"💠",rarity:"Uncommon",value:1200},
 {id:"ruby_fragment",name:"Ruby Fragment",icon:"♦️",rarity:"Rare",value:2600},
 {id:"quantum_chip",name:"Quantum Chip",icon:"🔷",rarity:"Rare",value:4800},
 {id:"plasma_core",name:"Plasma Core",icon:"🟣",rarity:"Epic",value:12000},
 {id:"golden_core",name:"Golden Core",icon:"🌟",rarity:"Epic",value:24000},
 {id:"legendary_orb",name:"Legendary Orb",icon:"🔮",rarity:"Legendary",value:60000},
 {id:"crown_chip",name:"Crown Chip",icon:"👑",rarity:"Legendary",value:120000},
 {id:"silver_stack",name:"Silver Stack",icon:"💿",rarity:"Uncommon",value:5000,minCase:2},
 {id:"power_cell",name:"Power Cell",icon:"⚙️",rarity:"Rare",value:8000,minCase:2},
 {id:"quantum_relay",name:"Quantum Relay",icon:"💎",rarity:"Rare",value:12000,minCase:2},
 {id:"ruby_drive",name:"Ruby Drive",icon:"💰",rarity:"Epic",value:20000,minCase:2},
 {id:"golden_engine",name:"Golden Engine",icon:"🧿",rarity:"Epic",value:35000,minCase:2},
 {id:"plasma_crown",name:"Plasma Crown",icon:"🏆",rarity:"Epic",value:60000,minCase:3},
 {id:"diamond_core",name:"Diamond Core",icon:"🛡️",rarity:"Legendary",value:100000,minCase:3},
 {id:"royal_chip",name:"Royal Chip",icon:"🗝️",rarity:"Legendary",value:180000,minCase:3},
 {id:"fortune_core",name:"Fortune Core",icon:"🧲",rarity:"Legendary",value:300000,minCase:3},
 {id:"million_chip",name:"Millionaire Chip",icon:"🧪",rarity:"Legendary",value:500000,minCase:3},
 {id:"orbital_chip",name:"Orbital Chip",icon:"🛰️",rarity:"Rare",value:7000,minCase:2},
 {id:"lunar_core",name:"Lunar Core",icon:"🪐",rarity:"Epic",value:15000,minCase:2},
 {id:"comet_drive",name:"Comet Drive",icon:"☄️",rarity:"Epic",value:28000,minCase:2},
 {id:"galaxy_core",name:"Galaxy Core",icon:"🌌",rarity:"Epic",value:45000,minCase:3},
 {id:"genesis_chip",name:"Genesis Chip",icon:"🧬",rarity:"Legendary",value:75000,minCase:3},
 {id:"banker_token",name:"Banker Token",icon:"🏦",rarity:"Legendary",value:140000,minCase:3},
 {id:"elite_card",name:"Elite Card",icon:"💳",rarity:"Legendary",value:220000,minCase:3},
 {id:"market_share",name:"Market Share",icon:"📈",rarity:"Legendary",value:280000,minCase:3},
 {id:"gold_medal",name:"Gold Medal",icon:"🏅",rarity:"Epic",value:40000,minCase:3},
 {id:"champion_coin",name:"Champion Coin",icon:"🥇",rarity:"Legendary",value:350000,minCase:3},
 {id:"target_core",name:"Target Core",icon:"🎯",rarity:"Rare",value:10000,minCase:2},
 {id:"toolkit",name:"Investor Toolkit",icon:"🧰",rarity:"Rare",value:18000,minCase:2},
 {id:"executive_pass",name:"Executive Pass",icon:"💼",rarity:"Epic",value:90000,minCase:3},
 {id:"capital_hall",name:"Capital Hall",icon:"🏛️",rarity:"Legendary",value:450000,minCase:3}
];
const CASES=[
 {id:"starter_case",name:"Starter Case",icon:"📦",price:500,description:"Small rewards for starting out.",weights:{Common:72,Uncommon:20,Rare:6.5,Epic:1.4,Legendary:.1},itemChance:.83},
 {id:"premium_case",name:"Premium Case",icon:"🎁",price:5000,description:"Better odds and bigger rewards.",weights:{Common:60,Uncommon:27,Rare:10,Epic:2.8,Legendary:.2},itemChance:.88},
 {id:"legendary_case",name:"Legendary Case",icon:"👑",price:50000,description:"High-value rewards with improved winning odds.",weights:{Common:15,Uncommon:25,Rare:30,Epic:22,Legendary:8},itemChance:.92}
];
const CASE_MONEY=[
 {min:60,max:360},{min:480,max:3400},{min:4800,max:36000}
];

const ACHIEVEMENTS=[
 {id:"first_coins",icon:"🪙",name:"Coin Starter",desc:"Reach 5,000 coins.",target:5000,kind:"balance",reward:77},
 {id:"rich",icon:"💰",name:"High Roller",desc:"Reach 50,000 coins.",target:50000,kind:"balance",reward:154},
 {id:"millionaire",icon:"👑",name:"Coin Tycoon",desc:"Reach 5,000,000 coins.",target:5000000,kind:"balance",reward:231},
 {id:"miner",icon:"⛏️",name:"Mining Fleet",desc:"Own 5 mining machines.",target:5,kind:"miners",reward:308},
 {id:"upgrade_miner",icon:"⚙️",name:"Master Miner",desc:"Reach Mining Level 25.",target:25,kind:"minerLevel",reward:462},
 {id:"empire",icon:"🏭",name:"Mining Empire",desc:"Own 25 mining machines.",target:25,kind:"miners",reward:615},
 {id:"first_property",icon:"🏠",name:"Property Investor",desc:"Own 5 properties or businesses.",target:5,kind:"properties",reward:923},
 {id:"real_estate_king",icon:"🏙️",name:"Real Estate Tycoon",desc:"Own 25 properties or businesses.",target:25,kind:"properties",reward:1231},
 {id:"first_case",icon:"📦",name:"Case Opener",desc:"Open 5 cases.",target:5,kind:"cases",reward:1538},
 {id:"case_collector",icon:"🎁",name:"Case Collector",desc:"Open 50 cases.",target:50,kind:"cases",reward:2308},
 {id:"case_master",icon:"🎁",name:"Case Master",desc:"Open 250 cases.",target:250,kind:"cases",reward:3077},
 {id:"collector",icon:"🎒",name:"Item Collector",desc:"Collect 50 items.",target:50,kind:"items",reward:4615},
 {id:"legendary",icon:"🌟",name:"Legendary Collector",desc:"Own 5 Legendary items.",target:5,kind:"legendary",reward:6154},
 {id:"full_rarity",icon:"🏆",name:"Elite Collector",desc:"Own 5 Epic or Legendary items.",target:5,kind:"epicOrLegendary",reward:9231},
 {id:"worker",icon:"💼",name:"Career Builder",desc:"Have an active job.",target:1,kind:"job",reward:12308},
 {id:"trader",icon:"🚀",name:"Crypto Trader",desc:"Own at least 1 crypto asset.",target:1,kind:"crypto",reward:15385},
 {id:"generator",icon:"💰",name:"Money Factory",desc:"Generate 500,000 coins in total.",target:500000,kind:"generated",reward:23077},
 {id:"item_collected_1",icon:"🎒",name:"First Item",desc:"Collect 1 item.",target:1,kind:"itemsEver",reward:500},
 {id:"item_collected_100",icon:"📦",name:"Item Collector 100",desc:"Collect 100 items.",target:100,kind:"itemsEver",reward:5000},
 {id:"item_collected_1000",icon:"🏆",name:"Master Collector",desc:"Collect 1,000 items.",target:1000,kind:"itemsEver",reward:15000}
];

const DEFAULT={
 balance:0,
 minerLevel:1,
 minerInventory:[1],
 realEstateOwned:{},
 realEstateMarket:{},
 realEstateRemainder:0,
 lastRealEstatePay:Date.now(),
 miningRemainder:0,
 lastMiningPay:Date.now(),
 job:null,
 trainedJobs:[],
 jobDayStamp:"",
 jobToday:0,
 jobRemainder:0,
 lastJobPay:Date.now(),
 storedCoins:500,
 miningReadyNotificationShown:false,
 inventory:{},
 lastCaseOpen:0,
 totalCasesOpened:0,
 totalItemsSold:0,
 totalItemsCollected:0,
 achievementRewardsClaimed:{},
 achievementNotifications:0,
 inventoryNotifications:0,
 notificationBaselineReady:false,
 notificationInventoryCounts:{},
 notificationAchievementUnlocked:{},
 lastCollection:Date.now(),
 totalGenerated:500,
 market:{
   selected:"BITX",
   prices:{BITX:1000,ETHX:450,SOLX:180,DOGX:25},
   holdings:{BITX:0,ETHX:0,SOLX:0,DOGX:0,XRPX:0,ADAX:0,AVAX:0,LINKX:0,DOTX:0},
   costBasis:{BITX:0,ETHX:0,SOLX:0,DOGX:0,XRPX:0,ADAX:0,AVAX:0,LINKX:0,DOTX:0},
   lastUpdate:Date.now(),
   previousPrices:{BITX:1000,ETHX:450,SOLX:180,DOGX:25,XRPX:90,ADAX:65,AVAX:140,LINKX:220,DOTX:75},
   history:{BITX:[1000],ETHX:[450],SOLX:[180],DOGX:[25],XRPX:[90],ADAX:[65],AVAX:[140],LINKX:[220],DOTX:[75]},
   lastHourlyEvent:Date.now(),
   lastEventText:"Market activity is warming up.",
   portfolioValue:0,
   previousPortfolioValue:0
 }
};
let state;
let gameReadyResolve;
const gameReady=new Promise(resolve=>{gameReadyResolve=resolve;});
let gameInitialized=false;
let gameStarted=false;


async function init(){
 try{

 const playerKey=getPlayerStorageKey();
 const data=await chrome.storage.local.get(playerKey);
 state=data[playerKey]?{...DEFAULT,...data[playerKey]}:{...DEFAULT};
 // The balance is server-authoritative. Never restore it from local storage.
 state.balance=Number(currentProfile?.balance||0);
 state.minerInventory=Array.isArray(state.minerInventory)?state.minerInventory:[Math.max(1,Number(state.minerLevel)||1)];
 state.minerInventory=[...new Set(state.minerInventory.map(Number).filter(n=>n>=1))].sort((a,b)=>a-b);
 if(!state.minerInventory.includes(1))state.minerInventory.unshift(1);
 state.minerLevel=Math.max(...state.minerInventory);
 state.miningRemainder=Number(state.miningRemainder)||0;
 state.lastMiningPay=Number(state.lastMiningPay)||Date.now();
 state.miningReadyNotificationShown=!!state.miningReadyNotificationShown;
 state.realEstateOwned=state.realEstateOwned&&typeof state.realEstateOwned==='object'?state.realEstateOwned:{};
 state.realEstateMarket=state.realEstateMarket&&typeof state.realEstateMarket==='object'?state.realEstateMarket:{};
 REAL_ESTATE_ASSETS.forEach(asset=>{
   const market=state.realEstateMarket[asset.id];
   if(!market||!Number.isFinite(Number(market.price))||Number(market.price)<=0){
     state.realEstateMarket[asset.id]={price:asset.price,lastUpdate:Date.now()};
   }
 });
 state.realEstateRemainder=Number(state.realEstateRemainder)||0;
 state.lastRealEstatePay=Number(state.lastRealEstatePay)||Date.now();
 state.trainedJobs=Array.isArray(state.trainedJobs)?state.trainedJobs:[];
 state.job=state.job||null;
 state.jobDayStamp=state.jobDayStamp||"";
 state.jobToday=Number(state.jobToday)||0;
 state.jobRemainder=Number(state.jobRemainder)||0;
 state.lastJobPay=Number(state.lastJobPay)||Date.now();
 state.inventory=state.inventory&&typeof state.inventory==="object"?state.inventory:{};
 CASE_ITEMS.forEach(item=>{
   state.inventory[item.id]=Math.max(0,Number(state.inventory[item.id])||0);
 });
 state.lastCaseOpen=Number(state.lastCaseOpen)||0;
 state.totalCasesOpened=Math.max(0,Number(state.totalCasesOpened)||0);
 state.totalItemsSold=Math.max(0,Number(state.totalItemsSold)||0);
 state.totalItemsCollected=Math.max(0,Number(state.totalItemsCollected)||0);
 state.achievementRewardsClaimed=state.achievementRewardsClaimed&&typeof state.achievementRewardsClaimed==='object'?state.achievementRewardsClaimed:{};
 state.achievementNotifications=Math.max(0,Number(state.achievementNotifications)||0);
 state.inventoryNotifications=Math.max(0,Number(state.inventoryNotifications)||0);
 state.notificationInventoryCounts=state.notificationInventoryCounts&&typeof state.notificationInventoryCounts==='object'?state.notificationInventoryCounts:{};
 state.notificationAchievementUnlocked=state.notificationAchievementUnlocked&&typeof state.notificationAchievementUnlocked==='object'?state.notificationAchievementUnlocked:{};
 if(!state.notificationBaselineReady){
   CASE_ITEMS.forEach(item=>{state.notificationInventoryCounts[item.id]=Number(state.inventory[item.id]||0);});
   ACHIEVEMENTS.forEach(a=>{state.notificationAchievementUnlocked[a.id]=achievementProgress(a)>=a.target;});
   state.notificationBaselineReady=true;
 }

 const todayJobStamp=new Date().toISOString().slice(0,10);
 if(state.jobDayStamp!==todayJobStamp){
   state.jobDayStamp=todayJobStamp;
   state.jobToday=0;
   state.jobRemainder=0;
   state.lastJobPay=Date.now();
 }
 state.market={...DEFAULT.market,...(state.market||{})};
 state.market.prices={...DEFAULT.market.prices,...(state.market.prices||{})};
 state.market.previousPrices={...DEFAULT.market.previousPrices,...(state.market.previousPrices||{})};
 state.market.holdings={...DEFAULT.market.holdings,...(state.market.holdings||{})};
 state.market.costBasis={...DEFAULT.market.costBasis,...(state.market.costBasis||{})};
 state.market.history={...DEFAULT.market.history,...(state.market.history||{})};
 MARKET_ASSETS.forEach(asset=>{
   const price=Number(state.market.prices[asset.symbol]);
   if(!Number.isFinite(price)||price<=0)state.market.prices[asset.symbol]=asset.base;

   const previous=Number(state.market.previousPrices[asset.symbol]);
   if(!Number.isFinite(previous)||previous<=0)state.market.previousPrices[asset.symbol]=state.market.prices[asset.symbol];

   if(!Number.isFinite(Number(state.market.holdings[asset.symbol]))||Number(state.market.holdings[asset.symbol])<0)
     state.market.holdings[asset.symbol]=0;

   if(!Number.isFinite(Number(state.market.costBasis[asset.symbol]))||Number(state.market.costBasis[asset.symbol])<0)
     state.market.costBasis[asset.symbol]=0;

   if(!Array.isArray(state.market.history[asset.symbol])||state.market.history[asset.symbol].every(v=>Number(v)<=0))
     state.market.history[asset.symbol]=[state.market.prices[asset.symbol]];

   state.market.history[asset.symbol]=state.market.history[asset.symbol]
     .map(v=>Number(v))
     .filter(v=>Number.isFinite(v)&&v>0)
     .slice(-MARKET_HISTORY_MAX);

   if(!state.market.history[asset.symbol].length)
     state.market.history[asset.symbol]=[state.market.prices[asset.symbol]];
 });
 if(!MARKET_ASSETS.some(a=>a.symbol===state.market.selected))
   state.market.selected="BITX";
 state.market.lastUpdate=Number(state.market.lastUpdate)||Date.now();
 state.market.lastHourlyEvent=Number(state.market.lastHourlyEvent)||Date.now();
 state.market.lastEventText=state.market.lastEventText||"Market activity is warming up.";
 updateMarketPrices();
 applyOffline();
 await save();
 bind();
 render();

 }catch(initError){
   console.error("Crypto Games init error:",initError);
   ensureGameState();
 }finally{
   ensureGameState();
   gameInitialized=true;
   gameReadyResolve();
 }
}


function getJob(id){return JOBS.find(j=>j.id===id)}
function jobMinuteRate(job){return job.daily/1440}
function jobCanWork(job){return !job.training || state.trainedJobs.includes(job.id)}
function resetJobDay(){
 const stamp=new Date().toISOString().slice(0,10);
 if(state.jobDayStamp!==stamp){
   state.jobDayStamp=stamp;
   state.jobToday=0;
   state.jobRemainder=0;
   state.jobDayStamp=stamp;
   state.lastJobPay=Date.now();
 }
}
async function chooseJob(id){
 resetJobDay();
 const job=getJob(id);
 if(!job||!jobCanWork(job))return;
 state.job=id;
 state.lastJobPay=Date.now();
 state.jobRemainder=0;
 await save();
 render();
}
async function buyTraining(id){
 resetJobDay();
 const job=getJob(id);
 if(!job||!job.training||state.trainedJobs.includes(id))return;
 if(state.balance<job.training)return;
 state.balance-=job.training;
 state.trainedJobs.push(id);
 await save();
 render();
}
function processJobPay(){
 resetJobDay();
 if(!state.job)return false;
 const job=getJob(state.job);
 if(!job||!jobCanWork(job))return false;
 if(state.jobToday>=job.daily){
   state.jobToday=job.daily;
   state.jobRemainder=0;
   return false;
 }
 const now=Date.now();
 const minutes=Math.floor(Math.max(0,now-state.lastJobPay)/60000);
 if(minutes<=0)return false;
 state.lastJobPay+=minutes*60000;
 state.jobRemainder+=minutes*jobMinuteRate(job);
 const available=Math.floor(state.jobRemainder);
 const remaining=Math.max(0,job.daily-state.jobToday);
 const pay=Math.min(available,remaining);
 if(pay<=0)return false;
 state.jobRemainder-=pay;
 state.jobToday+=pay;
 state.balance+=pay;
 return true;
}
function renderJobs(){
 resetJobDay();
 const active=getJob(state.job);
 const name=document.getElementById("activeJobName");
 const pay=document.getElementById("activeJobPay");
 const today=document.getElementById("jobEarnedToday");
 const next=document.getElementById("jobNextPay");
 if(active){
   name.textContent=`${active.icon} ${active.name}`;
   pay.textContent=`${jobMinuteRate(active).toFixed(2)} coins / min · ${active.daily}/day`;
   next.textContent=state.jobToday>=active.daily?"Daily limit reached":"Next salary check in 1 min";
   today.textContent=`${state.jobToday.toLocaleString("en-US")} / ${active.daily.toLocaleString("en-US")}`;
 }else{
   name.textContent="No job";
   pay.textContent="Choose a job below";
   next.textContent="Waiting";
   today.textContent="0 / 500";
 }
 const list=document.getElementById("jobsList");
 if(list){
   list.innerHTML=JOBS.map(job=>{
     const activeState=state.job===job.id;
     const locked=!jobCanWork(job);
     return `<button type="button" class="job-card ${activeState?"active":""} ${locked?"locked":""}" data-job="${job.id}">
       <span class="job-icon">${job.icon}</span>
       <span class="job-main"><strong>${job.name}</strong><small>${job.daily.toLocaleString("en-US")} coins/day · ${jobMinuteRate(job).toFixed(2)} / min</small></span>
       <span class="job-status">${activeState?"WORKING":locked?"LOCKED":"SELECT"}</span>
     </button>`;
   }).join("");
   list.querySelectorAll("[data-job]").forEach(b=>b.onclick=()=>chooseJob(b.dataset.job));
 }
 const training=document.getElementById("trainingList");
 if(training){
   training.innerHTML=JOBS.filter(j=>j.training>0).map(job=>{
     const trained=state.trainedJobs.includes(job.id);
     const affordable=state.balance>=job.training;
     return `<div class="training-card ${trained?"trained":""}">
       <span class="training-icon">📚</span>
       <span class="training-main"><strong>${job.trainingName}</strong><small>Unlocks ${job.name} · ${job.daily.toLocaleString("en-US")} coins/day</small></span>
       <button type="button" class="training-button" data-training="${job.id}" ${trained||!affordable?"disabled":""}>${trained?"UNLOCKED":job.training.toLocaleString("en-US")+" coins"}</button>
     </div>`;
   }).join("");
   training.querySelectorAll("[data-training]").forEach(b=>b.onclick=()=>buyTraining(b.dataset.training));
 }
}

function getHomeAssetIncome(){
 const items=[];
 let total=0;

 // All owned miners contribute continuously.
 if(Array.isArray(state.minerInventory)){
   state.minerInventory.forEach(level=>{
     const miner=miners[level-1];
     if(miner){
       const perMinute=miner.daily/1440;
       total+=perMinute;
       items.push({icon:miner.icon,name:miner.name,category:"Mining",perMinute});
     }
   });
 }

 // Real estate properties and businesses generate passive income.
 Object.entries(state.realEstateOwned||{}).forEach(([id,qty])=>{
   const asset=getRealEstate(id);
   const amount=Number(qty||0);
   if(!asset||amount<=0)return;
   const perMinute=(asset.daily/1440)*amount;
   total+=perMinute;
   items.push({
     icon:asset.icon,
     name:`${asset.name}${amount>1?" x"+amount:""}`,
     category:`Real Estate · ${asset.daily.toLocaleString("en-US")} / day each`,
     perMinute
   });
 });

 // Active job contributes its salary.
 if(state.job){
   const job=getJob(state.job);
   if(job){
     const perMinute=job.daily/1440;
     total+=perMinute;
     items.push({icon:job.icon,name:job.name,category:"Job",perMinute});
   }
 }

 // Show all crypto holdings currently owned in the live Assets panel.
 // Market cryptos are trading assets, not passive-income assets, so they add
 // 0 coins/min to the income total while their quantity/value updates live.
 if(state.market && state.market.holdings){
   Object.entries(state.market.holdings).forEach(([symbol,h])=>{
     const amount=Number(h?.amount||h?.quantity||h||0);
     if(amount<=0)return;

     const assetList=typeof MARKET_ASSETS!=="undefined"?MARKET_ASSETS:[];
     const crypto=assetList.find(c=>c.symbol===symbol);
     const price=Number(state.market.prices?.[symbol]||crypto?.base||0);
     const value=amount*price;

     items.push({
       icon:crypto?.icon||"₿",
       name:symbol,
       category:`Crypto · ${amount.toFixed(4)} · ${Math.floor(value).toLocaleString("en-US")} coins`,
       perMinute:0,
       liveValue:value
     });
   });
 }

 return {items,total};
}
function economyFeedback(type,amount){
 const el=document.querySelector(".header #balance");
 if(!el)return;

 el.classList.remove("balance-win","balance-loss");
 void el.offsetWidth;
 el.classList.add(type==="win"?"balance-win":"balance-loss");

 const delta=document.getElementById("balanceDelta");
 if(delta){
   delta.className=type==="win"?"delta-win":"delta-loss";
   const sign=type==="win"?"+":"-";
   const value=Math.abs(Number(amount)||0);
   delta.textContent=`${sign}${value.toLocaleString("en-US",{maximumFractionDigits:1})}`;
   void delta.offsetWidth;
   delta.classList.add("delta-active");
   setTimeout(()=>{
     delta.classList.remove("delta-active");
     delta.textContent="";
   },620);
 }
 setTimeout(()=>el.classList.remove("balance-win","balance-loss"),420);
}
function renderHomeAssetsIncome(){
 const box=document.getElementById("homeAssetsIncome");
 const list=document.getElementById("homeAssetsList");
 const totalEl=document.getElementById("homeTotalIncome");
 if(!box||!list||!totalEl)return;

 const data=getHomeAssetIncome();
 totalEl.textContent=`+${data.total.toFixed(2)} coins / min`;

 const inventoryValue=Object.entries(state.inventory||{}).reduce((sum,[id,qty])=>{
   const item=CASE_ITEMS.find(x=>x.id===id);
   return sum+(item?Number(item.value||0)*Number(qty||0):0);
 },0);

 let valueEl=document.getElementById("homeItemsValue");
 if(!valueEl){
   valueEl=document.createElement("span");
   valueEl.id="homeItemsValue";
   valueEl.className="home-items-total-value";
   const head=box.querySelector(".home-assets-income-head");
   if(head)head.appendChild(valueEl);
 }
 valueEl.textContent=`Items · ${inventoryValue.toLocaleString("en-US")} coins`;

 const oldToggle=document.getElementById("homeAssetsToggle");
 const oldExtra=document.getElementById("homeAssetsExtra");
 if(oldToggle)oldToggle.remove();
 if(oldExtra)oldExtra.remove();

 if(!data.items.length){
   list.innerHTML='<div class="home-assets-empty">No assets yet</div>';
   return;
 }

 // Button pagination: five assets per page, no mouse-wheel scrolling.
 const perPage=5;
 const totalPages=Math.max(1,Math.ceil(data.items.length/perPage));
 let page=Math.max(0,Math.min(Number(box.dataset.assetsPage||0),totalPages-1));
 box.dataset.assetsPage=String(page);

 const renderPage=()=>{
   const startIndex=page*perPage;
   const pageItems=data.items.slice(startIndex,startIndex+perPage);
   list.innerHTML=pageItems.map(item=>`
     <div class="home-asset-row ${item.category.startsWith("Crypto")?"crypto-live":""}">
       <span class="home-asset-icon">${item.icon}</span>
       <span class="home-asset-main">
         <strong>${item.name}</strong>
         <small>${item.category}</small>
       </span>
       <strong class="home-asset-income">${item.category.startsWith("Crypto")?`${Math.floor(item.liveValue).toLocaleString("en-US")} coins`:`+${item.perMinute.toFixed(2)} / min`}</strong>
     </div>
   `).join("");

   let nav=document.getElementById("homeAssetsPagination");
   if(!nav){
     nav=document.createElement("div");
     nav.id="homeAssetsPagination";
     nav.className="home-assets-pagination";
     box.appendChild(nav);
   }

   if(totalPages<=1){
     nav.innerHTML="";
     nav.style.display="none";
     return;
   }

   nav.style.display="flex";
   nav.innerHTML=`
     <button type="button" class="assets-page-btn" id="assetsPrev" ${page===0?"disabled":""} aria-label="Previous assets">‹</button>
     <div class="assets-page-numbers">
       ${Array.from({length:totalPages},(_,i)=>`
         <button type="button" class="assets-page-number ${i===page?"active":""}" data-page="${i}">${i+1}</button>
       `).join("")}
     </div>
     <button type="button" class="assets-page-btn" id="assetsNext" ${page===totalPages-1?"disabled":""} aria-label="Next assets">›</button>
   `;

   nav.querySelector("#assetsPrev")?.addEventListener("click",()=>{
     if(page<=0)return;
     page--;
     box.dataset.assetsPage=String(page);
     renderPage();
   });
   nav.querySelector("#assetsNext")?.addEventListener("click",()=>{
     if(page>=totalPages-1)return;
     page++;
     box.dataset.assetsPage=String(page);
     renderPage();
   });
   nav.querySelectorAll(".assets-page-number").forEach(btn=>{
     btn.addEventListener("click",()=>{
       page=Number(btn.dataset.page);
       box.dataset.assetsPage=String(page);
       renderPage();
     });
   });
 };

 renderPage();
}

function getRealEstate(id){return REAL_ESTATE_ASSETS.find(a=>a.id===id)}
function realEstateMarketPrice(id){
 const asset=getRealEstate(id);
 if(!asset)return 0;
 const market=state.realEstateMarket[id];
 return Number(market?.price)||asset.price;
}
function updateRealEstateMarket(){
 const now=Date.now();
 let changed=false;
 REAL_ESTATE_ASSETS.forEach(asset=>{
   const old=realEstateMarketPrice(asset.id);
   // Small movement around the purchase price, rarely more than a few percent.
   const delta=(Math.random()*.06)-.03;
   const next=Math.max(asset.price*.82,Math.min(asset.price*1.18,old*(1+delta)));
   state.realEstateMarket[asset.id]={price:next,lastUpdate:now};
   if(Math.abs(next-old)>0.0001)changed=true;
 });
 return changed;
}
function realEstateIncomePerMinute(){
 return Object.entries(state.realEstateOwned).reduce((sum,[id,qty])=>{
   const asset=getRealEstate(id);
   return sum+(asset?(asset.daily/1440)*Number(qty||0):0);
 },0);
}
function realEstatePortfolioValue(){
 return Object.entries(state.realEstateOwned).reduce((sum,[id,qty])=>{
   return sum+realEstateMarketPrice(id)*Number(qty||0);
 },0);
}
function processRealEstatePay(){
 const now=Date.now();
 const minutes=Math.floor(Math.max(0,now-state.lastRealEstatePay)/60000);
 if(minutes<=0)return false;
 const perMinute=realEstateIncomePerMinute();
 const amount=minutes*perMinute;
 if(amount<=0){
   state.lastRealEstatePay+=minutes*60000;
   return false;
 }
 state.balance+=amount;
 state.realEstateRemainder+=amount;
 state.totalGenerated+=amount;
 state.lastRealEstatePay+=minutes*60000;
 return true;
}
async function buyRealEstate(id){
 const asset=getRealEstate(id);
 const price=realEstateMarketPrice(id);
 if(!asset||state.balance<price)return;
 processRealEstatePay();
 state.balance-=price;
 state.realEstateOwned[id]=(Number(state.realEstateOwned[id])||0)+1;
 await save();
 render();
}
async function sellRealEstate(id){
 const asset=getRealEstate(id);
 const owned=Number(state.realEstateOwned[id]||0);
 if(!asset||owned<=0)return;
 processRealEstatePay();
 const salePrice=realEstateMarketPrice(id);
 state.balance+=salePrice;
 state.realEstateOwned[id]=owned-1;
 if(state.realEstateOwned[id]<=0)delete state.realEstateOwned[id];
 await save();
 render();
}
function renderRealEstate(){
 const income=realEstateIncomePerMinute();
 const value=realEstatePortfolioValue();
 const count=Object.values(state.realEstateOwned).reduce((sum,q)=>sum+Number(q||0),0);
 const incomeEl=document.getElementById("realEstateIncome");
 const valueEl=document.getElementById("realEstateValue");
 const ownedEl=document.getElementById("realEstateOwned");
 if(incomeEl)incomeEl.textContent=`+${income.toFixed(2)} / min`;
 if(valueEl)valueEl.textContent=`${Math.floor(value).toLocaleString("en-US")} coins`;
 if(ownedEl)ownedEl.textContent=`${count} asset${count===1?"":"s"} owned`;

 ["property","business"].forEach(type=>{
   const list=document.getElementById(type==="property"?"propertiesList":"businessesList");
   if(!list)return;
   list.innerHTML=REAL_ESTATE_ASSETS.filter(a=>a.type===type).map(asset=>{
     const owned=Number(state.realEstateOwned[asset.id]||0);
     const price=realEstateMarketPrice(asset.id);
     const canBuy=state.balance>=price;
     return `<div class="realestate-card ${owned?"owned":""}">
       <span class="realestate-icon">${asset.icon}</span>
       <span class="realestate-main">
         <strong>${asset.name}</strong>
         <small>${asset.daily.toLocaleString("en-US")} coins/day · ${(asset.daily/1440).toFixed(2)} / min</small>
         <small>Market: ${Math.floor(price).toLocaleString("en-US")} coins</small>
         ${owned?`<em>Owned: ${owned}</em>`:""}
       </span>
       <span class="realestate-actions">
         <button type="button" class="realestate-buy" data-realestate="${asset.id}" ${canBuy?"":"disabled"}>Buy</button>
         ${owned?`<button type="button" class="realestate-sell" data-realestate-sell="${asset.id}">Sell</button>`:""}
       </span>
     </div>`;
   }).join("");
   list.querySelectorAll("[data-realestate]").forEach(b=>b.onclick=()=>buyRealEstate(b.dataset.realestate));
   list.querySelectorAll("[data-realestate-sell]").forEach(b=>b.onclick=()=>sellRealEstate(b.dataset.realestateSell));
 });
}
function current(){return miners[state.minerLevel-1]}
function totalMinerDaily(){
 return state.minerInventory.reduce((sum,level)=>{
  const miner=miners[level-1];
  return sum+(miner?miner.daily:0);
 },0);
}
function processMiningPay(offline=false){
 const now=Date.now();
 const minutes=Math.floor(Math.max(0,now-state.lastMiningPay)/60000);
 if(minutes<=0)return false;
 const daily=totalMinerDaily();
 const amount=minutes*(daily/1440);
 if(offline){
   state.storedCoins=Math.max(0,Number(state.storedCoins)||0)+amount;
 }else{
   state.balance+=amount;
 }
 state.miningRemainder+=amount;
 state.totalGenerated+=amount;
 state.lastMiningPay+=minutes*60000;
 return amount>0;
}
function applyOffline(){
 processMiningPay(true);
}
async function save(){
 // Persist gameplay state locally per account, but NEVER persist the balance locally.
 const playerKey=getPlayerStorageKey();
 const localState={...state};
 delete localState.balance;
 await chrome.storage.local.set({[playerKey]:localState});
 if(typeof state.balance==="number"){
  if(feedbackBalanceSnapshot!==null){
   const delta=state.balance-feedbackBalanceSnapshot;
   if(Math.abs(delta)>0.000001)economyFeedback(delta>0?"win":"loss",delta);
  }
  feedbackBalanceSnapshot=state.balance;
 }

  await syncPlayerBalance();
}

let marketTimerBusy=false;
setInterval(async()=>{
 if(marketTimerBusy)return;
 marketTimerBusy=true;
 try{
   if(!gameInitialized||!state)return;
   const before=JSON.stringify(state.market.prices);
   updateMarketPrices();
   applyHourlyMarketEvent();
   const after=JSON.stringify(state.market.prices);
   if(before!==after){
     await save();
     render();
   }
 }finally{marketTimerBusy=false;}
},1000);

let realEstateTimerBusy=false;
setInterval(async()=>{
 if(realEstateTimerBusy)return;
 realEstateTimerBusy=true;
 try{
   if(!gameInitialized||!state)return;
   const paid=processRealEstatePay();
   const now=Date.now();
   const needsMarketUpdate=REAL_ESTATE_ASSETS.some(asset=>
     now-Number(state.realEstateMarket[asset.id]?.lastUpdate||0)>=60000
   );
   const changed=needsMarketUpdate?updateRealEstateMarket():false;
   if(paid||changed){
     await save();
     render();
   }else{
     renderRealEstate();
   }
 }finally{realEstateTimerBusy=false;}
},1000);

let miningTimerBusy=false;
setInterval(async()=>{
 if(miningTimerBusy)return;
 miningTimerBusy=true;
 try{
  if(!gameInitialized||!state)return;
   const paid=processMiningPay();
  if(paid){await save();render();}
 }finally{miningTimerBusy=false;}
},1000);

let jobTimerBusy=false;
setInterval(async()=>{
 if(jobTimerBusy)return;
 jobTimerBusy=true;
 try{
   if(!gameInitialized||!state)return;
   const paid=processJobPay();
   if(paid){await save();render();}
 }finally{jobTimerBusy=false;}
},1000);

const SUPPORT_CONFIG={
 ratingUrl:"https://chromewebstore.google.com/",
 donations:[
   {id:"btc",name:"Bitcoin",short:"BTC",network:"Bitcoin",address:"bc1qt9u09t8gk73hk25d6gl2ew5l8dw2dp9jpcqw6q",logo:"icons/crypto/bitcoin.svg"},
   {id:"eth",name:"Ethereum",short:"ETH",network:"Ethereum",address:"0x5D63a04E8081bbDcA4f8F9E8baadB79b9F832853",logo:"icons/crypto/ethereum.svg"},
   {id:"sol",name:"Solana",short:"SOL",network:"Solana",address:"AfTFsJqMfr6unaUt8tAHzfzz87gtDx6et1gQURovqMhJ",logo:"icons/crypto/solana.svg"}
 ]
};

function renderDonationList(){
 const list=document.getElementById("donationList");
 if(!list)return;
 list.innerHTML=SUPPORT_CONFIG.donations.map((d,i)=>`
   <div class="donation-row">
     <div class="donation-meta">
       <img class="donation-logo" src="${d.logo}" alt="${d.name}">
       <span><strong>${d.name}</strong><small>${d.short} · ${d.network}</small></span>
     </div>
     <div class="donation-address-wrap">
       <div class="donation-address" id="donationAddress${i}" title="${d.address}">${d.address}</div>
       <button type="button" class="donation-copy" data-index="${i}">Copy</button>
     </div>
   </div>`).join("");

 list.querySelectorAll(".donation-copy").forEach(btn=>{
   btn.addEventListener("click",async()=>{
     const d=SUPPORT_CONFIG.donations[Number(btn.dataset.index)];
     let copied=false;
     try{
       if(navigator.clipboard&&window.isSecureContext){
         await navigator.clipboard.writeText(d.address);
         copied=true;
       }
     }catch(e){}
     if(!copied){
       const ta=document.createElement("textarea");
       ta.value=d.address;
       ta.setAttribute("readonly","");
       ta.style.position="fixed";
       ta.style.opacity="0";
       document.body.appendChild(ta);
       ta.focus();
       ta.select();
       try{copied=document.execCommand("copy");}catch(e){}
       ta.remove();
     }
     btn.textContent=copied?"Copied ✓":"Copy failed";
     if(copied)showFloatingNotification("reward",`${d.short} address copied`,"");
     setTimeout(()=>btn.textContent="Copy",1600);
   });
 });
}

function initSupport(){
 const supportButton=document.getElementById("supportHomeButton");
 const backButton=document.getElementById("backSupportHomeButton");
 supportButton?.addEventListener("click",()=>{
   renderDonationList();
   show("supportScreen");
 });
 backButton?.addEventListener("click",()=>show("homeScreen"));

 const rateButton=document.getElementById("rateGameButton");
 rateButton?.addEventListener("click",()=>{
   if(chrome.tabs?.create){
     chrome.tabs.create({url:SUPPORT_CONFIG.ratingUrl});
   }else{
     window.open(SUPPORT_CONFIG.ratingUrl,"_blank");
   }
 });

 const claim=document.getElementById("claimRatingRewardButton");
 if(claim){
   const claimed=!!(state && state.ratingRewardClaimed);
   claim.disabled=claimed;
   claim.textContent=claimed?"Reward collected ✓":"Collect +5,000 🪙";
   claim.addEventListener("click",async()=>{
     if(!state || state.ratingRewardClaimed)return;
     state.balance=Number(state.balance||0)+5000;
     state.ratingRewardClaimed=true;
     await save();
     claim.disabled=true;
     claim.textContent="Reward collected ✓";
     render();
     showFloatingNotification("reward","5-star reward","+5,000 🪙");
   });
 }
 renderDonationList();
}

const GAME_SETTINGS_KEY="cryptoGamesSettings";
const gameSettings=Object.assign({
 sound:true,
 animations:true,
 notifications:true
},JSON.parse(localStorage.getItem(GAME_SETTINGS_KEY)||"{}"));

function saveGameSettings(){
 localStorage.setItem(GAME_SETTINGS_KEY,JSON.stringify(gameSettings));
}
function applyGameSettings(){
 const root=document.documentElement;
 root.classList.toggle("settings-no-animations",!gameSettings.animations);
 root.classList.toggle("settings-no-notifications",!gameSettings.notifications);
 ["Sound","Animations","Notifications"].forEach(name=>{
   const key=name.toLowerCase();
   const button=document.getElementById(`settings${name}Toggle`);
   if(button){
     button.classList.toggle("on",!!gameSettings[key]);
     button.setAttribute("aria-pressed",String(!!gameSettings[key]));
   }
 });
 const accountName=document.getElementById("settingsAccountName");
 if(accountName)accountName.textContent=state?.username||"Account";
}
function toggleGameSetting(key){
 gameSettings[key]=!gameSettings[key];
 saveGameSettings();
 applyGameSettings();
}
function initSettings(){
 document.getElementById("settingsSoundToggle")?.addEventListener("click",()=>toggleGameSetting("sound"));
 document.getElementById("settingsAnimationsToggle")?.addEventListener("click",()=>toggleGameSetting("animations"));
 document.getElementById("settingsNotificationsToggle")?.addEventListener("click",()=>toggleGameSetting("notifications"));
 document.getElementById("settingsAccountButton")?.addEventListener("click",()=>{
   document.getElementById("accountButton")?.click();
 });
 applyGameSettings();
}
function bind(){
 if(window.__cryptoGamesControlsBound)return;
 window.__cryptoGamesControlsBound=true;
 document.getElementById("mineHomeButton").onclick=()=>show("mineScreen");
 document.getElementById("casinoHomeButton").onclick=()=>show("casinoScreen");
 document.getElementById("marketHomeButton").onclick=()=>show("marketScreen");
 document.getElementById("casesHomeButton").onclick=()=>show("casesScreen");
 document.getElementById("inventoryHomeButton").onclick=()=>show("inventoryScreen");
 const viewAllItemsButton=document.getElementById("viewAllItemsButton");
 if(viewAllItemsButton){
   viewAllItemsButton.onclick=()=>{
     show("itemCatalogScreen");
     renderItemCatalog();
     window.scrollTo(0,0);
   };
 }
 const backItemCatalogInventoryButton=document.getElementById("backItemCatalogInventoryButton");
 if(backItemCatalogInventoryButton){
   backItemCatalogInventoryButton.onclick=()=>show("inventoryScreen");
 }
 document.getElementById("settingsHomeButton").onclick=()=>show("settingsScreen");
 document.getElementById("backSettingsHomeButton").onclick=()=>show("homeScreen");
document.getElementById("achievementsHomeButton").onclick=()=>show("achievementsScreen");
document.getElementById("backAchievementsHomeButton").onclick=()=>show("homeScreen");
 document.getElementById("backCasesHomeButton").onclick=()=>show("homeScreen");
 document.getElementById("backInventoryHomeButton").onclick=()=>show("homeScreen");
 document.getElementById("jobsHomeButton").onclick=()=>show("jobsScreen");
 document.getElementById("realEstateHomeButton").onclick=()=>show("realEstateScreen");
 document.getElementById("backRealEstateHomeButton").onclick=()=>show("homeScreen");
 document.getElementById("backJobsHomeButton").onclick=()=>show("homeScreen");
 document.getElementById("backMarketHomeButton").onclick=()=>show("homeScreen");
 document.getElementById("marketBuyButton").onclick=marketBuy;
 document.getElementById("marketSellButton").onclick=marketSell;
 document.getElementById("marketSellAllButton").onclick=marketSellAll;
 document.querySelectorAll("#marketScreen .market-quick").forEach(button=>{
   // onclick replaces the previous handler instead of stacking listeners.
   button.onclick=()=>{
     const input=document.getElementById("marketAmountInput");
     if(!input)return;
     const current=Math.max(0,parseInt(input.value,10)||0);
     const amount=Number(button.dataset.amount)||0;
     input.value=Math.min(100000,current+amount);
   };
 });
 document.getElementById("marketUndoAmount").onclick=()=>{
   document.getElementById("marketAmountInput").value=0;
 };
 document.getElementById("marketClearAmount").onclick=()=>{
   document.getElementById("marketAmountInput").value=0;
 };
 renderMarket();
 document.getElementById("backHomeButton").onclick=()=>show("homeScreen");
 document.getElementById("backCasinoHomeButton").onclick=()=>show("homeScreen");
 document.getElementById("collectButton").onclick=collect;
 document.getElementById("blackjackButton").onclick=()=>show("blackjackScreen");
 document.getElementById("backBlackjackButton").onclick=()=>show("casinoScreen");
 initBlackjack();
 initSlots();
 if(window.__cryptoGamesBindMarketTimer)return;
 window.__cryptoGamesBindMarketTimer=true;
 let marketTimerBusy=false;
 setInterval(async()=>{
   if(!gameInitialized||!state)return;
   if(marketTimerBusy)return;
   marketTimerBusy=true;
   try{
     if(document.getElementById("marketScreen")?.classList.contains("active")){
       await marketRefresh();
     }else{
       const before=JSON.stringify(state.market.prices);
       updateMarketPrices();
       applyHourlyMarketEvent();
       marketUpdateYield();
       if(before!==JSON.stringify(state.market.prices)){
         await save();
         render();
       }
     }
   }finally{
     marketTimerBusy=false;
   }
 },1000);

 document.getElementById("rouletteButton").onclick=()=>show("rouletteScreen");
 document.getElementById("slotsButton").onclick=()=>show("slotScreen");
 document.getElementById("backRouletteButton").onclick=()=>show("casinoScreen");
 document.getElementById("backSlotButton").onclick=()=>show("casinoScreen");
 initRoulette();
}
function resetGameBet(id){
 if(id==="rouletteScreen"){
   rouletteBetAmount=0;
   rouletteBetType=null;
   rouletteStakeHistory=[];
   roundBets=[];
   const input=document.getElementById("stakeInput");
   if(input)input.value=0;
   document.querySelectorAll(".roulette-bet,.number-bet").forEach(b=>b.classList.remove("selected"));
   renderRoundBets();
   updateRouletteMessage();
 }
 if(id==="blackjackScreen"){
   blackjackBet=0;
   blackjackStakeHistory=[];
   const input=document.getElementById("blackjackStakeInput");
   if(input)input.value=0;
   updateBlackjackMessage();
 }
 if(id==="slotScreen"){
   slotStake=0;
   slotStakeHistory=[];
   const input=document.getElementById("slotStakeInput");
   if(input)input.value=0;
   updateSlotMessage();
 }
}
function show(id){
 const screen=document.getElementById(id);
 if(!screen)return;
 resetGameBet(id);
 document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
 screen.classList.add("active");
 render();
  window.scrollTo(0,0);
  document.documentElement.scrollTop=0;
  document.body.scrollTop=0;
}

function updateMarketPrices(){
 const now=Date.now();
 const last=state.market.lastUpdate||now;
 const elapsed=Math.max(0,now-last);
 const steps=Math.min(80,Math.floor(elapsed/MARKET_UPDATE_MS));
 if(steps<=0)return;

 for(let step=0;step<steps;step++){
   MARKET_ASSETS.forEach(asset=>{
     const currentRaw=Number(state.market.prices[asset.symbol]);
     const current=Number.isFinite(currentRaw)&&currentRaw>0?currentRaw:asset.base;
     state.market.previousPrices[asset.symbol]=current;
     const shock=(Math.random()*2-1)*asset.vol;
     const meanReversion=(asset.base-current)*0.0007/asset.base;
     const next=Math.max(asset.base*.15,current*(1+shock+meanReversion));
     state.market.prices[asset.symbol]=Math.round(next*100)/100;

     if(!Array.isArray(state.market.history[asset.symbol]))state.market.history[asset.symbol]=[];
     state.market.history[asset.symbol].push(state.market.prices[asset.symbol]);
     if(state.market.history[asset.symbol].length>MARKET_HISTORY_MAX){
       state.market.history[asset.symbol].splice(0,state.market.history[asset.symbol].length-MARKET_HISTORY_MAX);
     }
   });
 }
 state.market.lastUpdate=last+steps*MARKET_UPDATE_MS;
}

function applyHourlyMarketEvent(){
 const now=Date.now();
 const last=state.market.lastHourlyEvent||now;
 const hours=Math.floor(Math.max(0,now-last)/MARKET_HOUR_MS);
 if(hours<=0)return false;

 let event=MARKET_HOURLY_EVENTS[Math.floor(Math.random()*MARKET_HOURLY_EVENTS.length)];
 for(let h=0;h<hours;h++){
   event=MARKET_HOURLY_EVENTS[Math.floor(Math.random()*MARKET_HOURLY_EVENTS.length)];
   MARKET_ASSETS.forEach(asset=>{
     const current=Number(state.market.prices[asset.symbol]||asset.base);
     state.market.previousPrices[asset.symbol]=current;
     const move=event.min+Math.random()*(event.max-event.min);
     state.market.prices[asset.symbol]=Math.max(
       asset.base*.12,
       Math.round(current*(1+move)*100)/100
     );
     if(!Array.isArray(state.market.history[asset.symbol]))state.market.history[asset.symbol]=[];
     state.market.history[asset.symbol].push(state.market.prices[asset.symbol]);
     if(state.market.history[asset.symbol].length>MARKET_HISTORY_MAX){
       state.market.history[asset.symbol].splice(0,state.market.history[asset.symbol].length-MARKET_HISTORY_MAX);
     }
   });
 }
 state.market.lastHourlyEvent=last+hours*MARKET_HOUR_MS;
 state.market.lastEventText=event.text;
 return true;
}

function marketAsset(symbol){
 return MARKET_ASSETS.find(a=>a.symbol===symbol);
}

function marketPortfolioValue(){
 return MARKET_ASSETS.reduce((sum,a)=>{
   return sum+(Number(state.market.holdings[a.symbol]||0)*Number(state.market.prices[a.symbol]||a.base));
 },0);
}

function marketUpdateYield(){
 const now=Date.now();
 const last=state.market.lastYieldUpdate||now;
 const hours=Math.floor(Math.max(0,now-last)/3600000);
 if(hours<=0)return;
 let yieldCoins=0;
 MARKET_ASSETS.forEach(a=>{
   const held=Number(state.market.holdings[a.symbol]||0);
   const value=held*Number(state.market.prices[a.symbol]||a.base);
   yieldCoins+=value*a.yield*hours;
 });
 yieldCoins=Math.floor(yieldCoins);
 if(yieldCoins>0){
   state.balance+=yieldCoins;
   state.totalGenerated+=yieldCoins;
 }
 state.market.lastYieldUpdate=last+hours*3600000;
}

async function marketRefresh(){
 updateMarketPrices();
 const eventHappened=applyHourlyMarketEvent();
 marketUpdateYield();
 renderMarket(eventHappened);
 await save();
}

function marketSelect(symbol){
 state.market.selected=symbol;
 renderMarket();
}

function requirePositiveBet(value,messageEl,message){
 const amount=Number(value);
 if(!Number.isFinite(amount)||amount<=0){
   if(messageEl)messageEl.textContent=message||"Bet must be greater than 0.";
   return false;
 }
 return true;
}
function marketAmount(){
 const input=document.getElementById("marketAmountInput");
 let value=parseInt(input.value,10);
 if(Number.isNaN(value))value=0;
 return Math.max(0,Math.min(100000,value));
}

async function marketBuy(){
 const symbol=state.market.selected;
 const amount=marketAmount();
 const asset=marketAsset(symbol);
 if(!asset||amount<=0){
   document.getElementById("marketSelected").textContent="Bet must be greater than 0..";
   return;
 }
 const fee=amount*MARKET_FEE;
 const total=amount+fee;
 if(state.balance<total){
   document.getElementById("marketSelected").textContent="Not enough coins.";
   return;
 }
 const price=Number(state.market.prices[symbol]);
 const quantity=amount/price;
 state.balance-=total;
 state.market.holdings[symbol]=Number(state.market.holdings[symbol]||0)+quantity;
 state.market.costBasis[symbol]=Number(state.market.costBasis[symbol]||0)+total;
 state.market.previousPortfolioValue=marketPortfolioValue();
 await save();
 render();
 renderMarket(true);
 const buyButton=document.getElementById("marketBuyButton");
}

async function marketSell(){
 const symbol=state.market.selected;
 const amount=marketAmount();
 const asset=marketAsset(symbol);
 if(!asset||amount<=0){
   document.getElementById("marketSelected").textContent="Bet must be greater than 0..";
   return;
 }
 const price=Number(state.market.prices[symbol]);
 const quantity=amount/price;
 const held=Number(state.market.holdings[symbol]||0);
 if(held<=0){
   document.getElementById("marketSelected").textContent="You do not own this asset.";
   return;
 }
 const sellQuantity=Math.min(quantity,held);
 const gross=sellQuantity*price;
 const fee=gross*MARKET_FEE;
 const received=gross-fee;
 const oldBasis=Number(state.market.costBasis[symbol]||0);
 const soldRatio=held>0?sellQuantity/held:1;
 state.market.holdings[symbol]=Math.max(0,held-sellQuantity);
 state.market.costBasis[symbol]=Math.max(0,oldBasis*(1-soldRatio));
 state.balance+=received;
 await save();
 render();
 renderMarket(true);
 const sellButton=document.getElementById("marketSellButton");
}


async function marketSellAll(){
 const button=document.getElementById("marketSellAllButton");
 let totalReceived=0;
 let soldAny=false;

 MARKET_ASSETS.forEach(asset=>{
   const symbol=asset.symbol;
   const held=Number(state.market.holdings[symbol]||0);
   if(held<=0)return;
   const price=Number(state.market.prices[symbol]||asset.base);
   const gross=held*price;
   const fee=gross*MARKET_FEE;
   totalReceived+=gross-fee;
   state.market.holdings[symbol]=0;
   state.market.costBasis[symbol]=0;
   soldAny=true;
 });

 if(!soldAny){
   const selected=document.getElementById("marketSelected");
   if(selected)selected.textContent="Your portfolio is empty.";
   return;
 }

 state.balance+=totalReceived;
 state.market.previousPortfolioValue=0;
 await save();
 render();
 renderMarket(true);

 if(button){
 }
}

function renderMarket(flash=false){
 const assets=document.getElementById("marketAssets");
 if(!assets)return;

 const selected=state.market.selected||"BITX";
 const currentPortfolio=marketPortfolioValue();
 const previous=Number(state.market.previousPortfolioValue||currentPortfolio);
 if(!state.market.previousPortfolioValue)state.market.previousPortfolioValue=currentPortfolio;

 const valueEl=document.getElementById("marketPortfolioValue");
 const percentEl=document.getElementById("marketPortfolioPercent");
 const plEl=document.getElementById("marketDailyPL");
 const dailyPercentEl=document.getElementById("marketDailyPercent");
 const pl=currentPortfolio-previous;
 const totalCost=MARKET_ASSETS.reduce((sum,a)=>sum+Number(state.market.costBasis[a.symbol]||0),0);
 const totalProfit=currentPortfolio-totalCost;
 const totalProfitPct=totalCost>0?(totalProfit/totalCost)*100:0;
 const dailyPct=previous>0?(pl/previous)*100:0;
 valueEl.textContent=`${Math.floor(currentPortfolio).toLocaleString("en-US")} coins`;
 percentEl.textContent=totalCost>0?(totalProfitPct>=0?"+":"")+totalProfitPct.toFixed(2)+"%":"+0.00%";
 percentEl.style.color=totalProfitPct>=0?"#7bd1a3":"#e9959c";
 plEl.textContent=`${pl>=0?"+":""}${Math.floor(pl).toLocaleString("en-US")} coins`;
 dailyPercentEl.textContent=`${dailyPct>=0?"+":""}${dailyPct.toFixed(2)}%`;
 plEl.style.color=pl>=0?"#73c59a":"#df858d";
 dailyPercentEl.style.color=pl>=0?"#7bd1a3":"#e9959c";

 let hasUp=false,hasDown=false;
 assets.innerHTML=MARKET_ASSETS.map(asset=>{
   const price=Number(state.market.prices[asset.symbol]||asset.base);
   const previousPrice=Number(state.market.previousPrices[asset.symbol]||price);
   const move=price-previousPrice;
   const change=((price-asset.base)/asset.base)*100;
   const direction=move>0?"up":move<0?"down":"flat";
   if(direction==="up")hasUp=true;
   if(direction==="down")hasDown=true;
   return `<button class="market-asset ${selected===asset.symbol?"selected":""} ${flash && move!==0?"market-price-tick":""}" data-symbol="${asset.symbol}">
     <div class="asset-icon">${asset.icon}</div>
     <div class="asset-main"><strong>${asset.symbol}</strong><span>${asset.name}</span></div>
     <div class="asset-price"><strong>${price.toLocaleString("en-US",{maximumFractionDigits:2})}</strong>
       <span class="asset-change ${direction}">${direction==="up"?"▲":direction==="down"?"▼":"—"} ${Math.abs(change).toFixed(2)}%</span>
     </div>
   </button>`;
 }).join("");

 assets.classList.toggle("price-up",hasUp);
 assets.classList.toggle("price-down",hasDown);

 assets.querySelectorAll(".market-asset").forEach(button=>{
   button.onclick=()=>marketSelect(button.dataset.symbol);
 });

 const asset=marketAsset(selected);
 const selectedEl=document.getElementById("marketSelected");
 if(asset){
   const price=Number(state.market.prices[selected]);
   const held=Number(state.market.holdings[selected]||0);
   const value=held*price;
   selectedEl.innerHTML=`<span class="selected-asset-name">${asset.symbol} · ${asset.name}</span><span class="selected-asset-price">${price.toLocaleString("en-US",{maximumFractionDigits:2})} coins</span>`;
   selectedEl.title=`You own ${held.toFixed(4)} · value ${Math.floor(value).toLocaleString("en-US")} coins`;

   const title=document.getElementById("marketChartTitle");
   const chartPrice=document.getElementById("marketChartPrice");
   if(title)title.textContent=asset.symbol;
   if(chartPrice)chartPrice.textContent=`${price.toLocaleString("en-US",{maximumFractionDigits:2})} coins`;
   drawMarketChart(selected,flash);
 }

 const holdings=document.getElementById("marketHoldingsList");
 const owned=MARKET_ASSETS.filter(a=>Number(state.market.holdings[a.symbol]||0)>0);
 holdings.innerHTML=owned.length?owned.map(a=>{
   const q=Number(state.market.holdings[a.symbol]||0);
   const price=Number(state.market.prices[a.symbol]||a.base);
   const value=q*price;
   const basis=Number(state.market.costBasis[a.symbol]||0);
   const profit=value-basis;
   const pct=basis>0?(profit/basis)*100:0;
   const cls=profit>0?"holding-profit":profit<0?"holding-loss":"holding-flat";
   const isSelected=state.market.selected===a.symbol;
   return `<button type="button" class="market-holding market-holding-clickable ${isSelected?"selected-portfolio":""}" data-symbol="${a.symbol}">
     <div class="holding-main">
       <strong>${a.symbol} · ${q.toFixed(4)}</strong>
       <span>Invested ${Math.floor(basis).toLocaleString("en-US")} coins</span>
       ${isSelected?'<span class="portfolio-selected-label">SELECTED FOR TRADE</span>':""}
     </div>
     <div class="holding-value"><strong>${Math.floor(value).toLocaleString("en-US")} coins</strong><small class="${cls}">${profit>=0?"+":""}${Math.floor(profit).toLocaleString("en-US")} · ${pct>=0?"+":""}${pct.toFixed(2)}%</small></div>
   </button>`;
 }).join(""):'<div class="market-empty">No assets yet. Buy your first virtual crypto.</div>';

 const sellAllButton=document.getElementById("marketSellAllButton");
 if(sellAllButton)sellAllButton.disabled=owned.length===0;

 holdings.querySelectorAll(".market-holding-clickable").forEach(row=>{
   row.onclick=()=>{
     const symbol=row.dataset.symbol;
     state.market.selected=symbol;
     renderMarket();
     const trade=document.querySelector("#marketScreen .market-trade");
     if(trade)trade.scrollIntoView({behavior:"auto",block:"nearest"});
   };
 });

 const eventText=document.getElementById("marketEventText");
 const eventTimer=document.getElementById("marketEventTimer");
 if(eventText)eventText.textContent=state.market.lastEventText||"Waiting for the next market event...";
 if(eventTimer){
   const remaining=Math.max(0,MARKET_HOUR_MS-(Date.now()-(state.market.lastHourlyEvent||Date.now())));
   const minutes=Math.floor(remaining/60000);
   const seconds=Math.floor((remaining%60000)/1000);
   eventTimer.textContent=`Next event ${minutes}:${String(seconds).padStart(2,"0")}`;
 }
 const eventBanner=document.getElementById("marketEventBanner");
 if(eventBanner&&flash){
 }
}

function drawMarketChart(symbol,animate=false){
 const line=document.getElementById("marketChartLine");
 const area=document.getElementById("marketChartArea");
 const svg=document.getElementById("marketChart");
 const history=(state.market.history[symbol]||[]).slice(-MARKET_HISTORY_MAX);
 if(!line||!area||history.length<1)return;

 const width=320,height=100,pad=5;
 const min=Math.min(...history),max=Math.max(...history);
 const range=max-min||Math.max(1,max*.01);
 const points=history.map((value,i)=>{
   const x=pad+(i/Math.max(1,history.length-1))*(width-pad*2);
   const y=height-pad-((value-min)/range)*(height-pad*2);
   return [x,y];
 });
 const path=points.map((p,i)=>(i===0?"M":"L")+` ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
 const first=points[0],last=points[points.length-1];
 const areaPath=`${path} L ${last[0].toFixed(1)} ${height-pad} L ${first[0].toFixed(1)} ${height-pad} Z`;
 line.setAttribute("d",path);
 area.setAttribute("d",areaPath);
 if(animate){
   svg.classList.remove("updated");void svg.offsetWidth;svg.classList.add("updated");
 }
}

async function collect(){
 processMiningPay();
 if(state.storedCoins>0){
  state.balance+=state.storedCoins;
  state.storedCoins=0;
 }
 state.lastCollection=Date.now();
 state.miningReadyNotificationShown=false;
 await save();
 render();
}
async function upgrade(level){
 const m=miners[level-1];
 if(!m||level!==state.minerLevel+1||state.balance<m.cost)return;
 state.balance-=m.cost;
 if(!Array.isArray(state.minerInventory))state.minerInventory=[state.minerLevel];
 if(!state.minerInventory.includes(level))state.minerInventory.push(level);
 state.minerInventory=[...new Set(state.minerInventory.map(Number))].sort((a,b)=>a-b);
 state.minerLevel=level;
 await save();
 render();
}

const rouletteNumbers=[
 {n:0,c:"green"},{n:32,c:"red"},{n:15,c:"black"},{n:19,c:"red"},{n:4,c:"black"},
 {n:21,c:"red"},{n:2,c:"black"},{n:25,c:"red"},{n:17,c:"black"},{n:34,c:"red"},
 {n:6,c:"black"},{n:27,c:"red"},{n:13,c:"black"},{n:36,c:"red"},{n:11,c:"black"},
 {n:30,c:"red"},{n:8,c:"black"},{n:23,c:"red"},{n:10,c:"black"},{n:5,c:"red"},
 {n:24,c:"black"},{n:16,c:"red"},{n:33,c:"black"},{n:1,c:"red"},{n:20,c:"black"},
 {n:14,c:"red"},{n:31,c:"black"},{n:9,c:"red"},{n:22,c:"black"},{n:18,c:"red"},
 {n:29,c:"black"},{n:7,c:"red"},{n:28,c:"black"},{n:12,c:"red"},{n:35,c:"black"},
 {n:3,c:"red"},{n:26,c:"black"}
];
let rouletteBetAmount=0,rouletteBetType=null,rouletteSpinning=false,rouletteOffset=0,roundBets=[],rouletteStakeHistory=[];

function initRoulette(){
 const track=document.getElementById("rouletteTrack");
 if(!track)return;
 const build=[];
 for(let cycle=0;cycle<8;cycle++)rouletteNumbers.forEach(x=>build.push(x));
 track.innerHTML=build.map(x=>`<div class="roulette-tile ${x.c}">${x.n}</div>`).join("");

 const grid=document.getElementById("numberGrid");
 grid.innerHTML="";
 for(let n=1;n<=36;n++){
   const b=document.createElement("button");
   b.className=`number-bet ${rouletteColor(n)}`;
   b.dataset.bet=`number-${n}`;
   b.textContent=n;
   grid.appendChild(b);
 }

 document.getElementById("stakeInput").addEventListener("input",e=>{
   if(rouletteSpinning)return;
   let v=parseInt(e.target.value,10);
   if(Number.isNaN(v))v=0;
   rouletteBetAmount=Math.max(0,Math.min(100000,v));
   e.target.value=rouletteBetAmount;
   updateRouletteMessage();
 });

 document.querySelectorAll("#rouletteScreen .quick-stake").forEach(b=>{
   if(b.dataset.quickStakeBound==="1")return;
   b.dataset.quickStakeBound="1";
   b.addEventListener("click",()=>{
     if(rouletteSpinning)return;
     rouletteStakeHistory.push(rouletteBetAmount);
     rouletteBetAmount=Math.min(100000,rouletteBetAmount+Number(b.dataset.amount));
     document.getElementById("stakeInput").value=rouletteBetAmount;
     b.classList.remove("stake-added");
     void b.offsetWidth;
     b.classList.add("stake-added");
     updateRouletteMessage();
   });
 });

 document.getElementById("rouletteUndoStake").addEventListener("click",()=>{
 if(rouletteSpinning)return;

 // Undo removes the most recently placed bet from the betting table.
 if(roundBets.length){
   roundBets.pop();
   rouletteBetType=roundBets.length?roundBets[roundBets.length-1].bet:null;
   document.querySelectorAll(".roulette-bet,.number-bet").forEach(x=>x.classList.remove("selected"));
   if(rouletteBetType){
     const selected=document.querySelector(`[data-bet="${rouletteBetType}"]`);
     if(selected)selected.classList.add("selected");
   }
   renderRoundBets();
   updateRouletteMessage();
   return;
 }

 // If there are no placed bets, Undo still behaves normally for the stake.
 rouletteBetAmount=rouletteStakeHistory.length?rouletteStakeHistory.pop():0;
 document.getElementById("stakeInput").value=rouletteBetAmount;
 updateRouletteMessage();
});

document.getElementById("rouletteClearStake").addEventListener("click",()=>{
 if(rouletteSpinning)return;

 // Clear removes every bet from the betting table and all chip stacks.
 roundBets=[];
 rouletteBetType=null;
 rouletteStakeHistory=[];
 rouletteBetAmount=0;
 document.getElementById("stakeInput").value=0;
 document.querySelectorAll(".roulette-bet,.number-bet").forEach(x=>x.classList.remove("selected"));
 renderRoundBets();
 updateRouletteMessage();
});
 document.querySelectorAll(".roulette-bet,.number-bet").forEach(b=>b.addEventListener("click",()=>{
   if(rouletteSpinning)return;

   // Clicking a roulette square now directly places the current stake.
   // Clicking another square adds another independent bet for the same stake.
   document.querySelectorAll(".roulette-bet,.number-bet").forEach(x=>x.classList.remove("selected"));
   rouletteBetType=b.dataset.bet;
   b.classList.add("selected");
   addBet();
 }));

 document.getElementById("addBetButton").addEventListener("click",addBet);
 document.getElementById("spinRouletteButton").addEventListener("click",spinRoulette);
 renderRoundBets();
}

function formatBetName(bet){
 const names={red:"Red",black:"Black",odd:"Odd",even:"Even",low:"1–18",high:"19–36",
 dozen1:"1st 12",dozen2:"2nd 12",dozen3:"3rd 12",column1:"Column 1",column2:"Column 2",column3:"Column 3"};
 if(names[bet])return names[bet];
 if(bet==="number-0")return "0";
 if(bet.startsWith("number-"))return bet.substring(7);
 return bet;
}
function updateRouletteMessage(){
 const r=document.getElementById("rouletteResult");
 r.textContent=rouletteBetType
   ? `${rouletteBetAmount.toLocaleString("en-US")} coins ready on ${formatBetName(rouletteBetType)}`
   : "Choose a bet";
}
function rouletteColor(n){
 if(n===0)return"green";
 const reds=[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
 return reds.includes(n)?"red":"black";
}
function isWinningBet(b,n){
 if(b==="red")return rouletteColor(n)==="red";
 if(b==="black")return rouletteColor(n)==="black";
 if(b==="odd")return n!==0&&n%2===1;
 if(b==="even")return n!==0&&n%2===0;
 if(b==="low")return n>=1&&n<=18;
 if(b==="high")return n>=19&&n<=36;
 if(b==="dozen1")return n>=1&&n<=12;
 if(b==="dozen2")return n>=13&&n<=24;
 if(b==="dozen3")return n>=25&&n<=36;
 if(b==="column1")return n!==0&&n%3===1;
 if(b==="column2")return n!==0&&n%3===2;
 if(b==="column3")return n!==0&&n%3===0;
 if(b.startsWith("number-"))return n===Number(b.substring(7));
 return false;
}
function payoutMultiplier(b){
 if(["red","black","odd","even","low","high"].includes(b))return 2;
 if(["dozen1","dozen2","dozen3","column1","column2","column3"].includes(b))return 3;
 return 36;
}
function addBet(){
 if(rouletteSpinning)return;
 if(!rouletteBetType){
   document.getElementById("rouletteResult").textContent="Select a bet first.";
   return;
 }
 const amount=Math.max(0,Math.min(100000,Math.floor(rouletteBetAmount)));
 if(amount<=0){
   document.getElementById("rouletteResult").textContent="Enter a stake greater than 0.";
   return;
 }
 const total=roundBets.reduce((s,b)=>s+b.amount,0);
 if(total+amount>100000){
   document.getElementById("rouletteResult").textContent="Maximum total stake is 100,000 coins.";
   return;
 }
 if(state.balance<total+amount){
   document.getElementById("rouletteResult").textContent="Not enough coins.";
   return;
 }
 const existing=roundBets.find(b=>b.bet===rouletteBetType);
 if(existing)existing.amount+=amount;
 else roundBets.push({bet:rouletteBetType,amount});
 const selectedSquare=document.querySelector(`[data-bet="${rouletteBetType}"]`);
 if(selectedSquare){
   selectedSquare.classList.remove("bet-added");
   void selectedSquare.offsetWidth;
   selectedSquare.classList.add("bet-added");
   setTimeout(()=>selectedSquare.classList.remove("bet-added"),320);
 }
 animateBetCoins(rouletteBetType);
 const addButton=document.getElementById("addBetButton");
 addButton.classList.remove("bet-added");
 void addButton.offsetWidth;
 addButton.classList.add("bet-added");
 renderRoundBets();
 updateRouletteMessage();
}
function animateBetCoins(bet){
 const target=document.querySelector(`[data-bet="${bet}"]`);
 const origin=document.getElementById("stakeInput");
 if(!target||!origin)return;
 const a=origin.getBoundingClientRect(),b=target.getBoundingClientRect();
 const coin=document.createElement("div");
 coin.className="coin-fly";coin.textContent="C";
 coin.style.left=`${a.left+a.width/2-12}px`;coin.style.top=`${a.top+a.height/2-12}px`;
 coin.style.setProperty("--dx",`${b.left+b.width/2-(a.left+a.width/2)}px`);
 coin.style.setProperty("--dy",`${b.top+b.height/2-(a.top+a.height/2)}px`);
 document.body.appendChild(coin);
 setTimeout(()=>coin.remove(),550);
}
function renderRoundBets(){
 const list=document.getElementById("roundBetsList"),total=document.getElementById("roundTotal");
 if(!list||!total)return;
 const sum=roundBets.reduce((s,b)=>s+b.amount,0);
 total.textContent=`${sum.toLocaleString("en-US")} coins`;
 if(!roundBets.length){
   list.innerHTML='<div class="empty-bets">No bets placed</div>';
 }else{
   list.innerHTML=roundBets.map((b,i)=>`<div class="round-bet-row"><span class="round-bet-name">${formatBetName(b.bet)}</span><span class="round-bet-amount">${b.amount.toLocaleString("en-US")}</span><button class="remove-bet" data-index="${i}">❌</button></div>`).join("");
   list.querySelectorAll(".remove-bet").forEach(b=>b.onclick=()=>{roundBets.splice(Number(b.dataset.index),1);renderRoundBets();});
 }
 document.querySelectorAll(".bet-chip-stack").forEach(x=>x.remove());
 roundBets.forEach(b=>{
   const target=document.querySelector(`[data-bet="${b.bet}"]`);
   if(!target)return;
   target.style.position="relative";
   const stack=document.createElement("div");
   stack.className="bet-chip-stack";
   const count=Math.min(5,Math.max(1,Math.ceil(b.amount/500)));
   stack.innerHTML=Array.from({length:count},(_,i)=>`<div class="bet-chip">${i===count-1?(b.amount>=1000?Math.round(b.amount/1000)+"K":b.amount):""}</div>`).join("");
   target.appendChild(stack);
 });
}
async function spinRoulette(){
 if(rouletteSpinning)return;
 const result=document.getElementById("rouletteResult"),button=document.getElementById("spinRouletteButton");
 if(!roundBets.length){result.textContent="Add at least one bet first.";return;}
 const totalStake=roundBets.reduce((s,b)=>s+b.amount,0);
 if(state.balance<totalStake){result.textContent="Not enough coins.";return;}

 rouletteSpinning=true;button.disabled=true;
 result.className="roulette-result spinning-result";
 result.textContent="Spinning...";
 const track=document.getElementById("rouletteTrack");
 track.classList.add("spinning");
 state.balance-=totalStake;await save();render();

 const zeroIndex=rouletteNumbers.findIndex(x=>x.n===0);

/*
 * Controlled fictional roulette:
 * - Standard displayed board: 0-36
 * - Standard payouts remain unchanged: 2x / 3x / 36x
 * - Target RTP: 90%
 * - 0 has weight 4, every number 1-36 has weight 1.
 *   => 0 = 10%, each number = 2.5%
 *
 * This gives the casino a stable ~10% mathematical edge over a large
 * sample while keeping every result possible and the visible game rules
 * familiar.
 */
const zeroWeight=4;
const numberWeight=1;
const totalWeight=zeroWeight+36*numberWeight;
let roll=Math.random()*totalWeight;
let winningIndex=zeroIndex;

if(roll>=zeroWeight){
  roll-=zeroWeight;
  winningIndex=Math.min(36,Math.floor(roll/numberWeight)+1);
}

const winning=rouletteNumbers[winningIndex];
 const tileWidth=55,centerIndex=3*rouletteNumbers.length+winningIndex;
 rouletteOffset=-(centerIndex*tileWidth)+((420/2)-(tileWidth/2));
 track.style.transition="transform 0s";track.style.transform="translateX(0px)";void track.offsetWidth;
 track.style.transition="transform 4.8s cubic-bezier(.12,.72,.18,1)";
 track.style.transform=`translateX(${rouletteOffset}px)`;
 await new Promise(r=>setTimeout(r,4900));

 track.classList.remove("spinning");
 const resultTiles=track.querySelectorAll(".roulette-tile");
 const winningTile=resultTiles[centerIndex];
 if(winningTile){
   winningTile.classList.remove("result-tile");
   void winningTile.offsetWidth;
   winningTile.classList.add("result-tile");
 }

 let payout=0,wins=0;
 roundBets.forEach(b=>{if(isWinningBet(b.bet,winning.n)){payout+=b.amount*payoutMultiplier(b.bet);wins++;}});
 await new Promise(r=>setTimeout(r,260));
 if(payout>0){
   state.balance+=payout;result.className="roulette-result win";
   result.innerHTML=`<strong>${winning.n} ${winning.c}</strong> · ${wins} winning bet${wins>1?"s":""} · Payout ${payout.toLocaleString("en-US")} coins`;
 }else{
   result.className="roulette-result loss";
   result.innerHTML=`<strong>${winning.n} ${winning.c}</strong> · All bets lost`;
 }
 await save();render();
 roundBets=[];rouletteBetType=null;
 document.querySelectorAll(".roulette-bet,.number-bet").forEach(x=>x.classList.remove("selected"));
 renderRoundBets();
 rouletteSpinning=false;button.disabled=false;
}


const blackjackSuits=["♠","♥","♦","♣"];
const blackjackRanks=[
 {rank:"A",value:11},{rank:"2",value:2},{rank:"3",value:3},{rank:"4",value:4},
 {rank:"5",value:5},{rank:"6",value:6},{rank:"7",value:7},{rank:"8",value:8},
 {rank:"9",value:9},{rank:"10",value:10},{rank:"J",value:10},{rank:"Q",value:10},{rank:"K",value:10}
];
let blackjackDeck=[];
let blackjackPlayer=[];
let blackjackDealer=[];
let blackjackBet=10;
let blackjackStakeHistory=[];
let blackjackActive=false;
let blackjackFirstTurn=false;

function initBlackjack(){
 const input=document.getElementById("blackjackStakeInput");
 if(!input)return;

 input.addEventListener("input",()=>{
   if(blackjackActive)return;
   let value=parseInt(input.value,10);
   if(Number.isNaN(value))value=0;
   blackjackBet=Math.max(0,Math.min(100000,value));
   input.value=blackjackBet;
   updateBlackjackMessage();
 });

 document.querySelectorAll(".blackjack-quick-stake").forEach(button=>{
   button.addEventListener("click",()=>{
     if(blackjackActive)return;
     blackjackStakeHistory.push(blackjackBet);
     blackjackBet=Math.min(100000,blackjackBet+Number(button.dataset.amount));
     input.value=blackjackBet;
     updateBlackjackMessage();
   });
 });

 document.getElementById("blackjackUndoStake").addEventListener("click",()=>{
   if(blackjackActive)return;
   blackjackBet=blackjackStakeHistory.length?blackjackStakeHistory.pop():0;
   input.value=blackjackBet;
   updateBlackjackMessage();
 });
 document.getElementById("blackjackClearStake").addEventListener("click",()=>{
   if(blackjackActive)return;
   blackjackStakeHistory=[];
   blackjackBet=0;
   input.value=0;
   updateBlackjackMessage();
 });

 document.getElementById("blackjackDealButton").onclick=startBlackjack;
 document.getElementById("blackjackHitButton").onclick=blackjackHit;
 document.getElementById("blackjackStandButton").onclick=blackjackStand;
 document.getElementById("blackjackDoubleButton").onclick=blackjackDouble;
 

 renderBlackjack();
}

function createDeck(){
 const deck=[];
 blackjackSuits.forEach(suit=>{
   blackjackRanks.forEach(card=>{
     deck.push({rank:card.rank,value:card.value,suit});
   });
 });
 for(let i=deck.length-1;i>0;i--){
   const j=Math.floor(Math.random()*(i+1));
   [deck[i],deck[j]]=[deck[j],deck[i]];
 }
 return deck;
}

function drawCard(){
 return blackjackDeck.pop();
}

function handValue(hand){
 let total=hand.reduce((sum,c)=>sum+c.value,0);
 let aces=hand.filter(c=>c.rank==="A").length;
 while(total>21&&aces>0){
   total-=10;
   aces--;
 }
 return total;
}

function isBlackjack(hand){
 return hand.length===2&&handValue(hand)===21;
}

function cardHTML(card,hidden=false,animation=""){
 if(hidden)return '<div class="playing-card hidden-card"></div>';
 const red=card.suit==="♥"||card.suit==="♦";
 return `<div class="playing-card ${red?"red-card":""} ${animation}"><span class="rank">${card.rank}</span><span class="suit">${card.suit}</span></div>`;
}

function renderBlackjack(hideDealer=true,animate=false,reveal=false){
 const dealerCards=document.getElementById("dealerCards");
 const playerCards=document.getElementById("playerCards");
 const dealerScore=document.getElementById("dealerScore");
 const playerScore=document.getElementById("playerScore");
 if(!dealerCards)return;

 dealerCards.innerHTML=blackjackDealer.map((c,i)=>{
   if(hideDealer&&i===1)return cardHTML(c,true);
   return cardHTML(c,false,animate?"card-enter":(reveal&&i===1?"dealer-reveal":""));
 }).join("");

 playerCards.innerHTML=blackjackPlayer.map(c=>cardHTML(c,false,animate?"card-enter":"")).join("");

 dealerScore.textContent=hideDealer&&blackjackDealer.length>1
   ? blackjackDealer[0]?handValue([blackjackDealer[0]]):"?"
   : handValue(blackjackDealer);
 playerScore.textContent=blackjackPlayer.length?handValue(blackjackPlayer):"0";
}

async function dealWithAnimation(){
 renderBlackjack(true,true,false);
 await new Promise(resolve=>setTimeout(resolve,520));
}

async function revealDealerWithAnimation(){
 renderBlackjack(false,false,true);
 await new Promise(resolve=>setTimeout(resolve,820));
}

function updateBlackjackMessage(){
 if(blackjackActive)return;
 const result=document.getElementById("blackjackResult");
 result.textContent=`Stake ${blackjackBet.toLocaleString("en-US")} coins`;
}

async function startBlackjack(){
 if(blackjackActive)return;

 const result=document.getElementById("blackjackResult");
 if(blackjackBet<=0){
   result.textContent="Enter a stake greater than 0.";
   return;
 }
 if(state.balance<blackjackBet){
   result.textContent="Not enough coins.";
   return;
 }

 blackjackDeck=createDeck();
 blackjackPlayer=[drawCard(),drawCard()];
 blackjackDealer=[drawCard(),drawCard()];
 blackjackActive=true;
 blackjackFirstTurn=true;

 state.balance-=blackjackBet;
 await save();
 render();

 document.getElementById("blackjackDealButton").disabled=true;
 document.getElementById("blackjackStakeInput").disabled=true;
 document.querySelectorAll(".blackjack-quick-stake").forEach(b=>b.disabled=true);
 document.getElementById("blackjackHitButton").disabled=false;
 document.getElementById("blackjackStandButton").disabled=false;
 document.getElementById("blackjackDoubleButton").disabled=false;

 await dealWithAnimation();

 if(isBlackjack(blackjackPlayer)||isBlackjack(blackjackDealer)){
   if(isBlackjack(blackjackPlayer)&&isBlackjack(blackjackDealer)){
     finishBlackjack("Push. Both have blackjack.",blackjackBet);
   }else if(isBlackjack(blackjackPlayer)){
     const payout=Math.floor(blackjackBet*2.5);
     state.balance+=payout;
     finishBlackjack("Blackjack. Payout 3:2.",payout);
   }else{
     finishBlackjack("Dealer has blackjack.",0);
   }
 }
}

async function blackjackHit(){
 if(!blackjackActive)return;
 blackjackFirstTurn=false;
 blackjackPlayer.push(drawCard());
 renderBlackjack(true,true,false);
 await new Promise(resolve=>setTimeout(resolve,520));

 if(handValue(blackjackPlayer)>21){
   finishBlackjack("Bust. Dealer wins.",0);
 }else if(handValue(blackjackPlayer)===21){
   await blackjackStand();
 }
}

async function blackjackDouble(){
 if(!blackjackActive||!blackjackFirstTurn)return;

 if(state.balance<blackjackBet){
   document.getElementById("blackjackResult").textContent="Not enough coins to double.";
   return;
 }

 state.balance-=blackjackBet;
 blackjackBet*=2;
 blackjackFirstTurn=false;
 blackjackPlayer.push(drawCard());
 render();
 renderBlackjack(true,true,false);
 await new Promise(resolve=>setTimeout(resolve,520));

 if(handValue(blackjackPlayer)>21){
   finishBlackjack("Bust. Dealer wins.",0);
 }else{
   await blackjackStand();
 }
}

async function blackjackStand(){
 if(!blackjackActive)return;

 blackjackFirstTurn=false;
 await revealDealerWithAnimation();
 while(handValue(blackjackDealer)<17){
   blackjackDealer.push(drawCard());
   renderBlackjack(false,true,false);
   await new Promise(resolve=>setTimeout(resolve,620));
 }

 const player=handValue(blackjackPlayer);
 const dealer=handValue(blackjackDealer);
 renderBlackjack(false);

 if(dealer>21){
   const payout=blackjackBet*2;
   state.balance+=payout;
   finishBlackjack("Dealer busts. You win.",payout);
 }else if(player>dealer){
   const payout=blackjackBet*2;
   state.balance+=payout;
   finishBlackjack("You win.",payout);
 }else if(player===dealer){
   state.balance+=blackjackBet;
   finishBlackjack("Push. Your bet is returned.",blackjackBet);
 }else{
   finishBlackjack("Dealer wins.",0);
 }
}

async function finishBlackjack(message,payout){
 blackjackActive=false;
 await save();
 render();
 renderBlackjack(false);

 const result=document.getElementById("blackjackResult");
 result.className=payout>blackjackBet?"roulette-result win":payout>0?"roulette-result":"roulette-result loss";
 result.textContent=`${message} ${payout>0?`Payout ${payout.toLocaleString("en-US")} coins`:""}`.trim();

 document.getElementById("blackjackHitButton").disabled=true;
 document.getElementById("blackjackStandButton").disabled=true;
 document.getElementById("blackjackDoubleButton").disabled=true;

  // Keep the result visible briefly, then automatically return to the bet screen.
  setTimeout(()=>{
    if(!blackjackActive) resetBlackjack();
  },1600);
}

function resetBlackjack(){
 blackjackPlayer=[];
 blackjackDealer=[];
 blackjackDeck=[];
 blackjackBet=Math.max(1,Math.min(100000,blackjackBet));
 blackjackActive=false;
 blackjackFirstTurn=false;

 const input=document.getElementById("blackjackStakeInput");
 input.disabled=false;
 input.value=blackjackBet;
 document.querySelectorAll(".blackjack-quick-stake").forEach(b=>b.disabled=false);

 document.getElementById("blackjackDealButton").disabled=false;
 document.getElementById("blackjackHitButton").disabled=true;
 document.getElementById("blackjackStandButton").disabled=true;
 document.getElementById("blackjackDoubleButton").disabled=true;

 const result=document.getElementById("blackjackResult");
 result.className="roulette-result";
 result.textContent=`Stake ${blackjackBet.toLocaleString("en-US")} coins`;
 renderBlackjack(false);
 render();
}


const slotSymbols=[
 {symbol:"7",weight:1},
 {symbol:"BAR",weight:3},
 {symbol:"★",weight:10},
 {symbol:"♦",weight:18},
 {symbol:"●",weight:31},
 {symbol:"♠",weight:37}
];
let slotStake=10;
let slotStakeHistory=[];
let slotSpinning=false;
let slotAutoSpin=false;

function initSlots(){
 const input=document.getElementById("slotStakeInput");
 if(!input)return;

 input.addEventListener("input",()=>{
   if(slotSpinning)return;
   let value=parseInt(input.value,10);
   if(Number.isNaN(value))value=0;
   slotStake=Math.max(0,Math.min(100000,value));
   input.value=slotStake;
   updateSlotMessage();
 });

 document.querySelectorAll(".slot-quick-stake").forEach(button=>{
   button.addEventListener("click",()=>{
     if(slotSpinning)return;
     slotStakeHistory.push(slotStake);
     slotStake=Math.min(100000,slotStake+Number(button.dataset.amount));
     input.value=slotStake;
     button.classList.remove("stake-added");
     void button.offsetWidth;
     button.classList.add("stake-added");
     updateSlotMessage();
   });
 });

 document.getElementById("slotUndoStake").onclick=()=>{
   if(slotSpinning)return;
   slotStake=slotStakeHistory.length?slotStakeHistory.pop():0;
   input.value=slotStake;
   updateSlotMessage();
 };
 document.getElementById("slotClearStake").onclick=()=>{
   if(slotSpinning)return;
   slotStakeHistory=[];
   slotStake=0;
   input.value=0;
   updateSlotMessage();
 };
 document.getElementById("slotSpinButton").onclick=spinSlots;
 document.getElementById("slotAutoSpinButton").onclick=()=>{
   // OFF must always be available, including during an active spin.
   slotAutoSpin=!slotAutoSpin;
   updateAutoSpinButton();
   if(slotAutoSpin && !slotSpinning) spinSlots();
 };

 updateAutoSpinButton();
 updateSlotMessage();
}

function updateAutoSpinButton(){
 const button=document.getElementById("slotAutoSpinButton");
 if(!button)return;
 button.textContent=slotAutoSpin?"Auto Spin: ON":"Auto Spin: OFF";
 button.classList.toggle("active",slotAutoSpin);
 button.setAttribute("aria-pressed",slotAutoSpin?"true":"false");
}

function updateSlotMessage(){
 if(slotSpinning)return;
 document.getElementById("slotResult").textContent=
   slotStake>0?`Stake ${slotStake.toLocaleString("en-US")} coins`:"Enter a stake";
}

function weightedSlotSymbol(){
 const total=slotSymbols.reduce((sum,x)=>sum+x.weight,0);
 let roll=Math.random()*total;
 for(const item of slotSymbols){
   roll-=item.weight;
   if(roll<0)return item.symbol;
 }
 return slotSymbols[slotSymbols.length-1].symbol;
}

function setSlotReel(index,symbol){
 const reel=document.getElementById(`slotReel${index}`);
 reel.innerHTML=`<div class="slot-symbol">${symbol}</div>`;
}

function slotPayout(a,b,c,stake){
  // Slot payouts: 3x 7 = 25x, 3x same = 12x, 2x same = 1x, BAR combo = 6x
  if(a==="7"&&b==="7"&&c==="7")return stake*25;
  if(a==="BAR"&&b==="BAR"&&c==="BAR")return stake*6;
  if(a===b&&b===c)return stake*12;
  if(a===b||a===c||b===c)return stake;
  return 0;
}

async function spinSlots(){
 if(slotSpinning)return;
 const result=document.getElementById("slotResult");
 const button=document.getElementById("slotSpinButton");

 if(slotStake<=0){
   result.textContent="Enter a stake greater than 0.";
   return;
 }
 if(state.balance<slotStake){
   result.textContent="Not enough coins.";
   slotAutoSpin=false;
   updateAutoSpinButton();
   return;
 }

 slotSpinning=true;
 button.disabled=true;
 result.className="roulette-result spinning-result";
 result.textContent="Spinning...";

 state.balance-=slotStake;
 await save();
 render();

 const reels=[
   document.getElementById("slotReel1"),
   document.getElementById("slotReel2"),
   document.getElementById("slotReel3")
 ];
 reels.forEach(reel=>{
   reel.classList.remove("spinning","stop-pop","win-reel");
   void reel.offsetWidth;
   reel.classList.add("spinning");
 });

 const resultSymbols=[weightedSlotSymbol(),weightedSlotSymbol(),weightedSlotSymbol()];

 await new Promise(resolve=>setTimeout(resolve,850));
 setSlotReel(1,resultSymbols[0]);
 reels[0].classList.remove("spinning");
 reels[0].classList.add("stop-pop");

 await new Promise(resolve=>setTimeout(resolve,480));
 setSlotReel(2,resultSymbols[1]);
 reels[1].classList.remove("spinning");
 reels[1].classList.add("stop-pop");

 await new Promise(resolve=>setTimeout(resolve,620));
 setSlotReel(3,resultSymbols[2]);
 reels[2].classList.remove("spinning");
 reels[2].classList.add("stop-pop");

 await new Promise(resolve=>setTimeout(resolve,350));

 const payout=slotPayout(resultSymbols[0],resultSymbols[1],resultSymbols[2],slotStake);
 const lastWin=document.getElementById("slotLastWin");

 if(payout>0){
   state.balance+=payout;
   result.className="roulette-result win";
   result.innerHTML=`Win · +${payout.toLocaleString("en-US")} coins`;
   lastWin.textContent=`+${payout.toLocaleString("en-US")}`;
   reels.forEach(reel=>{
     reel.classList.remove("win-reel");
     void reel.offsetWidth;
     reel.classList.add("win-reel");
   });
 }else{
   result.className="roulette-result loss";
   result.innerHTML="No win";
   lastWin.textContent="—";
 }

 await save();
 render();

 slotSpinning=false;
 button.disabled=false;

 if(!slotAutoSpin){
   updateAutoSpinButton();
   return;
 }

 if(slotAutoSpin){
   if(state.balance>=slotStake){
     await new Promise(resolve=>setTimeout(resolve,550));
     if(slotAutoSpin) spinSlots();
   }else{
     slotAutoSpin=false;
     updateAutoSpinButton();
   }
 }
}

function caseRarityClass(r){return String(r).toLowerCase();}
function pickCaseRarity(weights){
 const entries=Object.entries(weights);
 let roll=Math.random()*entries.reduce((s,[,w])=>s+Number(w),0);
 for(const [rarity,weight] of entries){
   roll-=Number(weight);
   if(roll<=0)return rarity;
 }
 return entries[entries.length-1][0];
}
function pickCaseItem(rarity,caseIndex=0){
 const tier=Number(caseIndex)+1;
 const pool=CASE_ITEMS.filter(x=>x.rarity===rarity && Number(x.minCase||1)<=tier);
 return pool[Math.floor(Math.random()*pool.length)]||CASE_ITEMS[0];
}
let caseUI={caseId:null,phase:null,result:null};

function setCaseButtonResult(button,reward){
 if(!button)return;
 button.classList.remove("case-opening","case-reward");
 void button.offsetWidth;
 button.classList.add("case-reward");
 if(reward.item){
   button.innerHTML=`<span class="case-button-result-icon">${reward.item.icon}</span><span class="case-button-result-label">ITEM</span><span class="case-button-result-main">${reward.item.name}</span><span class="case-button-result-sub">${reward.item.rarity} · Value ${reward.item.value.toLocaleString("en-US")} 🪙</span>`;
 }else{
   button.innerHTML=`<span class="case-button-result-icon">🪙</span><span class="case-button-result-label">COINS</span><span class="case-button-result-main">+${reward.money.toLocaleString("en-US")}</span><span class="case-button-result-sub">Coins added to balance</span>`;
 }
}

function renderCases(){
 const list=document.getElementById("casesList");
 if(!list)return;
 list.innerHTML=CASES.map(box=>{
   const active=caseUI.caseId===box.id&&caseUI.phase;
   const disabled=active||Number(state.balance)<box.price;
   let buttonContent=`Open · ${box.price.toLocaleString("en-US")} 🪙`;
   let cls="case-open-button";
   if(active&&caseUI.phase==="opening"){
     cls+=" case-opening";
     buttonContent=`<span class="case-button-icon">${box.icon}</span><span>Opening…</span>`;
   }else if(active&&caseUI.phase==="reward"&&caseUI.result){
     cls+=" case-reward";
   }
   return `<div class="case-card">
     <div class="case-card-top"><div class="case-icon">${box.icon}</div><div class="case-info"><strong>${box.name}</strong><span>${box.description}</span></div></div>
     <div class="case-odds"><span>Common ${box.weights.Common}%</span><span>Uncommon ${box.weights.Uncommon}%</span><span>Rare ${box.weights.Rare}%</span><span>Epic ${box.weights.Epic}%</span><span>Legendary ${box.weights.Legendary}%</span></div>
     <button class="${cls}" data-case-id="${box.id}" ${disabled?"disabled":""}>${buttonContent}</button>
   </div>`;
 }).join("");

 list.querySelectorAll(".case-open-button").forEach(button=>{
   const id=button.dataset.caseId;
   if(caseUI.caseId===id&&caseUI.phase==="reward"&&caseUI.result)setCaseButtonResult(button,caseUI.result);
   button.onclick=()=>openCase(id);
 });
}
async function sellAllInventory(){
 const rarityOrder={Common:0,Uncommon:1,Rare:2,Epic:3,Legendary:4};
 const owned=CASE_ITEMS
   .filter(x=>Number(state.inventory[x.id]||0)>0)
   .sort((a,b)=>{
     const rarityDiff=(rarityOrder[a.rarity]??99)-(rarityOrder[b.rarity]??99);
     if(rarityDiff!==0)return rarityDiff;
     return Number(a.value||0)-Number(b.value||0);
   });
 if(!owned.length)return;
 const total=owned.reduce((sum,x)=>sum+(Number(state.inventory[x.id]||0)*Number(x.value||0)),0);
 if(total<=0)return;
 const button=document.getElementById("sellAllInventoryButton");
 if(button){button.disabled=true;button.classList.add("selling-all");}
 for(const item of owned){
   const qty=Number(state.inventory[item.id]||0);
   state.totalItemsSold=Number(state.totalItemsSold||0)+qty;
   state.inventory[item.id]=0;
 }
 state.balance+=total;
 await save();
 render();
 showFloatingNotification("item","Inventory sold!",`+${total.toLocaleString("en-US")} 🪙`);
}
function renderItemCatalog(){
 const list=document.getElementById("itemCatalogList");
 const count=document.getElementById("catalogItemCount");
 if(!list)return;
 const rarityOrder={Common:0,Uncommon:1,Rare:2,Epic:3,Legendary:4};
 const items=(Array.isArray(CASE_ITEMS)?CASE_ITEMS:[]).slice().sort((a,b)=>{
   const rarityDiff=(rarityOrder[a.rarity]??99)-(rarityOrder[b.rarity]??99);
   if(rarityDiff!==0)return rarityDiff;
   return Number(a.value||0)-Number(b.value||0);
 });
 if(count)count.textContent=String(items.length);
 list.innerHTML=items.map(item=>{
   const qty=Number(state.inventory?.[item.id]||0);
   const owned=qty>0;
   return `<div class="inventory-item rarity-${caseRarityClass(item.rarity)}${owned?" catalog-owned":""}">
     <div class="inventory-item-icon">${item.icon}</div>
     <div class="inventory-item-info">
       <strong>${item.name}</strong>
       <span class="inventory-rarity">${item.rarity}</span>
       <small>Price · ${Number(item.value||0).toLocaleString("en-US")} 🪙</small>
     </div>
     <div class="inventory-count">${owned?"x"+qty:"Locked"}</div>
   </div>`;
 }).join("");
}

function renderInventory(){
 const list=document.getElementById("inventoryList");
 const total=document.getElementById("inventoryTotal");
 if(!list)return;
 const owned=CASE_ITEMS.filter(x=>Number(state.inventory[x.id]||0)>0);
 const count=owned.reduce((s,x)=>s+Number(state.inventory[x.id]||0),0);
 const totalValue=owned.reduce((s,x)=>s+(Number(state.inventory[x.id]||0)*Number(x.value||0)),0);
 if(total)total.textContent=`${count} item${count===1?"":"s"} collected`;
 const sellAll=document.getElementById("sellAllInventoryButton");
 const sellAllValue=document.getElementById("sellAllInventoryValue");
 if(sellAllValue)sellAllValue.textContent=totalValue.toLocaleString("en-US");
 if(sellAll){sellAll.disabled=count===0;sellAll.onclick=sellAllInventory;}
 if(!owned.length){
   list.innerHTML='<div class="inventory-empty"><div>🎒</div><strong>Your inventory is empty</strong><span>Open a case to collect your first item.</span></div>';
   return;
 }
 list.innerHTML=owned.map(x=>{
   const qty=Number(state.inventory[x.id]||0);
   const sale=Number(x.value)||0;
   return `
   <div class="inventory-item rarity-${caseRarityClass(x.rarity)}">
     <div class="inventory-item-icon">${x.icon}</div>
     <div class="inventory-item-info">
       <strong>${x.name}</strong>
       <span class="inventory-rarity">${x.rarity}</span>
       <small>Value · ${x.value.toLocaleString("en-US")} 🪙</small>
     </div>
     <div class="inventory-count">x${qty}</div>
     <button class="inventory-sell-button" data-item-id="${x.id}" data-sale="${sale}" ${qty<1?"disabled":""}>
       Sell · ${sale.toLocaleString("en-US")} 🪙
     </button>
   </div>`;
 }).join("");

 list.querySelectorAll(".inventory-sell-button").forEach(button=>{
   button.onclick=()=>sellInventoryItem(button.dataset.itemId,Number(button.dataset.sale),button);
 });
}
async function sellInventoryItem(itemId,salePrice,button){
 const item=CASE_ITEMS.find(x=>x.id===itemId);
 if(!item||Number(state.inventory[itemId]||0)<=0||button.disabled)return;

 button.disabled=true;
 button.classList.remove("selling");
 void button.offsetWidth;
 button.classList.add("selling");

 state.inventory[itemId]=Math.max(0,Number(state.inventory[itemId]||0)-1);
 state.totalItemsSold=Number(state.totalItemsSold||0)+1;
 state.balance+=salePrice;
 await save();

 // Keep the sale animation visible before the inventory is rerendered.
 await new Promise(r=>setTimeout(r,260));
 render();
}

async function openCase(caseId){
 const box=CASES.find(x=>x.id===caseId);
 if(!box||Number(state.balance)<box.price)return;
 if(caseUI.phase)return;

 caseUI={caseId,phase:"opening",result:null};
 renderCases();

 const clickedButton=document.querySelector(`.case-open-button[data-case-id="${caseId}"]`);
 if(clickedButton){
   clickedButton.classList.remove("case-opening");
   void clickedButton.offsetWidth;
   clickedButton.classList.add("case-opening");
 }

 state.balance-=box.price;
 state.lastCaseOpen=Date.now();
 state.totalCasesOpened=Number(state.totalCasesOpened||0)+1;
 await save();
 render();

 await new Promise(r=>setTimeout(r,800));

 let reward;
 if(Math.random()>=Number(box.itemChance??0.83)){
   const range=CASE_MONEY[CASES.indexOf(box)]||CASE_MONEY[0];
   reward={money:Math.floor(range.min+Math.random()*(range.max-range.min+1))};
   state.balance+=reward.money;
 }else{
   const rarity=pickCaseRarity(box.weights);
   const item=pickCaseItem(rarity,CASES.indexOf(box));
   state.inventory[item.id]=Number(state.inventory[item.id]||0)+1;
   state.totalItemsCollected=Number(state.totalItemsCollected||0)+1;
   reward={item};
 }
 caseUI.phase="reward";
 caseUI.result=reward;
 await save();
 render();

 await new Promise(r=>setTimeout(r,2600));
 caseUI={caseId:null,phase:null,result:null};
 render();
}

function achievementProgress(a){
 let value=0;
 if(a.kind==="balance")value=Number(state.balance)||0;
 if(a.kind==="miners")value=Array.isArray(state.minerInventory)?state.minerInventory.length:0;
 if(a.kind==="minerLevel")value=Number(state.minerLevel)||1;
 if(a.kind==="properties")value=Object.values(state.realEstateOwned||{}).reduce((s,n)=>s+Number(n||0),0);
 if(a.kind==="cases")value=Number(state.totalCasesOpened)||0;
 if(a.kind==="items")value=Object.values(state.inventory||{}).reduce((s,n)=>s+Number(n||0),0);
 if(a.kind==="itemsEver")value=Number(state.totalItemsCollected)||0;
 if(a.kind==="legendary")value=CASE_ITEMS.some(x=>x.rarity==="Legendary"&&Number(state.inventory?.[x.id]||0)>0)?1:0;
 if(a.kind==="epicOrLegendary")value=CASE_ITEMS.some(x=>(x.rarity==="Epic"||x.rarity==="Legendary")&&Number(state.inventory?.[x.id]||0)>0)?1:0;
 if(a.kind==="job")value=state.job?1:0;
 if(a.kind==="crypto")value=Object.values(state.market?.holdings||{}).some(n=>Number(n||0)>0)?1:0;
 if(a.kind==="generated")value=Number(state.totalGenerated)||0;
 return value;
}
function showFloatingNotification(type,title,text){
 if(!gameSettings.notifications)return;

 const host=document.getElementById("floatingNotifications");
 if(!host)return;
 const el=document.createElement("div");
 el.className=`floating-notification ${type}`;
 const icon=type==="achievement"?"🏆":type==="mining"?"⛏️":"🎒";
  el.innerHTML=`<span class="floating-notification-icon">${icon}</span><div><strong>${title}</strong><small>${text}</small></div>`;
 host.appendChild(el);
 setTimeout(()=>el.classList.add("show"),20);
 setTimeout(()=>{el.classList.remove("show");setTimeout(()=>el.remove(),300);},3600);
}
function updateNotifications(){
 if(!state)return;
 let changed=false;

 // Unlock notifications are only generated the first time an achievement
 // crosses its target. The badge itself is always derived from reality:
 // unlocked AND not yet claimed.
 for(const a of ACHIEVEMENTS){
   const unlocked=achievementProgress(a)>=a.target;
   if(unlocked&&!state.notificationAchievementUnlocked[a.id]){
     state.notificationAchievementUnlocked[a.id]=true;
     showFloatingNotification("achievement","Trophy unlocked!",`${a.name} · +${Number(a.reward||0).toLocaleString("en-US")} 🪙`);
     changed=true;
   }
 }

 for(const item of CASE_ITEMS){
   const current=Number(state.inventory[item.id]||0);
   const previous=Number(state.notificationInventoryCounts[item.id]||0);
   if(current>previous){
     const diff=current-previous;
     state.inventoryNotifications+=diff;
     showFloatingNotification("item","New item!",`${item.name} · ${item.rarity}`);
     changed=true;
   }
   state.notificationInventoryCounts[item.id]=current;
 }

 const claimableAchievements=ACHIEVEMENTS.filter(a=>
   achievementProgress(a)>=a.target && !state.achievementRewardsClaimed[a.id]
 );

 // Repair stale legacy counters from previous versions.
 const actualClaimableCount=claimableAchievements.length;
 if(Number(state.achievementNotifications||0)!==actualClaimableCount){
   state.achievementNotifications=actualClaimableCount;
   changed=true;
 }

 if(changed)save();

 const achBadge=document.getElementById("achievementsBadge");
 const invBadge=document.getElementById("inventoryBadge");
 const achHome=document.getElementById("achievementsHomeCount");
 const invHome=document.getElementById("inventoryHomeCount");

 if(achBadge){
   achBadge.textContent=actualClaimableCount;
   achBadge.classList.toggle("hidden",actualClaimableCount<=0);
 }

 const totalInventoryItems=Object.values(state.inventory||{})
   .reduce((sum,n)=>sum+Math.max(0,Number(n)||0),0);

 if(invBadge){
   invBadge.textContent=totalInventoryItems;
   invBadge.classList.toggle("hidden",totalInventoryItems<=0);
 }

 if(achHome){
   achHome.textContent=actualClaimableCount>0
     ? `${actualClaimableCount} to collect`
     : `${ACHIEVEMENTS.filter(a=>achievementProgress(a)>=a.target).length} unlocked`;
 }
 if(invHome){
   invHome.textContent=totalInventoryItems>0
     ? `${totalInventoryItems} item${totalInventoryItems===1?"":"s"} collected`
     : "Collected items";
 }
}
async function claimAchievement(id){
 const a=ACHIEVEMENTS.find(x=>x.id===id);
 if(!a||achievementProgress(a)<a.target||state.achievementRewardsClaimed[a.id])return;
 state.achievementRewardsClaimed[a.id]=true;
 state.balance+=Number(a.reward)||0;
 state.achievementNotifications=ACHIEVEMENTS.filter(x=>
   achievementProgress(x)>=x.target && !state.achievementRewardsClaimed[x.id]
 ).length;
 await save();
 render();
 showFloatingNotification("achievement","Reward collected!",`+${Number(a.reward||0).toLocaleString("en-US")} 🪙 · ${a.name}`);
}
function renderAchievements(){
 const list=document.getElementById("achievementsList");
 const summary=document.getElementById("achievementsSummary");
 if(!list)return;
 const unlocked=ACHIEVEMENTS.filter(a=>achievementProgress(a)>=a.target);
 const claimed=ACHIEVEMENTS.filter(a=>state.achievementRewardsClaimed[a.id]).length;
 if(summary)summary.textContent=`${claimed} / ${ACHIEVEMENTS.length} collected`;
 const homeCount=document.getElementById("achievementsHomeCount");
 if(homeCount)homeCount.textContent=state.achievementNotifications>0?`${state.achievementNotifications} to collect`:`${unlocked.length} unlocked`;
 list.innerHTML=ACHIEVEMENTS.map(a=>{
   const value=achievementProgress(a);
   const done=value>=a.target;
   const collected=!!state.achievementRewardsClaimed[a.id];
   const pct=Math.min(100,(value/a.target)*100);
   const shown=a.kind==="balance"||a.kind==="generated"
     ? `${Math.floor(value).toLocaleString("en-US")} / ${a.target.toLocaleString("en-US")}`
     : `${Math.min(value,a.target)} / ${a.target}`;
   const action=done&&!collected
     ? `<button class="achievement-claim-button" data-achievement-id="${a.id}">Collect +${Number(a.reward||0).toLocaleString("en-US")} 🪙</button>`
     : `<small>${collected?"Reward collected":done?"Unlocked":shown}</small>`;
   return `<div class="achievement-card ${done?"unlocked":"locked"} ${collected?"collected":""}">
     <div class="achievement-icon">${done?a.icon:"💰"}</div>
     <div class="achievement-info">
       <strong>${a.name}</strong><span>${a.desc}</span>
       <div class="achievement-progress"><i style="width:${pct}%"></i></div>
       ${action}
     </div>
     <div class="achievement-trophy">${done?"🏆":""}</div>
   </div>`;
 }).join("");
 list.querySelectorAll(".achievement-claim-button").forEach(button=>{
   button.onclick=()=>claimAchievement(button.dataset.achievementId);
 });
}
function updateMiningReadyNotification(){
 const badge=document.getElementById("miningReadyBadge");
 if(!badge||!state)return;
 const elapsed=Date.now()-Number(state.lastCollection||Date.now());
 // A fresh game already contains the first production (storedCoins > 0).
 // Later productions become ready once the 24h collection cycle is reached.
 const ready=Number(state.storedCoins||0)>0 || elapsed>=DAY;
 badge.hidden=!ready;
 badge.textContent=ready?"1":"";

 if(ready && !state.miningReadyNotificationShown){
   state.miningReadyNotificationShown=true;
   const title=Number(state.lastCollection||0)===0
     ? "Your first crypto harvest is ready!"
     : "Crypto harvest ready!";
   showFloatingNotification("mining",title,"Your mining production is ready to collect.");
   save();
 }
}
function render(){
 updateMarketPrices();
 marketUpdateYield();
 const m=current();
 document.getElementById("balance").textContent=state.balance.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:1});
 const dailyTotal=totalMinerDaily();
 document.getElementById("homeProduction").textContent=`Mining Level ${state.minerLevel}`;
 document.getElementById("minerName").textContent=`${m.icon} ${m.name}`;
 document.getElementById("minerDescription").textContent=m.description;
 document.getElementById("mineVisual").textContent=m.icon;
 const homeMineIcon=document.getElementById("homeMineIcon");
 if(homeMineIcon)homeMineIcon.textContent=m.icon;
 const ownedCount=document.getElementById("minerOwnedCount");
 if(ownedCount)ownedCount.innerHTML=`Machines owned: <strong>${state.minerInventory.length}</strong> · Total production: <strong>${dailyTotal.toLocaleString("en-US")} coins/day</strong>`;
 document.getElementById("production").textContent=`${dailyTotal.toLocaleString("en-US")} 🪙 / day`;
 document.getElementById("level").textContent=`${m.level} / ${miners.length}`;
 document.getElementById("stored").textContent=`${Number(state.storedCoins||0).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:2})} 🪙`;
 document.getElementById("progress").style.width=`${dailyTotal?Math.min(100,state.storedCoins/dailyTotal*100):0}%`;
 const collectButton=document.getElementById("collectButton");
 if(collectButton){
   const ready=Number(state.storedCoins||0)>0;
   collectButton.classList.toggle("ready",ready);
 }
 const remain=Math.max(0,DAY-(Date.now()-state.lastCollection)%DAY);
 document.getElementById("nextCollection").textContent=`Next production in ${Math.floor(remain/3600000)}h ${Math.floor((remain%3600000)/60000)}min`;
 renderUpgrades();
 renderJobs();
 renderRealEstate();
 renderHomeAssetsIncome();
 renderCases();
 renderInventory();
 renderAchievements();
 updateMiningReadyNotification();
 updateNotifications();
}
function renderUpgrades(){
 const list=document.getElementById("upgradeList");list.innerHTML="";
 miners.forEach(m=>{
  const e=document.createElement("div");
  const cur=m.level===state.minerLevel,next=m.level===state.minerLevel+1;
  e.className=`upgrade ${cur?"current":""} ${m.level>state.minerLevel+1?"locked":""}`;
  let action=cur?'<button class="upgrade-button" disabled>CURRENT</button>':next?`<button class="upgrade-button" data-level="${m.level}" ${state.balance<m.cost?"disabled":""}>${m.cost.toLocaleString("en-US")} 🪙</button>`:'<button class="upgrade-button" disabled>💰</button>';
  e.innerHTML=`<div class="upgrade-icon">${m.icon}</div><div class="upgrade-info"><strong>Level ${m.level} — ${m.name}</strong><span>${m.daily.toLocaleString("en-US")} 🪙 / day</span></div>${action}`;
  const b=e.querySelector("[data-level]");if(b)b.onclick=()=>upgrade(Number(b.dataset.level));
  list.appendChild(e);
 });
}
setInterval(renderHomeAssetsIncome,1000);

document.addEventListener("pointerdown",e=>{
 if(!gameSettings.animations)return;
 const button=e.target.closest("button");
 if(!button||button.disabled)return;

 let type=null;
 if(button.matches("#marketBuyButton,#addBetButton,.realestate-buy,.upgrade-button:not(:disabled)")){
   type="green";
 }else if(button.matches("#marketSellButton,#marketSellAllButton,.realestate-sell")){
   type="red";
 }
 if(!type)return;

 // Direct Web Animations API: the animation is applied to the actual
 // clicked button, so re-rendering the screen cannot cancel it.
 if(button.__actionAnimation)button.__actionAnimation.cancel();

 const glow=type==="green"
   ?"0 0 14px rgba(70,230,145,.85)"
   :"0 0 14px rgba(255,70,80,.78)";

 button.__actionAnimation=button.animate([
   {filter:"brightness(1)",boxShadow:"0 0 0 rgba(0,0,0,0)",transform:"scale(1)"},
   {filter:"brightness(1.22)",boxShadow:glow,transform:"scale(1.025)",offset:.35},
   {filter:"brightness(1)",boxShadow:"0 0 0 rgba(0,0,0,0)",transform:"scale(1)"}
 ],{
   duration:360,
   easing:"ease-out",
   fill:"none"
 });
},true);

document.addEventListener("wheel",(event)=>{
  const list=event.target.closest?.("#rankingScreen .ranking-list");
  if(!list)return;
  if(list.scrollHeight<=list.clientHeight)return;
  const max=list.scrollHeight-list.clientHeight;
  const next=list.scrollTop+event.deltaY;
  if((event.deltaY<0 && list.scrollTop>0) || (event.deltaY>0 && list.scrollTop<max)){
    event.preventDefault();
    list.scrollTop=Math.max(0,Math.min(max,next));
  }
},{passive:false});

document.addEventListener("DOMContentLoaded",async()=>{
 const auth=document.getElementById("authScreen");
 if(auth){
   auth.style.display="flex";
   auth.classList.add("active");
 }
 const app=document.querySelector(".app");
 if(app)app.style.display="none";

 document.getElementById("loginButton")?.addEventListener("click",loginAccount);
 document.getElementById("registerButton")?.addEventListener("click",registerAccount);
 document.getElementById("showRegisterButton")?.addEventListener("click",showRegister);
 document.getElementById("showLoginButton")?.addEventListener("click",showLogin);
 document.getElementById("logoutButton")?.addEventListener("click",logoutAccount);
 document.getElementById("accountButton")?.addEventListener("click",()=>{
   const p=document.getElementById("accountPanel"); if(p)p.hidden=!p.hidden;
 });
 document.getElementById("rankingButton")?.addEventListener("click",async()=>{
   document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
   document.getElementById("rankingScreen").classList.add("active");
   await loadRanking();
 });
 document.getElementById("rankingBackButton")?.addEventListener("click",()=>{
   document.getElementById("rankingScreen").classList.remove("active");
   const first=document.querySelector(".screen:not(#authScreen):not(#rankingScreen)");
   if(first)first.classList.add("active");
 });
 initSettings();
 initSupport();
 const session=await loadAuthSession();
 if(session)enterGame();
});

setInterval(updateMiningReadyNotification,1000);
