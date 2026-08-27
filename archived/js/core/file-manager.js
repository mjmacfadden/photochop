import { bus } from './event-bus.js?v=5';
import { state } from './state.js?v=5';
import { Layer } from '../layers/layer.js?v=5';

export class FileManager {
  constructor() {
    this._setupMenuHandlers();
  }

  _setupMenuHandlers() {
    bus.on('menu:new', () => this.newDocument());
    bus.on('menu:open', () => this.openDocument());
    bus.on('menu:save', () => this.saveDocument());
    bus.on('menu:save-as', () => this.saveDocument(true));
    bus.on('menu:export-png', () => this.exportAs('png'));
    bus.on('menu:export-jpeg', () => this.exportAs('jpeg'));
    bus.on('menu:place-image', () => this.placeImage());
  }

  newDocument() {
    bus.emit('dialog:show', {
      title: 'New Document',
      fields: [
        { name: 'name', label: 'Name', type: 'text', value: 'Untitled' },
        { name: 'width', label: 'Width (px)', type: 'number', value: 1920, min: 1, max: 10000 },
        { name: 'height', label: 'Height (px)', type: 'number', value: 1080, min: 1, max: 10000 },
        { name: 'bg-color', label: 'Background Color', type: 'select', options: [
          { value: 'transparent', label: 'Transparent' },
          { value: 'white', label: 'White' },
          { value: 'black', label: 'Black' },
        ]},
      ],
      onConfirm: (data) => {
        const width = parseInt(data.width) || 1920;
        const height = parseInt(data.height) || 1080;
        this._createDocument(data.name || 'Untitled', width, height, data['bg-color']);
      }
    });
  }

  _createDocument(name, width, height, bgColor = 'transparent') {
    const doc = {
      name,
      width,
      height,
      layers: [],
    };

    const bgLayer = new Layer('Background', width, height);
    bgLayer.x = 0;
    bgLayer.y = 0;

    if (bgColor !== 'transparent') {
      const ctx = bgLayer.canvas.getContext('2d');
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    }

    doc.layers.push(bgLayer);

    state.set('document', doc);
    state.set('modified', false);
    state.set('documentName', name);

    bus.emit('document:created', doc);
    bus.emit('layer:added', bgLayer);
    bus.emit('status:update', `New document: ${width}x${height}`);
  }

  async openDocument() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.photochop,.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await this._loadDocument(data, file.name);
        bus.emit('status:update', `Opened: ${file.name}`);
      } catch (err) {
        console.error('Failed to open document:', err);
        bus.emit('status:update', 'Error opening file');
      }
    };
    input.click();
  }

  async _loadDocument(data, filename) {
    const doc = {
      name: data.name || filename.replace(/\.[^.]+$/, ''),
      width: data.width,
      height: data.height,
      layers: [],
    };

    for (const layerData of data.layers) {
      const layer = new Layer(layerData.name, doc.width, doc.height);
      layer.x = layerData.x || 0;
      layer.y = layerData.y || 0;
      layer.visible = layerData.visible !== false;
      layer.opacity = layerData.opacity ?? 100;
      layer.blendMode = layerData.blendMode || 'normal';

      if (layerData.imageData) {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = layerData.imageData;
        });
        layer.ctx.drawImage(img, 0, 0);
      }

      doc.layers.push(layer);
    }

    state.set('document', doc);
    state.set('modified', false);
    state.set('documentName', doc.name);

    bus.emit('document:loaded', doc);
  }

  async saveDocument(saveAs = false) {
    const doc = state.get('document');
    if (!doc) return;

    const data = {
      version: 1,
      name: doc.name,
      width: doc.width,
      height: doc.height,
      layers: [],
    };

    for (const layer of doc.layers) {
      const layerData = {
        name: layer.name,
        x: layer.x,
        y: layer.y,
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
      };

      if (layer.canvas) {
        layerData.imageData = layer.canvas.toDataURL('image/png');
      }

      data.layers.push(layerData);
    }

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const name = saveAs ? `${doc.name}.photochop` : `${doc.name}.photochop`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);

    state.set('modified', false);
    bus.emit('status:update', `Saved: ${name}`);
  }

  async exportAs(format) {
    const doc = state.get('document');
    if (!doc) return;

    const exportCanvas = window._renderer?.getExportCanvas();
    if (!exportCanvas) return;

    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpeg' ? 'jpg' : 'png';

    exportCanvas.toBlob((blob) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${doc.name}.${ext}`;
      link.click();
      URL.revokeObjectURL(link.href);
      bus.emit('status:update', `Exported as ${ext.toUpperCase()}`);
    }, mimeType, format === 'jpeg' ? 0.92 : undefined);
  }

  async placeImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        });

        const doc = state.get('document');
        if (!doc) {
          this._createDocument(file.name.replace(/\.[^.]+$/, ''), img.width, img.height, 'transparent');
          const newDoc = state.get('document');
          const layer = newDoc.layers[0];
          layer.name = file.name;
          layer.ctx.drawImage(img, 0, 0);
        } else {
          const layer = new Layer(file.name, doc.width, doc.height);
          layer.ctx.drawImage(img, 0, 0);
          doc.layers.push(layer);
          bus.emit('layer:added', layer);
        }

        bus.emit('status:update', `Placed: ${file.name}`);
      } catch (err) {
        console.error('Failed to place image:', err);
        bus.emit('status:update', 'Error placing image');
      }
    };
    input.click();
  }
}
