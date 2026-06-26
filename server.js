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

function normalizeName(name) {
  return String(name || '').trim().slice(0, 40);
}

function normalizeVillageCode(code) {
  return String(code || '').trim().toUpperCase();
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

function getPublicVillageState(village) {
  return {
    code: village.code,
    narrator: village.narrator,
    players: village.players,
    totalPlayers: village.players.length,
  };
}

function emitVillageState(villageCode) {
  const village = villages.get(villageCode);

  if (!village) {
    return;
  }

  io.to(villageCode).emit('village:state', getPublicVillageState(village));
}

function removeSocketFromVillages(socketId) {
  for (const [code, village] of villages.entries()) {
    if (village.narrator.id === socketId) {
      io.to(code).emit('village:closed', {
        message: 'El narrador se ha desconectado. El pueblo se ha cerrado.',
      });

      villages.delete(code);
      return;
    }

    const initialPlayersCount = village.players.length;
    village.players = village.players.filter((player) => player.id !== socketId);

    if (village.players.length !== initialPlayersCount) {
      emitVillageState(code);
      return;
    }
  }
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

  socket.on('village:create', ({ narratorName } = {}) => {
    const cleanNarratorName = normalizeName(narratorName);

    if (!cleanNarratorName) {
      socket.emit('village:error', {
        message: 'Escribe un nombre para crear el pueblo.',
      });
      return;
    }

    removeSocketFromVillages(socket.id);

    const code = generateVillageCode();
    const village = {
      code,
      narrator: {
        id: socket.id,
        name: cleanNarratorName,
      },
      players: [],
      createdAt: Date.now(),
    };

    villages.set(code, village);
    socket.join(code);

    socket.emit('village:created', getPublicVillageState(village));
    emitVillageState(code);

    console.log(`Village created: ${code} by ${cleanNarratorName}`);
  });

  socket.on('village:join', ({ playerName, villageCode } = {}) => {
    const cleanPlayerName = normalizeName(playerName);
    const cleanVillageCode = normalizeVillageCode(villageCode);
    const village = villages.get(cleanVillageCode);

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

    removeSocketFromVillages(socket.id);

    village.players = village.players.filter((player) => player.id !== socket.id);
    village.players.push({
      id: socket.id,
      name: cleanPlayerName,
    });

    socket.join(cleanVillageCode);

    socket.emit('village:joined', getPublicVillageState(village));
    emitVillageState(cleanVillageCode);

    console.log(`${cleanPlayerName} joined village: ${cleanVillageCode}`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    removeSocketFromVillages(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
