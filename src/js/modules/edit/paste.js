import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

class Edit_paste_class {

	paste() {
		if (config._internal_clipboard != null) {
			this.paste_internal();
			return;
		}
		alertify.error('Use Ctrl+V to paste from the clipboard.');
	}

	paste_internal() {
		var clip = config._internal_clipboard;
		if (clip == null || clip.data_url == null) {
			alertify.error('Nothing to paste.');
			return;
		}

		app.State.do_action(
			new app.Actions.Insert_layer_action({
				name: 'Paste',
				type: 'image',
				data: clip.data_url,
				x: clip.x || 0,
				y: clip.y || 0,
				width: clip.width,
				height: clip.height,
				width_original: clip.width,
				height_original: clip.height,
			}, false)
		);
		// Offset slightly for consecutive pastes
		clip.x = (clip.x || 0) + 10;
		clip.y = (clip.y || 0) + 10;
	}
}

export default Edit_paste_class;
