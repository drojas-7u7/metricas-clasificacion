const socket = io();
const NO_KILL_TARGET = '__NO_KILL__';
const NO_VOTE_TARGET = '__NO_VOTE__';

const routes = {
  '/': {
    title: 'Classification Metrics | Inicio',
  },
  '/game': {
    title: 'Classification Metrics | El Pueblo Duerme',
  },
  '/results': {
    title: 'Classification Metrics | Resultados',
  },
  '/definitions': {
    title: 'Classification Metrics | Definiciones',
  },
  '/cases': {
    title: 'Classification Metrics | Casos Reales',
  },
  '/debate': {
    title: 'Classification Metrics | Debate',
  },
  '/simulator': {
    title: 'Classification Metrics | Simulador',
  },
  '/closing': {
    title: 'Classification Metrics | Cierre',
  },
};

const PARTICIPANT_ID_STORAGE_KEY = 'metricasClasificacion.participantId';

let currentVillageCode = null;
let currentUserRole = null;
let latestVillageState = null;
let pendingPrivatePlayerState = null;

function createParticipantId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `participant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getParticipantId() {
  let participantId = localStorage.getItem(PARTICIPANT_ID_STORAGE_KEY);

  if (!participantId) {
    participantId = createParticipantId();
    localStorage.setItem(PARTICIPANT_ID_STORAGE_KEY, participantId);
  }

  return participantId;
}

const participantId = getParticipantId();

function getValidPath(pathname) {
  return routes[pathname] ? pathname : '/';
}

function renderView(pathname, shouldPushState = true) {
  const path = getValidPath(pathname);
  const views = document.querySelectorAll('[data-view]');
  const navLinks = document.querySelectorAll('[data-route]');

  views.forEach((view) => {
    const isCurrentView = view.dataset.view === path;
    view.classList.toggle('active', isCurrentView);
  });

  navLinks.forEach((link) => {
    const isCurrentLink = link.dataset.route === path;
    link.classList.toggle('active', isCurrentLink);
  });

  document.title = routes[path].title;

  if (shouldPushState && window.location.pathname !== path) {
    window.history.pushState({ path }, '', path);
  }
}

function setupNavigation() {
  const routeLinks = document.querySelectorAll('[data-route]');

  routeLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      const route = link.dataset.route;

      if (!route) {
        return;
      }

      event.preventDefault();
      renderView(route);
    });
  });

  window.addEventListener('popstate', () => {
    renderView(window.location.pathname, false);
  });
}

function getElement(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = getElement(id);

  if (element) {
    element.textContent = value;
  }
}

function setDisabled(id, isDisabled) {
  const element = getElement(id);

  if (element) {
    element.disabled = isDisabled;
  }
}

function showNotice(target, message) {
  const noticeId = target === 'player' ? 'player-notice' : 'narrator-notice';
  const notice = getElement(noticeId);

  if (!notice) {
    return;
  }

  notice.textContent = message;
  notice.hidden = false;
}

function hideNotice(target) {
  const noticeId = target === 'player' ? 'player-notice' : 'narrator-notice';
  const notice = getElement(noticeId);

  if (!notice) {
    return;
  }

  notice.textContent = '';
  notice.hidden = true;
}

function showCurrentRoleNotice(message) {
  if (currentUserRole === 'narrator') {
    showNotice('narrator', message);
    return;
  }

  if (currentUserRole === 'player') {
    showNotice('player', message);
    return;
  }

  alert(message);
}

function showGameScreen(screenId) {
  const gameScreens = document.querySelectorAll('.game-screen');

  gameScreens.forEach((screen) => {
    const isTargetScreen = screen.id === screenId;

    screen.hidden = !isTargetScreen;
    screen.classList.toggle('active', isTargetScreen);
  });
}

function formatSeconds(seconds) {
  return `${seconds} s`;
}

function hidePrivateRole() {
  const privateRoleCard = getElement('private-role-card');
  const privateRolePlaceholder = getElement('private-role-placeholder');
  const revealRoleButton = getElement('reveal-role-button');

  pendingPrivatePlayerState = null;

  if (privateRoleCard) {
    privateRoleCard.hidden = true;
    privateRoleCard.classList.remove('role-ready');
  }

  if (privateRolePlaceholder) {
    privateRolePlaceholder.hidden = false;
    privateRolePlaceholder.textContent = 'Tu rol aparecerá aquí cuando el narrador comience la partida.';
  }

  if (revealRoleButton) {
    revealRoleButton.hidden = true;
  }

  setText('private-player-title', 'Información del jugador');
  setText('private-role-label', 'Sin asignar');
  setText('private-role-description', 'Espera a que el servidor asigne los roles.');
}


function forceHideRoleRevealControls() {
  const privateRoleCard = getElement('private-role-card');
  const privateRolePlaceholder = getElement('private-role-placeholder');
  const revealRoleButton = getElement('reveal-role-button');

  if (privateRoleCard) {
    privateRoleCard.hidden = true;
    privateRoleCard.classList.remove('role-ready');
    privateRoleCard.classList.remove('is-revealing');
    privateRoleCard.style.display = 'none';
  }

  if (privateRolePlaceholder) {
    privateRolePlaceholder.hidden = true;
    privateRolePlaceholder.textContent = '';
  }

  if (revealRoleButton) {
    revealRoleButton.hidden = true;
    revealRoleButton.style.display = 'none';
  }
}

function renderPrivatePlayerState(privateState) {
  const privateRoleCard = getElement('private-role-card');
  const privateRolePlaceholder = getElement('private-role-placeholder');
  const revealRoleButton = getElement('reveal-role-button');

  if (!privateState) {
    hidePrivateRole();
    return;
  }

  if (privateState.phase !== 'roleReveal') {
    pendingPrivatePlayerState = null;
    forceHideRoleRevealControls();

    setText('private-player-title', `Jugador: ${privateState.playerName}`);
    setText('private-role-label', 'Oculto');
    setText('private-role-description', '');
    return;
  }

  pendingPrivatePlayerState = privateState;

  if (privateRoleCard) {
    privateRoleCard.style.display = '';
    privateRoleCard.hidden = false;
    privateRoleCard.classList.add('role-ready');
  }

  if (privateRolePlaceholder) {
    privateRolePlaceholder.hidden = false;
    privateRolePlaceholder.textContent = `${privateState.playerName}, mantén pulsado el botón para ver tu rol. Suelta para ocultarlo.`;
  }

  if (revealRoleButton) {
    revealRoleButton.style.display = '';
    revealRoleButton.hidden = false;
    revealRoleButton.textContent = 'Mantener pulsado para ver mi rol';
  }

  const descriptions = {
    killer: 'Tu objetivo es sobrevivir sin ser descubierto. Cuando llegue la fase correspondiente, podrás actuar como asesino.',
    villager: 'Tu objetivo es observar, discutir y votar para intentar descubrir a los asesinos del pueblo.',
  };

  setText('private-player-title', `Jugador: ${privateState.playerName}`);
  setText('private-role-label', privateState.roleLabel);
  setText(
    'private-role-description',
    descriptions[privateState.role] || 'Rol asignado. Espera las instrucciones de la partida.'
  );
}

function showPrivateRoleWhilePressed() {
  if (!pendingPrivatePlayerState || pendingPrivatePlayerState.phase !== 'roleReveal') {
    forceHideRoleRevealControls();
    return;
  }
  const privateRoleCard = getElement('private-role-card');
  const privateRolePlaceholder = getElement('private-role-placeholder');
  const revealRoleButton = getElement('reveal-role-button');

  if (!pendingPrivatePlayerState) {
    return;
  }

  const descriptions = {
    killer: 'Tu objetivo es sobrevivir sin ser descubierto. Cuando llegue la fase correspondiente, podrás actuar como asesino.',
    villager: 'Tu objetivo es observar, discutir y votar para intentar descubrir a los asesinos del pueblo.',
  };

  if (privateRoleCard) {
    privateRoleCard.hidden = false;
  }

  if (privateRolePlaceholder) {
    privateRolePlaceholder.hidden = true;
  }

  if (revealRoleButton) {
    revealRoleButton.textContent = 'Suelta para ocultar mi rol';
  }

  setText('private-role-label', pendingPrivatePlayerState.roleLabel);
  setText(
    'private-role-description',
    descriptions[pendingPrivatePlayerState.role] || 'Rol asignado. Espera las instrucciones de la partida.'
  );
}

function hidePrivateRoleAfterRelease() {
  if (!pendingPrivatePlayerState || pendingPrivatePlayerState.phase !== 'roleReveal') {
    forceHideRoleRevealControls();
    return;
  }
  const privateRoleCard = getElement('private-role-card');
  const privateRolePlaceholder = getElement('private-role-placeholder');
  const revealRoleButton = getElement('reveal-role-button');

  if (!pendingPrivatePlayerState) {
    return;
  }

  if (privateRoleCard) {
    privateRoleCard.hidden = true;
  }

  if (privateRolePlaceholder) {
    privateRolePlaceholder.hidden = false;
    privateRolePlaceholder.textContent = `${pendingPrivatePlayerState.playerName}, mantén pulsado el botón para ver tu rol. Suelta para ocultarlo.`;
  }

  if (revealRoleButton) {
    revealRoleButton.hidden = false;
    revealRoleButton.textContent = 'Mantener pulsado para ver mi rol';
  }

  setText('private-role-label', 'Oculto');
  setText('private-role-description', 'Mantén pulsado el botón para revelar tu rol privado.');
}

function getSettingsFromForm() {
  return {
    roundsCount: getElement('rounds-count-input')?.value,
    killersCount: getElement('killers-count-input')?.value,
    discussionTimeSeconds: getElement('discussion-time-input')?.value,
    votingTimeSeconds: getElement('voting-time-input')?.value,
  };
}

function fillSettingsForm(settings) {
  if (!settings) {
    return;
  }

  const fields = {
    'rounds-count-input': settings.roundsCount,
    'killers-count-input': settings.killersCount,
    'discussion-time-input': settings.discussionTimeSeconds,
    'voting-time-input': settings.votingTimeSeconds,
  };

  Object.entries(fields).forEach(([id, value]) => {
    const input = getElement(id);

    if (input) {
      input.value = value;
    }
  });
}

function renderSetupSettingsSummary(village) {
  if (!village?.settings) {
    return;
  }

  setText('summary-status', village.statusLabel);
  setText('summary-rounds-count', village.settings.roundsCount);
  setText('summary-killers-count', village.settings.killersCount);
  setText('summary-discussion-time', formatSeconds(village.settings.discussionTimeSeconds));
  setText('summary-voting-time', formatSeconds(village.settings.votingTimeSeconds));
}

function renderWaitingSettingsSummary(village) {
  if (!village?.settings) {
    return;
  }

  setText('waiting-status', village.statusLabel);
  setText('waiting-rounds-count', village.settings.roundsCount);
  setText('waiting-killers-count', village.settings.killersCount);
  setText('waiting-discussion-time', formatSeconds(village.settings.discussionTimeSeconds));
  setText('waiting-voting-time', formatSeconds(village.settings.votingTimeSeconds));
}

function clearList(listElement) {
  if (listElement) {
    listElement.innerHTML = '';
  }
}

function appendListItem(listElement, textContent) {
  if (!listElement) {
    return;
  }

  const item = document.createElement('li');
  item.textContent = textContent;
  listElement.appendChild(item);
}

function renderPublicNightResultPanel(panelId, listId, nightResult) {
  const panel = getElement(panelId);
  const list = getElement(listId);

  if (!panel || !list) {
    return;
  }

  list.innerHTML = '';

  if (!nightResult) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;

  if (!nightResult.casualties || nightResult.casualties.length === 0) {
    appendListItem(list, 'No ha habido bajas durante la noche.');
    return;
  }

  nightResult.casualties.forEach((casualty) => {
    const repeatLabel = casualty.selectedCount > 1 ? ` x${casualty.selectedCount}` : '';
    appendListItem(list, `${casualty.name}${repeatLabel}`);
  });
}

function renderPublicNightResults(nightResult) {
  renderPublicNightResultPanel('public-night-result-panel', 'public-night-casualties-list', nightResult);
  renderPublicNightResultPanel('player-public-night-result-panel', 'player-public-night-casualties-list', nightResult);
}

function renderNarratorNightSummary(nightResult) {
  const panel = getElement('narrator-night-summary');
  const actionsList = getElement('narrator-night-actions-list');
  const casualtiesList = getElement('narrator-night-casualties-list');
  const repeatedBlock = getElement('narrator-repeated-targets-block');
  const repeatedList = getElement('narrator-repeated-targets-list');

  if (!panel) {
    return;
  }

  clearList(actionsList);
  clearList(casualtiesList);
  clearList(repeatedList);

  if (!nightResult) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;

  const actions = nightResult.actions || [];
  const completedActions = actions.filter((action) => action.completed).length;
  const pendingActions = actions.filter((action) => !action.completed).length;
  const noKillCount = nightResult.noKillCount || 0;
  const attackActions = Math.max(completedActions - noKillCount, 0);

  appendListItem(actionsList, `Acciones completadas: ${completedActions} / ${actions.length}.`);

  if (pendingActions > 0) {
    appendListItem(actionsList, `Acciones pendientes al cerrar la noche: ${pendingActions}.`);
  }

  if (attackActions > 0) {
    appendListItem(actionsList, `Ataques registrados: ${attackActions}.`);
  }

  if (noKillCount > 0) {
    appendListItem(actionsList, `Decisiones de no matar: ${noKillCount}.`);
  }

  if (actions.length === 0) {
    appendListItem(actionsList, 'No hay acciones registradas.');
  }

  if (!nightResult.casualties || nightResult.casualties.length === 0) {
    appendListItem(casualtiesList, 'No ha habido bajas durante la noche.');
  } else {
    nightResult.casualties.forEach((casualty) => {
      const repeatLabel = casualty.selectedCount > 1 ? ` x${casualty.selectedCount}` : '';
      appendListItem(casualtiesList, `${casualty.name}${repeatLabel}`);
    });
  }

  if (repeatedBlock) {
    const repeatedTargets = nightResult.repeatedTargets || [];
    repeatedBlock.hidden = repeatedTargets.length === 0;

    repeatedTargets.forEach((target) => {
      appendListItem(repeatedList, `${target.name} ha recibido ${target.selectedCount} elecciones.`);
    });
  }
}

function renderPublicPhaseState(village) {
  const nightActions = village.nightActions || {
    completedActions: 0,
    requiredActions: 0,
  };

  const currentRound = village.currentRound || 1;
  const totalRounds = village.settings?.roundsCount || '--';
  const roundLabel = `Ronda ${currentRound} de ${totalRounds}`;

  setText('live-phase-label', village.phaseLabel || 'Sin fase');
  setText('player-live-phase-label', village.phaseLabel || 'Sin fase');
  setText('live-round-label', roundLabel);
  setText('player-live-round-label', roundLabel);
  setText('night-actions-summary', `${nightActions.completedActions} / ${nightActions.requiredActions}`);
  renderPublicNightResults(village.publicNightResult || null);
  renderPlayerEliminatedPanel(village);
  renderVotingSummary(village);
  renderFinalResults(village);
  renderPlayerVotingPanel(village);

  if (currentUserRole === 'narrator' && village.status === 'live') {
    if (village.phase === 'roleReveal') {
      setText(
        'live-narrator-status',
        `La partida de ${village.name} ha comenzado. Los habitantes están viendo qué roles les ha tocado.`
      );
    }

    if (village.phase === 'night') {
      setText(
        'live-narrator-status',
        `El pueblo duerme. Asesinos que han actuado: ${nightActions.completedActions} / ${nightActions.requiredActions}.`
      );
      renderNarratorNightSummary(null);
    }

    if (village.phase === 'nightClosed') {
      setText(
        'live-narrator-status',
        'La noche está cerrada. Revisa el resumen privado y levanta al pueblo cuando quieras publicar las bajas.'
      );
    }

    if (village.phase === 'day') {
      setText(
        'live-narrator-status',
        'El pueblo se ha levantado. Las bajas de la noche ya son públicas.'
      );
    }

    if (village.phase === 'discussion') {
      setText(
        'live-narrator-status',
        `Discusión en marcha. Tiempo recomendado: ${formatSeconds(village.settings.discussionTimeSeconds)}.`
      );
    }

    if (village.phase === 'voting') {
      setText(
        'live-narrator-status',
        `Votación en marcha. Solo votan habitantes vivos. Tiempo recomendado: ${formatSeconds(village.settings.votingTimeSeconds)}.`
      );
    }

    if (village.phase === 'votingClosed') {
      setText(
        'live-narrator-status',
        'La votación está cerrada. Revisa el resultado y decide el siguiente paso de la partida.'
      );
    }
  }
}

function hideVotingPanels() {
  const votingSummaryPanel = getElement('voting-summary-panel');
  const votingResultBlock = getElement('voting-result-block');
  const votingResultsList = getElement('voting-results-list');
  const playerVotingPanel = getElement('player-voting-panel');
  const playerVotingTargetsList = getElement('player-voting-targets-list');
  const playerVoteFeedback = getElement('player-vote-feedback');

  if (votingSummaryPanel) {
    votingSummaryPanel.hidden = true;
  }

  if (votingResultBlock) {
    votingResultBlock.hidden = true;
  }

  if (votingResultsList) {
    votingResultsList.innerHTML = '';
  }

  if (playerVotingPanel) {
    playerVotingPanel.hidden = true;
  }

  if (playerVotingTargetsList) {
    playerVotingTargetsList.innerHTML = '';
  }

  if (playerVoteFeedback) {
    playerVoteFeedback.hidden = true;
    playerVoteFeedback.textContent = '';
  }
}

function renderVotingBars(containerId, voting) {
  const container = getElement(containerId);

  if (!container) {
    return;
  }

  container.innerHTML = '';

  if (!voting) {
    return;
  }

  const rowsById = new Map();

  (voting.targets || []).forEach((target) => {
    rowsById.set(target.participantId, {
      id: target.participantId,
      label: target.name,
      count: 0,
      noVote: false,
    });
  });

  rowsById.set(NO_VOTE_TARGET, {
    id: NO_VOTE_TARGET,
    label: 'No votar a nadie',
    count: 0,
    noVote: true,
  });

  (voting.publicVotes || []).forEach((vote) => {
    const key = vote.noVote ? NO_VOTE_TARGET : vote.targetId;

    if (!rowsById.has(key)) {
      rowsById.set(key, {
        id: key,
        label: vote.targetName,
        count: 0,
        noVote: Boolean(vote.noVote),
      });
    }

    rowsById.get(key).count += 1;
  });

  const rows = Array.from(rowsById.values()).sort(
    (first, second) => second.count - first.count || first.label.localeCompare(second.label)
  );

  const totalVoters = Math.max(voting.eligibleVotersCount || 0, 1);

  rows.forEach((row) => {
    const percentage = Math.round((row.count / totalVoters) * 100);

    const rowElement = document.createElement('div');
    rowElement.className = 'vote-bar-row';

    if (row.noVote) {
      rowElement.classList.add('is-no-vote');
    }

    const header = document.createElement('div');
    header.className = 'vote-bar-header';

    const label = document.createElement('span');
    label.textContent = row.label;

    const count = document.createElement('strong');
    count.textContent = `${row.count} / ${voting.eligibleVotersCount || 0}`;

    header.appendChild(label);
    header.appendChild(count);

    const track = document.createElement('div');
    track.className = 'vote-bar-track';

    const fill = document.createElement('div');
    fill.className = 'vote-bar-fill';
    fill.style.width = `${percentage}%`;

    track.appendChild(fill);

    rowElement.appendChild(header);
    rowElement.appendChild(track);

    container.appendChild(rowElement);
  });
}


function renderPublicVotesList(listId, publicVotes = []) {
  const list = getElement(listId);

  if (!list) {
    return;
  }

  list.innerHTML = '';

  if (!publicVotes || publicVotes.length === 0) {
    appendListItem(list, 'Todavía no hay votos emitidos.');
    return;
  }

  publicVotes.forEach((vote) => {
    appendListItem(list, `${vote.voterName} ha votado a ${vote.targetName}.`);
  });
}

function renderPlayerEliminatedPanel(village) {
  const panel = getElement('player-eliminated-panel');
  const message = getElement('player-eliminated-message');

  if (!panel || !message || currentUserRole !== 'player') {
    return;
  }

  const currentPlayer = village.players?.find((player) => player.participantId === participantId);

  if (!currentPlayer || currentPlayer.alive !== false) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;

  const reason = currentPlayer.eliminationReasonLabel
    ? `Causa: ${currentPlayer.eliminationReasonLabel}.`
    : 'Causa: eliminación registrada durante la partida.';

  message.textContent = `${reason} Puedes observar la partida, pero ya no puedes actuar ni votar.`;
}


function formatMetric(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0.000';
  }

  return value.toFixed(3);
}


function renderFinalGroupList(listId, players = [], emptyText = 'Nadie.') {
  const list = getElement(listId);

  if (!list) {
    return;
  }

  list.innerHTML = '';

  if (!players || players.length === 0) {
    appendListItem(list, emptyText);
    return;
  }

  players.forEach((player) => {
    appendListItem(list, `${player.name} (${player.roleLabel || 'Habitante'}).`);
  });
}


function renderFinalResults(village) {
  const renderView = (config) => {
    const panel = getElement(config.panelId);
    const message = getElement(config.messageId);
    const summaryMessage = getElement(config.summaryMessageId);

    if (!panel || !message) {
      return;
    }

    if (village.phase !== 'finalResults') {
      panel.hidden = true;

      [
        config.survivorsListId,
        config.killedListId,
        config.expelledListId,
        config.discoveredKillersListId,
        config.escapedKillersListId,
        config.wronglyExpelledListId,
      ].forEach((listId) => renderFinalGroupList(listId, []));

      return;
    }

    const totalRounds = village.settings?.roundsCount || village.currentRound || 1;
    const classification = village.classificationSummary || village.finalReport?.classificationSummary || {};
    const confusion = classification.confusion || {};
    const metrics = classification.metrics || {};
    const finalReport = village.finalReport || {};
    const groups = finalReport.groups || {};
    const finalSummary = finalReport.summary || {};

    panel.hidden = false;

    const victoryReasonText = finalReport.victoryReasonLabel
      ? ` Motivo: ${finalReport.victoryReasonLabel}`
      : '';

    const aliveNeighborsCount = finalReport.aliveNeighborsCount ?? finalReport.aliveVillagersCount;

    const livingBalanceText =
      Number.isInteger(finalReport.aliveKillersCount) && Number.isInteger(aliveNeighborsCount)
        ? ` Balance final: ${finalReport.aliveKillersCount} asesino(s) vivo(s) y ${aliveNeighborsCount} vecino(s) vivo(s).`
        : '';

    const finalSummaryText = Number.isInteger(finalSummary.totalPlayers)
      ? ` Resumen: ${finalSummary.totalPlayers} jugador(es) en total: ${finalSummary.totalNeighbors} vecino(s) y ${finalSummary.totalKillers} asesino(s). Vecinos: ${finalSummary.aliveNeighbors} vivo(s), ${finalSummary.killedNeighbors} asesinado(s), ${finalSummary.wronglyExpelledNeighbors} expulsado(s) por error. Asesinos: ${finalSummary.discoveredKillers} descubierto(s), ${finalSummary.escapedKillers} sin descubrir.`
      : '';

    message.textContent = `${finalReport.winnerLabel || 'Partida finalizada'}. La partida ha terminado tras ${village.currentRound || totalRounds} de ${totalRounds} ronda(s).${victoryReasonText}${livingBalanceText}${finalSummaryText}`;

    setText(config.accuracyId, formatMetric(metrics.accuracy));
    setText(config.precisionId, formatMetric(metrics.precision));
    setText(config.recallId, formatMetric(metrics.recall));
    setText(config.f1ScoreId, formatMetric(metrics.f1Score));

    setText(config.tpId, confusion.truePositives ?? 0);
    setText(config.fpId, confusion.falsePositives ?? 0);
    setText(config.tnId, confusion.trueNegatives ?? 0);
    setText(config.fnId, confusion.falseNegatives ?? 0);

    if (summaryMessage) {
      const totalEvents = classification.totalEvents || 0;

      summaryMessage.textContent = totalEvents > 0
        ? 'Métrica principal: cada jugador se evalúa una vez al final de la partida. Expulsado por votación significa “predicho como asesino”; rol asesino significa “realmente asesino”. Los vecinos son la clase negativa: jugadores que no eran asesinos.'
        : 'Todavía no hay datos suficientes para calcular métricas finales.';
    }

    renderFinalGroupList(config.survivorsListId, groups.survivors || [], 'No queda nadie con vida.');
    renderFinalGroupList(config.killedListId, groups.killedByKillers || [], 'Ningún vecino fue asesinado por los asesinos.');
    renderFinalGroupList(config.expelledListId, groups.expelledByVote || [], 'Nadie fue expulsado por el pueblo.');
    renderFinalGroupList(config.discoveredKillersListId, groups.discoveredKillers || [], 'No se descubrió a ningún asesino.');
    renderFinalGroupList(config.escapedKillersListId, groups.escapedKillers || [], 'No escapó ningún asesino.');
    renderFinalGroupList(config.wronglyExpelledListId, groups.wronglyExpelledVillagers || [], 'No se expulsó a ningún vecino por error.');
  };

  renderView({
    panelId: 'final-results-panel',
    messageId: 'final-results-message',
    summaryMessageId: 'classification-summary-message',
    accuracyId: 'metric-accuracy',
    precisionId: 'metric-precision',
    recallId: 'metric-recall',
    f1ScoreId: 'metric-f1-score',
    tpId: 'confusion-tp',
    fpId: 'confusion-fp',
    tnId: 'confusion-tn',
    fnId: 'confusion-fn',
    survivorsListId: 'final-survivors-list',
    killedListId: 'final-killed-list',
    expelledListId: 'final-expelled-list',
    discoveredKillersListId: 'final-discovered-killers-list',
    escapedKillersListId: 'final-escaped-killers-list',
    wronglyExpelledListId: 'final-wrongly-expelled-list',
  });

  renderView({
    panelId: 'player-final-results-panel',
    messageId: 'player-final-results-message',
    summaryMessageId: 'player-classification-summary-message',
    accuracyId: 'player-metric-accuracy',
    precisionId: 'player-metric-precision',
    recallId: 'player-metric-recall',
    f1ScoreId: 'player-metric-f1-score',
    tpId: 'player-confusion-tp',
    fpId: 'player-confusion-fp',
    tnId: 'player-confusion-tn',
    fnId: 'player-confusion-fn',
    survivorsListId: 'player-final-survivors-list',
    killedListId: 'player-final-killed-list',
    expelledListId: 'player-final-expelled-list',
    discoveredKillersListId: 'player-final-discovered-killers-list',
    escapedKillersListId: 'player-final-escaped-killers-list',
    wronglyExpelledListId: 'player-final-wrongly-expelled-list',
  });
}


function renderVotingSummary(village) {
  const panel = getElement('voting-summary-panel');
  const progress = getElement('voting-progress-summary');
  const noVoteSummary = getElement('voting-no-vote-summary');
  const resultBlock = getElement('voting-result-block');
  const resultMessage = getElement('voting-result-message');
  const resultsList = getElement('voting-results-list');
  const runoffButton = getElement('start-runoff-voting-button');
  const nextRoundButton = getElement('next-round-button');
  const finalResultsButton = getElement('show-final-results-button');

  const hideActionButtons = () => {
    if (runoffButton) {
      runoffButton.hidden = true;
      runoffButton.disabled = true;
    }

    if (nextRoundButton) {
      nextRoundButton.hidden = true;
      nextRoundButton.disabled = true;
    }

    if (finalResultsButton) {
      finalResultsButton.hidden = true;
      finalResultsButton.disabled = true;
    }
  };

  if (!panel || !progress || !resultBlock || !resultMessage || !resultsList) {
    return;
  }

  const voting = village.voting;

  if (!voting || !['voting', 'votingClosed'].includes(village.phase)) {
    panel.hidden = true;
    resultBlock.hidden = true;
    resultsList.innerHTML = '';
    renderPublicVotesList('public-votes-list', []);
    renderVotingBars('voting-bars-list', null);
    hideActionButtons();
    return;
  }

  panel.hidden = false;
  progress.textContent = `Votos recibidos: ${voting.submittedVotesCount} / ${voting.eligibleVotersCount}.`;

  if (noVoteSummary) {
    noVoteSummary.textContent = voting.isRunoff
      ? `Segunda votación: “No votar a nadie” salva solo con mayoría absoluta. No votos: ${voting.noVoteCount || 0}.`
      : `No votos: ${voting.noVoteCount || 0}.`;
  }

  renderPublicVotesList('public-votes-list', voting.publicVotes || []);
  renderVotingBars('voting-bars-list', voting);

  resultsList.innerHTML = '';

  if (village.phase !== 'votingClosed' || !voting.result) {
    resultBlock.hidden = true;
    resultMessage.textContent = 'La votación todavía no se ha cerrado.';
    hideActionButtons();
    return;
  }

  resultBlock.hidden = false;

  const expelledPlayers = voting.result.expelledPlayers || [];
  const requiresRunoff = voting.result.requiresRunoff === true;

  if (voting.result.savedByNoVote) {
    resultMessage.textContent = 'La segunda votación ha terminado con mayoría absoluta de “No votar a nadie”. Las personas empatadas se salvan y no se expulsa a nadie.';
  } else if (expelledPlayers.length > 1) {
    const names = expelledPlayers.map((player) => player.name).join(', ');
    resultMessage.textContent = `Empate en segunda votación sin mayoría absoluta de “No votar a nadie”. Se expulsan del pueblo: ${names}.`;
  } else if (voting.result.expelled) {
    resultMessage.textContent = voting.result.isRunoff
      ? `Desempate resuelto. Expulsado del pueblo: ${voting.result.expelled.name}.`
      : `Expulsado del pueblo: ${voting.result.expelled.name}.`;
  } else if (requiresRunoff) {
    const names = (voting.result.tiedTargets || []).map((target) => target.name).join(', ');
    resultMessage.textContent = `La votación ha terminado en empate entre: ${names}. Hace falta una segunda votación.`;
  } else if (voting.result.hasTie) {
    resultMessage.textContent = 'La votación ha terminado en empate. No se expulsa a nadie.';
  } else {
    resultMessage.textContent = 'No hay votos válidos suficientes. No se expulsa a nadie.';
  }

  const isNarrator = currentUserRole === 'narrator';
  const totalRounds = Number(village.settings?.roundsCount || 1);
  const currentRound = Number(village.currentRound || 1);
  const hasMoreRounds = currentRound < totalRounds;

  const canStartRunoff = isNarrator && requiresRunoff;
  const canContinue = isNarrator && !requiresRunoff;

  if (runoffButton) {
    runoffButton.hidden = !canStartRunoff;
    runoffButton.disabled = !canStartRunoff;
  }

  if (nextRoundButton) {
    nextRoundButton.hidden = !(canContinue && hasMoreRounds);
    nextRoundButton.disabled = !(canContinue && hasMoreRounds);
  }

  if (finalResultsButton) {
    finalResultsButton.hidden = !(canContinue && !hasMoreRounds);
    finalResultsButton.disabled = !(canContinue && !hasMoreRounds);
  }

  if (!voting.result.results || voting.result.results.length === 0) {
    appendListItem(resultsList, 'No hay resultados de votación.');
    return;
  }

  voting.result.results.forEach((result) => {
    appendListItem(resultsList, `${result.name}: ${result.votesCount} voto(s).`);
  });
}

function renderPlayerVotingPanel(village) {
  const panel = getElement('player-voting-panel');
  const message = getElement('player-voting-message');
  const targetsList = getElement('player-voting-targets-list');

  if (!panel || !message || !targetsList) {
    return;
  }

  targetsList.innerHTML = '';

  if (currentUserRole !== 'player' || !['voting', 'votingClosed'].includes(village.phase) || !village.voting) {
    panel.hidden = true;
    renderPublicVotesList('player-public-votes-list', []);
    renderVotingBars('player-voting-bars-list', null);
    return;
  }

  panel.hidden = false;
  renderPublicVotesList('player-public-votes-list', village.voting.publicVotes || []);
  renderVotingBars('player-voting-bars-list', village.voting);

  if (village.phase === 'votingClosed') {
    const feedback = getElement('player-vote-feedback');

    if (feedback) {
      feedback.hidden = true;
      feedback.textContent = '';
    }

    message.textContent = 'La votación está cerrada. Revisa el resultado.';
    return;
  }

  const currentPlayer = village.players.find((player) => player.participantId === participantId);

  if (!currentPlayer || currentPlayer.alive === false) {
    message.textContent = 'Has sido eliminado. Puedes seguir la partida, pero no puedes votar.';
    return;
  }

  const selectedVote = (village.voting.publicVotes || []).find((vote) => vote.voterId === participantId);
  const isRunoff = Boolean(village.voting.isRunoff);

  message.textContent = isRunoff
    ? 'Segunda votación: vota entre las personas empatadas o elige “No votar a nadie”. Solo se salvan si “No votar a nadie” consigue mayoría absoluta.'
    : 'Vota a un habitante vivo o elige no votar a nadie. Puedes cambiar tu voto mientras la votación siga abierta.';

  const noVoteButton = document.createElement('button');
  noVoteButton.className = 'secondary-button night-target-button';
  noVoteButton.type = 'button';

  if (selectedVote?.targetId === NO_VOTE_TARGET) {
    noVoteButton.classList.add('is-selected');
  }

  const noVoteLabel = document.createElement('span');
  noVoteLabel.textContent = 'No votar a nadie';

  const noVoteHint = document.createElement('small');
  noVoteHint.textContent = selectedVote?.targetId === NO_VOTE_TARGET ? 'Seleccionado' : 'Abstenerse';

  noVoteButton.appendChild(noVoteLabel);
  noVoteButton.appendChild(noVoteHint);

  noVoteButton.addEventListener('click', () => {
    socket.emit('vote:cast', {
      participantId,
      targetId: NO_VOTE_TARGET,
    });
  });

  targetsList.appendChild(noVoteButton);

  const targets = (village.voting.targets || []).filter((target) => target.participantId !== participantId);

  if (targets.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'notice-box';
    emptyMessage.textContent = isRunoff
      ? 'No hay personas empatadas disponibles para votar.'
      : 'No hay objetivos disponibles para votar.';
    targetsList.appendChild(emptyMessage);
    return;
  }

  targets.forEach((target) => {
    const targetButton = document.createElement('button');
    targetButton.className = 'secondary-button night-target-button';
    targetButton.type = 'button';

    if (selectedVote?.targetId === target.participantId) {
      targetButton.classList.add('is-selected');
    }

    const targetName = document.createElement('span');
    targetName.textContent = target.name;

    const targetHint = document.createElement('small');
    targetHint.textContent = selectedVote?.targetId === target.participantId ? 'Seleccionado' : 'Votar';

    targetButton.appendChild(targetName);
    targetButton.appendChild(targetHint);

    targetButton.addEventListener('click', () => {
      socket.emit('vote:cast', {
        participantId,
        targetId: target.participantId,
      });
    });

    targetsList.appendChild(targetButton);
  });
}

function updatePhaseButtons(village) {
  const isNarratorLive = currentUserRole === 'narrator' && village.status === 'live';

  const canStartNight = isNarratorLive && village.phase === 'roleReveal';
  const canEndNight = isNarratorLive && village.phase === 'night';
  const canWakeVillage = isNarratorLive && village.phase === 'nightClosed';
  const canStartDiscussion = isNarratorLive && village.phase === 'day';
  const canStartVoting = isNarratorLive && village.phase === 'discussion';
  const canEndVoting = isNarratorLive && village.phase === 'voting';
  const canEndGame = currentUserRole === 'narrator' && village.status === 'live';

  setDisabled('start-night-button', !canStartNight);
  setDisabled('end-night-button', !canEndNight);
  setDisabled('wake-village-button', !canWakeVillage);
  setDisabled('start-discussion-button', !canStartDiscussion);
  setDisabled('start-voting-button', !canStartVoting);
  setDisabled('end-voting-button', !canEndVoting);
  setDisabled('end-game-button', !canEndGame);
}

function hidePrivateNightPanel() {
  const privateNightPanel = getElement('private-night-panel');
  const nightTargetsContainer = getElement('night-targets-container');
  const nightTargetsList = getElement('night-targets-list');
  const killerTeammatesContainer = getElement('killer-teammates-container');
  const killerTeammatesList = getElement('killer-teammates-list');

  if (privateNightPanel) {
    privateNightPanel.hidden = true;
  }

  if (nightTargetsContainer) {
    nightTargetsContainer.hidden = true;
  }

  if (nightTargetsList) {
    nightTargetsList.innerHTML = '';
  }

  if (killerTeammatesContainer) {
    killerTeammatesContainer.hidden = true;
  }

  if (killerTeammatesList) {
    killerTeammatesList.innerHTML = '';
  }

  setText('private-night-title', 'Esperando fase de noche');
  setText('private-night-message', 'Cuando llegue la noche, aquí aparecerá si tienes alguna acción disponible.');
}

function renderKillerTeamActions(teamActions = []) {
  const teammatesContainer = getElement('killer-teammates-container');
  const teammatesList = getElement('killer-teammates-list');

  if (!teammatesContainer || !teammatesList) {
    return;
  }

  teammatesList.innerHTML = '';

  if (teamActions.length === 0) {
    teammatesContainer.hidden = true;
    return;
  }

  teammatesContainer.hidden = false;

  teamActions.forEach((action) => {
    const playerLabel = action.isYou ? `${action.name} (tú)` : action.name;

    if (!action.completed) {
      appendListItem(teammatesList, `${playerLabel}: todavía no ha elegido.`);
      return;
    }

    if (action.selectedTargetName === 'No matar a nadie') {
      appendListItem(teammatesList, `${playerLabel} ha decidido no matar a nadie.`);
      return;
    }

    const repeatLabel = action.selectedCount > 1 ? ` x${action.selectedCount}` : '';
    appendListItem(teammatesList, `${playerLabel} ha decidido eliminar a ${action.selectedTargetName}${repeatLabel}.`);
  });
}

function renderPrivateNightAction(nightAction) {
  const privateNightPanel = getElement('private-night-panel');
  const nightTargetsContainer = getElement('night-targets-container');
  const nightTargetsList = getElement('night-targets-list');
  const killerTeammatesContainer = getElement('killer-teammates-container');
  const killerTeammatesList = getElement('killer-teammates-list');

  if (!privateNightPanel || !nightAction) {
    hidePrivateNightPanel();
    renderKillerTeamActions([]);
    return;
  }

  privateNightPanel.hidden = false;
  setText('private-night-title', 'Fase de noche');
  setText('private-night-message', nightAction.message);
  renderKillerTeamActions(nightAction.teamActions || []);

  if (nightAction.type !== 'chooseVictim') {
    if (nightTargetsContainer) {
      nightTargetsContainer.hidden = true;
    }

    if (nightTargetsList) {
      nightTargetsList.innerHTML = '';
    }

    return;
  }

  if (nightTargetsContainer) {
    nightTargetsContainer.hidden = false;
  }

  if (!nightTargetsList) {
    return;
  }

  nightTargetsList.innerHTML = '';

  const noKillButton = document.createElement('button');
  const isNoKillSelected = nightAction.selectedTargetName === 'No matar a nadie';

  noKillButton.className = `secondary-button night-target-button${isNoKillSelected ? ' selected' : ''}`;
  noKillButton.type = 'button';

  const noKillLabel = document.createElement('span');
  noKillLabel.textContent = 'No matar a nadie';

  const noKillHint = document.createElement('small');
  noKillHint.textContent = isNoKillSelected ? 'Seleccionado' : 'Elegir';

  noKillButton.appendChild(noKillLabel);
  noKillButton.appendChild(noKillHint);

  noKillButton.addEventListener('click', () => {
    socket.emit('night:choose-victim', {
      participantId,
      targetId: NO_KILL_TARGET,
    });
  });

  nightTargetsList.appendChild(noKillButton);

  if (nightAction.completed && nightAction.selectedTargetName) {
    const selectedMessage = document.createElement('p');
    selectedMessage.className = 'notice-box';
    selectedMessage.textContent = `Has elegido a ${nightAction.selectedTargetName}. Puedes cambiar tu elección mientras dure la noche.`;
    nightTargetsList.appendChild(selectedMessage);
  }

  nightAction.targets.forEach((target) => {
    const targetButton = document.createElement('button');
    const isSelected = nightAction.selectedTargetName === target.name;

    targetButton.className = `secondary-button night-target-button${isSelected ? ' selected' : ''}`;
    targetButton.type = 'button';

    const targetName = document.createElement('span');
    targetName.textContent = target.name;

    const targetHint = document.createElement('small');
    targetHint.textContent = isSelected ? 'Seleccionado' : 'Elegir vecino';

    targetButton.appendChild(targetName);
    targetButton.appendChild(targetHint);

    targetButton.addEventListener('click', () => {
      socket.emit('night:choose-victim', {
        participantId,
        targetId: target.targetId,
      });
    });

    nightTargetsList.appendChild(targetButton);
  });
}

function renderPlayers(listId, players = []) {
  const list = getElement(listId);

  if (!list) {
    return;
  }

  list.innerHTML = '';

  if (players.length === 0) {
    appendListItem(list, 'Todavía no hay jugadores.');
    return;
  }

  players.forEach((player, index) => {
    const playerItem = document.createElement('li');
    playerItem.className = 'player-list-item';

    const isCurrentPlayer = player.participantId === participantId;

    if (player.alive === false) {
      playerItem.classList.add('is-eliminated');
    }

    if (isCurrentPlayer) {
      playerItem.classList.add('is-current-player');
    }

    const playerName = document.createElement('span');
    const connectionLabel = player.connected ? '' : ' · desconectado';
    const currentLabel = isCurrentPlayer ? ' · tú' : '';
    const statusLabel = player.alive === false
      ? ` · ${player.eliminationReasonLabel || 'eliminado'}`
      : ' · vivo';

    playerName.textContent = `${index + 1}. ${player.name}${currentLabel}${connectionLabel}${statusLabel}`;

    playerItem.appendChild(playerName);
    list.appendChild(playerItem);
  });
}

function renderActiveVillages(villages = []) {
  const villagesList = getElement('active-villages-list');

  if (!villagesList) {
    return;
  }

  villagesList.innerHTML = '';

  if (villages.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'empty-state';
    emptyItem.textContent = 'Todavía no hay pueblos creados.';
    villagesList.appendChild(emptyItem);
    return;
  }

  villages.forEach((village) => {
    const item = document.createElement('li');
    item.className = 'village-list-item';

    const info = document.createElement('div');

    const title = document.createElement('strong');
    title.textContent = village.name;

    const details = document.createElement('span');
    details.textContent = `Habitantes: ${village.currentPlayers} · Estado: ${village.statusLabel} · Narrador: ${village.narrator.name}`;

    const code = document.createElement('span');
    code.className = 'village-list-code';
    code.textContent = `Código: ${village.code}`;

    info.appendChild(title);
    info.appendChild(details);
    info.appendChild(code);

    const useCodeButton = document.createElement('button');
    useCodeButton.className = 'secondary-button';
    useCodeButton.type = 'button';
    useCodeButton.textContent = 'Usar código';
    useCodeButton.addEventListener('click', () => {
      const villageCodeInput = getElement('village-code-input');

      if (villageCodeInput) {
        villageCodeInput.value = village.code;
        villageCodeInput.focus();
      }
    });

    item.appendChild(info);
    item.appendChild(useCodeButton);
    villagesList.appendChild(item);
  });
}

function updateNarratorButtons(village) {
  const isWaiting = village.status === 'waiting';
  const isSetup = village.status === 'setup';
  const isLive = village.status === 'live';

  setDisabled('complete-village-button', !isWaiting);
  setDisabled('reopen-village-button', !isSetup);
  setDisabled('delete-village-button', isLive);
  setDisabled('save-settings-button', !isSetup);
  setDisabled('start-game-button', !isSetup);
}

function updatePlayerButtons(village) {
  const canLeaveVillage = village.status === 'waiting';

  setDisabled('leave-village-button', !canLeaveVillage);

  if (!canLeaveVillage && village.status !== 'live') {
    showNotice('player', 'El pueblo ya está completo. Ya no puedes salir de esta partida.');
  }
}

function renderVillageState(village) {
  latestVillageState = village;
  currentVillageCode = village.code;

  const villageName = village.name || 'Pueblo sin nombre';
  const narratorName = village.narrator?.name || 'Narrador';
  const currentPlayers = village.currentPlayers ?? village.players.length;

  setText('setup-village-name', villageName);
  setText('setup-village-code', village.code);
  setText('setup-current-players', currentPlayers);
  setText('setup-status-label', village.statusLabel);

  setText('waiting-village-name', villageName);
  setText('waiting-village-title', `Pueblo de ${narratorName}`);
  setText('waiting-current-players', currentPlayers);
  setText('village-code-display', village.code);

  setText('live-narrator-village-name', villageName);
  setText('live-player-village-name', villageName);

  fillSettingsForm(village.settings);
  renderSetupSettingsSummary(village);
  renderWaitingSettingsSummary(village);

  renderPlayers('setup-players-list', village.players);
  renderPlayers('players-list', village.players);
  renderPublicPhaseState(village);
  updatePhaseButtons(village);

  if (currentUserRole === 'narrator') {
    updateNarratorButtons(village);

    if (village.status === 'live') {
      hideNotice('narrator');
      showGameScreen('narrator-live-screen');
      renderPublicPhaseState(village);
    } else {
      showGameScreen('village-setup-screen');
    }
  }

  if (currentUserRole === 'player') {
    updatePlayerButtons(village);

    if (village.status === 'live') {
      showGameScreen('player-live-screen');
      setText('live-player-status', `La partida de ${villageName} ha comenzado. Espera las instrucciones del narrador.`);
    } else {
      hidePrivateRole();
      hidePrivateNightPanel();
      showGameScreen('player-waiting-screen');
      setText('waiting-village-status', `Te has unido a ${villageName}. Espera a que ${narratorName} inicie la partida.`);
      setText('village-status', `Habitantes actuales: ${currentPlayers}. Estado: ${village.statusLabel}.`);
    }
  }
}

function setupLobby() {
  const createVillageButton = getElement('create-village-button');
  const joinVillageButton = getElement('join-village-button');
  const refreshVillagesButton = getElement('refresh-villages-button');

  createVillageButton?.addEventListener('click', () => {
    const narratorName = getElement('narrator-name')?.value || '';
    const villageName = getElement('village-name')?.value || '';

    socket.emit('village:create', {
      participantId,
      narratorName,
      villageName,
    });
  });

  joinVillageButton?.addEventListener('click', () => {
    const playerName = getElement('player-name')?.value || '';
    const villageCode = getElement('village-code-input')?.value || currentVillageCode || '';

    socket.emit('village:join', {
      participantId,
      playerName,
      villageCode,
    });
  });

  refreshVillagesButton?.addEventListener('click', () => {
    socket.emit('villages:list:request');
  });
}

function setupPrivateRoleReveal() {
  const revealRoleButton = getElement('reveal-role-button');
  const privateRoleCard = getElement('private-role-card');

  if (!revealRoleButton || !privateRoleCard) {
    return;
  }

  const showRole = (event) => {
    event.preventDefault();
    privateRoleCard.classList.add('is-revealing');
  };

  const hideRole = () => {
    privateRoleCard.classList.remove('is-revealing');
  };

  revealRoleButton.addEventListener('touchstart', showRole, { passive: false });
  revealRoleButton.addEventListener('touchend', hideRole);
  revealRoleButton.addEventListener('touchcancel', hideRole);

  revealRoleButton.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') {
      showRole(event);
    }
  });

  revealRoleButton.addEventListener('pointerup', hideRole);
  revealRoleButton.addEventListener('pointercancel', hideRole);
  revealRoleButton.addEventListener('pointerleave', hideRole);

  window.addEventListener('blur', hideRole);

  revealRoleButton.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });
}


function setupVillageSettings() {
  const completeVillageButton = getElement('complete-village-button');
  const reopenVillageButton = getElement('reopen-village-button');
  const deleteVillageButton = getElement('delete-village-button');
  const leaveVillageButton = getElement('leave-village-button');
  const saveSettingsButton = getElement('save-settings-button');
  const startGameButton = getElement('start-game-button');
  const startNightButton = getElement('start-night-button');
  const endNightButton = getElement('end-night-button');
  const wakeVillageButton = getElement('wake-village-button');
  const startDiscussionButton = getElement('start-discussion-button');
  const startVotingButton = getElement('start-voting-button');
  const endVotingButton = getElement('end-voting-button');


  const nextRoundButton = getElement('next-round-button');
  const showFinalResultsButton = getElement('show-final-results-button');

  nextRoundButton?.addEventListener('click', () => {
    hideNotice('narrator');
    socket.emit('phase:next-round', { participantId });
  });

  showFinalResultsButton?.addEventListener('click', () => {
    hideNotice('narrator');
    socket.emit('phase:show-final-results', { participantId });
  });

  const startRunoffVotingButton = getElement('start-runoff-voting-button');

  startRunoffVotingButton?.addEventListener('click', () => {
    hideNotice('narrator');
    socket.emit('phase:start-runoff-voting', { participantId });
  });
  const endGameButton = getElement('end-game-button');

  completeVillageButton?.addEventListener('click', () => {
    hideNotice('narrator');

    socket.emit('village:complete', {
      participantId,
    });
  });

  reopenVillageButton?.addEventListener('click', () => {
    hideNotice('narrator');

    socket.emit('village:reopen', {
      participantId,
    });
  });

  deleteVillageButton?.addEventListener('click', () => {
    const shouldDelete = confirm('¿Seguro que quieres eliminar este pueblo? Los jugadores volverán a la pantalla inicial.');

    if (!shouldDelete) {
      return;
    }

    socket.emit('village:delete', {
      participantId,
    });
  });

  leaveVillageButton?.addEventListener('click', () => {
    hideNotice('player');

    socket.emit('village:leave', {
      participantId,
    });
  });

  saveSettingsButton?.addEventListener('click', () => {
    hideNotice('narrator');

    socket.emit('village:settings:update', {
      participantId,
      settings: getSettingsFromForm(),
    });
  });

  startGameButton?.addEventListener('click', () => {
    socket.emit('village:start', {
      participantId,
    });
  });

  startNightButton?.addEventListener('click', () => {
    hideNotice('narrator');

    socket.emit('phase:start-night', {
      participantId,
    });
  });

  endNightButton?.addEventListener('click', () => {
    hideNotice('narrator');

    socket.emit('phase:end-night', {
      participantId,
    });
  });

  wakeVillageButton?.addEventListener('click', () => {
    hideNotice('narrator');

    socket.emit('phase:wake-village', {
      participantId,
    });
  });

  startDiscussionButton?.addEventListener('click', () => {
    hideNotice('narrator');

    socket.emit('phase:start-discussion', {
      participantId,
    });
  });

  startVotingButton?.addEventListener('click', () => {
    hideNotice('narrator');

    socket.emit('phase:start-voting', {
      participantId,
    });
  });

  endVotingButton?.addEventListener('click', () => {
    hideNotice('narrator');

    socket.emit('phase:end-voting', {
      participantId,
    });
  });

  endGameButton?.addEventListener('click', () => {
    const shouldEndGame = confirm('¿Seguro que quieres acabar la partida y volver al lobby?');

    if (!shouldEndGame) {
      return;
    }

    hideNotice('narrator');

    socket.emit('game:end', {
      participantId,
    });
  });
}

function resetVillageUi(message) {
  currentVillageCode = null;
  currentUserRole = null;
  latestVillageState = null;

  setText('setup-village-name', 'Pueblo sin nombre');
  setText('setup-village-code', '----');
  setText('setup-current-players', '0');
  setText('setup-status-label', 'Esperando habitantes');

  setText('waiting-village-name', 'Esperando al pueblo');
  setText('waiting-village-title', 'Pueblo activo');
  setText('waiting-current-players', '0');
  setText('village-code-display', '----');
  setText('waiting-village-status', message);
  setText('village-status', message);

  renderPlayers('setup-players-list', []);
  renderPlayers('players-list', []);
  hidePrivateRole();
  hidePrivateNightPanel();
  renderNarratorNightSummary(null);
  renderPublicNightResults(null);
  hideVotingPanels();
  showGameScreen('game-entry-screen');
}

socket.on('connect', () => {
  console.log(`Connected to server with socket id: ${socket.id}`);

  socket.emit('session:restore', {
    participantId,
  });
});

socket.on('server:welcome', (data) => {
  console.log(data.message);
});

socket.on('session:empty', () => {
  console.log('No previous session found for this browser.');
  currentUserRole = null;
  currentVillageCode = null;
  latestVillageState = null;
  showGameScreen('game-entry-screen');
});

socket.on('session:restored', ({ role, village }) => {
  console.log('Session restored:', role, village);

  currentUserRole = role;
  renderVillageState(village);
});

socket.on('session:taken-over', (data) => {
  console.warn(data.message);
  resetVillageUi(data.message);
});

socket.on('villages:list', (villages) => {
  renderActiveVillages(villages);
});

socket.on('village:created', (village) => {
  console.log('Village created:', village);
  currentUserRole = 'narrator';
  renderVillageState(village);
});

socket.on('village:joined', (village) => {
  console.log('Village joined:', village);
  currentUserRole = 'player';
  renderVillageState(village);
});

socket.on('village:completed', (village) => {
  console.log('Village completed:', village);
  renderVillageState(village);

  if (currentUserRole === 'narrator') {
    showNotice('narrator', 'Pueblo completo. Ahora puedes configurar la partida o reabrir el pueblo si falta alguien.');
  }

  if (currentUserRole === 'player') {
    showNotice('player', 'El narrador ha marcado el pueblo como completo. Ya no puedes salir de esta partida.');
  }
});

socket.on('village:reopened', (village) => {
  console.log('Village reopened:', village);
  renderVillageState(village);

  if (currentUserRole === 'narrator') {
    showNotice('narrator', 'El pueblo se ha reabierto. Pueden entrar o salir habitantes de nuevo.');
  }

  if (currentUserRole === 'player') {
    showNotice('player', 'El narrador ha reabierto el pueblo. Puedes salir si te has unido por error.');
  }
});

socket.on('village:deleted', (data) => {
  console.warn(data.message);
  resetVillageUi(data.message);
});

socket.on('village:left', (data) => {
  console.log(data.message);
  resetVillageUi(data.message);
});

socket.on('village:settings:saved', (village) => {
  console.log('Village settings saved:', village);
  renderVillageState(village);
  showNotice('narrator', 'Configuración guardada correctamente.');
});

socket.on('village:state', (village) => {
  console.log('Village state updated:', village);
  renderVillageState(village);
});

socket.on('village:started', (village) => {
  console.log('Village started:', village);
  renderVillageState(village);
});

socket.on('phase:changed', (village) => {
  console.log('Phase changed:', village.phaseLabel);
  renderVillageState(village);
});

socket.on('narrator:night-summary', (nightResult) => {
  console.log('Narrator night summary received.');
  renderNarratorNightSummary(nightResult);
});

socket.on('player:private-state', (privateState) => {
  console.log('Private player state received.');
  renderPrivatePlayerState(privateState);
  renderPrivateNightAction(privateState.nightAction);
});

socket.on('vote:cast:confirmed', ({ targetName }) => {
  const feedback = getElement('player-vote-feedback');

  if (!feedback) {
    return;
  }

  feedback.hidden = false;
  feedback.textContent = `Voto registrado contra ${targetName}. Puedes cambiarlo mientras la votación siga abierta.`;
});

socket.on('village:error', (error) => {
  console.warn(error.message);

  if (!getElement('game-entry-screen')?.hidden) {
    alert(error.message);
    return;
  }

  showCurrentRoleNotice(error.message);
});

socket.on('village:closed', (data) => {
  console.warn(data.message);
  resetVillageUi(data.message);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupLobby();
  setupVillageSettings();
  setupPrivateRoleReveal();
  hidePrivateRole();
  hidePrivateNightPanel();
  renderView(window.location.pathname, false);
  showGameScreen('game-entry-screen');
});
