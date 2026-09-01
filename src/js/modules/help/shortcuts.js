import Dialog_class from './../../libs/popup.js';
import Helper_class from './../../libs/helpers.js';

class Help_shortcuts_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Helper = new Helper_class();
	}

	//shortcuts
	shortcuts() {
		const mod = this.Helper.is_mac() ? 'Cmd' : 'Ctrl';
		var settings = {
			title: 'Keyboard Shortcuts',
			className: 'shortcuts',
			params: [
				{title: "V", value: 'Move Tool'},
				{title: "B", value: 'Brush Tool'},
				{title: "E", value: 'Eraser Tool'},
				{title: "I", value: 'Eyedropper Tool'},
				{title: "G", value: 'Fill Tool'},
				{title: "T", value: 'Text Tool'},
				{title: "C", value: 'Crop Tool'},
				{title: "S", value: 'Clone Tool'},
				{title: "Alt / Option + Click", value: 'Sample Clone Source'},
				{title: "L", value: 'Blur Tool'},
				{title: "N", value: 'Pencil Tool'},
				{title: "M", value: 'Selection Tool'},
				{title: "U", value: 'Sharpen Tool'},
				{title: "J", value: 'Desaturate Tool'},
				{title: "O", value: 'Bulge/Pinch Tool'},
				{title: "A", value: 'Gradient Tool'},
				{title: "---", value: "Colors"},
				{title: "X", value: 'Swap Foreground/Background'},
				{title: "D", value: 'Default Colors (Black/White)'},
				{title: "---", value: "Brush Size / Hardness"},
				{title: "[ / ]", value: 'Decrease / Increase Brush Size'},
				{title: "Shift + [ / ]", value: 'Decrease / Increase Brush Hardness'},
				{title: "---", value: "General"},
				{title: `${mod} + O`, value: 'Open Image'},
				{title: `${mod} + W`, value: 'Close Document Tab'},
				{title: "Ctrl + Tab", value: 'Next Document Tab'},
				{title: `${mod} + S`, value: 'Export Image'},
				{title: `${mod} + Shift + S`, value: 'Save As'},
				{title: `${mod} + C`, value: 'Copy to Clipboard'},
				{title: `${mod} + V`, value: 'Paste from Clipboard'},
				{title: `${mod} + X`, value: 'Cut to Clipboard'},
				{title: `${mod} + A`, value: 'Select All'},
				{title: `${mod} + D`, value: 'Deselect'},
				{title: `${mod} + Z`, value: 'Undo'},
				{title: `${mod} + Shift + Z`, value: 'Redo'},
				{title: `${mod} + 0`, value: 'Fit Window'},
				{title: `${mod} + +/-`, value: 'Zoom In / Out'},
				{title: `${mod} + R`, value: 'Toggle Rulers'},
				{title: "Space (hold)", value: 'Pan Canvas (Hand Tool)'},
				{title: "F3 / F", value: 'Search / Auto Adjust'},
				{title: "F9 / F10", value: 'Quick Save / Quick Load'},
				{title: "Scroll wheel", value: 'Scroll Up / Down (Shift: Left / Right)'},
				{title: "Alt / Option + Scroll", value: 'Zoom In / Out'},
			],
		};
		this.POP.show(settings);
	}

}

export default Help_shortcuts_class;
