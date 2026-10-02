// Three.js rendering of the solar system, routes and spacecraft.
// Simulation frame is heliocentric ecliptic (x, y in the ecliptic, z north);
// Three.js is y-up, so (x, y, z) maps to (x, z, -y).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { PLANETS, orbitPoints } from '../physics/ephemeris.js';

const AU_LINEAR = 10; // scene units per AU in true-scale mode

/** Remove a group's children, including the DOM elements of any CSS2D labels. */
function disposeGroup(g) {
  g.traverse((o) => {
    if (o.isCSS2DObject) o.element.remove();
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  g.clear();
}

export class SolarScene {
  constructor(container) {
    this.container = container;
    this.scaleMode = 'compressed';
    this.planetScale = 1;
    this.focusId = 'sun';
    this.onPick = null;

    const w = container.clientWidth, h = container.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x05070d, 1);
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(w, h);
    this.labelRenderer.domElement.className = 'label-layer';
    container.appendChild(this.labelRenderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.005, 20000);
    this.camera.position.set(0, 55, 70);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = 3000;
    this.prevTarget = new THREE.Vector3();

    this.scene.add(new THREE.AmbientLight(0x404a66, 0.35));
    const sunLight = new THREE.PointLight(0xfff1dc, 2.4, 0, 0);
    this.scene.add(sunLight);

    this._buildStars();
    this._buildSun();
    this._buildPlanets();
    this.orbitGroup = new THREE.Group();
    this.scene.add(this.orbitGroup);
    this.routeGroup = new THREE.Group();
    this.scene.add(this.routeGroup);
    this.nbodyGroup = new THREE.Group();
    this.scene.add(this.nbodyGroup);
    this.sandboxGroup = new THREE.Group();
    this.scene.add(this.sandboxGroup);
    this._buildCraft();

    this.raycaster = new THREE.Raycaster();
    this._bindPicking();
    window.addEventListener('resize', () => this.resize());
  }

  // ---------- Coordinate mapping ----------
  toScene(p, out = new THREE.Vector3()) {
    const r = Math.hypot(p[0], p[1], p[2]);
    let k;
    if (this.scaleMode === 'linear') k = AU_LINEAR;
    else k = r > 0 ? (9 * Math.pow(r, 0.5)) / r : 0; // compressed: radius ∝ √r
    return out.set(p[0] * k, p[2] * k, -p[1] * k);
  }

  // ---------- Builders ----------
  _buildStars() {
    const n = 4000;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u), R = 6000;
      pos.set([R * s * Math.cos(th), R * u, R * s * Math.sin(th)], i * 3);
      const t = Math.random();
      const b = 0.35 + Math.pow(Math.random(), 3) * 0.65;
      col.set([b * (0.85 + 0.15 * t), b * 0.9, b * (1.05 - 0.15 * t)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false });
    this.scene.add(new THREE.Points(g, m));
  }

  _glowTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, inner);
    grd.addColorStop(0.25, outer);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  _buildSun() {
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd58a }),
    );
    this.scene.add(this.sun);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._glowTexture('rgba(255,236,190,1)', 'rgba(255,170,60,0.35)'),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    glow.scale.setScalar(7);
    this.sunGlow = glow;
    this.scene.add(glow);
    this.sun.userData.pickId = 'sun';
    this.sunLabel = this._label('Sun', 'sun');
    this.sun.add(this.sunLabel);
  }

  _planetTexture(p) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    const base = new THREE.Color(p.color);
    g.fillStyle = `#${base.getHexString()}`;
    g.fillRect(0, 0, 256, 128);
    const banded = ['jupiter', 'saturn', 'uranus', 'neptune', 'venus'].includes(p.id);
    let seed = p.id.length * 97;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (banded) {
      const bands = p.id === 'jupiter' ? 18 : p.id === 'saturn' ? 14 : 8;
      for (let i = 0; i < bands; i++) {
        const y = (i / bands) * 128;
        const hgt = 128 / bands;
        const shade = (rnd() - 0.5) * (p.id === 'jupiter' ? 0.35 : 0.16);
        const col = base.clone().offsetHSL(0, 0, shade);
        g.fillStyle = `#${col.getHexString()}`;
        g.fillRect(0, y, 256, hgt * (0.6 + rnd() * 0.8));
      }
      if (p.id === 'jupiter') {
        g.fillStyle = 'rgba(190,90,60,0.85)';
        g.beginPath();
        g.ellipse(170, 80, 16, 8, 0, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      for (let i = 0; i < 260; i++) {
        const col = base.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.18);
        g.fillStyle = `#${col.getHexString()}`;
        g.globalAlpha = 0.6;
        g.beginPath();
        g.arc(rnd() * 256, rnd() * 128, 2 + rnd() * 10, 0, Math.PI * 2);
        g.fill();
      }
      if (p.id === 'earth') {
        g.globalAlpha = 0.9;
        g.fillStyle = '#3f7a46';
        for (let i = 0; i < 9; i++) {
          g.beginPath();
          g.ellipse(rnd() * 256, 25 + rnd() * 78, 12 + rnd() * 26, 7 + rnd() * 16, rnd() * 3, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#eef3f7';
        g.fillRect(0, 0, 256, 8);
        g.fillRect(0, 120, 256, 8);
      }
      g.globalAlpha = 1;
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  _label(text, pickId, cls = '') {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `body-label ${cls}`;
    el.textContent = text;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onPick && pickId) this.onPick(pickId);
    });
    const obj = new CSS2DObject(el);
    obj.center.set(-0.15, 1.2);
    return obj;
  }

  _buildPlanets() {
    this.planetMeshes = {};
    for (const p of PLANETS) {
      const grp = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 40, 20),
        new THREE.MeshStandardMaterial({ map: this._planetTexture(p), roughness: 0.95, metalness: 0 }),
      );
      mesh.userData.pickId = p.id;
      grp.add(mesh);
      if (p.rings) {
        const rc = document.createElement('canvas');
        rc.width = 256; rc.height = 4;
        const rg = rc.getContext('2d');
        const grd = rg.createLinearGradient(0, 0, 256, 0);
        grd.addColorStop(0, 'rgba(220,200,160,0)');
        grd.addColorStop(0.15, 'rgba(220,200,160,0.55)');
        grd.addColorStop(0.5, 'rgba(235,220,180,0.8)');
        grd.addColorStop(0.62, 'rgba(60,50,40,0.1)');
        grd.addColorStop(0.7, 'rgba(210,190,150,0.6)');
        grd.addColorStop(1, 'rgba(210,190,150,0)');
        rg.fillStyle = grd;
        rg.fillRect(0, 0, 256, 4);
        const tex = new THREE.CanvasTexture(rc);
        const geo = new THREE.RingGeometry(1.3, 2.3, 96, 1);
        // map texture radially
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const r = Math.hypot(pos.getX(i), pos.getY(i));
          uv.setXY(i, (r - 1.3) / 1.0, 0.5);
        }
        const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2 + 0.47;
        grp.add(ring);
      }
      const label = this._label(p.name, p.id);
      grp.add(label);
      this.scene.add(grp);
      this.planetMeshes[p.id] = { grp, mesh, label, planet: p };
    }
  }

  _buildCraft() {
    this.craft = new THREE.Group();
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._glowTexture('rgba(255,255,255,1)', 'rgba(255,190,90,0.6)'),
      sizeAttenuation: false, depthWrite: false, depthTest: false, transparent: true,
      blending: THREE.AdditiveBlending,
    }));
    spr.scale.setScalar(0.045);
    spr.renderOrder = 10;
    this.craft.add(spr);
    this.craftLabel = this._label('Spacecraft', 'craft', 'craft-label');
    this.craft.add(this.craftLabel);
    this.craft.visible = false;
    this.scene.add(this.craft);
  }

  // ---------- Orbits ----------
  rebuildOrbits(jd) {
    this.orbitJD = jd;
    this.orbitGroup.clear();
    const v = new THREE.Vector3();
    for (const p of PLANETS) {
      const pts = orbitPoints(p, jd, 360).map((q) => this.toScene(q, v).clone());
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const m = new THREE.LineBasicMaterial({ color: p.color, transparent: true, opacity: 0.32, depthWrite: false });
      this.orbitGroup.add(new THREE.LineLoop(g, m));
    }
  }

  // ---------- Routes ----------
  _line(points, color, width, opts = {}) {
    const flat = [];
    const v = new THREE.Vector3();
    for (const p of points) {
      this.toScene(p, v);
      flat.push(v.x, v.y, v.z);
    }
    const geo = new LineGeometry();
    geo.setPositions(flat);
    const mat = new LineMaterial({
      color, linewidth: width, transparent: true, opacity: opts.opacity ?? 1,
      dashed: !!opts.dashed, dashSize: opts.dashSize ?? 0.6, gapSize: opts.gapSize ?? 0.4,
      depthWrite: false, worldUnits: false,
    });
    mat.resolution.set(this.container.clientWidth, this.container.clientHeight);
    const line = new Line2(geo, mat);
    if (opts.dashed) line.computeLineDistances();
    line.renderOrder = opts.renderOrder ?? 2;
    return line;
  }

  /** Planned route: each leg drawn, plus a bright trail that grows as the craft flies. */
  setRoute(mission, nbody, sandbox) {
    for (const g of [this.routeGroup, this.nbodyGroup, this.sandboxGroup]) disposeGroup(g);
    this.trail = null;
    this.routeMission = mission;
    if (!mission) return;

    const S = mission.samples;
    const plannedOpacity = nbody ? 0.35 : 0.55;
    this.routeGroup.add(this._line(S.r, 0xf2a541, 2.2, { opacity: plannedOpacity }));

    const trailSrc = nbody && this.followNBody ? nbody.samples : S;
    this.trail = this._line(trailSrc.r, 0xffe2b0, 3.2, { renderOrder: 3 });
    this.trailSamples = trailSrc;
    this.trail.geometry.instanceCount = 0;
    this.routeGroup.add(this.trail);

    if (nbody) this.nbodyGroup.add(this._line(nbody.samples.r, 0x6fd3e8, 1.6, { dashed: true, opacity: 0.9, dashSize: 0.35, gapSize: 0.25 }));
    if (sandbox) this.sandboxGroup.add(this._line(sandbox.samples.r, 0xc493ff, 1.8, { opacity: 0.95 }));

    // Event markers: ghost of each planet where the encounter happens
    const v = new THREE.Vector3();
    const markers = [{ body: 'earth', jd: mission.tLaunch, text: `Launch · ${mission.fmt(mission.tLaunch)}` }];
    mission.maneuvers.filter((m) => m.id !== 'launch').forEach((m) => markers.push({ body: m.body, jd: m.jd, text: `${m.title} · ${mission.fmt(m.jd)}` }));
    for (const mk of markers) {
      const p = this.planetMeshes[mk.body].planet;
      const pos = this.toScene(mission.posOf(p, mk.jd), v).clone();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1, 1.07, 64),
        new THREE.MeshBasicMaterial({ color: 0xf2a541, side: THREE.DoubleSide, transparent: true, opacity: 0.75, depthWrite: false }),
      );
      ring.position.copy(pos);
      ring.userData.billboard = true;
      ring.userData.baseSize = p.displaySize * 1.7;
      this.routeGroup.add(ring);
    }
  }

  setTrailProgress(t) {
    if (!this.trail || !this.trailSamples) return;
    const T = this.trailSamples.t;
    let lo = 0, hi = T.length - 1;
    if (t <= T[0]) { this.trail.geometry.instanceCount = 0; return; }
    if (t >= T[hi]) { this.trail.geometry.instanceCount = hi; return; }
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
    this.trail.geometry.instanceCount = lo;
  }

  // ---------- Per-frame update ----------
  update(planetPositions, craftPos, craftText) {
    const v = new THREE.Vector3();
    const linear = this.scaleMode === 'linear';
    const sizeK = this.planetScale * (linear ? 0.45 : 1);
    this.sun.scale.setScalar((linear ? 0.7 : 1.1) * Math.max(0.6, this.planetScale * 0.8));
    this.sunGlow.scale.setScalar(this.sun.scale.x * 6.5);
    for (const p of PLANETS) {
      const o = this.planetMeshes[p.id];
      this.toScene(planetPositions[p.id], v);
      o.grp.position.copy(v);
      o.mesh.scale.setScalar(p.displaySize * sizeK);
      o.mesh.rotation.y += 0.002;
      if (o.grp.children.length > 2) o.grp.children[1].scale.setScalar(p.displaySize * sizeK);
    }
    if (craftPos) {
      this.craft.visible = true;
      this.toScene(craftPos, this.craft.position);
      this.craftLabel.element.textContent = craftText || 'Spacecraft';
    } else this.craft.visible = false;

    // Billboard event rings, sized like the planet they mark
    this.routeGroup.children.forEach((c) => {
      if (c.userData.billboard) {
        c.quaternion.copy(this.camera.quaternion);
        c.scale.setScalar(c.userData.baseSize * sizeK);
      }
    });

    // Follow the focused body
    const fp = this.focusPosition(planetPositions, craftPos);
    const delta = fp.clone().sub(this.controls.target);
    if (this._snap) {
      this.controls.target.add(delta);
      this.camera.position.add(delta);
      this._snap = false;
    } else {
      const step = delta.multiplyScalar(0.18);
      this.controls.target.add(step);
      this.camera.position.add(step);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  focusPosition(planetPositions, craftPos) {
    const v = new THREE.Vector3();
    if (this.focusId === 'craft' && craftPos) return this.toScene(craftPos, v);
    if (planetPositions[this.focusId]) return this.toScene(planetPositions[this.focusId], v);
    return v.set(0, 0, 0);
  }

  setFocus(id, zoom = true) {
    this.focusId = id;
    if (!zoom) return;
    const dist = id === 'sun' ? null : id === 'craft' ? 3 : Math.max(4, this.planetMeshes[id].planet.displaySize * this.planetScale * 16);
    if (dist) {
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      this.camera.position.copy(this.controls.target).add(dir.multiplyScalar(dist));
    }
  }

  frameSystem(radiusAU) {
    const r = this.toScene([radiusAU, 0, 0]).length();
    const dir = new THREE.Vector3(0, 0.75, 0.66).normalize();
    const narrow = Math.max(1, 1.3 / this.camera.aspect);
    this.camera.position.copy(this.controls.target).add(dir.multiplyScalar((r * 2.6 + 4) * narrow));
  }

  setLabelsVisible(on) {
    this.labelRenderer.domElement.style.display = on ? '' : 'none';
  }
  setOrbitsVisible(on) {
    this.orbitGroup.visible = on;
  }

  _bindPicking() {
    let down = null;
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const targets = [this.sun, ...Object.values(this.planetMeshes).map((o) => o.mesh)];
      const hit = this.raycaster.intersectObjects(targets, false)[0];
      if (hit && this.onPick) this.onPick(hit.object.userData.pickId);
    });
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    for (const g of [this.routeGroup, this.nbodyGroup, this.sandboxGroup]) {
      g.traverse((o) => { if (o.material?.resolution) o.material.resolution.set(w, h); });
    }
  }
}
