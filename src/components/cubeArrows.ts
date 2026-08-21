/**
 * Movement arcs drawn over the last layer.
 *
 * Kept free of React so the geometry can be built and checked outside a
 * browser — three.js constructs meshes perfectly well without a WebGL context,
 * and an arrow pointing at the wrong slot is not something the eye reliably
 * catches on a curved arc.
 */

import * as THREE from 'three'

/** Slot centres on the last layer, in cube coordinates. */
export const CORNER_ANCHORS: Array<[number, number]> = [
  [-1, -1], // UBL
  [1, -1], // UBR
  [1, 1], // UFR
  [-1, 1], // UFL
]
export const EDGE_ANCHORS: Array<[number, number]> = [
  [0, -1], // UB
  [1, 0], // UR
  [0, 1], // UF
  [-1, 0], // UL
]

/** Height the arcs float at, clear of the stickers at y = 1.48. */
export const ARROW_BASE_Y = 1.66

export interface CubeArrow {
  kind: 'corner' | 'edge'
  from: number
  to: number
  /** Draw in the caution colour rather than muted ink. */
  emphasis?: boolean
  /** A mutual swap: one arc with a head at each end. */
  both?: boolean
}

export function anchorFor(kind: 'corner' | 'edge', slot: number): THREE.Vector3 {
  const [x, z] = (kind === 'corner' ? CORNER_ANCHORS : EDGE_ANCHORS)[slot]
  return new THREE.Vector3(x, ARROW_BASE_Y, z)
}

/**
 * One arc between two last-layer slots, with a cone head at the far end (or at
 * both ends for a swap). The arc rises with its own length so a long diagonal
 * clears the cube instead of grazing it.
 */
export function buildArrow(
  from: THREE.Vector3,
  to: THREE.Vector3,
  colour: number,
  doubleHeaded: boolean,
  opacity: number,
): THREE.Group {
  const group = new THREE.Group()
  const span = from.distanceTo(to)
  const lift = 0.42 + span * 0.3

  // Pull the ends back so the heads sit clear of the slot centres.
  const inset = 0.18
  const a = from.clone().lerp(to, inset / span)
  const b = to.clone().lerp(from, inset / span)
  const control = a.clone().add(b).multiplyScalar(0.5).setY(ARROW_BASE_Y + lift)
  const curve = new THREE.QuadraticBezierCurve3(a, control, b)

  const material = new THREE.MeshBasicMaterial({
    color: colour,
    transparent: opacity < 1,
    opacity,
    depthTest: false,
  })
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.032, 8, false), material)
  tube.renderOrder = 10
  group.add(tube)

  const head = (at: number, towards: number) => {
    const point = curve.getPoint(at)
    const dir = curve.getPoint(towards).sub(point).normalize()
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.2, 12), material)
    cone.position.copy(point)
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    cone.renderOrder = 10
    group.add(cone)
  }
  head(1, 0.9)
  if (doubleHeaded) head(0, 0.1)

  return group
}
