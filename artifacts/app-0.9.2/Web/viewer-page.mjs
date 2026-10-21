// Coordinates on the live viewer page. PDFium geometry already includes the
// permanent page rotation; only the viewer's temporary rotation is undone here.
export function pagePoint(event, host, geometry, rotation = 0) {
  const rect = host.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  const [u, v] = [[x, y], [y, 1 - x], [1 - x, 1 - y], [1 - y, x]][rotation & 3];
  return [Math.max(0, Math.min(geometry.width, u * geometry.width)),
    Math.max(0, Math.min(geometry.height, v * geometry.height))];
}

// The pinned viewer renders an exclusive interaction layer directly inside
// each page pointer host. Discover those hosts before a first mouse entry, so
// dropdown selection and keyboard style changes can show a preview at once.
export function renderedPageHosts(viewer) {
  const result = [];
  const visit = root => {
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) visit(element.shadowRoot);
      if (element.style?.position !== 'absolute' || element.style.zIndex !== '10' || element.children.length) continue;
      if (['top', 'left', 'right', 'bottom'].every(side => ['0px', '0'].includes(element.style[side]))) result.push(element.parentElement);
    }
  };
  visit(viewer); return result;
}

export class ViewerPagePreview {
  constructor(canvas, rotation) {
    this.canvas = canvas; this.rotation = rotation;
    this.shell = document.querySelector('#viewer-shell');
    this.layer = canvas.parentElement;
  }
  attach(host, geometry) {
    this.host = host; this.geometry = geometry; this.clips = [];
    for (let parent = host.parentElement; parent; parent = parent.parentElement ?? parent.getRootNode().host) {
      const style = getComputedStyle(parent);
      const x = /hidden|auto|scroll|clip/.test(style.overflowX), y = /hidden|auto|scroll|clip/.test(style.overflowY);
      if (x || y) this.clips.push({ parent, x, y });
      if (parent === this.shell) break;
    }
    this.layout();
  }
  layout() {
    cancelAnimationFrame(this.frame);
    if (!this.host?.isConnected || !this.geometry) { this.canvas.hidden = true; return; }
    this.canvas.hidden = false;
    const rect = this.host.getBoundingClientRect(), shell = this.shell.getBoundingClientRect();
    let left = shell.left, right = shell.right, top = shell.top, bottom = shell.bottom;
    for (const clip of this.clips) {
      const bounds = clip.parent.getBoundingClientRect();
      if (clip.x) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
      if (clip.y) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
    }
    this.layer.style.clipPath = `inset(${Math.max(0, top - shell.top)}px ${Math.max(0, shell.right - right)}px ${Math.max(0, shell.bottom - bottom)}px ${Math.max(0, left - shell.left)}px)`;
    const { width: w, height: h } = this.geometry, r = this.rotation() & 3;
    const s = rect.width / (r % 2 ? h : w);
    const matrices = [[s, 0, 0, s, 0, 0], [0, s, -s, 0, h * s, 0],
      [-s, 0, 0, -s, w * s, h * s], [0, -s, s, 0, 0, w * s]];
    Object.assign(this.canvas.style, { left: `${rect.left - shell.left}px`, top: `${rect.top - shell.top}px`,
      width: `${w}px`, height: `${h}px`, transform: `matrix(${matrices[r].join(',')})` });
    this.frame = requestAnimationFrame(() => this.layout());
  }
  clear() { cancelAnimationFrame(this.frame); this.host = null; this.canvas.hidden = true; }
}
