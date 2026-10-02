// Numerical integration of gravitational motion.
//  - Dormand–Prince 5(4) adaptive integrator for spacecraft trajectories
//  - Fixed-step RK4 N-body integrator for the planets themselves
// Frame: heliocentric J2000 ecliptic. Units: AU, days.

import { GM_SUN } from './constants.js';
import { PLANETS, planetState } from './ephemeris.js';

// ---------- Acceleration models ----------

/** Sun-only (two-body) acceleration. */
export function sunAccel(t, r, out) {
  const d2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
  const k = -GM_SUN / (d2 * Math.sqrt(d2));
  out[0] = k * r[0];
  out[1] = k * r[1];
  out[2] = k * r[2];
}

/**
 * Sun + all planets (planets follow the ephemeris). Heliocentric frame, so the
 * indirect term (the Sun being pulled by each planet) is included.
 * A small position cache avoids re-solving Kepler's equation within a step.
 */
export function makeNBodyAccel(bodies = PLANETS) {
  let cacheT = NaN;
  const pos = bodies.map(() => [0, 0, 0]);
  return function accel(t, r, out) {
    if (t !== cacheT) {
      for (let i = 0; i < bodies.length; i++) pos[i] = planetState(bodies[i], t).r;
      cacheT = t;
    }
    sunAccel(t, r, out);
    for (let i = 0; i < bodies.length; i++) {
      const p = pos[i];
      const gm = bodies[i].gm;
      const dx = p[0] - r[0], dy = p[1] - r[1], dz = p[2] - r[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      const d3 = d2 * Math.sqrt(d2);
      const p2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
      const p3 = p2 * Math.sqrt(p2);
      out[0] += gm * (dx / d3 - p[0] / p3);
      out[1] += gm * (dy / d3 - p[1] / p3);
      out[2] += gm * (dz / d3 - p[2] / p3);
    }
  };
}

// ---------- Dormand–Prince 5(4) ----------

const C2 = 1 / 5, C3 = 3 / 10, C4 = 4 / 5, C5 = 8 / 9;
const A21 = 1 / 5;
const A31 = 3 / 40, A32 = 9 / 40;
const A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9;
const A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729;
const A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656;
const B1 = 35 / 384, B3 = 500 / 1113, B4 = 125 / 192, B5 = -2187 / 6784, B6 = 11 / 84;
const E1 = 71 / 57600, E3 = -71 / 16695, E4 = 71 / 1920, E5 = -17253 / 339200, E6 = 22 / 525, E7 = -1 / 40;

function deriv(accel, t, y, dy, tmpA) {
  dy[0] = y[3]; dy[1] = y[4]; dy[2] = y[5];
  accel(t, y, tmpA);
  dy[3] = tmpA[0]; dy[4] = tmpA[1]; dy[5] = tmpA[2];
}

/**
 * Integrate a state y0 = [x,y,z,vx,vy,vz] from t0 to t1 (t1 > t0).
 * opts.onSample(t, y) is called at the start and after every accepted step.
 * Returns final state and step stats.
 */
export function integrate(accel, t0, y0, t1, opts = {}) {
  const rtol = opts.rtol ?? 1e-10;
  const atol = opts.atol ?? 1e-13;
  const hmax = opts.hmax ?? 20;
  const hmin = opts.hmin ?? 1e-6;
  const maxSteps = opts.maxSteps ?? 200000;
  const onSample = opts.onSample;
  const stop = opts.stop; // optional (t, y) => boolean early termination

  let t = t0;
  let y = Float64Array.from(y0);
  const k1 = new Float64Array(6), k2 = new Float64Array(6), k3 = new Float64Array(6);
  const k4 = new Float64Array(6), k5 = new Float64Array(6), k6 = new Float64Array(6), k7 = new Float64Array(6);
  const yt = new Float64Array(6), yn = new Float64Array(6), tmpA = [0, 0, 0];
  let h = opts.h0 ?? Math.min(hmax, Math.max(hmin, (t1 - t0) / 200));
  let steps = 0, rejected = 0;

  deriv(accel, t, y, k1, tmpA);
  if (onSample) onSample(t, y);

  while (t < t1 && steps < maxSteps) {
    if (t + h > t1) h = t1 - t;
    for (let i = 0; i < 6; i++) yt[i] = y[i] + h * A21 * k1[i];
    deriv(accel, t + C2 * h, yt, k2, tmpA);
    for (let i = 0; i < 6; i++) yt[i] = y[i] + h * (A31 * k1[i] + A32 * k2[i]);
    deriv(accel, t + C3 * h, yt, k3, tmpA);
    for (let i = 0; i < 6; i++) yt[i] = y[i] + h * (A41 * k1[i] + A42 * k2[i] + A43 * k3[i]);
    deriv(accel, t + C4 * h, yt, k4, tmpA);
    for (let i = 0; i < 6; i++) yt[i] = y[i] + h * (A51 * k1[i] + A52 * k2[i] + A53 * k3[i] + A54 * k4[i]);
    deriv(accel, t + C5 * h, yt, k5, tmpA);
    for (let i = 0; i < 6; i++)
      yt[i] = y[i] + h * (A61 * k1[i] + A62 * k2[i] + A63 * k3[i] + A64 * k4[i] + A65 * k5[i]);
    deriv(accel, t + h, yt, k6, tmpA);
    for (let i = 0; i < 6; i++)
      yn[i] = y[i] + h * (B1 * k1[i] + B3 * k3[i] + B4 * k4[i] + B5 * k5[i] + B6 * k6[i]);
    deriv(accel, t + h, yn, k7, tmpA);

    let err = 0;
    for (let i = 0; i < 6; i++) {
      const ei = h * (E1 * k1[i] + E3 * k3[i] + E4 * k4[i] + E5 * k5[i] + E6 * k6[i] + E7 * k7[i]);
      const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yn[i]));
      err = Math.max(err, Math.abs(ei) / sc);
    }

    if (err <= 1 || h <= hmin) {
      t += h;
      y.set(yn);
      k1.set(k7); // FSAL
      steps++;
      if (onSample) onSample(t, y);
      if (stop && stop(t, y)) break;
    } else {
      rejected++;
    }
    const fac = err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * Math.pow(err, -0.2)));
    h = Math.min(hmax, Math.max(hmin, h * fac));
  }
  return { t, y: Array.from(y), steps, rejected };
}

// ---------- Planetary N-body (RK4) ----------

/**
 * Integrates the 8 planets under mutual gravity + the Sun (heliocentric with
 * indirect terms). Initialised from the ephemeris; advanced with fixed RK4 steps.
 */
export class PlanetNBody {
  constructor(jd) {
    this.reset(jd);
  }
  reset(jd) {
    this.t = jd;
    const n = PLANETS.length;
    this.y = new Float64Array(n * 6);
    PLANETS.forEach((p, i) => {
      const s = planetState(p, jd);
      this.y.set([...s.r, ...s.v], i * 6);
    });
  }
  _deriv(y, out) {
    const n = PLANETS.length;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      const x = y[o], yy = y[o + 1], z = y[o + 2];
      out[o] = y[o + 3]; out[o + 1] = y[o + 4]; out[o + 2] = y[o + 5];
      const r2 = x * x + yy * yy + z * z;
      const r3 = r2 * Math.sqrt(r2);
      const mu = GM_SUN + PLANETS[i].gm;
      let ax = (-mu * x) / r3, ay = (-mu * yy) / r3, az = (-mu * z) / r3;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const q = j * 6;
        const xj = y[q], yj = y[q + 1], zj = y[q + 2];
        const dx = xj - x, dy = yj - yy, dz = zj - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const d3 = d2 * Math.sqrt(d2);
        const rj2 = xj * xj + yj * yj + zj * zj;
        const rj3 = rj2 * Math.sqrt(rj2);
        const gm = PLANETS[j].gm;
        ax += gm * (dx / d3 - xj / rj3);
        ay += gm * (dy / d3 - yj / rj3);
        az += gm * (dz / d3 - zj / rj3);
      }
      out[o + 3] = ax; out[o + 4] = ay; out[o + 5] = az;
    }
  }
  /** Advance by dt days (may be negative), using steps no larger than maxStep. */
  step(dt, maxStep = 0.25) {
    if (dt === 0) return;
    const nSteps = Math.max(1, Math.ceil(Math.abs(dt) / maxStep));
    const h = dt / nSteps;
    const N = this.y.length;
    const k1 = new Float64Array(N), k2 = new Float64Array(N), k3 = new Float64Array(N), k4 = new Float64Array(N);
    const tmp = new Float64Array(N);
    for (let s = 0; s < nSteps; s++) {
      const y = this.y;
      this._deriv(y, k1);
      for (let i = 0; i < N; i++) tmp[i] = y[i] + 0.5 * h * k1[i];
      this._deriv(tmp, k2);
      for (let i = 0; i < N; i++) tmp[i] = y[i] + 0.5 * h * k2[i];
      this._deriv(tmp, k3);
      for (let i = 0; i < N; i++) tmp[i] = y[i] + h * k3[i];
      this._deriv(tmp, k4);
      for (let i = 0; i < N; i++) y[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    this.t += dt;
  }
  position(i) {
    const o = i * 6;
    return [this.y[o], this.y[o + 1], this.y[o + 2]];
  }
}
