export const POINTER_RING_OMEGA = 8
export const POINTER_RING_ZETA = 1.1
export const POINTER_RING_MAX_DT = 1 / 30
export const POINTER_RING_MAX_ERROR = 220
export const POINTER_RING_SETTLE = 0.2

const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function mediaMatches(matchMedia, query) {
    try {
        return Boolean(matchMedia(query)?.matches)
    } catch {
        return false
    }
}

export function stepSpringPoint(point, targetX, targetY, dt, {
    stiffness,
    damping,
    maxError = Infinity,
    maxDt = POINTER_RING_MAX_DT,
} = {}) {
    const clamped = Math.min(Math.max(dt, 0), maxDt)
    let dx = targetX - point.x
    let dy = targetY - point.y
    const dist = Math.hypot(dx, dy)

    if (dist > maxError && dist > 0) {
        const scale = maxError / dist
        dx *= scale
        dy *= scale
    }

    const ax = dx * stiffness - point.vx * damping
    const ay = dy * stiffness - point.vy * damping
    point.vx += ax * clamped
    point.vy += ay * clamped
    point.x += point.vx * clamped
    point.y += point.vy * clamped

    return point
}

export function isSettledPoint(point, targetX, targetY, epsilon = POINTER_RING_SETTLE) {
    return Math.abs(targetX - point.x) < epsilon
        && Math.abs(targetY - point.y) < epsilon
        && Math.abs(point.vx) < epsilon
        && Math.abs(point.vy) < epsilon
}

export function createPointerRingMotion({
    omega = POINTER_RING_OMEGA,
    zeta = POINTER_RING_ZETA,
    maxError = Infinity,
} = {}) {
    const point = { x: 0, y: 0, vx: 0, vy: 0 }
    let seeded = false
    const spring = {
        stiffness: omega * omega,
        damping: 2 * zeta * omega,
        maxError,
        maxDt: POINTER_RING_MAX_DT,
    }

    function seed(px, py) {
        point.x = px
        point.y = py
        point.vx = 0
        point.vy = 0
        seeded = true
    }

    function step(targetX, targetY, dt) {
        if (!seeded) {
            seed(targetX, targetY)
            return { x: point.x, y: point.y }
        }

        stepSpringPoint(point, targetX, targetY, dt, spring)

        return { x: point.x, y: point.y }
    }

    function isSettled(targetX, targetY) {
        return isSettledPoint(point, targetX, targetY)
    }

    return {
        seed,
        step,
        isSettled,
        get isSeeded() {
            return seeded
        },
        get position() {
            return { x: point.x, y: point.y }
        },
    }
}

function applyTransform(ring, x, y) {
    ring.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
}

function localPoint(stage, event) {
    const rect = stage.getBoundingClientRect()

    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
    }
}

export function mosaicPointerAllowed(stage, target) {
    if (!(target instanceof Node)) {
        return true
    }

    const row = stage.querySelector('[data-lead-mosaic-row]')
    const mosaicWindow = stage.querySelector('[data-lead-mosaic-window]')

    if (!row || !mosaicWindow) {
        return true
    }

    return !row.contains(target) || mosaicWindow.contains(target)
}

function ringMetrics(ring) {
    return {
        radius: ring.offsetWidth / 2,
        stroke: 1,
    }
}

export function bootPointerRing(root = document, {
    matchMedia = (query) => window.matchMedia(query),
    onPosition = () => {},
    onIdle = () => {},
    onLeave = () => {},
    onStrike = () => {},
} = {}) {
    const stage = root.querySelector('[data-home-pointer-stage]')
    const ring = stage?.querySelector('[data-home-pointer-ring]')
    if (!(stage instanceof HTMLElement) || !(ring instanceof HTMLElement)) {
        return () => {}
    }

    if (mediaMatches(matchMedia, REDUCED_MOTION_QUERY) || !mediaMatches(matchMedia, FINE_POINTER_QUERY)) {
        return () => {}
    }

    const motion = createPointerRingMotion()
    let targetX = 0
    let targetY = 0
    let raf = 0
    let lastTime = 0
    let running = false

    function reportPointer(x, y) {
        const { radius, stroke } = ringMetrics(ring)
        onPosition(x, y, radius, stroke)
    }

    function stopLoop() {
        if (raf) {
            window.cancelAnimationFrame(raf)
        }

        running = false
        raf = 0
        lastTime = 0
    }

    function tick(time) {
        const dt = lastTime === 0 ? 1 / 60 : (time - lastTime) / 1000
        lastTime = time
        const { x, y } = motion.step(targetX, targetY, dt)
        applyTransform(ring, x, y)

        if (motion.isSettled(targetX, targetY)) {
            stopLoop()
            onIdle()
            return
        }

        raf = window.requestAnimationFrame(tick)
    }

    function startLoop() {
        if (running) {
            return
        }

        running = true
        lastTime = 0
        raf = window.requestAnimationFrame(tick)
    }

    function follow(event) {
        if (event.pointerType === 'touch') {
            return
        }

        if (!mosaicPointerAllowed(stage, event.target)) {
            return
        }

        const point = localPoint(stage, event)
        targetX = point.x
        targetY = point.y
        ring.classList.add('is-visible')
        reportPointer(point.x, point.y)

        if (!motion.isSeeded) {
            motion.seed(targetX, targetY)
            applyTransform(ring, targetX, targetY)
            return
        }

        startLoop()
    }

    function onPointerEnter(event) {
        if (event.pointerType === 'touch') {
            return
        }

        const point = localPoint(stage, event)
        targetX = point.x
        targetY = point.y
        ring.classList.add('is-visible')
        reportPointer(point.x, point.y)

        if (!motion.isSeeded) {
            motion.seed(targetX, targetY)
            applyTransform(ring, targetX, targetY)
            return
        }

        startLoop()
    }

    function onPointerLeave() {
        ring.classList.remove('is-visible')
        stopLoop()
        onLeave()
    }

    function onPointerDown(event) {
        if (event.pointerType === 'touch' || event.button !== 0) {
            return
        }

        if (!mosaicPointerAllowed(stage, event.target)) {
            return
        }

        const point = localPoint(stage, event)
        onStrike(point.x, point.y)
    }

    const surface = root instanceof Document ? root : document
    const edge = surface.documentElement

    edge.addEventListener('pointerenter', onPointerEnter)
    surface.addEventListener('pointermove', follow, { passive: true })
    edge.addEventListener('pointerleave', onPointerLeave)
    surface.addEventListener('pointerdown', onPointerDown)

    return function destroy() {
        edge.removeEventListener('pointerenter', onPointerEnter)
        surface.removeEventListener('pointermove', follow)
        edge.removeEventListener('pointerleave', onPointerLeave)
        surface.removeEventListener('pointerdown', onPointerDown)
        stopLoop()
        ring.classList.remove('is-visible')
    }
}
