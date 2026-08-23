const FLOW_WIDTH = 384;
const FLOW_HEIGHT = 216;
const MAX_SPLATS = 12;
const SPLAT_QUEUE_CAPACITY = 40;
const MAX_SPLATS_PER_EVENT = 12;
const MAX_PIXEL_RATIO = 1.25;
const MAX_CANVAS_PIXELS = 2_200_000;
const FRAME_INTERVAL = 1000 / 60;
const VELOCITY_MAX = 1.2;
const SPEED_REFERENCE = 1.55;
const NEUTRAL_FLOW = 128 / 255;

const VERTEX_SHADER = `#version 300 es
  layout(location = 0) in vec2 aPosition;
  out vec2 vUv;

  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const FLOW_FRAGMENT_SHADER = `#version 300 es
  precision highp float;

  #define MAX_SPLATS ${MAX_SPLATS}

  in vec2 vUv;
  out vec4 outColor;

  uniform sampler2D uPrevious;
  uniform vec2 uTexel;
  uniform vec2 uScreenScale;
  uniform float uDelta;
  uniform float uDissipation;
  uniform float uDiffusion;
  uniform float uVelocityMax;
  uniform int uSplatCount;
  uniform vec2 uSplatPosition[MAX_SPLATS];
  uniform vec2 uSplatDirection[MAX_SPLATS];
  uniform vec3 uSplatShape[MAX_SPLATS];

  vec2 decodeVelocity(vec4 sampleValue) {
    vec2 signedByte = sampleValue.rg * 255.0 - 128.0;
    return signedByte / 127.0 * uVelocityMax;
  }

  vec4 encodeVelocity(vec2 velocity, float activity) {
    float speed = length(velocity);
    if (speed > uVelocityMax) velocity *= uVelocityMax / speed;
    vec2 normalized = velocity / uVelocityMax;
    vec2 encoded = (normalized * 127.0 + 128.0) / 255.0;
    return vec4(encoded, clamp(activity, 0.0, 1.0), 1.0);
  }

  vec2 sampleVelocity(vec2 uv) {
    return decodeVelocity(texture(uPrevious, clamp(uv, uTexel * 0.5, 1.0 - uTexel * 0.5)));
  }

  float sampleActivity(vec2 uv) {
    return texture(uPrevious, clamp(uv, uTexel * 0.5, 1.0 - uTexel * 0.5)).b;
  }

  void main() {
    vec2 velocityHere = sampleVelocity(vUv);
    vec2 backUv = vUv - velocityHere / uScreenScale * uDelta * 0.42;
    vec2 advected = sampleVelocity(backUv);
    vec2 blurred = 0.25 * (
      sampleVelocity(backUv + vec2(uTexel.x, 0.0)) +
      sampleVelocity(backUv - vec2(uTexel.x, 0.0)) +
      sampleVelocity(backUv + vec2(0.0, uTexel.y)) +
      sampleVelocity(backUv - vec2(0.0, uTexel.y))
    );

    float diffusion = 1.0 - exp(-uDiffusion * uDelta);
    vec2 velocity = mix(advected, blurred, diffusion);
    velocity *= exp(-uDissipation * uDelta);
    float activity = mix(
      sampleActivity(backUv),
      0.25 * (
        sampleActivity(backUv + vec2(uTexel.x, 0.0)) +
        sampleActivity(backUv - vec2(uTexel.x, 0.0)) +
        sampleActivity(backUv + vec2(0.0, uTexel.y)) +
        sampleActivity(backUv - vec2(0.0, uTexel.y))
      ),
      diffusion
    );
    activity *= exp(-0.68 * uDelta);

    for (int index = 0; index < MAX_SPLATS; index++) {
      if (index >= uSplatCount) break;

      vec2 direction = uSplatDirection[index];
      vec2 perpendicular = vec2(-direction.y, direction.x);
      vec2 delta = (vUv - uSplatPosition[index]) * uScreenScale;
      float along = dot(delta, direction) / max(uSplatShape[index].y, 0.0001);
      float across = dot(delta, perpendicular) / max(uSplatShape[index].x, 0.0001);
      float directionalFalloff = exp(-0.5 * (along * along + across * across));
      vec2 localTangent = direction * -across + perpendicular * along;
      velocity += direction * uSplatShape[index].z * directionalFalloff * 0.58;
      velocity += localTangent * uSplatShape[index].z * directionalFalloff * 0.085;
      activity = max(activity, directionalFalloff * clamp(uSplatShape[index].z / uVelocityMax, 0.0, 1.0));
    }

    float speed = length(velocity);
    float velocityStep = uVelocityMax / 127.0;
    if (speed < velocityStep * 2.75) {
      float quantizedDrain = velocityStep * 0.62 * clamp(uDelta * 60.0, 0.25, 2.0);
      velocity *= max(speed - quantizedDrain, 0.0) / max(speed, 0.00001);
    }
    if (activity < 3.0 / 255.0) {
      activity = max(
        activity - (0.62 / 255.0) * clamp(uDelta * 60.0, 0.25, 2.0),
        0.0
      );
    }
    outColor = encodeVelocity(velocity, activity);
  }
`;

const DYE_FRAGMENT_SHADER = `#version 300 es
  precision highp float;

  in vec2 vUv;
  out vec4 outColor;

  uniform sampler2D uPreviousDye;
  uniform sampler2D uFlow;
  uniform vec2 uTexel;
  uniform vec2 uScreenScale;
  uniform float uCssMinDimension;
  uniform float uDelta;
  uniform float uTime;
  uniform float uVelocityMax;
  uniform float uRecoveryRate;
  uniform float uReset;

  vec2 decodeVelocity(vec4 sampleValue) {
    vec2 signedByte = sampleValue.rg * 255.0 - 128.0;
    return signedByte / 127.0 * uVelocityMax;
  }

  float hash(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    vec2 curve = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), curve.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), curve.x),
      curve.y
    );
  }

  float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.52;
    mat2 rotation = mat2(0.80, -0.60, 0.60, 0.80);
    for (int octave = 0; octave < 3; octave++) {
      value += valueNoise(point) * amplitude;
      point = rotation * point * 2.02 + vec2(19.1, 7.7);
      amplitude *= 0.5;
    }
    return value;
  }

  float territoryScore(
    vec2 uv,
    vec2 center,
    vec2 aspectScale,
    float organicVariation
  ) {
    vec2 delta = (uv - center) * aspectScale;
    return -dot(delta, delta) * 5.2 + (organicVariation - 0.5) * 1.14;
  }

  vec4 normalizeInkWeights(vec4 weights) {
    weights = max(weights, vec4(0.0));
    float total = dot(weights, vec4(1.0));
    if (total > 0.992) weights *= 0.992 / total;
    return weights;
  }

  vec4 dyeSource(vec2 uv, float time) {
    float aspect = uScreenScale.x / max(uScreenScale.y, 0.0001);
    vec2 point = vec2(uv.x * aspect, uv.y) * 1.72;
    vec2 driftA = vec2(0.010, -0.012) * time;
    vec2 driftB = vec2(-0.0085, 0.011) * time;
    vec2 domain = vec2(
      fbm(point * 0.88 + driftA),
      fbm(point * 0.96 + vec2(9.7, 3.4) + driftB)
    );
    vec2 territoryUv = uv + (domain - 0.5) * 0.19;
    territoryUv += vec2(
      sin(time * 0.045 + domain.y * 4.3),
      cos(time * 0.036 + domain.x * 4.7)
    ) * 0.009;

    float mintNoise = fbm(point * 1.08 + domain * 0.64 + vec2(1.7, 8.4) + driftA * 0.32);
    float sageNoise = fbm(point * 1.13 + domain.yx * 0.58 + vec2(12.6, 2.8) + driftB * 0.27);
    float aquaNoise = fbm(point * 1.04 + domain * 0.71 + vec2(5.3, 15.2) - driftA * 0.24);
    float oliveNoise = fbm(point * 1.17 + domain.yx * 0.61 + vec2(17.8, 10.1) - driftB * 0.30);
    float creamNoise = fbm(point * 0.98 + domain * 0.55 + vec2(8.9, 19.4) + driftA * 0.18);
    mintNoise = mix(
      mintNoise,
      fbm(point * 2.35 + domain.yx * 1.12 + vec2(3.1, 17.4) + driftB * 0.55),
      0.42
    );
    sageNoise = mix(
      sageNoise,
      fbm(point * 2.48 + domain * 1.06 + vec2(21.3, 6.2) - driftA * 0.48),
      0.42
    );
    aquaNoise = mix(
      aquaNoise,
      fbm(point * 2.28 + domain.yx * 1.18 + vec2(11.8, 23.6) + driftA * 0.44),
      0.42
    );
    oliveNoise = mix(
      oliveNoise,
      fbm(point * 2.56 + domain * 1.09 + vec2(25.7, 13.9) - driftB * 0.52),
      0.42
    );
    creamNoise = mix(
      creamNoise,
      fbm(point * 2.18 + domain.yx * 1.02 + vec2(16.4, 27.1) + driftB * 0.40),
      0.38
    );

    vec2 aspectScale = vec2(mix(1.0, aspect, 0.58), 1.0);
    vec4 inkScores = vec4(
      territoryScore(territoryUv, vec2(0.16, 0.72), aspectScale, mintNoise),
      territoryScore(territoryUv, vec2(0.18, 0.20), aspectScale, sageNoise),
      territoryScore(territoryUv, vec2(0.58, 0.77), aspectScale, aquaNoise),
      territoryScore(territoryUv, vec2(0.82, 0.24), aspectScale, oliveNoise)
    ) + vec4(0.16, 0.12, 0.05, -0.10);
    float creamScore = territoryScore(
      territoryUv,
      vec2(0.52, 0.43),
      aspectScale,
      creamNoise
    ) - 0.14;

    float scoreMaximum = max(
      max(max(inkScores.r, inkScores.g), max(inkScores.b, inkScores.a)),
      creamScore
    );
    vec4 inkCompetition = exp((inkScores - scoreMaximum) * 3.20);
    float creamCompetition = exp((creamScore - scoreMaximum) * 3.20);
    float competitionTotal = dot(inkCompetition, vec4(1.0)) + creamCompetition;
    return normalizeInkWeights(inkCompetition / max(competitionTotal, 0.0001));
  }

  vec2 idleFlow(vec2 uv, float time) {
    float aspect = uScreenScale.x / max(uScreenScale.y, 0.0001);
    vec2 point = vec2(uv.x * aspect, uv.y) * 6.28318530718;
    float phaseA = point.x * 0.72 + point.y * 1.14 + time * 0.120;
    float phaseB = point.x * 1.08 - point.y * 0.63 - time * 0.100;
    float phaseC = point.x * 1.76 + point.y * 1.43 + time * 0.160;
    vec2 field = vec2(
      1.14 * cos(phaseA)
        - 0.45 * 0.63 * cos(phaseB)
        + 0.18 * 1.43 * cos(phaseC),
      -0.72 * cos(phaseA)
        - 0.45 * 1.08 * cos(phaseB)
        - 0.18 * 1.76 * cos(phaseC)
    );
    return field * (16.0 / max(uCssMinDimension, 1.0)) / 1.073;
  }

  void main() {
    vec4 sourceWeights = dyeSource(vUv, uTime);
    if (uReset > 0.5) {
      outColor = sourceWeights;
      return;
    }

    vec2 velocity = decodeVelocity(texture(uFlow, vUv));
    vec2 backUv = vUv - (velocity * 0.52 + idleFlow(vUv, uTime)) / uScreenScale * uDelta;
    backUv = clamp(backUv, uTexel * 0.5, 1.0 - uTexel * 0.5);

    vec4 advected = texture(uPreviousDye, backUv);
    vec4 blurred = 0.25 * (
      texture(uPreviousDye, backUv + vec2(uTexel.x, 0.0)) +
      texture(uPreviousDye, backUv - vec2(uTexel.x, 0.0)) +
      texture(uPreviousDye, backUv + vec2(0.0, uTexel.y)) +
      texture(uPreviousDye, backUv - vec2(0.0, uTexel.y))
    );
    float diffusion = 1.0 - exp(-0.40 * uDelta);
    vec4 dye = mix(advected, blurred, diffusion);
    float recovery = 1.0 - exp(-uRecoveryRate * uDelta);
    dye = mix(dye, sourceWeights, recovery);
    outColor = normalizeInkWeights(dye);
  }
`;

const BACKGROUND_FRAGMENT_SHADER = `#version 300 es
  precision highp float;

  in vec2 vUv;
  out vec4 outColor;

  uniform sampler2D uDye;
  uniform sampler2D uFlow;
  uniform vec2 uDyeTexel;
  uniform vec2 uScreenScale;
  uniform float uTime;
  uniform float uTaskStrength;
  uniform float uVelocityMax;
  uniform float uDebug;

  vec2 decodeVelocity(vec4 sampleValue) {
    vec2 signedByte = sampleValue.rg * 255.0 - 128.0;
    return signedByte / 127.0 * uVelocityMax;
  }

  const vec3 COLOR_MINT = vec3(0.620, 0.925, 0.720);
  const vec3 COLOR_SAGE = vec3(0.530, 0.800, 0.590);
  const vec3 COLOR_AQUA = vec3(0.620, 0.890, 0.920);
  const vec3 COLOR_OLIVE = vec3(0.800, 0.865, 0.520);
  const vec3 COLOR_CREAM = vec3(0.970, 0.965, 0.850);

  vec4 normalizeInkWeights(vec4 weights) {
    weights = max(weights, vec4(0.0));
    float total = dot(weights, vec4(1.0));
    if (total > 0.992) weights *= 0.992 / total;
    return weights;
  }

  vec3 paletteColor(vec4 sampleValue) {
    vec4 weights = normalizeInkWeights(sampleValue);
    float creamWeight = max(1.0 - dot(weights, vec4(1.0)), 0.0);
    return COLOR_CREAM * creamWeight
      + COLOR_MINT * weights.r
      + COLOR_SAGE * weights.g
      + COLOR_AQUA * weights.b
      + COLOR_OLIVE * weights.a;
  }

  float luminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    vec4 flowSample = texture(uFlow, vUv);
    vec2 velocity = decodeVelocity(flowSample);
    vec2 normalizedFlow = velocity / uVelocityMax;
    float flowMagnitude = clamp(max(length(normalizedFlow), flowSample.b * 0.55), 0.0, 1.0);

    if (uDebug > 0.5) {
      outColor = vec4(0.5 + normalizedFlow * 0.5, flowMagnitude, 1.0);
      return;
    }

    float response = smoothstep(0.025, 0.68, flowMagnitude);
    float dyeDistortion = mix(0.0015, 0.010, response);
    vec2 uvFlow = normalizedFlow / uScreenScale;
    vec2 idleDisplayWarp = (
      vec2(
        sin(vUv.y * 7.4 + vUv.x * 2.1 + uTime * 0.650),
        cos(vUv.x * 6.8 - vUv.y * 1.7 - uTime * 0.520)
      ) * 0.0250
      + vec2(
        cos(vUv.y * 4.2 - vUv.x * 3.1 - uTime * 0.430),
        sin(vUv.x * 4.8 + vUv.y * 2.7 + uTime * 0.710)
      ) * 0.0100
    ) / uScreenScale;
    vec2 warpedUv = vUv + (-uvFlow * dyeDistortion + idleDisplayWarp) * uTaskStrength;
    vec4 dyeWeights = texture(uDye, clamp(warpedUv, vec2(0.001), vec2(0.999)));
    vec3 color = paletteColor(dyeWeights);

    float rightLuma = luminance(paletteColor(texture(uDye, clamp(warpedUv + vec2(uDyeTexel.x, 0.0), vec2(0.001), vec2(0.999)))));
    float leftLuma = luminance(paletteColor(texture(uDye, clamp(warpedUv - vec2(uDyeTexel.x, 0.0), vec2(0.001), vec2(0.999)))));
    float topLuma = luminance(paletteColor(texture(uDye, clamp(warpedUv + vec2(0.0, uDyeTexel.y), vec2(0.001), vec2(0.999)))));
    float bottomLuma = luminance(paletteColor(texture(uDye, clamp(warpedUv - vec2(0.0, uDyeTexel.y), vec2(0.001), vec2(0.999)))));
    vec2 dyeGradient = vec2(rightLuma - leftLuma, topLuma - bottomLuma);
    vec3 surfaceNormal = normalize(vec3(-dyeGradient * 32.0, 1.0));
    float softLight = 0.988 + max(dot(surfaceNormal, normalize(vec3(-0.28, 0.38, 0.88))), 0.0) * 0.018;
    color *= softLight;

    color *= 1.0 + flowMagnitude * 0.006;
    color = clamp(color, vec3(0.50), vec3(0.985));
    outColor = vec4(color, 1.0);
  }
`;

function noopController() {
  return {
    setTaskMode() {},
    destroy() {}
  };
}

export function createAmbientLiquidField({ canvas, fallback, glassPanel }) {
  if (!canvas || !glassPanel) return noopController();

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
  const forcedColors = window.matchMedia('(forced-colors: active)');
  const debugMode = new URLSearchParams(window.location.search).get('fluidDebug') === '1';
  const pointer = { x: 0, y: 0, sampleX: 0, sampleY: 0, speed: 0, time: 0, valid: false };
  const task = { current: 1, target: 1 };
  const glass = {
    currentX: 0.46,
    currentY: 0.18,
    currentProximity: 0,
    targetX: 0.46,
    targetY: 0.18,
    targetProximity: 0,
    energy: 0
  };

  const queue = {
    positionX: new Float32Array(SPLAT_QUEUE_CAPACITY),
    positionY: new Float32Array(SPLAT_QUEUE_CAPACITY),
    directionX: new Float32Array(SPLAT_QUEUE_CAPACITY),
    directionY: new Float32Array(SPLAT_QUEUE_CAPACITY),
    radiusShort: new Float32Array(SPLAT_QUEUE_CAPACITY),
    radiusLong: new Float32Array(SPLAT_QUEUE_CAPACITY),
    speed: new Float32Array(SPLAT_QUEUE_CAPACITY),
    head: 0,
    count: 0
  };

  const splatUniforms = {
    position: new Float32Array(MAX_SPLATS * 2),
    direction: new Float32Array(MAX_SPLATS * 2),
    shape: new Float32Array(MAX_SPLATS * 3)
  };

  let gl = null;
  let vao = null;
  let positionBuffer = null;
  let flowProgram = null;
  let dyeProgram = null;
  let backgroundProgram = null;
  let flowUniforms = null;
  let dyeUniforms = null;
  let backgroundUniforms = null;
  let flowRead = null;
  let flowWrite = null;
  let dyeRead = null;
  let dyeWrite = null;
  let glassRect = glassPanel.getBoundingClientRect();
  let canvasRect = canvas.getBoundingClientRect();
  let animationFrame = 0;
  let lastFrameTime = 0;
  let nextFrameTime = 0;
  let startTime = performance.now();
  let ready = false;
  let paused = false;
  let contextLost = false;
  let destroyed = false;
  let dyeRecoveryRate = 1.0;

  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => measureElements())
    : null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function smoothstep(edge0, edge1, value) {
    const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return normalized * normalized * (3 - 2 * normalized);
  }

  function canAnimate() {
    return !reducedMotion.matches && finePointer.matches && !forcedColors.matches;
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('shader-create-failed');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error('shader-compile-failed');
    }
    return shader;
  }

  function createProgram(fragmentSource) {
    let vertexShader = null;
    let fragmentShader = null;
    let program = null;
    try {
      vertexShader = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
      fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram();
      if (!program) throw new Error('program-create-failed');
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error('program-link-failed');
      }
      return program;
    } catch (error) {
      if (program) gl.deleteProgram(program);
      throw error;
    } finally {
      if (vertexShader) gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
    }
  }

  function createRenderTarget({
    clearColor = [NEUTRAL_FLOW, NEUTRAL_FLOW, 0, 1],
    internalFormat = gl.RGBA8,
    type = gl.UNSIGNED_BYTE,
    filter = gl.LINEAR
  } = {}) {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
      if (texture) gl.deleteTexture(texture);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      throw new Error('render-target-create-failed');
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      FLOW_WIDTH,
      FLOW_HEIGHT,
      0,
      gl.RGBA,
      type,
      null
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw new Error('framebuffer-incomplete');
    }

    gl.viewport(0, 0, FLOW_WIDTH, FLOW_HEIGHT);
    gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture, framebuffer };
  }

  function deleteRenderTarget(target) {
    if (!target || !gl || contextLost) return;
    gl.deleteFramebuffer(target.framebuffer);
    gl.deleteTexture(target.texture);
  }

  function createDyeTargets() {
    const clearColor = [0, 0, 0, 0];
    const supportsFloatColor = Boolean(gl.getExtension('EXT_color_buffer_float'));
    const supportsFloatLinear = Boolean(gl.getExtension('OES_texture_float_linear'));

    if (supportsFloatColor && supportsFloatLinear) {
      try {
        dyeRead = createRenderTarget({ clearColor, internalFormat: gl.RGBA16F, type: gl.HALF_FLOAT });
        dyeWrite = createRenderTarget({ clearColor, internalFormat: gl.RGBA16F, type: gl.HALF_FLOAT });
        dyeRecoveryRate = 0.05;
        canvas.dataset.dyeFormat = 'rgba16f';
        return;
      } catch {
        deleteRenderTarget(dyeRead);
        deleteRenderTarget(dyeWrite);
        dyeRead = null;
        dyeWrite = null;
      }
    }

    dyeRead = createRenderTarget({ clearColor });
    dyeWrite = createRenderTarget({ clearColor });
    dyeRecoveryRate = 1.0;
    canvas.dataset.dyeFormat = 'rgba8';
  }

  function locateFlowUniforms() {
    return {
      previous: gl.getUniformLocation(flowProgram, 'uPrevious'),
      texel: gl.getUniformLocation(flowProgram, 'uTexel'),
      screenScale: gl.getUniformLocation(flowProgram, 'uScreenScale'),
      delta: gl.getUniformLocation(flowProgram, 'uDelta'),
      dissipation: gl.getUniformLocation(flowProgram, 'uDissipation'),
      diffusion: gl.getUniformLocation(flowProgram, 'uDiffusion'),
      velocityMax: gl.getUniformLocation(flowProgram, 'uVelocityMax'),
      splatCount: gl.getUniformLocation(flowProgram, 'uSplatCount'),
      splatPosition: gl.getUniformLocation(flowProgram, 'uSplatPosition[0]'),
      splatDirection: gl.getUniformLocation(flowProgram, 'uSplatDirection[0]'),
      splatShape: gl.getUniformLocation(flowProgram, 'uSplatShape[0]')
    };
  }

  function locateDyeUniforms() {
    return {
      previousDye: gl.getUniformLocation(dyeProgram, 'uPreviousDye'),
      flow: gl.getUniformLocation(dyeProgram, 'uFlow'),
      texel: gl.getUniformLocation(dyeProgram, 'uTexel'),
      screenScale: gl.getUniformLocation(dyeProgram, 'uScreenScale'),
      cssMinDimension: gl.getUniformLocation(dyeProgram, 'uCssMinDimension'),
      delta: gl.getUniformLocation(dyeProgram, 'uDelta'),
      time: gl.getUniformLocation(dyeProgram, 'uTime'),
      velocityMax: gl.getUniformLocation(dyeProgram, 'uVelocityMax'),
      recoveryRate: gl.getUniformLocation(dyeProgram, 'uRecoveryRate'),
      reset: gl.getUniformLocation(dyeProgram, 'uReset')
    };
  }

  function locateBackgroundUniforms() {
    return {
      dye: gl.getUniformLocation(backgroundProgram, 'uDye'),
      flow: gl.getUniformLocation(backgroundProgram, 'uFlow'),
      dyeTexel: gl.getUniformLocation(backgroundProgram, 'uDyeTexel'),
      screenScale: gl.getUniformLocation(backgroundProgram, 'uScreenScale'),
      time: gl.getUniformLocation(backgroundProgram, 'uTime'),
      taskStrength: gl.getUniformLocation(backgroundProgram, 'uTaskStrength'),
      velocityMax: gl.getUniformLocation(backgroundProgram, 'uVelocityMax'),
      debug: gl.getUniformLocation(backgroundProgram, 'uDebug')
    };
  }

  function buildResources() {
    flowProgram = createProgram(FLOW_FRAGMENT_SHADER);
    dyeProgram = createProgram(DYE_FRAGMENT_SHADER);
    backgroundProgram = createProgram(BACKGROUND_FRAGMENT_SHADER);

    vao = gl.createVertexArray();
    positionBuffer = gl.createBuffer();
    if (!vao || !positionBuffer) throw new Error('geometry-create-failed');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    flowRead = createRenderTarget();
    flowWrite = createRenderTarget();
    createDyeTargets();
    flowUniforms = locateFlowUniforms();
    dyeUniforms = locateDyeUniforms();
    backgroundUniforms = locateBackgroundUniforms();

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
  }

  function deleteResources() {
    if (!gl) return;
    if (!contextLost) {
      deleteRenderTarget(flowRead);
      deleteRenderTarget(flowWrite);
      deleteRenderTarget(dyeRead);
      deleteRenderTarget(dyeWrite);
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      if (vao) gl.deleteVertexArray(vao);
      if (flowProgram) gl.deleteProgram(flowProgram);
      if (dyeProgram) gl.deleteProgram(dyeProgram);
      if (backgroundProgram) gl.deleteProgram(backgroundProgram);
    }
    flowRead = null;
    flowWrite = null;
    dyeRead = null;
    dyeWrite = null;
    positionBuffer = null;
    vao = null;
    flowProgram = null;
    dyeProgram = null;
    backgroundProgram = null;
    flowUniforms = null;
    dyeUniforms = null;
    backgroundUniforms = null;
  }

  function clearFlowTargets() {
    if (!gl || contextLost || !flowRead || !flowWrite) return;
    gl.clearColor(NEUTRAL_FLOW, NEUTRAL_FLOW, 0, 1);
    for (const target of [flowRead, flowWrite]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, FLOW_WIDTH, FLOW_HEIGHT);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function resetGlassStyles() {
    for (const property of [
      '--glass-x', '--glass-y', '--glass-shift-x', '--glass-shift-y',
      '--glass-specular-opacity', '--glass-tint-alpha', '--edge-top-a',
      '--edge-left-a', '--edge-right-a', '--edge-bottom-a'
    ]) {
      glassPanel.style.removeProperty(property);
    }
  }

  function clearInteractionState(removeGlassStyles = false) {
    queue.head = 0;
    queue.count = 0;
    resetPointer();
    glass.currentX = 0.46;
    glass.currentY = 0.18;
    glass.currentProximity = 0;
    glass.energy = 0;
    if (removeGlassStyles) resetGlassStyles();
  }

  function resizeCanvas() {
    canvasRect = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const requestedWidth = Math.max(1, canvasRect.width * pixelRatio);
    const requestedHeight = Math.max(1, canvasRect.height * pixelRatio);
    const pixelScale = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (requestedWidth * requestedHeight)));
    const width = Math.max(1, Math.round(requestedWidth * pixelScale));
    const height = Math.max(1, Math.round(requestedHeight * pixelScale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function measureElements() {
    glassRect = glassPanel.getBoundingClientRect();
    resizeCanvas();
  }

  function enqueueSplat(positionX, positionY, directionX, directionY, radiusShort, radiusLong, speed) {
    if (queue.count === SPLAT_QUEUE_CAPACITY) {
      queue.head = (queue.head + 1) % SPLAT_QUEUE_CAPACITY;
      queue.count--;
    }
    const index = (queue.head + queue.count) % SPLAT_QUEUE_CAPACITY;
    queue.positionX[index] = positionX;
    queue.positionY[index] = positionY;
    queue.directionX[index] = directionX;
    queue.directionY[index] = directionY;
    queue.radiusShort[index] = radiusShort;
    queue.radiusLong[index] = radiusLong;
    queue.speed[index] = speed;
    queue.count++;
  }

  function drainSplats() {
    if (queue.count > MAX_SPLATS) {
      queue.head = (queue.head + queue.count - MAX_SPLATS) % SPLAT_QUEUE_CAPACITY;
      queue.count = MAX_SPLATS;
    }
    const count = queue.count;
    for (let outputIndex = 0; outputIndex < count; outputIndex++) {
      const queueIndex = (queue.head + outputIndex) % SPLAT_QUEUE_CAPACITY;
      const positionOffset = outputIndex * 2;
      const shapeOffset = outputIndex * 3;
      splatUniforms.position[positionOffset] = queue.positionX[queueIndex];
      splatUniforms.position[positionOffset + 1] = queue.positionY[queueIndex];
      splatUniforms.direction[positionOffset] = queue.directionX[queueIndex];
      splatUniforms.direction[positionOffset + 1] = queue.directionY[queueIndex];
      splatUniforms.shape[shapeOffset] = queue.radiusShort[queueIndex];
      splatUniforms.shape[shapeOffset + 1] = queue.radiusLong[queueIndex];
      splatUniforms.shape[shapeOffset + 2] = queue.speed[queueIndex];
    }
    queue.head = 0;
    queue.count = 0;
    return count;
  }

  function updateFlow(delta) {
    const splatCount = drainSplats();
    const minDimension = Math.max(1, Math.min(canvasRect.width, canvasRect.height));
    gl.bindFramebuffer(gl.FRAMEBUFFER, flowWrite.framebuffer);
    gl.viewport(0, 0, FLOW_WIDTH, FLOW_HEIGHT);
    gl.useProgram(flowProgram);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, flowRead.texture);
    gl.uniform1i(flowUniforms.previous, 0);
    gl.uniform2f(flowUniforms.texel, 1 / FLOW_WIDTH, 1 / FLOW_HEIGHT);
    gl.uniform2f(flowUniforms.screenScale, canvasRect.width / minDimension, canvasRect.height / minDimension);
    gl.uniform1f(flowUniforms.delta, delta);
    gl.uniform1f(flowUniforms.dissipation, 0.68);
    gl.uniform1f(flowUniforms.diffusion, 1.15);
    gl.uniform1f(flowUniforms.velocityMax, VELOCITY_MAX);
    gl.uniform1i(flowUniforms.splatCount, splatCount);
    if (splatCount) {
      gl.uniform2fv(flowUniforms.splatPosition, splatUniforms.position);
      gl.uniform2fv(flowUniforms.splatDirection, splatUniforms.direction);
      gl.uniform3fv(flowUniforms.splatShape, splatUniforms.shape);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const previousRead = flowRead;
    flowRead = flowWrite;
    flowWrite = previousRead;
  }

  function updateDye(delta, time, reset = false) {
    const minDimension = Math.max(1, Math.min(canvasRect.width, canvasRect.height));
    gl.bindFramebuffer(gl.FRAMEBUFFER, dyeWrite.framebuffer);
    gl.viewport(0, 0, FLOW_WIDTH, FLOW_HEIGHT);
    gl.useProgram(dyeProgram);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dyeRead.texture);
    gl.uniform1i(dyeUniforms.previousDye, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, flowRead.texture);
    gl.uniform1i(dyeUniforms.flow, 1);
    gl.uniform2f(dyeUniforms.texel, 1 / FLOW_WIDTH, 1 / FLOW_HEIGHT);
    gl.uniform2f(dyeUniforms.screenScale, canvasRect.width / minDimension, canvasRect.height / minDimension);
    gl.uniform1f(dyeUniforms.cssMinDimension, minDimension);
    gl.uniform1f(dyeUniforms.delta, delta);
    gl.uniform1f(dyeUniforms.time, time);
    gl.uniform1f(dyeUniforms.velocityMax, VELOCITY_MAX);
    gl.uniform1f(dyeUniforms.recoveryRate, dyeRecoveryRate);
    gl.uniform1f(dyeUniforms.reset, reset ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const previousRead = dyeRead;
    dyeRead = dyeWrite;
    dyeWrite = previousRead;
  }

  function resetDyeField(time) {
    if (!dyeRead || !dyeWrite) return;
    updateDye(1 / 60, time, true);
    updateDye(1 / 60, time, true);
  }

  function renderBackground(time) {
    const minDimension = Math.max(1, Math.min(canvasRect.width, canvasRect.height));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(backgroundProgram);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dyeRead.texture);
    gl.uniform1i(backgroundUniforms.dye, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, flowRead.texture);
    gl.uniform1i(backgroundUniforms.flow, 1);
    gl.uniform2f(backgroundUniforms.dyeTexel, 1 / FLOW_WIDTH, 1 / FLOW_HEIGHT);
    gl.uniform2f(backgroundUniforms.screenScale, canvasRect.width / minDimension, canvasRect.height / minDimension);
    gl.uniform1f(backgroundUniforms.time, time);
    gl.uniform1f(backgroundUniforms.taskStrength, task.current);
    gl.uniform1f(backgroundUniforms.velocityMax, VELOCITY_MAX);
    gl.uniform1f(backgroundUniforms.debug, debugMode ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function setGlassProperty(property, value) {
    if (glassPanel.style.getPropertyValue(property) !== value) {
      glassPanel.style.setProperty(property, value);
    }
  }

  function updateGlass(delta) {
    const follow = 1 - Math.exp(-8.5 * delta);
    glass.currentX += (glass.targetX - glass.currentX) * follow;
    glass.currentY += (glass.targetY - glass.currentY) * follow;
    glass.currentProximity += (glass.targetProximity - glass.currentProximity) * follow;
    glass.energy *= Math.exp(-3.2 * delta);
    task.current += (task.target - task.current) * (1 - Math.exp(-7.0 * delta));

    const proximity = glass.currentProximity * task.current;
    const shiftX = -2 + (glass.currentX - 0.5) * 48 * proximity;
    const shiftY = -8 + (glass.currentY - 0.5) * 36 * proximity;
    const specularBase = task.target < 1 ? 0.30 : 0.50;
    const specular = specularBase * (0.82 + proximity * 0.18) * (1 + glass.energy * 0.1);
    const tint = 0.025 + glass.energy * 0.01;
    const topEdge = 0.20 + 0.12 * (1 - glass.currentY) * proximity;
    const leftEdge = 0.14 + 0.10 * (1 - glass.currentX) * proximity;
    const rightEdge = 0.08 + 0.08 * glass.currentX * proximity;
    const bottomEdge = 0.06 + 0.06 * glass.currentY * proximity;

    setGlassProperty('--glass-x', `${(glass.currentX * 100).toFixed(2)}%`);
    setGlassProperty('--glass-y', `${(glass.currentY * 100).toFixed(2)}%`);
    setGlassProperty('--glass-shift-x', `${shiftX.toFixed(2)}px`);
    setGlassProperty('--glass-shift-y', `${shiftY.toFixed(2)}px`);
    setGlassProperty('--glass-specular-opacity', specular.toFixed(3));
    setGlassProperty('--glass-tint-alpha', tint.toFixed(3));
    setGlassProperty('--edge-top-a', topEdge.toFixed(3));
    setGlassProperty('--edge-left-a', leftEdge.toFixed(3));
    setGlassProperty('--edge-right-a', rightEdge.toFixed(3));
    setGlassProperty('--edge-bottom-a', bottomEdge.toFixed(3));
  }

  function renderFrame(now) {
    animationFrame = 0;
    if (!ready || paused || document.hidden || destroyed) return;

    if (!nextFrameTime) nextFrameTime = now;
    if (now < nextFrameTime) {
      animationFrame = requestAnimationFrame(renderFrame);
      return;
    }

    const actualElapsed = lastFrameTime ? now - lastFrameTime : FRAME_INTERVAL;
    const delta = clamp(actualElapsed / 1000, 1 / 240, 1 / 30);
    lastFrameTime = now;
    nextFrameTime += FRAME_INTERVAL;
    if (nextFrameTime < now - FRAME_INTERVAL) nextFrameTime = now + FRAME_INTERVAL;
    const simulationTime = (now - startTime) / 1000;
    updateFlow(delta);
    updateDye(delta, simulationTime);
    updateGlass(delta);
    renderBackground(simulationTime);
    animationFrame = requestAnimationFrame(renderFrame);
  }

  function start() {
    if (!ready || paused || document.hidden || animationFrame || destroyed) return;
    lastFrameTime = 0;
    nextFrameTime = 0;
    animationFrame = requestAnimationFrame(renderFrame);
  }

  function stop() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    lastFrameTime = 0;
    nextFrameTime = 0;
  }

  function showFallback(reason) {
    ready = false;
    stop();
    clearInteractionState(true);
    canvas.classList.remove('is-ready');
    canvas.dataset.liquidStatus = reason;
    document.body.classList.remove('has-liquid-field');
    if (fallback) fallback.dataset.active = 'true';
  }

  function initialize() {
    if (destroyed || !canAnimate()) {
      showFallback('static');
      return;
    }

    try {
      if (!gl) {
        gl = canvas.getContext('webgl2', {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false
        });
      }
      if (!gl) {
        showFallback('unsupported');
        return;
      }

      deleteResources();
      contextLost = false;
      buildResources();
      measureElements();
      clearInteractionState(false);
      startTime = performance.now();
      ready = true;
      canvas.dataset.liquidStatus = 'ready';
      canvas.classList.add('is-ready');
      if (fallback) fallback.dataset.active = 'false';
      updateFlow(1 / 60);
      resetDyeField(0);
      updateGlass(1 / 60);
      renderBackground(0);
      document.body.classList.add('has-liquid-field');
      start();
    } catch {
      deleteResources();
      showFallback('shader-error');
    }
  }

  function resetPointer() {
    pointer.valid = false;
    pointer.time = 0;
    pointer.speed = 0;
    glass.targetX = 0.46;
    glass.targetY = 0.18;
    glass.targetProximity = 0;
  }

  function updateGlassTarget(clientX, clientY, force) {
    glass.targetX = clamp((clientX - glassRect.left) / Math.max(glassRect.width, 1), 0.06, 0.94);
    glass.targetY = clamp((clientY - glassRect.top) / Math.max(glassRect.height, 1), 0.06, 0.94);
    const dx = Math.max(glassRect.left - clientX, 0, clientX - glassRect.right);
    const dy = Math.max(glassRect.top - clientY, 0, clientY - glassRect.bottom);
    glass.targetProximity = smoothstep(0, 1, clamp(1 - Math.hypot(dx, dy) / 230, 0, 1));
    glass.energy = Math.max(glass.energy, force);
  }

  function seedPointer(event) {
    if (event.pointerType === 'touch') return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.sampleX = event.clientX;
    pointer.sampleY = event.clientY;
    pointer.speed = 0;
    pointer.time = event.timeStamp || performance.now();
    pointer.valid = true;
    updateGlassTarget(event.clientX, event.clientY, 0);
  }

  function onPointerMove(event) {
    if (!ready || event.pointerType === 'touch') return;
    const eventTime = event.timeStamp || performance.now();
    if (!pointer.valid || eventTime - pointer.time > 120) {
      seedPointer(event);
      return;
    }

    const elapsed = (eventTime - pointer.time) / 1000;
    if (!Number.isFinite(elapsed) || elapsed <= 0) return;
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    const minDimension = Math.max(1, Math.min(canvasRect.width, canvasRect.height));
    const uvX = deltaX / minDimension;
    const uvY = -deltaY / minDimension;
    const uvDistance = Math.hypot(uvX, uvY);
    const measuredSpeed = uvDistance / elapsed;
    const speedFollow = 1 - Math.exp(-18 * elapsed);
    pointer.speed += (measuredSpeed - pointer.speed) * speedFollow;
    const normalizedSpeed = clamp(pointer.speed / SPEED_REFERENCE, 0, 1);
    const force = smoothstep(0.05, 0.75, normalizedSpeed) * task.target;

    updateGlassTarget(event.clientX, event.clientY, force);
    const sampleDeltaX = event.clientX - pointer.sampleX;
    const sampleDeltaY = event.clientY - pointer.sampleY;
    const sampleDistancePixels = Math.hypot(sampleDeltaX, sampleDeltaY);
    const shortRadiusPixels = 52 + force * 72;
    const sampleStep = Math.max(18, shortRadiusPixels * 0.36);

    if (sampleDistancePixels >= sampleStep && force > 0.002) {
      const sampleUvX = sampleDeltaX / minDimension;
      const sampleUvY = -sampleDeltaY / minDimension;
      const sampleUvDistance = Math.max(Math.hypot(sampleUvX, sampleUvY), 0.00001);
      const directionX = sampleUvX / sampleUvDistance;
      const directionY = sampleUvY / sampleUvDistance;
      const longRadiusPixels = 96 + force * 224;
      const shortRadius = shortRadiusPixels / minDimension;
      const longRadius = longRadiusPixels / minDimension;
      const injectionSpeed = clamp(pointer.speed, 0, VELOCITY_MAX) * (0.14 + force * 0.96) * task.target;
      const sampleCount = clamp(Math.floor(sampleDistancePixels / sampleStep), 1, MAX_SPLATS_PER_EVENT);

      for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex++) {
        const progress = sampleIndex / sampleCount;
        const sampleX = pointer.sampleX + sampleDeltaX * progress;
        const sampleY = pointer.sampleY + sampleDeltaY * progress;
        enqueueSplat(
          clamp((sampleX - canvasRect.left) / Math.max(canvasRect.width, 1), 0, 1),
          clamp(1 - (sampleY - canvasRect.top) / Math.max(canvasRect.height, 1), 0, 1),
          directionX,
          directionY,
          shortRadius,
          longRadius,
          injectionSpeed
        );
      }
      pointer.sampleX = event.clientX;
      pointer.sampleY = event.clientY;
    } else if (sampleDistancePixels >= sampleStep && force <= 0.002) {
      pointer.sampleX = event.clientX;
      pointer.sampleY = event.clientY;
    }

    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.time = eventTime;
  }

  function onResize() {
    measureElements();
    clearInteractionState(false);
    clearFlowTargets();
    if (ready) resetDyeField((performance.now() - startTime) / 1000);
  }

  function onVisibilityChange() {
    if (document.hidden) {
      stop();
      clearInteractionState(false);
      clearFlowTargets();
    } else start();
  }

  function onContextLost(event) {
    event.preventDefault();
    contextLost = true;
    clearInteractionState(true);
    showFallback('context-lost');
  }

  function onContextRestored() {
    contextLost = false;
    initialize();
  }

  function onCapabilityChange() {
    if (canAnimate()) initialize();
    else {
      deleteResources();
      showFallback('static');
    }
  }

  function addMediaListener(query, listener) {
    if (query.addEventListener) query.addEventListener('change', listener);
    else query.addListener(listener);
  }

  function removeMediaListener(query, listener) {
    if (query.removeEventListener) query.removeEventListener('change', listener);
    else query.removeListener(listener);
  }

  function onPageHide(event) {
    stop();
    if (event.persisted) paused = true;
    else destroy();
  }

  function onPageShow(event) {
    if (!event.persisted || destroyed) return;
    paused = false;
    measureElements();
    start();
  }

  function setTaskMode(active) {
    task.target = active ? 0.62 : 1;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stop();
    resizeObserver?.disconnect();
    window.removeEventListener('pointerdown', seedPointer);
    window.removeEventListener('pointermove', onPointerMove);
    document.documentElement.removeEventListener('pointerleave', resetPointer);
    window.removeEventListener('pointercancel', resetPointer);
    window.removeEventListener('blur', resetPointer);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    removeMediaListener(reducedMotion, onCapabilityChange);
    removeMediaListener(finePointer, onCapabilityChange);
    removeMediaListener(forcedColors, onCapabilityChange);
    deleteResources();
    clearInteractionState(true);
    document.body.classList.remove('has-liquid-field');
  }

  window.addEventListener('pointerdown', seedPointer, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', resetPointer, { passive: true });
  window.addEventListener('pointercancel', resetPointer, { passive: true });
  window.addEventListener('blur', resetPointer);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('visibilitychange', onVisibilityChange);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  addMediaListener(reducedMotion, onCapabilityChange);
  addMediaListener(finePointer, onCapabilityChange);
  addMediaListener(forcedColors, onCapabilityChange);
  resizeObserver?.observe(canvas);
  resizeObserver?.observe(glassPanel);
  initialize();

  return { setTaskMode, destroy };
}
