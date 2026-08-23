const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const roles = {
  admin: { role: 'FARM_ADMIN', label: '农场管理员' },
  farmer: { role: 'FARMER', label: '种植农户' },
  operator: { role: 'FIELD_OPERATOR', label: '田间操作员' },
  sysadmin: { role: 'SYSTEM_ADMIN', label: '系统管理员' }
};

const form = document.getElementById('loginForm');
const username = document.getElementById('username');
const password = document.getElementById('password');
const revealPassword = document.getElementById('revealPassword');
const submitButton = document.getElementById('submitButton');
const demoToggle = document.getElementById('demoToggle');
const demoPanel = document.getElementById('demoPanel');
const forgotPassword = document.getElementById('forgotPassword');
const formError = document.getElementById('formError');
const toast = document.getElementById('toast');
const motionCanvas = document.getElementById('farmMotionCanvas');
const backdrop = document.getElementById('fieldBackdrop');
const authCard = document.querySelector('.auth');

function initBackgroundMotion() {
  if (reducedMotion || !motionCanvas || !backdrop || !authCard) return;
  motionCanvas.dataset.motionStatus = 'initializing';

  const gl = motionCanvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false
  });
  if (!gl) {
    motionCanvas.dataset.motionStatus = 'unsupported';
    return;
  }

  const vertexSource = `#version 300 es
    in vec2 aPosition;
    out vec2 vUv;

    void main() {
      vUv = aPosition * .5 + .5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fragmentSource = `#version 300 es
    precision highp float;

    in vec2 vUv;
    out vec4 outColor;

    uniform sampler2D uTexture;
    uniform vec2 uResolution;
    uniform vec2 uTextureSize;
    uniform vec2 uPointer;
    uniform float uTime;
    uniform float uFocusX;

    const float TAU = 6.28318530718;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    vec2 coverUv(vec2 uv) {
      float viewportAspect = uResolution.x / uResolution.y;
      float textureAspect = uTextureSize.x / uTextureSize.y;
      vec2 visibleRange = vec2(1.0);

      if (viewportAspect > textureAspect) {
        visibleRange.y = textureAspect / viewportAspect;
      } else {
        visibleRange.x = viewportAspect / textureAspect;
      }

      return (uv - .5) * visibleRange / 1.04 + vec2(uFocusX, .5);
    }

    void main() {
      float skyMask = smoothstep(.48, .82, vUv.y);
      float fieldMask = smoothstep(.12, .39, vUv.y) * (1.0 - smoothstep(.62, .8, vUv.y));
      float foregroundMask = 1.0 - smoothstep(.2, .54, vUv.y);
      float atmosphere = noise(vec2(vUv.x * 2.2 + uTime * .018, vUv.y * 2.6));

      vec2 uv = coverUv(vUv);
      float fieldWind = sin(uTime * TAU / 16.0 + vUv.x * 5.4 + atmosphere * 1.7);
      float foregroundWind = sin(uTime * TAU / 12.0 + vUv.y * 8.0 + atmosphere * 2.2);
      uv.x += fieldWind * fieldMask * .0017;
      uv.x += foregroundWind * foregroundMask * .00225;
      uv.y += cos(uTime * TAU / 12.0 + vUv.x * 6.2) * foregroundMask * .00105;

      float depth = fieldMask * .24 + foregroundMask;
      uv += vec2(uPointer.x * .0048, uPointer.y * .0032) * depth;
      uv = clamp(uv, vec2(.001), vec2(.999));

      vec3 color = texture(uTexture, uv).rgb;
      float lightPhase = sin(uTime * TAU / 24.0) * .5 + .5;
      vec2 lightCenter = vec2(.18 + lightPhase * .58, .84);
      vec2 lightDelta = (vUv - lightCenter) * vec2(1.0, 1.42);
      float skyVeil = exp(-dot(lightDelta, lightDelta) * 3.4) * skyMask;
      float horizonMist = exp(-pow((vUv.y - .46) * 8.0, 2.0));
      horizonMist *= .5 + .5 * sin(uTime * TAU / 24.0 + vUv.x * 3.2);

      color += vec3(1.0, .97, .79) * skyVeil * .035;
      color += vec3(.93, .97, .82) * horizonMist * .014;
      color *= 1.016 + sin(uTime * TAU / 24.0) * .009;

      float luminance = dot(color, vec3(.299, .587, .114));
      color = mix(vec3(luminance), color, .88);
      color *= 1.025;
      outColor = vec4(color, 1.0);
    }
  `;

  const pointerTarget = { x: 0, y: 0 };
  const pointerCurrent = { x: 0, y: 0 };
  const frameInterval = 1000 / 30;
  const maxPixelRatio = 1.5;
  let program = null;
  let positionBuffer = null;
  let texture = null;
  let uniforms = null;
  let animationFrame = 0;
  let lastFrame = 0;
  let ready = false;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram() {
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) return null;

    const nextProgram = gl.createProgram();
    gl.attachShader(nextProgram, vertexShader);
    gl.attachShader(nextProgram, fragmentShader);
    gl.linkProgram(nextProgram);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(nextProgram, gl.LINK_STATUS)) {
      gl.deleteProgram(nextProgram);
      return null;
    }
    return nextProgram;
  }

  function resizeCanvas() {
    const bounds = motionCanvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    const width = Math.max(1, Math.round(bounds.width * pixelRatio));
    const height = Math.max(1, Math.round(bounds.height * pixelRatio));
    if (motionCanvas.width !== width || motionCanvas.height !== height) {
      motionCanvas.width = width;
      motionCanvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  }

  function stopLoop() {
    if (!animationFrame) return;
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function render(now) {
    animationFrame = 0;
    if (!ready || document.hidden) return;

    if (now - lastFrame >= frameInterval) {
      lastFrame = now;
      pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * .065;
      pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * .065;

      authCard.style.setProperty('--gloss-x', (50 + pointerCurrent.x * 38).toFixed(2) + '%');
      authCard.style.setProperty('--gloss-y', (28 + pointerCurrent.y * 26).toFixed(2) + '%');

      gl.useProgram(program);
      gl.uniform1f(uniforms.time, now * .001);
      gl.uniform2f(uniforms.pointer, pointerCurrent.x, pointerCurrent.y);
      gl.uniform2f(uniforms.resolution, motionCanvas.width, motionCanvas.height);
      gl.uniform1f(uniforms.focusX, window.innerWidth < 900 ? .42 : .5);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    animationFrame = window.requestAnimationFrame(render);
  }

  function startLoop() {
    if (!ready || document.hidden || animationFrame) return;
    animationFrame = window.requestAnimationFrame(render);
  }

  function showFallback(reason = 'fallback') {
    ready = false;
    stopLoop();
    motionCanvas.classList.remove('is-ready');
    motionCanvas.dataset.motionStatus = reason;
    document.body.classList.remove('has-background-motion');
  }

  function buildScene() {
    program = createProgram();
    if (!program) {
      showFallback('shader-error');
      return;
    }

    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, backdrop);

    gl.useProgram(program);
    uniforms = {
      time: gl.getUniformLocation(program, 'uTime'),
      pointer: gl.getUniformLocation(program, 'uPointer'),
      resolution: gl.getUniformLocation(program, 'uResolution'),
      textureSize: gl.getUniformLocation(program, 'uTextureSize'),
      focusX: gl.getUniformLocation(program, 'uFocusX')
    };
    gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0);
    gl.uniform2f(uniforms.textureSize, backdrop.naturalWidth, backdrop.naturalHeight);

    resizeCanvas();
    ready = true;
    motionCanvas.classList.add('is-ready');
    motionCanvas.dataset.motionStatus = 'ready';
    document.body.classList.add('has-background-motion');
    startLoop();
  }

  function updatePointer(clientX, clientY) {
    pointerTarget.x = Math.max(-1, Math.min(1, clientX / window.innerWidth * 2 - 1));
    pointerTarget.y = Math.max(-1, Math.min(1, clientY / window.innerHeight * 2 - 1));
  }

  window.addEventListener('pointermove', (event) => {
    updatePointer(event.clientX, event.clientY);
  }, { passive: true });

  window.addEventListener('pointerleave', () => {
    pointerTarget.x = 0;
    pointerTarget.y = 0;
  }, { passive: true });

  window.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'touch') return;
    pointerTarget.x = 0;
    pointerTarget.y = 0;
  }, { passive: true });

  window.addEventListener('pointercancel', () => {
    pointerTarget.x = 0;
    pointerTarget.y = 0;
  }, { passive: true });

  window.addEventListener('resize', resizeCanvas, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop();
    else startLoop();
  });

  motionCanvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showFallback('context-lost');
  });

  motionCanvas.addEventListener('webglcontextrestored', () => {
    buildScene();
  });

  if (backdrop.complete && backdrop.naturalWidth) buildScene();
  else {
    backdrop.addEventListener('load', buildScene, { once: true });
    backdrop.addEventListener('error', () => showFallback('texture-error'), { once: true });
  }
}

revealPassword.addEventListener('click', () => {
  const showing = password.type === 'text';
  password.type = showing ? 'password' : 'text';
  revealPassword.textContent = showing ? '显示' : '隐藏';
  revealPassword.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
});

demoToggle.addEventListener('click', () => {
  const willOpen = demoPanel.hidden;
  demoPanel.hidden = !willOpen;
  demoToggle.setAttribute('aria-expanded', String(willOpen));
});

demoPanel.querySelectorAll('[data-user]').forEach((button) => {
  button.addEventListener('click', () => {
    const account = button.dataset.user;
    username.value = account;
    password.value = 'demo123';
    demoPanel.hidden = true;
    demoToggle.setAttribute('aria-expanded', 'false');
    formError.textContent = '';
    showToast('已选择' + roles[account].label);
    username.focus();
  });
});

forgotPassword.addEventListener('click', () => showToast('演示环境暂不发送重置邮件'));

async function authenticate(account, secret) {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ username: account, password: secret })
  });
  const payload = await response.json().catch(() => null);
  const session = payload?.data || payload;
  if (!response.ok || !session?.accessToken) {
    const error = new Error(response.status === 401 ? '账号或密码不正确' : '登录服务暂时不可用');
    error.status = response.status;
    throw error;
  }
  localStorage.setItem('agriloop_token', session.accessToken);
  if (session.user) localStorage.setItem('agriloop_user', JSON.stringify(session.user));
  return session;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const account = username.value.trim();
  if (!account || !password.value) {
    formError.textContent = '请输入账号和密码';
    (!account ? username : password).focus();
    return;
  }

  formError.textContent = '';
  submitButton.disabled = true;
  submitButton.classList.add('is-loading');
  const selected = roles[account] || roles.admin;
  try {
    const session = await authenticate(account, password.value);
    const user = session.user || {
      username: account,
      role: selected.role,
      roleLabel: selected.label,
      avatar: ''
    };
    localStorage.setItem('agriloop_user', JSON.stringify(user));
    showToast('欢迎进入' + (user.roleLabel || selected.label) + '工作台');
    window.setTimeout(() => { window.location.href = 'index.html'; }, reducedMotion ? 100 : 500);
  } catch (error) {
    formError.textContent = error.message || '登录失败，请稍后重试';
    submitButton.disabled = false;
    submitButton.classList.remove('is-loading');
  }
});

let toastTimer;
function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2300);
}

initBackgroundMotion();
requestAnimationFrame(() => document.body.classList.add('is-mounted'));
