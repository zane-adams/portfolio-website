import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'

const FONT_URL = '/fonts/helvetiker_bold.typeface.json'

/**
 * extruded 3d name. dark solid faces, bright edge lines, slow parallax
 * that follows the pointer. falls back to flat html type if webgl or the
 * font is unavailable.
 */
export default function NameCanvas({ text }) {
  const mountRef = useRef(null)
  const [status, setStatus] = useState('loading') // loading | ready | failed

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch (err) {
      setStatus('failed')
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight, false)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(0, 0, 10)

    scene.add(new THREE.AmbientLight(0xffffff, 1.1))

    const key = new THREE.DirectionalLight(0xffffff, 2.4)
    key.position.set(3, 4, 6)
    scene.add(key)

    const rim = new THREE.PointLight(0xa8c3d6, 60, 40)
    rim.position.set(-5, -2, 4)
    scene.add(rim)

    const group = new THREE.Group()
    scene.add(group)

    const faceMaterial = new THREE.MeshStandardMaterial({
      color: 0x16161a,
      roughness: 0.45,
      metalness: 0.25,
    })
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xedeae4,
      transparent: true,
      opacity: 0.9,
    })

    let font = null
    let layout = null // 'one-line' | 'two-line'
    let frame = 0
    let visible = true
    const pointer = { x: 0, y: 0 }
    const rotation = { x: 0, y: 0 }

    function clearGroup() {
      group.traverse((child) => {
        if (child.geometry) child.geometry.dispose()
      })
      group.clear()
    }

    function buildText(mode) {
      clearGroup()
      const lines = mode === 'two-line' ? text.split(' ') : [text]
      const size = 1
      const lineHeight = size * 1.18

      lines.forEach((line, i) => {
        const geometry = new TextGeometry(line, {
          font,
          size,
          depth: size * 0.22,
          curveSegments: 8,
          bevelEnabled: false,
        })
        geometry.computeBoundingBox()
        const box = geometry.boundingBox
        geometry.translate(
          -(box.max.x + box.min.x) / 2,
          -(box.max.y + box.min.y) / 2 - i * lineHeight,
          -size * 0.11
        )

        const mesh = new THREE.Mesh(geometry, faceMaterial)
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry, 20),
          edgeMaterial
        )
        group.add(mesh, edges)
      })

      // recenter vertically for multi-line
      const bounds = new THREE.Box3().setFromObject(group)
      const center = bounds.getCenter(new THREE.Vector3())
      group.children.forEach((child) => child.position.sub(center))

      fitToView()
    }

    function fitToView() {
      const bounds = new THREE.Box3().setFromObject(group)
      const size = bounds.getSize(new THREE.Vector3())
      if (!size.x || !size.y) return

      const visibleHeight =
        2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z
      const visibleWidth = visibleHeight * camera.aspect

      group.scale.setScalar(
        Math.min((visibleWidth * 0.7) / size.x, (visibleHeight * 0.6) / size.y)
      )
    }

    function resize() {
      const w = mount.clientWidth
      const h = mount.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()

      const nextLayout = w < 700 ? 'two-line' : 'one-line'
      if (font && nextLayout !== layout) {
        layout = nextLayout
        buildText(layout)
      } else if (font) {
        fitToView()
      }
    }

    function onPointerMove(event) {
      if (reduceMotion) return
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1
    }

    function render(time) {
      frame = requestAnimationFrame(render)
      if (!visible) return

      const drift = reduceMotion ? 0 : Math.sin(time / 4200) * 0.06
      rotation.y += (pointer.x * 0.34 + drift - rotation.y) * 0.05
      rotation.x += (-pointer.y * 0.2 - rotation.x) * 0.05
      group.rotation.y = rotation.y
      group.rotation.x = rotation.x

      renderer.render(scene, camera)
    }

    const loader = new FontLoader()
    loader.load(
      FONT_URL,
      (loaded) => {
        font = loaded
        layout = mount.clientWidth < 700 ? 'two-line' : 'one-line'
        buildText(layout)
        setStatus('ready')
      },
      undefined,
      () => setStatus('failed')
    )

    resize()
    frame = requestAnimationFrame(render)

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
      },
      { threshold: 0 }
    )
    observer.observe(mount)

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(mount)
    window.addEventListener('pointermove', onPointerMove)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      clearGroup()
      faceMaterial.dispose()
      edgeMaterial.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [text])

  return (
    <div className="name-stage">
      <div ref={mountRef} className="name-canvas" aria-hidden="true" />
      <h1 className={status === 'ready' ? 'name-fallback is-hidden' : 'name-fallback'}>
        {text}
      </h1>
    </div>
  )
}
