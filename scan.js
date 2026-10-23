// Packaged food: read a barcode or a Nutrition Facts label from a photo, on the phone.
// Both libraries load from the CDN the first time they're needed, then the browser caches them.
const ZXING_SRC = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
const TESSERACT_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";

const scriptLoads = {};

function loadScript(src) {
  if (!scriptLoads[src]) {
    scriptLoads[src] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => {
        delete scriptLoads[src];
        reject(new Error("Couldn’t load the reader. Check your connection and try again."));
      };
      document.head.appendChild(s);
    });
  }
  return scriptLoads[src];
}

async function fileToImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error("Couldn’t open that photo.");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

function drawScaled(img, longSide, { gray = false, maxUpscale = 1 } = {}) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const scale = Math.min(maxUpscale, longSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: gray });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (gray) {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      px[i] = px[i + 1] = px[i + 2] = y;
    }
    ctx.putImageData(data, 0, 0);
  }
  return canvas;
}

async function decodeBarcode(file) {
  const img = await fileToImage(file);
  if ("BarcodeDetector" in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
      const found = await detector.detect(img);
      if (found[0]?.rawValue) return found[0].rawValue;
    } catch {
      /* fall back to ZXing */
    }
  }
  await loadScript(ZXING_SRC);
  const Z = window.ZXing;
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  for (const size of [1400, 900, 2200]) {
    try {
      const source = new Z.HTMLCanvasElementLuminanceSource(drawScaled(img, size));
      return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(source)), hints).getText();
    } catch {
      /* try the next size */
    }
  }
  return null;
}

// OCR tends to read 0 as O and 1 as l or I next to "g".
function labelNumber(s) {
  return Number(String(s).replace(/[Oo]/g, "0").replace(/[lI|]/g, "1").replace(",", "."));
}

const N = "([0-9OolI|]+(?:[.,][0-9]+)?)";

function grab(text, re) {
  const m = text.match(re);
  if (!m) return null;
  const n = labelNumber(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseLabel(text) {
  const t = String(text || "").replace(/\r/g, "");
  const serving = t.match(/serving\s*size([\s\S]{0,80}?)(\d+(?:\.\d+)?)\s*(g|ml)\b/i);
  return {
    servingG: serving ? Number(serving[2]) : null,
    servingUnit: serving ? serving[3].toLowerCase() : "g",
    calories: grab(t, /calories[^0-9\n]{0,25}(\d{1,4})/i),
    fat: grab(t, new RegExp(`total\\s*fat[^0-9\\n]{0,30}${N}\\s*g`, "i")),
    carbs: grab(t, new RegExp(`total\\s*carb[a-z]*[^0-9\\n]{0,40}${N}\\s*g`, "i")),
    protein: grab(t, new RegExp(`protein[a-z]*[^0-9\\n]{0,25}${N}`, "i")),
  };
}

async function readLabel(file, onProgress) {
  await loadScript(TESSERACT_SRC);
  const img = await fileToImage(file);
  const canvas = drawScaled(img, 1800, { gray: true, maxUpscale: 3 });
  const worker = await window.Tesseract.createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") onProgress?.(`Reading… ${Math.round(m.progress * 100)}%`);
      else if (m.status) onProgress?.("Getting the label reader ready…");
    },
  });
  try {
    const { data } = await worker.recognize(canvas);
    return { text: data.text, ...parseLabel(data.text) };
  } finally {
    await worker.terminate();
  }
}

window.DietScan = { decodeBarcode, readLabel, parseLabel };
