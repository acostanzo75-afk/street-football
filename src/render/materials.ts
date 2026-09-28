import * as THREE from 'three';
import { THEME } from './theme';

let gradientMap: THREE.DataTexture | null = null;

/** Shared 3-step ramp: gives every toon material the same banded shading. */
function getGradientMap(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const steps = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(steps, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export interface ToonOptions {
  /** Adds a warm fresnel rim so characters/ball separate from the environment. */
  rim?: boolean;
  map?: THREE.Texture;
  vertexColors?: boolean;
  emissive?: number;
}

const materialCache = new Map<string, THREE.MeshToonMaterial>();

/** Cached per colour/options so identical parts share one material (and shader). */
export function toon(color: number, options: ToonOptions = {}): THREE.MeshToonMaterial {
  const cacheable = !options.map;
  const key = `${color}|${options.rim ? 1 : 0}|${options.vertexColors ? 1 : 0}|${options.emissive ?? 0}`;
  if (cacheable) {
    const cached = materialCache.get(key);
    if (cached) return cached;
  }
  const material = new THREE.MeshToonMaterial({
    color,
    gradientMap: getGradientMap(),
    vertexColors: options.vertexColors ?? false,
  });
  if (options.map) material.map = options.map;
  if (options.emissive !== undefined) material.emissive.setHex(options.emissive);
  if (options.rim) addRim(material);
  if (cacheable) materialCache.set(key, material);
  return material;
}

function addRim(material: THREE.MeshToonMaterial): void {
  const rimColor = new THREE.Color(THEME.rim);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: rimColor };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;')
      .replace(
        '#include <opaque_fragment>',
        `float rim = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
        outgoingLight += rimColor * smoothstep(0.55, 0.95, rim) * 0.45;
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'toon-rim';
}

let outlineMaterial: THREE.MeshBasicMaterial | null = null;

/**
 * Inverted-hull outline: back faces pushed out along the normal in the vertex
 * shader. Cheap (one extra draw per part) and gives the strong cartoon silhouette.
 */
export function getOutlineMaterial(): THREE.MeshBasicMaterial {
  if (outlineMaterial) return outlineMaterial;
  outlineMaterial = new THREE.MeshBasicMaterial({ color: THEME.outline, side: THREE.BackSide });
  outlineMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed += normalize(normal) * 0.022;',
    );
  };
  outlineMaterial.customProgramCacheKey = () => 'outline';
  return outlineMaterial;
}

/** Mesh + matching outline hull sharing the same geometry. */
export function outlinedMesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.add(new THREE.Mesh(geometry, getOutlineMaterial()));
  return mesh;
}
