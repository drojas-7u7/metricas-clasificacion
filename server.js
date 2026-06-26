const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');

const appRoutes = [
  '/',
  '/game',
  '/results',
  '/definitions',
  '/cases',
  '/debate',
  '/simulator',
  '/closing',
];

const villages = new Map();
const activeParticipantSockets = new Map();

const defaultSettings = {
  killersCount: 2,
  discussionTimeSeconds: 120,
  killersTimeSeconds: 30,
  votingTimeSeconds: 45,
};

const statusLabels = {
  waiting: 'Esperando habitantes',
  setup: 'Pueblo completo',
  live: 'Partida iniciada',
};

const roleLabels = {
  killer: 'Asesino',
  villager: 'Vecino',
};

function normalizeParticipantId(participantId) {
  return String(participantId || '').trim().slice(0, 80);
}

function normalizeName(name) {
  return String(name || '').trim().slice(0, 40);
}

function normalizeVillageName(name) {
  return String(name || '').trim().slice(0, 60);
}

function normalizeVillageCode(code) {
  return String(code || '').trim().toUpperCase();
}

function toNumberInRange(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(number), min), max);
}

function normalizeSettings(settings = {}) {
  return {
    killersCount: toNumberInRange(settings.killersCount, defaultSettings.killersCount, 1, 10),
    discussionTimeSeconds: toNumberInRange(settings.discussionTimeSeconds, defaultSettings.discussionTimeSeconds, 15, 600),
    killersTimeSeconds: toNumberInRange(settings.killersTimeSeconds, defaultSettings.killersTimeSeconds, 10, 300),
    votingTimeSeconds: toNumberInRange(settings.votingTimeSeconds, defaultSettings.votingTimeSeconds, 10, 300),
  };
}

function validatePlayableSettings(village, settings) {
  const currentPlayers = village.players.length;

  if (currentPlayers < 2) {
    return 'Debe haber al menos 2 habitantes para configurar una partida.';
  }

  if (settings.killersCount >= currentPlayers) {
    return 'El número de asesinos debe ser menor que el número de habitantes.';
  }

  return null;
}

function generateVillageCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  do {
    code = Array.from({ length: 5 }, () => {
      const index = Math.floor(Math.random() * alphabet.length);
      return alphabet[index];
    }).join('');
  } while (villages.has(code));

  return code;
}

function shuffleArray(items) {
  const shuffledItems = [...items];

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledItems[index], shuffledItems[randomIndex]] = [shuffledItems[randomIndex], shuffledItems[index]];
  }

  return shuffledItems;
}

function clearPlayerRoles(village) {
  village.players = village.players.map((player) => ({
    ...player,
    role: null,
  }));
}

function assignRolesToPlayers(village) {
  clearPlayerRoles(village);

  const shuffledPlayers = shuffleArray(village.players);
  const killersCount = village.settings.killersCount;
  const killerParticipantIds = new Set(
    shuffledPlayers.slice(0, killersCount).map((player) => player.participantId)
  );

  village.players = village.players.map((player) => ({
    ...player,
    role: killerParticipantIds.has(player.participantId) ? 'killer' : 'villager',
  }));
}

function getPublicVillagesList() {
  return Array.from(villages.values()).map((village) => ({
    code: village.code,
    name: village.name,
    status: village.status,
    statusLabel: statusLabels[village.status] || village.status,
    currentPlayers: village.players.length,
    narrator: {
      name: village.narrator.name,
      connected: village.narrator.connected,
    },
    createdAt: village.createdAt,
  }));
}

function getPublicVillageState(village) {
  return {
    code: village.code,
    name: village.name,
    status: village.status,
    statusLabel: statusLabels[village.status] || village.status,
    narrator: {
      name: village.narrator.name,
      connected: village.narrator.connected,
    },
    players: village.players.map((player) => ({
      participantId: player.participantId,
      name: player.name,
      connected: player.connected,
    })),
    currentPlayers: village.players.length,
    settings: village.settings,
  };
}

function getPrivatePlayerState(village, participantId) {
  const player = village.players.find((candidate) => candidate.participantId === participantId);

  if (!player || !player.role) {
    return null;
  }

  return {
    villageCode: village.code,
    villageName: village.name,
    playerName: player.name,
    role: player.role,
    roleLabel: roleLabels[player.role] || player.role,
  };
}

function emitPrivatePlayerState(village, player) {
  if (!player.socketId || !player.role) {
    return;
  }

  const privateState = getPrivatePlayerState(village, player.participantId);

  if (!privateState) {
    return;
  }

  io.to(player.socketId).emit('player:private-state', privateState);
}

function emitPrivatePlayerStates(village) {
  village.players.forEach((player) => {
    emitPrivatePlayerState(village, player);
  });
}

function emitVillagesList() {
  io.emit('villages:list', getPublicVillagesList());
}

function emitVillageState(villageCode) {
  const village = villages.get(villageCode);

  if (!village) {
    return;
  }

  io.to(villageCode).emit('village:state', getPublicVillageState(village));
  emitVillagesList();
}

function findVillageByParticipant(participantId) {
  for (const village of villages.values()) {
    if (village.narrator.participantId === participantId) {
      return {
        village,
        role: 'narrator',
      };
    }

    const player = village.players.find((candidate) => candidate.participantId === participantId);

    if (player) {
      return {
        village,
        role: 'player',
        player,
      };
    }
  }

  return null;
}

function registerParticipantSocket(socket, participantId) {
  const cleanParticipantId = normalizeParticipantId(participantId);

  if (!cleanParticipantId) {
    return null;
  }

  const previousSocketId = activeParticipantSockets.get(cleanParticipantId);

  if (previousSocketId && previousSocketId !== socket.id) {
    const previousSocket = io.sockets.sockets.get(previousSocketId);

    if (previousSocket) {
      previousSocket.emit('session:taken-over', {
        message: 'Se ha abierto otra conexión con esta misma sesión. Esta pestaña dejará de controlar el pueblo.',
      });

      previousSocket.disconnect(true);
    }
  }

  activeParticipantSockets.set(cleanParticipantId, socket.id);
  socket.data.participantId = cleanParticipantId;

  return cleanParticipantId;
}

function restoreParticipantConnection(socket, participantId) {
  const existingSession = findVillageByParticipant(participantId);

  if (!existingSession) {
    socket.emit('session:empty');
    socket.emit('villages:list', getPublicVillagesList());
    return;
  }

  const { village, role, player } = existingSession;

  if (role === 'narrator') {
    village.narrator.socketId = socket.id;
    village.narrator.connected = true;
  }

  if (role === 'player' && player) {
    player.socketId = socket.id;
    player.connected = true;
  }

  socket.join(village.code);

  socket.emit('session:restored', {
    role,
    village: getPublicVillageState(village),
  });

  if (role === 'player' && player && village.status === 'live') {
    emitPrivatePlayerState(village, player);
  }

  emitVillageState(village.code);
}

function markParticipantDisconnected(socket) {
  const participantId = socket.data.participantId;

  if (!participantId) {
    return;
  }

  const activeSocketId = activeParticipantSockets.get(participantId);

  if (activeSocketId !== socket.id) {
    return;
  }

  activeParticipantSockets.delete(participantId);

  const existingSession = findVillageByParticipant(participantId);

  if (!existingSession) {
    return;
  }

  const { village, role, player } = existingSession;

  if (role === 'narrator') {
    village.narrator.connected = false;
  }

  if (role === 'player' && player) {
    player.connected = false;
  }

  emitVillageState(village.code);
}

// Serve static frontend files from the public folder
app.use(express.static(PUBLIC_DIR));

// Simple health check route for local testing and deployment platforms
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'metricas-clasificacion',
    activeVillages: villages.size,
  });
});

// SPA fallback for clean internal routes
appRoutes.forEach((route) => {
  app.get(route, (req, res) => {
    res.sendFile(INDEX_FILE);
  });
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.emit('server:welcome', {
    message: 'Conectado al servidor de Métricas de Clasificación.',
  });

  socket.emit('villages:list', getPublicVillagesList());

  socket.on('session:restore', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);

    if (!cleanParticipantId) {
      socket.emit('session:empty');
      return;
    }

    restoreParticipantConnection(socket, cleanParticipantId);
  });

  socket.on('villages:list:request', () => {
    socket.emit('villages:list', getPublicVillagesList());
  });

  socket.on('village:create', ({ participantId, narratorName, villageName } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const cleanNarratorName = normalizeName(narratorName);
    const cleanVillageName = normalizeVillageName(villageName);

    if (!cleanParticipantId) {
      socket.emit('village:error', {
        message: 'No se ha podido identificar esta sesión. Recarga la página e inténtalo de nuevo.',
      });
      return;
    }

    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (existingSession) {
      socket.join(existingSession.village.code);

      socket.emit('session:restored', {
        role: existingSession.role,
        village: getPublicVillageState(existingSession.village),
      });

      socket.emit('village:error', {
        message: 'Este navegador ya está dentro de un pueblo. No puedes ser narrador y jugador a la vez.',
      });

      return;
    }

    if (!cleanNarratorName) {
      socket.emit('village:error', {
        message: 'Escribe tu nombre para crear el pueblo.',
      });
      return;
    }

    if (!cleanVillageName) {
      socket.emit('village:error', {
        message: 'Escribe un nombre para el pueblo.',
      });
      return;
    }

    const code = generateVillageCode();
    const village = {
      code,
      name: cleanVillageName,
      status: 'waiting',
      narrator: {
        participantId: cleanParticipantId,
        socketId: socket.id,
        name: cleanNarratorName,
        connected: true,
      },
      players: [],
      settings: { ...defaultSettings },
      createdAt: Date.now(),
    };

    villages.set(code, village);
    socket.join(code);

    socket.emit('village:created', getPublicVillageState(village));
    emitVillageState(code);

    console.log(`Village created: ${code} (${cleanVillageName}) by ${cleanNarratorName}`);
  });

  socket.on('village:join', ({ participantId, playerName, villageCode } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const cleanPlayerName = normalizeName(playerName);
    const cleanVillageCode = normalizeVillageCode(villageCode);
    const village = villages.get(cleanVillageCode);

    if (!cleanParticipantId) {
      socket.emit('village:error', {
        message: 'No se ha podido identificar esta sesión. Recarga la página e inténtalo de nuevo.',
      });
      return;
    }

    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (existingSession) {
      socket.join(existingSession.village.code);

      socket.emit('session:restored', {
        role: existingSession.role,
        village: getPublicVillageState(existingSession.village),
      });

      socket.emit('village:error', {
        message: 'Este navegador ya está dentro de un pueblo. No puedes unirte dos veces ni usar dos roles a la vez.',
      });

      return;
    }

    if (!cleanPlayerName) {
      socket.emit('village:error', {
        message: 'Escribe tu nombre para unirte al pueblo.',
      });
      return;
    }

    if (!village) {
      socket.emit('village:error', {
        message: 'No existe ningún pueblo con ese código.',
      });
      return;
    }

    if (village.status === 'live') {
      socket.emit('village:error', {
        message: 'Esta partida ya ha comenzado. No es posible unirse ahora.',
      });
      return;
    }

    village.players.push({
      participantId: cleanParticipantId,
      socketId: socket.id,
      name: cleanPlayerName,
      connected: true,
      role: null,
    });

    socket.join(cleanVillageCode);

    socket.emit('village:joined', getPublicVillageState(village));
    emitVillageState(cleanVillageCode);

    console.log(`${cleanPlayerName} joined village: ${cleanVillageCode}`);
  });

  socket.on('village:complete', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede marcar el pueblo como completo.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status === 'live') {
      socket.emit('village:error', {
        message: 'La partida ya ha comenzado.',
      });
      return;
    }

    if (village.players.length < 2) {
      socket.emit('village:error', {
        message: 'Debe haber al menos 2 habitantes antes de cerrar el pueblo.',
      });
      return;
    }

    village.status = 'setup';
    village.settings.killersCount = Math.min(
      village.settings.killersCount,
      Math.max(village.players.length - 1, 1)
    );

    io.to(village.code).emit('village:completed', getPublicVillageState(village));
    emitVillageState(village.code);

    console.log(`Village completed: ${village.code}`);
  });

  socket.on('village:reopen', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede reabrir el pueblo.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status === 'live') {
      socket.emit('village:error', {
        message: 'No se puede reabrir el pueblo cuando la partida ya ha comenzado.',
      });
      return;
    }

    if (village.status === 'waiting') {
      socket.emit('village:error', {
        message: 'El pueblo ya está abierto esperando habitantes.',
      });
      return;
    }

    village.status = 'waiting';
    clearPlayerRoles(village);

    io.to(village.code).emit('village:reopened', getPublicVillageState(village));
    emitVillageState(village.code);

    console.log(`Village reopened: ${village.code}`);
  });

  socket.on('village:delete', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede eliminar el pueblo.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status === 'live') {
      socket.emit('village:error', {
        message: 'No se puede eliminar el pueblo cuando la partida ya ha comenzado.',
      });
      return;
    }

    io.to(village.code).emit('village:deleted', {
      message: 'El narrador ha eliminado el pueblo. Vuelve a la pantalla inicial para elegir de nuevo.',
    });

    villages.delete(village.code);
    emitVillagesList();

    console.log(`Village deleted: ${village.code}`);
  });

  socket.on('village:leave', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'player') {
      socket.emit('village:error', {
        message: 'No estás unido a ningún pueblo como jugador.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status !== 'waiting') {
      socket.emit('village:error', {
        message: 'Ya no puedes salir del pueblo porque el narrador lo ha marcado como completo.',
      });
      return;
    }

    village.players = village.players.filter((player) => player.participantId !== cleanParticipantId);
    socket.leave(village.code);

    socket.emit('village:left', {
      message: 'Has salido del pueblo. Puedes unirte a otro o crear una nueva sesión.',
    });

    emitVillageState(village.code);

    console.log(`Participant left village: ${village.code}`);
  });

  socket.on('village:settings:update', ({ participantId, settings } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede editar la configuración del pueblo.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status !== 'setup') {
      socket.emit('village:error', {
        message: 'Primero marca el pueblo como completo antes de configurar la partida.',
      });
      return;
    }

    const normalizedSettings = normalizeSettings(settings);
    const validationError = validatePlayableSettings(village, normalizedSettings);

    if (validationError) {
      socket.emit('village:error', {
        message: validationError,
      });
      return;
    }

    village.settings = normalizedSettings;

    socket.emit('village:settings:saved', getPublicVillageState(village));
    emitVillageState(village.code);

    console.log(`Village settings updated: ${village.code}`);
  });

  socket.on('village:start', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede comenzar la partida.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status !== 'setup') {
      socket.emit('village:error', {
        message: 'Primero marca el pueblo como completo y guarda la configuración.',
      });
      return;
    }

    const validationError = validatePlayableSettings(village, village.settings);

    if (validationError) {
      socket.emit('village:error', {
        message: validationError,
      });
      return;
    }

    assignRolesToPlayers(village);
    village.status = 'live';

    io.to(village.code).emit('village:started', getPublicVillageState(village));
    emitVillageState(village.code);
    emitPrivatePlayerStates(village);

    console.log(`Village started: ${village.code}`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    markParticipantDisconnected(socket);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
