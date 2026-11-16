// WebGL view for Shelf Run (Three.js). The game rules live in main.ts; this
// file only draws them. Units: 1 = one lane width. Game z points ahead of the
// player, so a game position (x, y, z) sits at (x, y, -z) in the scene.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { catColor, PLAY_CATS, type Sub } from '../bots';
import { cardVersion, drawCard, emojiTile, newCardCanvas, CARD_W, CARD_H, VIRAL } from './cards';
import { FLOOR_W, bandTex, barTex, cardboardTex, cargoTex, ceilingTex, floorTex, forestFloorTex, glowTex, hazardTex, metalTex, moonTex, orbitFloorTex, rng, signTex, starsTex, woodTex } from './textures';
import { ZONES, type Zone } from './zones';
import { BLOB_COLORS, BLOB_KIND, blobGeometry, blobMaterial, blobUniforms } from './blobs';

// ---------- what main.ts hands us ----------

export type EKind = 'bot' | 'scam' | 'dupe' | 'box' | 'wall' | 'like' | 'power' | 'bar' | 'barwide' | 'runaway' | 'gate';
export type Power = 'shield' | 'magnet' | 'turbo';
export interface Ent {
  kind: EKind;
  lane: number;
  z: number;
  sub?: Sub;
  done?: boolean;
  passed?: boolean;
  seed: number;
  x?: number; // drawn and hit here instead of the lane, while the magnet pulls
  power?: Power;
  smash?: number; // game time when Turbo knocked it flying
  zone?: number; // for a gate: the zone behind it
}
export interface View {
  on: boolean;
  t: number;
  dist: number;
  v: number;
  x: number;
  y: number;
  lane: number;
  inv: number;
  shake: number;
  squash: number;
  dying: number;
  cart: Sub[];
  ents: Ent[];
  shield: number;
  magnet: number;
  turbo: number; // seconds of Turbo left
  slide: number; // seconds of slide left
}

// ---------- tuning ----------

const BG = new THREE.Color('#05070c');
const EDGE = 1.72; // shelf face, in lanes from the middle
const DEPTH = 0.72; // shelf depth
const SHELF_H = 3.5;
const SEG = 2.4; // one shelf module
const PERIOD = SEG * 10; // the aisle pattern repeats every 10 modules
const BOARDS = [0.14, 0.98, 1.82, 2.66];
// Outlines for shelf bots, after the real avatars. turn points a corner
// toward the side the bot looks; w and h stretch it; bottom is how far the
// outline reaches below its middle, so it sits on the board.
const Q = Math.PI / 4;
const BOT_SHAPES = [
  { kind: BLOB_KIND.circle, round: 0, turn: 0, w: 1, h: 1, bottom: 1 },
  { kind: BLOB_KIND.circle, round: 0, turn: 0, w: 1, h: 1, bottom: 1 },
  { kind: BLOB_KIND.square, round: 0.42, turn: -Q - 0.25, w: 1.12, h: 1.12, bottom: 0.9 },
  { kind: BLOB_KIND.square, round: 0.42, turn: -Q - 0.25, w: 1.12, h: 1.12, bottom: 0.9 },
  { kind: BLOB_KIND.square, round: 0.45, turn: -Q - 0.12, w: 1.25, h: 0.98, bottom: 0.88 },
  { kind: BLOB_KIND.triangle, round: 0.34, turn: 0, w: 1.15, h: 1.05, bottom: 0.88 },
  { kind: BLOB_KIND.hexagon, round: 0.26, turn: 0.15, w: 1.05, h: 1.05, bottom: 0.92 },
  { kind: BLOB_KIND.cloud, round: 0, turn: -0.1 * Math.PI, w: 1.05, h: 1, bottom: 0.94 },
];
const CARD_SIZE = 0.98;
export const BOX_H = 0.48;
export const WALL_H = 1.45;

// ---------- renderer ----------

let renderer: THREE.WebGLRenderer;
const scene = new THREE.Scene();
// near at 0.8 (nothing is ever closer) keeps depth precise far down the aisle
const camera = new THREE.PerspectiveCamera(58, 1, 0.8, 95);
const world = new THREE.Group(); // everything that shows up in the floor reflection
const flat = new THREE.Group(); // floor and floor decals, not reflected
scene.add(world, flat);
let W = 1, H = 1, aniso = 1;
// 2: reflections, sharpest. 1: no reflections. 0: lower resolution too.
// ?q=2 pins it, for testing.
const pinned = new URLSearchParams(location.search).get('q');
let quality = pinned ? Number(pinned) : 2;

const fx = document.getElementById('fx')!;
const cartTag = document.getElementById('cartTag')!;
const vignette = document.getElementById('vignette')!;

// Straight to the screen with the browser's own anti-aliasing: no render
// targets, no post-processing. Glow comes from soft additive sprites. With
// reflections on, the world is drawn upside down first, under a see-through floor.
// Small glows on this layer are skipped in the reflection pass: they cost a
// draw call each and nobody can see them in the floor.
const NO_REFLECT = 1;
const mirror = { reflect: true, hide: [] as THREE.Object3D[], was: [] as boolean[] };
function draw() {
  renderer.setClearColor(BG, 1);
  renderer.clear();
  if (mirror.reflect) {
    world.scale.y = -1;
    // put back whatever each one was: some are hidden by the zone
    mirror.hide.forEach((o, i) => ((mirror.was[i] = o.visible), (o.visible = false)));
    camera.layers.disable(NO_REFLECT);
    renderer.render(scene, camera);
    camera.layers.enable(NO_REFLECT);
    world.scale.y = 1;
    mirror.hide.forEach((o, i) => (o.visible = mirror.was[i]));
    renderer.clearDepth();
  }
  renderer.render(scene, camera);
}

function tex(c: HTMLCanvasElement, opts: { repeatY?: number; srgb?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (opts.repeatY) {
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, opts.repeatY);
  }
  return t;
}

// ---------- shared assets ----------

let GLOW: THREE.Texture;
const unitPlane = new THREE.PlaneGeometry(1, 1);
const floorPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function additive(color: THREE.ColorRepresentation, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    map: GLOW,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    // floor decals win the depth test against the floor without z-fighting
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
}

// Fades a material out as it nears the camera. Used on the ceiling lights,
// which would otherwise clip through the top of the screen as white bars.
function nearFade<T extends THREE.Material>(m: T, from = 8.5, to = 13): T {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vViewZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvViewZ = -mvPosition.z;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vViewZ;')
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= smoothstep(${from.toFixed(1)}, ${to.toFixed(1)}, vViewZ);`);
  };
  m.customProgramCacheKey = () => `near-fade-${from}-${to}`;
  return m;
}

// ---------- aisle ----------

let floorMat: THREE.MeshStandardMaterial;
let floorMaps: THREE.Texture[] = []; // one per zone, all scrolled together
let aisle: THREE.Group; // scrolls by dist % PERIOD
let pools: THREE.Group; // floor light pools, scroll with the aisle
let poolMat: THREE.MeshBasicMaterial;
let farGlow: THREE.Mesh;
let frameMat: THREE.MeshStandardMaterial;
let frameMaps: THREE.Texture[] = [];
let stripMat: THREE.MeshBasicMaterial;
let stripGlowMat: THREE.MeshBasicMaterial;
let signMaps: THREE.Texture[] = [];
let hemi: THREE.HemisphereLight;
let keyLight: THREE.DirectionalLight;
// the parts only some zones have
const decor: Record<Zone['key'], THREE.Object3D[]> = { store: [], forest: [], orbit: [] };
// signs fade out before they pass over the camera
const signs: { m: THREE.MeshBasicMaterial; gz: number }[] = [];

function buildAisle() {
  // floor
  floorMaps = [floorTex(), forestFloorTex(), orbitFloorTex()].map((c) => {
    const t = tex(c, { repeatY: 160 / FLOOR_W });
    t.wrapS = THREE.ClampToEdgeWrapping;
    return t;
  });
  floorMat = new THREE.MeshStandardMaterial({ map: floorMaps[0], color: '#9aa3b0', roughness: 0.28, metalness: 0.2, transparent: true, opacity: 0.74, dithering: true });
  const floor = new THREE.Mesh(floorPlane, floorMat);
  floor.scale.set(FLOOR_W, 1, 160);
  floor.position.set(0, 0, -60);
  floor.renderOrder = -1;
  flat.add(floor);
  mirror.hide.push(flat);
  // the ground past the shelves, for zones without back panels
  const ground = new THREE.Mesh(floorPlane, new THREE.MeshStandardMaterial({ color: '#0d1a10', roughness: 1 }));
  ground.scale.set(60, 1, 160);
  ground.position.set(0, -0.02, -60);
  world.add(ground);
  decor.forest.push(ground);

  aisle = new THREE.Group();
  world.add(aisle);
  pools = new THREE.Group();
  flat.add(pools);

  const frames: THREE.BufferGeometry[] = [];
  const backs: THREE.BufferGeometry[] = [];
  const strips: THREE.BufferGeometry[] = [];
  const stripGlow: THREE.BufferGeometry[] = [];
  const lightGlow: THREE.BufferGeometry[] = [];
  const lights: THREE.BufferGeometry[] = [];
  const trees: THREE.BufferGeometry[] = [];
  const lanterns: THREE.BufferGeometry[] = [];
  const lanternGlow: THREE.BufferGeometry[] = [];
  const arches: THREE.BufferGeometry[] = [];
  const archGlow: THREE.BufferGeometry[] = [];
  const z0 = -8; // game z of the first module
  const n = Math.ceil((92 - z0) / SEG);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const colorize = (geo: THREE.BufferGeometry, c: THREE.Color) => {
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  };
  const poolGeos: THREE.BufferGeometry[] = [];
  const blobMatrices: THREE.Matrix4[] = [];
  const blobShapes: number[] = [];
  const blobColors: string[] = [];
  const botShadows: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const trunkCol = new THREE.Color('#3b2716');
  const leafCols = ['#1f4d2b', '#2a5e31', '#173d24', '#2f6b3a'].map((c) => new THREE.Color(c));
  for (let i = 0; i < n; i++) {
    const gz = z0 + i * SEG; // game z where this module starts
    const k = ((i % 10) + 10) % 10; // pattern slot, so the aisle repeats seamlessly
    for (const side of [-1, 1]) {
      const xf = side * EDGE; // shelf face
      const xc = side * (EDGE + DEPTH / 2); // shelf middle
      const zc = -(gz + SEG / 2);
      // upright, back panel, boards, kick plate, top cap
      // a post at the back only, so the bots stay visible from down the aisle
      frames.push(box(0.1, SHELF_H, 0.07, side * (EDGE + DEPTH - 0.05), SHELF_H / 2, -gz));
      backs.push(box(0.04, SHELF_H, SEG, side * (EDGE + DEPTH), SHELF_H / 2, zc));
      frames.push(box(DEPTH, 0.14, SEG, xc, 0.07, zc));
      for (const by of BOARDS.slice(1)) frames.push(box(DEPTH, 0.05, SEG, xc, by, zc));
      frames.push(box(DEPTH + 0.06, 0.08, SEG, xc, SHELF_H, zc));
      // neon price strips on each board edge, one category color per module
      const pr = rng(k * 97 + (side + 2) * 13);
      const col = new THREE.Color(catColor(PLAY_CATS[Math.floor(pr() * PLAY_CATS.length)]));
      for (const by of BOARDS) {
        const sy = by === BOARDS[0] ? 0.12 : by;
        strips.push(colorize(box(0.015, 0.035, SEG * 0.96, xf + side * -0.005, sy - 0.03, zc), col));
        stripGlow.push(colorize(new THREE.PlaneGeometry(SEG * 0.98, 0.3).rotateY(-side * Math.PI / 2).translate(xf - side * 0.02, sy - 0.03, zc), col));
      }
      // Grok bots on each board: 0 to 2 per board in four slots, so each one
      // has room around it, turned toward the player
      for (let b = 0; b < BOARDS.length; b++) {
        const base = b === 0 ? 0.14 : BOARDS[b] + 0.025;
        const roll = pr();
        // never two bots in neighboring slots
        const layouts = [[], [0], [1], [2], [3], [0, 2], [1, 3], [0, 3], [0, 2], [1, 3]];
        const slotsHere = roll < 0.3 ? layouts[0] : roll < 0.8 ? layouts[1 + Math.floor(pr() * 4)] : layouts[5 + Math.floor(pr() * 5)];
        for (const s of slotsHere) {
          const shape = BOT_SHAPES[Math.floor(pr() * BOT_SHAPES.length)];
          const r = 0.18 + pr() * 0.04;
          const z = (s + 0.5) * (SEG / 4) + (pr() - 0.5) * 0.12;
          const sx = r * shape.w;
          m.compose(
            new THREE.Vector3(side * (EDGE + DEPTH * 0.38), base + r * shape.h * shape.bottom, -(gz + z)),
            q.setFromEuler(new THREE.Euler(0, (side > 0 ? -0.5 : 0.5) + (pr() - 0.5) * 0.25, (pr() - 0.5) * 0.3)),
            new THREE.Vector3(sx, r * shape.h, r),
          );
          blobMatrices.push(m.clone());
          // turn decides which way a polygon points; seed sign mirrors the face
          const seed = 0.01 + pr() * 0.98;
          // bots on the right shelf are mirrored so they point and look toward the aisle
          const turn = shape.turn + (pr() - 0.5) * 0.4;
          blobShapes.push(shape.kind, shape.round, side > 0 ? -Math.PI - turn : turn, side > 0 ? -seed : seed);
          blobColors.push(BLOB_COLORS[Math.floor(pr() * BLOB_COLORS.length)]);
          botShadows.push(floorPlane.clone().scale(sx * 2.4, 1, r * 1.3).translate(side * (EDGE + DEPTH * 0.38), base + 0.004, -(gz + z)));
        }
      }
      // forest: one or two trees behind the shelf, a few lanes back
      const tr = rng(k * 131 + (side + 2) * 7);
      for (let t = 0; t < 2; t++) {
        if (tr() < 0.35) continue;
        const tx = side * (EDGE + DEPTH + 0.9 + tr() * 3.2 + t * 2.2);
        const tz = -(gz + tr() * SEG);
        const h = 7 + tr() * 4;
        const rad = 0.18 + tr() * 0.16;
        // non-indexed, to merge with the icosahedron leaves
        trees.push(colorize(new THREE.CylinderGeometry(rad * 0.75, rad, h, 7).translate(tx, h / 2 - 0.2, tz).toNonIndexed(), trunkCol));
        for (let c = 0; c < 3; c++) {
          const cr = 1.1 + tr() * 0.9;
          const leaf = new THREE.IcosahedronGeometry(cr, 0).scale(1, 0.8, 1).translate(tx + (tr() - 0.5) * 1.2, h - 1.2 + c * 0.7 + tr() * 0.6, tz + (tr() - 0.5) * 1.2);
          trees.push(colorize(leaf, leafCols[Math.floor(tr() * leafCols.length)]));
        }
      }
    }
    if (k % 3 === 0) {
      const zc = -(gz + SEG / 2);
      // store: ceiling lights every third module
      lights.push(box(0.3, 0.04, 1.4, 0, SHELF_H + 1.75, zc));
      lightGlow.push(floorPlane.clone().scale(1.3, 1, 2.6).rotateX(Math.PI).translate(0, SHELF_H + 1.72, zc));
      poolGeos.push(floorPlane.clone().scale(3.2, 1, 3.4).translate(0, 0.012, zc));
      // forest: a string of lanterns across the aisle
      lanterns.push(box(EDGE * 2 + DEPTH * 2, 0.015, 0.015, 0, SHELF_H + 1.05, zc));
      for (const lx of [-1, 0, 1]) {
        const ly = SHELF_H + 0.72 - Math.abs(lx) * 0.18;
        lanterns.push(new THREE.CylinderGeometry(0.004, 0.004, SHELF_H + 1.05 - ly, 4).translate(lx, (SHELF_H + 1.05 + ly) / 2, zc));
        lanterns.push(new THREE.SphereGeometry(0.09, 10, 8).scale(1, 1.25, 1).translate(lx, ly, zc));
        lanternGlow.push(new THREE.PlaneGeometry(0.9, 0.9).translate(lx, ly, zc));
      }
      // orbit: a neon arch over the aisle
      const R = EDGE + DEPTH * 0.6;
      arches.push(new THREE.TorusGeometry(R, 0.05, 6, 40, Math.PI).scale(1, 1.55, 1).translate(0, SHELF_H - 0.4, zc));
      archGlow.push(new THREE.TorusGeometry(R, 0.22, 4, 40, Math.PI).scale(1, 1.55, 1).translate(0, SHELF_H - 0.4, zc));
    }
  }
  // a hanging sign once per pattern; the zones share the meshes and swap the picture
  signMaps = ZONES.map((z) => tex(signTex(z.sign, z.accent)));
  for (let gz = z0 + SEG * 5; gz < 96; gz += PERIOD) {
    const mat = new THREE.MeshBasicMaterial({ map: signMaps[0], toneMapped: false, transparent: true, depthWrite: false, color: new THREE.Color(0.9, 0.9, 0.9) });
    const sign = new THREE.Mesh(unitPlane, mat);
    sign.scale.set(2.3, 0.43, 1);
    sign.position.set(0, SHELF_H + 1.0, -gz);
    signs.push({ m: mat, gz });
    aisle.add(sign);
  }
  // Every zone's frame material has a map, so switching zones swaps a
  // texture instead of compiling a new shader mid-run.
  const metal = tex(metalTex());
  metal.wrapS = metal.wrapT = THREE.RepeatWrapping;
  const wood = tex(woodTex(5, '#8a5a32', '#4a2c14', '#b07a46', 3));
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  frameMaps = [metal, wood, metal];
  frameMat = new THREE.MeshStandardMaterial({ map: metal, color: '#2a3340', roughness: 0.55, metalness: 0.45, dithering: true });
  const frameMesh = new THREE.Mesh(mergeGeometries(frames), frameMat);
  const backMesh = new THREE.Mesh(mergeGeometries(backs), frameMat);
  stripMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2) });
  const stripMesh = new THREE.Mesh(mergeGeometries(strips), stripMat);
  const lightMesh = new THREE.Mesh(mergeGeometries(lights), nearFade(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.05, 1.12, 1.3), toneMapped: false })));
  aisle.add(frameMesh, backMesh, stripMesh, lightMesh);
  // soft glow in place of bloom: a wide faint band behind each strip and a
  // halo under each ceiling light
  const band = tex(bandTex());
  stripGlowMat = new THREE.MeshBasicMaterial({ map: band, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true });
  const glowBand = new THREE.Mesh(mergeGeometries(stripGlow), stripGlowMat);
  const glowLights = new THREE.Mesh(mergeGeometries(lightGlow), nearFade(additive('#cfe4ff', 0.5)));
  // Double-sided and transparent would make three.js draw it twice, back then
  // front, rebuilding the material's shader key each time, every frame.
  // Additive glow looks the same in one pass.
  (glowLights.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
  (glowLights.material as THREE.MeshBasicMaterial).forceSinglePass = true;
  aisle.add(glowBand, glowLights);
  poolMat = additive('#9cc8ff', 0.06);
  pools.add(new THREE.Mesh(mergeGeometries(poolGeos), poolMat));
  [...frames, ...backs, ...strips, ...stripGlow, ...lights, ...lightGlow, ...poolGeos].forEach((g) => g.dispose());

  // forest pieces
  const treeMesh = new THREE.Mesh(mergeGeometries(trees), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
  // Lanterns hang low, so they fade out well before they'd pass over the lens.
  // Additive, so a faded lantern is invisible, not a black ball.
  const lanternMesh = new THREE.Mesh(mergeGeometries(lanterns), nearFade(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.5, 0.55), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 9, 14));
  const lanternHalo = new THREE.Mesh(mergeGeometries(lanternGlow), nearFade(additive('#ffb45e', 0.55), 9, 14));
  aisle.add(treeMesh, lanternMesh, lanternHalo);
  decor.forest.push(treeMesh, lanternMesh, lanternHalo);
  // orbit pieces
  const archMesh = new THREE.Mesh(mergeGeometries(arches), nearFade(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 3.2), toneMapped: false }), 7, 11));
  const archHaloMat = additive('#8a5cff', 0.12);
  archHaloMat.map = null;
  const archHalo = new THREE.Mesh(mergeGeometries(archGlow), nearFade(archHaloMat, 7, 11));
  aisle.add(archMesh, archHalo);
  decor.orbit.push(archMesh, archHalo);
  [...trees, ...lanterns, ...lanternGlow, ...arches, ...archGlow].forEach((g) => g.dispose());

  // all the bots in one instanced draw
  const blobGeo = blobGeometry.clone();
  blobGeo.setAttribute('aShape', new THREE.InstancedBufferAttribute(new Float32Array(blobShapes), 4));
  const bots = new THREE.InstancedMesh(blobGeo, blobMaterial(), blobMatrices.length);
  const c = new THREE.Color();
  blobMatrices.forEach((mm, i) => {
    bots.setMatrixAt(i, mm);
    bots.setColorAt(i, c.set(blobColors[i]));
  });
  bots.instanceMatrix.needsUpdate = true;
  bots.computeBoundingSphere();
  aisle.add(bots);
  mirror.hide.push(bots); // too small in the reflection to be worth drawing twice
  // soft contact shadow under each bot so it sits on the board
  const botShadowMesh = new THREE.Mesh(mergeGeometries(botShadows), shadowMat.clone());
  (botShadowMesh.material as THREE.MeshBasicMaterial).opacity = 0.6;
  aisle.add(botShadowMesh);
  mirror.hide.push(botShadowMesh);

  // ceiling
  // Panels, so the top half of a phone screen has something moving in it.
  // One tile is 1.2 m, which divides the aisle's repeat, so the scroll is seamless.
  const CEIL_W = EDGE * 2 + DEPTH * 2, CEIL_L = PERIOD * 7;
  const ceilMap = tex(ceilingTex());
  ceilMap.wrapS = ceilMap.wrapT = THREE.RepeatWrapping;
  ceilMap.repeat.set(CEIL_W / 4.8, CEIL_L / 4.8);
  const ceil = new THREE.Mesh(floorPlane, new THREE.MeshBasicMaterial({ map: ceilMap, side: THREE.DoubleSide }));
  ceil.scale.set(CEIL_W, 1, CEIL_L);
  ceil.position.set(0, SHELF_H + 1.8, -60);
  // a dim neon runner along each edge of the ceiling, pointing at the vanishing point
  const runners = new THREE.Mesh(
    mergeGeometries([-1, 1].map((sd) => new THREE.BoxGeometry(0.03, 0.02, CEIL_L).translate(sd * (EDGE + DEPTH - 0.12), SHELF_H + 1.78, -60))),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.3, 0.8), toneMapped: false }),
  );
  aisle.add(ceil, runners);
  mirror.hide.push(ceil, runners);
  decor.store.push(backMesh, lightMesh, glowLights, ceil, runners);

  // forest sky: a moon over the end of the aisle and a few stars behind the trees
  const night = new THREE.Group();
  const moon = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ map: tex(moonTex()), transparent: true, fog: false, depthWrite: false, toneMapped: false, color: new THREE.Color(1.15, 1.12, 1) }));
  moon.scale.set(5.2, 5.2, 1);
  moon.position.set(3.4, 19, -88);
  const moonHalo = new THREE.Mesh(unitPlane, additive('#cfe6c8', 0.34));
  (moonHalo.material as THREE.MeshBasicMaterial).fog = false;
  moonHalo.scale.set(30, 30, 1);
  moonHalo.position.set(3.4, 19, -88.5);
  const nightStars = new THREE.MeshBasicMaterial({ map: tex(starsTex()), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.55 });
  (nightStars.map as THREE.Texture).wrapS = (nightStars.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
  (nightStars.map as THREE.Texture).repeat.set(2, 1.4);
  const nightSky = new THREE.Mesh(unitPlane, nightStars);
  nightSky.scale.set(90, 60, 1);
  nightSky.position.set(0, 26, -89);
  night.add(nightSky, moonHalo, moon);
  scene.add(night);
  mirror.hide.push(night);
  decor.forest.push(night);

  // orbit sky: stars on three big panels, far enough out to sit still
  // the same picture as the forest stars, so it uploads once
  const starMat = new THREE.MeshBasicMaterial({ map: (nightStars.map as THREE.Texture).clone(), fog: false, depthWrite: false });
  (starMat.map as THREE.Texture).wrapS = (starMat.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
  (starMat.map as THREE.Texture).repeat.set(3, 2);
  const sky = new THREE.Group();
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(unitPlane, starMat);
    p.scale.set(140, 50, 1);
    p.rotation.y = side * -Math.PI / 2;
    p.position.set(side * 16, 10, -50);
    sky.add(p);
  }
  const top = new THREE.Mesh(unitPlane, starMat);
  top.scale.set(40, 140, 1);
  top.rotation.x = Math.PI / 2;
  top.position.set(0, 18, -50);
  const end = new THREE.Mesh(unitPlane, starMat);
  end.scale.set(60, 40, 1);
  end.position.set(0, 8, -87);
  // a planet past the right-hand racks, clear of the aisle floor
  const planet = new THREE.Mesh(new THREE.SphereGeometry(12, 40, 24), new THREE.MeshStandardMaterial({ color: '#4a3aa8', emissive: '#1a1040', roughness: 0.9, fog: false }));
  planet.position.set(14, -8, -72);
  const rim = new THREE.Mesh(unitPlane, additive('#7a5cff', 0.45));
  (rim.material as THREE.MeshBasicMaterial).fog = false;
  rim.scale.set(34, 34, 1);
  rim.position.set(14, -8, -71);
  sky.add(top, end, planet, rim);
  scene.add(sky);
  mirror.hide.push(sky);
  decor.orbit.push(sky);

  // light at the end of the aisle
  farGlow = new THREE.Mesh(unitPlane, additive('#1d5bd8', 0.22));
  (farGlow.material as THREE.MeshBasicMaterial).fog = false;
  farGlow.scale.set(14, 9, 1);
  farGlow.position.set(0, 1.6, -88);
  scene.add(farGlow);
}

// ---------- zones ----------

let zoneNow = -1;
let boxMaps: THREE.Texture[] = [];
let wallMaps: THREE.Texture[] = [];
let barMaps: THREE.Texture[] = [];

// Dresses the whole scene for a zone. Only uniforms, colors, textures and
// visibility change, so it never stalls on a shader compile.
export function setZone(i: number) {
  const z = ZONES[i % ZONES.length];
  const zi = ZONES.indexOf(z);
  if (zi === zoneNow) return;
  zoneNow = zi;
  BG.set(z.bg);
  const fog = scene.fog as THREE.Fog;
  fog.color.set(z.bg);
  [fog.near, fog.far] = z.fog;
  hemi.color.set(z.hemi[0]);
  hemi.groundColor.set(z.hemi[1]);
  hemi.intensity = z.hemi[2];
  keyLight.color.set(z.key_[0]);
  keyLight.intensity = z.key_[1];
  scene.environmentIntensity = z.env;
  renderer.toneMappingExposure = z.exposure;
  frameMat.map = frameMaps[zi];
  frameMat.color.set(z.frame.tint);
  frameMat.roughness = z.frame.rough;
  frameMat.metalness = z.frame.metal;
  floorMat.map = floorMaps[zi];
  floorMat.color.set(z.floor.tint);
  floorMat.opacity = z.floor.opacity;
  floorMat.roughness = z.floor.rough;
  stripMat.color.setScalar(z.strip);
  stripGlowMat.opacity = z.stripGlow;
  poolMat.color.set(z.pool);
  poolMat.opacity = z.key === 'store' ? 0.06 : 0.09;
  (farGlow.material as THREE.MeshBasicMaterial).color.set(z.far);
  for (const sg of signs) sg.m.map = signMaps[zi];
  for (const [k, list] of Object.entries(decor)) for (const o of list) o.visible = k === z.key;
  cardboardMat.map = boxMaps[zi];
  hazardMat.map = hazardMat.emissiveMap = wallMaps[zi];
  hazardMat.emissive.set(z.key === 'orbit' ? '#1a5a6a' : z.key === 'forest' ? '#1a1206' : '#3a2a00');
  postMat.color.set(z.key === 'forest' ? '#5a3a1e' : z.key === 'orbit' ? '#d8deea' : '#2a2f36');
  barMat.map = barMat.emissiveMap = barMaps[zi];
  barMat.emissive.setScalar(z.key === 'orbit' ? 2.4 : z.key === 'store' ? 0.25 : 0);
  dust.mat.color.set(z.dust.color);
  dust.mat.size = z.dust.size;
  dust.n = z.dust.n;
  dust.flicker = z.dust.flicker;
  dust.rush = z.dust.rush;
  dust.points.geometry.setDrawRange(0, dust.n);
}

// ---------- pooled objects ----------

interface CardView {
  g: THREE.Group;
  face: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  glow: THREE.Mesh;
  frame: THREE.Mesh;
  halo: THREE.Mesh;
  tex: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  v: number;
  painted: number; // frame the canvas was last painted, -1 once it's on the GPU
}
const cardFree: CardView[] = [];
// The card is real rounded-rect geometry, so its edges get the same
// anti-aliasing as everything else. UVs map the card canvas onto it exactly.
function roundedCard(w: number, h: number, r: number) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2 + r, 0);
  sh.lineTo(w / 2 - r, 0);
  sh.absarc(w / 2 - r, r, r, -Math.PI / 2, 0, false);
  sh.lineTo(w / 2, h - r);
  sh.absarc(w / 2 - r, h - r, r, 0, Math.PI / 2, false);
  sh.lineTo(-w / 2 + r, h);
  sh.absarc(-w / 2 + r, h - r, r, Math.PI / 2, Math.PI, false);
  sh.lineTo(-w / 2, r);
  sh.absarc(-w / 2 + r, r, r, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ShapeGeometry(sh, 6);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / h);
  return g;
}
const cardGeo = roundedCard(CARD_SIZE, (CARD_SIZE * CARD_H) / CARD_W, (CARD_SIZE * 22) / CARD_W);
const frameGeo = new RoundedBoxGeometry(CARD_SIZE + 0.06, (CARD_SIZE * CARD_H) / CARD_W + 0.06, 0.03, 2, 0.06).translate(0, (CARD_SIZE * CARD_H) / CARD_W / 2, -0.02);

function newCard(): CardView {
  const g = new THREE.Group();
  // one canvas and one texture for the life of the view; each new bot is
  // painted over the last and uploaded into the same GPU storage
  const canvas = newCardCanvas();
  const t = tex(canvas);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  const mat = new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(0.93, 0.93, 0.93) });
  const face = new THREE.Mesh(cardGeo, mat);
  const frame = new THREE.Mesh(frameGeo, new THREE.MeshBasicMaterial({ toneMapped: false }));
  const glow = new THREE.Mesh(unitPlane, additive('#fff', 0.3));
  glow.layers.set(NO_REFLECT);
  glow.scale.set(2.1, 2.4, 1);
  glow.position.set(0, (CARD_SIZE * CARD_H) / CARD_W / 2, -0.06);
  const halo = new THREE.Mesh(floorPlane, additive('#fff', 0.5));
  halo.scale.set(1.5, 1, 0.9);
  g.add(glow, frame, face);
  return { g, face, mat, glow, frame, halo, tex: t, canvas, v: -1, painted: -1 };
}

function dressCard(c: CardView, e: Ent) {
  const s = e.sub!;
  // Paint now, upload on a later frame (see frame()): the two together are
  // the most expensive thing a frame can hold.
  drawCard(c.canvas, s);
  c.v = cardVersion(c.canvas);
  c.painted = frameNo;
  const col = new THREE.Color(s.viral ? VIRAL : catColor(s.cat));
  const loud = e.kind === 'scam' && s.tier === 0;
  (c.glow.material as THREE.MeshBasicMaterial).color.set(loud ? '#ff2030' : col);
  (c.halo.material as THREE.MeshBasicMaterial).color.set(loud ? '#ff2030' : col);
  const fm = c.frame.material as THREE.MeshBasicMaterial;
  if (loud) fm.color.setRGB(3, 0.15, 0.2);
  else if (s.viral) fm.color.setRGB(3, 0.6, 1.6);
  else fm.color.copy(col).multiplyScalar(0.9);
}

interface BoxView { g: THREE.Group; shadow: THREE.Mesh }
interface WallView { g: THREE.Group; lamps: THREE.MeshBasicMaterial[]; shadow: THREE.Mesh }
const boxFree: BoxView[] = [];
const wallFree: WallView[] = [];
let cardboardMat: THREE.MeshStandardMaterial;
let hazardMat: THREE.MeshStandardMaterial;
let postMat: THREE.MeshStandardMaterial;
let heartGeo: THREE.BufferGeometry;
let heartMat: THREE.MeshStandardMaterial;
let shadowMat: THREE.MeshBasicMaterial;

function shadowBlob(sx: number, sz: number) {
  const s = new THREE.Mesh(floorPlane, shadowMat);
  s.scale.set(sx, 1, sz);
  s.position.y = 0.006;
  return s;
}

function newBox(): BoxView {
  const g = new THREE.Group();
  const a = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.46, 0.56, 2, 0.02), cardboardMat);
  a.position.set(-0.17, 0.23, 0);
  a.rotation.y = 0.08;
  const b = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.34, 0.44, 2, 0.02), cardboardMat);
  b.position.set(0.27, 0.17, 0.05);
  b.rotation.y = -0.15;
  g.add(a, b);
  return { g, shadow: shadowBlob(1.2, 0.9) };
}

const lampGeo = new THREE.SphereGeometry(0.07, 12, 8);
const wallFrameGeo = mergeGeometries(
  [-0.44, 0.44].flatMap((sx) => [
    new THREE.BoxGeometry(0.07, WALL_H, 0.07).translate(sx, WALL_H / 2, 0),
    new THREE.BoxGeometry(0.12, 0.05, 0.42).translate(sx, 0.025, 0),
  ]),
);
function newWall(): WallView {
  const g = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.05, 0.06), [postMat, postMat, postMat, postMat, hazardMat, hazardMat]);
  panel.position.y = 0.88;
  const lamps: THREE.MeshBasicMaterial[] = [];
  for (const sx of [-0.44, 0.44]) {
    const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.3, 0), toneMapped: false });
    const lamp = new THREE.Mesh(lampGeo, lm);
    lamp.position.set(sx, WALL_H + 0.05, 0);
    lamps.push(lm);
    g.add(lamp);
  }
  g.add(panel, new THREE.Mesh(wallFrameGeo, postMat));
  return { g, lamps, shadow: shadowBlob(1.3, 0.7) };
}

// Every like on screen is one instanced draw.
const LIKES = 96;
let likeMesh: THREE.InstancedMesh;
const likeM = new THREE.Matrix4();
const likeQ = new THREE.Quaternion();
const likeP = new THREE.Vector3();
const likeS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
function buildLikes() {
  likeMesh = new THREE.InstancedMesh(heartGeo, heartMat, LIKES);
  likeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  likeMesh.frustumCulled = false;
  likeMesh.count = 0;
  world.add(likeMesh);
}

// A crossbar at head height you slide under: one lane, or all three.
export const BAR_LOW = 0.62; // underside of the bar
interface BarView { g: THREE.Group; shadow: THREE.Mesh }
const barFree: BarView[] = [];
const wideFree: BarView[] = [];
let barMat: THREE.MeshStandardMaterial;
function newBar(wide: boolean): BarView {
  const g = new THREE.Group();
  const w = wide ? 3.3 : 0.98;
  const h = 0.34;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), [postMat, postMat, postMat, postMat, barMat, barMat]);
  beam.position.y = BAR_LOW + h / 2;
  // stretch the texture along a wide bar instead of squashing the words
  const posts = mergeGeometries(
    [-w / 2, w / 2].flatMap((sx) => [
      new THREE.BoxGeometry(0.07, BAR_LOW + h + 0.06, 0.07).translate(sx, (BAR_LOW + h + 0.06) / 2, 0),
      new THREE.BoxGeometry(0.14, 0.05, 0.4).translate(sx, 0.025, 0),
    ]),
  );
  g.add(beam, new THREE.Mesh(posts, postMat));
  return { g, shadow: shadowBlob(w + 0.3, 0.5) };
}

// A runaway cart rolling up the aisle toward you, headlights on.
interface RunawayView { g: THREE.Group; beam: THREE.Mesh; flare: THREE.Mesh[]; beacon: THREE.MeshBasicMaterial; shadow: THREE.Mesh }
const runawayFree: RunawayView[] = [];
let runawayBody: THREE.MeshStandardMaterial;
function newRunaway(): RunawayView {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.66, 0.62, 3, 0.07), runawayBody);
  body.position.y = 0.53;
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.02), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.4, metalness: 0.6 }));
  grille.position.set(0, 0.42, 0.32);
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.2), toneMapped: false });
  const flare: THREE.Mesh[] = [];
  for (const sx of [-0.28, 0.28]) {
    const l = new THREE.Mesh(lampGeo, lamp);
    l.position.set(sx, 0.62, 0.31);
    g.add(l);
    const f = new THREE.Mesh(unitPlane, additive('#fff4d6', 0.8));
    f.position.set(sx, 0.62, 0.36);
    f.scale.setScalar(0.8);
    flare.push(f);
    g.add(f);
  }
  const beacon = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.1), toneMapped: false });
  const bc = new THREE.Mesh(lampGeo, beacon);
  bc.position.set(0, 0.92, 0);
  bc.scale.setScalar(1.3);
  const wg = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 14).rotateZ(Math.PI / 2);
  const wm = new THREE.MeshStandardMaterial({ color: '#0b0d10', roughness: 0.5 });
  for (const [x, z] of [[-0.36, 0.2], [0.36, 0.2], [-0.36, -0.2], [0.36, -0.2]]) {
    const w = new THREE.Mesh(wg, wm);
    w.position.set(x, 0.1, z);
    g.add(w);
  }
  g.add(body, grille, bc);
  // headlight beam on the floor, reaching toward you
  const beam = new THREE.Mesh(floorPlane, additive('#fff0c8', 0.35));
  beam.scale.set(1.3, 1, 4.5);
  return { g, beam, flare, beacon, shadow: shadowBlob(1.2, 0.9) };
}

// The gate between zones: two lit pillars, a beam with the next zone's sign,
// and a glowing sheet you drive through.
interface GateView { g: THREE.Group; lit: THREE.MeshBasicMaterial; sheet: THREE.MeshBasicMaterial; sign: THREE.MeshBasicMaterial; halo: THREE.Mesh }
let gateView: GateView | null = null;
function newGate(): GateView {
  const g = new THREE.Group();
  const lit = new THREE.MeshBasicMaterial({ toneMapped: false });
  const H = 3.0;
  const parts = mergeGeometries([
    new THREE.BoxGeometry(0.2, H, 0.2).translate(-1.68, H / 2, 0),
    new THREE.BoxGeometry(0.2, H, 0.2).translate(1.68, H / 2, 0),
    new THREE.BoxGeometry(3.56, 0.2, 0.2).translate(0, H, 0),
  ]);
  g.add(new THREE.Mesh(parts, lit));
  const sheet = additive('#fff', 0.35);
  const sh = new THREE.Mesh(unitPlane, sheet);
  sh.scale.set(4.6, 4.4, 1);
  sh.position.y = H / 2;
  const sign = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true });
  const sg = new THREE.Mesh(unitPlane, sign);
  sg.scale.set(2.6, 0.49, 1);
  sg.position.set(0, H + 0.42, 0);
  g.add(sh, sg);
  const halo = new THREE.Mesh(floorPlane, additive('#fff', 0.5));
  halo.scale.set(4.2, 1, 1.6);
  return { g, lit, sheet, sign, halo };
}

// ---------- power-ups ----------

interface PowerView { kind: Power; g: THREE.Group; halo: THREE.Mesh }
const powerFree: Record<Power, PowerView[]> = { shield: [], magnet: [], turbo: [] };
const powers = new Map<Ent, PowerView>();
let badgeGeo: THREE.BufferGeometry;
let checkGeo: THREE.BufferGeometry;
let magnetGeo: THREE.BufferGeometry;
let tipGeo: THREE.BufferGeometry;
let badgeMat: THREE.MeshStandardMaterial;
let whiteMat: THREE.MeshStandardMaterial;
let magnetMat: THREE.MeshStandardMaterial;
let tipMat: THREE.MeshStandardMaterial;
let boltGeo: THREE.BufferGeometry;
let boltMat: THREE.MeshStandardMaterial;
const POWER_COLOR: Record<Power, string> = { shield: '#1d9bf0', magnet: '#ff4fa3', turbo: '#ffb020' };

function buildPowerAssets() {
  // the Verified badge: a scalloped rosette with a check
  const rs = new THREE.Shape();
  const N = 12;
  for (let i = 0; i <= N * 8; i++) {
    const a = (i / (N * 8)) * Math.PI * 2;
    const r = 0.3 + 0.035 * Math.cos(a * N);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) rs.moveTo(x, y);
    else rs.lineTo(x, y);
  }
  badgeGeo = new THREE.ExtrudeGeometry(rs, { depth: 0.07, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }).center();
  const ck = new THREE.Shape();
  ck.moveTo(-0.14, 0.0);
  ck.lineTo(-0.05, -0.1);
  ck.lineTo(0.15, 0.11);
  ck.lineTo(0.11, 0.15);
  ck.lineTo(-0.05, -0.02);
  ck.lineTo(-0.1, 0.04);
  ck.closePath();
  checkGeo = new THREE.ExtrudeGeometry(ck, { depth: 0.04, bevelEnabled: false }).center().translate(0, 0, 0.07);
  badgeMat = new THREE.MeshStandardMaterial({ color: '#1d9bf0', emissive: '#1d9bf0', emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.2 });
  whiteMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.15 });
  // the magnet: a horseshoe with silver tips
  magnetGeo = new THREE.TorusGeometry(0.2, 0.075, 12, 28, Math.PI).rotateZ(Math.PI);
  tipGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.12, 14);
  magnetMat = new THREE.MeshStandardMaterial({ color: '#ff3d6e', emissive: '#ff2d5a', emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.2 });
  tipMat = new THREE.MeshStandardMaterial({ color: '#dfe6ee', roughness: 0.2, metalness: 0.9 });
  // Turbo: a lightning bolt
  const bs = new THREE.Shape();
  bs.moveTo(0.06, 0.34);
  bs.lineTo(-0.16, 0.0);
  bs.lineTo(-0.01, 0.0);
  bs.lineTo(-0.08, -0.34);
  bs.lineTo(0.17, 0.06);
  bs.lineTo(0.02, 0.06);
  bs.closePath();
  boltGeo = new THREE.ExtrudeGeometry(bs, { depth: 0.08, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 }).center();
  boltMat = new THREE.MeshStandardMaterial({ color: '#ffc21a', emissive: '#ff8a00', emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.3 });
}

function newPower(kind: Power): PowerView {
  const g = new THREE.Group();
  if (kind === 'turbo') g.add(new THREE.Mesh(boltGeo, boltMat));
  else if (kind === 'shield') {
    g.add(new THREE.Mesh(badgeGeo, badgeMat), new THREE.Mesh(checkGeo, whiteMat));
    const back = new THREE.Mesh(checkGeo, whiteMat);
    back.rotation.y = Math.PI;
    g.add(back);
  } else {
    g.add(new THREE.Mesh(magnetGeo, magnetMat));
    for (const sx of [-0.2, 0.2]) {
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.set(sx, -0.06, 0);
      g.add(tip);
    }
  }
  const halo = new THREE.Mesh(floorPlane, additive(POWER_COLOR[kind], 0.5));
  halo.scale.set(1.4, 1, 1.4);
  return { kind, g, halo };
}

const cards = new Map<Ent, CardView>();
const boxes = new Map<Ent, BoxView>();
const walls = new Map<Ent, WallView>();
const bars = new Map<Ent, BarView>();
const runaways = new Map<Ent, RunawayView>();
let gateEnt: Ent | null = null;
const flyers: { c: CardView; t: number; from: THREE.Vector3; slot: number }[] = [];

function releaseCard(c: CardView) {
  c.g.removeFromParent();
  c.halo.removeFromParent();
  cardFree.push(c);
}

// ---------- player cart ----------

const cart = new THREE.Group();
const cartBody = new THREE.Group();
let trimMat: THREE.MeshBasicMaterial;
const slotMats: THREE.MeshBasicMaterial[] = [];
const slotKeys: string[] = ['', '', '', ''];
const wheels: THREE.Mesh[] = [];
let underGlow: THREE.Mesh;
let cartShadow: THREE.Mesh;
let cartLight: THREE.PointLight;
let headLight: THREE.PointLight;

let bubble: THREE.Mesh;
let bubbleMat: THREE.ShaderMaterial;
let magRing: THREE.Mesh;
let bubblePop = 0;

function buildCartFx() {
  // a glassy bubble with a bright rim, for the Verified shield
  bubbleMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0.35, 1.2, 2.6) }, uAlpha: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); vY = position.y;
      gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vY;
      void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
      float band = 0.5 + 0.5 * sin(vY * 18.0 - uTime * 4.0);
      gl_FragColor = vec4(uColor * (f * 1.1 + band * 0.06), (f * 0.9 + 0.05) * uAlpha); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  bubble = new THREE.Mesh(new THREE.SphereGeometry(0.72, 32, 20), bubbleMat);
  bubble.scale.set(1, 0.82, 0.9);
  bubble.position.y = 0.5;
  bubble.visible = false;
  cart.add(bubble);
  magRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.86, 48).rotateX(-Math.PI / 2), additive('#ff4fa3', 0.8));
  (magRing.material as THREE.MeshBasicMaterial).map = null;
  magRing.position.y = 0.02;
  magRing.visible = false;
  flat.add(magRing);
}

export function shieldPop() {
  bubblePop = 1;
  const p = cart.position;
  burst(p.x, 0.6, 0, '#1d9bf0', 40, 4);
}

function buildCart() {
  const dark = new THREE.MeshStandardMaterial({ color: '#151a21', roughness: 0.35, metalness: 0.6 });
  const inner = new THREE.MeshStandardMaterial({ color: '#0a0d12', roughness: 0.8 });
  trimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 3), toneMapped: false });
  const W = 0.9, H = 0.62, D = 0.56, Y = 0.2;
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 3, 0.06), dark);
  body.position.y = Y + H / 2;
  cartBody.add(body);
  // 2x2 slots on the back face, toward the camera
  const sw = 0.36, sh = 0.23;
  const wells: THREE.BufferGeometry[] = [];
  const trimGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const cx = (i % 2 ? 1 : -1) * 0.2;
    const cy = Y + H / 2 + (i < 2 ? 1 : -1) * 0.14;
    wells.push(new THREE.BoxGeometry(sw + 0.02, sh + 0.02, 0.02).translate(cx, cy, D / 2 + 0.002));
    // always has a map (the glow, invisible at opacity 0), so filling a slot
    // swaps a texture and never rebuilds the shader
    const sm = new THREE.MeshBasicMaterial({ map: GLOW, toneMapped: false, transparent: true, opacity: 0, color: new THREE.Color(0.95, 0.95, 0.95) });
    const slot = new THREE.Mesh(unitPlane, sm);
    slot.scale.set(sh * 0.98, sh * 0.98, 1);
    slot.position.set(cx, cy, D / 2 + 0.016);
    slotMats.push(sm);
    cartBody.add(slot);
  }
  // neon trim around the back face and along the base
  const t = 0.022;
  const trims = [
    [W - 0.06, t, 0, Y + H - 0.01],
    [W - 0.06, t, 0, Y + 0.01],
    [t, H - 0.06, -W / 2 + 0.005, Y + H / 2],
    [t, H - 0.06, W / 2 - 0.005, Y + H / 2],
  ];
  for (const [w, h, x, y] of trims) trimGeos.push(new THREE.BoxGeometry(w, h, 0.02).translate(x, y, D / 2 + 0.01));
  trimGeos.push(new THREE.BoxGeometry(W - 0.04, 0.025, D - 0.04).translate(0, Y - 0.01, 0));
  cartBody.add(new THREE.Mesh(mergeGeometries(trimGeos), trimMat), new THREE.Mesh(mergeGeometries(wells), inner));
  // wheels
  const wg = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 18).rotateZ(Math.PI / 2);
  const wm = new THREE.MeshStandardMaterial({ color: '#0b0d10', roughness: 0.5, metalness: 0.3 });
  const hubm = new THREE.MeshStandardMaterial({ color: '#8b98a5', roughness: 0.3, metalness: 0.9 });
  for (const [x, z] of [[-0.36, 0.2], [0.36, 0.2], [-0.36, -0.2], [0.36, -0.2]]) {
    const w = new THREE.Mesh(wg, wm);
    w.position.set(x, 0.1, z);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.085, 10).rotateZ(Math.PI / 2), hubm);
    w.add(hub);
    wheels.push(w);
    cartBody.add(w);
  }
  // push bar on the near side, so it reads as a cart you're pushing
  const bar = mergeGeometries([
    new THREE.CylinderGeometry(0.02, 0.02, W - 0.12, 10).rotateZ(Math.PI / 2).translate(0, Y + H + 0.16, D / 2 + 0.1),
    ...[-1, 1].map((sd) => new THREE.CylinderGeometry(0.016, 0.016, 0.24, 8).rotateX(-0.5).translate(sd * (W / 2 - 0.08), Y + H + 0.06, D / 2 + 0.045)),
  ]);
  cartBody.add(new THREE.Mesh(bar, hubm));
  cart.add(cartBody);
  cartLight = new THREE.PointLight('#1d9bf0', 2.2, 2.6, 2);
  cartLight.position.set(0, 0.4, 0.2);
  cart.add(cartLight);
  headLight = new THREE.PointLight('#dfeaff', 3.2, 6, 1.8);
  headLight.position.set(0, 0.9, -2.2);
  cart.add(headLight);
  world.add(cart);
  underGlow = new THREE.Mesh(floorPlane, additive('#1d9bf0', 0.3));
  underGlow.scale.set(1.9, 1, 1.5);
  underGlow.position.y = 0.014;
  cartShadow = shadowBlob(1.15, 0.8);
  flat.add(underGlow, cartShadow);
}

// ---------- particles ----------

const PN = 420;
const pPos = new Float32Array(PN * 3).fill(-999);
const pCol = new Float32Array(PN * 3);
const pVel = new Float32Array(PN * 3);
const pLife = new Float32Array(PN);
const pMax = new Float32Array(PN).fill(1);
let pNext = 0;
let points: THREE.Points;

function buildParticles() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 0.16, map: GLOW, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  points.frustumCulled = false;
  scene.add(points);
}

const burstCols = new Map<string, THREE.Color>();
export function burst(x: number, y: number, z: number, color: string, n = 18, speed = 3) {
  let c = burstCols.get(color);
  if (!c) burstCols.set(color, (c = new THREE.Color(color).multiplyScalar(2.2)));
  for (let i = 0; i < n; i++) {
    const k = pNext++ % PN;
    pPos[k * 3] = x;
    pPos[k * 3 + 1] = y;
    pPos[k * 3 + 2] = -z;
    const a = Math.random() * Math.PI * 2;
    const up = Math.random();
    pVel[k * 3] = Math.cos(a) * speed * (0.4 + Math.random());
    pVel[k * 3 + 1] = speed * (0.6 + up * 1.4);
    pVel[k * 3 + 2] = Math.sin(a) * speed * (0.4 + Math.random()) + 2;
    c.toArray(pCol, k * 3);
    pLife[k] = 0;
    pMax[k] = 0.45 + Math.random() * 0.45;
  }
}

function stepParticles(dt: number) {
  for (let k = 0; k < PN; k++) {
    if (pPos[k * 3 + 1] < -500) continue;
    pLife[k] += dt;
    if (pLife[k] >= pMax[k]) {
      pPos[k * 3 + 1] = -999;
      continue;
    }
    pVel[k * 3 + 1] -= 9 * dt;
    pPos[k * 3] += pVel[k * 3] * dt;
    pPos[k * 3 + 1] += pVel[k * 3 + 1] * dt;
    pPos[k * 3 + 2] += pVel[k * 3 + 2] * dt;
    const f = 1 - dt * 2.2;
    pCol[k * 3] *= f;
    pCol[k * 3 + 1] *= f;
    pCol[k * 3 + 2] *= f;
  }
  points.geometry.attributes.position.needsUpdate = true;
  points.geometry.attributes.color.needsUpdate = true;
}

// ---------- air: dust or fireflies, and speed lines ----------

const DN = 160;
const dust = {
  points: null as unknown as THREE.Points,
  mat: null as unknown as THREE.PointsMaterial,
  pos: new Float32Array(DN * 3),
  col: new Float32Array(DN * 3),
  ph: new Float32Array(DN),
  base: new THREE.Color(),
  n: 90,
  flicker: 0,
  rush: 0,
};
const LN = 36;
const lines = {
  seg: null as unknown as THREE.LineSegments,
  mat: null as unknown as THREE.LineBasicMaterial,
  pos: new Float32Array(LN * 6),
  z: new Float32Array(LN),
};
function placeLine(i: number, z: number) {
  // in a ring around the view, never across the middle of the aisle
  const a = Math.random() * Math.PI * 2;
  const r = 1.9 + Math.random() * 1.6;
  lines.pos[i * 6] = lines.pos[i * 6 + 3] = Math.cos(a) * r;
  lines.pos[i * 6 + 1] = lines.pos[i * 6 + 4] = 1.9 + Math.sin(a) * r * 0.9;
  lines.z[i] = z;
}

function buildAir() {
  const r = rng(99);
  for (let i = 0; i < DN; i++) {
    dust.pos[i * 3] = (r() - 0.5) * 5.4;
    dust.pos[i * 3 + 1] = 0.2 + r() * 4.6;
    dust.pos[i * 3 + 2] = 3 - r() * 68;
    dust.ph[i] = r() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(dust.pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(dust.col, 3));
  dust.mat = new THREE.PointsMaterial({ size: 0.05, map: GLOW, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  dust.points = new THREE.Points(geo, dust.mat);
  dust.points.frustumCulled = false;
  scene.add(dust.points);
  for (let i = 0; i < LN; i++) placeLine(i, -Math.random() * 40);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lines.pos, 3));
  lines.mat = new THREE.LineBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  lines.seg = new THREE.LineSegments(lg, lines.mat);
  lines.seg.frustumCulled = false;
  scene.add(lines.seg);
  mirror.hide.push(dust.points, lines.seg);
}

function stepAir(time: number, dt: number, v: number, streak: number) {
  const move = v * dt * (1 + dust.rush * 0.8);
  const c = dust.base.copy(dust.mat.color);
  for (let i = 0; i < dust.n; i++) {
    const k = i * 3;
    dust.pos[k + 2] += move + dt * 0.3;
    dust.pos[k] += Math.sin(time * 0.7 + dust.ph[i]) * dt * 0.15;
    dust.pos[k + 1] += Math.cos(time * 0.5 + dust.ph[i]) * dt * 0.1;
    if (dust.pos[k + 2] > 4) dust.pos[k + 2] -= 68;
    // fireflies blink; dust just glints
    const b = dust.flicker ? Math.max(0, Math.sin(time * (1.3 + (dust.ph[i] % 1.7)) + dust.ph[i])) ** 3 : 0.55;
    dust.col[k] = c.r * b;
    dust.col[k + 1] = c.g * b;
    dust.col[k + 2] = c.b * b;
  }
  dust.points.geometry.attributes.position.needsUpdate = true;
  dust.points.geometry.attributes.color.needsUpdate = true;
  // speed lines: streaks along the edges of the view, longer the faster you go
  lines.mat.opacity += (streak * 0.55 - lines.mat.opacity) * Math.min(1, dt * 6);
  lines.seg.visible = lines.mat.opacity > 0.01;
  if (!lines.seg.visible) return;
  const len = 1.5 + v * 0.18;
  for (let i = 0; i < LN; i++) {
    lines.z[i] += v * dt * 1.6;
    if (lines.z[i] > 6) placeLine(i, lines.z[i] - 46 - Math.random() * 6);
    lines.pos[i * 6 + 2] = lines.z[i];
    lines.pos[i * 6 + 5] = lines.z[i] - len;
  }
  lines.seg.geometry.attributes.position.needsUpdate = true;
}

// ---------- floating text ----------

const floaters: { el: HTMLDivElement; p: THREE.Vector3; t: number }[] = [];
export function floater(x: number, y: number, z: number, text: string, color = '#fff') {
  const el = document.createElement('div');
  el.className = 'float';
  el.textContent = text;
  el.style.color = color;
  fx.appendChild(el);
  floaters.push({ el, p: new THREE.Vector3(x, y, -z), t: 0 });
}

const tmp = new THREE.Vector3();
const scr = { x: 0, y: 0 };
function toScreen(p: THREE.Vector3) {
  tmp.copy(p).project(camera);
  scr.x = (tmp.x * 0.5 + 0.5) * W;
  scr.y = (-tmp.y * 0.5 + 0.5) * H;
  return scr;
}

// ---------- events from the game ----------

// The grabbed card flies into its cart slot.
export function collect(e: Ent, slot: number) {
  const c = cards.get(e);
  if (!c) return;
  cards.delete(e);
  c.halo.removeFromParent();
  flyers.push({ c, t: 0, from: c.g.position.clone(), slot });
}

let kick = 0;
let red = 0;
export function hit() {
  red = 1;
  kick = 1;
}
let pulse = 0;
export function publish() {
  pulse = 1;
  blobUniforms.uCheer.value = 1;
  const p = cart.position;
  burst(p.x, 0.8, 0, '#ffd75e', 40, 4.5);
}

// ---------- setup ----------

export function init(canvas: HTMLCanvasElement) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.autoClear = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset = false;
  aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 26, 66);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;
  pm.dispose();

  hemi = new THREE.HemisphereLight('#8fb3ff', '#0b0b14', 0.45);
  keyLight = new THREE.DirectionalLight('#ffffff', 0.75);
  keyLight.position.set(0.5, 6, 3);
  scene.add(hemi, keyLight);

  GLOW = tex(glowTex());
  shadowMat = new THREE.MeshBasicMaterial({ map: GLOW, color: '#000', transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  boxMaps = [tex(cardboardTex()), tex(woodTex(9, '#a8743e', '#5e3a1a', '#c99a5e', 3)), tex(cargoTex())];
  wallMaps = [tex(hazardTex()), tex(hazardTex('TRAIL CLOSED', '#7a4a22', '#2a170a', '#e8d6b0')), tex(hazardTex('AIRLOCK', '#3ad6ff', '#10142a', '#e8f6ff'))];
  barMaps = [tex(barTex('sale')), tex(barTex('branch')), tex(barTex('laser'))];
  cardboardMat = new THREE.MeshStandardMaterial({ map: boxMaps[0], roughness: 0.85 });
  hazardMat = new THREE.MeshStandardMaterial({ map: wallMaps[0], emissiveMap: wallMaps[0], roughness: 0.45, metalness: 0.1, emissive: '#3a2a00', emissiveIntensity: 0.6 });
  barMat = new THREE.MeshStandardMaterial({ map: barMaps[0], emissiveMap: barMaps[0], roughness: 0.5, emissive: '#404040' });
  runawayBody = new THREE.MeshStandardMaterial({ color: '#d8432f', roughness: 0.35, metalness: 0.5 });
  postMat = new THREE.MeshStandardMaterial({ color: '#2a2f36', roughness: 0.4, metalness: 0.7 });
  const hs = new THREE.Shape();
  hs.moveTo(0, -0.12);
  hs.bezierCurveTo(-0.02, -0.1, -0.16, -0.02, -0.16, 0.06);
  hs.bezierCurveTo(-0.16, 0.14, -0.06, 0.17, 0, 0.1);
  hs.bezierCurveTo(0.06, 0.17, 0.16, 0.14, 0.16, 0.06);
  hs.bezierCurveTo(0.16, -0.02, 0.02, -0.1, 0, -0.12);
  heartGeo = new THREE.ExtrudeGeometry(hs, { depth: 0.06, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2, curveSegments: 10 }).center();
  heartMat = new THREE.MeshStandardMaterial({ color: '#ff3d8f', emissive: '#ff2d7a', emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.2 });

  buildAisle();
  buildCart();
  buildCartFx();
  buildPowerAssets();
  buildParticles();
  buildAir();
  buildLikes();
  camera.layers.enable(NO_REFLECT);
  mirror.hide.push(points, farGlow);
  mirror.reflect = quality >= 2;
  resize();
  setZone(0);
  prewarm();
  addEventListener('resize', resize);
}

function resize() {
  W = innerWidth;
  H = innerHeight;
  // ?dpr=3 lifts the cap, for crisp video captures
  const cap = Number(new URLSearchParams(location.search).get('dpr')) || (quality >= 2 ? 2 : quality === 1 ? 1.75 : 1.25);
  const dpr = Math.min(devicePixelRatio || 1, cap);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}

// Steps quality down if the device can't hold about 50 fps. The menu screen
// renders the aisle too, so most phones settle before the first run starts.
let slowFrames = 0;
let sampled = -30; // skip the first frames, while things warm up
function adapt(raw: number) {
  if (pinned || quality === 0 || raw <= 0) return;
  sampled++;
  if (sampled <= 0) return;
  if (raw > 1 / 50) slowFrames++;
  if (sampled < 60) return;
  if (slowFrames > 30) {
    quality--;
    mirror.reflect = quality >= 2;
    resize();
    sampled = -20;
  } else sampled = 0;
  slowFrames = 0;
}

// Compiles every shader the run will need now, so the first scam, power-up
// or grab doesn't stall a frame on a phone.
function prewarm() {
  // Whole pools, not one of each: a view built mid-run brings new materials,
  // and the renderer spends a few milliseconds checking each one the first
  // time it draws. A busy stretch shows about this many of each at once.
  const many = <T,>(n: number, make: () => T) => Array.from({ length: n }, make);
  const cs = many(16, newCard);
  const bs = many(6, newBox);
  const ws = many(6, newWall);
  const ps = (['shield', 'magnet', 'turbo'] as const).map((k) => newPower(k));
  const brs = many(4, () => newBar(false));
  const bws = many(2, () => newBar(true));
  const rus = many(2, newRunaway);
  gateView = newGate();
  gateView.sign.map = signMaps[1];
  const parts = [...cs, ...bs, ...ws, ...ps, ...brs, ...bws, ...rus, gateView].map((v) => v.g);
  const decals = [
    ...cs.map((c) => c.halo),
    ...[...bs, ...ws, ...brs, ...bws, ...rus].map((v) => v.shadow),
    ...ps.map((p) => p.halo),
    ...rus.map((r) => r.beam),
    gateView.halo,
  ];
  parts.forEach((o, i) => o.position.set((i % 5) - 2, 0.5, -8 - Math.floor(i / 5) * 2));
  world.add(...parts);
  flat.add(...decals);
  likeMesh.count = 1; // so its instanced shader compiles now too
  bubble.visible = true;
  magRing.visible = true;
  // every zone's pieces, and every zone's textures, go to the GPU now
  const hidden: THREE.Object3D[] = [];
  for (const list of Object.values(decor)) for (const o of list) if (!o.visible) (hidden.push(o), (o.visible = true));
  renderer.compile(scene, camera);
  // Compiling isn't the whole cost: the renderer also sets up each material
  // the first time it really draws. One real frame now, behind the loading
  // screen, so the first gate into a new zone doesn't pay for it mid-run.
  const culled: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (o.frustumCulled) (culled.push(o), (o.frustumCulled = false));
  });
  camera.position.set(0, 3.05, 6.1);
  camera.lookAt(0, 0.55, -9);
  draw();
  for (const o of culled) o.frustumCulled = true;
  for (const t of [...floorMaps, ...frameMaps, ...signMaps, ...boxMaps, ...wallMaps, ...barMaps, ...cs.map((c) => c.tex)]) renderer.initTexture(t);
  for (const o of hidden) o.visible = false;
  bubble.visible = false;
  magRing.visible = false;
  likeMesh.count = 0;
  for (const o of [...parts, ...decals]) o.removeFromParent();
  cardFree.push(...cs);
  boxFree.push(...bs);
  wallFree.push(...ws);
  for (const p of ps) powerFree[p.kind].push(p);
  barFree.push(...brs);
  wideFree.push(...bws);
  runawayFree.push(...rus);
}

// ---------- per frame ----------

// one texture per emoji tile, kept: the same few tiles come back all run
const tileTexs = new Map<HTMLCanvasElement, THREE.Texture>();
function tileTex(c: HTMLCanvasElement) {
  let t = tileTexs.get(c);
  if (!t) tileTexs.set(c, (t = tex(c)));
  return t;
}
let frameNo = 0;
let wheelSpin = 0;
const cartCol = new THREE.Color();
const live = new Set<Ent>();
const flyTo = new THREE.Vector3();
let wasAir = false;
let roll = 0;

// Knocked flying by Turbo: up, out to the side, spinning, then gone.
function fling(o: THREE.Object3D, e: Ent, t: number, ps: number) {
  const st = t - (e.smash ?? t);
  const side = e.lane === 0 ? (e.seed % 2 < 1 ? -1 : 1) : Math.sign(e.lane);
  o.position.x += side * st * 5;
  o.position.y += st * 7 - st * st * 9;
  o.rotation.z = side * st * 9;
  o.rotation.x = st * 6;
  o.scale.setScalar(ps * Math.max(0.001, 1 - Math.max(0, st - 0.35) * 2.5));
}

export function frame(S: View, time: number, raw: number, dt: number) {
  adapt(raw);
  // scroll the aisle; the pattern repeats every PERIOD so the wrap is invisible
  const off = S.dist % PERIOD;
  aisle.position.z = off;
  pools.position.z = off;
  const fy = (S.dist / FLOOR_W) % 1;
  for (const t of floorMaps) t.offset.y = fy;
  blobUniforms.uTime.value = time;
  blobUniforms.uCheer.value = Math.max(0, blobUniforms.uCheer.value - dt * 0.9);
  for (const sg of signs) sg.m.opacity = Math.max(0, Math.min(1, (sg.gz - off - 6) / 7));

  // entities
  live.clear();
  // at most one new card is painted and uploaded per frame, so a row of three
  // doesn't land in a single frame
  let cardBudget = 1;
  let uploads = 1;
  let nLikes = 0;
  frameNo++;
  for (const e of S.ents) {
    // past the cart things would swell across the lens, so they leave the view
    if (e.z > 70 || e.z < -1.6) continue;
    const ps = e.z < -0.7 ? Math.max(0.001, 1 + (e.z + 0.7) / 0.9) : 1;
    const smashed = e.smash !== undefined;
    if (e.done && !smashed && e.kind !== 'box' && e.kind !== 'wall' && e.kind !== 'bar' && e.kind !== 'barwide' && e.kind !== 'runaway') continue;
    if (smashed && S.t - e.smash! > 0.8) continue;
    live.add(e);
    if (e.kind === 'bot' || e.kind === 'scam' || e.kind === 'dupe') {
      let c = cards.get(e);
      if (!c) {
        // wait until it's deep in the fog's near half, then take a turn
        if (e.z > 60 || cardBudget <= 0) {
          live.delete(e);
          continue;
        }
        cardBudget--;
        c = cardFree.pop() ?? newCard();
        dressCard(c, e);
        cards.set(e, c);
        world.add(c.g);
        flat.add(c.halo);
      }
      if (cardVersion(c.canvas) !== c.v) {
        // its avatar arrived and the canvas repainted itself
        c.v = cardVersion(c.canvas);
        if (c.painted < 0) c.painted = frameNo - 1;
      }
      // one upload a frame, never on the frame that painted a card
      if (c.painted >= 0 && c.painted < frameNo && uploads > 0 && cardBudget > 0) {
        uploads--;
        cardBudget = 0; // and no paint on the frame that uploads
        c.painted = -1;
        c.tex.needsUpdate = true;
      }
      let jx = 0;
      let sx = 1;
      if (e.kind === 'scam') {
        // the twitch: a short glitch every 0.8 seconds
        const ph = (time + e.seed) % 0.8;
        if (ph < 0.14) {
          const k = e.sub?.tier === 0 ? 1 : 0.6;
          jx = Math.sin(time * 95) * 0.07 * k;
          sx = 1 + Math.sin(time * 70) * 0.05 * k;
        }
        const gm = c.glow.material as THREE.MeshBasicMaterial;
        gm.opacity = e.sub?.tier === 0 ? 0.45 + 0.25 * Math.sin(time * 12) : 0.25;
      } else {
        (c.glow.material as THREE.MeshBasicMaterial).opacity = e.sub?.viral ? 0.55 + 0.2 * Math.sin(time * 6) : 0.26;
      }
      const ex = e.x ?? e.lane;
      c.g.position.set(ex + jx, 0.14 + Math.sin(time * 2.6 + e.seed) * 0.04, -e.z);
      c.g.rotation.set(0, Math.sin(time * 1.2 + e.seed) * 0.1, 0);
      c.face.scale.x = sx;
      c.g.scale.setScalar(ps);
      c.halo.position.set(ex, 0.013, -e.z);
      c.halo.visible = !smashed;
      if (smashed) fling(c.g, e, S.t, ps);
    } else if (e.kind === 'box') {
      let b = boxes.get(e);
      if (!b) {
        b = boxFree.pop() ?? newBox();
        boxes.set(e, b);
        world.add(b.g);
        flat.add(b.shadow);
      }
      b.g.position.set(e.lane, 0, -e.z);
      b.g.rotation.set(0, (e.seed % 1) * 0.3 - 0.15, 0);
      b.g.scale.setScalar(ps);
      b.shadow.position.set(e.lane, 0.006, -e.z);
      b.shadow.visible = !smashed;
      if (smashed) fling(b.g, e, S.t, ps);
    } else if (e.kind === 'wall') {
      let w = walls.get(e);
      if (!w) {
        w = wallFree.pop() ?? newWall();
        walls.set(e, w);
        world.add(w.g);
        flat.add(w.shadow);
      }
      w.g.position.set(e.lane, 0, -e.z);
      w.g.rotation.set(0, 0, 0);
      w.g.scale.setScalar(ps);
      w.shadow.position.set(e.lane, 0.006, -e.z);
      w.shadow.visible = !smashed;
      if (smashed) fling(w.g, e, S.t, ps);
      const on = Math.floor(time * 3 + e.seed) % 2;
      w.lamps[0].color.setRGB(on ? 3.5 : 0.4, on ? 1.4 : 0.15, 0);
      w.lamps[1].color.setRGB(on ? 0.4 : 3.5, on ? 0.15 : 1.4, 0);
    } else if (e.kind === 'bar' || e.kind === 'barwide') {
      let b = bars.get(e);
      const wide = e.kind === 'barwide';
      if (!b) {
        b = (wide ? wideFree : barFree).pop() ?? newBar(wide);
        bars.set(e, b);
        world.add(b.g);
        flat.add(b.shadow);
      }
      const bx = wide ? 0 : e.lane;
      b.g.position.set(bx, 0, -e.z);
      b.g.rotation.set(0, 0, 0);
      b.g.scale.setScalar(ps);
      b.shadow.position.set(bx, 0.006, -e.z);
      b.shadow.visible = !smashed;
      if (smashed) fling(b.g, e, S.t, ps);
    } else if (e.kind === 'runaway') {
      let r = runaways.get(e);
      if (!r) {
        r = runawayFree.pop() ?? newRunaway();
        runaways.set(e, r);
        world.add(r.g);
        flat.add(r.shadow, r.beam);
      }
      r.g.position.set(e.lane, 0, -e.z);
      // a little wobble, like a cart with one bad wheel
      r.g.rotation.set(0, Math.sin(time * 9 + e.seed) * 0.06, Math.sin(time * 13 + e.seed) * 0.02);
      r.g.scale.setScalar(ps);
      r.shadow.position.set(e.lane, 0.006, -e.z);
      r.beam.position.set(e.lane, 0.016, -e.z + 2.6);
      r.shadow.visible = r.beam.visible = !smashed;
      const blink = Math.floor(time * 6) % 2;
      r.beacon.color.setRGB(blink ? 3.2 : 0.3, blink ? 0.5 : 0.05, 0.1);
      for (const f of r.flare) f.scale.setScalar(0.7 + 0.15 * Math.sin(time * 20 + e.seed));
      if (smashed) fling(r.g, e, S.t, ps);
    } else if (e.kind === 'gate') {
      const g = gateView!;
      if (gateEnt !== e) {
        gateEnt = e;
        const z = ZONES[(e.zone ?? 0) % ZONES.length];
        const col = new THREE.Color(z.accent);
        g.lit.color.copy(col).multiplyScalar(2.6);
        g.sheet.color.copy(col);
        (g.halo.material as THREE.MeshBasicMaterial).color.copy(col);
        g.sign.map = signMaps[ZONES.indexOf(z)];
        g.sign.needsUpdate = true;
        world.add(g.g);
        flat.add(g.halo);
      }
      g.g.position.set(0, 0, -e.z);
      g.halo.position.set(0, 0.014, -e.z);
      g.sheet.opacity = 0.22 + 0.1 * Math.sin(time * 5) + Math.max(0, 1 - e.z / 6) * 0.4;
    } else if (e.kind === 'power') {
      let p = powers.get(e);
      if (!p) {
        p = powerFree[e.power!].pop() ?? newPower(e.power!);
        powers.set(e, p);
        world.add(p.g);
        flat.add(p.halo);
      }
      const px = e.x ?? e.lane;
      p.g.position.set(px, 0.62 + Math.sin(time * 3 + e.seed) * 0.08, -e.z);
      p.g.rotation.y = time * 2.2;
      p.g.scale.setScalar(1.35 * ps);
      p.halo.position.set(px, 0.013, -e.z);
      (p.halo.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.2 * Math.sin(time * 6);
    } else if (e.kind === 'like' && nLikes < LIKES) {
      likeP.set(e.x ?? e.lane, 0.42 + Math.sin(time * 4 + e.seed) * 0.05, -e.z);
      likeQ.setFromAxisAngle(UP, time * 3 + e.seed);
      likeMesh.setMatrixAt(nLikes++, likeM.compose(likeP, likeQ, likeS.setScalar(ps)));
    }
  }
  likeMesh.count = nLikes;
  likeMesh.instanceMatrix.needsUpdate = true;
  for (const [e, c] of cards) if (!live.has(e)) (cards.delete(e), releaseCard(c));
  for (const [e, b] of boxes) if (!live.has(e)) (boxes.delete(e), b.g.removeFromParent(), b.shadow.removeFromParent(), boxFree.push(b));
  for (const [e, w] of walls) if (!live.has(e)) (walls.delete(e), w.g.removeFromParent(), w.shadow.removeFromParent(), wallFree.push(w));
  for (const [e, b] of bars)
    if (!live.has(e)) {
      bars.delete(e);
      b.g.removeFromParent();
      b.shadow.removeFromParent();
      (e.kind === 'barwide' ? wideFree : barFree).push(b);
    }
  for (const [e, r] of runaways)
    if (!live.has(e)) {
      runaways.delete(e);
      r.g.removeFromParent();
      r.shadow.removeFromParent();
      r.beam.removeFromParent();
      runawayFree.push(r);
    }
  if (gateEnt && !live.has(gateEnt)) {
    gateEnt = null;
    gateView!.g.removeFromParent();
    gateView!.halo.removeFromParent();
  }
  for (const [e, p] of powers)
    if (!live.has(e)) {
      powers.delete(e);
      p.g.removeFromParent();
      p.halo.removeFromParent();
      powerFree[p.kind].push(p);
    }

  // cart
  const turbo = S.turbo > 0;
  const col = cartCol.set(turbo ? '#ffb020' : S.cart[0] ? catColor(S.cart[0].cat) : '#1d9bf0');
  trimMat.color.copy(col).multiplyScalar(1.8 + pulse * 3 + (turbo ? 1 : 0));
  (underGlow.material as THREE.MeshBasicMaterial).color.copy(col);
  (underGlow.material as THREE.MeshBasicMaterial).opacity = 0.28 + pulse * 0.4 - Math.min(0.2, S.y * 0.2) + (turbo ? 0.2 : 0);
  cartLight.color.copy(col);
  cart.position.set(S.x, S.y, 0);
  underGlow.position.x = cartShadow.position.x = S.x;
  cartShadow.scale.set(1.15 * (1 - S.y * 0.25), 1, 0.8 * (1 - S.y * 0.25));
  const lean = (S.lane - S.x) * 0.32;
  cartBody.rotation.z = -lean * 0.6;
  cartBody.rotation.y = -lean * 0.35;
  // sliding: low and tipped back, sparks off the back wheels
  const sliding = S.slide > 0;
  cartBody.rotation.x = sliding ? -0.28 : 0;
  const sq = S.squash > 0 ? Math.sin((S.squash / 0.18) * Math.PI) * 0.1 : 0;
  cartBody.scale.set(1 + sq, (1 - sq) * (sliding ? 0.62 : 1), 1 + sq);
  if (sliding && dt > 0 && Math.random() < 0.8) {
    const sx = S.x + (Math.random() < 0.5 ? -0.36 : 0.36);
    burst(sx, 0.06, -0.25, Math.random() < 0.5 ? '#ffb347' : '#ffe08a', 2, 1.4);
  }
  // Turbo: a hot exhaust trail
  if (turbo && dt > 0 && Math.random() < 0.7) burst(S.x + (Math.random() < 0.5 ? -0.32 : 0.32), 0.12, -0.3, Math.random() < 0.5 ? '#ff9a1a' : '#ff4a12', 1, 0.8);
  // a puff of dust on landing
  const air = S.y > 0.02;
  if (wasAir && !air && S.on) {
    burst(S.x - 0.35, 0.05, 0, '#8d99a8', 6, 1.2);
    burst(S.x + 0.35, 0.05, 0, '#8d99a8', 6, 1.2);
  }
  wasAir = air;
  wheelSpin += (S.on ? S.v : 0) * dt * 5;
  for (const w of wheels) w.rotation.x = -wheelSpin;
  // blink the body only: hiding the group would hide its lights, and a
  // change in light count recompiles every lit shader mid-run
  cartBody.visible = !(S.inv > 0 && !turbo && Math.floor(time * 14) % 2);
  for (let i = 0; i < 4; i++) {
    const b = S.cart[i];
    const key = b ? `${b.uid}` : '';
    if (slotKeys[i] !== key) {
      slotKeys[i] = key;
      if (b) slotMats[i].map = tileTex(emojiTile(b));
      slotMats[i].opacity = b ? 1 : 0;
    }
  }
  pulse = Math.max(0, pulse - dt * 1.6);
  // Verified bubble and magnet ring
  bubblePop = Math.max(0, bubblePop - dt * 2.5);
  bubble.visible = S.shield > 0 || bubblePop > 0;
  bubbleMat.uniforms.uTime.value = time;
  bubbleMat.uniforms.uAlpha.value = S.shield > 0 ? 0.85 + 0.15 * Math.sin(time * 5) : bubblePop;
  bubble.scale.set(1 + (1 - bubblePop) * (S.shield ? 0 : 0.6), 0.82 + (S.shield ? 0 : (1 - bubblePop) * 0.5), 0.9);
  magRing.visible = S.magnet > 0;
  if (S.magnet > 0) {
    const k = (time * 1.6) % 1;
    magRing.position.x = S.x;
    magRing.scale.setScalar(0.8 + k * 1.1);
    const warn = S.magnet < 2 && Math.floor(time * 8) % 2 === 0;
    (magRing.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (warn ? 0.3 : 0.9);
  }

  // cards flying into the cart
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i];
    f.t += dt / 0.24;
    const k = Math.min(1, f.t);
    const e = 1 - (1 - k) * (1 - k);
    flyTo.set(S.x + (f.slot % 2 ? 0.2 : -0.2), S.y + 0.5 + (f.slot < 2 ? 0.14 : -0.14), 0.3);
    f.c.g.position.lerpVectors(f.from, flyTo, e);
    f.c.g.scale.setScalar(1 - e * 0.75);
    f.c.g.rotation.y = e * 0.6;
    if (k >= 1) {
      f.c.g.scale.setScalar(1);
      releaseCard(f.c);
      flyers.splice(i, 1);
    }
  }

  stepParticles(dt);
  stepAir(time, S.on ? dt : raw * 0.25, S.on ? S.v : 2.5, turbo ? 1 : Math.max(0, (S.v - 20) / 7) * 0.6);

  // camera: fixed on the aisle's center line. Only the cart moves sideways,
  // so the world never slides under you. It shakes on a hit, widens with
  // speed and Turbo, dips a little on a slide, and rolls into lane changes.
  kick = Math.max(0, kick - dt * 2.5);
  const shake = S.shake * 0.35 + kick * 0.1 + (turbo ? 0.03 : 0);
  fovBoost += ((turbo ? 9 : 0) - fovBoost) * Math.min(1, dt * 4);
  const fov = 58 + Math.max(0, S.v - 10) * 0.25 + pulse * 1.5 + fovBoost;
  if (Math.abs(fov - camera.fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  camDip += ((sliding ? -0.25 : 0) - camDip) * Math.min(1, dt * 10);
  camera.position.set((Math.random() - 0.5) * shake, 3.05 + camDip + (Math.random() - 0.5) * shake, 6.1);
  camera.lookAt(0, 0.55, -9);
  roll += ((S.lane - S.x) * -0.035 - roll) * Math.min(1, dt * 8);
  camera.rotateZ(roll);

  // floaters and the cart label
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt;
    const p = toScreen(f.p);
    f.el.style.transform = `translate(${p.x}px, ${p.y - f.t * 60}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.3 - f.t)})`;
    f.el.style.opacity = String(Math.max(0, 1 - f.t / 0.9));
    if (f.t > 0.9) {
      f.el.remove();
      floaters.splice(i, 1);
    }
  }
  const tagP = toScreen(tmp.set(S.x, S.y + 1.05, 0));
  // DOM writes only when something moved: half-pixel steps for the label,
  // and nothing at all for the vignette while it's clear
  const tx = Math.round(tagP.x * 2) / 2;
  const ty = Math.round(tagP.y * 2) / 2;
  if (tx !== tagX || ty !== tagY) {
    tagX = tx;
    tagY = ty;
    cartTag.style.transform = `translate(${tx}px, ${ty}px) translate(-50%, -100%)`;
  }
  const label = S.cart[0] ? `${shortCat(S.cart[0].cat)} ${S.cart.length}/4` : S.on ? 'Grab a bot' : '';
  if (label !== tagLabel) {
    tagLabel = label;
    cartTag.textContent = label;
    cartTag.style.color = S.cart[0] ? catColor(S.cart[0].cat) : '';
  }

  red = Math.max(0, red - dt * 1.8);
  const vg = Math.round(red * 90) / 100;
  if (vg !== vigNow) {
    vigNow = vg;
    vignette.style.opacity = String(vg);
  }

  renderer.info.reset();
  draw();
}
let fovBoost = 0;
let camDip = 0;
let tagX = -1;
let tagY = -1;
let tagLabel = '';
let vigNow = 0;

// DEV: the live scene and renderer, for poking at from the console
export const debug = () => ({ scene, renderer });

export function programs() {
  return (renderer.info.programs ?? []).map((p) => p.cacheKey);
}

export function stats() {
  const r = renderer.info.render;
  return { calls: r.calls, triangles: r.triangles, quality, programs: renderer.info.programs?.length, zone: zoneNow, decor: Object.fromEntries(Object.entries(decor).map(([k, l]) => [k, l.filter((o) => o.visible).length])), dust: dust.n };
}

const SHORT: Record<string, string> = { 'Health & Fitness': 'Health', 'Business & Marketing': 'Business' };
const shortCat = (c: string) => SHORT[c] ?? c;
