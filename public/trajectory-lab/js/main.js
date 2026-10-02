// Trajectory Lab: app state, UI wiring and the animation loop.

import { SolarScene } from './render/scene.js';
import { PLANETS, PLANET_BY_ID, planetState } from './physics/ephemeris.js';
import { PlanetNBody } from './physics/integrator.js';
import { jdFromDate, fmtDate, fmtDuration, isoDate } from './physics/constants.js';
import { planMission, DEFAULTS, evaluate, routeCode } from './planner/planner.js';
import { buildMission, sampleAt, simulateNBody } from './planner/mission.js';
import { Porkchop } from './ui/porkchop.js';

const $ = (id) => document.getElementById(id);
const fmtKm = (km) => `${Math.round(km).toLocaleString()} km`;

const SPEEDS = [
  { label: '1 hour/s', d: 1 / 24 },
  { label: '1 day/s', d: 1 },
  { label: '1 week/s', d: 7 },
  { label: '1 month/s', d: 30.44 },
  { label: '3 months/s', d: 91.3 },
  { label: '1 year/s', d: 365.25 },
];

const TODAY = jdFromDate(new Date());

const state = {
  jd: TODAY,
  playing: true,
  dir: 1,
  speedIdx: 2,
  plan: null,
  ctx: null,
  candIdx: 0,
  mission: null,
  nbody: null,
  sandbox: null,
  follow: 'planned',
  nbodyPlanets: false,
  planetNB: null,
  busy: false,
};

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const scene = new SolarScene($('viewport'));
scene.rebuildOrbits(state.jd);
scene.onPick = (id) => setFocus(id);
scene.frameSystem(2);

function planetPositions(jd) {
  const out = {};
  if (state.nbodyPlanets) {
    if (!state.planetNB) state.planetNB = new PlanetNBody(jd);
    const nb = state.planetNB;
    const diff = jd - nb.t;
    if (Math.abs(diff) > 400) nb.reset(jd);
    else if (diff !== 0) nb.step(diff, 0.25);
    PLANETS.forEach((p, i) => { out[p.id] = nb.position(i); });
  } else {
    for (const p of PLANETS) out[p.id] = planetState(p, jd).r;
  }
  return out;
}

function activeTrajectory() {
  const m = state.mission;
  if (!m) return null;
  if (state.follow === 'sandbox' && state.sandbox) return state.sandbox.samples;
  if (state.follow === 'nbody' && state.nbody) return state.nbody.samples;
  return m.samples;
}

function legAt(jd) {
  return state.mission.legs.find((l) => jd >= l.t0 && jd < l.t1) || null;
}

function craftState(jd, planets) {
  const m = state.mission;
  if (!m) return null;
  const traj = activeTrajectory();
  if (jd < traj.t[0]) return { pos: planets.earth, text: 'Spacecraft' };
  if (jd <= traj.t.at(-1)) return { pos: sampleAt(traj, jd), text: 'Spacecraft' };
  if (m.ctx.arrivalType === 'flyby') return { pos: traj.r.at(-1), text: 'Spacecraft' };
  if (state.follow === 'sandbox' && state.sandbox && !state.sandbox.arrival) return { pos: traj.r.at(-1), text: 'Spacecraft' };
  return { pos: planets[m.target.id], text: 'Spacecraft' };
}

// ---------------------------------------------------------------------------
// Time controls
// ---------------------------------------------------------------------------
const speedSel = $('speed-select');
speedSel.innerHTML = SPEEDS.map((s, i) => `<option value="${i}">${s.label}</option>`).join('');
speedSel.addEventListener('change', () => { state.speedIdx = +speedSel.value; });

function renderTransport() {
  speedSel.value = String(state.speedIdx);
  $('btn-play').textContent = state.playing ? 'Pause' : 'Play';
  $('btn-reverse').classList.toggle('on', state.dir < 0);
}

function setJD(jd) {
  state.jd = jd;
  if (state.planetNB && Math.abs(jd - state.planetNB.t) > 1) state.planetNB.reset(jd);
}

$('btn-play').addEventListener('click', () => { state.playing = !state.playing; renderTransport(); });
$('btn-reverse').addEventListener('click', () => { state.dir *= -1; renderTransport(); });
$('btn-launch').addEventListener('click', () => { if (state.mission) setJD(state.mission.tLaunch - 2); });
$('btn-arrive').addEventListener('click', () => { if (state.mission) setJD(state.mission.tArr - 2); });
$('btn-today').addEventListener('click', () => setJD(TODAY));
$('date-input').addEventListener('change', (e) => {
  if (e.target.value) setJD(jdFromDate(new Date(`${e.target.value}T00:00:00Z`)));
});
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); state.playing = !state.playing; renderTransport(); }
});

function scrubRange() {
  const m = state.mission;
  if (m) {
    const pad = Math.max(20, 0.04 * m.durDays);
    return [m.tLaunch - pad, m.tArr + pad];
  }
  return [TODAY - 30, TODAY + 3 * 365.25];
}
const scrubber = $('scrubber');
let scrubbing = false;
scrubber.addEventListener('input', () => {
  scrubbing = true;
  const [a, b] = scrubRange();
  setJD(a + (scrubber.value / 1000) * (b - a));
});
scrubber.addEventListener('change', () => { scrubbing = false; });

function renderScrubTicks() {
  const [a, b] = scrubRange();
  $('scrub-start').textContent = fmtDate(a);
  $('scrub-end').textContent = fmtDate(b);
  const box = $('scrub-ticks');
  box.innerHTML = '';
  const m = state.mission;
  if (!m) return;
  const ticks = [{ jd: m.tLaunch, t: 'Launch' }];
  m.route.flybys.forEach((f) => ticks.push({ jd: f.jd, t: PLANET_BY_ID[f.body].name }));
  ticks.push({ jd: m.tArr, t: m.target.name });
  for (const tk of ticks) {
    const el = document.createElement('span');
    el.className = 'scrub-tick';
    el.style.left = `${((tk.jd - a) / (b - a)) * 100}%`;
    el.textContent = tk.t;
    box.appendChild(el);
  }
}

// ---------------------------------------------------------------------------
// View tools
// ---------------------------------------------------------------------------
$('scale-select').addEventListener('change', (e) => {
  scene.scaleMode = e.target.value;
  scene.rebuildOrbits(state.jd);
  refreshRoute();
  scene._snap = true;
  if (scene.focusId === 'sun') scene.frameSystem(state.mission ? missionExtent() : 2);
});
$('planet-size').addEventListener('input', (e) => { scene.planetScale = +e.target.value; });
$('toggle-labels').addEventListener('change', (e) => scene.setLabelsVisible(e.target.checked));
$('toggle-orbits').addEventListener('change', (e) => scene.setOrbitsVisible(e.target.checked));
$('toggle-nbody').addEventListener('change', (e) => {
  state.nbodyPlanets = e.target.checked;
  state.planetNB = state.nbodyPlanets ? new PlanetNBody(state.jd) : null;
});

const focusSel = $('focus-select');
function renderFocusOptions() {
  const opts = [['sun', 'Sun'], ...PLANETS.map((p) => [p.id, p.name])];
  if (state.mission) opts.push(['craft', 'Spacecraft']);
  focusSel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  focusSel.value = scene.focusId;
}
focusSel.addEventListener('change', () => setFocus(focusSel.value));
function setFocus(id) {
  if (id === 'craft' && !state.mission) return;
  scene.setFocus(id);
  if (id === 'sun') scene.frameSystem(state.mission ? missionExtent() : 2);
  focusSel.value = id;
}
function missionExtent() {
  return Math.max(...state.mission.legs.map((l) => l.rMax), 1.2);
}

for (const t of ['plan', 'mission', 'view']) {
  $(`tab-${t}`).addEventListener('click', () => {
    const on = !document.body.classList.contains(`tab-${t}`);
    document.body.classList.remove('tab-plan', 'tab-mission', 'tab-view');
    if (on) document.body.classList.add(`tab-${t}`);
    for (const u of ['plan', 'mission', 'view']) $(`tab-${u}`).classList.toggle('on', on && u === t);
  });
}
// Panels start closed on narrow screens so the 3D view is visible first
$('tab-plan').classList.remove('on');

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------
const targetSel = $('target-select');
targetSel.innerHTML = PLANETS.filter((p) => p.id !== 'earth').map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
targetSel.addEventListener('change', () => applyTargetDefaults(targetSel.value));

function applyTargetDefaults(id) {
  targetSel.value = id;
  const d = DEFAULTS[id];
  $('window-select').value = String(d.windowYears);
  $('maxdur').value = d.maxYears;
  $('arrival-select').value = d.arrival;
}

$('objective-select').addEventListener('change', (e) => {
  $('budget-field').hidden = e.target.value !== 'earliest';
});

function readCtx() {
  return {
    targetId: targetSel.value,
    startJD: state.jd,
    windowDays: +$('window-select').value * 365.25,
    maxDurDays: Math.max(0.2, +$('maxdur').value || 1) * 365.25,
    parkAltKm: Math.max(150, +$('park-alt').value || 300),
    arrivalType: $('arrival-select').value,
    objective: $('objective-select').value,
    dvBudget: +$('dv-budget').value || 10,
    allowAssists: $('allow-assists').checked,
  };
}

async function runPlanner() {
  if (state.busy) return;
  state.busy = true;
  const ctx = readCtx();
  state.ctx = ctx;
  $('plan-btn').disabled = true;
  $('candidates').innerHTML = '';
  try {
    const res = await planMission(ctx, (f) => {
      $('plan-status').textContent = `Searching... ${Math.round(f * 100)}%`;
    });
    state.plan = res;
    $('plan-status').textContent = `Launch dates searched from ${fmtDate(ctx.startJD)}.`;
    if (res.candidates.length) selectCandidate(0);
    else $('plan-status').textContent = 'No route found. Try a longer launch window or flight time.';
  } finally {
    state.busy = false;
    $('plan-btn').disabled = false;
  }
}
$('plan-btn').addEventListener('click', runPlanner);

function renderCandidates() {
  const list = state.plan.candidates;
  $('candidates').innerHTML = `<h3>Routes (${list.length})</h3>` + list.map((c, i) => `
    <button type="button" class="cand${i === state.candIdx ? ' on' : ''}" data-i="${i}">
      <span>${c.name}${i === 0 && !c.custom ? ' (best)' : ''}<small>${c.code} · ${fmtDate(c.times[0])} · ${fmtDuration(c.durDays)}</small></span>
      <span>${c.dvTotal.toFixed(2)} km/s</span>
    </button>`).join('');
  $('candidates').querySelectorAll('.cand').forEach((b) => b.addEventListener('click', () => selectCandidate(+b.dataset.i)));
}

// ---------------------------------------------------------------------------
// Mission
// ---------------------------------------------------------------------------
function chooseSpeedFor(durDays) {
  const want = durDays / 40;
  let best = 0;
  SPEEDS.forEach((s, i) => { if (Math.abs(Math.log(s.d / want)) < Math.abs(Math.log(SPEEDS[best].d / want))) best = i; });
  return best;
}

function selectCandidate(i) {
  state.candIdx = i;
  const m = buildMission(state.plan.candidates[i], state.ctx);
  m.posOf = (p, jd) => planetState(p, jd).r;
  m.fmt = (jd) => fmtDate(jd);
  state.mission = m;
  state.nbody = null;
  state.sandbox = null;
  state.follow = 'planned';
  refreshRoute();
  renderCandidates();
  renderMission();
  renderFocusOptions();
  renderScrubTicks();
  setJD(m.tLaunch - Math.max(5, 0.01 * m.durDays));
  state.speedIdx = chooseSpeedFor(m.durDays);
  state.dir = 1;
  state.playing = true;
  renderTransport();
  if (scene.focusId === 'sun' || scene.focusId === 'craft') setFocus('sun');
}

function refreshRoute() {
  scene.followNBody = false;
  scene.setRoute(state.mission, state.nbody, state.sandbox);
  const follow = state.follow === 'sandbox' ? state.sandbox : state.follow === 'nbody' ? state.nbody : null;
  if (follow) {
    scene.trailSamples = follow.samples;
    scene.routeGroup.remove(scene.trail);
    scene.trail = scene._line(follow.samples.r, 0xffe2b0, 3, { renderOrder: 3 });
    scene.trail.geometry.instanceCount = 0;
    scene.routeGroup.add(scene.trail);
  }
}

function slider(id, label, min, max, step, value = 0) {
  return `<label class="slider-row" for="${id}"><span>${label}</span>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
    <output>${value}</output></label>`;
}

function renderMission() {
  const m = state.mission;
  const r = m.route;
  $('mission-empty').hidden = true;
  const body = $('mission-body');
  body.hidden = false;
  const isDirect = r.seq.length === 2;
  const notes = [];
  if (m.beyondEphemeris) notes.push('Arrival is after 2050, so planet positions are extrapolated.');
  if (r.dvFb > 0.05) notes.push(`Includes ${(r.dvFb * 1000).toFixed(0)} m/s of burns during flybys.`);

  body.innerHTML = `
    <div class="section">
      <h2>Earth to ${m.target.name}</h2>
      <p class="muted">${r.name} (${r.code})</p>
      <table class="table">
        <tr><td>Total Δv</td><td class="num">${m.dvTotal.toFixed(2)} km/s</td></tr>
        <tr><td>Launch</td><td class="num">${fmtDate(m.tLaunch)}</td></tr>
        <tr><td>Arrival</td><td class="num">${fmtDate(m.tArr)}</td></tr>
        <tr><td>Flight time</td><td class="num">${fmtDuration(m.durDays)}</td></tr>
      </table>
      ${notes.map((n) => `<p class="notice">${n}</p>`).join('')}
    </div>

    <div class="section">
      <h3>Maneuvers</h3>
      ${m.maneuvers.map((mv) => `
        <div class="mnv">
          <div class="mnv-head"><span>${mv.title}</span><span>${mv.dv > 0.0005 ? `${mv.dv.toFixed(3)} km/s` : '0 km/s'}</span></div>
          <div class="muted">${fmtDate(mv.jd)} <button type="button" class="link" data-jump="${mv.jd}">go to</button></div>
          <dl>${mv.detail.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
        </div>`).join('')}
    </div>

    <div class="section">
      <h3>Timeline</h3>
      <table class="table" id="timeline">
        ${m.timeline.map((e) => `
          <tr class="clickable" data-jump="${e.jd}">
            <td class="num">${fmtDate(e.jd)}</td>
            <td>${e.label}<br><span class="muted">${e.sub}</span></td>
          </tr>`).join('')}
      </table>
    </div>

    <div class="section">
      <h3>Launch window (direct transfers)</h3>
      <div class="porkchop-wrap">
        <canvas id="porkchop" width="352" height="250" aria-label="Delta-v by launch date and flight time"></canvas>
        <div class="porkchop-tip" id="porkchop-tip" hidden></div>
      </div>
      <p class="muted">Click the chart to fly a direct transfer on that date.</p>
    </div>

    <div class="section">
      <h3>N-body check</h3>
      <p class="muted">Flies the route with gravity from the Sun and all planets, adding the correction burns needed to stay on course.</p>
      <div class="row"><button type="button" id="nbody-btn">Run N-body check</button><span class="muted" id="nbody-status"></span></div>
      <div id="nbody-result"></div>
    </div>

    <div class="section">
      <h3>Burn sandbox</h3>
      <p class="muted">Add burns (m/s) and see where the spacecraft goes.</p>
      <p class="muted">Departure trim</p>
      ${slider('sb-dep-p', 'Prograde', -300, 300, 5)}
      ${slider('sb-dep-n', 'Normal', -300, 300, 5)}
      ${slider('sb-dep-r', 'Radial', -300, 300, 5)}
      <p class="muted">Mid-course burn</p>
      ${slider('sb-mcc-day', 'Day', 1, Math.max(2, Math.floor(m.durDays - 1)), 1, Math.round(m.durDays / 3))}
      ${slider('sb-mcc-p', 'Prograde', -1000, 1000, 10)}
      ${slider('sb-mcc-n', 'Normal', -1000, 1000, 10)}
      ${slider('sb-mcc-r', 'Radial', -1000, 1000, 10)}
      <label class="check"><input type="checkbox" id="sb-auto"> Auto-correct after flybys</label>
      <div class="row"><button type="button" id="sb-reset">Reset</button><span class="muted" id="sb-status"></span></div>
      <div id="sandbox-result"></div>
    </div>

    <div class="section">
      <h3>Spacecraft follows</h3>
      <select id="follow-select">
        <option value="planned">Planned route</option>
        <option value="nbody">N-body flight</option>
        <option value="sandbox">Sandbox flight</option>
      </select>
      <div class="legend">
        <span><i class="swatch" style="background:var(--route)"></i>Planned</span>
        <span><i class="swatch" style="background:var(--nbody)"></i>N-body</span>
        <span><i class="swatch" style="background:var(--sandbox)"></i>Sandbox</span>
      </div>
    </div>
  `;

  body.querySelectorAll('[data-jump]').forEach((el) => el.addEventListener('click', () => setJD(+el.dataset.jump - 1)));

  const pc = state.plan.porkchop;
  pc.windowEnd = state.ctx.startJD + state.ctx.windowDays;
  const chart = new Porkchop($('porkchop'), $('porkchop-tip'), (dep, tof) => pickCustomDirect(dep, tof));
  chart.draw(pc, isDirect ? { dep: m.tLaunch, tof: m.durDays } : null);

  $('nbody-btn').addEventListener('click', runNBody);
  $('follow-select').addEventListener('change', (e) => setFollow(e.target.value));
  body.querySelectorAll('.slider-row input').forEach((inp) => inp.addEventListener('input', () => {
    inp.nextElementSibling.textContent = inp.value;
    scheduleSandbox();
  }));
  $('sb-auto').addEventListener('change', scheduleSandbox);
  $('sb-reset').addEventListener('click', () => {
    body.querySelectorAll('.slider-row input').forEach((inp) => {
      if (inp.id !== 'sb-mcc-day') inp.value = 0;
      inp.nextElementSibling.textContent = inp.value;
    });
    state.sandbox = null;
    if (state.follow === 'sandbox') state.follow = state.nbody ? 'nbody' : 'planned';
    refreshRoute();
    renderFollow();
    $('sandbox-result').innerHTML = '';
    $('sb-status').textContent = '';
  });
  renderFollow();
}

function pickCustomDirect(dep, tof) {
  const ctx = state.ctx;
  const r = evaluate(['earth', ctx.targetId], [dep, tof], ctx, true);
  if (!r.valid) return;
  const list = state.plan.candidates.filter((c) => !c.custom);
  list.push({ ...r, name: 'Direct transfer (from chart)', code: routeCode(r.seq), custom: true });
  state.plan.candidates = list;
  selectCandidate(list.length - 1);
}

async function setFollow(mode) {
  if (mode === 'nbody' && !state.nbody) await runNBody();
  if (mode === 'sandbox' && !state.sandbox) {
    $('sb-status').textContent = 'Move a slider first.';
    mode = state.follow;
  }
  state.follow = mode;
  refreshRoute();
  renderFollow();
}
function renderFollow() {
  const sel = $('follow-select');
  if (sel) sel.value = state.follow;
}

// ---------------------------------------------------------------------------
// N-body check & sandbox
// ---------------------------------------------------------------------------
async function runNBody() {
  const m = state.mission;
  if (!m || state.nbodyRunning) return;
  state.nbodyRunning = true;
  $('nbody-btn').disabled = true;
  try {
    const res = await simulateNBody(m, { onProgress: (f) => { $('nbody-status').textContent = `Running... ${Math.round(f * 100)}%`; } });
    if (state.mission !== m) return;
    state.nbody = res;
    $('nbody-status').textContent = '';
    renderNBodyResult();
    state.follow = 'nbody';
    refreshRoute();
    renderFollow();
  } finally {
    state.nbodyRunning = false;
    $('nbody-btn').disabled = false;
  }
}

function encounterTable(res) {
  return `<table class="table">
    <tr><th>Planet</th><th class="num">Closest</th><th class="num">Planned</th></tr>
    ${res.encounters.map((e) => {
      const value = e.altKm < 0 ? '<span class="bad">impact</span>' : e.insideSoi ? fmtKm(e.altKm) : fmtKm(e.distKm);
      return `<tr><td>${e.name}</td><td class="num">${value}</td><td class="num">${fmtKm(e.plannedAltKm)}</td></tr>`;
    }).join('')}
  </table>`;
}

function burnTable(res) {
  if (!res.tcms.length) return '';
  return `<table class="table">
    <tr><th>Burn</th><th class="num">Date</th><th class="num">Δv</th></tr>
    ${res.tcms.map((c) => `<tr><td>${c.label}</td><td class="num">${fmtDate(c.jd)}</td><td class="num">${c.dvMs >= 1000 ? (c.dvMs / 1000).toFixed(2) + ' km/s' : c.dvMs.toFixed(1) + ' m/s'}</td></tr>`).join('')}
  </table>`;
}

function renderNBodyResult() {
  const res = state.nbody;
  let html = `<p>Correction burns: ${res.tcmTotal.toFixed(1)} m/s total.</p>`;
  if (res.impact) html += `<p class="bad">Hits ${PLANET_BY_ID[res.impact.body].name} on ${fmtDate(res.impact.t)}.</p>`;
  $('nbody-result').innerHTML = html + encounterTable(res) + burnTable(res);
}

let sandboxTimer = null;
function scheduleSandbox() {
  clearTimeout(sandboxTimer);
  sandboxTimer = setTimeout(runSandbox, 250);
}
async function runSandbox() {
  const m = state.mission;
  if (!m) return;
  if (!state.nbody) await runNBody();
  if (!state.nbody || state.mission !== m) return;
  const v = (id) => +$(id).value;
  const manual = {
    dep: [v('sb-dep-p'), v('sb-dep-n'), v('sb-dep-r')],
    mcc: { day: v('sb-mcc-day'), dv: [v('sb-mcc-p'), v('sb-mcc-n'), v('sb-mcc-r')] },
  };
  const token = (state.sandboxToken = (state.sandboxToken || 0) + 1);
  $('sb-status').textContent = 'Running...';
  const res = await simulateNBody(m, {
    correctFrom: $('sb-auto').checked ? 1 : Infinity,
    baseTrim: state.nbody.injectionTrim,
    manual,
  });
  if (token !== state.sandboxToken || state.mission !== m) return;
  state.sandbox = res;
  state.follow = 'sandbox';
  refreshRoute();
  renderFollow();
  const added = res.tcms.filter((c) => c.manual).reduce((s, c) => s + c.dvMs, 0);
  $('sb-status').textContent = `Your burns: ${added.toFixed(0)} m/s`;
  let html = '';
  if (res.impact) html += `<p class="bad">Hits ${PLANET_BY_ID[res.impact.body].name} on ${fmtDate(res.impact.t)}.</p>`;
  $('sandbox-result').innerHTML = html + encounterTable(res);
}

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
let last = performance.now();
let uiTick = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.playing && !scrubbing) state.jd += SPEEDS[state.speedIdx].d * state.dir * dt;
  if (Math.abs(state.jd - (scene.orbitJD ?? state.jd)) > 3650) scene.rebuildOrbits(state.jd);

  const planets = planetPositions(state.jd);
  const craft = craftState(state.jd, planets);
  scene.setTrailProgress(state.jd);
  scene.update(planets, craft?.pos, craft?.text);

  uiTick += dt;
  if (uiTick > 0.1) {
    uiTick = 0;
    updateClockUI();
  }
  requestAnimationFrame(frame);
}

function updateClockUI() {
  $('sim-date').textContent = fmtDate(state.jd);
  const [a, b] = scrubRange();
  if (!scrubbing) scrubber.value = Math.round(((state.jd - a) / (b - a)) * 1000);
  const di = $('date-input');
  if (document.activeElement !== di) di.value = isoDate(state.jd);
  const m = state.mission;
  if (!m) { $('mission-clock').textContent = ''; return; }
  const d = state.jd - m.tLaunch;
  let phase;
  if (d < 0) phase = `${Math.ceil(-d)} days to launch`;
  else if (state.jd <= m.tArr) {
    const leg = legAt(state.jd);
    phase = `Day ${Math.floor(d)}, heading to ${leg ? PLANET_BY_ID[leg.to].name : m.target.name}`;
  } else phase = m.ctx.arrivalType === 'flyby' ? `Day ${Math.floor(d)}, past ${m.target.name}` : `Day ${Math.floor(d)}, at ${m.target.name}`;
  $('mission-clock').textContent = phase;

  const rows = document.querySelectorAll('#timeline tr');
  let current = -1;
  m.timeline.forEach((e, i) => { if (state.jd >= e.jd - 0.5) current = i; });
  rows.forEach((row, i) => {
    row.classList.toggle('past', i < current);
    row.classList.toggle('now', i === current);
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
applyTargetDefaults('mars');
renderTransport();
renderFocusOptions();
renderScrubTicks();
requestAnimationFrame(frame);
runPlanner();
