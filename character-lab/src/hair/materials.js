import * as THREE from 'three';

function seeded(index) {
  const value = Math.sin(index * 91.137 + 17.71) * 43758.5453;
  return value - Math.floor(value);
}

function createFlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = '#c7c7c7';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineCap = 'round';
  for (let strand = 0; strand < 150; strand++) {
    const x = seeded(strand) * canvas.width;
    const bend = (seeded(strand + 400) - 0.5) * 14;
    context.strokeStyle = `rgba(255,255,255,${0.07 + seeded(strand + 800) * 0.17})`;
    context.lineWidth = 0.45 + seeded(strand + 1200) * 1.1;
    context.beginPath();
    context.moveTo(x, -4);
    context.bezierCurveTo(x + bend, 70, x - bend * 0.5, 175, x + bend * 0.25, 260);
    context.stroke();
  }
  for (let groove = 0; groove < 70; groove++) {
    const x = seeded(groove + 1700) * canvas.width;
    context.strokeStyle = `rgba(25,25,25,${0.035 + seeded(groove + 2200) * 0.08})`;
    context.lineWidth = 0.5 + seeded(groove + 2600);
    context.beginPath();
    context.moveTo(x, -4);
    context.quadraticCurveTo(x + (seeded(groove + 3000) - 0.5) * 12, 128, x, 260);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'ProceduralHairFlow';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(2.5, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createWispAlphaTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const across = context.createLinearGradient(0, 0, canvas.width, 0);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.28, 'rgba(255,255,255,.8)');
  across.addColorStop(0.5, 'rgba(255,255,255,1)');
  across.addColorStop(0.72, 'rgba(255,255,255,.8)');
  across.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = across;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'destination-in';
  const length = context.createLinearGradient(0, 0, 0, canvas.height);
  length.addColorStop(0, 'rgba(255,255,255,0)');
  length.addColorStop(0.12, 'rgba(255,255,255,1)');
  length.addColorStop(0.72, 'rgba(255,255,255,.72)');
  length.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = length;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'ProceduralHairWispAlpha';
  return texture;
}

function effectiveHairColor(color, greyAmount) {
  const base = new THREE.Color(color);
  const grey = new THREE.Color('#817b73');
  return base.lerp(grey, THREE.MathUtils.clamp(greyAmount, 0, 1) * 0.72);
}

export function createHairMaterials() {
  const flowTexture = createFlowTexture();
  const wispAlpha = createWispAlphaTexture();
  const base = new THREE.MeshStandardMaterial({
    name: 'CostumeHair', color: '#0d0908', roughness: 0.82, side: THREE.DoubleSide,
    shadowSide: THREE.BackSide, map: flowTexture, bumpMap: flowTexture, bumpScale: 0.0007,
  });
  const strand = new THREE.MeshStandardMaterial({
    name: 'CostumeHairStrands', color: '#17100d', roughness: 0.72, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const highlight = strand.clone();
  highlight.name = 'CostumeHairHighlights';
  const wisp = new THREE.MeshStandardMaterial({
    name: 'CostumeHairWisps', color: '#17100d', roughness: 0.78, side: THREE.DoubleSide,
    alphaMap: wispAlpha, alphaTest: 0.18, depthWrite: true,
  });

  function update(values) {
    const color = effectiveHairColor(values.hairColor || '#0d0908', values.greyAmount ?? 0);
    const contrast = THREE.MathUtils.clamp(values.strandContrast ?? 0.45, 0, 1);
    base.color.copy(color).multiplyScalar(0.88 + contrast * 0.07);
    strand.color.copy(color).lerp(new THREE.Color('#d5b99f'), 0.035 + contrast * 0.09);
    highlight.color.copy(color).lerp(new THREE.Color('#ead5bd'), 0.06 + contrast * 0.14);
    wisp.color.copy(strand.color);
  }

  function dispose() {
    flowTexture.dispose();
    wispAlpha.dispose();
    for (const material of [base, strand, highlight, wisp]) material.dispose();
  }

  return { base, strand, highlight, wisp, update, dispose };
}
