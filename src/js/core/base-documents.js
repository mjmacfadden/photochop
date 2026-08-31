/*
 * PhotoChop - Tabbed Document Workspace Manager
 */

import app from '../app.js';
import config from '../config.js';
import Base_layers_class from './base-layers.js';
import Base_gui_class from './base-gui.js';
import zoomView from '../libs/zoomView.js';
import Helper_class from '../libs/helpers.js';

var instance = null;

class Base_documents_class {

	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_layers = new Base_layers_class();
		this.Base_gui = new Base_gui_class();
		this.Helper = new Helper_class();

		this.documents = [];
		this.active_id = null;
		this.auto_title_count = 1;
		this.tab_container = null;
	}

	init() {
		this.tab_container = document.getElementById('document_tabs');
		if (!this.tab_container) {
			const middleArea = document.getElementById('middle_area');
			if (middleArea) {
				this.tab_container = document.createElement('div');
				this.tab_container.className = 'document_tabs';
				this.tab_container.id = 'document_tabs';
				middleArea.insertBefore(this.tab_container, middleArea.firstChild);
			}
		}

		this.auto_title_count = 1;

		// Create the initial default document
		const initialDoc = this._create_doc_model({
			id: 'doc_' + Date.now(),
			title: 'Untitled-1',
			width: config.WIDTH || 800,
			height: config.HEIGHT || 600,
			layers: config.layers,
			layer: config.layer,
			zoom: config.ZOOM || 1,
			guides: config.guides || [],
			user_fonts: config.user_fonts || {},
			action_history: (app.State && app.State.action_history) ? app.State.action_history : [],
			action_history_index: (app.State && app.State.action_history_index) ? app.State.action_history_index : 0,
			auto_increment: this.Base_layers ? this.Base_layers.auto_increment : 2,
			is_dirty: false,
		});
		this.auto_title_count = 2;

		this.documents = [initialDoc];
		this.active_id = initialDoc.id;

		this.render_tabs();
		this.set_events();
	}

	_create_doc_model(options = {}) {
		const w = options.width || config.WIDTH || 800;
		const h = options.height || config.HEIGHT || 600;
		const transp = options.transparency !== false;

		let layers = options.layers;
		let layer = options.layer;

		if (!layers || layers.length === 0) {
			var bgCanvas = document.createElement('canvas');
			bgCanvas.width = w;
			bgCanvas.height = h;
			var bgCtx = bgCanvas.getContext('2d');
			if (!transp) {
				bgCtx.fillStyle = '#ffffff';
				bgCtx.fillRect(0, 0, w, h);
			}

			const defaultLayer = {
				id: 1,
				name: transp ? 'Layer 1' : 'Background',
				locked: !transp,
				type: 'image',
				link: bgCanvas,
				data: bgCanvas.toDataURL(),
				filters: [],
				order: 1,
				width: w,
				height: h,
				width_original: w,
				height_original: h,
				x: 0,
				y: 0,
			};

			layers = [defaultLayer];
			layer = defaultLayer;
		}

		return {
			id: options.id || ('doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
			title: options.title || ('Untitled-' + this.auto_title_count++),
			width: w,
			height: h,
			layers: layers,
			layer: layer || layers[0],
			zoom: options.zoom || 1,
			zoom_data: options.zoom_data || null,
			guides: options.guides || [],
			user_fonts: options.user_fonts || {},
			action_history: options.action_history || [],
			action_history_index: options.action_history_index || 0,
			auto_increment: options.auto_increment || 2,
			transparency: transp,
			is_dirty: options.is_dirty || false,
			selection: options.selection || null,
			Composite_cache: options.Composite_cache || null,
		};
	}

	set_events() {
		document.addEventListener('keydown', (e) => {
			if (this.Helper.is_input(e.target)) return;

			// Ctrl/Cmd + W = Close active document tab
			if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.code === 'KeyW' || e.key === 'w' || e.key === 'W')) {
				e.preventDefault();
				e.stopImmediatePropagation();
				this.close_document(this.active_id);
				return;
			}

			// Ctrl/Cmd + Alt + Tab or Ctrl + Tab = Cycle tabs
			if ((e.ctrlKey || e.metaKey) && (e.code === 'Tab' || e.key === 'Tab')) {
				e.preventDefault();
				e.stopImmediatePropagation();
				this.cycle_tab(e.shiftKey ? -1 : 1);
				return;
			}
		});

		if (this.tab_container) {
			this.tab_container.addEventListener('mouseenter', () => {
				const mouseEl = document.getElementById('mouse');
				if (mouseEl) {
					mouseEl.className = '';
				}
			});
		}
	}

	get_active_document() {
		return this.documents.find(d => d.id === this.active_id) || this.documents[0] || null;
	}

	save_current_state() {
		const doc = this.get_active_document();
		if (!doc) return;

		doc.width = config.WIDTH;
		doc.height = config.HEIGHT;
		doc.layers = config.layers;
		doc.layer = config.layer;
		doc.zoom = config.ZOOM;
		doc.guides = config.guides;
		doc.user_fonts = config.user_fonts;
		doc.transparency = config.TRANSPARENCY;
		if (app.State) {
			doc.action_history = app.State.action_history;
			doc.action_history_index = app.State.action_history_index;
		}
		if (this.Base_layers) {
			doc.auto_increment = this.Base_layers.auto_increment;
		}
		if (app.GUI && app.GUI.GUI_preview && app.GUI.GUI_preview.zoom_data) {
			doc.zoom_data = JSON.parse(JSON.stringify(app.GUI.GUI_preview.zoom_data));
		}
		if (zoomView && zoomView.getState) {
			doc.zoomView_state = zoomView.getState();
		}
		// Save selection state isolated to this document
		const selModule = (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['selection'])
			? app.GUI.GUI_tools.tools_modules['selection'].object
			: null;
		if (selModule && selModule.selection) {
			doc.selection = JSON.parse(JSON.stringify(selModule.selection));
		}
	}

	async restore_state(doc) {
		if (!doc) return;

		// 1. Ensure all image layers have valid link or link_canvas
		if (doc.layers && Array.isArray(doc.layers)) {
			for (let l of doc.layers) {
				if (l.type === 'image' && !l.link && !l.link_canvas) {
					if (typeof l.data === 'string') {
						const img = new Image();
						img.src = l.data;
						l.link = img;
					} else if (l.data instanceof HTMLCanvasElement || l.data instanceof HTMLImageElement) {
						l.link = l.data;
					}
				}
				if (!l.filters) {
					l.filters = [];
				}
			}
		}

		// 2. Invalidate GPU and Composite Caches so previous document layers do not linger
		if (this.Base_layers) {
			var renderer = this.Base_layers.active_renderer;
			if (renderer && renderer.clear_texture_cache) {
				renderer.clear_texture_cache();
			}
			if (this.Base_layers.Composite_cache) {
				this.Base_layers.Composite_cache.invalidate_document();
				this.Base_layers.Composite_cache.rulerDirty = true;
				this.Base_layers.Composite_cache.detailsDirty = true;
				this.Base_layers.Composite_cache.previewDirty = true;
			}
			this.Base_layers.last_zoom = doc.zoom || 1;
			this.Base_layers.stable_dimensions = [doc.width, doc.height];
		}

		// 3. Set global config
		config.WIDTH = doc.width;
		config.HEIGHT = doc.height;
		config.layers = (doc.layers && Array.isArray(doc.layers) && doc.layers.length > 0) ? doc.layers : (config.layers || []);
		config.layer = doc.layer || (config.layers ? config.layers[0] : null);
		config.ZOOM = doc.zoom || 1;
		config.guides = doc.guides || [];
		config.user_fonts = doc.user_fonts || {};
		config.TRANSPARENCY = doc.transparency !== false;

		// 4. Restore Undo/Redo State
		if (app.State) {
			app.State.action_history = doc.action_history || [];
			app.State.action_history_index = doc.action_history_index || 0;
			if (app.State.update_undo_redo_buttons) {
				app.State.update_undo_redo_buttons();
			}
		}

		// 5. Restore Base_layers state
		if (this.Base_layers) {
			this.Base_layers.auto_increment = doc.auto_increment || (config.layers ? config.layers.length + 1 : 2);
			this.Base_layers.stable_dimensions = [doc.width, doc.height];
		}

		// 6. Restore Selection state (isolated per document)
		const selModule = (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['selection'])
			? app.GUI.GUI_tools.tools_modules['selection'].object
			: null;
		if (selModule) {
			const restoredSel = doc.selection ? JSON.parse(JSON.stringify(doc.selection)) : {
				x: null,
				y: null,
				width: null,
				height: null,
				shape: 'rect',
				path: null,
				regions: null,
				active_region: null,
			};
			selModule.selection = restoredSel;
			if (selModule.Base_selection) {
				selModule.Base_selection._ant_cache = { key: null, contours: [] };
				var selSettings = selModule.Base_selection.find_settings('selection');
				if (selSettings) {
					selSettings.data = restoredSel;
				}
			}
		}

		// 7. Resize canvas and init zoom
		this.Base_gui.set_size(doc.width, doc.height);
		this.Base_layers.init_zoom_lib();
		zoomView.setContext(this.Base_layers.ctx);
		if (doc.zoomView_state) {
			zoomView.setState(doc.zoomView_state);
		} else {
			zoomView.reset(doc.zoom || 1);
		}

		if (doc.zoom_data && app.GUI && app.GUI.GUI_preview) {
			app.GUI.GUI_preview.zoom_data = JSON.parse(JSON.stringify(doc.zoom_data));
			this.Base_gui.prepare_canvas();
		} else if (app.GUI && app.GUI.GUI_preview) {
			await app.GUI.GUI_preview.zoom_auto(true);
		}

		this.Base_gui.check_canvas_offset();

		// 8. Update UI Panels
		try {
			if (app.GUI && app.GUI.GUI_layers) {
				app.GUI.GUI_layers.render_layers();
			}
			if (app.GUI && app.GUI.GUI_details) {
				app.GUI.GUI_details.render_details();
			}
			if (app.GUI && app.GUI.GUI_information && typeof app.GUI.GUI_information.show_size === 'function') {
				app.GUI.GUI_information.show_size(true);
			}
		} catch (e) {
			console.error('Error updating UI panels during restore_state:', e);
		}

		this.Base_layers.invalidate({ document: true, preview: true, details: true, ruler: true });
		this.Base_layers.render(true);
	}

	is_active_document_empty() {
		const doc = this.get_active_document();
		if (!doc) return true;
		const historyLen = (app.State && app.State.action_history) ? app.State.action_history.length : (doc.action_history ? doc.action_history.length : 0);
		if (historyLen > 0) return false;
		if (doc.is_dirty === true) return false;
		if (!config.layers || config.layers.length > 1) return false;
		if (config.layers.length === 0) return true;
		
		const firstLayer = config.layers[0];
		// If single layer with no edits and 0 history actions
		if (firstLayer && !doc.is_dirty && historyLen === 0) {
			return true;
		}
		return false;
	}

	async create_document(options = {}) {
		if (this.is_active_document_empty() && !options.force_new) {
			const doc = this.get_active_document();
			if (options.title) doc.title = options.title;
			if (options.width) doc.width = options.width;
			if (options.height) doc.height = options.height;
			if (options.transparency != null) doc.transparency = options.transparency;
			await this.restore_state(doc);
			this.render_tabs();
			return doc;
		}

		this.save_current_state();

		const newDoc = this._create_doc_model(options);
		this.documents.push(newDoc);
		this.active_id = newDoc.id;

		await this.restore_state(newDoc);
		this.render_tabs();
		return newDoc;
	}

	async create_document_from_image({ name, data, exif }) {
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = async () => {
				const w = img.width;
				const h = img.height;
				const isPristine = this.is_active_document_empty();

				const new_layer = {
					id: 1,
					name: name || 'Background',
					type: 'image',
					link: img,
					data: data,
					filters: [],
					order: 1,
					width: w,
					height: h,
					width_original: w,
					height_original: h,
					x: 0,
					y: 0,
					_exif: exif,
				};

				if (isPristine) {
					// Update existing tab in place
					const doc = this.get_active_document();
					doc.title = name || ('Untitled-' + this.auto_title_count++);
					doc.width = w;
					doc.height = h;
					doc.layers = [new_layer];
					doc.layer = new_layer;
					doc.auto_increment = 2;
					doc.action_history = [];
					doc.action_history_index = 0;
					doc.is_dirty = false;
					doc.selection = null;

					await this.restore_state(doc);
					this.render_tabs();
					resolve(doc);
				} else {
					// Create new tab
					this.save_current_state();

					const newDoc = this._create_doc_model({
						title: name || ('Untitled-' + this.auto_title_count++),
						width: w,
						height: h,
						layers: [new_layer],
						layer: new_layer,
						auto_increment: 2,
						action_history: [],
						action_history_index: 0,
						selection: null,
					});

					this.documents.push(newDoc);
					this.active_id = newDoc.id;
					await this.restore_state(newDoc);
					this.render_tabs();
					resolve(newDoc);
				}
			};
			img.src = data;
		});
	}

	update_zoom_display() {
		const doc = this.get_active_document();
		if (!doc) return;
		doc.zoom = config.ZOOM || 1;
		if (this.tab_container) {
			const activeTabEl = this.tab_container.querySelector(`.document_tab[data-id="${doc.id}"] .tab_zoom`);
			if (activeTabEl) {
				activeTabEl.textContent = `@ ${Math.round((config.ZOOM || 1) * 100)}%`;
			}
		}
	}

	async activate_document(id) {
		if (id === this.active_id) return;
		const targetDoc = this.documents.find(d => d.id === id);
		if (!targetDoc) return;

		this.save_current_state();
		this.active_id = id;
		this.render_tabs();
		await this.restore_state(targetDoc);
		this.render_tabs();
	}

	async close_document(id) {
		if (id == null) id = this.active_id;
		const idx = this.documents.findIndex(d => d.id === id);
		if (idx === -1) return;

		if (this.documents.length === 1) {
			// Reset single remaining document to blank
			const doc = this.documents[0];
			doc.title = 'Untitled-1';
			doc.width = 800;
			doc.height = 600;
			doc.action_history = [];
			doc.action_history_index = 0;
			doc.is_dirty = false;
			doc.selection = null;

			var bgCanvas = document.createElement('canvas');
			bgCanvas.width = 800;
			bgCanvas.height = 600;
			var bgCtx = bgCanvas.getContext('2d');
			bgCtx.fillStyle = '#ffffff';
			bgCtx.fillRect(0, 0, 800, 600);

			const bgLayer = {
				id: 1,
				name: 'Background',
				locked: true,
				type: 'image',
				link: bgCanvas,
				data: bgCanvas.toDataURL(),
				filters: [],
				order: 1,
				width: 800,
				height: 600,
				width_original: 800,
				height_original: 600,
				x: 0,
				y: 0,
			};

			doc.layers = [bgLayer];
			doc.layer = bgLayer;
			doc.auto_increment = 2;

			await this.restore_state(doc);
			this.render_tabs();
			return;
		}

		const isClosingActive = (id === this.active_id);
		let targetId = null;
		if (isClosingActive) {
			const nextIdx = (idx > 0) ? idx - 1 : 1;
			targetId = this.documents[nextIdx].id;
		}

		this.documents.splice(idx, 1);

		if (isClosingActive && targetId) {
			this.active_id = targetId;
			const nextDoc = this.documents.find(d => d.id === targetId);
			await this.restore_state(nextDoc);
		}

		this.render_tabs();
	}

	cycle_tab(direction = 1) {
		if (this.documents.length <= 1) return;
		const currentIdx = this.documents.findIndex(d => d.id === this.active_id);
		let nextIdx = (currentIdx + direction) % this.documents.length;
		if (nextIdx < 0) nextIdx = this.documents.length - 1;
		this.activate_document(this.documents[nextIdx].id);
	}

	update_active_title(title) {
		const doc = this.get_active_document();
		if (doc && title) {
			doc.title = title;
			this.render_tabs();
		}
	}

	render_tabs() {
		if (!this.tab_container) {
			this.tab_container = document.getElementById('document_tabs');
			if (!this.tab_container) return;
		}

		let html = '';
		for (let i = 0; i < this.documents.length; i++) {
			const doc = this.documents[i];
			const isActive = doc.id === this.active_id;
			const zoomPercent = Math.round((isActive ? (config.ZOOM || 1) : (doc.zoom || 1)) * 100);
			const titleEscaped = this.Helper.escapeHtml(doc.title);
			html += `
				<div class="document_tab ${isActive ? 'active' : ''}" data-id="${doc.id}" title="${titleEscaped} (${doc.width} × ${doc.height})">
					<span class="tab_title">${titleEscaped}</span>
					<span class="tab_zoom">@ ${zoomPercent}%</span>
					<span class="tab_close" data-id="${doc.id}" title="Close (Ctrl+W)">✕</span>
				</div>
			`;
		}

		html += `
			<button class="new_tab_btn" id="new_tab_btn" title="New Document">+</button>
		`;

		this.tab_container.innerHTML = html;

		// Bind events
		this.tab_container.querySelectorAll('.document_tab').forEach((tabEl) => {
			const docId = tabEl.getAttribute('data-id');
			tabEl.addEventListener('click', (e) => {
				if (e.target.classList.contains('tab_close')) {
					e.stopPropagation();
					this.close_document(docId);
				} else {
					this.activate_document(docId);
				}
			});
			tabEl.addEventListener('auxclick', (e) => {
				if (e.button === 1) { // Middle click closes tab
					e.preventDefault();
					this.close_document(docId);
				}
			});
		});

		const newBtn = this.tab_container.querySelector('#new_tab_btn');
		if (newBtn) {
			newBtn.addEventListener('click', () => {
				if (app.GUI && app.GUI.modules && app.GUI.modules['file/new']) {
					app.GUI.modules['file/new'].new();
				}
			});
		}
	}
}

export default Base_documents_class;
