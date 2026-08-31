const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_ORIGINAL_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const QUALITY_SAMPLE_SIZE = 96;

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (error) {
      return createImageBitmap(file);
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败')); };
    image.src = url;
  });
}

function inspectImageQuality(image, sourceWidth, sourceHeight) {
  const sample = document.createElement('canvas');
  sample.width = QUALITY_SAMPLE_SIZE;
  sample.height = QUALITY_SAMPLE_SIZE;
  const context = sample.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return { quality: 'UNKNOWN', brightness: 0, contrast: 0, sharpness: 0 };
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, QUALITY_SAMPLE_SIZE, QUALITY_SAMPLE_SIZE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, sourceWidth, sourceHeight, 0, 0, QUALITY_SAMPLE_SIZE, QUALITY_SAMPLE_SIZE);
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

function originalDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

export async function analyzeImageFile(file) {
  if (!(file instanceof Blob)) throw new Error('图片文件无效');
  const mimeType = String(file.type || '').toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) throw new Error('仅支持 JPG、PNG 或 WebP 原图');
  if (!file.size || file.size > MAX_ORIGINAL_BYTES) throw new Error('单张原图不能超过 8MB');

  const image = await loadImage(file);
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  if (!width || !height) {
    if (typeof image.close === 'function') image.close();
    throw new Error('无法读取图片尺寸');
  }
  const quality = inspectImageQuality(image, width, height);
  if (typeof image.close === 'function') image.close();

  // The payload is the user's original byte stream. The small canvas above is
  // used only for a local exposure/clarity hint and is never sent to the model.
  const dataUrl = await originalDataUrl(file);
  if (!dataUrl.startsWith(`data:${mimeType};base64,`)) throw new Error('原图编码失败');
  return {
    width,
    height,
    processedWidth: width,
    processedHeight: height,
    mimeType,
    byteSize: file.size,
    dataUrl,
    model: 'Qwen3.8 native vision / original image',
    original: true,
    ...quality
  };
}

export async function analyzeImageFiles(files = []) {
  const selected = Array.from(files);
  if (selected.length > 4) throw new Error('单次最多分析 4 张原图');
  const totalBytes = selected.reduce((sum, file) => sum + Number(file?.size || 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error('单次原图总量不能超过 24MB');
  const results = [];
  for (const file of selected) results.push(await analyzeImageFile(file));
  return results;
}
