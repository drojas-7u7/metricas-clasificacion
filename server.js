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

// Serve static frontend files from the public folder
app.use(express.static(PUBLIC_DIR));

// Simple health check route for local testing and deployment platforms
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'metricas-clasificacion',
  });
});

// SPA fallback for clean internal routes
appRoutes.forEach((route) => {
  app.get(route, (req, res) => {
    res.sendFile(INDEX_FILE);
  });
});

// Initial Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.emit('server:welcome', {
    message: 'Conectado al servidor de Métricas de Clasificación.',
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
