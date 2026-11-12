import { Color } from 'three';

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Rooflines of an 1896 block face: stepped parapets, chimneys, the odd
// water tower and spire. `detail` false is the far ring — outline only.
function drawCity(ctx, w, h, seed, { wall, haze, detail }) {
  const ground = Math.round(h * 0.82);
  let x = 0;
  let i = 0;
  while (x < w) {
    const bw = Math.round(28 + hash01(seed + i * 7.3) * 64);
    const tall = detail ? 0.32 + hash01(seed + i * 3.1) * 0.4 : 0.45 + hash01(seed + i * 3.1) * 0.5;
    const bh = Math.round(ground * tall);
    const top = ground - bh;
    const tone = 0.9 + hash01(seed + i * 5.7) * 0.2;
    const base = new Color(wall).multiplyScalar(tone);
    ctx.fillStyle = `#${base.getHexString()}`;
    ctx.fillRect(x, top, bw + 1, bh);

    // Chimneys along the parapet.
    const chimneys = 1 + Math.floor(hash01(seed + i * 9.7) * 3);
    for (let c = 0; c < chimneys; c += 1) {
      const cx = x + 4 + hash01(seed + i * 11.3 + c) * (bw - 10);
      ctx.fillRect(cx, top - 5, 4, 5);
    }
    // A water tower here and there, a spire more rarely.
    const roll = hash01(seed + i * 13.9);
    if (roll > 0.9) {
      const tx = x + bw / 2 - 5;
      ctx.fillRect(tx + 2, top - 12, 2, 12);
      ctx.fillRect(tx + 7, top - 12, 2, 12);
      ctx.fillRect(tx, top - 20, 11, 9);
    } else if (roll < 0.05) {
      ctx.beginPath();
      ctx.moveTo(x + bw / 2 - 6, top);
      ctx.lineTo(x + bw / 2, top - 26);
      ctx.lineTo(x + bw / 2 + 6, top);
      ctx.fill();
    }

    // Window grid, near ring only. Morning: nearly all dark, a few warm.
    if (detail) {
      for (let wy = top + 8; wy < ground - 8; wy += 11) {
        for (let wx = x + 5; wx < x + bw - 6; wx += 9) {
          const litRoll = hash01(seed + wx * 0.37 + wy * 1.91);
          ctx.fillStyle = litRoll > 0.97 ? '#d29b58' : `#${base.clone().multiplyScalar(0.72).getHexString()}`;
          ctx.fillRect(wx, wy, 3, 5);
        }
      }
    }
    x += bw;
    i += 1;
  }
  // Ground band below the rooflines, hiding the gap between the terrain edge
  // and the flat. Opaque: the cutout alpha test keeps only the sky clear.
  const grad = ctx.createLinearGradient(0, ground - 2, 0, h);
  grad.addColorStop(0, wall);
  grad.addColorStop(1, haze);
  ctx.fillStyle = grad;
  ctx.fillRect(0, ground - 2, w, h - ground + 2);
}

// A crown is a dark mass of lobes covered in small leaf clumps, lit from
// above: lighter on top and toward the sun side, darker underneath. The
// clumps also break the outline, so the cutout edge reads as leaves.
function drawCrown(ctx, cx, cy, rx, ry, seed, color, lobeCount = 11) {
  const lobes = [[cx, cy + ry * 0.12, rx * 0.78, ry * 0.68]];
  for (let lobe = 0; lobe < lobeCount; lobe += 1) {
    const across = lobeCount === 1 ? 0 : (lobe / (lobeCount - 1)) * 2 - 1;
    const crown = Math.sqrt(Math.max(0, 1 - across * across));
    lobes.push([
      cx + across * rx * 0.8 + (hash01(seed + lobe * 7.1) - 0.5) * rx * 0.15,
      cy - crown * ry * 0.56 + Math.abs(across) * ry * 0.22 + (hash01(seed + lobe * 11.9) - 0.5) * ry * 0.16,
      rx * (0.17 + hash01(seed + lobe * 17.3) * 0.1),
      ry * (0.2 + hash01(seed + lobe * 23.7) * 0.12),
    ]);
  }
  // Lower clusters hang over the trunk like a mature park tree.
  for (let lobe = 0; lobe < 4; lobe += 1) {
    const across = (lobe / 3) * 1.5 - 0.75;
    lobes.push([
      cx + across * rx + (hash01(seed + 89 + lobe) - 0.5) * rx * 0.12,
      cy + ry * (0.42 + hash01(seed + 101 + lobe) * 0.18),
      rx * (0.2 + hash01(seed + 53 + lobe) * 0.08),
      ry * (0.16 + hash01(seed + 71 + lobe) * 0.08),
    ]);
  }

  const base = new Color(color);
  const shade = base.clone().multiplyScalar(0.62);
  ctx.fillStyle = `#${shade.getHexString()}`;
  for (const [x, y, lx, ly] of lobes) {
    ctx.beginPath();
    ctx.ellipse(x, y, lx, ly, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const lit = base.clone().multiplyScalar(1.45).lerp(new Color('#a8ad6a'), 0.12);
  const mixed = new Color();
  let index = 0;
  for (const [x, y, lx, ly] of lobes) {
    const clumps = Math.round((lx * ly) / 2.5);
    for (let clump = 0; clump < clumps; clump += 1, index += 1) {
      const angle = hash01(seed * 3.7 + index * 1.31) * Math.PI * 2;
      const out = Math.sqrt(hash01(seed * 5.3 + index * 2.17)) * 1.05;
      const px = x + Math.cos(angle) * lx * out;
      const py = y + Math.sin(angle) * ly * out;
      const height = (cy - py) / ry;
      const light = Math.min(1, Math.max(0,
        0.45 + height * 0.55 + ((cx - px) / rx) * 0.15 + (hash01(seed + index * 9.1) - 0.5) * 0.45));
      mixed.copy(shade).lerp(lit, light);
      ctx.fillStyle = `#${mixed.getHexString()}`;
      ctx.beginPath();
      ctx.arc(px, py, 0.5 + hash01(seed + index * 4.9) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawTrunk(ctx, x, ground, branchY, crownY, seed, width, color) {
  const lean = (hash01(seed + 17) - 0.5) * width * 1.6;
  const fork = width * (1.7 + hash01(seed + 29) * 1.4);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, ground + 2);
  ctx.quadraticCurveTo(x - lean * 0.3, branchY, x + lean, crownY);
  ctx.stroke();

  ctx.lineWidth = Math.max(1.5, width * 0.48);
  ctx.beginPath();
  ctx.moveTo(x - lean * 0.15, branchY + 2);
  ctx.lineTo(x - fork, crownY + 4);
  ctx.moveTo(x, branchY - 1);
  ctx.lineTo(x + fork * 0.85, crownY + 1);
  ctx.stroke();
}

// Layered broadleaf crowns with trunks and small sky gaps. The texture is
// still painted only once, so the more natural outline costs nothing per frame.
function drawTrees(ctx, w, h, seed, { leaf, leafMid, leafFar, trunk, haze }) {
  const ground = Math.round(h * 0.75);

  // Far woods behind everything, so no sky shows between the trunks.
  ctx.fillStyle = leafFar;
  ctx.fillRect(0, ground - 12, w, h - ground + 12);

  // A lower, paler rank stops distant gaps from looking empty without
  // repeating the foreground tree rhythm.
  let rearX = -24;
  let rearIndex = 0;
  while (rearX < w + 24) {
    const rearSeed = seed * 31 + rearIndex * 19.7;
    const rx = 18 + hash01(rearSeed + 1) * 18;
    const ry = 14 + hash01(rearSeed + 2) * 12;
    rearX += 20 + hash01(rearSeed + 3) * 28;
    drawCrown(
      ctx,
      rearX,
      ground - 10 - ry * (0.25 + hash01(rearSeed + 4) * 0.28),
      rx,
      ry,
      rearSeed,
      leafFar,
      8,
    );
    rearIndex += 1;
  }

  let x = -32;
  let treeIndex = 0;
  while (x < w + 32) {
    const treeSeed = seed * 101 + treeIndex * 37.9;
    const spacing = 34 + hash01(treeSeed + 1) * 34;
    const rx = 22 + hash01(treeSeed + 2) * 18;
    const ry = 20 + hash01(treeSeed + 3) * 15;
    const trunkH = 18 + hash01(treeSeed + 4) * 17;
    const crownY = ground - trunkH - ry * 0.08;
    const treeX = x + spacing * 0.5;
    const trunkWidth = 2.8 + hash01(treeSeed + 5) * 2.4;
    const crownColor = hash01(treeSeed + 6) > 0.46 ? leaf : leafMid;

    drawTrunk(
      ctx,
      treeX,
      ground,
      ground - trunkH * 0.58,
      crownY + ry * 0.1,
      treeSeed,
      trunkWidth,
      trunk,
    );
    drawCrown(ctx, treeX, crownY, rx, ry, treeSeed, crownColor);

    x += spacing;
    treeIndex += 1;
  }

  // Irregular understory hides the plane's lower edge and seats the trunks
  // in vegetation without erasing all of the open space beneath the crowns.
  const grad = ctx.createLinearGradient(0, ground - 2, 0, h);
  grad.addColorStop(0, leafMid);
  grad.addColorStop(1, haze);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, ground + 1);
  for (let bushX = 0; bushX <= w; bushX += 9) {
    const top = ground + 1 - hash01(seed * 211 + bushX * 1.13) * 6;
    ctx.lineTo(bushX, top);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

export function paintBackdrop(canvas, width, height, seed, style) {
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  if (style === 'city') {
    drawCity(ctx, width, height, seed, { wall: '#41392f', haze: '#767468', detail: true });
  } else if (style === 'city-far') {
    drawCity(ctx, width, height, seed, { wall: '#6d7480', haze: '#868d96', detail: false });
  } else {
    drawTrees(ctx, width, height, seed, {
      leaf: '#3c4a2b', leafMid: '#4a5534', leafFar: '#5b6452', trunk: '#33352d', haze: '#6d7263',
    });
  }
}
