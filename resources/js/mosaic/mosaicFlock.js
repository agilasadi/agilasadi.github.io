import { TARGET_CELL_SIZE } from './leadMosaicAlign.js'
import {
    POINTER_RING_MAX_DT,
    POINTER_RING_MAX_ERROR,
    POINTER_RING_SETTLE,
    POINTER_RING_ZETA,
    isSettledPoint,
    stepSpringPoint,
} from './pointerRing.js'

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
export const IDLE_WANDER_COUNT = 3
export const IDLE_WANDER_MS = 1000
export const FORMED_CELL_SLACK = 2.5
export const FLOCK_OMEGA = 5
export const PULL_DECAY_S = 0.6
export const PULL_EPSILON = 0.5
export const PULL_STRETCH_PER_PX = 0.004
export const PULL_STRETCH_MAX = 0.25
export const SPRING_SCALE_MIN = 0.97
export const SPRING_SCALE_MAX = 1.03
export const LOOSE_FRACTION = 0.03
export const LOOSE_SPRING_SCALE = 0.8
export const LOOSE_ZETA = 0.8
export const LOOSE_KICK = 3
export const INTEREST_MIN_S = 2
export const INTEREST_MAX_S = 5
export const INTEREST_MAX_DT = 0.1
export const INTEREST_RADIUS_RATIO = 1.25
export const REACH_RATIO = 3
export const RECRUIT_SPEED = 900
export const CORE_EXPONENT = 0.7
export const APPEAR_SPREAD_S = 1.4
export const RUSH_DELAY_MAX_S = 0.3
export const RUSH_OMEGA = 11
export const RUSH_ZETA = 1
export const RUSH_VANISH_PX = 10
export const RUSH_MAX_S = 3

export const FLOCK_BASE_CELL_SIZE = 16
export const FLOCK_COUNT_MULTIPLIER = 6

export function diskPlateCount(radius, cell = TARGET_CELL_SIZE) {
    if (!(radius > 0) || !(cell > 0)) {
        return 1
    }

    return Math.max(
        1,
        Math.round(Math.PI * (radius / FLOCK_BASE_CELL_SIZE) ** 2 * FLOCK_COUNT_MULTIPLIER),
    )
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
    const r = radius * ((index + 0.5) / count) ** CORE_EXPONENT

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
    omega = FLOCK_OMEGA,
    zeta = POINTER_RING_ZETA,
    maxError = POINTER_RING_MAX_ERROR,
    random = Math.random,
} = {}) {
    const springFor = (scale, damp = zeta) => ({
        stiffness: (omega * scale) ** 2,
        damping: 2 * damp * omega * scale,
        maxError,
        maxDt: POINTER_RING_MAX_DT,
    })

    const rushSpring = springFor(RUSH_OMEGA / omega, RUSH_ZETA)

    let particles = []
    let power = 'off'
    let clock = 0
    let sinkX = 0
    let sinkY = 0
    let pullX = 0
    let pullY = 0
    let lastFollowX = 0
    let lastFollowY = 0
    let cols = 0
    let rows = 0
    let cell = TARGET_CELL_SIZE
    let firstRow = 0
    let radius = 0
    let followX = 0
    let followY = 0
    let following = false
    let formed = false
    const deadCells = new Map()

    function interestLimit() {
        return INTEREST_MIN_S + random() * (INTEREST_MAX_S - INTEREST_MIN_S)
    }

    function resetInterest() {
        for (const particle of particles) {
            particle.mode = 'idle'
            particle.held = 0
            particle.wait = 0
            particle.limit = interestLimit()
        }
    }

    function updateInterest(particle, dt) {
        const step = Math.min(Math.max(dt, 0), INTEREST_MAX_DT)
        const reach = radius * REACH_RATIO

        if (particle.mode === 'idle') {
            const away = Math.hypot(particle.x - followX, particle.y - followY)

            if (away < reach) {
                particle.mode = 'chasing'
                particle.held = 0
                particle.wait = away / RECRUIT_SPEED
                particle.limit = interestLimit()
                return true
            }

            return false
        }

        if (particle.mode === 'bored') {
            if (Math.hypot(particle.homeX - followX, particle.homeY - followY) > reach) {
                particle.mode = 'idle'
            }

            return false
        }

        if (particle.wait > 0) {
            particle.wait -= step

            return true
        }

        const inside = Math.hypot(particle.x - followX, particle.y - followY)
            < radius * INTEREST_RADIUS_RATIO

        if (!inside) {
            particle.held = 0

            return false
        }

        particle.held += step

        if (particle.held >= particle.limit) {
            particle.mode = 'bored'

            return false
        }

        return true
    }

    function spawn(count) {
        const homes = scatterCellIndices(count, cols, rows, firstRow, random)
        particles = homes.map((index, slot) => {
            const center = cellCenter(index, cols, cell)
            const loose = random() < LOOSE_FRACTION
            const springScale = loose
                ? LOOSE_SPRING_SCALE
                : SPRING_SCALE_MIN + random() * (SPRING_SCALE_MAX - SPRING_SCALE_MIN)

            return {
                x: center.x,
                y: center.y,
                vx: 0,
                vy: 0,
                homeX: center.x,
                homeY: center.y,
                homeIndex: index,
                slot,
                loose,
                dead: false,
                phase: power === 'on' ? 'shown' : 'hidden',
                delay: 0,
                mode: 'idle',
                held: 0,
                wait: 0,
                limit: interestLimit(),
                spring: springFor(springScale, loose ? LOOSE_ZETA : zeta),
            }
        })
        following = false
        formed = false
        deadCells.clear()
    }

    function retargetHomes() {
        for (const particle of particles) {
            const center = cellCenter(particle.homeIndex, cols, cell)
            particle.homeX = center.x
            particle.homeY = center.y
        }
    }

    function targetOf(particle) {
        if (!following || particle.mode !== 'chasing' || particle.wait > 0) {
            return { x: particle.homeX, y: particle.homeY }
        }

        const slot = vogelOffset(particle.slot, particles.length, radius)
        const pull = Math.hypot(pullX, pullY)

        if (pull < PULL_EPSILON) {
            return { x: followX + slot.x, y: followY + slot.y }
        }

        const dirX = pullX / pull
        const dirY = pullY / pull
        const stretch = Math.min(PULL_STRETCH_MAX, pull * PULL_STRETCH_PER_PX)
        const along = slot.x * dirX + slot.y * dirY
        const perpX = slot.x - along * dirX
        const perpY = slot.y - along * dirY
        const squeeze = 1 / Math.sqrt(1 + stretch)

        return {
            x: followX + dirX * along * (1 + stretch) + perpX * squeeze,
            y: followY + dirY * along * (1 + stretch) + perpY * squeeze,
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
        if (power !== 'on') {
            return
        }

        const wasFollowing = following

        if (wasFollowing) {
            const dx = x - lastFollowX
            const dy = y - lastFollowY
            const moved = Math.hypot(dx, dy)
            pullX += dx
            pullY += dy

            if (moved > 0) {
                for (const particle of particles) {
                    if (particle.loose && !particle.dead && particle.mode === 'chasing') {
                        particle.vx += (random() - 0.5) * moved * LOOSE_KICK
                        particle.vy += (random() - 0.5) * moved * LOOSE_KICK
                    }
                }
            }
        }

        lastFollowX = x
        lastFollowY = y
        followX = x
        followY = y
        following = true

        if (nextRadius > 0) {
            radius = nextRadius
        }

        if (!wasFollowing) {
            formed = false
            resetInterest()
        }
    }

    function disperse() {
        following = false
        formed = false
        pullX = 0
        pullY = 0
    }

    function pickSettledIdle(count) {
        const settled = []

        for (const particle of particles) {
            if (!particle.dead && particle.phase === 'shown'
                && isSettledPoint(particle, particle.homeX, particle.homeY)) {
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
        if (power !== 'on' || following || particles.length === 0) {
            return 0
        }

        const movers = pickSettledIdle(count)
        const used = new Set(particles.map((particle) => particle.homeIndex))

        for (const index of deadCells.keys()) {
            used.add(index)
        }

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
        if (particles.length === 0 || power === 'off') {
            return false
        }

        clock += Math.min(Math.max(dt, 0), INTEREST_MAX_DT)

        let moving = false
        let near = 0
        const slack = cell * FORMED_CELL_SLACK

        if (pullX !== 0 || pullY !== 0) {
            const decay = Math.exp(-Math.min(Math.max(dt, 0), POINTER_RING_MAX_DT) / PULL_DECAY_S)
            pullX *= decay
            pullY *= decay

            if (Math.hypot(pullX, pullY) < PULL_EPSILON) {
                pullX = 0
                pullY = 0
            } else {
                moving = true
            }
        }

        for (const particle of particles) {
            if (particle.dead) {
                continue
            }

            if (particle.phase === 'hidden') {
                if (power !== 'on') {
                    continue
                }

                if (clock < particle.delay) {
                    moving = true
                    continue
                }

                particle.phase = 'shown'
            }

            if (particle.phase === 'rushing') {
                if (clock < particle.delay) {
                    moving = true
                    continue
                }

                stepSpringPoint(particle, sinkX, sinkY, dt, rushSpring)

                if (Math.hypot(particle.x - sinkX, particle.y - sinkY) < RUSH_VANISH_PX
                    || clock > RUSH_DELAY_MAX_S + RUSH_MAX_S) {
                    particle.phase = 'hidden'
                    particle.vx = 0
                    particle.vy = 0
                } else {
                    moving = true
                }

                continue
            }

            if (following && updateInterest(particle, dt)) {
                moving = true
            }

            const target = targetOf(particle)
            stepSpringPoint(particle, target.x, target.y, dt, particle.spring)

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

        if (power === 'closing' && !moving) {
            power = 'off'
        }

        return moving
    }

    function occupiedCells(cellIndexAt) {
        const cells = new Set()

        for (const particle of particles) {
            if (particle.dead || particle.phase === 'hidden') {
                continue
            }

            const index = cellIndexAt(particle.x, particle.y, cols, rows, cell)

            if (index >= 0) {
                cells.add(index)
            }
        }

        return cells
    }

    function centroid() {
        let x = 0
        let y = 0
        let alive = 0

        for (const particle of particles) {
            if (particle.dead || particle.phase === 'hidden') {
                continue
            }

            x += particle.x
            y += particle.y
            alive += 1
        }

        if (alive === 0) {
            return { x: followX, y: followY }
        }

        return {
            x: x / alive,
            y: y / alive,
        }
    }

    function enable(instant = false) {
        if (power === 'on') {
            return
        }

        power = 'on'
        clock = 0
        spawn(particles.length > 0 ? particles.length : diskPlateCount(radius, cell))

        for (const particle of particles) {
            particle.phase = instant ? 'shown' : 'hidden'
            particle.delay = instant ? 0 : random() * APPEAR_SPREAD_S
        }
    }

    function disable(x, y, instant = false) {
        if (power === 'off') {
            return
        }

        following = false
        formed = false
        pullX = 0
        pullY = 0

        if (instant) {
            for (const particle of particles) {
                particle.phase = 'hidden'
            }

            power = 'off'

            return
        }

        power = 'closing'
        clock = 0
        sinkX = x
        sinkY = y

        for (const particle of particles) {
            if (particle.phase === 'shown') {
                particle.phase = 'rushing'
                particle.delay = random() * RUSH_DELAY_MAX_S
            }
        }
    }

    function toggleAt(index, cellIndexAt) {
        if (power !== 'on') {
            return null
        }

        const buried = deadCells.get(index)

        if (buried) {
            const center = cellCenter(index, cols, cell)

            for (const particle of buried) {
                particle.dead = false
                particle.x = center.x
                particle.y = center.y
                particle.vx = 0
                particle.vy = 0
                particle.homeIndex = index
                particle.homeX = center.x
                particle.homeY = center.y
                particle.mode = 'idle'
                particle.held = 0
                particle.wait = 0
            }

            deadCells.delete(index)

            return 'revived'
        }

        const hits = particles.filter((particle) => (
            !particle.dead && particle.phase === 'shown'
            && cellIndexAt(particle.x, particle.y, cols, rows, cell) === index
        ))

        if (hits.length === 0) {
            return null
        }

        for (const particle of hits) {
            particle.dead = true
            particle.vx = 0
            particle.vy = 0
        }

        deadCells.set(index, hits)

        return 'killed'
    }

    return {
        sync,
        follow,
        disperse,
        wander,
        step,
        occupiedCells,
        centroid,
        toggleAt,
        enable,
        disable,
        get power() {
            return power
        },
        get dead() {
            return deadCells
        },
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
