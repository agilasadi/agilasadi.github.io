import { TARGET_CELL_SIZE } from './leadMosaicAlign.js'
import {
    POINTER_RING_MAX_DT,
    POINTER_RING_MAX_ERROR,
    POINTER_RING_OMEGA,
    POINTER_RING_SETTLE,
    POINTER_RING_ZETA,
    isSettledPoint,
    stepSpringPoint,
} from './pointerRing.js'

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
export const IDLE_WANDER_COUNT = 3
export const IDLE_WANDER_MS = 1000
export const FORMED_CELL_SLACK = 2.5

export function diskPlateCount(radius, cell = TARGET_CELL_SIZE) {
    if (!(radius > 0) || !(cell > 0)) {
        return 1
    }

    return Math.max(1, Math.round(Math.PI * (radius / cell) ** 2))
}

export function cellCenter(index, cols, cell = TARGET_CELL_SIZE) {
    const col = index % cols
    const row = Math.floor(index / cols)

    return {
        x: col * cell + cell / 2,
        y: row * cell + cell / 2,
    }
}

export function scatterCellIndices(count, cols, rows, firstRow = 0, random = Math.random) {
    const row0 = Math.min(Math.max(0, firstRow), Math.max(0, rows - 1))
    const available = Math.max(0, cols * (rows - row0))
    const n = Math.min(Math.max(0, count), available)

    if (n === 0 || cols <= 0 || rows <= 0) {
        return []
    }

    if (n === available) {
        const all = []

        for (let row = row0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
                all.push(row * cols + col)
            }
        }

        return all
    }

    if (n > available * 0.35) {
        const all = []

        for (let row = row0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
                all.push(row * cols + col)
            }
        }

        for (let i = 0; i < n; i += 1) {
            const j = i + Math.floor(random() * (all.length - i))
            const swap = all[i]
            all[i] = all[j]
            all[j] = swap
        }

        return all.slice(0, n)
    }

    const picks = new Set()

    while (picks.size < n) {
        const row = row0 + Math.floor(random() * (rows - row0))
        const col = Math.floor(random() * cols)
        picks.add(row * cols + col)
    }

    return [...picks]
}

export function vogelOffset(index, count, radius) {
    if (!(count > 0) || !(radius > 0)) {
        return { x: 0, y: 0 }
    }

    const angle = index * GOLDEN_ANGLE
    const r = radius * Math.sqrt((index + 0.5) / count)

    return {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
    }
}

function pickFreeCell(cols, rows, firstRow, used, random) {
    const row0 = Math.min(Math.max(0, firstRow), Math.max(0, rows - 1))
    let next = -1

    for (let attempt = 0; attempt < 48; attempt += 1) {
        const row = row0 + Math.floor(random() * Math.max(1, rows - row0))
        const col = Math.floor(random() * cols)
        const index = row * cols + col

        if (!used.has(index)) {
            return index
        }

        next = index
    }

    return next
}

export function createMosaicFlock({
    omega = POINTER_RING_OMEGA,
    zeta = POINTER_RING_ZETA,
    maxError = POINTER_RING_MAX_ERROR,
    random = Math.random,
} = {}) {
    const stiffness = omega * omega
    const damping = 2 * zeta * omega
    const spring = { stiffness, damping, maxError, maxDt: POINTER_RING_MAX_DT }

    let particles = []
    let cols = 0
    let rows = 0
    let cell = TARGET_CELL_SIZE
    let firstRow = 0
    let radius = 0
    let followX = 0
    let followY = 0
    let following = false
    let formed = false

    function spawn(count) {
        const homes = scatterCellIndices(count, cols, rows, firstRow, random)
        particles = homes.map((index, slot) => {
            const center = cellCenter(index, cols, cell)

            return {
                x: center.x,
                y: center.y,
                vx: 0,
                vy: 0,
                homeX: center.x,
                homeY: center.y,
                homeIndex: index,
                slot,
            }
        })
        following = false
        formed = false
    }

    function retargetHomes() {
        for (const particle of particles) {
            const center = cellCenter(particle.homeIndex, cols, cell)
            particle.homeX = center.x
            particle.homeY = center.y
        }
    }

    function targetOf(particle) {
        if (!following) {
            return { x: particle.homeX, y: particle.homeY }
        }

        const slot = vogelOffset(particle.slot, particles.length, radius)

        return {
            x: followX + slot.x,
            y: followY + slot.y,
        }
    }

    function sync(next) {
        const nextCount = diskPlateCount(next.radius, next.cell)
        const gridChanged = next.cols !== cols || next.rows !== rows
        const countChanged = nextCount !== particles.length
        cols = next.cols
        rows = next.rows
        cell = next.cell
        firstRow = next.firstRow
        radius = next.radius

        if (gridChanged || countChanged || particles.length === 0) {
            spawn(nextCount)
            return
        }

        retargetHomes()
    }

    function follow(x, y, nextRadius) {
        const wasFollowing = following
        followX = x
        followY = y
        following = true

        if (nextRadius > 0) {
            radius = nextRadius
        }

        if (!wasFollowing) {
            formed = false
        }
    }

    function disperse() {
        following = false
        formed = false
    }

    function pickSettledIdle(count) {
        const settled = []

        for (const particle of particles) {
            if (isSettledPoint(particle, particle.homeX, particle.homeY)) {
                settled.push(particle)
            }
        }

        const n = Math.min(count, settled.length)

        for (let i = 0; i < n; i += 1) {
            const j = i + Math.floor(random() * (settled.length - i))
            const swap = settled[i]
            settled[i] = settled[j]
            settled[j] = swap
        }

        return settled.slice(0, n)
    }

    function wander(count = IDLE_WANDER_COUNT) {
        if (following || particles.length === 0) {
            return 0
        }

        const movers = pickSettledIdle(count)
        const used = new Set(particles.map((particle) => particle.homeIndex))
        let changed = 0

        for (const particle of movers) {
            used.delete(particle.homeIndex)
            const next = pickFreeCell(cols, rows, firstRow, used, random)

            if (next < 0 || next === particle.homeIndex) {
                used.add(particle.homeIndex)
                continue
            }

            used.add(next)
            particle.homeIndex = next
            const center = cellCenter(next, cols, cell)
            particle.homeX = center.x
            particle.homeY = center.y
            changed += 1
        }

        return changed
    }

    function step(dt) {
        if (particles.length === 0) {
            return false
        }

        let moving = false
        let near = 0
        const slack = cell * FORMED_CELL_SLACK

        for (const particle of particles) {
            const target = targetOf(particle)
            stepSpringPoint(particle, target.x, target.y, dt, spring)

            if (!isSettledPoint(particle, target.x, target.y, POINTER_RING_SETTLE)) {
                moving = true
            }

            if (Math.hypot(particle.x - target.x, particle.y - target.y) < slack) {
                near += 1
            }
        }

        if (following && near / particles.length >= 0.85) {
            formed = true
        }

        return moving
    }

    function occupiedCells(cellIndexAt) {
        const cells = new Set()

        for (const particle of particles) {
            const index = cellIndexAt(particle.x, particle.y, cols, rows, cell)

            if (index >= 0) {
                cells.add(index)
            }
        }

        return cells
    }

    function centroid() {
        if (particles.length === 0) {
            return { x: followX, y: followY }
        }

        let x = 0
        let y = 0

        for (const particle of particles) {
            x += particle.x
            y += particle.y
        }

        return {
            x: x / particles.length,
            y: y / particles.length,
        }
    }

    return {
        sync,
        follow,
        disperse,
        wander,
        step,
        occupiedCells,
        centroid,
        get following() {
            return following
        },
        get formed() {
            return formed
        },
        get radius() {
            return radius
        },
        get size() {
            return particles.length
        },
        get homes() {
            return particles.map((particle) => particle.homeIndex)
        },
    }
}
