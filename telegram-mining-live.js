(() => {
  const HOUR_MS = 60 * 60 * 1000;
  let liveTimer = null;
  let lastNextClaimAt = null;

  function formatMM(value) {
    return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 4 });
  }

  function currentMiningRate() {
    const summary = document.getElementById('miningModuleSummary')?.textContent || '';
    const match = summary.match(/([0-9]+(?:[.,][0-9]+)?)\s*MM\s*\/\s*h/i);
    if (!match) return 0;
    return Number(match[1].replace(',', '.')) || 0;
  }

  function availableMiningReward(nextClaimAt) {
    const target = nextClaimAt ? new Date(nextClaimAt).getTime() : NaN;
    const rate = currentMiningRate();
    if (!Number.isFinite(target) || rate <= 0) return 0;
    const start = target - HOUR_MS;
    const elapsed = Math.max(0, Date.now() - start);
    const hours = Math.min(24, Math.floor(elapsed / HOUR_MS));
    return hours * rate;
  }

  function ensureAvailableBox() {
    const wrap = document.getElementById('miningClaimProgress');
    if (!wrap) return null;
    let box = wrap.querySelector('.mining-available-claim');
    if (!box) {
      box = document.createElement('div');
      box.className = 'mining-available-claim';
      const label = document.createElement('span');
      label.textContent = 'Available to claim';
      const value = document.createElement('strong');
      value.className = 'mining-available-claim-value';
      box.append(label, value);
      const head = wrap.querySelector('.mining-progress-head');
      if (head) head.after(box); else wrap.prepend(box);
    }
    return box.querySelector('.mining-available-claim-value');
  }

  function refreshAvailable(nextClaimAt) {
    lastNextClaimAt = nextClaimAt || lastNextClaimAt;
    const value = ensureAvailableBox();
    if (!value) return;
    const amount = availableMiningReward(lastNextClaimAt);
    value.textContent = `+${formatMM(amount)} MM`;
  }

  function startLiveRefresh(nextClaimAt) {
    lastNextClaimAt = nextClaimAt || null;
    if (liveTimer) clearInterval(liveTimer);
    refreshAvailable(lastNextClaimAt);
    liveTimer = setInterval(() => refreshAvailable(lastNextClaimAt), 1000);
  }

  function install() {
    const original = window.renderMiningClaimProgress;
    if (typeof original !== 'function' || original.__mmLiveAvailableWrapped) return;
    const wrapped = function(nextClaimAt) {
      original.call(this, nextClaimAt);
      startLiveRefresh(nextClaimAt);
    };
    wrapped.__mmLiveAvailableWrapped = true;
    window.renderMiningClaimProgress = wrapped;
    if (typeof window.applyMiningClaimStyles === 'function') window.applyMiningClaimStyles();
  }

  function moveMiningStatus() {
    const status = document.getElementById('miningStatus');
    const button = document.getElementById('claimMining');
    if (!status || !button) return;
    if (/^Mining is active\./i.test(status.textContent.trim())) status.textContent = '';
    if (status.parentElement === button.parentElement && button.nextElementSibling !== status) {
      button.insertAdjacentElement('afterend', status);
    }
  }

  function installClaimRefresh() {
    const button = document.getElementById('claimMining');
    if (!button || button.__mmLiveRefreshBound) return;
    button.__mmLiveRefreshBound = true;
    button.addEventListener('click', () => {
      window.setTimeout(() => {
        if (typeof window.loadMiningModules === 'function') window.loadMiningModules();
      }, 700);
    });
  }

  function applyLiveStyles() {
    if (document.getElementById('miningLiveAmountStyle')) return;
    const style = document.createElement('style');
    style.id = 'miningLiveAmountStyle';
    style.textContent = `
      .mining-claim-progress { margin-top: 16px !important; }
      .mining-available-claim {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 12px;
        padding: 11px 12px;
        border: 1px solid rgba(99,230,154,.18);
        border-radius: 12px;
        background: rgba(99,230,154,.06);
      }
      .mining-available-claim span { color: #9da9ba; font-size: 12px; }
      .mining-available-claim strong { color: #63e69a; font-size: 14px; }
      .mining-status { margin-top: 10px !important; }
    `;
    document.head.appendChild(style);
  }

  function boot() {
    applyLiveStyles();
    install();
    moveMiningStatus();
    installClaimRefresh();
    const observer = new MutationObserver(() => {
      install();
      moveMiningStatus();
      installClaimRefresh();
      if (lastNextClaimAt) refreshAvailable(lastNextClaimAt);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
