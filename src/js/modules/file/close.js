import app from './../../app.js';

class File_close_class {

	close() {
		if (app.Documents) {
			app.Documents.close_document();
		}
	}

}

export default File_close_class;
