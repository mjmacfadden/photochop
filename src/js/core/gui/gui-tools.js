/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

import app from './../../app.js';
import config from './../../config.js';
import Helper_class from './../../libs/helpers.js';
import Tools_translate_class from './../../modules/tools/translate.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Base_gui_class from '../base-gui.js';
import GUI_shortcuts_class from './gui-shortcuts.js';
import Dialog_class from './../../libs/popup.js';
import GUI_brush_library_class from './gui-brush-library.js';

var instance = null;
var Helper = new Helper_class();

/**
 * GUI class responsible for rendering left sidebar tools
 */
class GUI_tools_class {

	constructor(GUI_class) {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.Helper = new Helper_class();
		this.Tools_translate = new Tools_translate_class();
		this.Base_gui = new Base_gui_class();

		//active tool
		this.active_tool = 'select';
		this.tools_modules = {};
		this.Brush_library = new GUI_brush_library_class();
	}

	load_plugins() {
		var _this = this;
		var ctx = document.getElementById('canvas_minipaint').getContext("2d");
		var plugins_context = require.context("./../../tools/", true, /\.js$/);
		plugins_context.keys().forEach(function (key) {
			if (key.indexOf('Base' + '/') < 0) {
				var moduleKey = key.replace('./', '').replace('.js', '');
				var full_key = moduleKey;
				if (moduleKey.indexOf('/') > -1) {
					var parts = moduleKey.split("/");
					moduleKey = parts[parts.length - 1];
				}

				var classObj = plugins_context(key);
				var object = new classObj.default(ctx);

				var title = _this.Helper.ucfirst(object.name);
				title = title.replace(/_/, ' ');

				_this.tools_modules[moduleKey] = {
					key: moduleKey,
					full_key: full_key,
					name: object.name,
					title: title,
					object: object,
				};

				//init events once
				if(typeof object.load != "undefined") {
					object.load();
				}
			}
		});
	}

	render_main_tools() {
		this.load_plugins();
		window.GUI_tools = this;
		var shortcuts = new GUI_shortcuts_class();

		// Build reverse map: tool name -> shortcut key
		this.tool_shortcuts = {};
		for (var key in shortcuts.keymap) {
			this.tool_shortcuts[shortcuts.keymap[key]] = key.toUpperCase();
		}

		this.render_tools();
		this.render_color_swatches();
	}

	render_tools() {
		var target_id = "tools_container";
		var _this = this;
		var saved_tool = this.Helper.getCookie('active_tool');
		if(saved_tool == 'media' || saved_tool == 'shape') {
			//bringing this back by default gives bad UX
			saved_tool = null
		}
		if (saved_tool != null) {
			this.active_tool = saved_tool;
		}

		//left menu
		for (var i in config.TOOLS) {
			var item = config.TOOLS[i];

			//apply saved shape to any tool group
			if (item.tool_group) {
				var saved_shape = this.Helper.getCookie(this.group_cookie_key(item.name));
				if (saved_shape != null) {
					for (var j in item.tool_group.items) {
						if (item.tool_group.items[j].shape == saved_shape) {
							item.tool_group.active_shape = saved_shape;
							break;
						}
					}
				}
			}

			if(item.title)
				var title = item.title;
			else
				var title = this.Helper.ucfirst(item.name).replace(/_/, ' ');

			if (this.tool_shortcuts && this.tool_shortcuts[item.name]) {
				title += ' [' + this.tool_shortcuts[item.name] + ']';
			}

			var itemDom = document.createElement('span');
			itemDom.id = item.name;
			itemDom.title = title;
			itemDom._toolGroupBaseTitle = title;

			//tool groups - show the active shape on the button
			if (item.tool_group && item.tool_group.items.length) {
				var active_shape = item.tool_group.active_shape || item.tool_group.items[0].shape;
				itemDom.title = this.tool_group_title(item, active_shape);
				itemDom._toolGroupBaseTitle = itemDom.title;
				itemDom.classList.add('marquee_' + active_shape);
			}

			var activeToolKey = this.get_button_id_for_tool(this.active_tool);
			if (item.name == activeToolKey) {
				itemDom.classList.add('item', 'trn', 'active', item.name);
			}
			else {
				itemDom.classList.add('item', 'trn', item.name);
			}
			if(item.visible === false){
				itemDom.style.display = 'none';
			}

			//events
			itemDom.addEventListener('click', function (event) {
				_this.activate_tool(this.id);
			});

			if (item.tool_group) {
				//right click pops the group flyout up (Photoshop style)
				itemDom.addEventListener('contextmenu', function (event) {
					event.preventDefault();
					if (_this._tool_group_popout) {
						_this.hide_tool_group();
					}
					else {
						_this.show_tool_group(this.id);
					}
				});

				//add corner triangle indicator for right-clickable tools
				var triangle = document.createElement('span');
				triangle.className = 'corner_triangle';
				itemDom.appendChild(triangle);
				itemDom.classList.add('has_group');
			}

			//register
			document.getElementById(target_id).appendChild(itemDom);
		}

		this.show_action_attributes();
		new app.Actions.Activate_tool_action(this.active_tool, true).do();
		this.Base_gui.check_canvas_offset();
	}

	show_tool_group(name) {
		var _this = this;
		var item = document.getElementById(name);
		var itemDef = null;
		for (var i in config.TOOLS) {
			if (config.TOOLS[i].name == name) {
				itemDef = config.TOOLS[i];
				break;
			}
		}
		if (item == null || itemDef == null || itemDef.tool_group == null)
			return;

		this.hide_tool_group();

		var rect = item.getBoundingClientRect();
		var pop = document.createElement('div');
		pop.className = 'tool_group_popout';
		pop.dataset.toolName = name;

		var current_shape = (itemDef.tool_group.active_shape)
			|| this.Helper.getCookie(this.group_cookie_key(itemDef.name))
			|| (itemDef.tool_group.items.length > 0 ? itemDef.tool_group.items[0].shape : 'rect');
		for (var j in itemDef.tool_group.items) {
			var it = itemDef.tool_group.items[j];
			var row = document.createElement('div');
			row.className = 'tool_group_item' + (it.shape == current_shape ? ' active' : '');
			row.dataset.shape = it.shape;
			var toolKey = it.tool || it.shape || itemDef.name;
			var shortcutKey = this.tool_shortcuts && (this.tool_shortcuts[toolKey] || this.tool_shortcuts[it.shape] || (it.shape === 'lasso' ? 'L' : this.tool_shortcuts[itemDef.name]));
			var shortcutHtml = shortcutKey ? '<span class="tg_shortcut" style="margin-left:auto;color:#888;font-size:11px;">' + shortcutKey + '</span>' : '';
			row.innerHTML = '<span class="tg_icon ' + it.icon + '"></span><span class="tg_name">' + it.title + '</span>' + shortcutHtml;
			(function (shape) {
				row.addEventListener('click', function (event) {
					event.stopPropagation();
					_this.hide_tool_group();
					_this.update_tool_shape(itemDef.name, shape);
				});
			})(it.shape);
			pop.appendChild(row);
		}

		//attach to body so it can not be clipped, and place it beside the button
		document.body.appendChild(pop);
		pop.style.position = 'fixed';
		pop.style.left = (rect.right + 4) + 'px';
		var top = rect.top - 6;
		var vh = window.innerHeight || document.documentElement.clientHeight || 0;
		if (top + pop.offsetHeight > vh - 8) {
			top = vh - pop.offsetHeight - 8;
		}
		if (top < 4) {
			top = 4;
		}
		pop.style.top = top + 'px';
		this._tool_group_popout = pop;

		//close when clicking elsewhere
		if (this._group_doc_handler == null) {
			this._group_doc_handler = function (event) {
				if (event.target != null && event.target.closest != null && event.target.closest('.tool_group_popout'))
					return;
				_this.hide_tool_group();
			};
		}
		setTimeout(function () {
			document.addEventListener('click', _this._group_doc_handler);
		}, 0);
	}

	hide_tool_group() {
		if (this._tool_group_popout) {
			if (this._tool_group_popout.parentNode != null) {
				this._tool_group_popout.parentNode.removeChild(this._tool_group_popout);
			}
			this._tool_group_popout = null;
		}
		if (this._group_doc_handler) {
			document.removeEventListener('click', this._group_doc_handler);
		}
	}

	/**
	 * cookie key persisted for a tool group's active shape. Keeps the legacy
	 * 'selection_shape' key for the marquee group, others use '<name>_shape'.
	 */
	group_cookie_key(name) {
		return name === 'selection' ? 'selection_shape' : name + '_shape';
	}

	/**
	 * returns the TOOLS entry name whose toolbar button represents the given
	 * tool key. Tools nested inside a tool_group are represented by the group's
	 * owner button (e.g. 'pencil' is shown/highlighted via the 'brush' button).
	 */
	get_button_id_for_tool(name) {
		for (var i in config.TOOLS) {
			var item = config.TOOLS[i];
			if (item.name == name)
				return item.name;
			if (item.tool_group) {
				for (var j in item.tool_group.items) {
					if ((item.tool_group.items[j].tool || item.name) == name)
						return item.name;
				}
			}
		}
		return name;
	}

	/**
	 * display title for a group button reflecting the currently active shape,
	 * with the shortcut key of the tool that shape maps to.
	 */
	tool_group_title(itemDef, shape) {
		for (var i in itemDef.tool_group.items) {
			if (itemDef.tool_group.items[i].shape == shape) {
				var title = itemDef.tool_group.items[i].title;
				var toolKey = itemDef.tool_group.items[i].tool || itemDef.tool_group.items[i].shape || itemDef.name;
				var shortcutKey = this.tool_shortcuts && (this.tool_shortcuts[toolKey] || this.tool_shortcuts[itemDef.tool_group.items[i].shape] || (itemDef.tool_group.items[i].shape === 'lasso' ? 'L' : this.tool_shortcuts[itemDef.name]));
				if (shortcutKey) {
					title += ' [' + shortcutKey + ']';
				}
				return title;
			}
		}
		return itemDef.title;
	}

	/**
	 * when the given tool key is a member of a tool group, sync the group's
	 * active shape, cookie, button icon and title to it (e.g. activating the
	 * pencil tool makes the brush button show the pencil icon).
	 */
	sync_group_button_for_tool(key) {
		var owner = this.get_button_id_for_tool(key);
		if (owner == key)
			return;
		var itemDef = null;
		for (var j in config.TOOLS) {
			if (config.TOOLS[j].name == owner) {
				itemDef = config.TOOLS[j];
				break;
			}
		}
		if (itemDef == null || itemDef.tool_group == null)
			return;
		var shape = null;
		for (var k in itemDef.tool_group.items) {
			if ((itemDef.tool_group.items[k].tool || itemDef.name) == key) {
				shape = itemDef.tool_group.items[k].shape;
				break;
			}
		}
		if (shape == null)
			return;
		itemDef.tool_group.active_shape = shape;
		this.Helper.setCookie(this.group_cookie_key(owner), shape);
		var btn = document.getElementById(owner);
		if (btn != null) {
			for (var m in itemDef.tool_group.items) {
				btn.classList.remove('marquee_' + itemDef.tool_group.items[m].shape);
			}
			btn.classList.add('marquee_' + shape);
			btn.title = this.tool_group_title(itemDef, shape);
			btn._toolGroupBaseTitle = btn.title;
		}
	}

	/**
	 * updates a tool group's active shape: persists it, refreshes the owner
	 * button's icon/title and activates the tool mapped to that shape.
	 */
	update_tool_shape(name, shape) {
		this.Helper.setCookie(this.group_cookie_key(name), shape);
		var itemDef = null;
		for (var i in config.TOOLS) {
			if (config.TOOLS[i].name == name) {
				itemDef = config.TOOLS[i];
				break;
			}
		}
		if (itemDef == null || itemDef.tool_group == null)
			return;
		itemDef.tool_group.active_shape = shape;

		//refresh the toolbar button look (icon + title)
		var btn = document.getElementById(name);
		if (btn != null) {
			for (var j in itemDef.tool_group.items) {
				btn.classList.remove('marquee_' + itemDef.tool_group.items[j].shape);
			}
			btn.classList.add('marquee_' + shape);
			btn.title = this.tool_group_title(itemDef, shape);
			btn._toolGroupBaseTitle = btn.title;
		}

		//activate the tool mapped to this shape
		var toolKey = name;
		for (var k in itemDef.tool_group.items) {
			if (itemDef.tool_group.items[k].shape == shape) {
				toolKey = itemDef.tool_group.items[k].tool || name;
				break;
			}
		}
		this.activate_tool(toolKey);
	}

	/**
	 * legacy alias for the marquee group.
	 */
	update_marquee_shape(shape) {
		this.update_tool_shape('selection', shape);
	}

	async activate_tool(key, options = {}) {
		return app.State.do_action(
			new app.Actions.Activate_tool_action(key),
			options
		);
	}

	action_data() {
		for (var i in config.TOOLS) {
			if (config.TOOLS[i].name == this.active_tool)
				return config.TOOLS[i];
		}

		//something wrong - select first tool
		this.active_tool = config.TOOLS[0].name;
		return config.TOOLS[0];
	}

	/**
	 * used strings: 
	 * "Fill", "Square", "Circle", "Radial", "Anti aliasing", "Circle", "Strict", "Burn"
	 */
	show_action_attributes() {
		var _this = this;
		var target_id = "action_attributes";

		const itemContainer = document.getElementById(target_id);

		itemContainer.innerHTML = "";

		const attributes = this.action_data().attributes;

		let itemDom;
		let currentButtonGroup = null;
		for (var k in attributes) {
			var item = attributes[k];

			var title = k[0].toUpperCase() + k.slice(1);
			title = title.replace("_", " ");

			if (typeof item == 'object' && typeof item.value == 'boolean' && item.icon) {
				if (currentButtonGroup == null) {
					currentButtonGroup = document.createElement('div');
					currentButtonGroup.className = 'ui_button_group no_wrap';
					itemDom = document.createElement('div');
					itemDom.className = 'item ' + k;
					itemContainer.appendChild(itemDom);
					itemDom.appendChild(currentButtonGroup);
				} else {
					itemDom.classList.add(k);
				}
			} else {
				itemDom = document.createElement('div');
				itemDom.className = 'item ' + k;
				itemContainer.appendChild(itemDom);
				currentButtonGroup = null;
			}

			if (typeof item == 'boolean' || (typeof item == 'object' && typeof item.value == 'boolean')) {
				//boolean - true, false

				let value = item;
				let icon = null;
				if (typeof item == 'object') {
					value = item.value;
					if (item.icon) {
						icon = item.icon;
					}
				}

				const element = document.createElement('button');
				element.className = 'trn';
				element.type = 'button';
				element.id = k;
				element.innerHTML = title;
				element.setAttribute('aria-pressed', value);
				if (icon) {
					element.classList.add('ui_icon_button');
					element.classList.add('input_height');
					element.innerHTML = icon;
					element.title = k;
					element.innerHTML = '<img style="width:16px;height:16px;" alt="'+title+'" src="images/icons/'+icon+'" />';
				} else {
					element.classList.add('ui_toggle_button');
				}
				//event
				element.addEventListener('click', (event) => {
					//toggle boolean
					var new_value = element.getAttribute('aria-pressed') !== 'true';
					const actionData = this.action_data();
					const attributes = actionData.attributes;
					const id = event.target.closest('button').id;
					if (typeof attributes[id] === 'object') {
						attributes[id].value = new_value;
					} else {
						attributes[id] = new_value;
					}
					element.setAttribute('aria-pressed', new_value);
					if (actionData.on_update != undefined) {
						//send event
						var moduleKey = actionData.name;
						var functionName = actionData.on_update;
						this.tools_modules[moduleKey].object[functionName]({ key: id, value: new_value });
					}
				});

				if (currentButtonGroup) {
					currentButtonGroup.appendChild(element);
				} else {
					itemDom.appendChild(element);
				}
			}
			else if (typeof item == 'number' || (typeof item == 'object' && typeof item.value == 'number')) {
				//numbers
				let min = 1;
				let max = k === 'power' ? 100 : 999;
				let value = item;
				let step = null;
				let is_slider = false;
				if (typeof item == 'object') {
					value = item.value;
					if (item.min != null) {
						min = item.min;
					}
					if (item.max != null) {
						max = item.max;
					}
					if (item.step != null) {
						step = item.step;
					}
					is_slider = item.slider === true;
				}

				var elementTitle = document.createElement('label');
				elementTitle.innerHTML = title + ':';
				elementTitle.id = 'attribute_label_' + k;
				elementTitle.className = 'trn';

				if (is_slider) {
					//range slider with a precise line-track + editable numeric value
					const attribute_key = k;

					const applyValue = (new_value) => {
						new_value = parseFloat(new_value);
						if (Number.isNaN(new_value)) return null;
						new_value = Math.max(min, Math.min(max, new_value));
						if (step) {
							new_value = step * Math.round(new_value / step);
						}
						const actionData = this.action_data();
						const attributes = actionData.attributes;
						if (typeof attributes[attribute_key] === 'object') {
							attributes[attribute_key].value = new_value;
						} else {
							attributes[attribute_key] = new_value;
						}
						if (actionData.on_update != undefined) {
							//send event
							var moduleKey = actionData.name;
							var functionName = actionData.on_update;
							this.tools_modules[moduleKey].object[functionName]({ key: attribute_key, value: new_value });
						}
						return new_value;
					};

					const elementValue = document.createElement('input');
					elementValue.type = 'number';
					elementValue.min = String(min);
					elementValue.max = String(max);
					elementValue.step = String(step || 1);
					elementValue.value = String(value);
					elementValue.id = 'attribute_value_' + attribute_key;
					elementValue.className = 'attribute_value slider_value';
					elementValue.setAttribute('aria-labelledby', 'attribute_label_' + attribute_key);
					elementValue.title = title;

					const elementInput = document.createElement('input');
					elementInput.type = 'range';
					elementInput.min = min;
					elementInput.max = max;
					elementInput.step = step || 1;
					elementInput.className = 'precise';
					itemDom.appendChild(elementInput);
					const $range = $(elementInput)
						.uiRange({
							id: attribute_key,
							min,
							max,
							step: step || 1,
							value,
						})
						.on('input', () => {
							const new_value = $range.uiRange('get_value');
							const snapped = applyValue(new_value);
							if (snapped != null) {
								elementValue.value = String(snapped);
							}
						});


					//live typing previews the value; committed (snapped) on blur / Enter
					elementValue.addEventListener('input', () => {
						const parsed = parseFloat(elementValue.value);
						if (Number.isNaN(parsed)) return;
						const clamped = Math.max(min, Math.min(max, parsed));
						const snapped = applyValue(clamped);
						if (snapped != null) {
							$range.uiRange('set_value', snapped);
						}
					});
					elementValue.addEventListener('change', () => {
						const parsed = parseFloat(elementValue.value);
						if (Number.isNaN(parsed)) {
							const current = $range.uiRange('get_value');
							elementValue.value = String(current);
							return;
						}
						const snapped = applyValue(parsed);
						if (snapped != null) {
							elementValue.value = String(snapped);
							$range.uiRange('set_value', snapped);
						}
					});

					itemDom.appendChild(elementTitle);
					itemDom.appendChild($range[0]);
					itemDom.appendChild(elementValue);
					itemDom.classList.add('has_slider');
				}
				else {

				const elementInput = document.createElement('input');
				elementInput.type = 'number';
				elementInput.setAttribute('aria-labelledby', 'attribute_label_' + k);
				const $numberInput = $(elementInput)
					.uiNumberInput({
						id: k,
						min,
						max,
						value,
						step: step || 1,
						inputStep: item.inputStep,
						inputType: item.inputType,
						exponentialStepButtons: !step
					})
					.on('input', () => {
						let value = $numberInput.uiNumberInput('get_value');
						const id = $numberInput.uiNumberInput('get_id');
						const actionData = this.action_data();
						const attributes = actionData.attributes;
						if (typeof attributes[id] === 'object') {
							attributes[id].value = value;
						} else {
							attributes[id] = value;
						}

						if (actionData.on_update != undefined) {
							//send event
							var moduleKey = actionData.name;
							var functionName = actionData.on_update;
							this.tools_modules[moduleKey].object[functionName]({ key: id, value: value });
						}
					});

				itemDom.appendChild(elementTitle);
				itemDom.appendChild($numberInput[0]);
				}
			}
			else if (typeof item == 'object' && item.ui === 'brush_library') {
				// Brush Library trigger (Procreate / PS / Krita style picker)
				this.Brush_library.render_trigger(itemDom);
			}
			else if (typeof item == 'object') {
				//select

				var elementTitle = document.createElement('label');
				elementTitle.innerHTML = title + ':';
				elementTitle.for = k;
				elementTitle.className = 'trn';

				var selectList = document.createElement("select");
				selectList.id = k;
				const values = typeof item.values === 'function' ? item.values() : item.values;
				if (k === 'font') {
					const fontPicker = document.createElement('div');
					fontPicker.className = 'font_picker';
					const fontButton = document.createElement('button');
					fontButton.type = 'button';
					fontButton.className = 'font_picker_button';
					fontButton.setAttribute('aria-haspopup', 'listbox');
					fontButton.setAttribute('aria-expanded', 'false');
					const fontMenu = document.createElement('div');
					fontMenu.className = 'font_picker_menu';
					fontMenu.setAttribute('role', 'listbox');
					const updateFontButton = (value) => {
						fontButton.textContent = value || 'Select font';
						fontButton.style.fontFamily = value && !value.includes('...') ? `"${value}", sans-serif` : '';
					};
					// Toolbar ancestors clip vertical overflow, so the menu is positioned
					// via fixed coordinates and attached to <body> only while open.
					const onDocumentMouseDown = (event) => {
						if (fontButton.contains(event.target) || fontMenu.contains(event.target)) return;
						closeFontMenu();
					};
					const onDocumentKeyDown = (event) => {
						if (event.key === 'Escape') closeFontMenu();
					};
					const closeFontMenu = () => {
						if (fontMenu.parentNode) fontMenu.parentNode.removeChild(fontMenu);
						fontButton.setAttribute('aria-expanded', 'false');
						document.removeEventListener('mousedown', onDocumentMouseDown, true);
						document.removeEventListener('keydown', onDocumentKeyDown, true);
					};
					const openFontMenu = () => {
						const rect = fontButton.getBoundingClientRect();
						fontMenu.style.left = rect.left + 'px';
						fontMenu.style.top = (rect.bottom + 4) + 'px';
						fontMenu.style.width = Math.max(rect.width, 200) + 'px';
						// Keep the menu on-screen if there isn't enough room below the button.
						fontMenu.style.maxHeight = Math.max(120, window.innerHeight - rect.bottom - 12) + 'px';
						document.body.appendChild(fontMenu);
						fontButton.setAttribute('aria-expanded', 'true');
						document.addEventListener('mousedown', onDocumentMouseDown, true);
						document.addEventListener('keydown', onDocumentKeyDown, true);
					};
					for (let j in values) {
						const value = values[j];
						const option = document.createElement('button');
						option.type = 'button';
						option.className = 'font_picker_option';
						option.setAttribute('role', 'option');
						option.setAttribute('aria-selected', String(item.value === value));
						option.textContent = value || 'Select font';
						if (value && !value.includes('...')) option.style.fontFamily = `"${value}", sans-serif`;
						option.addEventListener('click', () => {
							closeFontMenu();
							const actionData = this.action_data();
							actionData.attributes.font.value = value;
							if (actionData.on_update != undefined) {
								const result = this.tools_modules[actionData.name].object[actionData.on_update]({ key: 'font', value });
								if (result && result.new_values) {
									for (let key in result.new_values) actionData.attributes[key].value = result.new_values[key];
								}
							}
							this.show_action_attributes();
						});
						fontMenu.appendChild(option);
					}
					updateFontButton(item.value);
					fontButton.addEventListener('click', () => {
						if (fontMenu.parentNode) closeFontMenu();
						else openFontMenu();
					});
					fontPicker.appendChild(fontButton);
					itemDom.appendChild(fontPicker);
					continue;
				}
				for (let j in values) {
					var option = document.createElement("option");
					if (item.value == values[j]) {
						option.selected = 'selected';
					}
					option.className = 'trn';
					option.name = values[j];
					option.value = values[j];
					option.text = values[j];
					if (k === 'font' && values[j] && !values[j].includes('...')) {
						option.style.fontFamily = `"${values[j]}", sans-serif`;
						option.style.fontSize = '15px';
						option.style.padding = '3px 6px';
					}
					selectList.appendChild(option);
				}
				if (k === 'font' && item.value && !item.value.includes('...')) {
					selectList.style.fontFamily = `"${item.value}", sans-serif`;
				}
				//event
				selectList.addEventListener('change', (event) => {
					const actionData = this.action_data();
					actionData.attributes[event.target.id].value = event.target.value;

					if (event.target.id === 'font' && event.target.value && !event.target.value.includes('...')) {
						event.target.style.fontFamily = `"${event.target.value}", sans-serif`;
					}

					if (actionData.on_update != undefined) {
						//send event
						var moduleKey = actionData.name;
						var functionName = actionData.on_update;
						const result = this.tools_modules[moduleKey].object[functionName]({ key: event.target.id, value: event.target.value });
						if (result) {
							// Allow the on_update function to modify the attribute value if necessary.
							if (result.new_values) {
								for (let key in result.new_values) {
									actionData.attributes[key].value = result.new_values[key];
								}
							}
						}
					}

					this.show_action_attributes();
				});

				itemDom.appendChild(elementTitle);
				itemDom.appendChild(selectList);
			}
			else if (typeof item == 'string' && item[0] == '#') {
				//color

				var elementTitle = document.createElement('label');
				elementTitle.innerHTML = title + ':';
				elementTitle.for = k;
				elementTitle.className = 'trn';

				var colorInput = document.createElement('input');
				colorInput.type = 'color';
				const $colorInput = $(colorInput)
					.uiColorInput({
						id: k,
						value: item
					})
					.on('change', () => {
						let value = $colorInput.uiColorInput('get_value');
						const id = $colorInput.uiColorInput('get_id');
						const actionData = this.action_data();
						actionData.attributes[id] = value;
						if (actionData.on_update != undefined) {
							//send event
							var moduleKey = actionData.name;
							var functionName = actionData.on_update;
							this.tools_modules[moduleKey].object[functionName]({ key: id, value: value });
						}
					});

				itemDom.appendChild(elementTitle);
				itemDom.appendChild($colorInput[0]);
			}
			else if (typeof item == 'string') {
				//plain string (non-color) - render as a read-only label,
				//some tools carry internal string state here
				var elementTitle = document.createElement('label');
				elementTitle.className = 'trn';
				elementTitle.innerHTML = title + ':';
				var elementValue = document.createElement('span');
				elementValue.className = 'attribute_value';
				elementValue.innerHTML = item;
				itemDom.appendChild(elementTitle);
				itemDom.appendChild(elementValue);
			}
			else {
				alertify.error('Error: unsupported attribute type:' + typeof item + ', ' + k);
			}
		}

		if (this.action_data().name === 'select') {
			this.render_transform_attributes(itemContainer);
		}

		if (config.LANG != 'en') {
			//retranslate
			this.Tools_translate.translate(config.LANG);
		}
	}

	render_transform_attributes(container) {
		const layer = config.layer;
		const w = layer ? Math.round(layer.width) : 0;
		const h = layer ? Math.round(layer.height) : 0;
		if (config.aspect_lock === undefined) {
			config.aspect_lock = true; // pressed in by default
		}

		const group = document.createElement('div');
		group.className = 'item transform_dimensions_group';
		group.style.display = 'inline-flex';
		group.style.alignItems = 'center';
		group.style.gap = '4px';

		// W indicator / input
		const wLabel = document.createElement('label');
		wLabel.innerText = 'W:';
		wLabel.className = 'trn';
		wLabel.style.fontWeight = 'bold';
		wLabel.style.marginRight = '2px';
		wLabel.style.marginTop = '0';

		const wInput = document.createElement('input');
		wInput.id = 'select_transform_w';
		wInput.type = 'number';
		wInput.className = 'attribute_value';
		wInput.style.width = '60px';
		wInput.value = w;
		wInput.title = 'Width (px)';

		// Lock button
		const lockBtn = document.createElement('button');
		lockBtn.id = 'select_aspect_lock_btn';
		lockBtn.type = 'button';
		lockBtn.className = 'ui_icon_button input_height aspect_ratio_lock';
		lockBtn.title = 'Maintain aspect ratio (Shift temporarily unlocks)';
		lockBtn.setAttribute('aria-pressed', config.aspect_lock ? 'true' : 'false');
		lockBtn.style.padding = '3px 6px';
		lockBtn.style.display = 'inline-flex';
		lockBtn.style.alignItems = 'center';
		lockBtn.style.justifyContent = 'center';
		lockBtn.style.cursor = 'pointer';

		this.update_aspect_lock_ui(false, lockBtn);

		lockBtn.addEventListener('click', () => {
			config.aspect_lock = !config.aspect_lock;
			const selectTool = this.tools_modules['select']?.object;
			if (selectTool && selectTool.Base_selection) {
				selectTool.Base_selection.find_settings().keep_ratio = config.aspect_lock;
			}
			this.update_aspect_lock_ui(false, lockBtn);
		});

		// H indicator / input
		const hLabel = document.createElement('label');
		hLabel.innerText = 'H:';
		hLabel.className = 'trn';
		hLabel.style.fontWeight = 'bold';
		hLabel.style.marginRight = '2px';
		hLabel.style.marginTop = '0';

		const hInput = document.createElement('input');
		hInput.id = 'select_transform_h';
		hInput.type = 'number';
		hInput.className = 'attribute_value';
		hInput.style.width = '60px';
		hInput.value = h;
		hInput.title = 'Height (px)';

		const applyDimensions = (newW, newH) => {
			if (!config.layer || newW <= 0 || newH <= 0) return;
			app.State.do_action(
				new app.Actions.Update_layer_action(config.layer.id, {
					width: newW,
					height: newH,
				})
			);
		};

		wInput.addEventListener('change', () => {
			let newW = Math.round(parseFloat(wInput.value));
			if (isNaN(newW) || newW <= 0) {
				wInput.value = config.layer ? Math.round(config.layer.width) : 0;
				return;
			}
			if (config.layer && config.layer.width && config.layer.height && config.aspect_lock) {
				const ratio = config.layer.width / config.layer.height;
				const newH = Math.max(1, Math.round(newW / ratio));
				hInput.value = newH;
				applyDimensions(newW, newH);
			} else if (config.layer) {
				applyDimensions(newW, config.layer.height);
			}
		});

		hInput.addEventListener('change', () => {
			let newH = Math.round(parseFloat(hInput.value));
			if (isNaN(newH) || newH <= 0) {
				hInput.value = config.layer ? Math.round(config.layer.height) : 0;
				return;
			}
			if (config.layer && config.layer.width && config.layer.height && config.aspect_lock) {
				const ratio = config.layer.width / config.layer.height;
				const newW = Math.max(1, Math.round(newH * ratio));
				wInput.value = newW;
				applyDimensions(newW, newH);
			} else if (config.layer) {
				applyDimensions(config.layer.width, newH);
			}
		});

		group.appendChild(wLabel);
		group.appendChild(wInput);
		group.appendChild(lockBtn);
		group.appendChild(hLabel);
		group.appendChild(hInput);

		container.appendChild(group);
	}

	update_aspect_lock_ui(isShiftDown, btn) {
		const lockBtn = btn || document.getElementById('select_aspect_lock_btn');
		if (!lockBtn) return;
		if (isShiftDown === undefined) {
			isShiftDown = !!(app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_shift_down);
		}
		const baseLock = (config.aspect_lock !== undefined) ? config.aspect_lock : true;
		const effectiveLock = isShiftDown ? !baseLock : baseLock;
		lockBtn.setAttribute('aria-pressed', effectiveLock ? 'true' : 'false');
		if (effectiveLock) {
			lockBtn.classList.add('active');
			lockBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
		} else {
			lockBtn.classList.remove('active');
			lockBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
		}
	}

	update_transform_indicators(width, height) {
		const wInput = document.getElementById('select_transform_w');
		const hInput = document.getElementById('select_transform_h');
		if (wInput) {
			const val = width !== undefined ? width : (config.layer ? config.layer.width : 0);
			wInput.value = Math.round(val);
		}
		if (hInput) {
			const val = height !== undefined ? height : (config.layer ? config.layer.height : 0);
			hInput.value = Math.round(val);
		}
	}

	render_color_swatches() {
		var _this = this;
		var container = document.getElementById('tools_container');

		var swatchesDiv = document.createElement('div');
		swatchesDiv.className = 'toolbar-color-swatches';

		var innerDiv = document.createElement('div');
		innerDiv.className = 'toolbar-color-swatches-inner';

		var bgSwatch = document.createElement('div');
		bgSwatch.id = 'toolbar_bg_swatch';
		bgSwatch.className = 'toolbar-swatch toolbar-swatch-bg';
		bgSwatch.title = 'Background Color (click to change)';
		bgSwatch.style.background = config.COLOR_BG;

		var fgSwatch = document.createElement('div');
		fgSwatch.id = 'toolbar_fg_swatch';
		fgSwatch.className = 'toolbar-swatch toolbar-swatch-fg';
		fgSwatch.title = 'Foreground Color (click to change)';
		fgSwatch.style.background = config.COLOR;

		var swapBtn = document.createElement('button');
		swapBtn.id = 'toolbar_swap_colors';
		swapBtn.className = 'toolbar-swap-btn';
		swapBtn.title = 'Swap Colors (X)';
		swapBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><path d="M 3.5,3 A 5.5,5.5 0 0,1 9,8.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><polygon points="3.5,0.8 0.5,3 3.5,5.2"/><polygon points="6.8,8.5 9,11.5 11.2,8.5"/></svg>';

		innerDiv.appendChild(swapBtn);
		innerDiv.appendChild(bgSwatch);
		innerDiv.appendChild(fgSwatch);

		swatchesDiv.appendChild(innerDiv);
		container.appendChild(swatchesDiv);

		fgSwatch.addEventListener('click', function () {
			_this.open_fg_color_picker();
		});
		bgSwatch.addEventListener('click', function () {
			_this.open_bg_color_picker();
		});
		swapBtn.addEventListener('click', function () {
			_this.swap_colors();
		});
	}

	open_fg_color_picker() {
		var _this = this;
		var selectedColor = config.COLOR;
		var currentColor = config.COLOR;
		var popup = new Dialog_class();
		var settings = {
			title: 'Foreground Color',
			className: 'color_picker',
			on_load: function (params, popupInstance) {
				var content = popupInstance.el.querySelector('.dialog_content');
				content.innerHTML = ''
					+ '<div id="toolbar_picker_gradient" style="padding:0 0 80% 0;position:relative;width:100%;"></div>'
					+ '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;">'
					+ '<label style="min-width:30px;">Hex</label>'
					+ '<input id="toolbar_color_hex" type="text" value="' + currentColor + '" maxlength="7" style="flex:1;">'
					+ '<div id="toolbar_color_preview" style="width:30px;height:24px;border:1px solid #444;background:' + currentColor + ';"></div>'
					+ '</div>';

				var hexInput = content.querySelector('#toolbar_color_hex');
				var preview = content.querySelector('#toolbar_color_preview');

				var rgb = Helper.hexToRgb(currentColor);
				var hsv = Helper.rgbToHsv(rgb.r, rgb.g, rgb.b);

				var $gradient = $(content.querySelector('#toolbar_picker_gradient')).uiColorPickerGradient();
				$gradient.uiColorPickerGradient('set_hsv', hsv);

				$gradient.on('input', function () {
					var hsv = $gradient.uiColorPickerGradient('get_hsv');
					var hex = Helper.hsvToHex(hsv.h, hsv.s, hsv.v);
					hexInput.value = hex;
					preview.style.background = hex;
					selectedColor = hex;
				});

				hexInput.addEventListener('input', function () {
					if (/^\#[0-9A-F]{6}$/gi.test(hexInput.value)) {
						var rgb = Helper.hexToRgb(hexInput.value);
						var hsv = Helper.rgbToHsv(rgb.r, rgb.g, rgb.b);
						$gradient.uiColorPickerGradient('set_hsv', hsv);
						preview.style.background = hexInput.value;
						selectedColor = hexInput.value;
					}
				});
			},
			on_finish: function () {
				if (/^\#[0-9A-F]{6}$/gi.test(selectedColor)) {
					config.COLOR = selectedColor;
					_this.update_toolbar_swatches();
					_this.Helper.setCookie('color', config.COLOR);
					app.GUI.GUI_colors.render_selected_color();
				}
			},
		};
		popup.show(settings);
	}

	open_bg_color_picker() {
		var _this = this;
		var selectedColor = config.COLOR_BG;
		var currentColor = config.COLOR_BG;
		var popup = new Dialog_class();
		var settings = {
			title: 'Background Color',
			className: 'color_picker',
			on_load: function (params, popupInstance) {
				var content = popupInstance.el.querySelector('.dialog_content');
				content.innerHTML = ''
					+ '<div id="toolbar_picker_gradient" style="padding:0 0 80% 0;position:relative;width:100%;"></div>'
					+ '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;">'
					+ '<label style="min-width:30px;">Hex</label>'
					+ '<input id="toolbar_color_hex" type="text" value="' + currentColor + '" maxlength="7" style="flex:1;">'
					+ '<div id="toolbar_color_preview" style="width:30px;height:24px;border:1px solid #444;background:' + currentColor + ';"></div>'
					+ '</div>';

				var hexInput = content.querySelector('#toolbar_color_hex');
				var preview = content.querySelector('#toolbar_color_preview');

				var rgb = Helper.hexToRgb(currentColor);
				var hsv = Helper.rgbToHsv(rgb.r, rgb.g, rgb.b);

				var $gradient = $(content.querySelector('#toolbar_picker_gradient')).uiColorPickerGradient();
				$gradient.uiColorPickerGradient('set_hsv', hsv);

				$gradient.on('input', function () {
					var hsv = $gradient.uiColorPickerGradient('get_hsv');
					var hex = Helper.hsvToHex(hsv.h, hsv.s, hsv.v);
					hexInput.value = hex;
					preview.style.background = hex;
					selectedColor = hex;
				});

				hexInput.addEventListener('input', function () {
					if (/^\#[0-9A-F]{6}$/gi.test(hexInput.value)) {
						var rgb = Helper.hexToRgb(hexInput.value);
						var hsv = Helper.rgbToHsv(rgb.r, rgb.g, rgb.b);
						$gradient.uiColorPickerGradient('set_hsv', hsv);
						preview.style.background = hexInput.value;
						selectedColor = hexInput.value;
					}
				});
			},
			on_finish: function () {
				if (/^\#[0-9A-F]{6}$/gi.test(selectedColor)) {
					config.COLOR_BG = selectedColor;
					_this.update_toolbar_swatches();
					_this.Helper.setCookie('color_bg', config.COLOR_BG);
					app.GUI.GUI_colors.render_selected_color();
				}
			},
		};
		popup.show(settings);
	}

	swap_colors() {
		var tmpColor = config.COLOR;
		var tmpAlpha = config.ALPHA;
		config.COLOR = config.COLOR_BG;
		config.ALPHA = config.ALPHA_BG;
		config.COLOR_BG = tmpColor;
		config.ALPHA_BG = tmpAlpha;
		this.update_toolbar_swatches();
		this.Helper.setCookie('color', config.COLOR);
		this.Helper.setCookie('color_bg', config.COLOR_BG);
		if (app.GUI && app.GUI.GUI_colors) {
			app.GUI.GUI_colors.render_selected_color();
		}
	}

	default_colors() {
		config.COLOR = '#000000';
		config.ALPHA = 255;
		config.COLOR_BG = '#ffffff';
		config.ALPHA_BG = 255;
		this.update_toolbar_swatches();
		this.Helper.setCookie('color', config.COLOR);
		this.Helper.setCookie('color_bg', config.COLOR_BG);
		if (app.GUI && app.GUI.GUI_colors) {
			app.GUI.GUI_colors.render_selected_color();
		}
	}

	update_toolbar_swatches() {
		var fgSwatch = document.getElementById('toolbar_fg_swatch');
		var bgSwatch = document.getElementById('toolbar_bg_swatch');
		if (fgSwatch) {
			fgSwatch.style.background = config.COLOR;
		}
		if (bgSwatch) {
			bgSwatch.style.background = config.COLOR_BG;
		}
		// Type Tool fill inherits foreground
		if (config.TOOL && config.TOOL.name === 'text' && this.tools_modules['text'] && this.tools_modules['text'].object
			&& typeof this.tools_modules['text'].object.sync_fill_from_foreground === 'function') {
			this.tools_modules['text'].object.sync_fill_from_foreground();
		}
	}

}

export default GUI_tools_class;
