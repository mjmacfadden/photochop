/*
 * Keyboard shortcuts for tool activation (Photoshop-style).
 * Uses capture phase to fire before existing module handlers,
 * blocking conflicting shortcuts with stopImmediatePropagation.
 */

import app from './../../app.js';
import config from './../../config.js';
import Helper_class from './../../libs/helpers.js';
import View_ruler_class from './../../modules/view/ruler.js';

class GUI_shortcuts_class {

	constructor() {
		this.Helper = new Helper_class();
		this.space_pan_tool = null;

		this.keymap = {
			'v': 'select',
			'b': 'brush',
			'e': 'erase',
			'i': 'pick_color',
			'g': 'fill',
			't': 'text',
			'c': 'crop',
			's': 'clone',
			'l': 'blur',
			'n': 'pencil',
			'm': 'selection',
			'u': 'sharpen',
			'j': 'desaturate',
			'o': 'bulge_pinch',
			'a': 'gradient',
		};

		this.load();
	}

	load() {
		document.addEventListener('keydown', (event) => {
			if (this.Helper.is_input(event.target)) return;

			// Ctrl/Cmd + 0 = Fit window
			if ((event.ctrlKey || event.metaKey) && !event.altKey
				&& (event.code === 'Digit0' || event.code === 'Numpad0')) {
				event.preventDefault();
				event.stopImmediatePropagation();
				if (app.GUI && app.GUI.GUI_preview) {
					app.GUI.GUI_preview.zoom_auto();
				}
				return;
			}

			// Ctrl/Cmd + +/- = Zoom in/out
			if ((event.ctrlKey || event.metaKey) && !event.altKey
				&& (event.code === 'Equal' || event.code === 'Minus'
					|| event.code === 'NumpadAdd' || event.code === 'NumpadSubtract')) {
				event.preventDefault();
				event.stopImmediatePropagation();
				if (app.GUI && app.GUI.GUI_preview) {
					const isIn = event.code === 'Equal' || event.code === 'NumpadAdd';
					app.GUI.GUI_preview.zoom(isIn ? 1 : -1);
				}
				return;
			}

			// Ctrl/Cmd + R = Toggle rulers
			if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyR') {
				event.preventDefault();
				event.stopImmediatePropagation();
				try {
					new View_ruler_class().ruler();
				}
				catch (err) {
					//ruler not initialized yet
				}
				return;
			}

			// Space = temporary pan (hand) tool
			if (event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.altKey) {
				event.preventDefault();
				event.stopImmediatePropagation();
				if (this.space_pan_tool == null) {
					this.space_pan_tool = app.GUI.GUI_tools.active_tool;
					app.GUI.GUI_tools.activate_tool('pan');
				}
				return;
			}

			// Ctrl/Cmd + Shift + [ / ] = Decrease/Increase brush hardness
			if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey
				&& (event.code === 'BracketLeft' || event.code === 'BracketRight')) {
				event.preventDefault();
				event.stopImmediatePropagation();
				this.adjust_brush_hardness(event.code === 'BracketRight' ? 1 : -1);
				return;
			}

			if (event.ctrlKey || event.metaKey || event.altKey) return;

			const key = event.key.toLowerCase();

			// X = Swap foreground/background colors
			if (key === 'x') {
				event.preventDefault();
				event.stopImmediatePropagation();
				var tmpColor = config.COLOR;
				var tmpAlpha = config.ALPHA;
				config.COLOR = config.COLOR_BG;
				config.ALPHA = config.ALPHA_BG;
				config.COLOR_BG = tmpColor;
				config.ALPHA_BG = tmpAlpha;
				this.Helper.setCookie('color', config.COLOR);
				this.Helper.setCookie('color_bg', config.COLOR_BG);
				app.GUI.GUI_colors.render_selected_color();
				app.GUI.GUI_tools.update_toolbar_swatches();
				return;
			}

			// D = Default colors (black foreground, white background)
			if (key === 'd') {
				event.preventDefault();
				event.stopImmediatePropagation();
				config.COLOR = '#000000';
				config.ALPHA = 255;
				config.COLOR_BG = '#ffffff';
				config.ALPHA_BG = 255;
				this.Helper.setCookie('color', config.COLOR);
				this.Helper.setCookie('color_bg', config.COLOR_BG);
				app.GUI.GUI_colors.render_selected_color();
				app.GUI.GUI_tools.update_toolbar_swatches();
				return;
			}

			// Tool activation shortcuts
			if (this.keymap[key]) {
				event.preventDefault();
				event.stopImmediatePropagation();
				app.GUI.GUI_tools.activate_tool(this.keymap[key]);
			}

			// [ and ] = Decrease/Increase brush size
			if (key === '[' || key === ']') {
				event.preventDefault();
				event.stopImmediatePropagation();
				this.adjust_brush_size(key === ']' ? 1 : -1);
			}
		}, true);

		document.addEventListener('keyup', (event) => {
			if (event.code !== 'Space' || this.space_pan_tool == null) {
				return;
			}

			//end any in-progress pan drag before restoring the previous tool
			var pan_tool = app.GUI.GUI_tools.tools_modules['pan'].object;
			if (pan_tool && pan_tool.is_drag) {
				pan_tool.mouseup();
			}
			var restore_tool = this.space_pan_tool;
			this.space_pan_tool = null;
			event.preventDefault();
			event.stopImmediatePropagation();
			app.GUI.GUI_tools.activate_tool(restore_tool);
		}, true);
	}

	adjust_brush_size(delta) {
		if (!config.TOOL || !config.TOOL.attributes) return;
		if (config.TOOL.attributes.size == null) return;

		const oldSize = config.TOOL.attributes.size;
		const newSize = Math.max(1, Math.min(999, oldSize + delta));
		if (newSize === oldSize) return;

		config.TOOL.attributes.size = newSize;

		// Update the UI input if it exists
		const sizeInput = document.querySelector('#size');
		if (sizeInput && sizeInput.closest) {
			const $input = $(sizeInput);
			if ($input.uiNumberInput) {
				$input.uiNumberInput('set_value', newSize);
			}
		}

		// Immediately update the brush cursor on screen
		var mouseEl = document.getElementById('mouse');
		if (mouseEl && mouseEl.classList.contains('circle')) {
			var curW = parseFloat(mouseEl.style.width) || 0;
			var zoomedSize = newSize * config.ZOOM;
			var left = parseFloat(mouseEl.style.left) || 0;
			var top = parseFloat(mouseEl.style.top) || 0;
			mouseEl.style.width = zoomedSize + 'px';
			mouseEl.style.height = zoomedSize + 'px';
			mouseEl.style.left = (left + (curW - zoomedSize) / 2) + 'px';
			mouseEl.style.top = (top + (curW - zoomedSize) / 2) + 'px';
		}
	}

	adjust_brush_hardness(delta) {
		if (!config.TOOL || !config.TOOL.attributes) return;
		if (config.TOOL.attributes.hardness == null) return;

		const attr = config.TOOL.attributes.hardness;
		const oldValue = (typeof attr === 'object' && attr.value != null) ? attr.value : attr;
		if (oldValue == null) return;

		const newValue = Math.max(0, Math.min(100, oldValue + delta));
		if (newValue === oldValue) return;

		if (typeof attr === 'object') {
			attr.value = newValue;
		} else {
			config.TOOL.attributes.hardness = newValue;
		}

		// Update the slider and value label if present
		const hardnessItem = document.querySelector('.attributes .item.hardness');
		if (hardnessItem) {
			const slider = hardnessItem.querySelector('.ui_range');
			if (slider) {
				$(slider).uiRange('set_value', newValue);
			}
const valueLabel = hardnessItem.querySelector('.slider_value');
		if (valueLabel) {
			valueLabel.value = String(newValue);
			valueLabel.innerHTML = String(newValue);
		}
		}
	}

}

export default GUI_shortcuts_class;
