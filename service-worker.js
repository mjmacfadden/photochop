var CACHE_NAME = 'photochop-shell-v2';
var APP_SHELL = [
	'./',
	'./index.html',
	'./manifest.json',
	'./dist/bundle.js',
	'./dist/styles.css',
	'./images/favicon.png',
	'./images/photochop_logo.png',
	'./images/omarchy-logo.svg',
	'./images/manifest/192x192.png'
];

self.addEventListener('install', function (event) {
	event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
		return cache.addAll(APP_SHELL);
	}));
	self.skipWaiting();
});

self.addEventListener('activate', function (event) {
	event.waitUntil(caches.keys().then(function (keys) {
		return Promise.all(keys.filter(function (key) {
			return key.indexOf('photochop-shell-') === 0 && key !== CACHE_NAME;
		}).map(function (key) {
			return caches.delete(key);
		}));
	}));
	self.clients.claim();
});

self.addEventListener('fetch', function (event) {
	if (event.request.method !== 'GET' || event.request.url.indexOf(self.location.origin) !== 0)
		return;

	event.respondWith(caches.match(event.request).then(function (cached) {
		var refresh = fetch(event.request).then(function (response) {
			if (response.ok && response.type === 'basic') {
				var responseToCache = response.clone();
				caches.open(CACHE_NAME).then(function (cache) {
					cache.put(event.request, responseToCache);
				});
			}
			return response;
		}).catch(function () {
			return cached;
		});
		return cached || refresh;
	}));
});
