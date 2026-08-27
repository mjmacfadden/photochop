import { bus } from '../core/event-bus.js?v=5';
import { state } from '../core/state.js?v=5';
import { Layer } from './layer.js?v=5';

export class LayerManager {
  constructor() {
    this._setupListeners();
  }

  _setupListeners() {
    bus.on('layer:new', () => this.addLayer());
    bus.on('layer:duplicate', () => this.duplicateLayer());
    bus.on('layer:delete', () => this.deleteLayer());
    bus.on('layer:move-up', () => this.moveLayerUp());
    bus.on('layer:move-down', () => this.moveLayerDown());
    bus.on('menu:canvas-size', () => this.changeCanvasSize());
    bus.on('menu:flatten', () => this.flatten());
  }

  addLayer() {
    const doc = state.get('document');
    if (!doc) return;

    const layer = new Layer('Layer ' + (doc.layers.length + 1), doc.width, doc.height);
    doc.layers.push(layer);
    state.set('activeLayer', layer);
    state.set('modified', true);
    bus.emit('layer:added', layer);
    bus.emit('status:update', `Layer added: ${layer.name}`);
    return layer;
  }

  duplicateLayer() {
    const doc = state.get('document');
    if (!doc) return;

    const active = state.get('activeLayer') || doc.layers[doc.layers.length - 1];
    if (!active) return;

    const dup = active.clone();
    const idx = doc.layers.indexOf(active);
    doc.layers.splice(idx + 1, 0, dup);
    state.set('activeLayer', dup);
    state.set('modified', true);
    bus.emit('layer:added', dup);
    bus.emit('status:update', `Duplicated: ${active.name}`);
  }

  deleteLayer() {
    const doc = state.get('document');
    if (!doc || doc.layers.length <= 1) return;

    const active = state.get('activeLayer') || doc.layers[doc.layers.length - 1];
    const idx = doc.layers.indexOf(active);
    if (idx === -1) return;

    doc.layers.splice(idx, 1);
    state.set('activeLayer', doc.layers[Math.min(idx, doc.layers.length - 1)]);
    state.set('modified', true);
    bus.emit('layer:removed', active);
    bus.emit('status:update', `Deleted: ${active.name}`);
  }

  moveLayerUp() {
    const doc = state.get('document');
    if (!doc) return;

    const active = state.get('activeLayer') || doc.layers[doc.layers.length - 1];
    const idx = doc.layers.indexOf(active);
    if (idx < doc.layers.length - 1) {
      [doc.layers[idx], doc.layers[idx + 1]] = [doc.layers[idx + 1], doc.layers[idx]];
      state.set('modified', true);
      bus.emit('layer:reordered');
    }
  }

  moveLayerDown() {
    const doc = state.get('document');
    if (!doc) return;

    const active = state.get('activeLayer') || doc.layers[doc.layers.length - 1];
    const idx = doc.layers.indexOf(active);
    if (idx > 0) {
      [doc.layers[idx], doc.layers[idx - 1]] = [doc.layers[idx - 1], doc.layers[idx]];
      state.set('modified', true);
      bus.emit('layer:reordered');
    }
  }

  changeCanvasSize() {
    const doc = state.get('document');
    if (!doc) return;

    bus.emit('dialog:show', {
      title: 'Canvas Size',
      fields: [
        { name: 'width', label: 'Width (px)', type: 'number', value: doc.width, min: 1, max: 10000 },
        { name: 'height', label: 'Height (px)', type: 'number', value: doc.height, min: 1, max: 10000 },
      ],
      onConfirm: (data) => {
        const w = parseInt(data.width) || doc.width;
        const h = parseInt(data.height) || doc.height;
        for (const layer of doc.layers) {
          layer.resize(w, h);
        }
        doc.width = w;
        doc.height = h;
        bus.emit('document:resized', { width: w, height: h });
        bus.emit('status:update', `Canvas resized to ${w}x${h}`);
      }
    });
  }

  flatten() {
    const doc = state.get('document');
    if (!doc || doc.layers.length <= 1) return;

    const flat = new Layer('Background', doc.width, doc.height);
    const ctx = flat.canvas.getContext('2d');

    for (const layer of doc.layers) {
      if (!layer.visible) continue;
      ctx.globalAlpha = layer.opacity / 100;
      ctx.drawImage(layer.canvas, layer.x, layer.y);
    }

    doc.layers = [flat];
    state.set('activeLayer', flat);
    state.set('modified', true);
    bus.emit('layer:reordered');
    bus.emit('status:update', 'Image flattened');
  }
}
