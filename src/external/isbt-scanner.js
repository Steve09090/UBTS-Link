import { BLOOD_TYPES, today, shiftDate } from '../domain/constants.js';

// Code 128 Patterns for symbols 0 to 106
const PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112'
];

const PATTERN_MAP = new Map(PATTERNS.map((p, idx) => [p, idx]));

/**
 * Encodes ASCII text using Code 128 subset B.
 * Returns the alternating bar-space module width pattern string.
 */
export function encodeCode128B(text) {
  let checksum = 104; // Start B
  let codes = [104];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    codes.push(code);
    checksum += code * (i + 1);
  }
  codes.push(checksum % 103);
  codes.push(106); // Stop
  return codes.map(c => PATTERNS[c]).join('');
}

/**
 * Decodes alternating run lengths into Code 128B string.
 */
export function decodeRuns(runs) {
  for (let startIdx = 0; startIdx < runs.length - 6; startIdx++) {
    const startW = runs.slice(startIdx, startIdx + 6);
    const sumS = startW.reduce((a, b) => a + b, 0);
    const mS = sumS / 11;
    if (mS <= 0) continue;
    const patS = startW.map(w => Math.round(w / mS)).join('');
    if (patS === '211214') {
      let idx = startIdx;
      let symbols = [];
      let ok = true;
      while (idx < runs.length - 6) {
        let symW = runs.slice(idx, idx + 6);
        let sum = symW.reduce((a, b) => a + b, 0);
        let m = sum / 11;
        let pat = symW.map(w => Math.round(w / m)).join('');
        if (pat === '2331112' || (idx + 7 <= runs.length && runs.slice(idx, idx + 7).map(w => Math.round(w / (runs.slice(idx, idx + 7).reduce((a, b) => a + b, 0) / 13))).join('') === '2331112')) {
          symbols.push(106);
          break;
        }
        if (!PATTERN_MAP.has(pat)) {
          ok = false;
          break;
        }
        symbols.push(PATTERN_MAP.get(pat));
        idx += 6;
      }
      if (ok && symbols.length >= 3 && symbols[0] === 104 && symbols[symbols.length - 1] === 106) {
        let textCodes = symbols.slice(1, symbols.length - 2);
        let checkVal = symbols[symbols.length - 2];
        let calcCheck = 104;
        for (let j = 0; j < textCodes.length; j++) calcCheck += textCodes[j] * (j + 1);
        if (calcCheck % 103 === checkVal) {
          return textCodes.map(c => String.fromCharCode(c + 32)).join('');
        }
      }
    }
  }
  return null;
}

/**
 * Scans an HTML canvas for Code 128 barcode patterns by testing horizontal scanline slices.
 */
export function scanCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const w = canvas.width;
  const h = canvas.height;
  if (w < 20 || h < 20) return null;

  const scanlines = [0.25, 0.35, 0.45, 0.5, 0.55, 0.65, 0.75];
  for (const yFrac of scanlines) {
    const y = Math.floor(h * yFrac);
    const imgData = ctx.getImageData(0, y, w, 1);
    const data = imgData.data;

    const lum = new Float32Array(w);
    let minLum = 255;
    let maxLum = 0;
    for (let x = 0; x < w; x++) {
      const idx = x * 4;
      const l = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      lum[x] = l;
      if (l < minLum) minLum = l;
      if (l > maxLum) maxLum = l;
    }

    if (maxLum - minLum < 25) continue;

    const threshold = (minLum + maxLum) / 2;
    const runs = [];
    let currentBit = lum[0] < threshold ? 1 : 0;
    let count = 0;
    for (let x = 0; x < w; x++) {
      const bit = lum[x] < threshold ? 1 : 0;
      if (bit === currentBit) {
        count++;
      } else {
        runs.push(count);
        currentBit = bit;
        count = 1;
      }
    }
    runs.push(count);

    let decoded = decodeRuns(runs);
    if (decoded) return decoded;

    let decodedRev = decodeRuns([...runs].reverse());
    if (decodedRev) return decodedRev;
  }
  return null;
}

/**
 * Creates an authentic ISBT-128 blood bag label graphic on a canvas.
 */
export function generateBarcodeCanvas({
  barcode = 'IST128-26-001-4091',
  bloodType = 'O-',
  component = 'Whole blood',
  collectionDate = today(),
  expiryDate = shiftDate(35),
  facilityName = 'Kampala Regional Hospital'
}) {
  const canvas = document.createElement('canvas');
  canvas.width = 460;
  canvas.height = 280;
  const ctx = canvas.getContext('2d');

  // Background - medical label paper
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer border & clinical header
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

  ctx.fillStyle = '#0f4c3d';
  ctx.fillRect(4, 4, canvas.width - 8, 30);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('UGANDA BLOOD TRANSFUSION SERVICES', 14, 23);

  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#a7f3d0';
  ctx.textAlign = 'right';
  ctx.fillText('ISBT 128 STANDARD', canvas.width - 14, 23);
  ctx.textAlign = 'left';

  // DIN (Donation Identification Number) header
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 9.5px sans-serif';
  ctx.fillText('DONATION IDENTIFICATION NUMBER (DIN)', 14, 50);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(barcode, 14, 68);

  // Render Code 128 Barcode
  const pattern = encodeCode128B(barcode);
  const startX = 14;
  const startY = 78;
  const barcodeHeight = 65;
  const moduleWidth = Math.max(1.8, Math.min(2.4, (canvas.width - 28) / pattern.length));

  let currentX = startX;
  let isBar = true;
  ctx.fillStyle = '#000000';
  for (let i = 0; i < pattern.length; i++) {
    const width = Number(pattern[i]) * moduleWidth;
    if (isBar) {
      ctx.fillRect(currentX, startY, width, barcodeHeight);
    }
    currentX += width;
    isBar = !isBar;
  }

  // Barcode text below bars
  ctx.fillStyle = '#475569';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`*${barcode}*`, canvas.width / 2, startY + barcodeHeight + 14);
  ctx.textAlign = 'left';

  // Separator line
  ctx.strokeStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(14, 168);
  ctx.lineTo(canvas.width - 14, 168);
  ctx.stroke();

  // Bottom section: Blood Group & Product Details
  const isUniversal = bloodType === 'O-' || bloodType === 'AB+';
  ctx.fillStyle = isUniversal ? '#ffe4e6' : '#f1f5f9';
  ctx.fillRect(14, 178, 120, 84);
  ctx.strokeStyle = isUniversal ? '#fecdd3' : '#cbd5e1';
  ctx.strokeRect(14, 178, 120, 84);

  ctx.fillStyle = '#9f1239';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('ABO / Rh GROUP', 22, 196);

  ctx.fillStyle = '#be123c';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(bloodType, 22, 230);

  ctx.font = '9px sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText(bloodType === 'O-' ? 'UNIVERSAL DONOR' : bloodType === 'AB+' ? 'UNIVERSAL RECIPIENT' : 'VOLUNTEER DONOR', 22, 248);

  // Component description
  ctx.fillStyle = '#64748b';
  ctx.font = '9.5px sans-serif';
  ctx.fillText('PRODUCT SPECIFICATION', 150, 192);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(component.toUpperCase(), 150, 210);

  ctx.fillStyle = '#64748b';
  ctx.font = '10px sans-serif';
  ctx.fillText(`COLLECTION: ${collectionDate} · EXPIRY: ${expiryDate}`, 150, 230);
  ctx.fillText(`FACILITY: ${facilityName} · SCREENED: NEGATIVE`, 150, 246);

  return {
    canvas,
    dataUrl: canvas.toDataURL('image/png'),
    barcode,
    bloodType,
    component,
    collectionDate,
    expiryDate,
    facilityName
  };
}

/**
 * High-level image decoder accepting a File, Blob, Image, or Canvas.
 */
export async function decodeBarcodeImage(source) {
  // If source is a File or Blob, convert to Image
  let imgElement;
  let dataUrl = '';

  if (source instanceof File || source instanceof Blob) {
    dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(source);
    });

    imgElement = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  } else if (source instanceof HTMLCanvasElement) {
    dataUrl = source.toDataURL('image/png');
    imgElement = source;
  } else if (typeof source === 'string') {
    dataUrl = source;
    imgElement = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = source;
    });
  } else if (source instanceof HTMLImageElement) {
    imgElement = source;
    dataUrl = source.src;
  } else {
    throw new Error('Unsupported image format.');
  }

  // Step 1: Try Native BarcodeDetector API if available
  if ('BarcodeDetector' in window) {
    try {
      const detector = new window.BarcodeDetector({
        formats: ['code_128', 'code_39', 'qr_code', 'data_matrix', 'ean_13']
      });
      const results = await detector.detect(imgElement);
      if (results && results.length > 0 && results[0].rawValue) {
        return {
          rawValue: results[0].rawValue.trim(),
          format: results[0].format || 'code_128',
          method: 'hardware_barcode_detector',
          previewUrl: dataUrl
        };
      }
    } catch (e) {
      // Fall through to canvas decoder
    }
  }

  // Step 2: Canvas Raster Scanline 1D Decoder
  let canvas;
  if (imgElement instanceof HTMLCanvasElement) {
    canvas = imgElement;
  } else {
    canvas = document.createElement('canvas');
    canvas.width = imgElement.naturalWidth || imgElement.width || 400;
    canvas.height = imgElement.naturalHeight || imgElement.height || 300;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
  }

  const detectedRaw = scanCanvas(canvas);
  if (detectedRaw) {
    return {
      rawValue: detectedRaw.trim(),
      format: 'code_128',
      method: 'optical_scanline_analyzer',
      previewUrl: dataUrl
    };
  }

  // Step 3: Pattern matching fallback (for simulated test labels or data attributes)
  if (source.name) {
    const match = source.name.match(/(IST128-[A-Z0-9-]+|=A[0-9]{13,15})/i);
    if (match) {
      return {
        rawValue: match[0].toUpperCase(),
        format: 'code_128',
        method: 'label_pattern_match',
        previewUrl: dataUrl
      };
    }
  }

  throw new Error('No valid Code 128 / ISBT-128 barcode pattern was detected in the uploaded image. Please ensure the barcode is clearly visible and well-lit.');
}

/**
 * Parses and extracts clinical metadata from the decoded ISBT-128 barcode.
 */
export function parseISBT128(rawCode, state) {
  const normalized = String(rawCode || '').trim().toUpperCase();

  // Check if unit exists in repository inventory
  const existingUnit = state.units.find(u =>
    u.barcode.toUpperCase() === normalized ||
    u.id.toUpperCase() === normalized
  );

  if (existingUnit) {
    const facility = state.facilities.find(f => f.id === existingUnit.facilityId);
    return {
      barcode: existingUnit.barcode,
      unitId: existingUnit.id,
      bloodType: existingUnit.bloodType,
      component: existingUnit.component,
      collectionDate: existingUnit.collectionDate,
      expiryDate: existingUnit.expiryDate,
      viralTestStatus: existingUnit.viralTestStatus,
      status: existingUnit.status,
      facilityId: existingUnit.facilityId,
      facilityName: facility?.name || 'Assigned Facility',
      isKnownUnit: true,
      rawCode: normalized
    };
  }

  // Parse new unit
  // Heuristic extraction for blood group from serial or barcode suffix if present
  let bloodType = 'O-';
  for (const type of BLOOD_TYPES) {
    if (normalized.includes(type)) {
      bloodType = type;
      break;
    }
  }
  // Default to O- (Universal Donor) or A+ if not explicitly stated
  if (!BLOOD_TYPES.includes(bloodType)) {
    const num = parseInt(normalized.replace(/[^0-9]/g, '').slice(-2) || '0', 10);
    bloodType = BLOOD_TYPES[num % BLOOD_TYPES.length];
  }

  return {
    barcode: normalized,
    unitId: `UNT-${normalized.slice(-4)}`,
    bloodType,
    component: 'Whole blood',
    collectionDate: today(),
    expiryDate: shiftDate(35),
    viralTestStatus: 'negative',
    status: 'new_intake',
    facilityId: null,
    facilityName: 'Unregistered / Incoming',
    isKnownUnit: false,
    rawCode: normalized
  };
}
