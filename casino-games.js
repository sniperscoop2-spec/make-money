(() => {
  const CASINO_BETS = [10, 50, 100, 500, 1000, 100000];
  let casinoBusy = false;
  let blackjackRoundId = null;
  let blackjackActive = false;

  function key() {
    if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, x => x.toString(16).padStart(2, "0")).join("");
  }

  function money(value) {
    return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  function setBalance(value) {
    const balance = Number(value || 0);
    if (typeof state === "object" && state) state.balance = balance;
    if (typeof currentProfile === "object" && currentProfile) currentProfile.balance = balance;
    const el = document.getElementById("balance");
    if (el) el.textContent = money(balance);
  }

  function activate(id) {
    document.querySelectorAll(".screen").forEach(screen => screen.classList.remove("active"));
    const target = document.getElementById(id);
    if (target) target.classList.add("active");
    window.scrollTo(0, 0);
  }

  function selectedStake(inputId, amount) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const balance = Number(state?.balance || currentProfile?.balance || 0);
    const value = Math.max(0, Math.min(Number(amount) || 0, balance));
    input.value = String(Math.floor(value));
    refreshCasinoControls();
  }

  function stakeValue(inputId) {
    const input = document.getElementById(inputId);
    const value = Math.floor(Number(input?.value || 0));
    return Number.isFinite(value) ? value : 0;
  }

  function setResult(id, text, type = "") {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.classList.remove("win", "loss");
    if (type) el.classList.add(type);
  }

  function cardElement(card, hidden = false) {
    const el = document.createElement("div");
    el.className = `playing-card${hidden ? " hidden-card" : ""}`;
    if (hidden) return el;
    const red = card.suit === "♥" || card.suit === "♦";
    if (red) el.classList.add("red-card");
    el.innerHTML = `<span class="rank">${card.rank}</span><span class="suit">${card.suit}</span>`;
    return el;
  }

  function renderBlackjack(data, revealDealer) {
    const dealer = document.getElementById("dealerCards");
    const player = document.getElementById("playerCards");
    if (!dealer || !player) return;
    dealer.replaceChildren();
    player.replaceChildren();
    (data.dealer_cards || []).forEach((card, index) => dealer.appendChild(cardElement(card, !revealDealer && index > 0)));
    (data.player_cards || []).forEach(card => player.appendChild(cardElement(card)));
    const dealerScore = document.getElementById("dealerScore");
    const playerScore = document.getElementById("playerScore");
    if (dealerScore) dealerScore.textContent = revealDealer ? (data.dealer_value ?? "?") : "?";
    if (playerScore) playerScore.textContent = data.player_value ?? "?";
  }

  function blackjackMessage(status, payout) {
    if (status === "blackjack") return "🃏 BLACKJACK! +3:2";
    if (status === "won") return `🎉 You win! +${money(payout)} coins`;
    if (status === "lost") return "💥 Dealer wins.";
    if (status === "push") return "🤝 Push — your stake is returned.";
    return "Your move: Hit, Stand or Double.";
  }

  function refreshCasinoControls() {
    const balance = Number(state?.balance || currentProfile?.balance || 0);
    const bjStake = stakeValue("blackjackStakeInput");
    const slotStake = stakeValue("slotStakeInput");
    const bjDeal = document.getElementById("blackjackDealButton");
    if (bjDeal) bjDeal.disabled = casinoBusy || blackjackActive || bjStake < 10 || bjStake > 100000 || bjStake > balance;
    ["blackjackHitButton", "blackjackStandButton", "blackjackDoubleButton"].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = casinoBusy || !blackjackActive;
    });
    const spin = document.getElementById("slotSpinButton");
    if (spin) spin.disabled = casinoBusy || slotStake < 10 || slotStake > 100000 || slotStake > balance;
    const auto = document.getElementById("slotAutoSpinButton");
    if (auto) auto.disabled = casinoBusy || slotStake < 10 || slotStake > 100000 || slotStake > balance;
  }

  async function blackjackStart() {
    if (casinoBusy || blackjackActive) return;
    const bet = stakeValue("blackjackStakeInput");
    const balance = Number(state?.balance || currentProfile?.balance || 0);
    if (bet < 10 || bet > 100000 || bet > balance) return setResult("blackjackResult", "Enter a valid stake.", "loss");
    casinoBusy = true;
    refreshCasinoControls();
    setResult("blackjackResult", "Dealing cards…");
    try {
      const data = await rpc("cg_casino_blackjack_start", { p_token: authSession?.token, p_bet: bet, p_operation_key: key() });
      if (!data?.ok) throw new Error(data?.error || "CASINO_ERROR");
      setBalance(data.balance);
      blackjackRoundId = data.round_id;
      blackjackActive = data.status === "active";
      renderBlackjack(data, !blackjackActive);
      setResult("blackjackResult", blackjackMessage(data.status, data.payout), data.status === "won" || data.status === "blackjack" ? "win" : data.status === "lost" ? "loss" : "");
      if (!blackjackActive) blackjackRoundId = null;
    } catch (error) {
      setResult("blackjackResult", error.message === "INSUFFICIENT_BALANCE" ? "Not enough coins." : "Blackjack is temporarily unavailable.", "loss");
    } finally {
      casinoBusy = false;
      refreshCasinoControls();
    }
  }

  async function blackjackAction(action) {
    if (casinoBusy || !blackjackActive || !blackjackRoundId) return;
    const bet = stakeValue("blackjackStakeInput");
    if (action === "double" && Number(state?.balance || 0) < bet) return setResult("blackjackResult", "Not enough coins to double.", "loss");
    casinoBusy = true;
    refreshCasinoControls();
    setResult("blackjackResult", action === "hit" ? "Drawing a card…" : action === "double" ? "Doubling…" : "Dealer is playing…");
    try {
      const data = await rpc("cg_casino_blackjack_action", { p_token: authSession?.token, p_round_id: blackjackRoundId, p_action: action, p_operation_key: key() });
      if (!data?.ok) throw new Error(data?.error || "CASINO_ERROR");
      setBalance(data.balance);
      blackjackActive = data.status === "active";
      renderBlackjack(data, !blackjackActive);
      setResult("blackjackResult", blackjackMessage(data.status, data.payout), data.status === "won" || data.status === "blackjack" ? "win" : data.status === "lost" ? "loss" : "");
      if (!blackjackActive) blackjackRoundId = null;
    } catch (error) {
      setResult("blackjackResult", error.message === "INSUFFICIENT_BALANCE" ? "Not enough coins." : "Blackjack action failed.", "loss");
    } finally {
      casinoBusy = false;
      refreshCasinoControls();
    }
  }

  async function restoreBlackjack() {
    if (!authSession?.token) return;
    try {
      const data = await rpc("cg_casino_blackjack_status", { p_token: authSession.token });
      if (!data?.ok) return;
      if (data.balance !== undefined) setBalance(data.balance);
      if (data.active_blackjack) {
        blackjackRoundId = data.active_blackjack.round_id;
        blackjackActive = true;
        renderBlackjack(data.active_blackjack, false);
        setResult("blackjackResult", "♠️ Resumed active round — choose your action.");
      }
      refreshCasinoControls();
    } catch (_) {}
  }

  const SLOT_SYMBOLS = ["7", "💎", "BAR", "🔔", "🍋", "🍒"];

  async function spinSlots() {
    if (casinoBusy) return;
    const bet = stakeValue("slotStakeInput");
    const balance = Number(state?.balance || currentProfile?.balance || 0);
    if (bet < 10 || bet > 100000 || bet > balance) return setResult("slotResult", "Enter a valid stake.", "loss");
    casinoBusy = true;
    refreshCasinoControls();
    const reels = [1, 2, 3].map(i => document.getElementById(`slotReel${i}`));
    reels.forEach(reel => reel?.classList.add("spinning"));
    setResult("slotResult", "Spinning…");
    try {
      const data = await rpc("cg_casino_slots", { p_token: authSession?.token, p_bet: bet, p_operation_key: key() });
      if (!data?.ok) throw new Error(data?.error || "CASINO_ERROR");
      const symbols = Array.isArray(data.symbols) ? data.symbols : [];
      await new Promise(resolve => setTimeout(resolve, 450));
      reels.forEach((reel, index) => {
        if (!reel) return;
        reel.classList.remove("spinning");
        const symbol = reel.querySelector(".slot-symbol");
        if (symbol) symbol.textContent = symbols[index] ?? "?";
        reel.classList.remove("stop-pop", "win-reel");
        void reel.offsetWidth;
        reel.classList.add("stop-pop");
        if (Number(data.payout) > 0) reel.classList.add("win-reel");
      });
      setBalance(data.balance);
      const win = Number(data.payout) > 0;
      setResult("slotResult", win ? `🎉 WIN ×${data.multiplier} · +${money(data.payout)} coins` : "No match — try again.", win ? "win" : "loss");
      const lastWin = document.getElementById("slotLastWin");
      if (lastWin) lastWin.textContent = win ? `+${money(data.payout)}` : "—";
    } catch (error) {
      reels.forEach(reel => reel?.classList.remove("spinning"));
      setResult("slotResult", error.message === "INSUFFICIENT_BALANCE" ? "Not enough coins." : "Slots are temporarily unavailable.", "loss");
    } finally {
      casinoBusy = false;
      refreshCasinoControls();
    }
  }

  function bindStake(inputId, prefix) {
    const input = document.getElementById(inputId);
    if (input) input.addEventListener("input", refreshCasinoControls);
    document.querySelectorAll(`.${prefix}-quick-stake`).forEach(button => button.addEventListener("click", () => selectedStake(inputId, button.dataset.amount)));
    document.getElementById(prefix === "blackjack" ? "blackjackUndoStake" : "slotUndoStake")?.addEventListener("click", () => selectedStake(inputId, Math.floor(stakeValue(inputId) / 2)));
    document.getElementById(prefix === "blackjack" ? "blackjackClearStake" : "slotClearStake")?.addEventListener("click", () => selectedStake(inputId, 0));
  }

  function bind() {
    document.getElementById("casinoHomeButton")?.addEventListener("click", () => activate("casinoScreen"));
    document.getElementById("backCasinoHomeButton")?.addEventListener("click", () => activate("homeScreen"));
    document.getElementById("blackjackButton")?.addEventListener("click", () => { activate("blackjackScreen"); restoreBlackjack(); });
    document.getElementById("backBlackjackButton")?.addEventListener("click", () => activate("casinoScreen"));
    document.getElementById("slotsButton")?.addEventListener("click", () => activate("slotScreen"));
    document.getElementById("backSlotButton")?.addEventListener("click", () => activate("casinoScreen"));
    document.getElementById("blackjackDealButton")?.addEventListener("click", blackjackStart);
    document.getElementById("blackjackHitButton")?.addEventListener("click", () => blackjackAction("hit"));
    document.getElementById("blackjackStandButton")?.addEventListener("click", () => blackjackAction("stand"));
    document.getElementById("blackjackDoubleButton")?.addEventListener("click", () => blackjackAction("double"));
    document.getElementById("slotSpinButton")?.addEventListener("click", spinSlots);
    bindStake("blackjackStakeInput", "blackjack");
    bindStake("slotStakeInput", "slot");
    refreshCasinoControls();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})();