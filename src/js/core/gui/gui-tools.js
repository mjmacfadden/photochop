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
			if (item.name == this.active_tool) {
				itemDom.className = 'item trn active ' + item.name;
			}
			else {
				itemDom.className = 'item trn ' + item.name;
			}
			if(item.visible === false){
				itemDom.style.display = 'none';
			}

			//event
			itemDom.addEventListener('click', function (event) {
				_this.activate_tool(this.id);
			});

			//register
			document.getElementById(target_id).appendChild(itemDom);
		}

		this.show_action_attributes();
		new app.Actions.Activate_tool_action(this.active_tool, true).do();
		this.Base_gui.check_canvas_offset();
	}

	async activate_tool(key) {
		return app.State.do_action(
			new app.Actions.Activate_tool_action(key)
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
				}

				var elementTitle = document.createElement('label');
				elementTitle.innerHTML = title + ':';
				elementTitle.id = 'attribute_label_' + k;
				elementTitle.className = 'trn';

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
			else if (typeof item == 'object') {
				//select

				var elementTitle = document.createElement('label');
				elementTitle.innerHTML = title + ':';
				elementTitle.for = k;
				elementTitle.className = 'trn';

				var selectList = document.createElement("select");
				selectList.id = k;
				const values = typeof item.values === 'function' ? item.values() : item.values;
				for (let j in values) {
					var option = document.createElement("option");
					if (item.value == values[j]) {
						option.selected = 'selected';
					}
					option.className = 'trn';
					option.name = values[j];
					option.value = values[j];
					option.text = values[j];
					selectList.appendChild(option);
				}
				//event
				selectList.addEventListener('change', (event) => {
					const actionData = this.action_data();
					actionData.attributes[event.target.id].value = event.target.value;

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
			else {
				alertify.error('Error: unsupported attribute type:' + typeof item + ', ' + k);
			}
		}

		if (config.LANG != 'en') {
			//retranslate
			this.Tools_translate.translate(config.LANG);
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

		innerDiv.appendChild(bgSwatch);
		innerDiv.appendChild(fgSwatch);

		var buttonsDiv = document.createElement('div');
		buttonsDiv.className = 'toolbar-color-buttons';

		var swapBtn = document.createElement('button');
		swapBtn.id = 'toolbar_swap_colors';
		swapBtn.className = 'toolbar-color-btn';
		swapBtn.title = 'Swap Colors (X)';
		swapBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M11 1.5v1H3.5l2.3-2.3-.7-.7L1.5 2l3.6 3.6.7-.7L3.5 2.5H11V1.5zM5 14.5v-1h7.5l-2.3 2.3.7.7L14.5 14l-3.6-3.6-.7.7L11.5 12.5H5v1z"/></svg>';

		var defaultBtn = document.createElement('button');
		defaultBtn.id = 'toolbar_default_colors';
		defaultBtn.className = 'toolbar-color-btn';
		defaultBtn.title = 'Default Colors (D)';
		defaultBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" fill="#000" stroke="#888" stroke-width="1"/><rect x="5" y="5" width="6" height="6" fill="#fff" stroke="#888" stroke-width="1"/></svg>';

		buttonsDiv.appendChild(swapBtn);
		buttonsDiv.appendChild(defaultBtn);

		swatchesDiv.appendChild(innerDiv);
		swatchesDiv.appendChild(buttonsDiv);
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
		defaultBtn.addEventListener('click', function () {
			_this.default_colors();
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
	}

	default_colors() {
		config.COLOR = '#000000';
		config.ALPHA = 255;
		config.COLOR_BG = '#ffffff';
		config.ALPHA_BG = 255;
		this.update_toolbar_swatches();
		this.Helper.setCookie('color', config.COLOR);
		this.Helper.setCookie('color_bg', config.COLOR_BG);
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
	}

}

export default GUI_tools_class;
