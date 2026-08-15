// Logo & brand-color control for the client form.
// Upload (or take) a photo of a client's logo; it's resized to a square tile,
// the theme color is auto-picked from the image, and you can fine-tune the
// tile background (White / Brand / Dark) or the hex before saving.
// Exposes two named inputs the form reads: logo_url (a data URL) + brand_color.
import { el, iconSvg } from './ui.js';

const TILE = 240, PAD = 26;

// Most-vibrant color in an image, as a hex string (or null if it's all grays).
export function deriveBrandColor(img) {
  const s = 64;
  const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, s, s);
  let data;
  try { data = ctx.getImageData(0, 0, s, s).data; } catch (e) { return null; }
  const buckets = {};
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 125) continue;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 238 && mn > 238) continue;   // near-white
    if (mx < 26) continue;                // near-black
    const sat = mx - mn;
    if (sat < 30) continue;               // gray
    const key = (r >> 5) + ',' + (g >> 5) + ',' + (b >> 5);
    const bk = buckets[key] || (buckets[key] = { r: 0, g: 0, b: 0, w: 0 });
    bk.r += r * sat; bk.g += g * sat; bk.b += b * sat; bk.w += sat;
  }
  let best = null;
  for (const k in buckets) if (!best || buckets[k].w > best.w) best = buckets[k];
  if (!best) return null;
  let r = Math.round(best.r / best.w), g = Math.round(best.g / best.w), b = Math.round(best.b / best.w);
  // Darken very light picks so they still read as an accent.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum > 0.72) { const f = 0.62 / lum; r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f); }
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

// Roughly transparent? (a logo cut out vs. a photo with its own background)
function isTransparent(img) {
  const s = 20, cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, s, s);
  let d; try { d = ctx.getImageData(0, 0, s, s).data; } catch (e) { return false; }
  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 200) clear++;
  return clear > (s * s) * 0.06;
}

// Draw the logo centered on a square tile of the given background.
export function composeTile(img, bg) {
  const cv = document.createElement('canvas'); cv.width = TILE; cv.height = TILE;
  const ctx = cv.getContext('2d');
  if (bg && bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, TILE, TILE); }
  const inner = TILE - 2 * PAD;
  const sc = Math.min(inner / img.width, inner / img.height);
  const w = img.width * sc, h = img.height * sc;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (TILE - w) / 2, (TILE - h) / 2, w, h);
  return cv.toDataURL('image/png');
}

function lumOf(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return 0.5;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function logoField(client = {}) {
  let srcImg = null;         // loaded Image, kept so we can re-compose on bg change
  let currentBg = 'white';

  const hidden = el('input', { type: 'hidden', name: 'logo_url', value: client.logo_url || '' });
  const colorInput = el('input.input', {
    name: 'brand_color', type: 'text', value: client.brand_color || '', placeholder: '#1E4C6A',
    oninput: () => { swatch.style.background = colorInput.value || '#fff'; if (currentBg === 'brand') recompose(); },
  });
  const swatch = el('span', { style: `flex:0 0 auto;width:22px;height:22px;border-radius:6px;border:1px solid var(--line);background:${client.brand_color || '#fff'}` });

  const previewImg = el('img');
  const preview = el('div.avatar', { style: 'width:64px;height:64px;border-radius:14px;flex:0 0 auto' });
  if (client.logo_url) { preview.classList.add('avatar-logo'); previewImg.src = client.logo_url; preview.append(previewImg); }
  else preview.textContent = '—';

  const file = el('input', {
    type: 'file', accept: 'image/*', style: 'display:none',
    onchange: (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      const im = new Image();
      im.onload = () => {
        srcImg = im;
        const c = deriveBrandColor(im);
        if (c) { colorInput.value = c; swatch.style.background = c; }
        currentBg = (!c || lumOf(c) > 0.7) && isTransparent(im) ? 'dark' : 'white';
        syncBgButtons(); recompose();
        URL.revokeObjectURL(url);
      };
      im.onerror = () => URL.revokeObjectURL(url);
      im.src = url;
    },
  });

  function recompose() {
    if (!srcImg) return;
    const bg = currentBg === 'white' ? '#ffffff' : currentBg === 'dark' ? '#0d1b30' : (colorInput.value || '#ffffff');
    const dataUrl = composeTile(srcImg, bg);
    hidden.value = dataUrl;
    if (!preview.contains(previewImg)) { preview.textContent = ''; preview.classList.add('avatar-logo'); preview.append(previewImg); }
    previewImg.src = dataUrl;
  }

  const bgKeys = ['white', 'brand', 'dark'];
  const bgLabels = { white: 'White', brand: 'Brand', dark: 'Dark' };
  const bgBtns = bgKeys.map((b) => el('button', { type: 'button', text: bgLabels[b], onclick: () => { currentBg = b; syncBgButtons(); recompose(); } }));
  function syncBgButtons() { bgBtns.forEach((btn, i) => { btn.className = 'btn btn-sm ' + (currentBg === bgKeys[i] ? 'btn-primary' : 'btn-ghost'); }); }
  syncBgButtons();

  return el('div', {}, [
    el('div.field-label', { text: 'Logo & brand color' }),
    el('div.field-row', { style: 'align-items:center;gap:12px;margin-top:6px' }, [
      preview,
      el('div', { style: 'flex:1;min-width:0' }, [
        el('div.pill-row', {}, [
          el('button.btn.btn-ghost.btn-sm', { type: 'button', html: iconSvg('camera', 15) + ' Upload / photo', onclick: () => file.click() }),
          el('button.btn.btn-ghost.btn-sm', { type: 'button', text: 'Remove', onclick: () => { hidden.value = ''; srcImg = null; preview.textContent = '—'; preview.classList.remove('avatar-logo'); } }),
        ]),
        el('div.pill-row.mt-8', {}, bgBtns),
      ]),
    ]),
    el('div.field-row.mt-8', { style: 'align-items:center;gap:8px' }, [swatch, colorInput]),
    el('div.field-hint.mt-8', { text: 'Upload a logo and the theme color is picked from it automatically. Tap White / Brand / Dark or edit the hex to fine-tune.' }),
    file, hidden,
  ]);
}
