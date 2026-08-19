const setupRevealEffects = () => {
  const revealElements = () => document.querySelectorAll('.reveal:not(.show)');

  if (!('IntersectionObserver' in window)) {
    revealElements().forEach((el) => el.classList.add('show'));
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('show');
          io.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.2,
    }
  );

  return () => {
    revealElements().forEach((el) => {
      if (!el.closest('[hidden]')) {
        io.observe(el);
      }
    });
  };
};

const tabLinks = document.querySelectorAll('[data-tab-target]');
const tabPanels = document.querySelectorAll('[data-tab-panel]');
const observeVisibleReveals = setupRevealEffects();

const getTabFromHash = () => {
  const tabName = window.location.hash.replace(/^#/, '');
  return document.querySelector(`[data-tab-panel="${tabName}"]`) ? tabName : 'resume';
};

const activateTab = (tabName, updateHash = true) => {
  const selectedPanel = document.querySelector(`[data-tab-panel="${tabName}"]`);
  if (!selectedPanel) return;

  tabLinks.forEach((link) => {
    const isActive = link.dataset.tabTarget === tabName;
    link.classList.toggle('is-active', isActive);
    link.setAttribute('aria-selected', String(isActive));
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tabPanel === tabName;
    panel.classList.toggle('is-active', isActive);
    panel.hidden = !isActive;
  });

  if (updateHash && window.location.hash !== `#${tabName}`) {
    history.pushState(null, '', `#${tabName}`);
  }

  observeVisibleReveals();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

tabLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    activateTab(link.dataset.tabTarget);
  });
});

window.addEventListener('hashchange', () => {
  activateTab(getTabFromHash(), false);
});

activateTab(getTabFromHash(), false);

for (const anchor of document.querySelectorAll('a[href^="#"]:not([data-tab-target])')) {
  anchor.addEventListener('click', (event) => {
    const href = anchor.getAttribute('href');
    if (!href || href === '#') return;

    const target = document.querySelector(href);
    if (!target) return;

    if (target.matches('[data-tab-panel]')) {
      event.preventDefault();
      activateTab(target.dataset.tabPanel);
      return;
    }

    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

const setupMlbRivals = async () => {
  const root = document.querySelector('[data-rivals-app]');
  if (!root) return;

  const dataUrl = (file) => new URL(`public/data/${file}`, window.location.href).toString();
  const [cards, formulas] = await Promise.all([
    fetch(dataUrl('cards.json')).then((r) => r.json()),
    fetch(dataUrl('formulas.json')).then((r) => r.json()),
  ]);

  const deckKey = 'mlb-rivals-decks';
  const searchKey = 'mlb-rivals-search';
  const settingsKey = 'mlb-rivals-settings';
  const positions = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP1', 'SP2', 'SP3', 'SP4', 'SP5', 'RP1', 'RP2', 'RP3', 'RP4', 'CP'];
  let selectedCard = cards[0];
  let compareCards = [cards[0], cards[2]].filter(Boolean);
  let deck = JSON.parse(localStorage.getItem(deckKey) || 'null')?.decks?.[0] || {
    id: 'default', name: 'My Dodgers Deck', batters: [], starters: [], relievers: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), schemaVersion: 1,
  };

  const average = (values) => {
    const finiteValues = values.filter((value) => Number.isFinite(value));
    return finiteValues.length ? finiteValues.reduce((a, b) => a + b, 0) / finiteValues.length : 0;
  };
  const hasStats = (card) => Object.values(card.baseStats || {}).some((v) => typeof v === 'number');
  const statValues = (card) => Object.values(card.baseStats || {}).filter((v) => typeof v === 'number');
  const calculateOvr = (card) => {
    const exact = average(statValues(card));
    return { exact, displayed: card.displayOvr ?? (Number.isFinite(exact) && exact ? Math.round(exact) : null) };
  };
  const getLaunchAngleModifier = (ala) => {
    if (ala == null) return 1;
    if (ala <= 10) return 0.85;
    if (ala <= 13) return 0.92;
    if (ala <= 17) return 1;
    if (ala <= 20) return 0.93;
    return 0.85;
  };
  const hotZoneTotal = (card) => (card.hotZones || []).reduce((sum, zone) => sum + Number(zone.strength || 0), 0);
  const hotZoneModifier = (card) => 1 + hotZoneTotal(card) * formulas.research.hotZone.k;
  const excelScore = (card) => {
    if (!hasStats(card)) return NaN;
    return card.role === 'PITCHER'
      ? card.baseStats.MOV * formulas.excel.pitcherWeights.MOV + card.baseStats.STU * formulas.excel.pitcherWeights.STU
      : card.baseStats.POW * formulas.excel.batterWeights.POW + card.baseStats.CON * formulas.excel.batterWeights.CON + card.baseStats.EYE * formulas.excel.batterWeights.EYE;
  };
  const researchScore = (card) => {
    if (!hasStats(card)) return NaN;
    const s = card.baseStats;
    if (card.role === 'PITCHER') return s.STU * .28 + s.MOV * .26 + s.CTRL * .22 + s.VEL * .16 + s.STA * .08;
    return (s.POW * .42 + s.EYE * .30 + s.CON * .28) * getLaunchAngleModifier(card.launchAngle) * hotZoneModifier(card);
  };
  const fmt = (n) => Number.isFinite(n) && n ? n.toFixed(1) : '--';
  const cardTitle = (card) => card.year ? `${card.playerName} '${String(card.year).slice(-2)}` : card.playerName;

  const renderSummary = () => {
    const deckCards = [...deck.batters, ...deck.starters, ...deck.relievers].map((slot) => cards.find((card) => card.id === slot.cardId)).filter(Boolean);
    root.querySelector('[data-team-ovr]').textContent = fmt(average(deckCards.map((card) => calculateOvr(card).exact)));
    root.querySelector('[data-team-excel]').textContent = fmt(average(deckCards.map(excelScore)));
    root.querySelector('[data-team-research]').textContent = fmt(average(deckCards.map(researchScore)));
  };

  const renderLineup = () => {
    const lineup = root.querySelector('[data-lineup]');
    lineup.innerHTML = positions.map((pos) => {
      const allSlots = [...deck.batters, ...deck.starters, ...deck.relievers];
      const slot = allSlots.find((item) => item.slotId === pos);
      const card = slot && cards.find((item) => item.id === slot.cardId);
      return `<button type="button" data-slot="${pos}"><b>${pos}</b><span>${card ? cardTitle(card) : '빈 슬롯'}</span></button>`;
    }).join('');
  };

  const renderDetail = () => {
    const s = selectedCard.baseStats;
    const contributions = selectedCard.role === 'BATTER'
      ? [`POW +${(s.POW * .42).toFixed(1)}`, `EYE +${(s.EYE * .30).toFixed(1)}`, `CON +${(s.CON * .28).toFixed(1)}`, `ALA ×${getLaunchAngleModifier(selectedCard.launchAngle).toFixed(2)}`, `Hot Zone ×${hotZoneModifier(selectedCard).toFixed(3)}`]
      : Object.entries(s).map(([k, v]) => `${k} ${v}`);
    root.querySelector('[data-card-detail]').innerHTML = `<h2>${cardTitle(selectedCard)}</h2>${hasStats(selectedCard) ? '' : '<p class="rivals-alert">공개 출처에서 카드 존재만 확인되었습니다. 세부 능력치는 검증 가능한 출처가 확보되면 추가됩니다.</p>'}<p class="rivals-muted">${selectedCard.cardType} / ${selectedCard.position.join(', ')} <span class="source-badge experimental">${selectedCard.dataStatus || selectedCard.source?.sourceType}</span></p><div class="rivals-stat-grid">${Object.entries(s).map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}<span>OVR</span><b>${calculateOvr(selectedCard).displayed ?? '--'}</b><span>ALA</span><b>${selectedCard.launchAngle ?? '--'}°</b><span>Hot Zone</span><b>${hotZoneTotal(selectedCard)}</b></div><div class="rivals-score-box"><b>Excel Score ${fmt(excelScore(selectedCard))}</b><b>Research Score ${fmt(researchScore(selectedCard))}</b><span>차이 ${fmt(researchScore(selectedCard) - excelScore(selectedCard))}</span></div><h3>기여 요인</h3><ul>${contributions.map((x) => `<li>${x}</li>`).join('')}</ul><p class="rivals-muted">※ Research Score는 커뮤니티 데이터와 사용자 실험을 기반으로 한 분석용 추정치이며 게임 공식 점수가 아닙니다.</p><button class="btn btn-primary" data-add-card="${selectedCard.id}">라인업에 추가</button>`;
  };

  const renderCards = (items = cards) => {
    root.querySelector('[data-card-list]').innerHTML = items.map((card) => `<tr><td><button class="linkish" data-select-card="${card.id}">${cardTitle(card)}</button><small>${card.team} · ${card.cardType}</small></td><td>${calculateOvr(card).displayed ?? '--'}</td><td>${card.baseStats.POW ?? '--'}</td><td>${card.baseStats.CON ?? '--'}</td><td>${card.baseStats.EYE ?? '--'}</td><td>${card.launchAngle ?? '--'}</td><td>${hotZoneTotal(card) || '--'}</td><td>${fmt(researchScore(card))}</td><td><button data-compare-card="${card.id}">비교</button></td></tr>`).join('');
  };

  const renderComparison = () => {
    const rows = ['OVR', 'POW', 'CON', 'EYE', 'ALA', 'Hot Zone', 'Excel Score', 'Research Score'];
    root.querySelector('[data-comparison]').innerHTML = `<table class="rivals-table"><thead><tr><th></th>${compareCards.map((card) => `<th>${cardTitle(card)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr><th>${row}</th>${compareCards.map((card) => `<td>${row === 'OVR' ? (calculateOvr(card).displayed ?? '--') : row === 'ALA' ? (card.launchAngle ?? '--') : row === 'Hot Zone' ? (hotZoneTotal(card) || '--') : row === 'Excel Score' ? fmt(excelScore(card)) : row === 'Research Score' ? fmt(researchScore(card)) : (card.baseStats[row] ?? '--')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };

  root.addEventListener('click', (event) => {
    const selectId = event.target.closest('[data-select-card]')?.dataset.selectCard;
    const compareId = event.target.closest('[data-compare-card]')?.dataset.compareCard;
    const addId = event.target.closest('[data-add-card]')?.dataset.addCard;
    if (selectId) { selectedCard = cards.find((card) => card.id === selectId); renderDetail(); }
    if (compareId) { const card = cards.find((item) => item.id === compareId); compareCards = [card, ...compareCards.filter((item) => item.id !== compareId)].slice(0, 4); renderComparison(); }
    if (addId) { deck.batters = [...deck.batters.filter((slot) => slot.slotId !== 'DH'), { slotId: 'DH', cardId: addId }]; renderLineup(); renderSummary(); }
    if (event.target.matches('[data-rivals-save]')) { deck.name = root.querySelector('[data-deck-name]').value; deck.updatedAt = new Date().toISOString(); localStorage.setItem(deckKey, JSON.stringify({ schemaVersion: 1, decks: [deck] })); localStorage.setItem(settingsKey, JSON.stringify({ schemaVersion: 1, visibleColumns: ['OVR', 'POW', 'CON', 'EYE', 'ALA', 'HZ', 'SCORE'] })); event.target.textContent = '저장 완료'; }
    if (event.target.matches('[data-rivals-new]')) { deck = { ...deck, id: `deck-${Date.now()}`, name: 'New Deck', batters: [], starters: [], relievers: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; root.querySelector('[data-deck-name]').value = deck.name; renderLineup(); renderSummary(); }
  });

  root.querySelector('[data-rivals-filters]').addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    localStorage.setItem(searchKey, JSON.stringify({ schemaVersion: 1, query: values }));
    renderCards(cards.filter((card) => (!values.name || card.playerName.toLowerCase().includes(values.name.toLowerCase())) && (!values.team || card.team.toLowerCase().includes(values.team.toLowerCase())) && (!values.year || card.year === Number(values.year)) && (!values.cardType || card.cardType === values.cardType) && (!values.position || card.position.includes(values.position.toUpperCase())) && (!values.minOvr || (calculateOvr(card).displayed ?? -Infinity) >= Number(values.minOvr)) && (!values.minPow || (card.baseStats.POW || 0) >= Number(values.minPow)) && (!values.minCon || (card.baseStats.CON || 0) >= Number(values.minCon)) && (!values.minEye || (card.baseStats.EYE || 0) >= Number(values.minEye)) && (!values.alaMin || (card.launchAngle ?? -Infinity) >= Number(values.alaMin)) && (!values.alaMax || (card.launchAngle ?? Infinity) <= Number(values.alaMax))));
  });
  root.querySelector('[data-rivals-filters]').addEventListener('reset', () => setTimeout(() => renderCards(cards), 0));

  renderCards(); renderDetail(); renderLineup(); renderSummary(); renderComparison();
};

setupMlbRivals().catch((error) => {
  console.error('Failed to initialize MLB Rivals deck builder', error);
});

const setupPlayerDb = async () => {
  const root = document.querySelector('[data-player-db-app]');
  if (!root) return;

  const dataUrl = (file) => new URL(`public/data/${file}`, window.location.href).toString();
  const storageKey = 'mlb-rivals-players';
  const defaultPlayers = await fetch(dataUrl('players.json')).then((r) => r.json());
  let players = JSON.parse(localStorage.getItem(storageKey) || 'null')?.players || defaultPlayers;
  const form = root.querySelector('[data-player-form]');
  const search = root.querySelector('[data-player-search]');
  const list = root.querySelector('[data-player-list]');

  const normalizePositions = (value) => String(value || '').split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
  const savePlayers = () => localStorage.setItem(storageKey, JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), players }));
  const toPlayer = (values) => ({
    id: values.id.trim(),
    name: values.name.trim(),
    team: values.team.trim().toUpperCase(),
    position: normalizePositions(values.position),
    ...(values.bats ? { bats: values.bats } : {}),
    ...(values.throws ? { throws: values.throws } : {}),
    ...(values.birthYear ? { birthYear: Number(values.birthYear) } : {}),
    source: {
      sourceType: values.sourceType || 'user',
      ...(values.sourceUrl ? { sourceUrl: values.sourceUrl.trim() } : {}),
      verifiedAt: new Date().toISOString().slice(0, 10),
      ...(values.note ? { note: values.note.trim() } : {}),
    },
  });
  const fillForm = (player) => {
    form.elements.id.value = player.id || '';
    form.elements.name.value = player.name || '';
    form.elements.team.value = player.team || '';
    form.elements.position.value = (player.position || []).join(',');
    form.elements.bats.value = player.bats || '';
    form.elements.throws.value = player.throws || '';
    form.elements.birthYear.value = player.birthYear || '';
    form.elements.sourceType.value = player.source?.sourceType || 'user';
    form.elements.sourceUrl.value = player.source?.sourceUrl || '';
    form.elements.note.value = player.source?.note || '';
    form.elements.id.focus();
  };
  const renderPlayers = () => {
    const q = search.value.trim().toLowerCase();
    const filtered = players.filter((player) => !q || [player.name, player.team, ...(player.position || [])].join(' ').toLowerCase().includes(q));
    list.innerHTML = filtered.map((player) => `<tr><td><button class="linkish" data-player-edit="${player.id}">${player.name}</button><small>${player.id}</small></td><td>${player.team}</td><td>${(player.position || []).join(', ')}</td><td>${player.bats || '--'} / ${player.throws || '--'}</td><td><span class="source-badge experimental">${player.source?.sourceType || 'user'}</span></td><td><button type="button" data-player-delete="${player.id}">삭제</button></td></tr>`).join('') || '<tr><td colspan="6">검색 결과가 없습니다.</td></tr>';
  };
  const downloadPlayersJson = () => {
    const blob = new Blob([JSON.stringify(players, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'players.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const player = toPlayer(Object.fromEntries(new FormData(form)));
    players = [player, ...players.filter((item) => item.id !== player.id)].sort((a, b) => a.name.localeCompare(b.name));
    savePlayers();
    renderPlayers();
    form.reset();
    form.elements.sourceType.value = 'user';
  });
  root.addEventListener('click', (event) => {
    const editId = event.target.closest('[data-player-edit]')?.dataset.playerEdit;
    const deleteId = event.target.closest('[data-player-delete]')?.dataset.playerDelete;
    if (editId) {
      const player = players.find((item) => item.id === editId);
      if (player) fillForm(player);
    }
    if (deleteId && confirm('이 선수를 삭제할까요?')) {
      players = players.filter((player) => player.id !== deleteId);
      savePlayers();
      renderPlayers();
    }
    if (event.target.matches('[data-player-clear]')) form.reset();
    if (event.target.matches('[data-player-export]')) downloadPlayersJson();
    if (event.target.matches('[data-player-reset]') && confirm('localStorage 선수 DB를 삭제하고 기본 players.json으로 복원할까요?')) {
      players = defaultPlayers;
      localStorage.removeItem(storageKey);
      renderPlayers();
      form.reset();
    }
  });
  root.querySelector('[data-player-import]').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      const importedPlayers = Array.isArray(imported) ? imported : imported.players;
      if (!Array.isArray(importedPlayers)) throw new Error('players array missing');
      players = importedPlayers.filter((player) => player && player.id && player.name && player.team && Array.isArray(player.position));
      savePlayers();
      renderPlayers();
    } catch (error) {
      alert('players.json 형식을 확인해주세요. 배열 또는 { players: [...] } 형식이어야 합니다.');
      console.error('Failed to import players.json', error);
    } finally {
      event.target.value = '';
    }
  });
  search.addEventListener('input', renderPlayers);
  renderPlayers();
};

setupPlayerDb().catch((error) => {
  console.error('Failed to initialize MLB Rivals player DB', error);
});
