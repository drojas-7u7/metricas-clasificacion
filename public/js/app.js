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

socket.on('connect', () => {
  console.log(`Connected to server with socket id: ${socket.id}`);
});

socket.on('server:welcome', (data) => {
  console.log(data.message);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  renderView(window.location.pathname, false);
});
