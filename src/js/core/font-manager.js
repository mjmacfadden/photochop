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
		this.systemFontStyleDataMap = new Map(); // family -> Map(styleLower -> fontData)
		this.systemFontVariantsMap = new Map();
		this.loadedSystemFonts = new Set();
		this.loadedSystemFontStyles = new Set(); // family||style keys
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
		this.systemFontStyleDataMap.clear();
		this.systemFontVariantsMap.clear();
		for (const font of localFonts) {
			if (font && font.family) {
				const familyName = font.family.trim();
				familySet.add(familyName);
				if (!this.systemFontVariantsMap.has(familyName)) {
					this.systemFontVariantsMap.set(familyName, new Set());
				}
				if (!this.systemFontStyleDataMap.has(familyName)) {
					this.systemFontStyleDataMap.set(familyName, new Map());
				}
				const styleName = (font.style && String(font.style).trim()) ? String(font.style).trim() : 'Regular';
				this.systemFontVariantsMap.get(familyName).add(styleName);
				this.systemFontStyleDataMap.get(familyName).set(styleName.toLowerCase(), font);
				if (!this.systemFontDataMap.has(familyName) || styleName.toLowerCase() === 'regular') {
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
		// Empty (not ['regular']) so callers can fall through to Google/user catalogs.
		return [];
	}

	/**
	 * Friendly weight/style labels for the options-bar Weight select.
	 * Merges Local Font Access faces, Google cache variants, and user_fonts metadata.
	 */
	getFontWeightList(family, googleFontsCache = null) {
		const labels = [];
		const seen = new Set();
		const push = (raw) => {
			if (raw == null) return;
			const label = this.formatWeightLabel(raw);
			if (!label) return;
			const key = this.weightLabelBase(label).toLowerCase().replace(/[\s_-]+/g, '');
			if (seen.has(key)) return;
			seen.add(key);
			labels.push(label);
		};
		const pushVariant = (v) => {
			if (v == null) return;
			const s = String(v).trim();
			if (!s) return;
			// Italic is a separate options-bar toggle — fold italic faces into their weight base.
			if (/^italic$/i.test(s) || /^oblique$/i.test(s)) return;
			if (/italic|oblique/i.test(s)) {
				const base = s.replace(/italic|oblique/ig, '').trim();
				if (base) push(base);
				return;
			}
			push(s);
		};
		for (const v of this.getSystemFontVariants(family)) pushVariant(v);
		if (typeof config !== 'undefined' && config.user_fonts && config.user_fonts[family]
			&& Array.isArray(config.user_fonts[family].variants)) {
			for (const v of config.user_fonts[family].variants) pushVariant(v);
		}
		const cache = googleFontsCache
			|| (typeof window !== 'undefined' ? (window.__googleFontsCache || window.googleFontsCache) : null);
		if (Array.isArray(cache)) {
			const entry = cache.find((f) => f && f.family === family);
			if (entry && Array.isArray(entry.variants)) {
				for (const v of entry.variants) pushVariant(v);
			}
		}
		if (labels.length === 0) {
			return ['Regular (400)', 'Bold (700)'];
		}
		const order = ['thin','extralight','ultralight','light','regular','normal','medium','semibold','demibold','bold','extrabold','ultrabold','black','heavy'];
		labels.sort((a, b) => {
			const strip = (x) => String(x).replace(/\s*\(\d{2,4}\)\s*$/, '').toLowerCase().replace(/[\s_-]+/g, '');
			const ka = strip(a);
			const kb = strip(b);
			const ia = order.findIndex((o) => ka === o || ka.startsWith(o));
			const ib = order.findIndex((o) => kb === o || kb.startsWith(o));
			const numOf = (x) => {
				const m = String(x).match(/\((\d{2,4})\)/);
				if (m) return parseInt(m[1], 10);
				const n = parseInt(x, 10);
				return isNaN(n) ? null : n;
			};
			const na = numOf(a);
			const nb = numOf(b);
			if (na != null && nb != null) return na - nb;
			if (ia >= 0 && ib >= 0) return ia - ib;
			if (ia >= 0) return -1;
			if (ib >= 0) return 1;
			return a.localeCompare(b);
		});
		return labels;
	}

	/**
		 * Friendly Weight dropdown label with CSS numeric weight, e.g. "Light (300)".
		 * Light is 300 (not 100); Thin=100, ExtraLight=200, Regular=400, Medium=500,
		 * SemiBold=600, Bold=700, ExtraBold=800, Black=900.
		 */
	formatWeightLabel(raw) {
		const s = String(raw == null ? '' : raw).trim();
		if (!s) return null;
		// Already formatted
		if (/^.+\s\(\d{2,4}\)$/.test(s)) return s;
		const nameMap = {
			'100': 'Thin', '200': 'ExtraLight', '300': 'Light', '400': 'Regular',
			'500': 'Medium', '600': 'SemiBold', '700': 'Bold', '800': 'ExtraBold', '900': 'Black',
			'regular': 'Regular', 'normal': 'Regular',
			'thin': 'Thin', 'hairline': 'Thin',
			'extralight': 'ExtraLight', 'ultralight': 'ExtraLight',
			'light': 'Light', 'medium': 'Medium',
			'semibold': 'SemiBold', 'demibold': 'SemiBold', 'semi': 'SemiBold',
			'bold': 'Bold',
			'extrabold': 'ExtraBold', 'ultrabold': 'ExtraBold',
			'black': 'Black', 'heavy': 'Black',
		};
		const cssMap = {
			'Thin': '100', 'ExtraLight': '200', 'Light': '300', 'Regular': '400',
			'Medium': '500', 'SemiBold': '600', 'Bold': '700', 'ExtraBold': '800', 'Black': '900',
		};
		// Strip trailing (nnn) if re-formatting, and italic (Weight dropdown is upright-only)
		let base = s.replace(/\s*\(\d{2,4}\)\s*$/, '').trim();
		base = base.replace(/italic|oblique/ig, '').trim() || base;
		const key = base.toLowerCase().replace(/[\s_-]+/g, '');
		let name = nameMap[key] || nameMap[base];
		if (!name && /^\d{2,4}$/.test(key)) name = nameMap[key];
		if (!name) {
			name = base.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bItalic\b/i, '').trim();
		}
		if (!name) return null;
		// Resolve CSS number: prefer explicit digits in raw, else canonical map, else styleNameToCssWeight
		let num = null;
		const paren = s.match(/\((\d{2,4})\)/);
		const leading = base.match(/^(\d{2,4})$/);
		if (paren) num = paren[1];
		else if (leading) num = String(parseInt(leading[1], 10));
		else if (cssMap[name]) num = cssMap[name];
		else num = this.styleNameToCssWeight(name);
		return name + ' (' + num + ')';
	}

	/** Strip " (400)" display suffix → "Regular" for Local Font Access matching. */
	weightLabelBase(label) {
		if (label == null) return '';
		return String(label).replace(/\s*\(\d{2,4}\)\s*$/, '').trim();
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



	/** Map Local Font Access / dropdown style labels to CSS numeric font-weight (100–900). */
	styleNameToCssWeight(styleName) {
		if (styleName == null || styleName === '') return '400';
		const s = String(styleName).trim();
		const paren = s.match(/\((\d{2,4})\)/);
		if (paren) return String(parseInt(paren[1], 10));
		const base = s.replace(/\s*\(\d{2,4}\)\s*$/, '').trim();
		const bareNum = base.match(/^(\d{2,4})$/);
		if (bareNum) return String(parseInt(bareNum[1], 10));
		const w = base.toLowerCase().replace(/[\s_-]+/g, '').replace(/italic|oblique/g, '');
		if (!w || w === 'regular' || w === 'normal' || w === 'book' || w === 'roman') return '400';
		if (w === 'thin' || w === 'hairline') return '100';
		if (w === 'extralight' || w === 'ultralight') return '200';
		if (w === 'light') return '300';
		if (w === 'medium') return '500';
		if (w === 'semibold' || w === 'demibold' || w === 'semi') return '600';
		if (w === 'extrabold' || w === 'ultrabold') return '800';
		if (w === 'black' || w === 'heavy' || w === 'heavyblack') return '900';
		if (w === 'bold') return '700';
		if (w.includes('extralight') || w.includes('ultralight')) return '200';
		if (w.includes('thin') || w.includes('hairline')) return '100';
		if (w.includes('light')) return '300';
		if (w.includes('medium')) return '500';
		if (w.includes('semibold') || w.includes('demibold')) return '600';
		if (w.includes('extrabold') || w.includes('ultrabold')) return '800';
		if (w.includes('black') || w.includes('heavy')) return '900';
		if (w.includes('bold')) return '700';
		const embedded = base.match(/(\d{2,4})/);
		if (embedded) return String(parseInt(embedded[1], 10));
		return '400';
	}

	async loadSystemFontStyle(family, style = 'Regular') {
		if (!family) return false;
		// Accept dropdown labels like "Medium (500)" — match Local Font Access "Medium"
		let styleName = (style && String(style).trim()) ? String(style).trim() : 'Regular';
		styleName = this.weightLabelBase(styleName) || styleName;
		const key = family + '||' + styleName.toLowerCase();
		if (this.loadedSystemFontStyles.has(key)) return true;

		if (!this.systemFontStyleDataMap.has(family) && this.isLocalFontAccessSupported()) {
			try {
				await this.querySystemFonts();
			} catch (e) {}
		}

		const styleMap = this.systemFontStyleDataMap.get(family);
		let fontData = styleMap ? styleMap.get(styleName.toLowerCase()) : null;
		if (!fontData && styleMap) {
			// Fuzzy match: prefer exact / prefix, then weight-equivalent labels
			const want = styleName.toLowerCase();
			const wantWeight = this.styleNameToCssWeight(styleName);
			let fallback = null;
			for (const [k, v] of styleMap.entries()) {
				if (k === want || k.replace(/\s+/g, '') === want.replace(/\s+/g, '')) {
					fontData = v;
					break;
				}
				if (!fallback && this.styleNameToCssWeight(k) === wantWeight
					&& (/italic|oblique/i.test(k) === /italic|oblique/i.test(styleName))) {
					fallback = v;
				}
			}
			if (!fontData) fontData = fallback;
		}
		if (!fontData) {
			return this.loadSystemFont(family);
		}
		if (typeof fontData.blob !== 'function') {
			return false;
		}
		try {
			const blob = await fontData.blob();
			const url = URL.createObjectURL(blob);
			// Register under the family name so canvas font-family still matches;
			// CSS font-weight/style on the canvas context selects the face when available.
			// IMPORTANT: map Thin→100, ExtraLight→200, Light→300, … Black→900.
			// Prior bug: /light|thin/ collapsed Thin+ExtraLight+Light all to 300, so
			// canvas font-weight 100/200 fell back to Regular and looked identical.
			const weight = this.styleNameToCssWeight(styleName);
			const fontStyle = /italic|oblique/i.test(styleName) ? 'italic' : 'normal';
			const fontFace = new FontFace(family, `url(${url})`, { weight, style: fontStyle });
			const loaded = await fontFace.load();
			document.fonts.add(loaded);
			URL.revokeObjectURL(url);
			this.loadedSystemFontStyles.add(key);
			this.loadedSystemFonts.add(family);
			return true;
		} catch (e) {
			console.warn(`Could not load local font style ${family} / ${styleName}:`, e);
			return this.loadSystemFont(family);
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
