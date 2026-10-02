// Porkchop plot: total Δv for direct transfers over launch date × flight time.

import { fmtDate, dateFromJd } from '../physics/constants.js';

const STOPS = [
  [0, [255, 238, 196]],
  [0.18, [242, 165, 65]],
  [0.42, [200, 86, 78]],
  [0.7, [92, 54, 112]],
  [1, [24, 30, 58]],
];
function ramp(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i];
      const f = (t - t0) / (t1 - t0);
      return c0.map((c, k) => Math.round(c + (c1[k] - c) * f));
    }
  }
  return STOPS.at(-1)[1];
}

const M = { l: 46, r: 10, t: 10, b: 52 };

export class Porkchop {
  constructor(canvas, tip, onPick) {
    this.canvas = canvas;
    this.tip = tip;
    this.onPick = onPick;
    canvas.addEventListener('mousemove', (e) => this._hover(e));
    canvas.addEventListener('mouseleave', () => { this.tip.hidden = true; });
    canvas.addEventListener('click', (e) => {
      const v = this._valueAt(e);
      if (v && isFinite(v.dv) && this.onPick) this.onPick(v.dep, v.tof);
    });
  }

  draw(pc, marker) {
    this.pc = pc;
    const css = getComputedStyle(document.documentElement);
    const fg = css.getPropertyValue('--muted').trim() || '#9a9ca3';
    const line = css.getPropertyValue('--border').trim() || '#33363d';
    const amber = css.getPropertyValue('--route').trim() || '#f2a541';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 352, H = 250;
    this.W = W; this.H = H;
    this.canvas.width = W * dpr;
    this.canvas.height = H * dpr;
    const g = this.canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    let vmin = Infinity;
    for (const v of pc.data) if (isFinite(v) && v < vmin) vmin = v;
    const vmax = vmin + Math.max(4, vmin * 0.8);
    this.vmin = vmin; this.vmax = vmax;

    // Heat map
    const img = g.createImageData(pc.nx, pc.ny);
    for (let j = 0; j < pc.ny; j++) {
      for (let i = 0; i < pc.nx; i++) {
        const v = pc.data[j * pc.nx + i];
        const o = ((pc.ny - 1 - j) * pc.nx + i) * 4;
        if (!isFinite(v)) { img.data[o + 3] = 0; continue; }
        const c = ramp((v - vmin) / (vmax - vmin));
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
      }
    }
    const off = document.createElement('canvas');
    off.width = pc.nx; off.height = pc.ny;
    off.getContext('2d').putImageData(img, 0, 0);
    const pw = W - M.l - M.r, ph = H - M.t - M.b;
    g.imageSmoothingEnabled = true;
    g.drawImage(off, M.l, M.t, pw, ph);

    // Axes
    g.strokeStyle = line;
    g.strokeRect(M.l + 0.5, M.t + 0.5, pw, ph);
    g.fillStyle = fg;
    g.font = '11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    // x ticks: start of months/quarters/years depending on span
    const span = pc.dep1 - pc.dep0;
    const maxLabels = Math.max(2, Math.floor(pw / 52));
    const stepMonths = [1, 2, 3, 4, 6, 12, 24, 36, 60, 120].find((s) => span / 30.44 / s <= maxLabels) || 120;
    const d0 = dateFromJd(pc.dep0);
    let y = d0.getUTCFullYear(), m = d0.getUTCMonth() + 1;
    m = Math.ceil(m / stepMonths) * stepMonths;
    for (let k = 0; k < 40; k++) {
      const yy = y + Math.floor(m / 12), mm = m % 12;
      const jd = Date.UTC(yy, mm, 1) / 86400000 + 2440587.5;
      if (jd > pc.dep1) break;
      if (jd >= pc.dep0) {
        const x = M.l + ((jd - pc.dep0) / span) * pw;
        g.fillRect(x, M.t + ph, 1, 4);
        const lab = stepMonths >= 12 ? `${yy}` : `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mm]} ${String(yy).slice(2)}`;
        g.fillText(lab, x, M.t + ph + 6);
      }
      m += stepMonths;
    }
    g.fillText('Launch date', M.l + pw / 2, M.t + ph + 19);
    // y ticks
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    const tspan = pc.tof1 - pc.tof0;
    const ystep = [10, 20, 50, 100, 200, 500, 1000, 2000].find((s) => tspan / s <= 6) || 5000;
    for (let v = Math.ceil(pc.tof0 / ystep) * ystep; v <= pc.tof1; v += ystep) {
      const yy = M.t + ph - ((v - pc.tof0) / tspan) * ph;
      g.fillRect(M.l - 4, yy, 4, 1);
      g.fillText(`${v}`, M.l - 6, yy);
    }
    g.save();
    g.translate(11, M.t + ph / 2);
    g.rotate(-Math.PI / 2);
    g.textAlign = 'center';
    g.fillText('Flight time (days)', 0, 0);
    g.restore();

    // Legend
    const ly = H - 14, lx = M.l, lw = 150;
    for (let i = 0; i < lw; i++) {
      const c = ramp(i / lw);
      g.fillStyle = `rgb(${c})`;
      g.fillRect(lx + i, ly, 1, 7);
    }
    g.fillStyle = fg;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(`${vmin.toFixed(1)}`, lx + lw + 6, ly + 4);
    g.fillText(`≥${vmax.toFixed(1)} km/s total Δv`, lx + lw + 34, ly + 4);

    // Window limit
    if (pc.windowEnd && pc.windowEnd < pc.dep1) {
      const x = M.l + ((pc.windowEnd - pc.dep0) / span) * pw;
      g.setLineDash([3, 3]);
      g.strokeStyle = fg;
      g.beginPath(); g.moveTo(x, M.t); g.lineTo(x, M.t + ph); g.stroke();
      g.setLineDash([]);
    }
    // Best direct
    const P = (dep, tof) => [M.l + ((dep - pc.dep0) / span) * pw, M.t + ph - ((tof - pc.tof0) / tspan) * ph];
    if (isFinite(pc.best.cost)) {
      const [x, yy] = P(pc.best.dep, pc.best.tof);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, yy, 5, 0, Math.PI * 2); g.stroke();
    }
    if (marker) {
      const [x, yy] = P(marker.dep, marker.tof);
      g.strokeStyle = amber;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x - 7, yy); g.lineTo(x + 7, yy); g.moveTo(x, yy - 7); g.lineTo(x, yy + 7);
      g.stroke();
    }
  }

  _valueAt(e) {
    if (!this.pc) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.W;
    const y = ((e.clientY - rect.top) / rect.height) * this.H;
    const pw = this.W - M.l - M.r, ph = this.H - M.t - M.b;
    const fx = (x - M.l) / pw, fy = 1 - (y - M.t) / ph;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
    const pc = this.pc;
    const i = Math.round(fx * (pc.nx - 1)), j = Math.round(fy * (pc.ny - 1));
    return {
      dep: pc.dep0 + fx * (pc.dep1 - pc.dep0),
      tof: pc.tof0 + fy * (pc.tof1 - pc.tof0),
      dv: pc.data[j * pc.nx + i],
      px: (x / this.W) * rect.width, py: (y / this.H) * rect.height,
    };
  }

  _hover(e) {
    const v = this._valueAt(e);
    if (!v) { this.tip.hidden = true; return; }
    this.tip.hidden = false;
    this.tip.textContent = `${fmtDate(v.dep)} · ${Math.round(v.tof)} d · ${isFinite(v.dv) ? v.dv.toFixed(2) + ' km/s' : 'no solution'}`;
    const left = Math.min(v.px + 12, this.canvas.clientWidth - 190);
    this.tip.style.left = `${Math.max(0, left)}px`;
    this.tip.style.top = `${v.py - 28}px`;
  }
}
