export class ToolBase {
  constructor(id, renderer) {
    this.id = id;
    this.renderer = renderer;
  }

  activate() {}
  deactivate() {}
  onMouseDown(e, pos) {}
  onMouseMove(e, pos) {}
  onMouseUp(e, pos) {}
  onDoubleClick(e, pos) {}
  onKeyDown(e) {}
  onKeyUp(e) {}
}
