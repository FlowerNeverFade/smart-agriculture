const MAX_IMAGE_EDGE = 1280;
const MAX_ENCODED_BYTES = 1800 * 1024;
const QUALITY_SAMPLE_SIZE = 96;

function loadImage(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file, { imageOrientation: 'from-image' });
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败')); };
    image.src = url;
  });
}

function createScaledCanvas(image, sourceWidth, sourceHeight, maxEdge = MAX_IMAGE_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) throw new Error('浏览器不支持图片像素处理');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
  return canvas;
}

function inspectImageQuality(canvas) {
  const sample = document.createElement('canvas');
  sample.width = QUALITY_SAMPLE_SIZE;
  sample.height = QUALITY_SAMPLE_SIZE;
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (!context) return { quality: 'UNKNOWN', brightness: 0, contrast: 0, sharpness: 0 };
  context.drawImage(canvas, 0, 0, QUALITY_SAMPLE_SIZE, QUALITY_SAMPLE_SIZE);
  const pixels = context.getImageData(0, 0, QUALITY_SAMPLE_SIZE, QUALITY_SAMPLE_SIZE).data;
  const luminance = new Float32Array(QUALITY_SAMPLE_SIZE * QUALITY_SAMPLE_SIZE);
  let sum = 0;
  let sumSquares = 0;
  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * 4;
    const value = pixels[offset] * .2126 + pixels[offset + 1] * .7152 + pixels[offset + 2] * .0722;
    luminance[index] = value;
    sum += value;
    sumSquares += value * value;
  }
  const brightness = sum / luminance.length;
  const contrast = Math.sqrt(Math.max(0, sumSquares / luminance.length - brightness * brightness));
  let edgeTotal = 0;
  let edgeCount = 0;
  for (let y = 1; y < QUALITY_SAMPLE_SIZE; y += 1) {
    for (let x = 1; x < QUALITY_SAMPLE_SIZE; x += 1) {
      const index = y * QUALITY_SAMPLE_SIZE + x;
      edgeTotal += Math.abs(luminance[index] - luminance[index - 1]);
      edgeTotal += Math.abs(luminance[index] - luminance[index - QUALITY_SAMPLE_SIZE]);
      edgeCount += 2;
    }
  }
  const sharpness = edgeCount ? edgeTotal / edgeCount : 0;
  let quality = 'CLEAR';
  if (brightness < 28) quality = 'LOW_LIGHT';
  else if (brightness > 238) quality = 'OVEREXPOSED';
  else if (contrast < 8 && sharpness < 2.2) quality = 'BLURRY';
  return {
    quality,
    brightness: Math.round(brightness),
    contrast: Number(contrast.toFixed(1)),
    sharpness: Number(sharpness.toFixed(1))
  };
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片压缩失败')), 'image/jpeg', quality);
  });
}

function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片编码失败'));
    reader.readAsDataURL(blob);
  });
}

async function encodeCanvas(canvas) {
  let working = canvas;
  let quality = .9;
  let blob = await canvasBlob(working, quality);
  while (blob.size > MAX_ENCODED_BYTES && Math.max(working.width, working.height) > 640) {
    const smaller = document.createElement('canvas');
    smaller.width = Math.max(1, Math.round(working.width * .78));
    smaller.height = Math.max(1, Math.round(working.height * .78));
    const context = smaller.getContext('2d', { alpha: false });
    if (!context) throw new Error('浏览器不支持图片压缩');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, smaller.width, smaller.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(working, 0, 0, smaller.width, smaller.height);
    working = smaller;
    quality = Math.max(.72, quality - .05);
    blob = await canvasBlob(working, quality);
  }
  if (blob.size > MAX_ENCODED_BYTES) throw new Error('图片处理后仍然过大，请裁剪后重试');
  return { blob, canvas: working, dataUrl: await blobDataUrl(blob) };
}

export async function analyzeImageFile(file) {
  if (!(file instanceof Blob)) throw new Error('图片文件无效');
  const image = await loadImage(file);
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  if (!width || !height) throw new Error('无法读取图片尺寸');
  const canvas = createScaledCanvas(image, width, height);
  if (typeof image.close === 'function') image.close();
  const quality = inspectImageQuality(canvas);
  const encoded = await encodeCanvas(canvas);
  return {
    width,
    height,
    processedWidth: encoded.canvas.width,
    processedHeight: encoded.canvas.height,
    mimeType: encoded.blob.type || 'image/jpeg',
    byteSize: encoded.blob.size,
    dataUrl: encoded.dataUrl,
    model: 'Qwen3.8 native vision',
    ...quality
  };
}

export async function analyzeImageFiles(files = []) {
  const results = [];
  for (const file of Array.from(files)) results.push(await analyzeImageFile(file));
  return results;
}
