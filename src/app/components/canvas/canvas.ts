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
        el.setAttribute('data-x', parseInt(style.left, 10).toString());
        el.setAttribute('data-y', parseInt(style.top, 10).toString());
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

    // Read position from el.style.left/top, jsPlumb sets these
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
    alert('Diagram saved ✅');
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
}