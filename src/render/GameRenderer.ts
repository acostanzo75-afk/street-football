import * as THREE from 'three';
import { RENDER } from '../game/config';

const SKY = 0x9ccfee;

/**
 * WebGL renderer, scene, lights and resize handling.
 * Deliberately cheap: no shadow maps, no post-processing, capped pixel ratio.
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

    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 45, 110);

    const hemi = new THREE.HemisphereLight(0xeaf4ff, 0x4a4f45, 1.6);
    const sun = new THREE.DirectionalLight(0xfff3e0, 1.8);
    sun.position.set(-8, 20, 6);
    this.scene.add(hemi, sun);

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
