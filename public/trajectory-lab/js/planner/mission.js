// Turns an optimised route into a flyable mission:
//  - numerically integrated trajectory samples for drawing / animation
//  - manoeuvre list and timeline
//  - full N-body verification with differential-corrected trajectory correction
//    manoeuvres (TCMs), plus a manual burn sandbox.

import {
  AU_KM, AUD_TO_KMS, KMS_TO_AUD, C_KM_S, OBLIQUITY, GM_SUN,
} from '../physics/constants.js';
import { PLANETS, PLANET_BY_ID, planetState } from '../physics/ephemeris.js';
import { integrate, sunAccel, makeNBodyAccel } from '../physics/integrator.js';
import { add, cross, dot, norm, scale, sub, unit } from '../physics/vec.js';

const ARRIVAL_LABEL = {
  circular: 'circular orbit',
  capture: 'elliptical capture orbit (e = 0.9)',
  flyby: 'flyby (no insertion burn)',
};

/** Build the mission object from a planner candidate. */
export function buildMission(route, ctx) {
  const target = PLANET_BY_ID[route.seq.at(-1)];
  const earth = PLANET_BY_ID.earth;
  const samples = { t: [], r: [] };
  const legInfo = [];

  route.legs.forEach((leg, i) => {
    const tof = leg.t1 - leg.t0;
    let rMin = Infinity, rMax = 0, tMin = leg.t0;
    const res = integrate(sunAccel, leg.t0, [...leg.r1, ...leg.v1], leg.t1, {
      hmax: Math.min(4, Math.max(0.5, tof / 500)),
      onSample: (t, y) => {
        if (i > 0 && t === leg.t0) return; // avoid duplicate point at the joint
        samples.t.push(t);
        samples.r.push([y[0], y[1], y[2]]);
        const r = Math.hypot(y[0], y[1], y[2]);
        if (r < rMin) { rMin = r; tMin = t; }
        if (r > rMax) rMax = r;
      },
    });
    const missKm = norm(sub(res.y.slice(0, 3), leg.r2)) * AU_KM;
    legInfo.push({ ...leg, tof, rMin, rMax, tPeri: tMin, missKm, steps: res.steps });
  });

  // Departure asymptote in Earth-equatorial frame (what a launch vehicle targets)
  const v = route.vinfDep;
  const eq = [v[0], v[1] * Math.cos(OBLIQUITY) - v[2] * Math.sin(OBLIQUITY), v[1] * Math.sin(OBLIQUITY) + v[2] * Math.cos(OBLIQUITY)];
  const dla = (Math.asin(eq[2] / norm(eq)) * 180) / Math.PI;
  let rla = (Math.atan2(eq[1], eq[0]) * 180) / Math.PI;
  if (rla < 0) rla += 360;

  const tLaunch = route.times[0];
  const tArr = route.times.at(-1);
  const earthAtArr = planetState(earth, tArr).r;
  const targetAtArr = planetState(target, tArr).r;
  const commsKm = norm(sub(targetAtArr, earthAtArr)) * AU_KM;

  const maneuvers = [];
  maneuvers.push({
    id: 'launch', kind: 'burn', jd: tLaunch, body: 'earth',
    title: `Trans-${target.name} injection`,
    dv: route.dvDep,
    detail: [
      ['Departure orbit', `${ctx.parkAltKm} km circular parking orbit`],
      ['C3', `${(route.vDep ** 2).toFixed(2)} km²/s²`],
      ['v∞ departure', `${route.vDep.toFixed(3)} km/s`],
      ['Asymptote DLA / RLA', `${dla.toFixed(1)}° / ${rla.toFixed(1)}°`],
    ],
  });

  route.flybys.forEach((fb, k) => {
    const p = PLANET_BY_ID[fb.body];
    const vHelIn = norm(route.legs[k].v2) * AUD_TO_KMS;
    const vHelOut = norm(route.legs[k + 1].v1) * AUD_TO_KMS;
    maneuvers.push({
      id: `flyby${k}`, kind: 'flyby', jd: fb.jd, body: fb.body,
      title: `${p.name} gravity assist`,
      dv: fb.dv,
      detail: [
        ['Closest approach', `${Math.round(fb.altKm).toLocaleString()} km altitude`],
        ['v∞ in / out', `${fb.vinfIn.toFixed(2)} / ${fb.vinfOut.toFixed(2)} km/s`],
        ['Turn angle', `${fb.turnDeg.toFixed(1)}° (max ${fb.maxTurnDeg.toFixed(1)}°)`],
        ['Heliocentric speed', `${vHelIn.toFixed(2)} → ${vHelOut.toFixed(2)} km/s (${vHelOut - vHelIn >= 0 ? '+' : ''}${(vHelOut - vHelIn).toFixed(2)})`],
        ['Periapsis burn', fb.dv < 0.005 ? 'none (unpowered)' : `${(fb.dv * 1000).toFixed(0)} m/s`],
      ],
    });
  });

  let captureDetail = [];
  if (ctx.arrivalType === 'capture') {
    const a = route.rpArr / (1 - 0.9);
    const period = 2 * Math.PI * Math.sqrt((a * a * a) / target.gmKm) / 86400;
    captureDetail = [['Capture orbit period', `${period.toFixed(1)} days`]];
  }
  maneuvers.push({
    id: 'arrival', kind: ctx.arrivalType === 'flyby' ? 'flyby' : 'burn', jd: tArr, body: target.id,
    title: ctx.arrivalType === 'flyby' ? `${target.name} flyby` : `${target.name} orbit insertion`,
    dv: route.dvArr,
    detail: [
      ['v∞ arrival', `${route.vArr.toFixed(3)} km/s`],
      ['Periapsis altitude', `${target.arrivalAltKm.toLocaleString()} km`],
      ['Final orbit', ARRIVAL_LABEL[ctx.arrivalType]],
      ...captureDetail,
      ['One-way light time', `${(commsKm / C_KM_S / 60).toFixed(1)} min`],
    ],
  });

  // Timeline: manoeuvres, cruise phases and standard TCM opportunities
  const timeline = [];
  timeline.push({ jd: tLaunch, type: 'launch', label: `Launch from Earth`, sub: `Δv ${route.dvDep.toFixed(2)} km/s from parking orbit` });
  timeline.push({ jd: tLaunch + 10, type: 'tcm', label: 'TCM-1 opportunity', sub: 'Clean up launch dispersions' });
  legInfo.forEach((leg, i) => {
    const from = PLANET_BY_ID[leg.from].name, to = PLANET_BY_ID[leg.to].name;
    timeline.push({
      jd: leg.t0 + 0.5, type: 'cruise', label: `Cruise: ${from} → ${to}`,
      sub: `${Math.round(leg.tof)} days · ${leg.rMin.toFixed(2)}–${leg.rMax.toFixed(2)} AU from Sun`,
      duration: leg.tof,
    });
    if (leg.tof > 60) timeline.push({ jd: leg.t1 - 30, type: 'tcm', label: `Approach TCM (${to})`, sub: 'Target the aim point' });
    const isLast = i === legInfo.length - 1;
    if (!isLast) {
      const fb = route.flybys[i];
      timeline.push({ jd: leg.t1, type: 'flyby', label: `${to} gravity assist`, sub: `${Math.round(fb.altKm).toLocaleString()} km altitude · turn ${fb.turnDeg.toFixed(1)}°${fb.dv > 0.005 ? ` · burn ${(fb.dv * 1000).toFixed(0)} m/s` : ''}` });
    } else {
      timeline.push({
        jd: leg.t1, type: 'arrival', label: ctx.arrivalType === 'flyby' ? `${to} flyby` : `${to} orbit insertion`,
        sub: `v∞ ${route.vArr.toFixed(2)} km/s${route.dvArr > 0 ? ` · Δv ${route.dvArr.toFixed(2)} km/s` : ''}`,
      });
    }
  });
  timeline.sort((a, b) => a.jd - b.jd);

  return {
    route, ctx, target, samples, legs: legInfo, maneuvers, timeline,
    tLaunch, tArr, dvTotal: route.dvTotal, durDays: route.durDays,
    c3: route.vDep ** 2, dla, rla, commsKm,
    maxMissKm: Math.max(...legInfo.map((l) => l.missKm)),
    beyondEphemeris: tArr > 2469807.5, // 2050-12-31: limit of the ephemeris fit
    encounterBodies: route.seq.slice(1),
  };
}

/** Interpolated spacecraft position on a sampled trajectory. */
export function sampleAt(samples, t) {
  const T = samples.t;
  if (!T.length) return null;
  if (t <= T[0]) return samples.r[0];
  if (t >= T[T.length - 1]) return samples.r[T.length - 1];
  let lo = 0, hi = T.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (T[m] <= t) lo = m; else hi = m;
  }
  const f = (t - T[lo]) / (T[hi] - T[lo]);
  const a = samples.r[lo], b = samples.r[hi];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
export function sampleIndex(samples, t) {
  const T = samples.t;
  let lo = 0, hi = T.length - 1;
  if (t <= T[0]) return 0;
  if (t >= T[hi]) return hi;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (T[m] <= t) lo = m; else hi = m;
  }
  return lo;
}

// ---------------------------------------------------------------------------
// N-body verification & burn sandbox
// ---------------------------------------------------------------------------

/** Local orbital frame at a heliocentric state: prograde, normal, radial-out. */
export function localFrame(r, v) {
  const t = unit(v);
  const n = unit(cross(r, v));
  const rad = unit(cross(t, n));
  return { t, n, r: rad };
}
function applyLocal(y, dvMs) {
  const r = [y[0], y[1], y[2]], v = [y[3], y[4], y[5]];
  const f = localFrame(r, v);
  const k = KMS_TO_AUD / 1000;
  const dv = add(add(scale(f.t, dvMs[0] * k), scale(f.n, dvMs[1] * k)), scale(f.r, dvMs[2] * k));
  return [y[0], y[1], y[2], y[3] + dv[0], y[4] + dv[1], y[5] + dv[2]];
}

/** Integrate with the full Sun + planets model, recording samples & closest approaches. */
function propagateNBody(accel, t0, y0, t1, rec, opts = {}) {
  const watch = rec.watch;
  let atPeri = false;
  let prevRv = null;
  const res = integrate(accel, t0, y0, t1, {
    rtol: 1e-11, atol: 1e-14, hmax: opts.hmax ?? 3, hmin: 1e-7,
    onSample: (t, y) => {
      if (rec.samples) {
        rec.samples.t.push(t);
        rec.samples.r.push([y[0], y[1], y[2]]);
      }
      if (watch) {
        for (const w of watch) {
          const p = planetState(w.planet, t);
          const d = Math.hypot(y[0] - p.r[0], y[1] - p.r[1], y[2] - p.r[2]);
          if (d < w.min) {
            w.min = d; w.t = t;
            w.vrel = Math.hypot(y[3] - p.v[0], y[4] - p.v[1], y[5] - p.v[2]);
          }
        }
      }
    },
    stop: (t, y) => {
      if (opts.peri) {
        const p = planetState(opts.peri, t);
        const dx = y[0] - p.r[0], dy = y[1] - p.r[1], dz = y[2] - p.r[2];
        const rv = dx * (y[3] - p.v[0]) + dy * (y[4] - p.v[1]) + dz * (y[5] - p.v[2]);
        const inside = Math.hypot(dx, dy, dz) < opts.peri.soi;
        if (inside && prevRv !== null && prevRv < 0 && rv >= 0) atPeri = true;
        prevRv = inside ? rv : null;
      }
      if (watch) {
        for (const w of watch) {
          const p = planetState(w.planet, t).r;
          const d = Math.hypot(y[0] - p[0], y[1] - p[1], y[2] - p[2]);
          if (d * AU_KM < w.planet.radiusKm) { rec.impact = { body: w.planet.id, t }; return true; }
        }
      }
      return atPeri;
    },
  });
  res.atPeri = atPeri;
  return res;
}

/** Initial state at the edge of Earth's sphere of influence on the departure asymptote. */
function departureState(mission) {
  const route = mission.route;
  const earth = PLANET_BY_ID.earth;
  const s = planetState(earth, mission.tLaunch);
  const vinfAU = scale(route.vinfDep, KMS_TO_AUD);
  const dir = unit(vinfAU);
  const rSoiKm = earth.soi * AU_KM;
  const speedAtSoi = Math.sqrt(route.vDep ** 2 + (2 * earth.gmKm) / rSoiKm) * KMS_TO_AUD;
  // Time to coast from the parking orbit to the SOI edge (approx.): r / v
  const dt = earth.soi / (norm(vinfAU) * 1.02);
  const t0 = mission.tLaunch + dt;
  const sE = planetState(earth, t0);
  return { t0, y: [...add(sE.r, scale(dir, earth.soi)), ...add(sE.v, scale(dir, speedAtSoi))], s };
}

/**
 * Osculating hyperbola of a planet-relative state (km, km/s): B-plane vector and
 * periapsis time. Returns null if the state is not hyperbolic.
 */
function bPlaneOf(rRel, vRel, mu, t) {
  const r = norm(rRel);
  const v2 = dot(vRel, vRel);
  const energy = v2 / 2 - mu / r;
  if (energy <= 0) return null;
  const vinf = Math.sqrt(2 * energy);
  const aAbs = mu / (vinf * vinf);
  const hVec = cross(rRel, vRel);
  const h = norm(hVec);
  const hHat = scale(hVec, 1 / h);
  const rv = dot(rRel, vRel);
  const eVec = scale(sub(scale(rRel, v2 - mu / r), scale(vRel, rv)), 1 / mu);
  const e = norm(eVec);
  const pHat = scale(eVec, 1 / e);
  const qHat = cross(hHat, pHat);
  const S = add(scale(pHat, 1 / e), scale(qHat, Math.sqrt(e * e - 1) / e)); // incoming asymptote
  const B = scale(cross(S, hHat), h / vinf);
  const coshF = Math.max(1, (1 + r / aAbs) / e);
  const F = Math.sign(rv || -1) * Math.acosh(coshF);
  const N = e * Math.sinh(F) - F;
  const n = Math.sqrt(mu / (aAbs * aAbs * aAbs));
  return { B, S, vinf, tp: t - N / n / 86400, rp: aAbs * (e - 1) };
}

/** Planned B-plane target for encounter k (km), from the patched-conic design. */
function plannedBPlane(mission, k) {
  const route = mission.route;
  const body = PLANET_BY_ID[route.seq[k + 1]];
  const isArrival = k === route.legs.length - 1;
  const vIn = isArrival ? route.vinfArr : route.flybys[k].vIn;
  const vinf = norm(vIn);
  const rp = isArrival ? route.rpArr : route.flybys[k].rp;
  const w = unit(vIn);
  let bHat;
  if (!isArrival) {
    // The asymptote passes on the side opposite to the required deflection
    const vOut = route.flybys[k].vOut;
    const perp = sub(vOut, scale(w, dot(vOut, w)));
    bHat = norm(perp) > 1e-9 ? scale(unit(perp), -1) : unit(cross(w, [0, 0, 1]));
  } else {
    bHat = unit(cross(w, [0, 0, 1]));
  }
  const T = unit(cross(w, [0, 0, 1]));
  const R = cross(w, T);
  return { bHat, rp, T, R, tp: route.legs[k].t1, vinf, body };
}

/**
 * B-plane targeting by differential correction: find the Δv at (t0, y0) such that the
 * N-body trajectory's osculating hyperbola at tAim has the planned B·T, B·R and
 * periapsis time. Newton iteration with a finite-difference Jacobian.
 */
function targetBPlane(accel, t0, y0, tAim, tgt, maxIter = 12) {
  const mu = tgt.body.gmKm;
  const residual = (d) => {
    const y = [y0[0], y0[1], y0[2], y0[3] + d[0], y0[4] + d[1], y0[5] + d[2]];
    const yf = integrate(accel, t0, y, tAim, { rtol: 1e-12, atol: 1e-15, hmax: 3, hmin: 1e-8 }).y;
    const p = planetState(tgt.body, tAim);
    const rRel = scale(sub(yf.slice(0, 3), p.r), AU_KM);
    const vRel = scale(sub(yf.slice(3), p.v), AUD_TO_KMS);
    const bp = bPlaneOf(rRel, vRel, mu, tAim);
    if (!bp) {
      // Not yet hyperbolic: steer the position toward the planet as a fallback
      return [dot(rRel, tgt.T), dot(rRel, tgt.R), 0].map((x) => x * 1e3);
    }
    // Impact parameter that gives the planned periapsis for the *actual* approach v∞
    const b = tgt.rp * Math.sqrt(1 + (2 * mu) / (tgt.rp * bp.vinf * bp.vinf));
    const dB = sub(bp.B, scale(tgt.bHat, b));
    return [dot(dB, tgt.T), dot(dB, tgt.R), (bp.tp - tgt.tp) * 86400 * tgt.vinf];
  };
  let dv = [0, 0, 0];
  let g = residual(dv);
  const eps = 1e-7; // ≈ 0.17 m/s
  for (let it = 0; it < maxIter && norm(g) > 5; it++) {
    const J = [];
    for (let c = 0; c < 3; c++) {
      const d = [...dv];
      d[c] += eps;
      J.push(scale(sub(residual(d), g), 1 / eps));
    }
    let step = solve3(J, scale(g, -1));
    if (!step) break;
    // Damped update: back off if the residual grows
    let lam = 1, gNew, dvNew;
    for (let ls = 0; ls < 6; ls++) {
      dvNew = add(dv, scale(step, lam));
      gNew = residual(dvNew);
      if (norm(gNew) < norm(g)) break;
      lam *= 0.5;
    }
    dv = dvNew;
    g = gNew;
  }
  return { dv, errKm: norm(g) };
}

function solve3(cols, b) {
  const [a, c, e] = cols; // columns
  const m = [
    [a[0], c[0], e[0]],
    [a[1], c[1], e[1]],
    [a[2], c[2], e[2]],
  ];
  const det =
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  if (Math.abs(det) < 1e-30) return null;
  const rep = (col) => {
    const mm = m.map((row) => [...row]);
    for (let i = 0; i < 3; i++) mm[i][col] = b[i];
    return (
      mm[0][0] * (mm[1][1] * mm[2][2] - mm[1][2] * mm[2][1]) -
      mm[0][1] * (mm[1][0] * mm[2][2] - mm[1][2] * mm[2][0]) +
      mm[0][2] * (mm[1][0] * mm[2][1] - mm[1][1] * mm[2][0])
    );
  };
  return [rep(0) / det, rep(1) / det, rep(2) / det];
}

/**
 * Fly the mission through the full Sun + 8 planet gravity field.
 *
 * options
 *   correctFrom: index of the first leg whose start gets a differential-corrected TCM
 *                (0 = also trim the injection; Infinity = no automatic corrections)
 *   baseTrim:    an injection trim (AU/day vector) to apply without re-solving
 *   manual:      { dep:[pro,norm,rad] m/s, mcc:{ day, dv:[pro,norm,rad] } } extra burns
 *
 * Planned powered-flyby burns are executed at the actual periapsis, and the arrival
 * insertion burn is computed from the actual approach (v∞, periapsis).
 */
export async function simulateNBody(mission, { correctFrom = 0, baseTrim = null, manual = null, onProgress } = {}) {
  const accel = makeNBodyAccel(PLANETS);
  const route = mission.route;
  const ctx = mission.ctx;
  const watch = route.seq.slice(1).map((id) => ({ planet: PLANET_BY_ID[id], min: Infinity, t: 0, vrel: 0 }));
  const rec = { samples: { t: [], r: [] }, watch, impact: null };
  const tcms = [];
  const dep = departureState(mission);
  let t = dep.t0;
  let y = dep.y;
  let injectionTrim = null;
  let arrivalResult = null;
  const tEnd = mission.tArr + Math.min(60, 0.05 * mission.durDays);
  const yieldUI = () => new Promise((r) => setTimeout(r, 0));

  if (baseTrim) {
    y = [y[0], y[1], y[2], y[3] + baseTrim[0], y[4] + baseTrim[1], y[5] + baseTrim[2]];
    injectionTrim = baseTrim;
  }

  // Manual burns
  const burns = [];
  if (manual?.dep && manual.dep.some((v) => v !== 0)) burns.push({ jd: t, dv: manual.dep, label: 'Manual departure trim' });
  if (manual?.mcc && manual.mcc.dv.some((v) => v !== 0)) burns.push({ jd: Math.max(t, mission.tLaunch + manual.mcc.day), dv: manual.mcc.dv, label: `Manual burn (L+${Math.round(manual.mcc.day)} d)` });
  burns.sort((a, b) => a.jd - b.jd);

  /** Propagate to tTarget, executing manual burns; optionally stop at periapsis of `peri`. */
  const run = (tTarget, peri) => {
    while (burns.length && burns[0].jd <= tTarget) {
      const b = burns[0];
      if (b.jd > t) {
        const r = propagateNBody(accel, t, y, b.jd, rec, { peri });
        t = r.t; y = r.y;
        if (rec.impact) return {};
        if (r.atPeri) return { atPeri: true };
      }
      burns.shift();
      y = applyLocal(y, b.dv);
      tcms.push({ jd: t, dvMs: Math.hypot(...b.dv), label: b.label, manual: true });
    }
    const r = propagateNBody(accel, t, y, tTarget, rec, { peri });
    t = r.t; y = r.y;
    return { atPeri: !!r.atPeri };
  };

  const nLegs = route.legs.length;
  for (let k = 0; k < nLegs; k++) {
    const leg = route.legs[k];
    const body = PLANET_BY_ID[route.seq[k + 1]];
    const isArrival = k === nLegs - 1;
    const vinfAU = (isArrival ? route.vArr : route.flybys[k].vinfIn) * KMS_TO_AUD;
    const margin = Math.min(0.25 * (leg.t1 - leg.t0), Math.max(0.1, (0.03 * body.soi) / vinfAU));
    const tAim = leg.t1 - margin;

    if (k >= correctFrom && tAim > t) {
      const sol = targetBPlane(accel, t, y, tAim, plannedBPlane(mission, k));
      const dvMs = norm(sol.dv) * (1000 / KMS_TO_AUD);
      y = [y[0], y[1], y[2], y[3] + sol.dv[0], y[4] + sol.dv[1], y[5] + sol.dv[2]];
      if (k === 0) injectionTrim = sol.dv;
      tcms.push({
        jd: t, dvMs, missKm: sol.errKm,
        label: k === 0 ? 'TCM-1 (injection trim)' : `TCM after ${PLANET_BY_ID[route.seq[k]].name} flyby`,
      });
      if (onProgress) onProgress((k + 0.5) / nLegs);
      await yieldUI();
    }

    const tSegEnd = isArrival ? tEnd : leg.t1 + Math.min(margin, 0.25 * (route.legs[k + 1].t1 - route.legs[k + 1].t0));
    const r = run(tSegEnd, body);
    if (rec.impact) break;

    if (r.atPeri) {
      const p = planetState(body, t);
      const rRel = scale(sub(y.slice(0, 3), p.r), AU_KM);
      const vRelV = scale(sub(y.slice(3), p.v), AUD_TO_KMS);
      const rp = norm(rRel), vp = norm(vRelV);
      if (!isArrival) {
        const fb = route.flybys[k];
        if (fb.dv > 5e-4) {
          // Powered flyby: burn along the velocity at periapsis
          const sign = fb.vinfOut > fb.vinfIn ? 1 : -1;
          const dvAU = scale(unit(vRelV), (sign * fb.dv) * KMS_TO_AUD);
          y = [y[0], y[1], y[2], y[3] + dvAU[0], y[4] + dvAU[1], y[5] + dvAU[2]];
          tcms.push({ jd: t, dvMs: fb.dv * 1000, label: `${body.name} periapsis burn (planned)`, planned: true });
        }
        run(tSegEnd, null);
        if (rec.impact) break;
      } else if (ctx.arrivalType !== 'flyby') {
        // Orbit insertion from the actual approach conditions, then stop.
        const mu = body.gmKm;
        const vCirc = Math.sqrt(mu / rp);
        const vTarget = ctx.arrivalType === 'circular' ? vCirc : Math.sqrt((mu * 1.9) / rp);
        arrivalResult = { jd: t, rpKm: rp, altKm: rp - body.radiusKm, dvKms: Math.max(0, vp - vTarget), vinfKms: Math.sqrt(Math.max(0, vp * vp - (2 * mu) / rp)) };
        tcms.push({ jd: t, dvMs: arrivalResult.dvKms * 1000, label: `${body.name} orbit insertion (actual)`, planned: true });
        break;
      } else {
        run(tSegEnd, null);
      }
    }
    if (onProgress) onProgress((k + 1) / nLegs);
    await yieldUI();
  }

  const encounters = watch.map((w, i) => {
    const isArrival = i === watch.length - 1;
    const plannedAlt = isArrival ? mission.target.arrivalAltKm : route.flybys[i]?.altKm;
    return {
      body: w.planet.id, name: w.planet.name, jd: w.t,
      distKm: w.min * AU_KM, altKm: w.min * AU_KM - w.planet.radiusKm,
      vRelKms: w.vrel * AUD_TO_KMS, plannedAltKm: plannedAlt, isArrival,
      insideSoi: w.min < w.planet.soi,
    };
  });
  const tcmTotal = tcms.filter((c) => !c.manual && !c.planned).reduce((s, c) => s + c.dvMs, 0);
  return { samples: rec.samples, encounters, tcms, tcmTotal, impact: rec.impact, injectionTrim, arrival: arrivalResult };
}
