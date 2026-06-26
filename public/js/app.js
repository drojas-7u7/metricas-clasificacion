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

let currentVillageCode = null;
let currentUserRole = null;

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

function setVillageStatus(message) {
  const statusElement = getElement('village-status');

  if (statusElement) {
    statusElement.textContent = message;
  }
}

function renderPlayers(players = []) {
  const playersList = getElement('players-list');

  if (!playersList) {
    return;
  }

  playersList.innerHTML = '';

  if (players.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'empty-state';
    emptyItem.textContent = 'Aún no hay jugadores conectados.';
    playersList.appendChild(emptyItem);
    return;
  }

  players.forEach((player, index) => {
    const playerItem = document.createElement('li');
    playerItem.textContent = `${index + 1}. ${player.name}`;
    playersList.appendChild(playerItem);
  });
}

function renderVillageState(village) {
  const villageTitle = getElement('village-title');
  const villageCodeDisplay = getElement('village-code-display');
  const villageCodeInput = getElement('village-code-input');

  currentVillageCode = village.code;

  if (villageTitle) {
    villageTitle.textContent = `Pueblo activo: ${village.code}`;
  }

  if (villageCodeDisplay) {
    villageCodeDisplay.textContent = village.code;
  }

  if (villageCodeInput && !villageCodeInput.value) {
    villageCodeInput.value = village.code;
  }

  const narratorName = village.narrator?.name || 'Narrador';
  const totalPlayers = village.totalPlayers ?? village.players.length;

  if (currentUserRole === 'narrator') {
    setVillageStatus(`Eres el narrador. Comparte el código ${village.code}. Jugadores conectados: ${totalPlayers}.`);
  } else if (currentUserRole === 'player') {
    setVillageStatus(`Te has unido al pueblo de ${narratorName}. Esperando a que el narrador inicie la dinámica.`);
  } else {
    setVillageStatus(`Pueblo creado por ${narratorName}. Jugadores conectados: ${totalPlayers}.`);
  }

  renderPlayers(village.players);
}

function setupLobby() {
  const createVillageButton = getElement('create-village-button');
  const joinVillageButton = getElement('join-village-button');

  createVillageButton?.addEventListener('click', () => {
    const narratorName = getElement('narrator-name')?.value || '';

    currentUserRole = 'narrator';

    socket.emit('village:create', {
      narratorName,
    });
  });

  joinVillageButton?.addEventListener('click', () => {
    const playerName = getElement('player-name')?.value || '';
    const villageCode = getElement('village-code-input')?.value || currentVillageCode || '';

    currentUserRole = 'player';

    socket.emit('village:join', {
      playerName,
      villageCode,
    });
  });
}

socket.on('connect', () => {
  console.log(`Connected to server with socket id: ${socket.id}`);
});

socket.on('server:welcome', (data) => {
  console.log(data.message);
});

socket.on('village:created', (village) => {
  console.log('Village created:', village);
  renderVillageState(village);
});

socket.on('village:joined', (village) => {
  console.log('Village joined:', village);
  renderVillageState(village);
});

socket.on('village:state', (village) => {
  console.log('Village state updated:', village);
  renderVillageState(village);
});

socket.on('village:error', (error) => {
  console.warn(error.message);
  setVillageStatus(error.message);
});

socket.on('village:closed', (data) => {
  console.warn(data.message);

  currentVillageCode = null;
  currentUserRole = null;

  const villageTitle = getElement('village-title');
  const villageCodeDisplay = getElement('village-code-display');

  if (villageTitle) {
    villageTitle.textContent = 'Todavía no hay pueblo activo';
  }

  if (villageCodeDisplay) {
    villageCodeDisplay.textContent = '----';
  }

  setVillageStatus(data.message);
  renderPlayers([]);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupLobby();
  renderView(window.location.pathname, false);
});
