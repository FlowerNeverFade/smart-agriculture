const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
out vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const RIPPLE_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outState;

uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec4 uImpulse;
uniform float uDamping;
uniform float uVelocityDamping;
uniform float uWaveStrength;

void main() {
  vec2 centerState = texture(uState, vUv).rg * 2.0 - 1.0;
  vec2 leftState = texture(uState, vUv - vec2(uTexel.x, 0.0)).rg * 2.0 - 1.0;
  vec2 rightState = texture(uState, vUv + vec2(uTexel.x, 0.0)).rg * 2.0 - 1.0;
  vec2 topState = texture(uState, vUv + vec2(0.0, uTexel.y)).rg * 2.0 - 1.0;
  vec2 bottomState = texture(uState, vUv - vec2(0.0, uTexel.y)).rg * 2.0 - 1.0;

  float height = centerState.x;
  float velocity = centerState.y;
  float laplacian = leftState.x + rightState.x + topState.x + bottomState.x - height * 4.0;
  float distanceToImpulse = distance(vUv, uImpulse.xy);
  float impulseRadius = max(uImpulse.z * uImpulse.z, 0.00004);
  float impulse = uImpulse.w * exp(-distanceToImpulse * distanceToImpulse / impulseRadius);

  velocity = (velocity + laplacian * uWaveStrength + impulse) * uVelocityDamping;
  height = clamp((height + velocity) * uDamping, -1.0, 1.0);
  outState = vec4(height * 0.5 + 0.5, velocity * 0.5 + 0.5, 0.5, 1.0);
}
`;

const DISPLAY_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uRippleMap;
uniform vec2 uResolution;
uniform vec2 uSphereCenter;
uniform float uSphereRadius;
uniform float uTime;
uniform float uActualWaterLevel;
uniform float uProjectedWaterLevel;
uniform float uHasPreview;
uniform vec2 uPointer;
uniform float uPointerActive;
uniform vec2 uPointerVelocity;
uniform float uRiskState;
uniform float uMotionScale;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2d(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float result = 0.0;
  float amplitude = 0.52;
  for (int octave = 0; octave < 3; octave += 1) {
    result += noise2d(p) * amplitude;
    p = p * 2.04 + vec2(13.7, 8.1);
    amplitude *= 0.48;
  }
  return result;
}

vec3 riskTint(float state) {
  vec3 safe = vec3(0.035, 0.56, 0.82);
  vec3 warning = vec3(0.12, 0.55, 0.78);
  vec3 critical = vec3(0.16, 0.34, 0.68);
  if (state < 0.5) return safe;
  if (state < 1.5) return warning;
  return critical;
}

void main() {
  vec2 screenTop = vec2(vUv.x * uResolution.x, (1.0 - vUv.y) * uResolution.y);
  vec2 local = (screenTop - uSphereCenter) / max(uSphereRadius, 1.0);
  float distanceFromCenter = length(local);
  float sphereMask = 1.0 - smoothstep(0.965, 1.0, distanceFromCenter);
  float outerHalo = 1.0 - smoothstep(1.0, 1.22, distanceFromCenter);
  float rippleHeight = texture(uRippleMap, vUv).r * 2.0 - 1.0;
  float rippleBand = smoothstep(0.0015, 0.012, abs(rippleHeight)) * (1.0 - smoothstep(0.012, 0.06, abs(rippleHeight)));
  float time = uTime * uMotionScale;
  float flowNoise = fbm(local * 3.55 + vec2(time * 0.12, -time * 0.085));
  float fineNoise = noise2d(local * 13.0 + vec2(-time * 0.22, time * 0.15));
  float currentBands = sin(local.y * 18.0 + flowNoise * 5.0 + time * 0.72) * 0.5 + 0.5;
  float movement = rippleHeight * 0.3 + (flowNoise - 0.48) * 0.1 + (fineNoise - 0.5) * 0.035;

  float sphereDepth = sqrt(max(0.0, 1.0 - dot(local, local)));
  vec3 normal = normalize(vec3(local.x, local.y, sphereDepth));
  float fresnel = pow(1.0 - max(normal.z, 0.0), 2.6);
  float pointerDistance = distance(screenTop, uPointer * uResolution);
  float pointerGlow = exp(-pointerDistance * pointerDistance / max(uSphereRadius * uSphereRadius * 0.22, 1.0)) * uPointerActive;
  float pointerDirection = dot(normal.xy, normalize(uPointerVelocity + vec2(0.0001)));

  float surfaceY = 1.0 - uActualWaterLevel * 2.0 + movement;
  float waterMask = smoothstep(surfaceY - 0.045, surfaceY + 0.045, local.y);
  float surfaceLine = exp(-pow((local.y - surfaceY) / 0.018, 2.0));

  float projectedY = 1.0 - uProjectedWaterLevel * 2.0;
  float projectedLine = exp(-pow((local.y - projectedY) / 0.012, 2.0)) * uHasPreview;
  vec3 tint = riskTint(uRiskState);
  vec2 refractedUv = vUv + normal.xy * 0.028 * waterMask + rippleHeight * vec2(0.034, -0.025) * waterMask;
  float refractedFlow = fbm(refractedUv * 9.5 + vec2(time * 0.12, -time * 0.09));
  float caustic = smoothstep(0.48, 0.82, sin((refractedFlow + fineNoise + currentBands * 0.18) * 9.0 + time * 0.38) * 0.5 + 0.5);

  vec3 deepWater = mix(vec3(0.008, 0.09, 0.16), tint * 0.72, 0.52 + flowNoise * 0.34);
  vec3 waterLight = tint + vec3(0.16, 0.24, 0.22) * caustic;
  vec3 waterColor = mix(deepWater, waterLight, clamp(flowNoise * 0.78 + caustic * 0.38 + currentBands * 0.12, 0.0, 1.0));
  waterColor += vec3(0.08, 0.24, 0.3) * pointerGlow * (0.42 + pointerDirection * 0.16);

  vec3 shellColor = mix(vec3(0.02, 0.12, 0.19), vec3(0.36, 0.8, 0.96), fresnel * 0.84 + pointerGlow * 0.2);
  shellColor += vec3(0.34, 0.7, 0.86) * surfaceLine * 0.42;
  shellColor += vec3(0.63, 0.9, 1.0) * fresnel * 0.24;

  vec3 color = mix(shellColor, waterColor, waterMask * 0.93);
  color += vec3(0.42, 0.78, 0.94) * surfaceLine * 0.72;
  color += vec3(0.74, 0.92, 1.0) * projectedLine * 0.45;
  color += vec3(0.16, 0.48, 0.7) * outerHalo * 0.18;
  color += vec3(0.18, 0.56, 0.72) * rippleBand * 0.12 * (1.0 - sphereMask);
  color *= sphereMask;

  float alpha = sphereMask * (0.14 + fresnel * 0.56 + waterMask * 0.54 + surfaceLine * 0.16 + projectedLine * 0.08);
  alpha += outerHalo * 0.06 + rippleBand * 0.16 * (1.0 - sphereMask);
  outColor = vec4(color, clamp(alpha, 0.0, 0.9));
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compilation error';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown shader link error';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function createUniforms(gl, program, names) {
  return names.reduce((result, name) => {
    result[name] = gl.getUniformLocation(program, name);
    return result;
  }, {});
}

function destroyTarget(gl, target) {
  if (!target) return;
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}

function createRippleTarget(gl, width, height) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!complete) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    throw new Error('Water ripple framebuffer is incomplete');
  }
  return { framebuffer, texture, width, height };
}

function getRootSize(root) {
  const rect = root.getBoundingClientRect();
  return {
    rect,
    width: Math.max(1, root.clientWidth || rect.width),
    height: Math.max(1, root.scrollHeight || rect.height)
  };
}

export function createWaterShaderRenderer(canvas, options = {}) {
  if (!canvas || !options.root) return null;
  let gl;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'low-power'
    });
  } catch (_error) {
    return null;
  }
  if (!gl) return null;

  let rippleProgram;
  let displayProgram;
  let quadBuffer;
  let readTarget;
  let writeTarget;
  let destroyed = false;
  let cssWidth = 1;
  let cssHeight = 1;
  let pixelRatio = 1;
  let simWidth = 128;
  let simHeight = 128;
  let sphereCenter = [0.5, 0.5];
  let sphereRadius = 240;
  let timeSeconds = 0;
  let previousTime = 0;
  let accumulator = 0;
  let paused = false;
  let reducedMotion = Boolean(options.reducedMotion);
  let state = {
    actualWaterLevel: 0.752,
    projectedWaterLevel: 0.752,
    hasPreview: false,
    riskState: 0
  };
  let pointer = { x: 0.5, y: 0.35, active: false, velocityX: 0, velocityY: 0 };
  const pendingImpulses = [];

  try {
    rippleProgram = createProgram(gl, VERTEX_SHADER, RIPPLE_SHADER);
    displayProgram = createProgram(gl, VERTEX_SHADER, DISPLAY_SHADER);
    quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  } catch (error) {
    console.warn('[water-shader] WebGL2 initialization failed; using CSS fallback.', error);
    return null;
  }

  const rippleUniforms = createUniforms(gl, rippleProgram, [
    'uState', 'uTexel', 'uImpulse', 'uDamping', 'uVelocityDamping', 'uWaveStrength'
  ]);
  const displayUniforms = createUniforms(gl, displayProgram, [
    'uRippleMap', 'uResolution', 'uSphereCenter', 'uSphereRadius', 'uTime',
    'uActualWaterLevel', 'uProjectedWaterLevel', 'uHasPreview', 'uPointer',
    'uPointerActive', 'uPointerVelocity', 'uRiskState', 'uMotionScale'
  ]);

  const bindQuad = (program) => {
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  };

  const clearTarget = (target) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.clearColor(0.5, 0.5, 0.5, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };

  const rebuildRippleTargets = () => {
    const size = getRootSize(options.root);
    simWidth = clamp(Math.round(size.width * 0.18), 96, 192);
    simHeight = clamp(Math.round(size.height * 0.18), 96, 192);
    if (readTarget && readTarget.width === simWidth && readTarget.height === simHeight) return;
    const nextRead = createRippleTarget(gl, simWidth, simHeight);
    const nextWrite = createRippleTarget(gl, simWidth, simHeight);
    clearTarget(nextRead);
    clearTarget(nextWrite);
    destroyTarget(gl, readTarget);
    destroyTarget(gl, writeTarget);
    readTarget = nextRead;
    writeTarget = nextWrite;
  };

  const measure = () => {
    if (destroyed) return;
    const size = getRootSize(options.root);
    cssWidth = size.width;
    cssHeight = size.height;
    pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 900 ? 1 : 1.35);
    canvas.width = Math.max(1, Math.round(cssWidth * pixelRatio));
    canvas.height = Math.max(1, Math.round(cssHeight * pixelRatio));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    gl.viewport(0, 0, canvas.width, canvas.height);

    const sphere = options.sphereElement?.getBoundingClientRect();
    if (sphere) {
      const centerX = sphere.left - size.rect.left + sphere.width * 0.5;
      const centerY = sphere.top - size.rect.top + sphere.height * 0.5;
      sphereCenter = [centerX, centerY];
      sphereRadius = Math.max(40, Math.min(sphere.width, sphere.height) * 0.5);
    } else {
      sphereCenter = [cssWidth * 0.5, cssHeight * 0.34];
      sphereRadius = Math.min(cssWidth * 0.38, 360);
    }
    rebuildRippleTargets();
  };

  const drawRippleStep = (impulse) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeTarget.framebuffer);
    gl.viewport(0, 0, simWidth, simHeight);
    bindQuad(rippleProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTarget.texture);
    gl.uniform1i(rippleUniforms.uState, 0);
    gl.uniform2f(rippleUniforms.uTexel, 1 / simWidth, 1 / simHeight);
    gl.uniform4f(
      rippleUniforms.uImpulse,
      impulse?.x ?? 0.5,
      impulse?.y ?? 0.5,
      impulse?.radius ?? 0.02,
      impulse?.strength ?? 0
    );
    gl.uniform1f(rippleUniforms.uDamping, 0.999);
    gl.uniform1f(rippleUniforms.uVelocityDamping, 0.989);
    gl.uniform1f(rippleUniforms.uWaveStrength, 0.28);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const previousRead = readTarget;
    readTarget = writeTarget;
    writeTarget = previousRead;
  };

  const drawDisplay = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    bindQuad(displayProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTarget.texture);
    gl.uniform1i(displayUniforms.uRippleMap, 0);
    gl.uniform2f(displayUniforms.uResolution, cssWidth, cssHeight);
    gl.uniform2f(displayUniforms.uSphereCenter, sphereCenter[0], sphereCenter[1]);
    gl.uniform1f(displayUniforms.uSphereRadius, sphereRadius);
    gl.uniform1f(displayUniforms.uTime, timeSeconds);
    gl.uniform1f(displayUniforms.uActualWaterLevel, clamp(state.actualWaterLevel, 0, 1));
    gl.uniform1f(displayUniforms.uProjectedWaterLevel, clamp(state.projectedWaterLevel, 0, 1));
    gl.uniform1f(displayUniforms.uHasPreview, state.hasPreview ? 1 : 0);
    gl.uniform2f(displayUniforms.uPointer, pointer.x, pointer.y);
    gl.uniform1f(displayUniforms.uPointerActive, pointer.active ? 1 : 0);
    gl.uniform2f(displayUniforms.uPointerVelocity, pointer.velocityX, pointer.velocityY);
    gl.uniform1f(displayUniforms.uRiskState, clamp(state.riskState, 0, 2));
    gl.uniform1f(displayUniforms.uMotionScale, reducedMotion ? 0 : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const setState = (nextState = {}) => {
    state = {
      ...state,
      actualWaterLevel: clamp(nextState.actualWaterLevel ?? state.actualWaterLevel, 0, 1),
      projectedWaterLevel: clamp(nextState.projectedWaterLevel ?? state.projectedWaterLevel, 0, 1),
      hasPreview: Boolean(nextState.hasPreview ?? state.hasPreview),
      riskState: clamp(nextState.riskState ?? state.riskState, 0, 2)
    };
  };

  const setPointer = (nextPointer = {}) => {
    pointer = {
      ...pointer,
      x: clamp(nextPointer.x ?? pointer.x, 0, 1),
      y: clamp(nextPointer.y ?? pointer.y, 0, 1),
      active: Boolean(nextPointer.active ?? pointer.active),
      velocityX: clamp(nextPointer.velocityX ?? pointer.velocityX, -1, 1),
      velocityY: clamp(nextPointer.velocityY ?? pointer.velocityY, -1, 1)
    };
  };

  const addImpulse = (impulse = {}) => {
    if (reducedMotion || destroyed) return;
    const size = getRootSize(options.root);
    const normalized = {
      x: clamp(Number(impulse.x) / size.width, 0, 1),
      y: clamp(Number(impulse.y) / size.height, 0, 1),
      radius: clamp(Number(impulse.radius || 22) / Math.max(size.width, size.height), 0.006, 0.14),
      strength: clamp(Number(impulse.strength ?? 0.08), -0.4, 0.4)
    };
    pendingImpulses.push(normalized);
    if (pendingImpulses.length > 12) pendingImpulses.splice(0, pendingImpulses.length - 12);
  };

  const render = (time = performance.now()) => {
    if (destroyed || paused || !readTarget || !writeTarget) return;
    const seconds = time * 0.001;
    const delta = previousTime ? Math.min(0.05, Math.max(0.001, seconds - previousTime)) : 1 / 60;
    previousTime = seconds;
    timeSeconds += delta;
    accumulator += delta;
    let steps = 0;
    while (accumulator >= 1 / 60 && steps < 3) {
      const impulse = pendingImpulses.shift();
      drawRippleStep(impulse);
      accumulator -= 1 / 60;
      steps += 1;
    }
    drawDisplay();
  };

  const pause = () => { paused = true; };
  const resume = () => { paused = false; previousTime = performance.now() * 0.001; };
  const setReducedMotion = (value) => {
    reducedMotion = Boolean(value);
    if (reducedMotion) pendingImpulses.length = 0;
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    destroyTarget(gl, readTarget);
    destroyTarget(gl, writeTarget);
    gl.deleteProgram(rippleProgram);
    gl.deleteProgram(displayProgram);
    gl.deleteBuffer(quadBuffer);
    readTarget = null;
    writeTarget = null;
  };

  try {
    measure();
    setState(options.state);
    if (!options.reducedMotion) {
      drawDisplay();
    } else {
      drawDisplay();
    }
    options.onReady?.();
  } catch (error) {
    console.warn('[water-shader] WebGL2 setup failed; using CSS fallback.', error);
    destroy();
    options.onFailure?.(error);
    return null;
  }

  return {
    ready: true,
    resize: measure,
    setState,
    setPointer,
    addImpulse,
    render,
    pause,
    resume,
    setReducedMotion,
    destroy,
    get canvasSize() { return { width: cssWidth, height: cssHeight, pixelRatio }; }
  };
}
