import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'

const FONT_URL = '/fonts/helvetiker_bold.typeface.json'
const GAP = 0.5

const REST = new THREE.Color(0x7d7a75)
const ACTIVE = new THREE.Color(0xa8c3d6)

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smooth = (v) => v * v * (3 - 2 * v)
const lerp = (a, b, t) => a + (b - a) * t

/**
 * extruded 3d nav words on a fixed, full-viewport canvas. they sit in the
 * hero slot at rest and fly to the dock slot in the top-right as the page
 * scrolls. the canvas only turns on pointer events while a word is hovered,
 * so it never blocks the page underneath.
 */
export default function NavCanvas({ items, heroSlotRef, dockSlotRef, onStatus }) {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    const heroSlot = heroSlotRef.current
    const dockSlot = dockSlotRef.current
    if (!mount || !heroSlot || !dockSlot) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch (err) {
      onStatus('failed')
      return
    }

    const canvas = renderer.domElement
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    canvas.style.pointerEvents = 'none'
    mount.appendChild(canvas)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(0, 0, 10)

    scene.add(new THREE.AmbientLight(0xffffff, 0.9))
    const key = new THREE.DirectionalLight(0xffffff, 1.5)
    key.position.set(2, 3, 6)
    scene.add(key)

    const root = new THREE.Group()
    const row = new THREE.Group()
    root.add(row)
    scene.add(root)

    const words = []
    const targets = []
    let naturalWidth = 1
    let unit = 1 // world units per css pixel
    let vw = window.innerWidth
    let vh = window.innerHeight
    let progress = 0
    let placed = false
    let hovered = null
    let ready = false
    let frame = 0

    const pointer = new THREE.Vector2(-2, -2)
    const raycaster = new THREE.Raycaster()

    function buildWords(font) {
      let cursor = 0
      let capHeight = 0

      items.forEach((item) => {
        const geometry = new TextGeometry(item.label, {
          font,
          size: 1,
          depth: 0.2,
          curveSegments: 6,
          bevelEnabled: false,
        })
        geometry.computeBoundingBox()
        const box = geometry.boundingBox
        const width = box.max.x - box.min.x
        capHeight = Math.max(capHeight, box.max.y)
        geometry.translate(-(box.max.x + box.min.x) / 2, 0, -0.1)

        const face = new THREE.MeshStandardMaterial({
          color: REST.clone(),
          roughness: 0.5,
          metalness: 0.15,
        })
        const mesh = new THREE.Mesh(geometry, face)

        const edgeMaterial = new THREE.LineBasicMaterial({
          color: 0xedeae4,
          transparent: true,
          opacity: 0.18,
        })
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edgeMaterial)

        const ruleMaterial = new THREE.MeshBasicMaterial({
          color: ACTIVE.clone(),
          transparent: true,
          opacity: 0,
        })
        const rule = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.055), ruleMaterial)
        rule.position.set(0, -0.32, 0.12)
        rule.scale.x = 0.001

        const group = new THREE.Group()
        group.position.x = cursor + width / 2
        group.add(mesh, edges, rule)
        row.add(group)

        // the hit plane stays on the row so hovering, which tilts the word,
        // can't shift the target out from under the pointer
        const hit = new THREE.Mesh(
          new THREE.PlaneGeometry(width + GAP * 0.7, 1.6),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
        )
        hit.position.set(cursor + width / 2, 0.32, 0.6)
        row.add(hit)

        const word = {
          id: item.id,
          group,
          face,
          edgeMaterial,
          ruleMaterial,
          rule,
          hover: 0,
          target: 0,
          press: 0,
        }
        hit.userData.word = word
        words.push(word)
        targets.push(hit)

        cursor += width + GAP
      })

      naturalWidth = Math.max(cursor - GAP, 0.001)
      row.position.set(-naturalWidth / 2, -capHeight / 2, 0)
    }

    function resize() {
      vw = window.innerWidth
      vh = window.innerHeight
      renderer.setSize(vw, vh, false)
      camera.aspect = vw / vh
      camera.updateProjectionMatrix()
      const visibleHeight =
        2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z
      unit = visibleHeight / vh
    }

    function place() {
      const dockAt = Math.max(vh * 0.42, 1)
      const wanted = smooth(clamp01(window.scrollY / dockAt))
      // land in the right place on a mid-page reload instead of flying in
      progress = placed ? progress + (wanted - progress) * (reduceMotion ? 1 : 0.16) : wanted
      placed = true

      const from = heroSlot.getBoundingClientRect()
      const to = dockSlot.getBoundingClientRect()

      const widthPx = lerp(from.width, to.width, progress)
      const cx = lerp(from.left + from.width / 2, to.left + to.width / 2, progress)
      const cy = lerp(from.top + from.height / 2, to.top + to.height / 2, progress)

      root.scale.setScalar((widthPx * unit) / naturalWidth)
      root.position.set((cx - vw / 2) * unit, (vh / 2 - cy) * unit, 0)

      const tilt = reduceMotion ? 0 : (1 - progress) * 0.14
      root.rotation.y += (pointer.x * tilt - root.rotation.y) * 0.06
      root.rotation.x += (-pointer.y * tilt * 0.5 - root.rotation.x) * 0.06
    }

    function pick() {
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(targets, false)[0]
      const next = hit ? hit.object.userData.word : null
      if (next === hovered) return

      hovered = next
      words.forEach((word) => {
        word.target = word === hovered ? 1 : 0
      })
      canvas.style.pointerEvents = hovered ? 'auto' : 'none'
      canvas.style.cursor = hovered ? 'pointer' : 'default'
    }

    function render() {
      frame = requestAnimationFrame(render)
      if (!ready) return

      place()
      root.updateMatrixWorld(true)
      pick()

      words.forEach((word) => {
        word.hover += (word.target - word.hover) * (reduceMotion ? 1 : 0.16)
        word.press *= 0.88

        word.group.position.z = word.hover * 0.5 - word.press * 0.4
        word.group.rotation.x = -word.hover * 0.22 + word.press * 0.34
        word.face.color.copy(REST).lerp(ACTIVE, clamp01(word.hover + word.press))
        word.edgeMaterial.opacity = 0.18 + word.hover * 0.4
        word.rule.scale.x = Math.max(word.hover, 0.001)
        word.ruleMaterial.opacity = word.hover * 0.9
      })

      renderer.render(scene, camera)
    }

    function onPointerMove(event) {
      pointer.x = (event.clientX / vw) * 2 - 1
      pointer.y = -(event.clientY / vh) * 2 + 1
    }

    function onPointerUp(event) {
      if (event.pointerType !== 'mouse') pointer.set(-2, -2)
    }

    function onPointerLeave() {
      pointer.set(-2, -2)
    }

    function onClick(event) {
      if (!ready) return
      // re-pick from the click itself so a tap works without a hover pass first
      onPointerMove(event)
      root.updateMatrixWorld(true)
      pick()
      if (!hovered) return

      event.preventDefault()
      event.stopPropagation()
      hovered.press = 1
      const section = document.getElementById(hovered.id)
      if (section) {
        section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
      }
    }

    const loader = new FontLoader()
    loader.load(
      FONT_URL,
      (font) => {
        buildWords(font)
        ready = true
        onStatus('ready')
      },
      undefined,
      () => onStatus('failed')
    )

    resize()
    frame = requestAnimationFrame(render)

    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerdown', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('click', onClick, true)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('click', onClick, true)

      root.traverse((child) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
      })
      renderer.dispose()
      if (canvas.parentNode === mount) mount.removeChild(canvas)
    }
  }, [items])

  return <div ref={mountRef} className="nav-canvas" aria-hidden="true" />
}
