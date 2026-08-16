(() => {
  const ITEM_EMOJIS = {
    case50_common: '🪙',
    case50_epic: '💠',
    case50_legendary: '🐉',
    case50_rare: '🧩',
    case50_uncommon: '🥈',
    case500_common: '🔋',
    case500_epic: '⚛️',
    case500_legendary: '👑',
    case500_rare: '🟡',
    case500_uncommon: '🛡️',
    case5000_common: '🪨',
    case5000_epic: '🌌',
    case5000_legendary: '👸',
    case5000_rare: '💎',
    case5000_uncommon: '💿',
    case50000_common: '🔷',
    case50000_epic: '🗿',
    case50000_legendary: '🏆',
    case50000_rare: '🔮',
    case50000_uncommon: '⚙️',
    case500000_common: '🧱',
    case500000_epic: '🌀',
    case500000_legendary: '🎖️',
    case500000_rare: '🧿',
    case500000_uncommon: '🧲',
    common_badge: '🏵️',
    elite_badge: '🎫',
    gold_badge: '🥇',
    gold_box: '🎁',
    legend_badge: '🌟',
    silver_badge: '🏅',
    silver_box: '📦',
    starter_box: '🗃️'
  };

  const NAME_TO_EMOJI = {
    'Urban Token': '🪙', 'Neon Relic': '💠', 'Dragon Relic': '🐉', 'Gold Fragment': '🧩', 'Silver Fragment': '🥈',
    'Carbon Chip': '🔋', 'Quantum Relic': '⚛️', 'Crown Relic': '👑', 'Gold Chip': '🟡', 'Chrome Chip': '🛡️',
    'Titan Fragment': '🪨', 'Void Relic': '🌌', 'Golden Crown': '👸', 'Diamond Fragment': '💎', 'Platinum Fragment': '💿',
    'Titan Core': '🔷', 'Titan Relic': '🗿', 'Titan Crown': '🏆', 'Titan Crystal': '🔮', 'Titan Alloy': '⚙️',
    'Omega Core': '🧱', 'Omega Relic': '🌀', 'Omega Crown': '🎖️', 'Omega Crystal': '🧿', 'Omega Alloy': '🧲',
    'Common Badge': '🏵️', 'Elite Badge': '🎫', 'Gold Badge': '🥇', 'Gold Box': '🎁', 'Legend Badge': '🌟',
    'Silver Badge': '🏅', 'Silver Box': '📦', 'Starter Box': '🗃️'
  };

  const emojiFor = (itemId, name) => ITEM_EMOJIS[itemId] || NAME_TO_EMOJI[String(name || '').trim()] || '🔹';

  function replaceItemIcons(root = document) {
    root.querySelectorAll('.inventory-item').forEach(card => {
      const id = card.querySelector('[data-sell]')?.dataset.sell || '';
      const name = card.querySelector('.item-info strong')?.textContent || '';
      const icon = card.querySelector('.item-icon');
      if (icon) icon.textContent = emojiFor(id, name);
    });

    root.querySelectorAll('.catalog-item').forEach(card => {
      const name = card.querySelector('strong')?.textContent || '';
      const icon = card.querySelector('.item-icon');
      if (icon) icon.textContent = emojiFor('', name);
    });

    root.querySelectorAll('.roll-item').forEach(card => {
      const name = card.querySelector('strong')?.textContent || '';
      const icon = card.querySelector('span');
      if (icon) icon.textContent = emojiFor('', name);
    });

    root.querySelectorAll('.case-item-preview').forEach(card => {
      const name = card.querySelector('strong')?.textContent || '';
      const icon = card.querySelector('span');
      if (icon) icon.textContent = emojiFor('', name);
    });
  }

  const observer = new MutationObserver(() => replaceItemIcons());
  const start = () => {
    replaceItemIcons();
    observer.observe(document.body, { subtree: true, childList: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.mmItemEmoji = emojiFor;
})();
