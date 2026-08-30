const DATABASE_NAME = 'photochopRecovery';
const STORE_NAME = 'projects';
const PROJECT_KEY = 'current';

let database_promise = null;

function get_database() {
	if (database_promise != null)
		return database_promise;
	database_promise = new Promise(function (resolve, reject) {
		var request = indexedDB.open(DATABASE_NAME, 2);
		request.onupgradeneeded = function () {
			if (!request.result.objectStoreNames.contains(STORE_NAME)) {
				request.result.createObjectStore(STORE_NAME);
			}
		};
		request.onsuccess = function () {
			resolve(request.result);
		};
		request.onerror = function () {
			reject(request.error);
		};
	});
	return database_promise;
}

export default {
	async save(data) {
		if (!window.indexedDB)
			return;
		var database = await get_database();
		await new Promise(function (resolve, reject) {
			var request = database.transaction(STORE_NAME, 'readwrite')
				.objectStore(STORE_NAME).put({ data: data, saved_at: Date.now() }, PROJECT_KEY);
			request.onsuccess = resolve;
			request.onerror = function () { reject(request.error); };
		});
	},
};