// Interplanetary route planner.
//
// For each candidate planet sequence (direct, or via gravity assists) the planner
// searches launch date + leg flight times with Differential Evolution followed by a
// Nelder–Mead polish. Each leg is a Lambert arc between the planets' ephemeris
// positions; flybys are modelled as powered patched-conic gravity assists.

import { GM_SUN, AUD_TO_KMS } from '../physics/constants.js';
import { PLANET_BY_ID, planetState } from '../physics/ephemeris.js';
import { lambert } from '../physics/lambert.js';
import { sub, scale } from '../physics/vec.js';
import { arrivalDv, departureDv, poweredFlyby } from './flyby.js';

// Candidate flyby sequences per destination (always start at Earth).
export const ROUTE_LIBRARY = {
  mercury: [['earth', 'mercury'], ['earth', 'venus', 'mercury'], ['earth', 'venus', 'venus', 'mercury']],
  venus: [['earth', 'venus']],
  earth: [],
  mars: [['earth', 'mars'], ['earth', 'venus', 'mars']],
  jupiter: [['earth', 'jupiter'], ['earth', 'mars', 'jupiter'], ['earth', 'venus', 'earth', 'jupiter']],
  saturn: [
    ['earth', 'saturn'], ['earth', 'jupiter', 'saturn'],
    ['earth', 'venus', 'earth', 'saturn'], ['earth', 'venus', 'earth', 'jupiter', 'saturn'],
  ],
  uranus: [
    ['earth', 'uranus'], ['earth', 'jupiter', 'uranus'], ['earth', 'saturn', 'uranus'],
    ['earth', 'venus', 'earth', 'jupiter', 'uranus'],
  ],
  neptune: [
    ['earth', 'neptune'], ['earth', 'jupiter', 'neptune'], ['earth', 'saturn', 'neptune'],
    ['earth', 'venus', 'earth', 'jupiter', 'neptune'],
  ],
};

export const DEFAULTS = {
  mercury: { windowYears: 2, maxYears: 4, arrival: 'circular' },
  venus: { windowYears: 2, maxYears: 1.5, arrival: 'circular' },
  mars: { windowYears: 3, maxYears: 1.5, arrival: 'circular' },
  jupiter: { windowYears: 6, maxYears: 7, arrival: 'capture' },
  saturn: { windowYears: 12, maxYears: 10, arrival: 'capture' },
  uranus: { windowYears: 12, maxYears: 15, arrival: 'capture' },
  neptune: { windowYears: 15, maxYears: 20, arrival: 'capture' },
};

export function routeName(seq) {
  const mids = seq.slice(1, -1).map((id) => PLANET_BY_ID[id].name);
  if (mids.length === 0) return 'Direct transfer';
  const uniq = [...new Set(mids)];
  if (uniq.length === 1 && mids.length > 1) return `${uniq[0]}–${uniq[0]} gravity assists`;
  return `${mids.join('–')} gravity assist${mids.length > 1 ? 's' : ''}`;
}
export function routeCode(seq) {
  return seq.map((id) => PLANET_BY_ID[id].short).join('→');
}

/** Hohmann transfer time between two planets' semi-major axes (days). */
function hohmannTime(a1, a2) {
  const a = (a1 + a2) / 2;
  return Math.PI * Math.sqrt((a * a * a) / GM_SUN);
}

export function legBounds(seq, maxDurDays) {
  const b = [];
  for (let i = 0; i < seq.length - 1; i++) {
    const th = hohmannTime(PLANET_BY_ID[seq[i]].el[0], PLANET_BY_ID[seq[i + 1]].el[0]);
    b.push([Math.max(15, 0.2 * th), Math.max(30, Math.min(2.5 * th, maxDurDays))]);
  }
  return b;
}

/**
 * Evaluate a decision vector x = [launchJD, tof1, tof2, ...] for a sequence.
 * Returns {cost} or, if detailed, the full breakdown.
 */
export function evaluate(seq, x, ctx, detailed = false) {
  const n = seq.length;
  const times = [x[0]];
  for (let i = 1; i < n; i++) times.push(times[i - 1] + x[i]);
  const states = seq.map((id, i) => planetState(PLANET_BY_ID[id], times[i]));

  const legs = [];
  const vinfOut = [], vinfIn = [];
  for (let i = 0; i < n - 1; i++) {
    const sol = lambert(states[i].r, states[i + 1].r, x[i + 1], GM_SUN);
    if (!sol) return { cost: 1e6, valid: false };
    legs.push({ from: seq[i], to: seq[i + 1], t0: times[i], t1: times[i + 1], r1: states[i].r, r2: states[i + 1].r, v1: sol.v1, v2: sol.v2 });
    vinfOut[i] = scale(sub(sol.v1, states[i].v), AUD_TO_KMS);
    vinfIn[i + 1] = scale(sub(sol.v2, states[i + 1].v), AUD_TO_KMS);
  }

  const earth = PLANET_BY_ID.earth;
  const vDep = Math.hypot(...vinfOut[0]);
  const dvDep = departureDv(vDep, earth.gmKm, earth.radiusKm + ctx.parkAltKm);

  let dvFb = 0, penalty = 0;
  const flybys = [];
  for (let i = 1; i < n - 1; i++) {
    const fb = poweredFlyby(vinfIn[i], vinfOut[i], PLANET_BY_ID[seq[i]]);
    dvFb += fb.dv;
    penalty += fb.penalty;
    if (detailed) flybys.push({ ...fb, body: seq[i], jd: times[i], vIn: vinfIn[i], vOut: vinfOut[i] });
  }

  const target = PLANET_BY_ID[seq[n - 1]];
  const vArr = Math.hypot(...vinfIn[n - 1]);
  const rpArr = target.radiusKm + target.arrivalAltKm;
  const dvArr = arrivalDv(vArr, target.gmKm, rpArr, ctx.arrivalType);

  const dvTotal = dvDep + dvFb + dvArr;
  const durDays = times[n - 1] - times[0];
  const overDur = Math.max(0, durDays - ctx.maxDurDays) / 365.25;
  const elapsedYears = (times[n - 1] - ctx.startJD) / 365.25;

  let cost;
  const pen = 5 * penalty + 2 * overDur;
  if (ctx.objective === 'balanced') cost = dvTotal + pen + 0.3 * elapsedYears;
  else if (ctx.objective === 'earliest') cost = elapsedYears + 3 * Math.max(0, dvTotal - ctx.dvBudget) + pen;
  else cost = dvTotal + pen;

  if (!isFinite(cost)) return { cost: 1e6, valid: false };
  if (!detailed) return { cost };
  return {
    cost, valid: true, seq, x: [...x], times, legs, flybys,
    dvDep, dvFb, dvArr, dvTotal, penalty, durDays,
    vinfDep: vinfOut[0], vinfArr: vinfIn[n - 1], vDep, vArr, rpArr,
  };
}

// ---------- Optimisers ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let lastYield = 0;
async function maybeYield() {
  const now = performance.now();
  if (now - lastYield > 25) {
    await new Promise((r) => setTimeout(r, 0));
    lastYield = performance.now();
  }
}

async function differentialEvolution(f, lo, hi, { pop, gens, seed = 1, init = [], onGen }) {
  const D = lo.length;
  const rand = mulberry32(seed);
  const clamp = (v, d) => Math.min(hi[d], Math.max(lo[d], v));
  let X = [], fit = [];
  for (let i = 0; i < pop; i++) {
    const x = init[i] ? init[i].map(clamp) : lo.map((l, d) => l + rand() * (hi[d] - l));
    X.push(x);
    fit.push(f(x));
  }
  for (let g = 0; g < gens; g++) {
    let best = 0;
    for (let i = 1; i < pop; i++) if (fit[i] < fit[best]) best = i;
    for (let i = 0; i < pop; i++) {
      let a, b, c;
      do a = Math.floor(rand() * pop); while (a === i);
      do b = Math.floor(rand() * pop); while (b === i || b === a);
      do c = Math.floor(rand() * pop); while (c === i || c === a || c === b);
      // Alternate between rand/1 (exploration) and current-to-best/1 (exploitation)
      const F = 0.5 + 0.3 * rand();
      const useBest = rand() < 0.5;
      const jr = Math.floor(rand() * D);
      const trial = new Array(D);
      for (let d = 0; d < D; d++) {
        if (rand() < 0.9 || d === jr) {
          const base = useBest ? X[i][d] + F * (X[best][d] - X[i][d]) : X[a][d];
          let v = base + F * (X[b][d] - X[c][d]);
          if (v < lo[d] || v > hi[d]) v = lo[d] + rand() * (hi[d] - lo[d]);
          trial[d] = v;
        } else trial[d] = X[i][d];
      }
      const ft = f(trial);
      if (ft <= fit[i]) {
        X[i] = trial;
        fit[i] = ft;
      }
    }
    if (onGen) onGen(g);
    await maybeYield();
  }
  let best = 0;
  for (let i = 1; i < pop; i++) if (fit[i] < fit[best]) best = i;
  return { x: X[best], f: fit[best] };
}

function nelderMead(f, x0, lo, hi, iters = 600) {
  const D = x0.length;
  const clamp = (x) => x.map((v, d) => Math.min(hi[d], Math.max(lo[d], v)));
  let simplex = [clamp(x0)];
  for (let d = 0; d < D; d++) {
    const x = [...x0];
    x[d] += Math.max(0.5, 0.02 * (hi[d] - lo[d]));
    simplex.push(clamp(x));
  }
  let vals = simplex.map(f);
  for (let k = 0; k < iters; k++) {
    const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    simplex = idx.map((i) => simplex[i]);
    vals = idx.map((i) => vals[i]);
    const c = new Array(D).fill(0);
    for (let i = 0; i < D; i++) for (let d = 0; d < D; d++) c[d] += simplex[i][d] / D;
    const w = simplex[D];
    const xr = clamp(c.map((v, d) => v + (v - w[d])));
    const fr = f(xr);
    if (fr < vals[0]) {
      const xe = clamp(c.map((v, d) => v + 2 * (v - w[d])));
      const fe = f(xe);
      if (fe < fr) { simplex[D] = xe; vals[D] = fe; } else { simplex[D] = xr; vals[D] = fr; }
    } else if (fr < vals[D - 1]) {
      simplex[D] = xr; vals[D] = fr;
    } else {
      const xc = clamp(c.map((v, d) => v + 0.5 * (w[d] - v)));
      const fc = f(xc);
      if (fc < vals[D]) { simplex[D] = xc; vals[D] = fc; } else {
        for (let i = 1; i <= D; i++) {
          simplex[i] = clamp(simplex[i].map((v, d) => simplex[0][d] + 0.5 * (v - simplex[0][d])));
          vals[i] = f(simplex[i]);
        }
      }
    }
    if (Math.abs(vals[D] - vals[0]) < 1e-9) break;
  }
  let b = 0;
  for (let i = 1; i <= D; i++) if (vals[i] < vals[b]) b = i;
  return { x: simplex[b], f: vals[b] };
}

// ---------- Porkchop plot (direct transfers) ----------

export function porkchop(targetId, ctx, nx = 120, ny = 90) {
  const target = PLANET_BY_ID[targetId];
  const earth = PLANET_BY_ID.earth;
  const synodic = 1 / Math.abs(1 / earth.period - 1 / target.period);
  const span = Math.max(ctx.windowDays, Math.min(1.25 * synodic, 3 * 365.25));
  const [tofLo, tofHi] = legBounds(['earth', targetId], ctx.maxDurDays)[0];
  const seq = ['earth', targetId];
  const data = new Float32Array(nx * ny);
  let best = { cost: Infinity };
  for (let i = 0; i < nx; i++) {
    const dep = ctx.startJD + (span * i) / (nx - 1);
    for (let j = 0; j < ny; j++) {
      const tof = tofLo + ((tofHi - tofLo) * j) / (ny - 1);
      const r = evaluate(seq, [dep, tof], { ...ctx, objective: 'mindv' }, true);
      const v = r.valid ? r.dvTotal : NaN;
      data[j * nx + i] = v;
      if (r.valid && dep <= ctx.startJD + ctx.windowDays + 1e-6 && v < best.cost) best = { cost: v, dep, tof };
    }
  }
  return { dep0: ctx.startJD, dep1: ctx.startJD + span, tof0: tofLo, tof1: tofHi, nx, ny, data, best, targetId };
}

// ---------- Main entry ----------

/**
 * ctx: { targetId, startJD, windowDays, maxDurDays, parkAltKm, arrivalType,
 *        objective: 'mindv'|'balanced'|'earliest', dvBudget, allowAssists }
 */
export async function planMission(ctx, onProgress = () => {}) {
  const seqs = (ctx.allowAssists ? ROUTE_LIBRARY[ctx.targetId] : [['earth', ctx.targetId]]) || [];
  const pc = porkchop(ctx.targetId, ctx);
  const results = [];
  const work = seqs.map((s) => (s.length <= 2 ? 1 : s.length >= 5 ? 3 : 2));
  const totalWork = work.reduce((a, b) => a + b, 0);
  let doneWork = 0;

  for (let si = 0; si < seqs.length; si++) {
    const seq = seqs[si];
    const lb = legBounds(seq, ctx.maxDurDays);
    const lo = [ctx.startJD, ...lb.map((b) => b[0])];
    const hi = [ctx.startJD + ctx.windowDays, ...lb.map((b) => b[1])];
    const f = (x) => evaluate(seq, x, ctx).cost;
    const D = lo.length;
    const runs = D >= 4 ? 3 : D === 3 ? 2 : 1;
    const gens = D <= 2 ? 120 : 200;
    const pop = Math.max(30, 14 * D);
    let best = null;
    for (let run = 0; run < runs; run++) {
      const init = [];
      if (D === 2 && isFinite(pc.best.cost)) init.push([pc.best.dep, pc.best.tof]);
      const res = await differentialEvolution(f, lo, hi, {
        pop, gens, seed: 1234 + run * 7919 + si * 31, init,
        onGen: (g) => onProgress((doneWork + (work[si] * (run + (g + 1) / gens)) / runs) / totalWork, routeName(seq)),
      });
      const pol = nelderMead(f, res.x, lo, hi);
      const cand = pol.f < res.f ? pol : res;
      if (!best || cand.f < best.f) best = cand;
    }
    doneWork += work[si];
    const det = evaluate(seq, best.x, ctx, true);
    if (det.valid) results.push({ ...det, name: routeName(seq), code: routeCode(seq) });
  }

  // Keep only physically valid routes (no impossible flyby turns)
  const feasible = results.filter((r) => r.penalty < 0.01 && r.durDays <= ctx.maxDurDays * 1.001);
  const list = (feasible.length ? feasible : results).sort((a, b) => a.cost - b.cost);
  onProgress(1, 'done');
  return { candidates: list, porkchop: pc };
}
