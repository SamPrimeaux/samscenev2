import * as THREE from 'three';
import * as xb from 'xrblocks';

interface ActiveStroke {
  points: THREE.Vector3[];
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
}

const _cursorPos = new THREE.Vector3();

/**
 * Interactive 3D sculpting / light-ribbon painter in XR space.
 * Active only when paint mode is toggled on, leaving UI cards and subject manipulation untouched otherwise.
 */
export class SpatialBrush extends xb.Script {
  public enabled = false;
  private material: THREE.Material;
  private activePresetId = 'pbr-brushed-gold';
  private strokesGroup = new THREE.Group();
  private completedStrokes: THREE.Mesh[] = [];
  private activeStrokes = new Map<THREE.Object3D, ActiveStroke>();
  private onStrokeCountChange?: (count: number) => void;
  private sampleVariant = 0;

  constructor(material: THREE.Material, onStrokeCountChange?: (count: number) => void) {
    super();
    this.material = material;
    this.onStrokeCountChange = onStrokeCountChange;
    this.strokesGroup.name = 'SpatialBrushStrokes';
    this.add(this.strokesGroup);
  }

  public get strokeCount(): number {
    return this.completedStrokes.length;
  }

  public getActivePresetId(): string {
    return this.activePresetId;
  }

  public setActiveMaterial(material: THREE.Material, presetId?: string): void {
    this.material = material;
    if (presetId) {
      this.activePresetId = presetId;
    }
  }

  public getStrokeMeshes(): THREE.Mesh[] {
    return this.completedStrokes;
  }

  public applyMaterialToStroke(
    mesh: THREE.Mesh,
    material: THREE.Material,
    presetId?: string
  ): boolean {
    if (!this.completedStrokes.includes(mesh)) return false;
    const prevMat = mesh.material;
    const cloned = material.clone();
    if (presetId) cloned.userData.pbrPresetId = presetId;
    mesh.material = cloned;
    if (prevMat && prevMat !== this.material && !Array.isArray(prevMat)) {
      prevMat.dispose();
    }
    return true;
  }

  public applyMaterialToAllStrokes(material: THREE.Material, presetId?: string): number {
    let updated = 0;
    for (const mesh of this.completedStrokes) {
      if (this.applyMaterialToStroke(mesh, material, presetId)) {
        updated++;
      }
    }
    return updated;
  }

  public addSampleSculptedRibbon(material?: THREE.Material, presetId?: string): THREE.Mesh {
    const idx = this.sampleVariant++;
    const pts: THREE.Vector3[] = [];
    const baseCenter = new THREE.Vector3(0, 1.24, -1.25);
    const phase = idx * 1.15;
    const radius = 0.42 + (idx % 3) * 0.09;
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 1.75 + phase;
      const yWave = Math.sin(t * 2.0 + phase) * 0.22;
      const rMod = radius + Math.cos(t * 3.0) * 0.06;
      pts.push(
        new THREE.Vector3(
          baseCenter.x + Math.cos(t) * rMod,
          baseCenter.y + yWave,
          baseCenter.z + Math.sin(t) * rMod
        )
      );
    }

    const curve = new THREE.CatmullRomCurve3(pts);
    const geometry = new THREE.TubeGeometry(curve, 72, 0.022, 14, false);
    const mat = (material || this.material).clone();
    if (presetId) mat.userData.pbrPresetId = presetId;
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = `SculptedRibbon_${idx + 1}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.xb = { pointerEvents: 'none' };
    this.strokesGroup.add(mesh);
    this.completedStrokes.push(mesh);
    this.onStrokeCountChange?.(this.completedStrokes.length);
    return mesh;
  }

  public getExportGroup(): THREE.Group {
    this.strokesGroup.updateMatrixWorld(true);
    return this.strokesGroup;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    if (!next) {
      this.activeStrokes.clear();
    }
  }

  public clearStrokes(): void {
    for (const mesh of this.completedStrokes) {
      this.strokesGroup.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material && mesh.material !== this.material && !Array.isArray(mesh.material)) {
        mesh.material.dispose();
      }
    }
    this.completedStrokes = [];
    this.activeStrokes.clear();
    this.onStrokeCountChange?.(0);
  }

  private getBrushPoint(event: xb.SelectEvent): THREE.Vector3 {
    if (event.intersection?.point) {
      _cursorPos.copy(event.intersection.point);
      return _cursorPos.clone();
    }
    const controller = event.source.controller;
    _cursorPos.set(0, 0, -0.45);
    controller.localToWorld(_cursorPos);
    return _cursorPos.clone();
  }

  private isUIOrManipulableTarget(target: THREE.Object3D | undefined): boolean {
    let curr: THREE.Object3D | null | undefined = target;
    while (curr) {
      if ((curr as { isUI?: boolean }).isUI) return true;
      if (curr.xb?.manipulation) return true;
      curr = curr.parent;
    }
    return false;
  }

  onSelectStart(event: xb.SelectEvent): void {
    if (!this.enabled) return;
    if (this.isUIOrManipulableTarget(event.target)) return;

    const controller = event.source.controller;
    const startPt = this.getBrushPoint(event);
    const secondPt = startPt.clone().add(new THREE.Vector3(0.002, 0.002, 0));

    const curve = new THREE.CatmullRomCurve3([startPt, secondPt]);
    const geometry = new THREE.TubeGeometry(curve, 8, 0.015, 10, false);
    const strokeMat = this.material.clone();
    strokeMat.userData.pbrPresetId = this.activePresetId;
    const mesh = new THREE.Mesh(geometry, strokeMat);
    mesh.name = `SculptedStroke_${this.completedStrokes.length + 1}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.xb = { pointerEvents: 'none' };
    this.strokesGroup.add(mesh);

    this.activeStrokes.set(controller, {
      points: [startPt, secondPt],
      mesh,
      geometry,
    });
    event.stopPropagation();
  }

  onSelecting(event: xb.SelectEvent): void {
    if (!this.enabled) return;
    const controller = event.source.controller;
    const stroke = this.activeStrokes.get(controller);
    if (!stroke) return;

    const nextPt = this.getBrushPoint(event);
    const lastPt = stroke.points[stroke.points.length - 1];
    if (lastPt.distanceToSquared(nextPt) < 0.0004) return;

    stroke.points.push(nextPt);
    const segments = Math.min(220, Math.max(8, stroke.points.length * 4));
    const curve = new THREE.CatmullRomCurve3(stroke.points);
    const nextGeo = new THREE.TubeGeometry(curve, segments, 0.015, 10, false);
    stroke.mesh.geometry = nextGeo;
    stroke.geometry.dispose();
    stroke.geometry = nextGeo;
    event.stopPropagation();
  }

  onSelectEnd(event: xb.SelectEvent): void {
    const controller = event.source.controller;
    const stroke = this.activeStrokes.get(controller);
    if (!stroke) return;

    this.activeStrokes.delete(controller);
    this.completedStrokes.push(stroke.mesh);
    this.onStrokeCountChange?.(this.completedStrokes.length);
  }

  private webStroke: ActiveStroke | null = null;

  public startWebStroke(point: THREE.Vector3): void {
    if (!this.enabled) return;
    const startPt = point.clone();
    const secondPt = startPt.clone().add(new THREE.Vector3(0.002, 0.002, 0));
    const curve = new THREE.CatmullRomCurve3([startPt, secondPt]);
    const geometry = new THREE.TubeGeometry(curve, 8, 0.015, 10, false);
    const strokeMat = this.material.clone();
    strokeMat.userData.pbrPresetId = this.activePresetId;
    const mesh = new THREE.Mesh(geometry, strokeMat);
    mesh.name = `SculptedStroke_${this.completedStrokes.length + 1}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.xb = { pointerEvents: 'none' };
    this.strokesGroup.add(mesh);
    this.webStroke = { points: [startPt, secondPt], mesh, geometry };
  }

  public moveWebStroke(point: THREE.Vector3): void {
    if (!this.enabled || !this.webStroke) return;
    const stroke = this.webStroke;
    const lastPt = stroke.points[stroke.points.length - 1];
    if (lastPt.distanceToSquared(point) < 0.0005) return;

    stroke.points.push(point.clone());
    const segments = Math.min(220, Math.max(8, stroke.points.length * 4));
    const curve = new THREE.CatmullRomCurve3(stroke.points);
    const nextGeo = new THREE.TubeGeometry(curve, segments, 0.015, 10, false);
    stroke.mesh.geometry = nextGeo;
    stroke.geometry.dispose();
    stroke.geometry = nextGeo;
  }

  public endWebStroke(): void {
    if (!this.webStroke) return;
    this.completedStrokes.push(this.webStroke.mesh);
    this.webStroke = null;
    this.onStrokeCountChange?.(this.completedStrokes.length);
  }

  dispose(): void {
    this.webStroke = null;
    this.clearStrokes();
  }
}
