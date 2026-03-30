import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, NgZone, PLATFORM_ID, inject, } from '@angular/core';

interface NodeData {
  type: string;
  x: number;
  y: number;
}

interface SavedDiagram {
  nodes: NodeData[];
  connections: { sourceUuid: string; targetUuid: string }[];
}

@Component({
  selector: 'app-canvas',
  imports: [CommonModule],
  templateUrl: './canvas.html',
  styleUrl: './canvas.css',
})
export class Canvas implements AfterViewInit {
  private platformId = inject(PLATFORM_ID);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);

  nodes: NodeData[] = [];
  private instance: any;

  private instanceReady!: Promise<void>;
  private resolveInstance!: () => void;

  constructor() {
    this.instanceReady = new Promise((res) => (this.resolveInstance = res));
  }

  async ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    await new Promise<void>((resolve) => {
      this.zone.runOutsideAngular(async () => {
        const { jsPlumb } = await import('jsplumb');
        const canvasEl = document.getElementById('canvas') as HTMLElement;

        this.instance = jsPlumb.getInstance({
          Container: canvasEl,
          Connector: ['Bezier', { curviness: 50 }],
          PaintStyle: { stroke: '#6c757d', strokeWidth: 2 },
          HoverPaintStyle: { stroke: '#0d6efd', strokeWidth: 3 },
          ConnectionOverlays: [
            ['Arrow', { location: 1, width: 12, length: 12, foldback: 0.8, id: 'arrow' }],
          ],
        });

        this.resolveInstance();
        resolve();
      });
    });
  }

  async addNode(type: string) {
    await this.instanceReady;

    const index = this.nodes.length;
    this.nodes.push({
      type,
      x: 100 + Math.random() * 380,
      y: 80 + Math.random() * 280,
    });

    this.cdr.detectChanges();

    this.zone.runOutsideAngular(() => {
      this._registerNode(index);
    });
  }

  private _registerNode(index: number) {
    const nodeId = 'node-' + index;
    const el = document.getElementById(nodeId) as HTMLElement;
    if (!el) return;

    this.instance.draggable(el, {
      containment: true,
      grid: [1, 1],
      stop: (event: any) => {
        const style = el.style;
        const left = parseInt(style.left, 10);
        const top = parseInt(style.top, 10);

        this.nodes[index].x = left;
        this.nodes[index].y = top;
      },
    });

    // Green dot — source
    this.instance.addEndpoint(el, {
      uuid: nodeId + '-source',
      anchor: 'Right',
      isSource: true,
      isTarget: false,
      maxConnections: -1,
      paintStyle: { fill: '#198754', stroke: '#fff', strokeWidth: 2, radius: 7 },
      hoverPaintStyle: { fill: '#0f5132', stroke: '#fff', strokeWidth: 2, radius: 9 },
      connectorStyle: { stroke: '#6c757d', strokeWidth: 2 },
      connectorHoverStyle: { stroke: '#0d6efd', strokeWidth: 3 },
    });

    // Red dot — target
    this.instance.addEndpoint(el, {
      uuid: nodeId + '-target',
      anchor: 'Left',
      isSource: false,
      isTarget: true,
      maxConnections: -1,
      paintStyle: { fill: '#dc3545', stroke: '#fff', strokeWidth: 2, radius: 7 },
      hoverPaintStyle: { fill: '#842029', stroke: '#fff', strokeWidth: 2, radius: 9 },
    });
  }

  deleteAllConnections() {
    if (this.instance) this.instance.deleteEveryConnection();
  }

  // ------ Save ----------

  saveDiagram() {
    if (!this.instance) return;

    const nodesData: NodeData[] = this.nodes.map((node, i) => {
      const el = document.getElementById('node-' + i);
      const x = el ? parseInt(el.style.left, 10) : node.x;
      const y = el ? parseInt(el.style.top, 10) : node.y;
      return { type: node.type, x, y };
    });

    // Save by endpoint UUID so reconnection is exact
    const connections = this.instance.getAllConnections().map((conn: any) => ({
      sourceUuid: conn.endpoints[0].getUuid(),
      targetUuid: conn.endpoints[1].getUuid(),
    }));

    const diagram: SavedDiagram = { nodes: nodesData, connections };
    localStorage.setItem('diagram', JSON.stringify(diagram));
    console.log('Diagram saved:', diagram);
    alert('Diagram saved');
  }

  // ------ Load ---------

  async loadDiagram() {
    await this.instanceReady;

    const raw = localStorage.getItem('diagram');
    if (!raw) { alert('No saved diagram found.'); return; }

    const diagram: SavedDiagram = JSON.parse(raw);

    // Wipe existing state cleanly
    this.instance.deleteEveryConnection();
    this.instance.deleteEveryEndpoint();
    this.nodes = [];
    this.cdr.detectChanges();

    // Restore nodes with saved positions
    diagram.nodes.forEach((n) =>
      this.nodes.push({ type: n.type, x: n.x, y: n.y })
    );
    this.cdr.detectChanges();

    // Wait one tick for Angular to render the node divs
    await new Promise((r) => setTimeout(r, 0));

    this.zone.runOutsideAngular(() => {
      // Re-register drag + endpoints for every loaded node
      this.nodes.forEach((_, i) => this._registerNode(i));

      // Reconnect using endpoint UUIDs, guaranteed to match
      diagram.connections.forEach((conn) => {
        this.instance.connect({
          uuids: [conn.sourceUuid, conn.targetUuid],
        });
      });
    });
  }

  async downloadAsImage() {
    if (!this.instance) return;
  
    this.instance.setSuspendDrawing(false, true);
    this.instance.repaintEverything();
    await new Promise(r => setTimeout(r, 100));
  
    const canvasEl = document.getElementById('canvas') as HTMLElement;
    const W = canvasEl.offsetWidth;
    const H = canvasEl.offsetHeight;
    const SCALE = 2;
  
    const out = document.createElement('canvas');
    out.width  = W * SCALE;
    out.height = H * SCALE;
    const ctx  = out.getContext('2d')!;
    ctx.scale(SCALE, SCALE);
  
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
  
    const connections: any[] = this.instance.getAllConnections();
  
    for (const conn of connections) {
      const pathEl: SVGPathElement | null =
        conn.canvas?.querySelector('path') ??
        conn.connector?.canvas?.querySelector('path') ??
        null;
  
      if (pathEl) {
        const pathSvg    = pathEl.closest('svg') as SVGSVGElement;
        const svgRect    = pathSvg.getBoundingClientRect();
        const canvasRect = canvasEl.getBoundingClientRect();
        const dx = svgRect.left - canvasRect.left;
        const dy = svgRect.top  - canvasRect.top;
  
        const d = pathEl.getAttribute('d') ?? '';
  
        ctx.save();
        ctx.translate(dx, dy);
        ctx.strokeStyle = '#6c757d';
        ctx.lineWidth   = 2;
        ctx.lineJoin    = 'round';
        ctx.lineCap     = 'round';
  
        ctx.beginPath();
        const p2d = new Path2D(d);
        ctx.stroke(p2d);
  
        this._drawArrow(ctx, pathEl);
  
        ctx.restore();
      }
    }
  
    const nodeColors: Record<string, { bg: string; border: string; text: string }> = {
      server:   { bg: '#cfe2ff', border: '#0d6efd', text: '#084298' },
      database: { bg: '#d1e7dd', border: '#198754', text: '#0a3622' },
      api:      { bg: '#fff3cd', border: '#ffc107', text: '#664d03' },
      client:   { bg: '#cff4fc', border: '#0dcaf0', text: '#055160' },
    };
  
    const icons: Record<string, string> = {
      server: '🖥️', database: '🗄️', api: '🔌', client: '💻',
    };
  
    for (let i = 0; i < this.nodes.length; i++) {
      const node    = this.nodes[i];
      const el      = document.getElementById('node-' + i);
      if (!el) continue;
  
      const x = parseInt(el.style.left, 10);
      const y = parseInt(el.style.top,  10);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const r = 8;
  
      const colors = nodeColors[node.type] ?? nodeColors['server'];
  
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y,     x + w, y + r,     r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x,     y + h, x,     y + h - r, r);
      ctx.lineTo(x,     y + r);
      ctx.arcTo(x,     y,     x + r, y,         r);
      ctx.closePath();
      ctx.fillStyle   = colors.bg;
      ctx.fill();
      ctx.strokeStyle = colors.border;
      ctx.lineWidth   = 2;
      ctx.stroke();
  
      ctx.font         = '16px serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icons[node.type] ?? '📦', x + w / 2, y + h / 2 - 8);
  
      ctx.font         = '600 12px sans-serif';
      ctx.fillStyle    = colors.text;
      ctx.textBaseline = 'middle';
      const label = node.type.charAt(0).toUpperCase() + node.type.slice(1);
      ctx.fillText(label, x + w / 2, y + h / 2 + 10);
  
      ctx.beginPath();
      ctx.arc(x + w, y + h / 2, 7, 0, Math.PI * 2);
      ctx.fillStyle   = '#198754';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 2;
      ctx.stroke();
  
      ctx.beginPath();
      ctx.arc(x, y + h / 2, 7, 0, Math.PI * 2);
      ctx.fillStyle   = '#dc3545';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 2;
      ctx.stroke();
    }
  
    const link    = document.createElement('a');
    link.download = 'system-design.png';
    link.href     = out.toDataURL('image/png');
    link.click();
  }
  
  private _drawArrow(ctx: CanvasRenderingContext2D, pathEl: SVGPathElement) {
    try {
      const totalLen = pathEl.getTotalLength();
      if (totalLen < 10) return;
  
      const pt1 = pathEl.getPointAtLength(totalLen - 10);
      const pt2 = pathEl.getPointAtLength(totalLen);
  
      const angle = Math.atan2(pt2.y - pt1.y, pt2.x - pt1.x);
      const size  = 10;
  
      ctx.save();
      ctx.translate(pt2.x, pt2.y);
      ctx.rotate(angle);
      ctx.fillStyle = '#6c757d';
      ctx.beginPath();
      ctx.moveTo(0,      0);
      ctx.lineTo(-size, -size / 2.5);
      ctx.lineTo(-size,  size / 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } catch (_) {}
  }
}