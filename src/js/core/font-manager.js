import config from './../config.js';
import app from './../app.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

class Font_manager_class {
	constructor() {
		this.dbName = 'photochop_fonts';
		this.dbVersion = 1;
		this.storeName = 'custom_fonts';
		this.db = null;
		this.cachedSystemFonts = [];
		this.customFonts = new Map();
		this.systemFontDataMap = new Map();
		this.systemFontVariantsMap = new Map();
		this.loadedSystemFonts = new Set();
	}

	async openDB() {
		if (this.db) return this.db;
		return new Promise((resolve) => {
			if (!window.indexedDB) {
				console.warn('IndexedDB not supported, custom fonts will not persist.');
				resolve(null);
				return;
			}
			try {
				const request = indexedDB.open(this.dbName, this.dbVersion);
				request.onupgradeneeded = (e) => {
					const db = e.target.result;
					if (!db.objectStoreNames.contains(this.storeName)) {
						db.createObjectStore(this.storeName, { keyPath: 'name' });
					}
				};
				request.onsuccess = (e) => {
					this.db = e.target.result;
					resolve(this.db);
				};
				request.onerror = (e) => {
					console.error('IndexedDB error:', e.target.error);
					resolve(null);
				};
			} catch (e) {
				console.error('Failed to open IndexedDB:', e);
				resolve(null);
			}
		});
	}

	async init() {
		// Load cached system font family names
		try {
			const cached = localStorage.getItem('photochop_local_fonts');
			if (cached) {
				this.cachedSystemFonts = JSON.parse(cached);
			}
		} catch (e) {}
		this.restoreSelectedLocalFonts();

		// Load stored custom fonts from IndexedDB
		try {
			const storedFonts = await this.getAllFromIndexedDB();
			for (const item of storedFonts) {
				try {
					const fontFace = new FontFace(item.name, item.buffer.slice(0));
					const loaded = await fontFace.load();
					document.fonts.add(loaded);
					config.user_fonts[item.name] = { family: item.name, source: 'user_uploaded' };
					this.customFonts.set(item.name, {
						name: item.name,
						fileName: item.fileName,
						date: item.date
					});
				} catch (err) {
					console.warn('Could not register stored font:', item.name, err);
				}
			}
			if (storedFonts.length > 0 && app.GUI && app.GUI.GUI_tools) {
				app.GUI.GUI_tools.show_action_attributes();
			}
		} catch (err) {
			console.error('Error initializing stored fonts:', err);
		}
	}

	async getAllFromIndexedDB() {
		const db = await this.openDB();
		if (!db) return [];
		return new Promise((resolve) => {
			try {
				const tx = db.transaction(this.storeName, 'readonly');
				const store = tx.objectStore(this.storeName);
				const request = store.getAll();
				request.onsuccess = () => resolve(request.result || []);
				request.onerror = (e) => {
					console.error('Failed to get stored fonts:', e.target.error);
					resolve([]);
				};
			} catch (e) {
				console.error('Transaction error in getAllFromIndexedDB:', e);
				resolve([]);
			}
		});
	}

	async saveToIndexedDB(name, buffer, type, fileName) {
		const db = await this.openDB();
		if (!db) return false;
		return new Promise((resolve) => {
			try {
				const tx = db.transaction(this.storeName, 'readwrite');
				const store = tx.objectStore(this.storeName);
				const record = {
					name,
					buffer,
					type,
					fileName,
					date: Date.now()
				};
				const request = store.put(record);
				request.onsuccess = () => resolve(true);
				request.onerror = (e) => {
					console.error('Failed to save font to IndexedDB:', e.target.error);
					resolve(false);
				};
			} catch (e) {
				console.error('Transaction error in saveToIndexedDB:', e);
				resolve(false);
			}
		});
	}

	async deleteFromIndexedDB(name) {
		const db = await this.openDB();
		if (!db) return false;
		return new Promise((resolve) => {
			try {
				const tx = db.transaction(this.storeName, 'readwrite');
				const store = tx.objectStore(this.storeName);
				const request = store.delete(name);
				request.onsuccess = () => resolve(true);
				request.onerror = (e) => {
					console.error('Failed to delete font from IndexedDB:', e.target.error);
					resolve(false);
				};
			} catch (e) {
				console.error('Transaction error in deleteFromIndexedDB:', e);
				resolve(false);
			}
		});
	}

	async addFontFile(file) {
		const fileName = file.name || 'CustomFont.ttf';
		const extMatch = fileName.match(/\.([a-z0-9]+)$/i);
		const ext = extMatch ? extMatch[1].toLowerCase() : '';
		if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
			throw new Error('Unsupported font format. Supported formats: .ttf, .otf, .woff, .woff2');
		}
		const familyName = fileName.replace(/\.[^/.]+$/, "").trim();
		const buffer = await file.arrayBuffer();

		// Register in document.fonts
		const faceBuffer = buffer.slice(0);
		const dbBuffer = buffer.slice(0);
		const fontFace = new FontFace(familyName, faceBuffer);
		const loadedFace = await fontFace.load();
		document.fonts.add(loadedFace);

		// Persist in IndexedDB
		await this.saveToIndexedDB(familyName, dbBuffer, ext, fileName);

		// Register in config.user_fonts
		config.user_fonts[familyName] = { family: familyName, source: 'user_uploaded' };
		this.customFonts.set(familyName, {
			name: familyName,
			fileName: fileName,
			date: Date.now()
		});

		// Refresh GUI
		if (app.GUI && app.GUI.GUI_tools) {
			const actionData = app.GUI.GUI_tools.action_data();
			if (actionData && actionData.attributes && actionData.attributes.font) {
				actionData.attributes.font.value = familyName;
			}
			app.GUI.GUI_tools.show_action_attributes();
			if (config.TOOL && config.TOOL.name === 'text') {
				const textTool = app.GUI.GUI_tools.tools_modules['text']?.object;
				if (textTool && typeof textTool.on_params_update === 'function') {
					textTool.on_params_update({ key: 'font', value: familyName });
				}
			}
		}
		if (app.Layers) {
			app.Layers.render();
		}
		return familyName;
	}

	async deleteCustomFont(fontName) {
		await this.deleteFromIndexedDB(fontName);
		delete config.user_fonts[fontName];
		this.customFonts.delete(fontName);
		if (app.GUI && app.GUI.GUI_tools) {
			app.GUI.GUI_tools.show_action_attributes();
		}
	}

	getCustomFontNames() {
		return Array.from(this.customFonts.keys());
	}

	get_user_fonts() {
		const userFonts = {};
		for (const [name] of this.customFonts) {
			userFonts[name] = { family: name, source: 'user_uploaded' };
		}
		for (const k in config.user_fonts) {
			userFonts[k] = config.user_fonts[k];
		}
		return userFonts;
	}

	openFontFileDialog(callback) {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.ttf,.otf,.woff,.woff2';
		input.multiple = true;
		input.style.display = 'none';
		document.body.appendChild(input);

		input.addEventListener('change', async () => {
			const files = Array.from(input.files || []);
			if (input.parentNode) input.parentNode.removeChild(input);
			if (files.length === 0) return;
			const loaded = [];
			for (const f of files) {
				try {
					const name = await this.addFontFile(f);
					loaded.push(name);
				} catch (err) {
					alertify.error('Failed to load ' + f.name + ': ' + (err.message || err));
				}
			}
			if (loaded.length > 0) {
				alertify.success(`Loaded and saved ${loaded.length} font(s): ${loaded.join(', ')}`);
				if (typeof callback === 'function') {
					callback(loaded);
				}
			}
		});
		input.click();
	}

	isLocalFontAccessSupported() {
		return typeof window.queryLocalFonts === 'function';
	}

	async querySystemFonts(forceRefresh = false) {
		if (!this.isLocalFontAccessSupported()) {
			throw new Error('System font access is not supported by this browser.');
		}
		if (!forceRefresh && this.cachedSystemFonts && this.cachedSystemFonts.length > 0 && this.systemFontDataMap.size > 0) {
			return this.cachedSystemFonts;
		}
		const localFonts = await window.queryLocalFonts();
		const familySet = new Set();
		this.systemFontDataMap.clear();
		this.systemFontVariantsMap.clear();
		for (const font of localFonts) {
			if (font && font.family) {
				const familyName = font.family.trim();
				familySet.add(familyName);
				if (!this.systemFontVariantsMap.has(familyName)) {
					this.systemFontVariantsMap.set(familyName, new Set());
				}
				if (font.style) {
					this.systemFontVariantsMap.get(familyName).add(font.style);
				}
				if (!this.systemFontDataMap.has(familyName) || (font.style && font.style.toLowerCase() === 'regular')) {
					this.systemFontDataMap.set(familyName, font);
				}
			}
		}
		const uniqueFamilies = Array.from(familySet).filter(Boolean).sort((a, b) => a.localeCompare(b));
		this.cachedSystemFonts = uniqueFamilies;
		try {
			localStorage.setItem('photochop_local_fonts', JSON.stringify(uniqueFamilies));
		} catch (e) {}
		return uniqueFamilies;
	}

	getSystemFontVariants(family) {
		if (this.systemFontVariantsMap && this.systemFontVariantsMap.has(family)) {
			return Array.from(this.systemFontVariantsMap.get(family));
		}
		return ['regular'];
	}

	async loadSystemFont(family) {
		if (!family) return false;
		if (this.loadedSystemFonts.has(family)) return true;

		if (document.fonts && typeof document.fonts.check === 'function') {
			try {
				if (document.fonts.check(`16px "${family}"`)) {
					this.loadedSystemFonts.add(family);
					return true;
				}
			} catch (e) {}
		}

		if (!this.systemFontDataMap.has(family) && this.isLocalFontAccessSupported()) {
			try {
				await this.querySystemFonts();
			} catch (e) {}
		}

		const fontData = this.systemFontDataMap.get(family);
		if (!fontData || typeof fontData.blob !== 'function') {
			return false;
		}

		try {
			const blob = await fontData.blob();
			const url = URL.createObjectURL(blob);
			const fontFace = new FontFace(family, `url(${url})`);
			const loaded = await fontFace.load();
			document.fonts.add(loaded);
			URL.revokeObjectURL(url);
			this.loadedSystemFonts.add(family);
			return true;
		} catch (e) {
			console.warn(`Could not load local font ${family}:`, e);
			return false;
		}
	}

	async loadFont(family, source = 'google', variants = null, callback = null) {
		if (!family) return false;
		if (source === 'user_uploaded') {
			if (callback) callback();
			return true;
		}
		if (source === 'local') {
			const ok = await this.loadSystemFont(family);
			if (callback) callback();
			return ok;
		}
		if (typeof window.load_font_family === 'function') {
			window.load_font_family({ family, variants, source: 'google' }, callback);
		}
		return true;
	}

	getCachedSystemFonts() {
		if (this.cachedSystemFonts && this.cachedSystemFonts.length > 0) {
			return this.cachedSystemFonts;
		}
		try {
			const cached = localStorage.getItem('photochop_local_fonts');
			if (cached) {
				this.cachedSystemFonts = JSON.parse(cached);
				return this.cachedSystemFonts;
			}
		} catch (e) {}
		return [];
	}

	restoreSelectedLocalFonts() {
		try {
			const raw = localStorage.getItem('photochop_selected_local_fonts');
			if (!raw) return;
			const names = JSON.parse(raw);
			if (!Array.isArray(names)) return;
			for (const name of names) {
				if (!name) continue;
				if (!config.user_fonts[name]) {
					config.user_fonts[name] = { family: name, source: 'local' };
				}
			}
		} catch (e) {}
	}

	persistSelectedLocalFonts() {
		try {
			const names = Object.keys(config.user_fonts).filter((name) => {
				return config.user_fonts[name] && config.user_fonts[name].source === 'local';
			});
			localStorage.setItem('photochop_selected_local_fonts', JSON.stringify(names));
		} catch (e) {}
	}
}

export default Font_manager_class;
