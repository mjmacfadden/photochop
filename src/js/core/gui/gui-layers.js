/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../base-layers.js';
import Helper_class from './../../libs/helpers.js';
import Mask_class from './../../modules/mask/mask.js';
import Layer_rename_class from './../../modules/layer/rename.js';
import Effects_browser_class from './../../modules/effects/browser.js';
import Layer_duplicate_class from './../../modules/layer/duplicate.js';
import Layer_raster_class from './../../modules/layer/raster.js';
import Tools_translate_class from './../../modules/tools/translate.js';

var template = `
	<div class="layers_list" id="layers"></div>
`;

/**
 * GUI class responsible for rendering layers on right sidebar
 */
class GUI_layers_class {

	constructor(ctx) {
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.Mask = new Mask_class();
		this.Layer_rename = new Layer_rename_class();
		this.Effects_browser = new Effects_browser_class();
		this.Layer_duplicate = new Layer_duplicate_class();
		this.Layer_raster = new Layer_raster_class();
		this.Tools_translate = new Tools_translate_class();
		this.mask_context_menu = null;
		this.mask_context_menu_open = false;
	}

	render_main_layers() {
		document.getElementById('layers_base').innerHTML = template;
		if (config.LANG != 'en') {
			this.Tools_translate.translate(config.LANG, document.getElementById('layers_base'));
		}
		this.render_layers();
		this.set_events();
		this.set_status_events();
	}

	set_events() {
		var _this = this;

		document.getElementById('layers_base').addEventListener('click', function (event) {
			var target = event.target;
			if (target.id == 'visibility') {
				return app.State.do_action(
					new app.Actions.Toggle_layer_visibility_action(target.dataset.id)
				);
			}
			else if (target.id == 'layer_name') {
				if (target.dataset.id == config.layer.id) {
					if (config.mask_active === true) {
						//exit mask editing - edit the layer instead
						_this.Mask.set_active(false);
					}
					return;
				}
				app.State.do_action(
					new app.Actions.Select_layer_action(target.dataset.id)
				);
			}
			else if (target.id == 'delete_filter') {
				app.State.do_action(
					new app.Actions.Delete_layer_filter_action(target.dataset.pid, target.dataset.id)
				);
			}
			else if (target.id == 'filter_name') {
				var effects = _this.Effects_browser.get_effects_list();
				var key = target.dataset.filter.toLowerCase();
				for (var i in effects) {
					if(effects[i].title.toLowerCase() == key){
						_this.Base_layers.select(target.dataset.pid);
						var function_name = _this.Effects_browser.get_function_from_path(key);
						effects[i].object[function_name](target.dataset.id);
					}
				}
			}
			else if (target.closest('.mask_thumb') != null) {
				var layer_id = parseInt(target.closest('.mask_thumb').dataset.id);
				var mask_layer = app.Layers.get_layer(layer_id);
				if (mask_layer != null && mask_layer.mask == null) {
					//no mask yet - placeholder clicked, add reveal-all mask and start editing
					app.State.do_action(
						new app.Actions.Add_layer_mask_action(layer_id, true, false)
					).then(() => {
						if (config.layer == null || config.layer.id != layer_id) {
							return app.State.do_action(
								new app.Actions.Select_layer_action(layer_id)
							).then(() => {
								_this.Mask.set_active(true);
							});
						}
						_this.Mask.set_active(true);
					});
				}
				else if (event.shiftKey === true) {
					//toggle mask enabled state
					_this.Mask.toggle_enabled(layer_id);
				}
				else if (config.layer && config.layer.id == layer_id) {
					//always enter mask editing (like Photoshop's mask thumbnail)
					_this.Mask.set_active(true);
				}
				else {
					//select layer, then enter mask editing
					app.State.do_action(
						new app.Actions.Select_layer_action(layer_id)
					).then(() => {
						_this.Mask.set_active(true);
					});
				}
			}
			else if (target.closest('.lock_icon') != null) {
				var lockEl = target.closest('.lock_icon');
				var layer_id = parseInt(lockEl.dataset.id);
				var layer = app.Layers.get_layer(layer_id);
				if (layer) {
					var new_locked = !layer.locked;
					var new_name = layer.name;
					if (!new_locked && layer.name === 'Background') {
						new_name = 'Layer 0';
					}
					return app.State.do_action(
						new app.Actions.Update_layer_action(layer_id, {
							locked: new_locked,
							name: new_name,
						})
					);
				}
			}
			else if (target.closest('.layer_thumb') != null) {
				var layer_id = parseInt(target.closest('.layer_thumb').dataset.id);
				if (config.layer && config.layer.id == layer_id && config.mask_active === true) {
					//main thumbnail clicked - exit mask editing, edit the layer instead
					_this.Mask.set_active(false);
				}
				else if (config.layer == null || config.layer.id != layer_id) {
					return app.State.do_action(
						new app.Actions.Select_layer_action(layer_id)
					);
				}
			}
		});

		document.getElementById('layers_base').addEventListener('dblclick', function (event) {
			var target = event.target;
			if (target.id == 'layer_name') {
				_this.Layer_rename.rename(target.dataset.id);
			}
		});

		//right click - mask context menu
		document.addEventListener('contextmenu', function (event) {
			if (_this.mask_context_menu_open !== true)
				return;
			var target = event.target;
			if (target.id == 'mask_context_menu_label' || target.closest('#mask_context_menu')) {
				return;
			}
			if (target.closest('#layers_base') && target.closest('.item')) {
				// the layers_base handler owns right-clicks on layer items
				return;
			}
			_this.hide_mask_context_menu();
		});

		document.addEventListener('click', function () {
			if (_this.mask_context_menu_open === true) {
				_this.hide_mask_context_menu();
			}
		});

		document.getElementById('layers_base').addEventListener('contextmenu', function (event) {
			var item = event.target.closest('.item');
			if (!item)
				return;
			event.preventDefault();
			var layer_id = parseInt(item.dataset.id);
			_this.show_mask_context_menu(event.clientX, event.clientY, layer_id);
		});

		// Drag-to-reorder layers
		var drag_layer_id = null;
		document.getElementById('layers_base').addEventListener('dragstart', function (event) {
			var item = event.target.closest('.item');
			if (!item) return;
			var layer = app.Layers.get_layer(parseInt(item.dataset.id));
			if (layer && layer.locked) {
				event.preventDefault();
				return;
			}
			drag_layer_id = parseInt(item.dataset.id);
			item.classList.add('dragging');
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', drag_layer_id);
		});

		document.getElementById('layers_base').addEventListener('dragover', function (event) {
			event.preventDefault();
			event.dataTransfer.dropEffect = 'move';
			var item = event.target.closest('.item');
			if (item) {
				item.classList.add('drag_over');
			}
		});

		document.getElementById('layers_base').addEventListener('dragleave', function (event) {
			var item = event.target.closest('.item');
			if (item) {
				item.classList.remove('drag_over');
			}
		});

		document.getElementById('layers_base').addEventListener('drop', function (event) {
			event.preventDefault();
			var item = event.target.closest('.item');
			if (!item || drag_layer_id === null) return;

			var target_id = parseInt(item.dataset.id);
			if (drag_layer_id === target_id) return;

			var drag_layer = app.Layers.get_layer(drag_layer_id);
			var target_layer = app.Layers.get_layer(target_id);
			if (!drag_layer || !target_layer) return;
			if (drag_layer.locked) return;

			// Swap order values
			var temp_order = drag_layer.order;
			drag_layer.order = target_layer.order;
			target_layer.order = temp_order;

			drag_layer_id = null;
			app.Layers.render();
			app.GUI.GUI_layers.render_layers();
		});

		document.getElementById('layers_base').addEventListener('dragend', function (event) {
			drag_layer_id = null;
			var items = document.querySelectorAll('#layers_base .item');
			for (var i = 0; i < items.length; i++) {
				items[i].classList.remove('dragging', 'drag_over');
			}
		});

	}

	/**
	 * shows mask context menu near the given coordinates
	 */
	show_mask_context_menu(x, y, layer_id) {
		if (this.mask_context_menu) {
			this.mask_context_menu.remove();
		}
		var layer = app.Layers.get_layer(layer_id);
		if (!layer)
			return;

		var menu = document.createElement('div');
		menu.id = 'mask_context_menu';
		menu.className = 'mask_context_menu';
		menu.style.left = x + 'px';
		menu.style.top = y + 'px';

		var _this = this;
		var button = function (label, callback) {
			var b = document.createElement('button');
			b.className = 'mask_context_menu_item';
			b.innerHTML = label;
			b.addEventListener('click', function () {
				_this.hide_mask_context_menu();
				callback();
			});
			menu.appendChild(b);
		};

		if (layer.mask == null) {
			button('Reveal All', () => { _this.Mask.add_mask(layer_id, true, false); });
			button('Hide All', () => { _this.Mask.add_mask(layer_id, false, false); });
			button('Reveal Selection', () => { _this.Mask.add_mask(layer_id, true, true); });
			button('Hide Selection', () => { _this.Mask.add_mask(layer_id, false, true); });
		}
		else {
			button(layer.mask.enabled === false ? 'Enable Mask' : 'Disable Mask',
				() => { _this.Mask.toggle_enabled(layer_id); });
			button('Reveal All', () => { _this.Mask.fill_mask(layer_id, true); });
			button('Hide All', () => { _this.Mask.fill_mask(layer_id, false); });
			button('Reveal Selection', () => { _this.Mask.fill_mask_from_selection(layer_id, true); });
			button('Hide Selection', () => { _this.Mask.fill_mask_from_selection(layer_id, false); });
			button('Apply Mask', () => { _this.Mask.apply_mask(layer_id); });
			button('Delete Mask', () => { _this.Mask.delete_mask(layer_id); });
		}

		document.body.appendChild(menu);
		this.mask_context_menu = menu;
		this.mask_context_menu_open = true;
	}

	/**
	 * hides the mask context menu
	 */
	hide_mask_context_menu() {
		this.mask_context_menu_open = false;
		if (this.mask_context_menu) {
			this.mask_context_menu.remove();
			this.mask_context_menu = null;
		}
	}

	set_status_events() {
		var _this = this;

		document.getElementById('status_new_layer').addEventListener('click', function () {
			app.State.do_action(
				new app.Actions.Insert_layer_action()
			);
		});

		document.getElementById('status_delete_layer').addEventListener('click', function () {
			if (config.layer && config.layer.locked !== true) {
				app.State.do_action(
					new app.Actions.Delete_layer_action(config.layer.id)
				);
			}
		});
	}

	/**
	 * returns thumbnail HTML for layer type
	 */
	get_layer_thumb(layer) {
		if (layer.type === 'text') {
			return '<svg class="thumb_icon thumb_text" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h12v3h-1V3H9v10h2v1H5v-1h2V3H3v2H2V2z"/></svg>';
		}
		if (layer.type === 'image') {
			return '<svg class="thumb_icon thumb_image" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1.5" y="2.5" width="13" height="11" rx="1"/><circle cx="5.5" cy="6" r="1.5"/><path d="M2 12l3.5-4 2.5 2.5 2-1.5L14 12"/></svg>';
		}
		if (layer.type === 'brush' || layer.type === 'pencil') {
			return '<svg class="thumb_icon thumb_brush" viewBox="0 0 16 16" fill="currentColor"><path d="M12.5 1.5l2 2-9 9-3 1 1-3 9-9zM3.5 12.5l-2 2H1v-2.5l2-2"/></svg>';
		}
		if (layer.type === 'gradient') {
			return '<svg class="thumb_icon thumb_gradient" viewBox="0 0 16 16"><defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="currentColor"/><stop offset="100%" stop-color="currentColor" stop-opacity="0.2"/></linearGradient></defs><rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="url(#tg)" stroke="currentColor" stroke-width="1.2"/></svg>';
		}
		// Default: shape/other layers
		return '<svg class="thumb_icon thumb_shape" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2.5" y="2.5" width="11" height="11" rx="1"/></svg>';
	}

	/**
	 * renders layers list
	 */
	render_layers() {
		var target_id = 'layers';
		var layers = (config.layers && Array.isArray(config.layers))
			? config.layers.concat().sort((a, b) => b.order - a.order)
			: [];

		var targetEl = document.getElementById(target_id);
		if (targetEl) {
			targetEl.innerHTML = '';
		}
		var html = '';
		
		if (config.layer) {
			for (var i in layers) {
				var value = layers[i];
				var class_extra = '';
				if(value.composition === 'source-atop'){
					class_extra += ' shorter';
				}
				if (value.id == config.layer.id){
					class_extra += ' active';
				}

				html += '<div class="item ' + class_extra + (value.locked ? ' locked' : '') + '" data-id="' + value.id + '" draggable="' + (value.locked ? 'false' : 'true') + '">';
			if (value.visible == true)
				html += '	<button class="visibility visible trn" id="visibility" data-id="' + value.id + '" title="Hide"></button>';
			else
				html += '	<button class="visibility trn" id="visibility" data-id="' + value.id + '" title="Show"></button>';
			
			html += '	<span class="layer_thumb" data-id="' + value.id + '">' + this.get_layer_thumb(value) + '</span>';

				if (value.mask != null) {
					var mask_class = 'mask_thumb';
					if (value.id == config.layer.id && config.mask_active === true) {
						mask_class += ' active_mask';
					}
					if (value.mask.enabled === false) {
						mask_class += ' disabled_mask';
					}
					var mask_thumb = this.Mask.get_mask_thumb(value);
					html += '	<span class="' + mask_class + '" id="mask_thumb" data-id="' + value.id + '" title="Layer mask" style="background-image: url(\'' + mask_thumb + '\')"></span>';
				}
				else {
					html += '	<span class="mask_thumb empty" id="mask_thumb" data-id="' + value.id + '" title="Add layer mask"></span>';
				}
				
				if(value.composition === 'source-atop'){
					html += '	<button class="arrow_down" data-id="' + value.id + '" ></button>';
				}

				var layer_title = this.Helper.escapeHtml(value.name);
				
			html += '	<button class="layer_name" id="layer_name" data-id="' + value.id + '">' + layer_title + '</button>';

			if (value.locked) {
				html += '	<span class="lock_icon locked" data-id="' + value.id + '" title="Locked (click to unlock)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>';
			} else {
				html += '	<span class="lock_icon unlocked" data-id="' + value.id + '" title="Unlocked (click to lock)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg></span>';
			}

			html += '	<div class="clear"></div>';
				html += '</div>';

				//show filters
				if (layers[i].filters && layers[i].filters.length > 0) {
					html += '<div class="filters">';
					for (var j in layers[i].filters) {
						var filter = layers[i].filters[j];
						var title = this.Helper.ucfirst(filter.name);
						title = title.replace(/-/g, ' ');

						html += '<div class="filter">';
						html += '	<span class="delete" id="delete_filter" data-pid="' + layers[i].id + '" data-id="' + filter.id + '" title="delete"></span>';
						html += '	<span class="layer_name" id="filter_name" data-pid="' + layers[i].id + '" data-id="' + filter.id + '" data-filter="' + filter.name + '">' + title + '</span>';
						html += '	<div class="clear"></div>';
						html += '</div>';
					}
					html += '</div>';
				}
			}
		}

		//register
		document.getElementById(target_id).innerHTML = html;
		if (config.LANG != 'en') {
			this.Tools_translate.translate(config.LANG, document.getElementById(target_id));
		}
	}
}

export default GUI_layers_class;
