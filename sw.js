const CACHE_NAME = 'suno-playground-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/base.css',
  '/css/editor.css',
  '/css/forms.css',
  '/css/landing.css',
  '/css/layout.css',
  '/css/library.css',
  '/css/mobile.css',
  '/css/modals.css',
  '/css/player.css',
  '/css/sidebar.css',
  '/js/app.js',
  '/js/api.js',
  '/js/config.js',
  '/js/editor.js',
  '/js/library.js',
  '/js/player.js',
  '/js/ui.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css'
];

// Установка Service Worker и кэширование основных ресурсов
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

// Активация Service Worker и удаление старых кэшей
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Перехват сетевых запросов
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Стратегия "Network First, falling back to Cache" для API-запросов
  if (url.pathname.startsWith('/api/songs') || url.pathname.startsWith('/api/projects')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Если запрос успешен, клонируем ответ и сохраняем в кэш
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => {
          // Если сети нет, пытаемся отдать из кэша
          return caches.match(request);
        })
    );
    return;
  }

  // Стратегия "Cache First, falling back to Network" для всего остального (оболочка приложения, шрифты, иконки)
  event.respondWith(
    caches.match(request)
      .then((response) => {
        // Если ресурс найден в кэше, отдаем его
        if (response) {
          return response;
        }
        // Иначе, делаем запрос к сети
        return fetch(request);
      })
  );
});