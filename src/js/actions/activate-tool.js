import app from './../app.js';
import config from './../config.js';
import { Base_action } from './base.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

export class Activate_tool_action extends Base_action {
	/**
	 * Groups multiple actions together in the undo/redo history, runs them all at once.
	 */
	constructor(key, ignore_same_tool) {
		super('activate_tool', 'Activate Tool');
		this.ignore_same_tool = !!ignore_same_tool;
		this.key = key;
		this.old_key = null;
		this.tool_leave_actions = null;
		this.tool_activate_actions = null;
	}

	async do() {
		super.do();
		const key = this.key;
		this.old_key = app.GUI.GUI_tools.active_tool;

		if (this.key !== this.old_key || this.ignore_same_tool) {
			if (key !== 'pick_color' && app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.alt_eyedropper_tool && app.GUI.GUI_shortcuts.alt_eyedropper_tool !== key) {
				app.GUI.GUI_shortcuts.alt_eyedropper_tool = null;
				app.GUI.GUI_shortcuts._restore_eyedropper_pending = false;
			}

			var oldOwner = app.GUI.GUI_tools.get_button_id_for_tool(this.old_key);

			//reset last
			document.querySelector('#tools_container .' + oldOwner).classList.remove("active");

			//send exit event to old previous tool
			if (config.TOOL.on_leave != undefined) {
				var moduleKey = config.TOOL.name;
				var functionName = config.TOOL.on_leave;
				this.tool_leave_actions = app.GUI.GUI_tools.tools_modules[moduleKey].object[functionName]();
				if (this.tool_leave_actions) {
					for (let action of this.tool_leave_actions) {
						await action.do();
					}
				}
			}

			//change active
			app.GUI.GUI_tools.active_tool = key;
			var newOwner = app.GUI.GUI_tools.get_button_id_for_tool(key);
			document.querySelector('#tools_container .' + newOwner)
				.classList.add("active");
			for (let i in config.TOOLS) {
				if (config.TOOLS[i].name == app.GUI.GUI_tools.active_tool) {
					config.TOOL = config.TOOLS[i];
				}
			}
			//sync the toolbar group button when a member tool (e.g. pencil) activates
			app.GUI.GUI_tools.sync_group_button_for_tool(key);

			//check module
			if (app.GUI.GUI_tools.tools_modules[key] == undefined) {
				alertify.error('Tools class not found: ' + key);
				return;
			}

			//set default cursor
			const mainWrapper = document.getElementById('main_wrapper');
			const middleArea = document.querySelector('.middle_area');
			const brushTools = ['brush', 'pencil', 'erase', 'clone', 'blur', 'sharpen', 'desaturate', 'bulge_pinch'];
			const crosshairTools = ['selection', 'lasso', 'magic_wand', 'gradient', 'crop'];

			let defaultCursor = 'default';
			if (config.TOOL && brushTools.includes(config.TOOL.name)) {
				defaultCursor = 'none';
			} else if (config.TOOL && config.TOOL.name === 'text') {
				defaultCursor = 'text';
			} else if (config.TOOL && crosshairTools.includes(config.TOOL.name)) {
				defaultCursor = 'crosshair';
			} else if (config.TOOL && config.TOOL.name === 'pick_color') {
				defaultCursor = "url('images/icons/cursor-eyedropper.svg') 2 22, crosshair";
			}

			if (mainWrapper && mainWrapper.style.cursor != defaultCursor) {
				mainWrapper.style.cursor = defaultCursor;
			}
			// Toggle tool class on middle_area
			if (middleArea) {
				middleArea.className = 'middle_area';
				if (config.TOOL && config.TOOL.name) {
					middleArea.classList.add('tool-' + config.TOOL.name);
				}
			}
			// Toggle pan tool class on body (grab/grabbing cursor)
			document.body.classList.toggle('tool-pan', config.TOOL && config.TOOL.name === 'pan');

			app.GUI.GUI_tools.show_action_attributes();
			app.GUI.GUI_tools.Helper.setCookie('active_tool', app.GUI.GUI_tools.active_tool);

			// Show brush cursor immediately if switching to a brush tool
			if (brushTools.includes(config.TOOL.name)) {
				this.show_brush_cursor(config.TOOL.attributes.size);
			} else {
				this.hide_brush_cursor();
			}

			if (key === 'text') {
				const textTool = (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['text']) ? app.GUI.GUI_tools.tools_modules['text'].object : null;
				if (textTool) {
					if (typeof textTool.sync_fill_from_foreground === 'function') {
						textTool.sync_fill_from_foreground({ rebuild: true });
					}
					if (config.layer && config.layer.type === 'text' && textTool.focus_textarea) {
						textTool.focus_textarea();
					}
				}
			}
		}

		//send activate event to new tool
		if (config.TOOL.on_activate != undefined) {
			var moduleKey = config.TOOL.name;
			var functionName = config.TOOL.on_activate;
			this.tool_activate_actions = app.GUI.GUI_tools.tools_modules[moduleKey].object[functionName]();
			if (this.tool_activate_actions) {
				for (let action of this.tool_activate_actions) {
					await action.do();
				}
			}
		}

		config.need_render = true;
	}

	async undo() {
		super.undo();

		// Undo activate actions
		if (this.tool_activate_actions) {
			for (let action of this.tool_activate_actions) {
				await action.undo();
				action.free();
			}
			this.tool_activate_actions = null;
		}

		//reset last
		var oldOwner = app.GUI.GUI_tools.get_button_id_for_tool(this.key);
		document.querySelector('#tools_container .' + oldOwner)
			.classList.remove("active");

		//change active
		app.GUI.GUI_tools.active_tool = this.old_key;
		var newOwner = app.GUI.GUI_tools.get_button_id_for_tool(app.GUI.GUI_tools.active_tool);
		document.querySelector('#tools_container .' + newOwner)
			.classList.add("active");
		for (let i in config.TOOLS) {
			if (config.TOOLS[i].name == app.GUI.GUI_tools.active_tool) {
				config.TOOL = config.TOOLS[i];
			}
		}
		//sync the toolbar group button when returning to a member tool
		app.GUI.GUI_tools.sync_group_button_for_tool(app.GUI.GUI_tools.active_tool);

		app.GUI.GUI_tools.show_action_attributes();
		app.GUI.GUI_tools.Helper.setCookie('active_tool', app.GUI.GUI_tools.active_tool);

		//set default cursor
		const mainWrapper = document.getElementById('main_wrapper');
		const middleArea = document.querySelector('.middle_area');
		const brushTools = ['brush', 'pencil', 'erase', 'clone', 'blur', 'sharpen', 'desaturate', 'bulge_pinch'];
		const crosshairTools = ['selection', 'lasso', 'magic_wand', 'gradient', 'crop'];

		let defaultCursor = 'default';
		if (config.TOOL && brushTools.includes(config.TOOL.name)) {
			defaultCursor = 'none';
		} else if (config.TOOL && config.TOOL.name === 'text') {
			defaultCursor = 'text';
		} else if (config.TOOL && crosshairTools.includes(config.TOOL.name)) {
			defaultCursor = 'crosshair';
		} else if (config.TOOL && config.TOOL.name === 'pick_color') {
			defaultCursor = "url('images/icons/cursor-eyedropper.svg') 2 22, crosshair";
		}

		if (mainWrapper && mainWrapper.style.cursor != defaultCursor) {
			mainWrapper.style.cursor = defaultCursor;
		}
		// Toggle tool class on middle_area
		if (middleArea) {
			middleArea.className = 'middle_area';
			if (config.TOOL && config.TOOL.name) {
				middleArea.classList.add('tool-' + config.TOOL.name);
			}
		}
		// Toggle pan tool class on body (grab/grabbing cursor)
		document.body.classList.toggle('tool-pan', config.TOOL && config.TOOL.name === 'pan');

		// Show brush cursor immediately if switching to a brush tool
		if (brushTools.includes(config.TOOL.name)) {
			this.show_brush_cursor(config.TOOL.attributes.size);
		} else {
			this.hide_brush_cursor();
		}

		// Undo leave actions
		if (this.tool_leave_actions) {
			for (let action of this.tool_leave_actions) {
				await action.undo();
				action.free();
			}
			this.tool_leave_actions = null;
		}

		config.need_render = true;
	}

	free() {
		if (this.tool_activate_actions) {
			for (let action of this.tool_activate_actions) {
				action.free();
			}
			this.tool_activate_actions = null;
		}
		if (this.tool_leave_actions) {
			for (let action of this.tool_leave_actions) {
				action.free();
			}
			this.tool_leave_actions = null;
		}
	}

	show_brush_cursor(size) {
		const element = document.getElementById('mouse');
		const wrapper = document.getElementById('canvas_wrapper');
		if (!element || !wrapper || !size) return;
		const zoom = config.ZOOM || 1;
		const px = Math.max(size * zoom, 5);
		const wRect = wrapper.getBoundingClientRect();
		element.style.width = px + 'px';
		element.style.height = px + 'px';
		element.style.left = (wRect.width / 2 - px / 2) + 'px';
		element.style.top = (wRect.height / 2 - px / 2) + 'px';
		element.className = 'circle';
	}

	hide_brush_cursor() {
		const element = document.getElementById('mouse');
		if (element) {
			element.className = '';
		}
	}
}