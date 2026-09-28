import * as THREE from 'three';
import { createWindowTexture } from '../arena/pitchTexture';
import { THEME } from './theme';

/** Direction of the (visual) sun on the horizon. The key light roughly agrees. */
export const SUN_DIRECTION = new THREE.Vector3(-0.75, 0.16, -0.64).normalize();

/**
 * Background layer: gradient sky dome with a sun glow, plus two rings of
 * instanced building silhouettes (near: lit windows, far: hazy), each with
 * instanced cornice caps. The whole backdrop is 5 draw calls.
 */
export function createBackdrop(): THREE.Group {
  const group = new THREE.Group();
  group.add(createSky());
  group.add(
    createSkylineRing({
      count: 28,
      minRadius: 40,
      maxRadius: 58,
      minTop: -8,
      maxTop: 9,
      minWidth: 6,
      maxWidth: 12,
      color: THEME.skyline.near,
      seed: 5,
      windows: true,
    }),
  );
  group.add(
    createSkylineRing({
      count: 34,
      minRadius: 75,
      maxRadius: 100,
      minTop: 4,
      maxTop: 34,
      minWidth: 8,
      maxWidth: 16,
      color: THEME.skyline.far,
      seed: 9,
      windows: false,
    }),
  );
  return group;
}

function createSky(): THREE.Mesh {
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
        col += glow * (pow(sun, 8.0) * 0.45 + pow(sun, 180.0) * 1.2);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 24, 12), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
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
  const material = o.windows
    ? new THREE.MeshLambertMaterial({ map: createWindowTexture() })
    : new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, o.count);
  // Cornice slab on each tower top: breaks the plain-box silhouette for one draw call.
  const caps = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color: o.color }), o.count);
  const capColor = new THREE.Color(o.color).offsetHSL(0, -0.05, 0.12);
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
    position.set(Math.sin(angle) * radius, bottom, Math.cos(angle) * radius * 1.15);
    scale.set(width, top - bottom, width * (0.7 + rand() * 0.5));
    quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
    color.copy(base).offsetHSL(0, 0, (rand() - 0.5) * 0.08);
    mesh.setColorAt(i, color);

    position.y = top;
    scale.set(width * 1.08, 0.9, scale.z * 1.08);
    matrix.compose(position, quaternion, scale);
    caps.setMatrixAt(i, matrix);
    caps.setColorAt(i, capColor);
  }
  mesh.frustumCulled = false;
  caps.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh, caps);
  return group;
}
