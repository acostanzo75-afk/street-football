import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RENDER } from '../game/config';
import { createSky, SUN_DIRECTION } from './Backdrop';
import type { QualitySettings } from './quality';
import { THEME } from './theme';

/** Half-extent of the square the sun's shadow map covers (the whole cage + props). */
const SHADOW_EXTENT = 22;
/** Dynamic resolution: sample window (s) and frame-time thresholds (ms). */
const DYN_WINDOW = 1.5;
const DYN_SLOW_MS = 19;
const DYN_FAST_MS = 13;
const DYN_STEP = 0.25;

/**
 * Renderer, scene, lighting and the quality-dependent pipeline.
 *
 * Look: stylised PBR. Surfaces are lit by a PMREM environment baked once from
 * the procedural sky (soft sky-coloured ambient and reflections) plus a warm
 * low sun. Real-time shadows and the bloom/grade post stack are gated by the
 * quality preset; dynamic resolution protects frame rate on phones.
 */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly quality: QualitySettings;

  private readonly composer: EffectComposer | null = null;
  private pixelRatio: number;
  private dynElapsed = 0;
  private dynFrames = 0;
  private fastWindows = 0;

  constructor(container: HTMLElement, quality: QualitySettings) {
    this.quality = quality;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio);
    this.renderer = new THREE.WebGLRenderer({
      // With post-processing, MSAA happens on the composer's render target instead.
      antialias: quality.antialias && !quality.postProcessing,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(this.pixelRatio);
    // Several passes per frame with post-processing: reset stats once per frame instead.
    this.renderer.info.autoReset = false;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = THEME.light.exposure;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(RENDER.fov, 1, RENDER.near, RENDER.far);

    this.scene.background = new THREE.Color(THEME.sky.horizon);
    this.scene.fog = new THREE.Fog(THEME.fog.color, THEME.fog.near, THEME.fog.far);
    this.scene.environment = this.bakeEnvironment();
    this.scene.environmentIntensity = THEME.light.environmentIntensity;

    this.addSun();
    if (quality.postProcessing) this.composer = this.createComposer();

    this.resize();
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
  }

  get maxAnisotropy(): number {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  render(frameDt: number): void {
    // Resize BEFORE drawing: resizing clears the canvas, and doing it after the
    // draw would present a blank frame on every resolution change.
    this.adaptResolution(frameDt);
    this.renderer.info.reset();
    if (this.composer) this.composer.render(frameDt);
    else this.renderer.render(this.scene, this.camera);
  }

  /** One PMREM bake of the sky dome at startup: gives soft, sky-tinted ambient light. */
  private bakeEnvironment(): THREE.Texture {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(createSky());
    // Warm ground bounce below the horizon so undersides aren't lit sky-blue.
    const bounce = new THREE.Mesh(
      new THREE.CircleGeometry(100, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: THEME.light.bounce, side: THREE.DoubleSide }),
    );
    bounce.position.y = -2;
    envScene.add(bounce);
    const target = pmrem.fromScene(envScene, 0.02);
    pmrem.dispose();
    return target.texture;
  }

  private addSun(): void {
    const sun = new THREE.DirectionalLight(THEME.light.key, THEME.light.keyIntensity);
    // Same azimuth as the visible sun glow, raised so shadows stay readable.
    sun.position.set(SUN_DIRECTION.x * 30, 26, SUN_DIRECTION.z * 30);
    this.scene.add(sun);

    const size = this.quality.shadowMapSize;
    if (size === 0) return;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    sun.castShadow = true;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.radius = 3;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    const cam = sun.shadow.camera;
    cam.left = -SHADOW_EXTENT;
    cam.right = SHADOW_EXTENT;
    cam.top = SHADOW_EXTENT;
    cam.bottom = -SHADOW_EXTENT;
    cam.near = 1;
    cam.far = 90;
    cam.updateProjectionMatrix();
  }

  private createComposer(): EffectComposer {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: this.quality.antialias ? 4 : 0,
    });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    // Threshold 1.0 in linear HDR: only lamps, neon and bulbs bloom, never the pitch.
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.5, 1.0));
    composer.addPass(new ShaderPass(GradeShader));
    composer.addPass(new OutputPass());
    return composer;
  }

  /**
   * Keeps frame time in budget: drops render resolution in 0.25 steps when
   * frames are slow, climbs back only after sustained headroom.
   */
  private adaptResolution(frameDt: number): void {
    this.dynElapsed += frameDt;
    this.dynFrames++;
    if (this.dynElapsed < DYN_WINDOW) return;
    const avgMs = (this.dynElapsed / this.dynFrames) * 1000;
    this.dynElapsed = 0;
    this.dynFrames = 0;

    const max = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio);
    let next = this.pixelRatio;
    if (avgMs > DYN_SLOW_MS) {
      next = Math.max(this.quality.minPixelRatio, this.pixelRatio - DYN_STEP);
      this.fastWindows = 0;
    } else if (avgMs < DYN_FAST_MS && ++this.fastWindows >= 4) {
      next = Math.min(max, this.pixelRatio + DYN_STEP);
      this.fastWindows = 0;
    }
    if (next !== this.pixelRatio) {
      this.pixelRatio = next;
      this.resize();
    }
  }

  private readonly resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(width, height);
    }
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };
}

/** Warm, slightly punchy grade applied in linear HDR before tone mapping. */
const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uVibrance: { value: 0.18 },
    uContrast: { value: 1.06 },
    uShadowTint: { value: new THREE.Vector3(0.96, 0.97, 1.05) },
    uHighTint: { value: new THREE.Vector3(1.04, 1.0, 0.95) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVibrance;
    uniform float uContrast;
    uniform vec3 uShadowTint;
    uniform vec3 uHighTint;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      // Split-tone: cool shadows, warm highlights.
      c.rgb *= mix(uShadowTint, uHighTint, smoothstep(0.05, 0.6, luma));
      // Vibrance boosts muted colours more than saturated ones.
      float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      c.rgb = mix(vec3(luma), c.rgb, 1.0 + uVibrance * (1.0 - clamp(sat, 0.0, 1.0)));
      // Gentle contrast around mid-grey in linear space.
      c.rgb = max(vec3(0.0), (c.rgb - 0.18) * uContrast + 0.18);
      gl_FragColor = c;
    }
  `,
};
