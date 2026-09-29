import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createWindowTextures } from '../arena/pitchTexture';
import { THEME } from './theme';

/** Direction of the (visual) sun on the horizon. The key light shares its azimuth. */
export const SUN_DIRECTION = new THREE.Vector3(-0.75, 0.16, -0.64).normalize();

const BIRD_COUNT = 7;

/**
 * Background layer, built for depth:
 * gradient sky → distant hills → far hazy towers → near towers with lit
 * windows and rooftop tanks → drifting clouds and circling birds.
 * About 9 draw calls in total; only clouds and birds animate.
 */
export class Backdrop {
  readonly group = new THREE.Group();

  private readonly clouds: THREE.Group;
  private readonly birds: THREE.InstancedMesh;
  private readonly birdPhase: number[] = [];
  private time = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();

  constructor(density: number) {
    this.group.add(createSky());
    this.group.add(createHills());
    this.group.add(
      createSkylineRing({
        count: 34,
        minRadius: 78,
        maxRadius: 104,
        minTop: 4,
        maxTop: 36,
        minWidth: 8,
        maxWidth: 16,
        color: THEME.skyline.far,
        seed: 9,
        windows: false,
      }),
    );
    this.group.add(
      createSkylineRing({
        count: 30,
        minRadius: 40,
        maxRadius: 60,
        minTop: -8,
        maxTop: 10,
        minWidth: 6,
        maxWidth: 12,
        color: THEME.skyline.near,
        seed: 5,
        windows: true,
      }),
    );
    this.clouds = createClouds(Math.round(9 * density));
    this.group.add(this.clouds);

    const wing = new THREE.BufferGeometry();
    // A shallow V: two triangles sharing the body line. Flapping = scaling Y.
    wing.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0.25, -0.9, 0.35, -0.1, 0, 0, -0.25, 0, 0, 0.25, 0.9, 0.35, -0.1, 0, 0, -0.25], 3),
    );
    wing.computeVertexNormals();
    this.birds = new THREE.InstancedMesh(
      wing,
      new THREE.MeshBasicMaterial({ color: THEME.decor.bird, side: THREE.DoubleSide }),
      BIRD_COUNT,
    );
    this.birds.frustumCulled = false;
    for (let i = 0; i < BIRD_COUNT; i++) this.birdPhase.push(i * 1.7);
    this.group.add(this.birds);
  }

  update(dt: number): void {
    this.time += dt;
    this.clouds.rotation.y += dt * 0.004;

    // Birds circle lazily in two loose flocks above the city.
    for (let i = 0; i < BIRD_COUNT; i++) {
      const phase = this.birdPhase[i] ?? 0;
      const flock = i % 2;
      const radius = 30 + flock * 14 + (i % 3) * 2;
      const speed = 0.12 + flock * 0.05;
      const a = this.time * speed + phase;
      this.pos.set(Math.cos(a) * radius - 8, 16 + flock * 6 + Math.sin(a * 2 + i) * 1.2, Math.sin(a) * radius - 20);
      this.quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -a);
      const flap = 0.35 + Math.abs(Math.sin(this.time * 7 + phase * 3)) * 0.9;
      this.scl.set(0.9, flap, 0.9);
      this.matrix.compose(this.pos, this.quat, this.scl);
      this.birds.setMatrixAt(i, this.matrix);
    }
    this.birds.instanceMatrix.needsUpdate = true;
  }
}

/** Gradient dome with sun glow. Also used to bake the environment map. */
export function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(THEME.sky.top) },
      middle: { value: new THREE.Color(THEME.sky.middle) },
      horizon: { value: new THREE.Color(THEME.sky.horizon) },
      glow: { value: new THREE.Color(THEME.sky.sunGlow) },
      sunDir: { value: SUN_DIRECTION },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 middle;
      uniform vec3 horizon;
      uniform vec3 glow;
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 col = mix(horizon, middle, smoothstep(0.0, 0.28, h));
        col = mix(col, top, smoothstep(0.25, 0.85, h));
        float sun = max(dot(normalize(vDir), sunDir), 0.0);
        col += glow * (pow(sun, 8.0) * 0.5 + pow(sun, 220.0) * 2.5);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

/** Soft distant hills behind the skyline: a single merged, fogged mesh. */
function createHills(): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const hills = [
    [-0.5, 118, 40, 22],
    [0.15, 125, 55, 30],
    [0.9, 120, 45, 20],
    [2.3, 122, 60, 26],
    [3.4, 118, 42, 18],
    [4.6, 124, 50, 24],
  ] as const;
  for (const [angle, radius, width, height] of hills) {
    const cone = new THREE.ConeGeometry(width, height, 12, 1, true);
    cone.scale(1, 1, 0.5);
    cone.translate(Math.sin(angle) * radius, height / 2 - 12, Math.cos(angle) * radius);
    parts.push(cone);
  }
  const geometry = mergeGeometries(parts);
  if (!geometry) throw new Error('hill merge failed');
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: THEME.decor.hills }));
  mesh.frustumCulled = false;
  return mesh;
}

/** Puffy stylised clouds: sphere clusters with a baked top-lit vertex gradient. */
function createClouds(count: number): THREE.Group {
  const group = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  const top = new THREE.Color(THEME.decor.cloudTop);
  const bottom = new THREE.Color(THEME.decor.cloudBottom);
  const tmp = new THREE.Color();
  let seed = 17;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let c = 0; c < count; c++) {
    const angle = (c / Math.max(1, count)) * Math.PI * 2 + rand() * 0.4;
    const radius = 95 + rand() * 20;
    const cx = Math.sin(angle) * radius;
    const cz = Math.cos(angle) * radius;
    const cy = 30 + rand() * 18;
    const puffs = 5 + Math.floor(rand() * 4);
    for (let p = 0; p < puffs; p++) {
      const r = 4 + rand() * 5;
      const puff = new THREE.IcosahedronGeometry(r, 2);
      const offset = (p - puffs / 2) * 4.5;
      puff.translate(cx + Math.cos(angle) * offset, cy + rand() * 3 - (Math.abs(offset) > 8 ? 2 : 0), cz - Math.sin(angle) * offset);
      puff.scale(1, 0.72, 1);
      const pos = puff.getAttribute('position');
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const t = THREE.MathUtils.clamp((pos.getY(i) - (cy * 0.72 - r * 0.5)) / (r * 1.2), 0, 1);
        tmp.copy(bottom).lerp(top, t).toArray(colors, i * 3);
      }
      puff.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      puff.deleteAttribute('uv');
      parts.push(puff);
    }
  }
  const geometry = mergeGeometries(parts);
  if (geometry) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

interface RingOptions {
  count: number;
  minRadius: number;
  maxRadius: number;
  minTop: number;
  maxTop: number;
  minWidth: number;
  maxWidth: number;
  color: number;
  seed: number;
  windows: boolean;
}

function createSkylineRing(o: RingOptions): THREE.Group {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  let material: THREE.Material;
  if (o.windows) {
    const { color, emissive } = createWindowTextures();
    // Lit windows glow (and bloom on High) as the sun goes down.
    material = new THREE.MeshStandardMaterial({
      map: color,
      emissiveMap: emissive,
      emissive: new THREE.Color(THEME.skyline.window),
      emissiveIntensity: 1.6,
      roughness: 0.85,
    });
  } else {
    material = new THREE.MeshBasicMaterial();
  }
  const mesh = new THREE.InstancedMesh(geometry, material, o.count);
  const caps = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), o.count);
  // Rooftop water tanks on some near towers: small silhouettes that read as "city".
  const tankGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  tankGeo.translate(0, 0.5, 0);
  const tanks = o.windows ? new THREE.InstancedMesh(tankGeo, new THREE.MeshBasicMaterial({ color: 0x4a3a52 }), o.count) : null;
  let tankCount = 0;

  const capColor = new THREE.Color(o.color).offsetHSL(0, -0.05, 0.1);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const color = new THREE.Color();
  const base = new THREE.Color(o.color);
  let s = o.seed;
  const rand = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const bottom = -40;
  for (let i = 0; i < o.count; i++) {
    const angle = (i / o.count) * Math.PI * 2 + rand() * 0.15;
    const radius = o.minRadius + rand() * (o.maxRadius - o.minRadius);
    const top = o.minTop + rand() * (o.maxTop - o.minTop);
    const width = o.minWidth + rand() * (o.maxWidth - o.minWidth);
    const depth = width * (0.7 + rand() * 0.5);
    position.set(Math.sin(angle) * radius, bottom, Math.cos(angle) * radius * 1.15);
    scale.set(width, top - bottom, depth);
    quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
    color.copy(base).offsetHSL(0, 0, (rand() - 0.5) * 0.08);
    mesh.setColorAt(i, color);

    position.y = top;
    scale.set(width * 1.08, 0.9, depth * 1.08);
    matrix.compose(position, quaternion, scale);
    caps.setMatrixAt(i, matrix);
    caps.setColorAt(i, capColor);

    if (tanks && rand() > 0.45) {
      position.y = top + 0.9;
      position.x += (rand() - 0.5) * width * 0.4;
      const tankSize = 1.6 + rand();
      scale.set(tankSize, tankSize * 1.3, tankSize);
      matrix.compose(position, quaternion, scale);
      tanks.setMatrixAt(tankCount++, matrix);
    }
  }
  mesh.frustumCulled = false;
  caps.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh, caps);
  if (tanks) {
    tanks.count = tankCount;
    tanks.frustumCulled = false;
    group.add(tanks);
  }
  return group;
}
