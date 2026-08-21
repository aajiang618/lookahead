/**
 * Where each facelet lives in space.
 *
 * The renderer needs to know which facelet index belongs to which sticker of
 * which cubie, and which cubies a move turns in which direction. Both are easy
 * to get subtly wrong — a flipped sign renders a cube that turns the wrong way
 * while the model underneath stays right, which is the hardest kind of bug to
 * see. So both live here, and `scripts/verify-cases.ts` derives the facelet
 * permutation of every move purely from this geometry and checks it against the
 * engine's own tables.
 */

export type Axis = 'x' | 'y' | 'z'

/**
 * Facelet index for the sticker of cubie (x, y, z) facing outward on `face`.
 * Rows and columns follow the net drawn in `engine.ts`: U row 0 is the back
 * row, D row 0 is the front row, and B is drawn as seen through the cube.
 */
export function faceletIndex(face: string, x: number, y: number, z: number): number {
  switch (face) {
    case 'U':
      return 0 + (z + 1) * 3 + (x + 1)
    case 'R':
      return 9 + (1 - y) * 3 + (1 - z)
    case 'F':
      return 18 + (1 - y) * 3 + (x + 1)
    case 'D':
      return 27 + (1 - z) * 3 + (x + 1)
    case 'L':
      return 36 + (1 - y) * 3 + (z + 1)
    case 'B':
      return 45 + (1 - y) * 3 + (1 - x)
    default:
      return -1
  }
}

export interface FaceNormal {
  face: string
  axis: Axis
  sign: 1 | -1
}

export const FACE_NORMALS: FaceNormal[] = [
  { face: 'U', axis: 'y', sign: 1 },
  { face: 'D', axis: 'y', sign: -1 },
  { face: 'F', axis: 'z', sign: 1 },
  { face: 'B', axis: 'z', sign: -1 },
  { face: 'R', axis: 'x', sign: 1 },
  { face: 'L', axis: 'x', sign: -1 },
]

export interface MoveLayer {
  axis: Axis
  /** Which slabs along `axis` turn: 1 outer positive, 0 middle, -1 outer negative. */
  layers: number[]
  /**
   * Sign of the rotation in the renderer's right-handed frame. A face turn is
   * clockwise as seen from OUTSIDE that face, which is a negative rotation
   * about a positive axis and a positive one about a negative axis.
   */
  direction: 1 | -1
}

export const MOVE_LAYERS: Record<string, MoveLayer> = {
  U: { axis: 'y', layers: [1], direction: -1 },
  D: { axis: 'y', layers: [-1], direction: 1 },
  R: { axis: 'x', layers: [1], direction: -1 },
  L: { axis: 'x', layers: [-1], direction: 1 },
  F: { axis: 'z', layers: [1], direction: -1 },
  B: { axis: 'z', layers: [-1], direction: 1 },
  // Slices follow their neighbouring outer face: M with L, E with D, S with F.
  M: { axis: 'x', layers: [0], direction: 1 },
  E: { axis: 'y', layers: [0], direction: 1 },
  S: { axis: 'z', layers: [0], direction: -1 },
  // Wide turns: the outer slab and the middle together.
  r: { axis: 'x', layers: [1, 0], direction: -1 },
  l: { axis: 'x', layers: [-1, 0], direction: 1 },
  u: { axis: 'y', layers: [1, 0], direction: -1 },
  d: { axis: 'y', layers: [-1, 0], direction: 1 },
  f: { axis: 'z', layers: [1, 0], direction: -1 },
  b: { axis: 'z', layers: [-1, 0], direction: 1 },
  // Rotations: every slab at once.
  x: { axis: 'x', layers: [1, 0, -1], direction: -1 },
  y: { axis: 'y', layers: [1, 0, -1], direction: -1 },
  z: { axis: 'z', layers: [1, 0, -1], direction: -1 },
}

export type Vec3 = [number, number, number]

/** Rotate a lattice point a quarter turn at a time about `axis`. */
export function rotateVec(v: Vec3, axis: Axis, quarterTurns: number): Vec3 {
  let [x, y, z] = v
  const turns = ((quarterTurns % 4) + 4) % 4
  for (let i = 0; i < turns; i++) {
    if (axis === 'x') [y, z] = [-z, y]
    else if (axis === 'y') [x, z] = [z, -x]
    else [x, y] = [-y, x]
  }
  return [x, y, z]
}

/**
 * The facelet permutation a move produces, derived purely from cubie geometry.
 * Returns `perm` where `perm[destination] = source`, matching the engine's
 * convention, so the two can be compared directly.
 */
export function permutationFromGeometry(base: string, amount: number): number[] {
  const spec = MOVE_LAYERS[base]
  if (!spec) throw new Error(`No layer geometry for "${base}"`)
  const perm = Array.from({ length: 54 }, (_, i) => i)
  const quarterTurns = amount * spec.direction

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const coord = spec.axis === 'x' ? x : spec.axis === 'y' ? y : z
        if (!spec.layers.includes(coord)) continue

        const [nx, ny, nz] = rotateVec([x, y, z], spec.axis, quarterTurns)
        for (const { face, axis, sign } of FACE_NORMALS) {
          const outward = axis === 'x' ? x : axis === 'y' ? y : z
          if (outward !== sign) continue

          const source = faceletIndex(face, x, y, z)
          // Where does this sticker's outward normal point after the turn?
          const normal: Vec3 = [
            axis === 'x' ? sign : 0,
            axis === 'y' ? sign : 0,
            axis === 'z' ? sign : 0,
          ]
          const [mx, my, mz] = rotateVec(normal, spec.axis, quarterTurns)
          const landed = FACE_NORMALS.find(
            (n) =>
              (n.axis === 'x' ? mx : n.axis === 'y' ? my : mz) === n.sign &&
              Math.abs(n.axis === 'x' ? mx : n.axis === 'y' ? my : mz) === 1,
          )
          if (!landed) continue
          const destination = faceletIndex(landed.face, nx, ny, nz)
          perm[destination] = source
        }
      }
    }
  }
  return perm
}
