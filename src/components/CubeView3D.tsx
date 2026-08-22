/**
 * The interactive cube.
 *
 * Renders a facelet string as 26 cubies, orbits under drag, and animates a
 * move sequence by reparenting the turning layer onto a pivot, rotating the
 * pivot, then baking the result back — the standard approach, and the only one
 * that keeps the rendered cube and the facelet model from drifting apart.
 *
 * The cubie/facelet mapping below is derived from the same layer geometry the
 * engine uses, and is checked by `scripts/verify-cases.ts`.
 */

import { useEffect, useImperativeHandle, useRef, forwardRef, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { applyAlg, parseAlg, type Facelets, type ParsedMove } from '../cube/engine.ts'
import { FACE_NORMALS, faceletIndex, MOVE_LAYERS } from '../cube/layout.ts'
import { anchorFor, buildArrow, type CubeArrow } from './cubeArrows.ts'

const FACE_COLORS: Record<string, number> = {
  U: 0xf2d024,
  D: 0xececec,
  F: 0x16a75b,
  B: 0x1e6fd9,
  R: 0xd93526,
  L: 0xe8761b,
  // A facelet the drill deliberately hides. Grey, not black: unknown, not off.
  '?': 0xb9bfc5,
}

const BODY_COLOR = 0x0a0d0f
const CUBIE_SIZE = 0.94
const STICKER_SIZE = 0.8
const STICKER_RADIUS = 0.1
const STICKER_OFFSET = 0.481

/** A rounded square, so stickers read as vinyl on plastic rather than as flat quads. */
function stickerGeometry(): THREE.ShapeGeometry {
  const half = STICKER_SIZE / 2
  const r = STICKER_RADIUS
  const shape = new THREE.Shape()
  shape.moveTo(-half + r, -half)
  shape.lineTo(half - r, -half)
  shape.quadraticCurveTo(half, -half, half, -half + r)
  shape.lineTo(half, half - r)
  shape.quadraticCurveTo(half, half, half - r, half)
  shape.lineTo(-half + r, half)
  shape.quadraticCurveTo(-half, half, -half, half - r)
  shape.lineTo(-half, -half + r)
  shape.quadraticCurveTo(-half, -half, -half + r, -half)
  return new THREE.ShapeGeometry(shape, 8)
}

export interface CubeHandle {
  /** Play a move sequence, resolving once the last move settles. */
  play(alg: string, msPerMove?: number): Promise<void>
  /** Jump straight to a state with no animation. */
  set(facelets: Facelets): void
  /** Return the camera to the drill's canonical viewing angle. */
  resetView(): void
}

export interface CubeView3DProps {
  facelets: Facelets
  /** Quarter turns of camera azimuth — a viewing angle, never a cube move. */
  viewTurns?: number
  /** Dim every facelet except the last layer, to focus the eye. */
  focusLastLayer?: boolean
  /**
   * Facelets to spotlight — the pieces currently being tracked. Everything else
   * drops right back, because the whole point of tracking is to follow two
   * pieces and ignore the other twenty-four.
   */
  highlight?: number[]
  /** Movement arcs drawn over the last layer. */
  arrows?: CubeArrow[]
  /**
   * How much of the frame the cube fills. 1 means "exactly fits"; higher is
   * closer. The camera distance itself is computed from the viewport's aspect
   * ratio, because a fixed distance either crops on a short viewport or leaves
   * the cube tiny on a wide one.
   */
  zoom?: number
  interactive?: boolean
  className?: string
  /** Called once the scene is ready, so callers can gate their reveal. */
  onReady?: () => void
}

interface CubieRecord {
  mesh: THREE.Group
  home: THREE.Vector3
  stickers: Map<number, THREE.Mesh>
}

export const CubeView3D = forwardRef<CubeHandle, CubeView3DProps>(function CubeView3D(
  {
    facelets,
    viewTurns = 0,
    focusLastLayer = false,
    highlight,
    arrows,
    zoom = 0.7,
    interactive = true,
    className,
    onReady,
  },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const cubeRef = useRef<THREE.Group | null>(null)
  const cubiesRef = useRef<CubieRecord[]>([])
  const stateRef = useRef<Facelets>(facelets)
  const animatingRef = useRef(false)

  const highlightRef = useRef<Set<number> | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const viewTurnsRef = useRef(viewTurns)
  viewTurnsRef.current = viewTurns
  const fitRef = useRef<() => void>(() => {})
  const arrowGroupRef = useRef<THREE.Group | null>(null)

  /**
   * Half-height of the cube's silhouette from the standard three-quarter view.
   * A 3-unit cube seen down its body diagonal projects to a hexagon of about
   * this circumradius; using the bounding sphere (2.60) instead would leave a
   * visibly loose frame.
   */
  const SILHOUETTE = 2.16

  /** Paint every sticker from a facelet string. */
  const paint = useCallback((state: Facelets, focus: boolean) => {
    const tracked = highlightRef.current
    for (const cubie of cubiesRef.current) {
      for (const [index, mesh] of cubie.stickers) {
        const char = state[index] ?? '?'
        const material = mesh.material as THREE.MeshLambertMaterial
        material.color.setHex(FACE_COLORS[char] ?? FACE_COLORS['?'])

        let opacity = 1
        if (tracked && tracked.size > 0) {
          // Tracking overrides focus: the tracked pieces are the subject and
          // everything else is context, last layer or not.
          opacity = tracked.has(index) ? 1 : 0.14
        } else if (focus) {
          const isLastLayer =
            index < 9 || [9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47].includes(index)
          opacity = isLastLayer ? 1 : 0.22
        }
        material.opacity = opacity
        material.transparent = opacity < 1
      }
    }
  }, [])

  // --- Scene setup, once ---------------------------------------------------
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(3.6, 3.4, 4.6)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      // No WebGL. The 2D diagram elsewhere in the interface carries the case,
      // so failing quietly here is better than taking the drill down.
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'
    // setSize(w, h, false) updates the drawing buffer but deliberately leaves
    // the CSS box alone, so the canvas would otherwise lay out at its attribute
    // size and grow its own container. Pin the CSS size to the box instead.
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'

    scene.add(new THREE.AmbientLight(0xffffff, 2.1))
    const key = new THREE.DirectionalLight(0xffffff, 1.1)
    key.position.set(4, 7, 6)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xbcd0dd, 0.5)
    fill.position.set(-5, -2, -4)
    scene.add(fill)

    const cube = new THREE.Group()
    scene.add(cube)

    // Arrows live with the cube so they stay registered to it while orbiting.
    const arrowGroup = new THREE.Group()
    cube.add(arrowGroup)
    arrowGroupRef.current = arrowGroup

    const bodyGeometry = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE)
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: BODY_COLOR })
    const stickerGeo = stickerGeometry()

    const cubies: CubieRecord[] = []
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue
          const group = new THREE.Group()
          group.position.set(x, y, z)
          group.add(new THREE.Mesh(bodyGeometry, bodyMaterial))

          const stickers = new Map<number, THREE.Mesh>()
          for (const { face, axis, sign } of FACE_NORMALS) {
            const coord = axis === 'x' ? x : axis === 'y' ? y : z
            if (coord !== sign) continue
            const index = faceletIndex(face, x, y, z)
            const mesh = new THREE.Mesh(
              stickerGeo,
              new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
            )
            if (axis === 'x') {
              mesh.position.x = STICKER_OFFSET * sign
              mesh.rotation.y = (Math.PI / 2) * sign
            } else if (axis === 'y') {
              mesh.position.y = STICKER_OFFSET * sign
              mesh.rotation.x = (-Math.PI / 2) * sign
            } else {
              mesh.position.z = STICKER_OFFSET * sign
              if (sign === -1) mesh.rotation.y = Math.PI
            }
            group.add(mesh)
            stickers.set(index, mesh)
          }

          cube.add(group)
          cubies.push({ mesh: group, home: new THREE.Vector3(x, y, z), stickers })
        }
      }
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableZoom = true
    controls.minDistance = 3.4
    controls.maxDistance = 9
    controls.enableDamping = true
    controls.dampingFactor = 0.09
    controls.rotateSpeed = 0.75
    controls.target.set(0, 0, 0)

    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer
    controlsRef.current = controls
    cubeRef.current = cube
    cubiesRef.current = cubies

    const resize = () => {
      const { clientWidth, clientHeight } = mount
      if (clientWidth === 0 || clientHeight === 0) return
      renderer.setSize(clientWidth, clientHeight, false)
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
      fitRef.current()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(mount)

    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      controls.update()
      renderer.render(scene, camera)
    }
    tick()

    onReady?.()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      bodyGeometry.dispose()
      bodyMaterial.dispose()
      stickerGeo.dispose()
      for (const cubie of cubies) {
        for (const mesh of cubie.stickers.values()) {
          ;(mesh.material as THREE.Material).dispose()
        }
      }
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
    // Scene construction is one-time; prop changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Movement arcs --------------------------------------------------------
  useEffect(() => {
    const group = arrowGroupRef.current
    if (!group) return

    // Rebuild from scratch: there are at most eight, and reconciling them would
    // cost more than it saves.
    for (const child of [...group.children]) {
      group.remove(child)
      child.traverse((node) => {
        const mesh = node as THREE.Mesh
        mesh.geometry?.dispose?.()
        const material = mesh.material as THREE.Material | undefined
        material?.dispose?.()
      })
    }

    if (!arrows || arrows.length === 0) return

    // Collapse mutual swaps into a single two-headed arc.
    const drawn = new Set<string>()
    for (const arrow of arrows) {
      if (arrow.from === arrow.to) continue
      const key = `${arrow.kind}:${Math.min(arrow.from, arrow.to)}-${Math.max(arrow.from, arrow.to)}`
      const mutual = arrows.some(
        (other) => other.kind === arrow.kind && other.from === arrow.to && other.to === arrow.from,
      )
      if (mutual && drawn.has(key)) continue
      drawn.add(key)

      group.add(
        buildArrow(
          anchorFor(arrow.kind, arrow.from),
          anchorFor(arrow.kind, arrow.to),
          arrow.emphasis ? 0xffb020 : 0xe8e4d9,
          mutual,
          arrow.emphasis ? 1 : 0.42,
        ),
      )
    }
  }, [arrows])

  // --- Repaint on state change --------------------------------------------
  useEffect(() => {
    highlightRef.current = highlight && highlight.length > 0 ? new Set(highlight) : null
    stateRef.current = facelets
    if (!animatingRef.current) paint(facelets, focusLastLayer)
  }, [facelets, focusLastLayer, highlight, paint])

  // --- Viewing angle and framing -------------------------------------------
  const fit = useCallback(() => {
    const controls = controlsRef.current
    const camera = cameraRef.current
    if (!controls || !camera) return

    // Distance that makes the silhouette exactly fill the tighter of the two
    // frustum dimensions, then scaled by the solver's zoom.
    const vFov = (camera.fov * Math.PI) / 180
    const needVertical = SILHOUETTE / Math.tan(vFov / 2)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
    const needHorizontal = SILHOUETTE / Math.tan(hFov / 2)
    const radius = Math.max(needVertical, needHorizontal) / Math.max(zoomRef.current, 0.4)

    const azimuth = Math.PI / 4 + (viewTurnsRef.current * Math.PI) / 2
    const elevation = 0.62
    camera.position.set(
      radius * Math.cos(elevation) * Math.sin(azimuth),
      radius * Math.sin(elevation),
      radius * Math.cos(elevation) * Math.cos(azimuth),
    )
    camera.lookAt(0, 0, 0)
    controls.update()
  }, [])

  fitRef.current = fit

  useEffect(() => {
    fit()
  }, [viewTurns, zoom, fit])

  // --- Interactivity toggle ------------------------------------------------
  useEffect(() => {
    if (controlsRef.current) controlsRef.current.enabled = interactive
  }, [interactive])

  /** Rotate one layer, then bake the result back onto the cube group. */
  const turn = useCallback((move: ParsedMove, ms: number): Promise<void> => {
    const cube = cubeRef.current
    if (!cube) return Promise.resolve()
    const spec = MOVE_LAYERS[move.base]
    if (!spec) return Promise.resolve()

    return new Promise((resolve) => {
      const pivot = new THREE.Group()
      cube.add(pivot)

      const moving = cubiesRef.current.filter((c) => {
        const coord = Math.round(
          spec.axis === 'x' ? c.mesh.position.x : spec.axis === 'y' ? c.mesh.position.y : c.mesh.position.z,
        )
        return spec.layers.includes(coord)
      })
      for (const c of moving) pivot.attach(c.mesh)

      const target = (Math.PI / 2) * move.amount * spec.direction
      const start = performance.now()
      const duration = Math.max(ms, 1)

      const step = (now: number) => {
        const t = Math.min((now - start) / duration, 1)
        // Ease out with a slight settle — the way a well-tensioned cube stops.
        const eased = 1 - Math.pow(1 - t, 3)
        pivot.rotation[spec.axis] = target * eased
        if (t < 1) {
          requestAnimationFrame(step)
          return
        }
        pivot.rotation[spec.axis] = target
        pivot.updateMatrixWorld(true)
        for (const c of moving) {
          cube.attach(c.mesh)
          // Snap back onto the integer lattice so rounding never accumulates.
          c.mesh.position.set(
            Math.round(c.mesh.position.x),
            Math.round(c.mesh.position.y),
            Math.round(c.mesh.position.z),
          )
        }
        cube.remove(pivot)
        resolve()
      }
      requestAnimationFrame(step)
    })
  }, [])

  useImperativeHandle(
    ref,
    (): CubeHandle => ({
      async play(alg: string, msPerMove = 190) {
        if (animatingRef.current) return
        let moves: ParsedMove[]
        try {
          moves = parseAlg(alg)
        } catch {
          return
        }
        animatingRef.current = true
        try {
          for (const move of moves) {
            await turn(move, msPerMove)
            // Keep the model in step with the render, move by move.
            stateRef.current = applyAlg(stateRef.current, [move])
            paint(stateRef.current, false)
          }
        } finally {
          animatingRef.current = false
        }
      },
      set(next: Facelets) {
        animatingRef.current = false
        stateRef.current = next
        // Return every cubie to its home position; the state string is truth.
        for (const cubie of cubiesRef.current) {
          cubie.mesh.position.copy(cubie.home)
          cubie.mesh.rotation.set(0, 0, 0)
        }
        paint(next, focusLastLayer)
      },
      /*
       * Back to the angle the algorithm is executed from.
       *
       * Not `controls.reset()`: OrbitControls saves its state at construction,
       * which is the placeholder position the camera held before `fit` ever
       * ran, so resetting to it restored the wrong distance and the wrong
       * framing. `fit` recomputes the canonical view from the viewport, which
       * is the only definition of "straight on" this app has.
       */
      resetView() {
        fitRef.current?.()
      },
    }),
    [turn, paint, focusLastLayer],
  )

  return <div ref={mountRef} className={className} aria-hidden="true" />
})
