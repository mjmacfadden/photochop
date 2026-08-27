import { ToolBase } from './tool-base.js?v=5';
import { bus } from '../core/event-bus.js?v=5';
import { state } from '../core/state.js?v=5';

export class MoveTool extends ToolBase {
  constructor(renderer) {
    super('move', renderer);
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.layerStartX = 0;
    this.layerStartY = 0;
  }

  onMouseDown(e, pos) {
    const doc = state.get('document');
    if (!doc) return;

    const layer = state.get('activeLayer') || doc.layers[doc.layers.length - 1];
    if (!layer) return;

    this.isDragging = true;
    this.startX = pos.x;
    this.startY = pos.y;
    this.layerStartX = layer.x;
    this.layerStartY = layer.y;
    this.currentLayer = layer;
  }

  onMouseMove(e, pos) {
    if (!this.isDragging || !this.currentLayer) return;

    const dx = pos.x - this.startX;
    const dy = pos.y - this.startY;

    this.currentLayer.x = Math.round(this.layerStartX + dx);
    this.currentLayer.y = Math.round(this.layerStartY + dy);

    bus.emit('layer:modified', this.currentLayer);
  }

  onMouseUp(e, pos) {
    if (this.isDragging && this.currentLayer) {
      state.set('modified', true);
    }
    this.isDragging = false;
    this.currentLayer = null;
  }
}
