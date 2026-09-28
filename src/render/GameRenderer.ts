import * as THREE from 'three';
import { RENDER } from '../game/config';
import { THEME } from './theme';

/**
 * WebGL renderer, scene, lights and resize handling.
 * Deliberately cheap: no shadow maps (blob shadows instead), no post-processing,
 * capped pixel ratio, two lights.
 */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  constructor(container: HTMLElement) {
    const dpr = Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio);
    this.renderer = new THREE.WebGLRenderer({
      // At high DPR the extra pixels already smooth edges; MSAA would be wasted fill-rate.
      antialias: dpr < 2,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(dpr);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(RENDER.fov, 1, RENDER.near, RENDER.far);

    // The sky dome (Backdrop) covers the background; this is only a fallback.
    this.scene.background = new THREE.Color(THEME.sky.horizon);
    this.scene.fog = new THREE.Fog(THEME.fog.color, THEME.fog.near, THEME.fog.far);

    // Golden hour: warm low key light from the left, cool sky fill, warm bounce.
    const fill = new THREE.HemisphereLight(THEME.light.fillSky, THEME.light.fillGround, THEME.light.fillIntensity);
    const key = new THREE.DirectionalLight(THEME.light.key, THEME.light.keyIntensity);
    key.position.set(-9, 11, 5);
    this.scene.add(fill, key);

    this.resize();
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
  }

  get maxAnisotropy(): number {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private readonly resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };
}
