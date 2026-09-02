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
		this.alt_eyedropper_tool = null;
		this._restore_eyedropper_pending = false;
		this.is_meta_down = false;
		this.is_ctrl_down = false;
		this.is_alt_down = false;
		this.is_shift_down = false;

		this.keymap = {
			'v': 'select',
			'b': 'brush',
			'e': 'erase',
			'i': 'pick_color',
			'g': 'fill',
			't': 'text',
			'c': 'crop',
			's': 'clone',
			'l': 'lasso',
			'n': 'pencil',
			'm': 'selection',
			'u': 'sharpen',
			'j': 'desaturate',
			'o': 'bulge_pinch',
			'a': 'gradient',
		};

		this.load();
		this.restore_logo_preference();
	}

	load() {
		// Prevent browser Alt/Option key from stealing focus / hiding cursor in Chromium
		const preventAltFocus = (event) => {
			if (event.key === 'Alt' || event.key === 'AltGraph' || event.code === 'AltLeft' || event.code === 'AltRight' || event.keyCode === 18) {
				event.preventDefault();
			}
		};
		window.addEventListener('keydown', preventAltFocus, { capture: true, passive: false });
		window.addEventListener('keyup', preventAltFocus, { capture: true, passive: false });

		const updateModifierState = (event, isDown) => {
			const key = event.key;
			const code = event.code;
			if (key === 'Meta' || key === 'Super' || key === 'OS' || code === 'MetaLeft' || code === 'MetaRight' || code === 'OSLeft' || code === 'OSRight') {
				this.is_meta_down = isDown;
			}
			if (key === 'Control' || code === 'ControlLeft' || code === 'ControlRight') {
				this.is_ctrl_down = isDown;
			}
			if (key === 'Alt' || key === 'AltGraph' || code === 'AltLeft' || code === 'AltRight' || event.keyCode === 18) {
				this.is_alt_down = isDown;
				if (config.TOOL && config.TOOL.name === 'clone' && app.GUI && app.GUI.GUI_tools) {
					const cloneTool = app.GUI.GUI_tools.tools_modules['clone']?.object;
					if (cloneTool && typeof cloneTool.update_cursor === 'function') {
						cloneTool.update_cursor(isDown);
					}
				}
				this.handle_alt_eyedropper(isDown, event);
			}
			if (key === 'Shift' || code === 'ShiftLeft' || code === 'ShiftRight' || event.keyCode === 16) {
				this.is_shift_down = isDown;
				if (app.GUI && app.GUI.GUI_tools && typeof app.GUI.GUI_tools.update_aspect_lock_ui === 'function') {
					app.GUI.GUI_tools.update_aspect_lock_ui(isDown);
				}
			}
		};
		window.addEventListener('keydown', (event) => updateModifierState(event, true), { capture: true, passive: true });
		window.addEventListener('keyup', (event) => updateModifierState(event, false), { capture: true, passive: true });
		window.addEventListener('pointerup', () => {
			if (this._restore_eyedropper_pending && this.alt_eyedropper_tool != null && app.GUI && app.GUI.GUI_tools) {
				const restoreTool = this.alt_eyedropper_tool;
				this.alt_eyedropper_tool = null;
				this._restore_eyedropper_pending = false;
				app.GUI.GUI_tools.activate_tool(restoreTool, { skip_history: true });
			}
		});
		window.addEventListener('blur', () => {
			this.is_meta_down = false;
			this.is_ctrl_down = false;
			this.is_alt_down = false;
			this.is_shift_down = false;
			if (app.GUI && app.GUI.GUI_tools && typeof app.GUI.GUI_tools.update_aspect_lock_ui === 'function') {
				app.GUI.GUI_tools.update_aspect_lock_ui(false);
			}
			if (this.alt_eyedropper_tool != null && app.GUI && app.GUI.GUI_tools) {
				const restoreTool = this.alt_eyedropper_tool;
				this.alt_eyedropper_tool = null;
				this._restore_eyedropper_pending = false;
				app.GUI.GUI_tools.activate_tool(restoreTool, { skip_history: true });
			}
		});

		document.addEventListener('keydown', (event) => {
			if (this.Helper.is_input(event.target)) return;

			// If Text Tool is active and a text layer is selected, disable tool keybindings
			const isTextToolActive = config.TOOL && config.TOOL.name === 'text';
			const isTextLayer = config.layer && config.layer.type === 'text';
			if (isTextToolActive && isTextLayer) {
				if (!event.ctrlKey && !event.metaKey) {
					const textTool = (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['text'])
						? app.GUI.GUI_tools.tools_modules['text'].object
						: null;
					if (textTool) {
						if (event.key === 'Escape') {
							event.preventDefault();
							event.stopImmediatePropagation();
							if (textTool.textarea) textTool.textarea.blur();
							if (app.GUI && app.GUI.GUI_tools) {
								app.GUI.GUI_tools.activate_tool('select');
							}
							return;
						}
						if (textTool.focus_textarea) {
							textTool.focus_textarea();
						} else if (textTool.textarea && document.activeElement !== textTool.textarea) {
							textTool.textarea.focus({ preventScroll: true });
						}
						// If textarea was not already focused when key was pressed, forward characters directly
						if (document.activeElement !== textTool.textarea) {
							const editor = textTool.get_editor(config.layer);
							if (editor) {
								if (event.key.length === 1 && !event.altKey) {
									editor.insert_text_at_current_position(event.key);
									textTool.Base_layers.render();
									textTool.extend_fixed_bounds(config.layer, editor);
									event.preventDefault();
								} else if (event.key === 'Backspace') {
									editor.delete_character_at_current_position(false);
									textTool.Base_layers.render();
									textTool.extend_fixed_bounds(config.layer, editor);
									event.preventDefault();
								} else if (event.key === 'Delete') {
									editor.delete_character_at_current_position(true);
									textTool.Base_layers.render();
									textTool.extend_fixed_bounds(config.layer, editor);
									event.preventDefault();
								} else if (event.key === 'Enter') {
									editor.insert_text_at_current_position('\n');
									textTool.Base_layers.render();
									textTool.extend_fixed_bounds(config.layer, editor);
									event.preventDefault();
								}
							}
						}
					}
					// Return early to ensure single-key tool shortcuts (B, V, E, C, etc.) are completely disabled!
					return;
				}
			}

			// Prevent browser Alt/Option key from stealing focus / hiding cursor
			if (event.key === 'Alt' || event.key === 'AltGraph' || event.code === 'AltLeft' || event.code === 'AltRight' || event.keyCode === 18) {
				event.preventDefault();
				return;
			}

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

			// Command/Super/Ctrl/Option/Alt + 4 = Toggle logo easter egg
			const hasCmdCtrlSuper = event.ctrlKey || event.metaKey || this.is_meta_down || this.is_ctrl_down
				|| (typeof event.getModifierState === 'function' && (
					event.getModifierState('Control')
					|| event.getModifierState('Meta')
					|| event.getModifierState('Super')
					|| event.getModifierState('Hyper')
					|| event.getModifierState('OS')
				));
			const hasAlt = event.altKey || this.is_alt_down
				|| (typeof event.getModifierState === 'function' && (
					event.getModifierState('Alt')
					|| event.getModifierState('AltGraph')
				));
			const isDigit4 = event.code === 'Digit4' || event.code === 'Numpad4'
				|| event.key === '4' || event.key === '¢' || event.key === '$' || event.key === '§' || event.key === '¼' || event.key === '¤'
				|| event.keyCode === 52 || event.keyCode === 100
				|| event.which === 52 || event.which === 100;

			if ((hasCmdCtrlSuper || hasAlt) && isDigit4) {
				event.preventDefault();
				event.stopImmediatePropagation();
				this.toggle_logo();
				return;
			}

			// Ctrl/Cmd + Shift + N = New Layer
			if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey
				&& (event.code === 'KeyN' || event.key === 'N' || event.key === 'n' || event.keyCode === 78)) {
				event.preventDefault();
				event.stopImmediatePropagation();
				app.State.do_action(
					new app.Actions.Insert_layer_action()
				);
				return;
			}

			// Ctrl/Cmd + N = File > New File
			if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey
				&& (event.code === 'KeyN' || event.key === 'N' || event.key === 'n' || event.keyCode === 78)) {
				event.preventDefault();
				event.stopImmediatePropagation();
				if (app.GUI && app.GUI.modules && app.GUI.modules['file/new']) {
					app.GUI.modules['file/new'].new();
				}
				return;
			}

			// Shift + N = New Layer (no modifiers besides Shift)
			if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
				&& (event.code === 'KeyN' || event.key === 'N' || event.key === 'n' || event.keyCode === 78)) {
				event.preventDefault();
				event.stopImmediatePropagation();
				app.State.do_action(
					new app.Actions.Insert_layer_action()
				);
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

			// Shift + [ / ] = Decrease/Increase brush hardness
			if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
				&& (event.code === 'BracketLeft' || event.code === 'BracketRight')) {
				event.preventDefault();
				event.stopImmediatePropagation();
				this.adjust_brush_hardness(event.code === 'BracketRight' ? 1 : -1);
				return;
			}

			// Alt/Option + Delete/Backspace = Fill with foreground color
			if (event.altKey && !event.ctrlKey && !event.metaKey
				&& (event.code === 'Delete' || event.code === 'Backspace' || event.key === 'Delete' || event.key === 'Backspace' || event.keyCode === 46 || event.keyCode === 8)) {
				event.preventDefault();
				event.stopImmediatePropagation();
				if (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['selection']) {
					app.GUI.GUI_tools.tools_modules['selection'].object.fill(config.COLOR || '#000000');
				}
				return;
			}

			// Ctrl/Cmd + Shift + V = Paste to Fit
			if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey
				&& event.code === 'KeyV') {
				event.preventDefault();
				event.stopImmediatePropagation();
				if (app.GUI && app.GUI.modules && app.GUI.modules['edit/paste']) {
					app.GUI.modules['edit/paste'].paste_to_fit();
				}
				return;
			}

			// Ctrl/Cmd + Delete/Backspace = Fill with background color
			if ((event.ctrlKey || event.metaKey) && !event.altKey
				&& (event.code === 'Delete' || event.code === 'Backspace' || event.key === 'Delete' || event.key === 'Backspace' || event.keyCode === 46 || event.keyCode === 8)) {
				event.preventDefault();
				event.stopImmediatePropagation();
				if (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['selection']) {
					app.GUI.GUI_tools.tools_modules['selection'].object.fill(config.COLOR_BG || '#ffffff');
				}
				return;
			}

			// Delete/Backspace = delete selected layer(s)
			// (Skip when marquee/lasso has an active selection — that clears pixels instead.)
			if (!event.ctrlKey && !event.metaKey && !event.altKey
				&& (event.code === 'Delete' || event.code === 'Backspace'
					|| event.key === 'Delete' || event.key === 'Backspace'
					|| event.keyCode === 46 || event.keyCode === 8)) {
				const selMod = app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules
					&& app.GUI.GUI_tools.tools_modules['selection'];
				const selTool = selMod && selMod.object;
				const hasMarquee = config.TOOL && config.TOOL.name === 'selection'
					&& selTool && selTool.Base_selection && selTool.Base_selection.has_selection;
				if (!hasMarquee) {
					event.preventDefault();
					event.stopImmediatePropagation();
					if (app.GUI && app.GUI.modules && app.GUI.modules['layer/delete']) {
						app.GUI.modules['layer/delete'].delete();
					}
					return;
				}
			}

			// Ctrl/Cmd + G = Group Layers; Ctrl/Cmd + Shift + G = Ungroup
			if ((event.ctrlKey || event.metaKey) && !event.altKey
				&& (event.code === 'KeyG' || event.key === 'G' || event.key === 'g' || event.keyCode === 71)) {
				event.preventDefault();
				event.stopImmediatePropagation();
				if (app.GUI && app.GUI.modules && app.GUI.modules['layer/group']) {
					if (event.shiftKey) {
						app.GUI.modules['layer/group'].ungroup();
					} else {
						app.GUI.modules['layer/group'].group_layers();
					}
				}
				return;
			}

			if (event.ctrlKey || event.metaKey || event.altKey) return;

			const key = event.key.toLowerCase();

			// X = Swap foreground/background colors
			if (key === 'x') {
				event.preventDefault();
				event.stopImmediatePropagation();
				if (app.GUI && app.GUI.GUI_tools) {
					app.GUI.GUI_tools.swap_colors();
				}
				return;
			}

			// D = Default colors (black foreground, white background)
			if (key === 'd') {
				event.preventDefault();
				event.stopImmediatePropagation();
				if (app.GUI && app.GUI.GUI_tools) {
					app.GUI.GUI_tools.default_colors();
				}
				return;
			}

			// Tool activation shortcuts
			if (this.keymap[key]) {
				event.preventDefault();
				event.stopImmediatePropagation();
				var targetTool = this.keymap[key];
				if (targetTool === 'lasso') {
					if (app.GUI && app.GUI.GUI_tools) {
						app.GUI.GUI_tools.update_tool_shape('selection', 'lasso');
					}
				} else if (targetTool === 'selection') {
					if (app.GUI && app.GUI.GUI_tools) {
						var selDef = null;
						for (var si in config.TOOLS) {
							if (config.TOOLS[si].name === 'selection') {
								selDef = config.TOOLS[si];
								break;
							}
						}
						var activeShape = (selDef && selDef.tool_group) ? selDef.tool_group.active_shape : 'rect';
						if (activeShape === 'lasso') {
							app.GUI.GUI_tools.update_tool_shape('selection', 'rect');
						} else {
							app.GUI.GUI_tools.activate_tool('selection');
						}
					}
				} else {
					app.GUI.GUI_tools.activate_tool(targetTool);
				}
			}

			// [ and ] = Decrease/Increase brush size
			if (key === '[' || key === ']') {
				event.preventDefault();
				event.stopImmediatePropagation();
				this.adjust_brush_size(key === ']' ? 1 : -1);
			}
		}, true);

		document.addEventListener('keyup', (event) => {
			if (event.key === 'Alt' || event.key === 'AltGraph' || event.code === 'AltLeft' || event.code === 'AltRight' || event.keyCode === 18) {
				event.preventDefault();
				return;
			}

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

	handle_alt_eyedropper(isDown, event) {
		if (!app.GUI || !app.GUI.GUI_tools) return;

		if (isDown) {
			if (event && (event.ctrlKey || event.metaKey)) return;
			if (this.Helper.is_input(document.activeElement)) return;
			if (app.GUI.POP && typeof app.GUI.POP.get_active_instances === 'function' && app.GUI.POP.get_active_instances() > 0) return;

			const currentTool = app.GUI.GUI_tools.active_tool;
			if (currentTool === 'brush' || currentTool === 'pencil') {
				if (this.alt_eyedropper_tool == null) {
					if (config.mouse && config.mouse.is_drag) return;
					this.alt_eyedropper_tool = currentTool;
					app.GUI.GUI_tools.activate_tool('pick_color', { skip_history: true });
				}
			}
		} else {
			if (this.alt_eyedropper_tool != null) {
				if (config.mouse && config.mouse.is_drag) {
					this._restore_eyedropper_pending = true;
				} else {
					const restoreTool = this.alt_eyedropper_tool;
					this.alt_eyedropper_tool = null;
					this._restore_eyedropper_pending = false;
					app.GUI.GUI_tools.activate_tool(restoreTool, { skip_history: true });
				}
			}
		}
	}

	toggle_logo() {
		var img = document.querySelector('.logo img, a.logo img');
		if (img == null) {
			return;
		}
		if (this.logo_omarchy) {
			//switch back to the original Vantage Point logo
			img.src = 'images/vantage_logo.png';
			img.alt = 'Vantage Point';
			var logoLink = document.querySelector('.logo');
			if (logoLink) logoLink.title = 'Vantage Point';
		}
		else {
			//easter egg: show the Omarchy logo
			img.src = 'images/omarchy-logo.png';
			img.alt = 'Omarchy';
			var logoLink = document.querySelector('.logo');
			if (logoLink) logoLink.title = 'Omarchy';
		}
		this.logo_omarchy = !this.logo_omarchy;
		this.save_logo_preference();
	}

	save_logo_preference() {
		try {
			localStorage.setItem('photochop_logo', this.logo_omarchy ? 'omarchy' : 'vantage');
		} catch (error) {
			//localStorage unavailable - ignore
		}
	}

	restore_logo_preference() {
		window.togglePhotoChopLogo = () => this.toggle_logo();
		window.PhotoChop_toggle_logo = () => this.toggle_logo();
		window.toggleVantageLogo = () => this.toggle_logo();
		window.toggleVantagePointLogo = () => this.toggle_logo();

		var saved = null;
		try {
			saved = localStorage.getItem('photochop_logo');
		} catch (error) {
			//localStorage unavailable - ignore
			saved = null;
		}

		var show_omarchy = (saved == 'omarchy');
		this.logo_omarchy = show_omarchy;

		var img = document.querySelector('.logo img, a.logo img');
		if (img != null) {
			if (show_omarchy) {
				img.src = 'images/omarchy-logo.png';
				img.alt = 'Omarchy';
				var logoLink = document.querySelector('.logo');
				if (logoLink) logoLink.title = 'Omarchy';
			} else {
				img.src = 'images/vantage_logo.png';
				img.alt = 'Vantage Point';
				var logoLink = document.querySelector('.logo');
				if (logoLink) logoLink.title = 'Vantage Point';
			}
			//reveal the logo (CSS keeps it hidden until the preference is applied,
			//so the default logo never flashes when Omarchy is selected)
			img.style.visibility = 'visible';
		}

		var logoAnchor = document.querySelector('.logo');
		if (logoAnchor && !logoAnchor._omarchy_click_bound) {
			logoAnchor._omarchy_click_bound = true;
			logoAnchor.addEventListener('click', (e) => {
				e.preventDefault();
				this.toggle_logo();
			});
		}
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
