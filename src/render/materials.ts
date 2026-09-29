import * as THREE from 'three';

export interface SurfaceOptions {
  /** 0 = mirror, 1 = chalk. Stylised PBR lives mostly in 0.45–0.9. */
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture;
  vertexColors?: boolean;
  /** Emissive colour; use with `emissiveIntensity` > 1 for bloom on High. */
  emissive?: number;
  emissiveIntensity?: number;
  emissiveMap?: THREE.Texture;
  side?: THREE.Side;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Stylised-PBR surface material. Lit by the sky environment map plus the sun,
 * so every surface gets soft ambient, fresnel and sky-tinted reflections for free.
 * Materials without textures are cached per parameter set and shared.
 */
export function surface(color: number, o: SurfaceOptions = {}): THREE.MeshStandardMaterial {
  const cacheable = !o.map && !o.emissiveMap;
  const key = [color, o.roughness, o.metalness, o.vertexColors, o.emissive, o.emissiveIntensity, o.side].join('|');
  if (cacheable) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: o.roughness ?? 0.7,
    metalness: o.metalness ?? 0,
    vertexColors: o.vertexColors ?? false,
    side: o.side ?? THREE.FrontSide,
  });
  if (o.map) material.map = o.map;
  if (o.emissiveMap) material.emissiveMap = o.emissiveMap;
  if (o.emissive !== undefined) {
    material.emissive.setHex(o.emissive);
    material.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  if (cacheable) cache.set(key, material);
  return material;
}

/**
 * Unlit glowing material for lamps, bulbs and neon. The colour is pushed above
 * 1.0 so the bloom pass (High preset) picks it up; tone mapping keeps it sane
 * on presets without bloom.
 */
export function glow(color: number, intensity = 2.5): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color });
  material.color.multiplyScalar(intensity);
  return material;
}

/** Marks every mesh under `root` as a shadow caster and/or receiver. */
export function setShadows(root: THREE.Object3D, cast: boolean, receive: boolean): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}
