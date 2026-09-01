/*
 * PhotoChop - Tabbed Document Workspace Manager
 */

import app from '../app.js';
import config from '../config.js';
import Base_layers_class from './base-layers.js';
import Base_gui_class from './base-gui.js';
import zoomView from '../libs/zoomView.js';
import Helper_class from '../libs/helpers.js';
import Mask_class from '../modules/mask/mask.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import semver_compare from './../../../node_modules/semver-compare/';
import { get_renderer } from './renderer/index.js';

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
			transparency: true,
			is_dirty: options.is_dirty || false,
			selection: options.selection || null,
			selection_mask: options.selection_mask || null,
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
		const baseSel = (app.Layers && app.Layers.Base_selection) ? app.Layers.Base_selection : (selModule ? selModule.Base_selection : null);
		if (baseSel) {
			doc.selection_mask = baseSel.has_selection ? baseSel.clone_mask_canvas() : null;
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
		if (this.Base_gui && this.Base_gui.render_canvas_background) {
			this.Base_gui.render_canvas_background('canvas_minipaint');
			this.Base_gui.render_canvas_background('canvas_preview', 8);
		}

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
			var renderer = (typeof get_renderer === 'function') ? get_renderer() : null;
			if (renderer && renderer.clear_texture_cache) {
				renderer.clear_texture_cache();
			}
		}

		// 6. Restore Selection state (isolated per document)
		const selModule = (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['selection'])
			? app.GUI.GUI_tools.tools_modules['selection'].object
			: null;
		const baseSel = (app.Layers && app.Layers.Base_selection) ? app.Layers.Base_selection : (selModule ? selModule.Base_selection : null);
		if (baseSel) {
			if (doc.selection_mask) {
				baseSel.set_mask_canvas(doc.selection_mask);
			} else {
				baseSel.clear_mask();
			}
		}
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

				config.TRANSPARENCY = true;
				this.Helper.setCookie('transparency', 1);

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
					doc.transparency = true;

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
						transparency: true,
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

	async create_document_from_json(jsonOrString, filename) {
		let json = jsonOrString;
		if (typeof json === 'string') {
			let raw = json.trim();
			if (raw.startsWith('data:')) {
				try {
					raw = atob(raw.split(',')[1]);
				} catch (e) {}
			}
			try {
				json = JSON.parse(raw);
			} catch (err) {
				console.error('Invalid JSON content:', err);
				if (typeof alertify !== 'undefined') {
					alertify.error('Failed to parse JSON file.');
				}
				return null;
			}
		}

		if (!json || !json.info) {
			if (typeof alertify !== 'undefined') {
				alertify.error('Invalid document JSON structure.');
			}
			return null;
		}
		if (json.info.version == undefined) {
			json.info.version = "3.0.0";
		}

		const isLegacyMiniPaint = json.info.about && json.info.about.includes('miniPaint') && !json.info.about.includes('PhotoChop') && !json.info.about.includes('Vantage');

		// Migrations - ONLY run on actual legacy miniPaint files, never on PhotoChop / VantagePoint 1.x files
		if (isLegacyMiniPaint && json.image_data && !json.data && semver_compare(json.info.version, '4.0.0') < 0) {
			for (let i in json.layers) {
				json.layers[i].id = (parseInt(i) + 1);
				json.layers[i].opacity = json.layers[i].opacity * 100 || 100;
				json.layers[i].type = "image";
				json.layers[i].width = json.info.width;
				json.layers[i].height = json.info.height;
				json.layers[i].visible = (json.layers[i].visible == true);
				delete json.layers[i].title;
			}
			json.data = [];
			for (let i in json.image_data) {
				let new_id = null;
				for (let j in json.layers) {
					if (json.layers[j].name == json.image_data[i].name) {
						new_id = json.layers[j].id;
					}
				}
				if (new_id == null) continue;
				json.data.push({
					id: new_id,
					data: json.image_data[i].data,
				});
			}
		}

		if (isLegacyMiniPaint && semver_compare(json.info.version, '4.5.0') < 0) {
			for (let i in json.layers) {
				let old_type = json.layers[i].type;
				if (old_type == 'line' && json.layers[i].params && json.layers[i].params.type && json.layers[i].params.type.value == "Arrow") {
					json.layers[i].type = 'arrow';
					delete json.layers[i].params.type;
					json.layers[i].render_function = ["arrow", "render"];
				}
				if (old_type == 'rectangle' || old_type == 'circle') {
					if (json.layers[i].params) {
						json.layers[i].params.border_size = json.layers[i].params.size;
						delete json.layers[i].params.size;
						if (json.layers[i].params.fill == true) {
							json.layers[i].params.border = false;
						} else {
							json.layers[i].params.border = true;
						}
						json.layers[i].params.border_color = json.layers[i].color;
						json.layers[i].params.fill_color = json.layers[i].color;
					}
					json.layers[i].color = null;
				}
				if (old_type == 'circle') {
					json.layers[i].type = 'ellipse';
					json.layers[i].render_function = ["ellipse", "render"];
				}
			}
		}

		if (isLegacyMiniPaint && semver_compare(json.info.version, '4.8.0') < 0) {
			for (let i in json.layers) {
				if (json.layers[i].type == 'borders') {
					json.layers[i].type = 'rectangle';
					json.layers[i].name += ' (legacy)';
					json.layers[i].params = {
						radius: 0,
						fill: false,
						square: false,
						border_size: (json.layers[i].params ? json.layers[i].params.size : 1),
						border: true,
						border_color: json.layers[i].color,
						fill_color: "#000000",
					};
					json.layers[i].render_function = ["rectangle", "render"];
				}
			}
		}

		if (isLegacyMiniPaint && semver_compare(json.info.version, '4.11.0') < 0) {
			for (let i in json.layers) {
				if (json.layers[i].type == 'star' && (!json.layers[i].params || typeof json.layers[i].params.corners == "undefined")) {
					json.layers[i].params = json.layers[i].params || {};
					json.layers[i].params.corners = 5;
					json.layers[i].params.inner_radius = 40;
					json.layers[i].render_function = ["star", "render"];
				} else if (json.layers[i].type == 'star24') {
					json.layers[i].type = 'star';
					json.layers[i].params = json.layers[i].params || {};
					json.layers[i].params.corners = 24;
					json.layers[i].params.inner_radius = 80;
					json.layers[i].render_function = ["star", "render"];
				}
			}
		}

		const w = parseInt(json.info.width) || config.WIDTH || 800;
		const h = parseInt(json.info.height) || config.HEIGHT || 600;
		const docTitle = filename ? filename.replace(/\.json$/i, '') : (json.info.name || ('Untitled-' + this.auto_title_count++));
		const docTransp = (json.info.transparency !== false);

		let max_id_order = 0;
		const layers = [];
		for (let l of json.layers) {
			if (l.id > max_id_order) max_id_order = l.id;
			if (l.order != null && l.order > max_id_order) max_id_order = l.order;

			// Clean DOM links so no invalid objects remain
			l.link = null;
			l.link_canvas = null;

			// Ensure layer has essential default properties
			if (l.visible === undefined || l.visible === null) l.visible = true;
			if (l.opacity === undefined || l.opacity === null) l.opacity = 100;
			if (l.composition === undefined || l.composition === null) l.composition = 'source-over';
			if (l.rotate === undefined || l.rotate === null) l.rotate = 0;
			if (l.locked === undefined || l.locked === null) l.locked = false;
			if (l.x === undefined || l.x === null) l.x = 0;
			if (l.y === undefined || l.y === null) l.y = 0;
			if (!l.filters) l.filters = [];
			if (!l.params) l.params = {};

			// Match image data
			let dataUrl = null;
			if (json.data && Array.isArray(json.data)) {
				const d = json.data.find(item => item.id == l.id);
				if (d && d.data) dataUrl = d.data;
			}
			if (!dataUrl && typeof l.data === 'string' && l.data.startsWith('data:image')) {
				dataUrl = l.data;
			}

			if (dataUrl) {
				const img = new Image();
				await new Promise((res) => {
					img.onload = () => {
						if (img.decode) {
							img.decode().then(res).catch(res);
						} else {
							res();
						}
					};
					img.onerror = () => res();
					img.src = dataUrl;
					if (img.complete) {
						if (img.decode) {
							img.decode().then(res).catch(res);
						} else {
							res();
						}
					}
				});
				l.link = img;
				l.data = dataUrl;
				if (l.width == null || l.width == 0) l.width = img.width;
				if (l.height == null || l.height == 0) l.height = img.height;
				if (l.width_original == null) l.width_original = l.width;
				if (l.height_original == null) l.height_original = l.height;

				if (l.type === 'brush' || l.type === 'pencil') {
					const c = document.createElement('canvas');
					c.width = l.width_original || l.width;
					c.height = l.height_original || l.height;
					c.getContext('2d').drawImage(img, 0, 0);
					l.link_canvas = c;
				}
			}

			// Restore mask if any
			if (l.mask != null && typeof l.mask === 'object') {
				l.mask = await new Mask_class().restore(l, l.mask);
			}

			layers.push(l);
		}

		let activeLayer = layers.find(l => l.id == json.info.layer_active) || layers[layers.length - 1] || layers[0] || null;

		const isPristine = this.is_active_document_empty();
		if (isPristine) {
			const doc = this.get_active_document();
			doc.title = docTitle;
			doc.width = w;
			doc.height = h;
			doc.layers = layers;
			doc.layer = activeLayer;
			doc.auto_increment = max_id_order + 1;
			doc.guides = json.info.guides || [];
			doc.user_fonts = json.user_fonts || {};
			doc.transparency = docTransp;
			doc.action_history = [];
			doc.action_history_index = 0;
			doc.is_dirty = false;
			doc.selection = null;

			await this.restore_state(doc);
			this.render_tabs();
			return doc;
		} else {
			this.save_current_state();

			const newDoc = this._create_doc_model({
				title: docTitle,
				width: w,
				height: h,
				layers: layers,
				layer: activeLayer,
				auto_increment: max_id_order + 1,
				action_history: [],
				action_history_index: 0,
				selection: null,
				transparency: docTransp,
				guides: json.info.guides || [],
				user_fonts: json.user_fonts || {},
			});

			this.documents.push(newDoc);
			this.active_id = newDoc.id;
			await this.restore_state(newDoc);
			this.render_tabs();
			return newDoc;
		}
	}

	async create_document_from_psd_data(docData) {
		const w = parseInt(docData.width) || config.WIDTH || 800;
		const h = parseInt(docData.height) || config.HEIGHT || 600;
		const docTitle = docData.title || ('Untitled-' + this.auto_title_count++);
		const layers = docData.layers || [];
		let max_id_order = 0;
		for (let l of layers) {
			if (l.id > max_id_order) max_id_order = l.id;
			if (l.order != null && l.order > max_id_order) max_id_order = l.order;
		}

		let activeLayer = layers[layers.length - 1] || layers[0] || null;

		const isPristine = this.is_active_document_empty();
		if (isPristine) {
			const doc = this.get_active_document();
			doc.title = docTitle;
			doc.width = w;
			doc.height = h;
			doc.layers = layers;
			doc.layer = activeLayer;
			doc.auto_increment = max_id_order + 1;
			doc.guides = [];
			doc.user_fonts = {};
			doc.transparency = true;
			doc.action_history = [];
			doc.action_history_index = 0;
			doc.is_dirty = false;
			doc.selection = null;

			await this.restore_state(doc);
			this.render_tabs();
			return doc;
		} else {
			this.save_current_state();

			const newDoc = this._create_doc_model({
				title: docTitle,
				width: w,
				height: h,
				layers: layers,
				layer: activeLayer,
				auto_increment: max_id_order + 1,
				action_history: [],
				action_history_index: 0,
				selection: null,
				transparency: true,
				guides: [],
				user_fonts: {},
			});

			this.documents.push(newDoc);
			this.active_id = newDoc.id;
			await this.restore_state(newDoc);
			this.render_tabs();
			return newDoc;
		}
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
