const MODEL_URL = new URL('../../assets/models/squeezenet1.1-7.onnx', import.meta.url).href;
const LABELS_URL = new URL('../../assets/models/imagenet-classes.txt', import.meta.url).href;
// Resolve from the served application base (including /farm-admin/), not from
// the hashed JS chunk. This keeps the runtime working behind a sub-path.
// Resolve from the served HTML base so the same bundle works at `/` and
// under the `/farm-admin/` sub-path.  The non-browser fallback is only used
// by unit tests/import tooling and deliberately stays a plain relative URL.
const WASM_BASE_URL = typeof document !== 'undefined'
  ? new URL('vendor/ort/', document.baseURI).href
  : 'vendor/ort/';

let runtimePromise = null;

function softmax(values) {
  const maximum = Math.max(...values);
  const exponentials = values.map(value => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0) || 1;
  return exponentials.map(value => value / total);
}

function loadImage(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败')); };
    image.src = url;
  });
}

async function prepareTensor(file, ort) {
  const image = await loadImage(file);
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  if (!width || !height) throw new Error('无法读取图片尺寸');
  const size = Math.min(width, height);
  const sourceX = Math.max(0, (width - size) / 2);
  const sourceY = Math.max(0, (height - size) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = 224;
  canvas.height = 224;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('浏览器不支持图片像素分析');
  context.drawImage(image, sourceX, sourceY, size, size, 0, 0, 224, 224);
  if (typeof image.close === 'function') image.close();
  const pixels = context.getImageData(0, 0, 224, 224).data;
  const data = new Float32Array(3 * 224 * 224);
  const mean = [0.485, 0.456, 0.406];
  const deviation = [0.229, 0.224, 0.225];
  const plane = 224 * 224;
  for (let pixel = 0; pixel < plane; pixel += 1) {
    const source = pixel * 4;
    data[pixel] = (pixels[source] / 255 - mean[0]) / deviation[0];
    data[plane + pixel] = (pixels[source + 1] / 255 - mean[1]) / deviation[1];
    data[plane * 2 + pixel] = (pixels[source + 2] / 255 - mean[2]) / deviation[2];
  }
  return { tensor: new ort.Tensor('float32', data, [1, 3, 224, 224]), width, height };
}

async function loadRuntime() {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    const ort = globalThis.ort;
    if (!ort?.InferenceSession || !ort?.Tensor) throw new Error('视觉运行时未加载');
    ort.env.wasm.wasmPaths = WASM_BASE_URL;
    ort.env.wasm.numThreads = 1;
    const [session, labelsResponse] = await Promise.all([
      ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] }),
      fetch(LABELS_URL, { cache: 'force-cache' })
    ]);
    if (!labelsResponse.ok) throw new Error('图像标签库加载失败');
    const labels = (await labelsResponse.text()).split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    return { ort, session, labels };
  })().catch(error => { runtimePromise = null; throw error; });
  return runtimePromise;
}

export async function analyzeImageFile(file) {
  if (!(file instanceof Blob)) throw new Error('图片文件无效');
  const { ort, session, labels } = await loadRuntime();
  const prepared = await prepareTensor(file, ort);
  const output = await session.run({ [session.inputNames[0]]: prepared.tensor });
  const values = Array.from(output[session.outputNames[0]]?.data || []);
  if (!values.length) throw new Error('视觉模型未返回识别结果');
  const probabilities = softmax(values);
  const predictions = probabilities
    .map((confidence, index) => ({ label: labels[index] || `class-${index}`, confidence }))
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5);
  return {
    width: prepared.width,
    height: prepared.height,
    predictions,
    model: 'SqueezeNet 1.1 / ImageNet',
    quality: predictions[0]?.confidence >= 0.18 ? 'CLEAR' : 'AMBIGUOUS'
  };
}

export async function analyzeImageFiles(files = []) {
  return Promise.all(Array.from(files).map(file => analyzeImageFile(file)));
}
