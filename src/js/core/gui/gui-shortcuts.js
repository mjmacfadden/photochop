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

}

export default GUI_shortcuts_class;
