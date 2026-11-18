import * as THREE from 'three';

export interface StudioTextureSet {
  radialShadow: THREE.CanvasTexture;
  brushedRoughness: THREE.CanvasTexture;
  turntableDial: THREE.CanvasTexture;
  studioFloor: THREE.CanvasTexture;
  micGrillBump: THREE.CanvasTexture;
  stoneBump: THREE.CanvasTexture;
  waterRippleBump: THREE.CanvasTexture;
  hexDeckBump: THREE.CanvasTexture;
  dispose: () => void;
}

export function createStudioTextures(maxAnisotropy: number): StudioTextureSet {
  const anisotropy = Math.max(1, Math.min(8, maxAnisotropy));

  // 1. Soft radial contact shadow
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const sCtx = shadowCanvas.getContext('2d')!;
  const sGrad = sCtx.createRadialGradient(128, 128, 12, 128, 128, 124);
  sGrad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  sGrad.addColorStop(0.45, 'rgba(0, 0, 0, 0.34)');
  sGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.08)');
  sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sCtx.fillStyle = sGrad;
  sCtx.fillRect(0, 0, 256, 256);
  const radialShadow = new THREE.CanvasTexture(shadowCanvas);
  radialShadow.colorSpace = THREE.SRGBColorSpace;

  // 2. Brushed metal roughness map (linear space)
  const brushCanvas = document.createElement('canvas');
  brushCanvas.width = 512;
  brushCanvas.height = 512;
  const bCtx = brushCanvas.getContext('2d')!;
  bCtx.fillStyle = '#888888';
  bCtx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y++) {
    const shade = 112 + Math.floor(Math.random() * 52);
    bCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    bCtx.fillRect(0, y, 512, 1);
  }
  const brushedRoughness = new THREE.CanvasTexture(brushCanvas);
  brushedRoughness.wrapS = THREE.RepeatWrapping;
  brushedRoughness.wrapT = THREE.RepeatWrapping;
  brushedRoughness.repeat.set(2, 2);
  brushedRoughness.anisotropy = anisotropy;

  // 3. Precision turntable degree dial (sRGB)
  const dialCanvas = document.createElement('canvas');
  dialCanvas.width = 1024;
  dialCanvas.height = 1024;
  const dCtx = dialCanvas.getContext('2d')!;
  const cx = 512;
  const cy = 512;
  const dGrad = dCtx.createRadialGradient(cx, cy, 40, cx, cy, 510);
  dGrad.addColorStop(0, '#1e2430');
  dGrad.addColorStop(0.65, '#171b24');
  dGrad.addColorStop(1, '#10131a');
  dCtx.fillStyle = dGrad;
  dCtx.fillRect(0, 0, 1024, 1024);

  dCtx.strokeStyle = 'rgba(180, 200, 235, 0.16)';
  dCtx.lineWidth = 2;
  for (const r of [140, 260, 380, 445, 488]) {
    dCtx.beginPath();
    dCtx.arc(cx, cy, r, 0, Math.PI * 2);
    dCtx.stroke();
  }

  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 30 === 0;
    const isMid = deg % 15 === 0;
    const rInner = isMajor ? 454 : isMid ? 466 : 476;
    const rOuter = 488;
    dCtx.strokeStyle = isMajor
      ? 'rgba(232, 198, 128, 0.78)'
      : 'rgba(195, 210, 235, 0.28)';
    dCtx.lineWidth = isMajor ? 3 : 1.5;
    dCtx.beginPath();
    dCtx.moveTo(cx + Math.cos(rad) * rInner, cy + Math.sin(rad) * rInner);
    dCtx.lineTo(cx + Math.cos(rad) * rOuter, cy + Math.sin(rad) * rOuter);
    dCtx.stroke();
  }

  const turntableDial = new THREE.CanvasTexture(dialCanvas);
  turntableDial.colorSpace = THREE.SRGBColorSpace;
  turntableDial.anisotropy = anisotropy;

  // 4. Studio cyclorama floor grid (sRGB)
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 1024;
  floorCanvas.height = 1024;
  const fCtx = floorCanvas.getContext('2d')!;
  const fGrad = fCtx.createRadialGradient(512, 512, 40, 512, 512, 512);
  fGrad.addColorStop(0, '#1c2230');
  fGrad.addColorStop(0.55, '#131722');
  fGrad.addColorStop(1, '#0b0e16');
  fCtx.fillStyle = fGrad;
  fCtx.fillRect(0, 0, 1024, 1024);

  fCtx.strokeStyle = 'rgba(140, 175, 235, 0.08)';
  fCtx.lineWidth = 1.5;
  const step = 64;
  for (let i = 0; i <= 1024; i += step) {
    fCtx.beginPath();
    fCtx.moveTo(i, 0);
    fCtx.lineTo(i, 1024);
    fCtx.stroke();
    fCtx.beginPath();
    fCtx.moveTo(0, i);
    fCtx.lineTo(1024, i);
    fCtx.stroke();
  }

  for (const r of [128, 256, 384, 480]) {
    fCtx.strokeStyle = 'rgba(170, 200, 255, 0.11)';
    fCtx.beginPath();
    fCtx.arc(512, 512, r, 0, Math.PI * 2);
    fCtx.stroke();
  }

  const studioFloor = new THREE.CanvasTexture(floorCanvas);
  studioFloor.colorSpace = THREE.SRGBColorSpace;
  studioFloor.anisotropy = anisotropy;

  // 5. Condenser microphone perforated grille bump map
  const grillCanvas = document.createElement('canvas');
  grillCanvas.width = 256;
  grillCanvas.height = 256;
  const gCtx = grillCanvas.getContext('2d')!;
  gCtx.fillStyle = '#c8c8c8';
  gCtx.fillRect(0, 0, 256, 256);
  gCtx.fillStyle = '#262626';
  const cell = 16;
  for (let row = 0; row < 256 / cell; row++) {
    for (let col = 0; col < 256 / cell; col++) {
      const offset = row % 2 === 0 ? 0 : cell * 0.5;
      gCtx.beginPath();
      gCtx.arc(
        (col * cell + offset) % 256,
        row * cell + cell * 0.5,
        4.2,
        0,
        Math.PI * 2
      );
      gCtx.fill();
    }
  }
  const micGrillBump = new THREE.CanvasTexture(grillCanvas);
  micGrillBump.wrapS = THREE.RepeatWrapping;
  micGrillBump.wrapT = THREE.RepeatWrapping;
  micGrillBump.repeat.set(4, 3);
  micGrillBump.anisotropy = anisotropy;

  // 6. Architectural stone / travertine vein bump texture
  const stoneCanvas = document.createElement('canvas');
  stoneCanvas.width = 512;
  stoneCanvas.height = 512;
  const stCtx = stoneCanvas.getContext('2d')!;
  stCtx.fillStyle = '#909090';
  stCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const w = 18 + Math.random() * 68;
    const h = 2 + Math.random() * 5;
    const shade = 110 + Math.floor(Math.random() * 75);
    stCtx.fillStyle = `rgba(${shade},${shade},${shade},0.35)`;
    stCtx.fillRect(x, y, w, h);
  }
  const stoneBump = new THREE.CanvasTexture(stoneCanvas);
  stoneBump.wrapS = THREE.RepeatWrapping;
  stoneBump.wrapT = THREE.RepeatWrapping;
  stoneBump.repeat.set(4, 4);
  stoneBump.anisotropy = anisotropy;

  // 7. Ocean / reflecting pool ripple bump texture
  const waterCanvas = document.createElement('canvas');
  waterCanvas.width = 512;
  waterCanvas.height = 512;
  const wCtx = waterCanvas.getContext('2d')!;
  wCtx.fillStyle = '#808080';
  wCtx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 2) {
    for (let x = 0; x < 512; x += 2) {
      const n =
        Math.sin(x * 0.06 + Math.cos(y * 0.05) * 2.1) * 0.5 +
        Math.cos(y * 0.08 - x * 0.03) * 0.5;
      const v = Math.max(0, Math.min(255, Math.round(128 + n * 52)));
      wCtx.fillStyle = `rgb(${v},${v},${v})`;
      wCtx.fillRect(x, y, 2, 2);
    }
  }
  const waterRippleBump = new THREE.CanvasTexture(waterCanvas);
  waterRippleBump.wrapS = THREE.RepeatWrapping;
  waterRippleBump.wrapT = THREE.RepeatWrapping;
  waterRippleBump.repeat.set(6, 6);
  waterRippleBump.anisotropy = anisotropy;

  // 8. Orbital hexagonal deck tile bump map
  const hexCanvas = document.createElement('canvas');
  hexCanvas.width = 512;
  hexCanvas.height = 512;
  const hCtx = hexCanvas.getContext('2d')!;
  hCtx.fillStyle = '#b4b4b4';
  hCtx.fillRect(0, 0, 512, 512);
  hCtx.strokeStyle = '#3a3a3a';
  hCtx.lineWidth = 3;
  const r = 32;
  const dx = r * 1.5;
  const dy = r * Math.sqrt(3);
  for (let row = -1; row < 512 / (dy * 0.5) + 2; row++) {
    for (let col = -1; col < 512 / dx + 2; col++) {
      const cxH = col * dx;
      const cyH = row * dy + (col % 2 === 0 ? 0 : dy * 0.5);
      hCtx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        const px = cxH + r * 0.94 * Math.cos(a);
        const py = cyH + r * 0.94 * Math.sin(a);
        if (k === 0) hCtx.moveTo(px, py);
        else hCtx.lineTo(px, py);
      }
      hCtx.closePath();
      hCtx.stroke();
    }
  }
  const hexDeckBump = new THREE.CanvasTexture(hexCanvas);
  hexDeckBump.wrapS = THREE.RepeatWrapping;
  hexDeckBump.wrapT = THREE.RepeatWrapping;
  hexDeckBump.repeat.set(4, 4);
  hexDeckBump.anisotropy = anisotropy;

  return {
    radialShadow,
    brushedRoughness,
    turntableDial,
    studioFloor,
    micGrillBump,
    stoneBump,
    waterRippleBump,
    hexDeckBump,
    dispose: () => {
      radialShadow.dispose();
      brushedRoughness.dispose();
      turntableDial.dispose();
      studioFloor.dispose();
      micGrillBump.dispose();
      stoneBump.dispose();
      waterRippleBump.dispose();
      hexDeckBump.dispose();
    },
  };
}
