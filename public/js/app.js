const socket = io();

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

function getSettingsFromForm() {
  return {
    killersCount: getElement('killers-count-input')?.value,
    discussionTimeSeconds: getElement('discussion-time-input')?.value,
    killersTimeSeconds: getElement('killers-time-input')?.value,
    votingTimeSeconds: getElement('voting-time-input')?.value,
  };
}

function fillSettingsForm(settings) {
  if (!settings) {
    return;
  }

  const fields = {
    'killers-count-input': settings.killersCount,
    'discussion-time-input': settings.discussionTimeSeconds,
    'killers-time-input': settings.killersTimeSeconds,
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
  setText('summary-killers-count', village.settings.killersCount);
  setText('summary-discussion-time', formatSeconds(village.settings.discussionTimeSeconds));
  setText('summary-killers-time', formatSeconds(village.settings.killersTimeSeconds));
  setText('summary-voting-time', formatSeconds(village.settings.votingTimeSeconds));
}

function renderWaitingSettingsSummary(village) {
  if (!village?.settings) {
    return;
  }

  setText('waiting-status', village.statusLabel);
  setText('waiting-killers-count', village.settings.killersCount);
  setText('waiting-discussion-time', formatSeconds(village.settings.discussionTimeSeconds));
  setText('waiting-killers-time', formatSeconds(village.settings.killersTimeSeconds));
  setText('waiting-voting-time', formatSeconds(village.settings.votingTimeSeconds));
}

function renderPlayers(listId, players = []) {
  const playersList = getElement(listId);

  if (!playersList) {
    return;
  }

  playersList.innerHTML = '';

  if (players.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'empty-state';
    emptyItem.textContent = 'Aún no hay habitantes conectados.';
    playersList.appendChild(emptyItem);
    return;
  }

  players.forEach((player, index) => {
    const playerItem = document.createElement('li');
    const connectionLabel = player.connected ? '' : ' · desconectado';
    const isCurrentPlayer = player.participantId === participantId;

    if (isCurrentPlayer) {
      playerItem.classList.add('current-player');
    }

    const playerName = document.createElement('span');
    playerName.textContent = `${index + 1}. ${player.name}${connectionLabel}`;
    playerItem.appendChild(playerName);

    if (isCurrentPlayer) {
      const youBadge = document.createElement('span');
      youBadge.className = 'player-you-badge';
      youBadge.textContent = 'tú';
      playerItem.appendChild(youBadge);
    }

    playersList.appendChild(playerItem);
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
  setDisabled('edit-settings-button', isLive);
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

  if (currentUserRole === 'narrator') {
    updateNarratorButtons(village);

    if (village.status === 'live') {
      hideNotice('narrator');
      showGameScreen('narrator-live-screen');
      setText('live-narrator-status', `La partida de ${villageName} ha comenzado. Habitantes: ${currentPlayers}.`);
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

function setupVillageSettings() {
  const completeVillageButton = getElement('complete-village-button');
  const reopenVillageButton = getElement('reopen-village-button');
  const deleteVillageButton = getElement('delete-village-button');
  const leaveVillageButton = getElement('leave-village-button');
  const saveSettingsButton = getElement('save-settings-button');
  const editSettingsButton = getElement('edit-settings-button');
  const startGameButton = getElement('start-game-button');

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

  editSettingsButton?.addEventListener('click', () => {
    if (latestVillageState) {
      renderVillageState(latestVillageState);
    }
  });

  startGameButton?.addEventListener('click', () => {
    socket.emit('village:start', {
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
  renderView(window.location.pathname, false);
  showGameScreen('game-entry-screen');
});
