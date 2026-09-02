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
import Layer_group_class from './../../modules/layer/group.js';
import Layer_delete_class from './../../modules/layer/delete.js';
import Tools_translate_class from './../../modules/tools/translate.js';
import { is_group, get_tree_rows, get_parent_id, would_cycle } from './../../libs/layer-tree.js';

var template = `
	<div class="layers_header" id="layers_header">
		<div class="layers_header_row">
			<select class="layer_blend_select" id="layer_blend_select" title="Layer Blend Mode">
				<option value="pass-through">Pass Through</option>
				<option value="source-over">Normal</option>
				<optgroup label="Darken">
					<option value="darken">Darken</option>
					<option value="multiply">Multiply</option>
					<option value="color-burn">Color Burn</option>
				</optgroup>
				<optgroup label="Lighten">
					<option value="lighten">Lighten</option>
					<option value="screen">Screen</option>
					<option value="color-dodge">Color Dodge</option>
					<option value="lighter">Lighter</option>
				</optgroup>
				<optgroup label="Contrast">
					<option value="overlay">Overlay</option>
					<option value="soft-light">Soft Light</option>
					<option value="hard-light">Hard Light</option>
				</optgroup>
				<optgroup label="Inversion">
					<option value="difference">Difference</option>
					<option value="exclusion">Exclusion</option>
				</optgroup>
				<optgroup label="Component">
					<option value="hue">Hue</option>
					<option value="saturation">Saturation</option>
					<option value="color">Color</option>
					<option value="luminosity">Luminosity</option>
				</optgroup>
				<optgroup label="Masking / Other">
					<option value="source-atop">Clipping Mask (source-atop)</option>
					<option value="destination-over">Destination Over</option>
					<option value="destination-out">Destination Out</option>
					<option value="xor">XOR</option>
				</optgroup>
			</select>
			<div class="layer_opacity_group" title="Layer Opacity">
				<span class="layer_opacity_label">Opacity:</span>
				<div class="layer_opacity_input_wrapper">
					<input type="number" class="layer_opacity_number" id="layer_opacity_number" min="0" max="100" value="100" />
					<span class="layer_opacity_symbol">%</span>
					<button type="button" class="layer_opacity_popup_btn" id="layer_opacity_popup_btn" title="Adjust Opacity">▾</button>
				</div>
				<div class="layer_opacity_slider_popup hidden" id="layer_opacity_slider_popup">
					<input type="range" class="layer_opacity_range" id="layer_opacity_range" min="0" max="100" value="100" />
				</div>
			</div>
		</div>
	</div>
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
		this.Layer_group = new Layer_group_class();
		this.Layer_delete = new Layer_delete_class();
		this.Tools_translate = new Tools_translate_class();
		this.mask_context_menu = null;
		this.mask_context_menu_open = false;
		this.fx_menu = null;
		this.fx_menu_open = false;
		this.adj_menu = null;
		this.adj_menu_open = false;
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
			if (target.closest && target.closest('.group_chevron')) {
				var chev = target.closest('.group_chevron');
				event.stopPropagation();
				_this.Layer_group.toggle_opened(chev.dataset.id);
				return;
			}
			if (target.id == 'visibility') {
				return app.State.do_action(
					new app.Actions.Toggle_layer_visibility_action(target.dataset.id)
				);
			}
			else if (target.id == 'layer_name') {
				_this.select_layer_from_panel(target.dataset.id, event);
			}
			else if (target.id == 'filter_visibility') {
				var layer_id = parseInt(target.dataset.pid);
				var filter_id = target.dataset.id;
				var layer = app.Layers.get_layer(layer_id);
				if (layer && layer.filters) {
					var newFilters = layer.filters.map(f => {
						if (f.id == filter_id) {
							return {
								...f,
								disabled: !f.disabled
							};
						}
						return f;
					});
					app.State.do_action(
						new app.Actions.Update_layer_action(layer_id, {
							filters: newFilters
						})
					);
				}
			}
			else if (target.id == 'delete_filter') {
				app.State.do_action(
					new app.Actions.Delete_layer_filter_action(target.dataset.pid, target.dataset.id)
				);
			}
			else if (target.id == 'filter_name') {
				var filterName = target.dataset.filter;
				_this.Base_layers.select(target.dataset.pid);
				if (app.GUI && app.GUI.modules && app.GUI.modules['layer/styles']) {
					app.GUI.modules['layer/styles'].open(filterName, target.dataset.id);
				} else {
					var effects = _this.Effects_browser.get_effects_list();
					var key = filterName.toLowerCase();
					for (var i in effects) {
						if(effects[i].title.toLowerCase() == key){
							var function_name = _this.Effects_browser.get_function_from_path(key);
							effects[i].object[function_name](target.dataset.id);
						}
					}
				}
			}
			else if (target.closest('.mask_link_icon') != null) {
				var layer_id = parseInt(target.closest('.mask_link_icon').dataset.id);
				_this.Mask.toggle_linked(layer_id);
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
			else if (target.closest('.clipping_arrow_btn') != null || target.closest('.arrow_down') != null) {
				var arrowBtn = target.closest('.clipping_arrow_btn') || target.closest('.arrow_down');
				var layer_id = parseInt(arrowBtn.dataset.id);
				var arrow_layer = app.Layers.get_layer(layer_id);
				if (arrow_layer) {
					var newComp = (arrow_layer.composition === 'source-atop') ? 'source-over' : 'source-atop';
					return app.State.do_action(
						new app.Actions.Update_layer_action(layer_id, {
							composition: newComp
						})
					);
				}
			}
			else if (target.closest('.layer_thumb') != null) {
				var layer_id = parseInt(target.closest('.layer_thumb').dataset.id);
				var thumb_layer = app.Layers.get_layer(layer_id);
				var multi = event.shiftKey || event.ctrlKey || event.metaKey;
				if (!multi && thumb_layer && thumb_layer.type === 'adjustment') {
					if (app.GUI && app.GUI.modules && app.GUI.modules['layer/adjustment']) {
						app.GUI.modules['layer/adjustment'].edit(layer_id);
						return;
					}
				}
				if (!multi && config.layer && config.layer.id == layer_id && config.mask_active === true) {
					//main thumbnail clicked - exit mask editing, edit the layer instead
					_this.Mask.set_active(false);
					return;
				}
				_this.select_layer_from_panel(layer_id, event);
			}
			else if (target.closest('.item') != null && target.closest('.filters') == null) {
				// click on empty area of a layer row
				var item = target.closest('.item');
				if (item && item.dataset.id) {
					_this.select_layer_from_panel(item.dataset.id, event);
				}
			}
		});

		// Header blend mode select
		var blendSelect = document.getElementById('layer_blend_select');
		if (blendSelect) {
			blendSelect.addEventListener('change', function () {
				if (!config.layer || config.layer.id == null) return;
				var val = this.value;
				var prev = config.layer.composition || 'source-over';
				if (val !== prev) {
					app.State.do_action(
						new app.Actions.Update_layer_action(config.layer.id, {
							composition: val
						})
					);
				}
			});
		}

		// Header opacity input and slider
		var opNumber = document.getElementById('layer_opacity_number');
		var opRange = document.getElementById('layer_opacity_range');
		var opPopupBtn = document.getElementById('layer_opacity_popup_btn');
		var opPopup = document.getElementById('layer_opacity_slider_popup');

		if (opPopupBtn && opPopup) {
			opPopupBtn.addEventListener('click', function (e) {
				e.stopPropagation();
				opPopup.classList.toggle('hidden');
			});
		}

		var focus_opacity = null;
		if (opNumber) {
			opNumber.addEventListener('focus', function () {
				focus_opacity = (config.layer && config.layer.opacity != null) ? Math.round(config.layer.opacity) : 100;
			});
			opNumber.addEventListener('input', function () {
				if (!config.layer || config.layer.id == null) return;
				var val = parseInt(this.value);
				if (isNaN(val)) return;
				val = Math.max(0, Math.min(100, val));
				config.layer.opacity = val;
				if (opRange) opRange.value = val;
				app.Layers.invalidate({ document: true });
				app.Layers.render(true);
			});
			opNumber.addEventListener('blur', function () {
				if (!config.layer || config.layer.id == null) return;
				var val = parseInt(this.value);
				if (isNaN(val)) val = 100;
				val = Math.max(0, Math.min(100, val));
				this.value = val;
				if (opRange) opRange.value = val;
				if (focus_opacity !== val) {
					config.layer.opacity = focus_opacity;
					app.State.do_action(
						new app.Actions.Update_layer_action(config.layer.id, {
							opacity: val
						})
					);
				}
			});
		}

		var range_start_opacity = null;
		if (opRange) {
			opRange.addEventListener('mousedown', function () {
				range_start_opacity = (config.layer && config.layer.opacity != null) ? Math.round(config.layer.opacity) : 100;
			});
			opRange.addEventListener('input', function () {
				if (!config.layer || config.layer.id == null) return;
				var val = parseInt(this.value);
				config.layer.opacity = val;
				if (opNumber) opNumber.value = val;
				app.Layers.invalidate({ document: true });
				app.Layers.render(true);
			});
			opRange.addEventListener('change', function () {
				if (!config.layer || config.layer.id == null) return;
				var val = parseInt(this.value);
				if (range_start_opacity !== val) {
					config.layer.opacity = range_start_opacity;
					app.State.do_action(
						new app.Actions.Update_layer_action(config.layer.id, {
							opacity: val
						})
					);
				}
			});
		}

		document.getElementById('layers_base').addEventListener('dblclick', function (event) {
			var target = event.target;
			if (target.id == 'layer_name') {
				var layer_id = parseInt(target.dataset.id);
				var dbl_layer = app.Layers.get_layer(layer_id);
				if (dbl_layer && dbl_layer.type === 'adjustment') {
					if (app.GUI && app.GUI.modules && app.GUI.modules['layer/adjustment']) {
						app.GUI.modules['layer/adjustment'].edit(layer_id);
						return;
					}
				}
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

		document.addEventListener('click', function (event) {
			if (_this.mask_context_menu_open === true) {
				_this.hide_mask_context_menu();
			}
			if (_this.fx_menu_open === true) {
				var target = event.target;
				if (!target.closest('#layer_fx_popup_menu') && !target.closest('#status_layer_fx')) {
					_this.hide_fx_menu();
				}
			}
			if (_this.adj_menu_open === true) {
				var target = event.target;
				if (!target.closest('#layer_adj_popup_menu') && !target.closest('#status_adjustment_layer')) {
					_this.hide_adj_menu();
				}
			}
			if (opPopup && !opPopup.classList.contains('hidden')) {
				var target = event.target;
				if (!target.closest('#layer_opacity_slider_popup') && !target.closest('#layer_opacity_popup_btn')) {
					opPopup.classList.add('hidden');
				}
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

		// Drag-to-reorder / reparent layers (tree-aware)
		var drag_layer_id = null;
		var drag_drop_mode = 'above'; // above | below | into
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
			var items = document.querySelectorAll('#layers_base .item');
			for (var i = 0; i < items.length; i++) {
				items[i].classList.remove('drag_over', 'drag_over_above', 'drag_over_below', 'drag_over_into');
			}
			if (!item) return;
			var rect = item.getBoundingClientRect();
			var y = event.clientY - rect.top;
			var target_layer = app.Layers.get_layer(parseInt(item.dataset.id));
			var into = false;
			if (target_layer && is_group(target_layer)) {
				// Middle band or Ctrl/Cmd = drop into group
				if (event.ctrlKey || event.metaKey || (y > rect.height * 0.28 && y < rect.height * 0.72)) {
					into = true;
				}
			}
			if (into) {
				drag_drop_mode = 'into';
				item.classList.add('drag_over', 'drag_over_into');
			} else if (y < rect.height / 2) {
				drag_drop_mode = 'above';
				item.classList.add('drag_over', 'drag_over_above');
			} else {
				drag_drop_mode = 'below';
				item.classList.add('drag_over', 'drag_over_below');
			}
		});

		document.getElementById('layers_base').addEventListener('dragleave', function (event) {
			var item = event.target.closest('.item');
			if (item) {
				item.classList.remove('drag_over', 'drag_over_above', 'drag_over_below', 'drag_over_into');
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

			var mode = drag_drop_mode || 'above';
			var new_parent = get_parent_id(target_layer);
			var place_above = true;
			var ref_id = target_id;

			if (mode === 'into' && is_group(target_layer)) {
				if (would_cycle(drag_layer_id, target_id)) {
					drag_layer_id = null;
					return;
				}
				new_parent = target_id;
				// Place as topmost child (above current top child visually = higher order)
				place_above = true;
				ref_id = target_id; // order relative to group header
				_this.Layer_group.reparent(drag_layer_id, new_parent, ref_id, false);
			} else {
				place_above = (mode === 'above');
				if (would_cycle(drag_layer_id, new_parent)) {
					drag_layer_id = null;
					return;
				}
				_this.Layer_group.reparent(drag_layer_id, new_parent, ref_id, place_above);
			}

			drag_layer_id = null;
		});

		document.getElementById('layers_base').addEventListener('dragend', function (event) {
			drag_layer_id = null;
			var items = document.querySelectorAll('#layers_base .item');
			for (var i = 0; i < items.length; i++) {
				items[i].classList.remove('dragging', 'drag_over', 'drag_over_above', 'drag_over_below', 'drag_over_into');
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
		var button = function (label, callback, extraClass = '') {
			var b = document.createElement('button');
			b.className = 'mask_context_menu_item' + (extraClass ? ' ' + extraClass : '');
			b.innerHTML = label;
			b.addEventListener('click', function () {
				_this.hide_mask_context_menu();
				callback();
			});
			menu.appendChild(b);
		};

		var separator = function () {
			var hr = document.createElement('hr');
			hr.className = 'layer_context_menu_divider';
			menu.appendChild(hr);
		};

		// 1. Clipping Mask
		if (layer.composition === 'source-atop') {
			button('Release Clipping Mask', () => {
				app.State.do_action(
					new app.Actions.Update_layer_action(layer_id, {
						composition: 'source-over'
					})
				);
			});
		} else {
			button('Create Clipping Mask', () => {
				app.State.do_action(
					new app.Actions.Update_layer_action(layer_id, {
						composition: 'source-atop'
					})
				);
			});
		}

		separator();

		// 2. Layer / group operations
		if (is_group(layer)) {
			button('Ungroup', () => {
				app.State.do_action(new app.Actions.Select_layer_action(layer_id)).then(() => {
					_this.Layer_group.ungroup();
				});
			});
		} else {
			button('Group Layers', () => {
				app.State.do_action(new app.Actions.Select_layer_action(layer_id)).then(() => {
					_this.Layer_group.group_layers();
				});
			});
		}
		button('New Group', () => {
			_this.Layer_group.new_group();
		});
		button(is_group(layer) ? 'Duplicate Group' : 'Duplicate Layer', () => {
			app.State.do_action(new app.Actions.Select_layer_action(layer_id)).then(() => {
				_this.Layer_duplicate.duplicate();
			});
		});
		if (!layer.locked) {
			button(is_group(layer) ? 'Delete Group' : 'Delete Layer', () => {
				const selected = (config.selected_layer_ids || []).map((id) => parseInt(id, 10));
				if (selected.length > 1 && selected.includes(parseInt(layer_id, 10))) {
					_this.Layer_delete.delete(selected);
				} else {
					_this.Layer_delete.delete([layer_id]);
				}
			});
		}
		button(is_group(layer) ? 'Rename Group...' : 'Rename Layer...', () => {
			_this.Layer_rename.rename(layer_id);
		});

		if (layer.type === 'adjustment') {
			button('Edit Adjustment...', () => {
				if (app.GUI && app.GUI.modules && app.GUI.modules['layer/adjustment']) {
					app.GUI.modules['layer/adjustment'].edit(layer_id);
				}
			});
		} else {
			button('Layer Styles (Fx)...', () => {
				if (app.GUI && app.GUI.modules && app.GUI.modules['layer/styles']) {
					app.GUI.modules['layer/styles'].open('shadow');
				}
			});
		}

		separator();

		// 3. Mask operations
		if (layer.mask == null) {
			button('Add Layer Mask (Reveal All)', () => { _this.Mask.add_mask(layer_id, true, false); });
			button('Add Layer Mask (Hide All)', () => { _this.Mask.add_mask(layer_id, false, false); });
			button('Mask from Selection', () => { _this.Mask.add_mask(layer_id, true, true); });
		}
		else {
			button(layer.mask.enabled === false ? 'Enable Layer Mask' : 'Disable Layer Mask',
				() => { _this.Mask.toggle_enabled(layer_id); });
			button(layer.mask.linked === false ? 'Link Layer Mask' : 'Unlink Layer Mask',
				() => { _this.Mask.toggle_linked(layer_id); });
			button('Reveal All', () => { _this.Mask.fill_mask(layer_id, true); });
			button('Hide All', () => { _this.Mask.fill_mask(layer_id, false); });
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

		var fx_btn = document.getElementById('status_layer_fx');
		if (fx_btn) {
			fx_btn.addEventListener('click', function (e) {
				e.stopPropagation();
				_this.toggle_fx_menu(fx_btn);
			});
		}

		var adj_btn = document.getElementById('status_adjustment_layer');
		if (adj_btn) {
			adj_btn.addEventListener('click', function (e) {
				e.stopPropagation();
				_this.toggle_adj_menu(adj_btn);
			});
		}

		document.getElementById('status_new_layer').addEventListener('click', function () {
			app.State.do_action(
				new app.Actions.Insert_layer_action()
			);
		});

		var status_new_group = document.getElementById('status_new_group');
		if (status_new_group) {
			status_new_group.addEventListener('click', function () {
				_this.Layer_group.new_group();
			});
		}

		document.getElementById('status_delete_layer').addEventListener('click', function () {
			_this.Layer_delete.delete();
		});
	}

	/**
	 * toggles the Adjustment layer popup menu
	 */
	toggle_adj_menu(button_el) {
		if (this.adj_menu_open) {
			this.hide_adj_menu();
		} else {
			this.show_adj_menu(button_el);
		}
	}

	/**
	 * shows the Adjustment layer popup menu anchored above the given button
	 */
	show_adj_menu(button_el) {
		this.hide_adj_menu();

		var rect = button_el.getBoundingClientRect();
		var menu = document.createElement('div');
		menu.id = 'layer_adj_popup_menu';
		menu.className = 'layer_fx_popup_menu layer_adj_popup_menu';

		var _this = this;
		var addItem = function (label, type) {
			var b = document.createElement('button');
			b.type = 'button';
			b.className = 'layer_fx_menu_item';
			b.innerHTML = label;
			b.addEventListener('click', function (e) {
				e.stopPropagation();
				_this.hide_adj_menu();
				if (app.GUI && app.GUI.modules && app.GUI.modules['layer/adjustment']) {
					app.GUI.modules['layer/adjustment'].create(type);
				}
			});
			menu.appendChild(b);
		};

		addItem('Brightness...', 'brightness');
		addItem('Contrast...', 'contrast');
		addItem('Hue Rotate...', 'hue-rotate');
		addItem('Saturate...', 'saturate');
		addItem('Grayscale...', 'grayscale');
		addItem('Sepia...', 'sepia');
		addItem('Invert (Negative)...', 'invert');
		addItem('Gaussian Blur...', 'blur');
		addItem('Threshold...', 'threshold');

		document.body.appendChild(menu);

		var menuRect = menu.getBoundingClientRect();
		var left = Math.max(10, Math.min(window.innerWidth - menuRect.width - 10, rect.left + (rect.width / 2) - (menuRect.width / 2)));
		var top = Math.max(10, rect.top - menuRect.height - 4);
		menu.style.left = Math.round(left) + 'px';
		menu.style.top = Math.round(top) + 'px';

		this.adj_menu = menu;
		this.adj_menu_open = true;
	}

	/**
	 * hides the Adjustment layer popup menu
	 */
	hide_adj_menu() {
		this.adj_menu_open = false;
		if (this.adj_menu) {
			this.adj_menu.remove();
			this.adj_menu = null;
		}
	}

	/**
	 * toggles the Fx popup menu
	 */
	toggle_fx_menu(button_el) {
		if (this.fx_menu_open) {
			this.hide_fx_menu();
		} else {
			this.show_fx_menu(button_el);
		}
	}

	/**
	 * shows the Fx popup menu anchored above the given button
	 */
	show_fx_menu(button_el) {
		this.hide_fx_menu();

		var rect = button_el.getBoundingClientRect();
		var menu = document.createElement('div');
		menu.id = 'layer_fx_popup_menu';
		menu.className = 'layer_fx_popup_menu';

		var _this = this;
		var addItem = function (label, callback, enabled) {
			var b = document.createElement('button');
			b.type = 'button';
			b.className = 'layer_fx_menu_item' + (enabled ? '' : ' disabled');
			b.innerHTML = label;
			if (enabled) {
				b.addEventListener('click', function (e) {
					e.stopPropagation();
					_this.hide_fx_menu();
					callback();
				});
			}
			menu.appendChild(b);
		};

		addItem('Stroke...', () => {
			if (app.GUI && app.GUI.modules && app.GUI.modules['layer/styles']) {
				app.GUI.modules['layer/styles'].open('stroke');
			}
		}, true);

		addItem('Inner Glow...', () => {
			if (app.GUI && app.GUI.modules && app.GUI.modules['layer/styles']) {
				app.GUI.modules['layer/styles'].open('inner_glow');
			}
		}, true);

		addItem('Outer Glow...', () => {
			if (app.GUI && app.GUI.modules && app.GUI.modules['layer/styles']) {
				app.GUI.modules['layer/styles'].open('outer_glow');
			}
		}, true);

		addItem('Drop Shadow...', () => {
			if (app.GUI && app.GUI.modules && app.GUI.modules['layer/styles']) {
				app.GUI.modules['layer/styles'].open('shadow');
			}
		}, true);

		document.body.appendChild(menu);

		// position above the button
		var menuRect = menu.getBoundingClientRect();
		var left = Math.max(10, Math.min(window.innerWidth - menuRect.width - 10, rect.left + (rect.width / 2) - (menuRect.width / 2)));
		var top = Math.max(10, rect.top - menuRect.height - 4);
		menu.style.left = Math.round(left) + 'px';
		menu.style.top = Math.round(top) + 'px';

		this.fx_menu = menu;
		this.fx_menu_open = true;
	}

	/**
	 * hides the Fx popup menu
	 */
	hide_fx_menu() {
		this.fx_menu_open = false;
		if (this.fx_menu) {
			this.fx_menu.remove();
			this.fx_menu = null;
		}
	}


	/**
	 * Layers panel click selection — plain / Shift range / Ctrl|Cmd toggle.
	 * Updates config.selected_layer_ids; config.layer remains the primary.
	 */
	select_layer_from_panel(layer_id, event) {
		var id = parseInt(layer_id, 10);
		if (!id || !app.Layers.get_layer(id)) {
			return;
		}

		var is_shift = !!(event && event.shiftKey);
		var is_ctrl = !!(event && (event.ctrlKey || event.metaKey));

		if (is_shift) {
			var rows = get_tree_rows(config.layers);
			var ids = rows.map(function (r) { return r.layer.id; });
			var anchor = (config.layer_select_anchor_id != null)
				? config.layer_select_anchor_id
				: (config.layer ? config.layer.id : id);
			var i0 = ids.indexOf(anchor);
			var i1 = ids.indexOf(id);
			if (i0 < 0) i0 = i1;
			if (i1 < 0) return;
			var lo = Math.min(i0, i1);
			var hi = Math.max(i0, i1);
			var range = ids.slice(lo, hi + 1);
			return app.State.do_action(
				new app.Actions.Select_layer_action(id, true, { ids: range, set_anchor: false })
			);
		}

		if (is_ctrl) {
			var current = (Array.isArray(config.selected_layer_ids) && config.selected_layer_ids.length)
				? config.selected_layer_ids.slice()
				: (config.layer ? [config.layer.id] : []);
			var idx = current.indexOf(id);
			var primary_id = id;
			if (idx >= 0) {
				if (current.length <= 1) {
					// keep at least one selected
					return;
				}
				current.splice(idx, 1);
				if (config.layer && config.layer.id === id) {
					primary_id = current[current.length - 1];
				} else {
					primary_id = config.layer ? config.layer.id : current[current.length - 1];
				}
			} else {
				current.push(id);
				primary_id = id;
			}
			return app.State.do_action(
				new app.Actions.Select_layer_action(primary_id, true, { ids: current, set_anchor: false })
			);
		}

		// Plain click: single-select and set anchor
		if (config.layer && config.layer.id == id) {
			if (config.mask_active === true) {
				this.Mask.set_active(false);
			}
			var needs_collapse = !Array.isArray(config.selected_layer_ids)
				|| config.selected_layer_ids.length !== 1
				|| config.selected_layer_ids[0] !== id;
			if (needs_collapse) {
				config.selected_layer_ids = [id];
				config.layer_select_anchor_id = id;
				this.render_layers();
			}
			return;
		}

		return app.State.do_action(
			new app.Actions.Select_layer_action(id)
		);
	}

	/**
	 * returns thumbnail HTML for layer type
	 */
	get_layer_thumb(layer) {
		if (layer.type === 'group') {
			return '<svg class="thumb_icon thumb_folder" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3.5h5l1.2 1.5H14.5v8H1.5v-9.5z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.5 6.5h13" stroke="currentColor" stroke-width="1.2"/></svg>';
		}
		if (layer.type === 'adjustment') {
			return '<svg class="thumb_icon thumb_adjustment" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 2 A6 6 0 0 1 8 14 Z" fill="currentColor"/></svg>';
		}
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
		var targetEl = document.getElementById(target_id);
		if (targetEl) {
			targetEl.innerHTML = '';
		}
		var html = '';

		if (config.layers && config.layers.length) {
			var rows = get_tree_rows(config.layers);
			var layers_top_first = rows.map(function (r) { return r.layer; });

			var clipped_ids = new Set();
			var base_ids = new Set();

			for (var k = 0; k < layers_top_first.length; k++) {
				if (layers_top_first[k].composition === 'source-atop') {
					clipped_ids.add(layers_top_first[k].id);
					for (var m = k + 1; m < layers_top_first.length; m++) {
						if (layers_top_first[m].composition !== 'source-atop') {
							base_ids.add(layers_top_first[m].id);
							break;
						}
					}
				}
			}

			for (var ri = 0; ri < rows.length; ri++) {
				var value = rows[ri].layer;
				var depth = rows[ri].depth;
				var is_clipped = clipped_ids.has(value.id);
				var is_base = base_ids.has(value.id);
				var class_extra = '';
				if (is_group(value)) {
					class_extra += ' is_group';
				}
				if (is_clipped) {
					class_extra += ' is_clipped shorter';
				}
				if (is_base) {
					class_extra += ' is_clipping_base';
				}
				var selected_ids = (Array.isArray(config.selected_layer_ids) && config.selected_layer_ids.length)
					? config.selected_layer_ids
					: (config.layer ? [config.layer.id] : []);
				if (selected_ids.indexOf(value.id) !== -1){
					class_extra += ' active';
				}

				html += '<div class="item ' + class_extra + (value.locked ? ' locked' : '') + '" data-id="' + value.id + '" data-depth="' + depth + '" draggable="' + (value.locked ? 'false' : 'true') + '" style="padding-left:' + (4 + depth * 14) + 'px">';

				if (is_group(value)) {
					var open = value.opened !== false;
					html += '	<button type="button" class="group_chevron' + (open ? ' opened' : '') + '" data-id="' + value.id + '" title="' + (open ? 'Collapse' : 'Expand') + '">' + (open ? '▾' : '▸') + '</button>';
				} else {
					html += '	<span class="group_chevron_spacer"></span>';
				}

				if (value.visible == true)
					html += '	<button class="visibility visible trn" id="visibility" data-id="' + value.id + '" title="Hide"></button>';
				else
					html += '	<button class="visibility trn" id="visibility" data-id="' + value.id + '" title="Show"></button>';

				if (is_clipped) {
					html += '	<button type="button" class="clipping_arrow_btn" data-id="' + value.id + '" title="Clipping mask (click to release)"><svg class="clipping_arrow_svg" viewBox="0 0 16 16"><path d="M4 2v6h5.5V5.5L14 9.5l-4.5 4V11H2V2h2z" fill="currentColor"/></svg></button>';
				}

				var layer_thumb_class = 'layer_thumb';
				if (selected_ids.indexOf(value.id) !== -1 && !(config.layer && value.id == config.layer.id && config.mask_active === true)) {
					layer_thumb_class += ' active_thumb';
				}
				html += '	<span class="' + layer_thumb_class + '" data-id="' + value.id + '">' + this.get_layer_thumb(value) + '</span>';

				if (!is_group(value)) {
					if (value.mask != null) {
						var is_linked = value.mask.linked !== false;
						html += '	<span class="mask_link_icon ' + (is_linked ? 'linked' : 'unlinked') + '" data-id="' + value.id + '" title="' + (is_linked ? 'Layer and mask are linked. Click to unlink.' : 'Layer and mask are unlinked. Click to link.') + '">';
						if (is_linked) {
							html += '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
						} else {
							html += '<span class="unlinked_space"></span>';
						}
						html += '</span>';

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
				if (value.filters && value.filters.length > 0) {
					html += '<div class="filters" style="padding-left:' + (18 + depth * 14) + 'px">';
					for (var j in value.filters) {
						var filter = value.filters[j];
						var is_disabled = !!filter.disabled;
						var titleMap = {
							'shadow': 'Drop Shadow',
							'drop-shadow': 'Drop Shadow',
							'stroke': 'Stroke',
							'inner_glow': 'Inner Glow',
							'outer_glow': 'Outer Glow'
						};
						var title = titleMap[filter.name] || filter.name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

						html += '<div class="filter' + (is_disabled ? ' disabled' : '') + '">';
						if (!is_disabled) {
							html += '	<button class="visibility visible trn" id="filter_visibility" data-pid="' + value.id + '" data-id="' + filter.id + '" title="Hide effect"></button>';
						} else {
							html += '	<button class="visibility trn" id="filter_visibility" data-pid="' + value.id + '" data-id="' + filter.id + '" title="Show effect"></button>';
						}
						html += '	<span class="layer_name" id="filter_name" data-pid="' + value.id + '" data-id="' + filter.id + '" data-filter="' + filter.name + '">' + title + '</span>';
						html += '	<span class="delete" id="delete_filter" data-pid="' + value.id + '" data-id="' + filter.id + '" title="delete"></span>';
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

		this.update_header_controls();
	}

	update_header_controls() {
		var blendSelect = document.getElementById('layer_blend_select');
		var opNumber = document.getElementById('layer_opacity_number');
		var opRange = document.getElementById('layer_opacity_range');

		if (config.layer && config.layer.id != null) {
			var comp = config.layer.composition || 'source-over';
			var opacity = (config.layer.opacity != null) ? Math.round(config.layer.opacity) : 100;

			if (blendSelect) {
				blendSelect.value = comp;
				blendSelect.disabled = false;
			}
			if (opNumber) {
				opNumber.value = opacity;
				opNumber.disabled = false;
			}
			if (opRange) {
				opRange.value = opacity;
				opRange.disabled = false;
			}
		} else {
			if (blendSelect) {
				blendSelect.value = 'source-over';
				blendSelect.disabled = true;
			}
			if (opNumber) {
				opNumber.value = 100;
				opNumber.disabled = true;
			}
			if (opRange) {
				opRange.value = 100;
				opRange.disabled = true;
			}
		}
	}
}

export default GUI_layers_class;
