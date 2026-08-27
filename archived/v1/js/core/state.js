import { bus } from './event-bus.js?v=5';

class State {
  constructor() {
    this._state = {
      document: null,
      activeTool: 'move',
      zoom: 1,
      panX: 0,
      panY: 0,
      foregroundColor: '#000000',
      backgroundColor: '#ffffff',
      brushSize: 10,
      brushOpacity: 100,
      modified: false,
      documentName: 'Untitled',
      snapToGrid: false,
      gridSize: 10,
      showGrid: false,
    };
  }

  get(key) {
    return this._state[key];
  }

  set(key, value) {
    const old = this._state[key];
    this._state[key] = value;
    if (old !== value) {
      bus.emit('state:change', { key, value, old });
      bus.emit(`state:${key}`, { value, old });
    }
  }

  getAll() {
    return { ...this._state };
  }
}

export const state = new State();
