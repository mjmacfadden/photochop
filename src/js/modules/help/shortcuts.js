import Dialog_class from './../../libs/popup.js';

class Help_shortcuts_class {

	constructor() {
		this.POP = new Dialog_class();
	}

	//shortcuts
	shortcuts() {
		var settings = {
			title: 'Keyboard Shortcuts',
			className: 'shortcuts',
			params: [
				{title: "V", value: 'Select / Move Tool'},
				{title: "B", value: 'Brush Tool'},
				{title: "E", value: 'Eraser Tool'},
				{title: "I", value: 'Eyedropper Tool'},
				{title: "G", value: 'Fill Tool'},
				{title: "T", value: 'Text Tool'},
				{title: "C", value: 'Crop Tool'},
				{title: "S", value: 'Clone Tool'},
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
				{title: "---", value: "General"},
				{title: "F", value: 'Auto Adjust Colors'},
				{title: "F3 / &#8984; + F", value: 'Search'},
				{title: "Ctrl + C", value: 'Copy to Clipboard'},
				{title: "H", value: 'Shapes'},
				{title: "CTRL + V", value: 'Paste'},
				{title: "F10", value: 'Quick Load'},
				{title: "F9", value: 'Quick Save'},
				{title: "CTRL + A", value: 'Select All'},
				{title: "CTRL + Z", value: 'Undo'},
				{title: "Scroll up", value: 'Zoom in'},
				{title: "Scroll down", value: 'Zoom out'},
			],
		};
		this.POP.show(settings);
	}

}

export default Help_shortcuts_class;
