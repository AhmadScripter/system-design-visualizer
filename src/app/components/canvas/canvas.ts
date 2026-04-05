import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, NgZone, OnInit, PLATFORM_ID, inject, } from '@angular/core';
import { Diagram } from '../../services/diagram';
import { ActivatedRoute } from '@angular/router';

interface NodeData {
  id: string;
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
export class Canvas implements AfterViewInit, OnInit {
  private platformId = inject(PLATFORM_ID);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);

  nodes: NodeData[] = [];
  selectedNodeIndex: number | null = null;
  private instance: any;

  private instanceReady!: Promise<void>;
  private resolveInstance!: () => void;
  isSharedMode = false;

  constructor(private diagramService: Diagram, private route: ActivatedRoute) {
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

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');

      if (id) {
        this.isSharedMode = true;
        this.loadDiagramFromServer(id);
      } else {
        this.isSharedMode = false;
      }
    });
  }

  selectNode(index: number) {
    this.selectedNodeIndex = index;
  }

  // --------add node--------
  async addNode(type: string) {
    if (this.isSharedMode) return;
    const id = 'node-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    await this.instanceReady;

    this.nodes.push({
      id,
      type,
      x: 100 + Math.random() * 380,
      y: 80 + Math.random() * 280,
    });

    this.cdr.detectChanges();

    this.zone.runOutsideAngular(() => {
      this._registerNode(id);
    });
  }

  private _registerNode(nodeId: string) {
    const el = document.getElementById(nodeId);
    if (!el) return;

    this.instance.draggable(el, {
      containment: true,
      stop: () => {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;

        node.x = parseInt(el.style.left, 10);
        node.y = parseInt(el.style.top, 10);
      }
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

    const nodesData: NodeData[] = this.nodes.map((node) => {
      const el = document.getElementById(node.id);
      const x = el ? parseInt(el.style.left, 10) : node.x;
      const y = el ? parseInt(el.style.top, 10) : node.y;

      return {
        id: node.id,
        type: node.type,
        x,
        y
      };
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
      this.nodes.push({ id: n.id, type: n.type, x: n.x, y: n.y })
    );
    this.cdr.detectChanges();

    // Wait one tick for Angular to render the node divs
    await new Promise((r) => setTimeout(r, 0));

    this.zone.runOutsideAngular(() => {
      this.nodes.forEach((node) => this._registerNode(node.id));

      // Reconnect using endpoint UUIDs, guaranteed to match
      diagram.connections.forEach((conn) => {
        this.instance.connect({
          uuids: [conn.sourceUuid, conn.targetUuid],
        });
      });
    });
  }

  // ------ share link ---------
  shareDiagram() {
    if (!this.instance) return;

    const nodesData = this.nodes.map((node) => {
      const el = document.getElementById(node.id);

      return {
        id: node.id,
        type: node.type,
        x: el ? parseInt(el.style.left, 10) : node.x,
        y: el ? parseInt(el.style.top, 10) : node.y
      };
    });

    const connections = this.instance.getAllConnections().map((conn: any) => ({
      sourceUuid: conn.endpoints[0].getUuid(),
      targetUuid: conn.endpoints[1].getUuid()
    }));

    const diagram = { nodes: nodesData, connections };

    this.diagramService.saveDiagram(diagram).subscribe((res) => {
      const link = `${window.location.origin}/diagram/${res.id}`;
      navigator.clipboard.writeText(link);
      alert('Link copied to clipboard');
    });
  }

  loadDiagramFromServer(id: string) {
    this.diagramService.fetchDiagram(id).subscribe(async (diagram: any) => {
      if (!diagram) return;
      await this.instanceReady;
      this.renderDiagram(diagram);
    });
  }

  async renderDiagram(diagram: any) {
    await this.instanceReady;

    this.instance.deleteEveryConnection();
    this.instance.deleteEveryEndpoint();

    this.nodes = [];
    this.cdr.detectChanges();

    diagram.nodes.forEach((n: any) => {
      this.nodes.push({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y
      });
    });

    this.cdr.detectChanges();
    await new Promise(requestAnimationFrame);

    this.zone.runOutsideAngular(() => {
      this.nodes.forEach(node => this._registerNode(node.id));

      diagram.connections.forEach((conn: any) => {
        this.instance.connect({
          uuids: [conn.sourceUuid, conn.targetUuid]
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
    out.width = W * SCALE;
    out.height = H * SCALE;
    const ctx = out.getContext('2d')!;
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
        const pathSvg = pathEl.closest('svg') as SVGSVGElement;
        const svgRect = pathSvg.getBoundingClientRect();
        const canvasRect = canvasEl.getBoundingClientRect();
        const dx = svgRect.left - canvasRect.left;
        const dy = svgRect.top - canvasRect.top;

        const d = pathEl.getAttribute('d') ?? '';

        ctx.save();
        ctx.translate(dx, dy);
        ctx.strokeStyle = '#6c757d';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.beginPath();
        const p2d = new Path2D(d);
        ctx.stroke(p2d);

        this._drawArrow(ctx, pathEl);

        ctx.restore();
      }
    }

    const nodeColors: Record<string, { bg: string; border: string; text: string }> = {
      server: { bg: '#cfe2ff', border: '#0d6efd', text: '#084298' },
      database: { bg: '#d1e7dd', border: '#198754', text: '#0a3622' },
      api: { bg: '#fff3cd', border: '#ffc107', text: '#664d03' },
      client: { bg: '#cff4fc', border: '#0dcaf0', text: '#055160' },
    };

    const icons: Record<string, string> = {
      server: '🖥️', database: '🗄️', api: '🔌', client: '💻',
    };

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const el = document.getElementById(node.id);
      if (!el) continue;

      const x = parseInt(el.style.left, 10);
      const y = parseInt(el.style.top, 10);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const r = 8;

      const colors = nodeColors[node.type] ?? nodeColors['server'];

      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
      ctx.fillStyle = colors.bg;
      ctx.fill();
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = '16px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icons[node.type] ?? '📦', x + w / 2, y + h / 2 - 8);

      ctx.font = '600 12px sans-serif';
      ctx.fillStyle = colors.text;
      ctx.textBaseline = 'middle';
      const label = node.type.charAt(0).toUpperCase() + node.type.slice(1);
      ctx.fillText(label, x + w / 2, y + h / 2 + 10);

      ctx.beginPath();
      ctx.arc(x + w, y + h / 2, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#198754';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y + h / 2, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#dc3545';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const link = document.createElement('a');
    link.download = 'system-design.png';
    link.href = out.toDataURL('image/png');
    link.click();
  }

  private _drawArrow(ctx: CanvasRenderingContext2D, pathEl: SVGPathElement) {
    try {
      const totalLen = pathEl.getTotalLength();
      if (totalLen < 10) return;

      const pt1 = pathEl.getPointAtLength(totalLen - 10);
      const pt2 = pathEl.getPointAtLength(totalLen);

      const angle = Math.atan2(pt2.y - pt1.y, pt2.x - pt1.x);
      const size = 10;

      ctx.save();
      ctx.translate(pt2.x, pt2.y);
      ctx.rotate(angle);
      ctx.fillStyle = '#6c757d';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, -size / 2.5);
      ctx.lineTo(-size, size / 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } catch (_) { }
  }

  deleteNode() {
    if (this.isSharedMode) return;
    if (this.selectedNodeIndex === null) return;

    const node = this.nodes[this.selectedNodeIndex];
    this.instance.removeAllEndpoints(node.id);
    this.nodes.splice(this.selectedNodeIndex, 1);
    this.selectedNodeIndex = null;
    this.cdr.detectChanges();
  }

  editNode() {
    if (this.isSharedMode) return;
    if (this.selectedNodeIndex === null) return;
    const newName = prompt('Enter new name');
    if (!newName) return;
    this.nodes[this.selectedNodeIndex].type = newName;
  }
}