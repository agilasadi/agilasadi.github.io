import {
    CELL_GAP,
    TARGET_CELL_SIZE,
    mosaicLayoutForStage,
    mosaicClipTop,
    mosaicFirstVisibleRow,
} from './leadMosaicAlign.js'
import { createMosaicFlock, IDLE_WANDER_COUNT, IDLE_WANDER_MS } from './mosaicFlock.js'

export { CELL_GAP, TARGET_CELL_SIZE }
export const CELL_SIZE = TARGET_CELL_SIZE
export const RING_OUTER_PLATES = 2
export const RING_MID_PLATES = 4
export const PLATFORM_LIFT = 4
export const STRIKE_FADE_MS = 2800
export const ACCENT_RGB = [232, 220, 208]
export const PAGE_BG_RGB = [11, 15, 18]
export const TONE_DELTAS = [-1, 0, 1, 2, 3]
export const GUTTER_DELTA = -6

export function mosaicPalette(bg = PAGE_BG_RGB) {
    const base = Array.isArray(bg) && bg.length >= 3
        ? bg.slice(0, 3).map((n) => Math.min(255, Math.max(0, n)))
        : PAGE_BG_RGB.slice()

    return {
        gutter: base.map((c) => Math.min(255, Math.max(0, c + GUTTER_DELTA))),
        tones: TONE_DELTAS.map((delta) => base.map((c) => Math.min(255, Math.max(0, c + delta)))),
    }
}

function pickToneIndex() {
    const roll = Math.random()

    if (roll < 0.5) {
        return 2
    }

    if (roll < 0.72) {
        return 1
    }

    if (roll < 0.88) {
        return 3
    }

    if (roll < 0.95) {
        return 0
    }

    return 4
}

function fillCells(cols, rows) {
    const cells = new Uint8Array(cols * rows)

    for (let i = 0; i < cells.length; i += 1) {
        cells[i] = pickToneIndex()
    }

    return cells
}

function fillRgbFromTones(indices, rgb, tones) {
    for (let i = 0; i < indices.length; i += 1) {
        const [r, g, b] = tones[indices[i]]
        rgb[i * 3] = r
        rgb[i * 3 + 1] = g
        rgb[i * 3 + 2] = b
    }
}

function cellBounds(col, row, cell) {
    const x0 = col * cell
    const y0 = row * cell

    return {
        x0,
        y0,
        x1: x0 + cell,
        y1: y0 + cell,
    }
}

function cellMinDist(col, row, cx, cy, cell) {
    const { x0, y0, x1, y1 } = cellBounds(col, row, cell)
    const nearestX = Math.max(x0, Math.min(cx, x1))
    const nearestY = Math.max(y0, Math.min(cy, y1))

    return Math.hypot(cx - nearestX, cy - nearestY)
}

function cellIntersectsDisk(col, row, cx, cy, radius, cell) {
    return cellMinDist(col, row, cx, cy, cell) <= radius
}

export function collectDiskCells(cols, rows, cx, cy, radius, cell = TARGET_CELL_SIZE) {
    const pad = radius + cell
    const col0 = Math.max(0, Math.floor((cx - pad) / cell))
    const col1 = Math.min(cols - 1, Math.floor((cx + pad) / cell))
    const row0 = Math.max(0, Math.floor((cy - pad) / cell))
    const row1 = Math.min(rows - 1, Math.floor((cy + pad) / cell))
    const hits = []

    for (let row = row0; row <= row1; row += 1) {
        for (let col = col0; col <= col1; col += 1) {
            if (cellIntersectsDisk(col, row, cx, cy, radius, cell)) {
                hits.push(row * cols + col)
            }
        }
    }

    return hits
}

function diskCellSet(cols, rows, cx, cy, radius, cell) {
    if (!(radius > 0)) {
        return new Set()
    }

    return new Set(collectDiskCells(cols, rows, cx, cy, radius, cell))
}

export function collectPointerDiskLayers(cols, rows, cx, cy, radius, cell = TARGET_CELL_SIZE) {
    const midRadius = radius - RING_OUTER_PLATES * cell
    const fillRadius = radius - (RING_OUTER_PLATES + RING_MID_PLATES) * cell
    const mass = collectDiskCells(cols, rows, cx, cy, radius, cell)
    const inner = diskCellSet(cols, rows, cx, cy, midRadius, cell)
    const fill = diskCellSet(cols, rows, cx, cy, fillRadius, cell)
    const outer = []
    const mid = []
    const interior = []

    for (const index of mass) {
        if (fill.has(index)) {
            interior.push(index)
        } else if (inner.has(index)) {
            mid.push(index)
        } else {
            outer.push(index)
        }
    }

    return { outer, mid, interior }
}

export function cellIndexAt(x, y, cols, rows, cell = TARGET_CELL_SIZE) {
    const col = Math.floor(x / cell)
    const row = Math.floor(y / cell)

    if (col < 0 || row < 0 || col >= cols || row >= rows) {
        return -1
    }

    return row * cols + col
}

export function strikeStrength(elapsedMs, durationMs = STRIKE_FADE_MS) {
    if (elapsedMs <= 0) {
        return 1
    }

    if (elapsedMs >= durationMs) {
        return 0
    }

    const remain = 1 - elapsedMs / durationMs

    return remain * remain
}

export function mixRgb(from, to, t) {
    const amount = Math.min(1, Math.max(0, t))

    return [
        from[0] + (to[0] - from[0]) * amount,
        from[1] + (to[1] - from[1]) * amount,
        from[2] + (to[2] - from[2]) * amount,
    ]
}

export function parseRgbChannels(value, fallback = ACCENT_RGB) {
    const parts = String(value)
        .trim()
        .split(/[\s,/]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n))

    if (parts.length >= 3) {
        return parts.slice(0, 3)
    }

    return fallback
}

function readCssRgb(property, fallback) {
    try {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(property)

        return parseRgbChannels(raw, fallback)
    } catch {
        return fallback
    }
}

function readAccentRgb() {
    return readCssRgb('--ui-accent', ACCENT_RGB)
}

function readPageBgRgb() {
    return readCssRgb('--ui-bg', PAGE_BG_RGB)
}

function restRgb(display, index) {
    return [
        display[index * 3],
        display[index * 3 + 1],
        display[index * 3 + 2],
    ]
}

function rgbCss(rgb) {
    return `rgb(${Math.round(rgb[0])} ${Math.round(rgb[1])} ${Math.round(rgb[2])})`
}

export function plateRect(col, row, cell, lift = 0) {
    return {
        x: col * cell,
        y: row * cell - lift,
        size: cell - CELL_GAP,
    }
}

function paintFace(ctx, rgb, col, row, highlight, cell, lift = 0, bevel = true, shade = null) {
    const { x, y, size } = plateRect(col, row, cell, lift)
    ctx.fillStyle = rgbCss(rgb)
    ctx.fillRect(x, y, size, size)

    if (bevel) {
        ctx.fillStyle = rgbCss(highlight)
        ctx.fillRect(x, y, size, 1)
    }

    if (shade) {
        ctx.fillStyle = rgbCss(shade)
        ctx.fillRect(x, y + size - 1, size, 1)
    }
}

function paintDisplay(ctx, display, cols, rows, glows, now, accent, palette, cell, platform, clipTop = 0) {
    ctx.fillStyle = rgbCss(palette.gutter)
    ctx.fillRect(0, 0, cols * cell, rows * cell)

    const firstRow = mosaicFirstVisibleRow(clipTop, cell)
    const pageBg = palette.tones[1]
    const firstPlateY = firstRow * cell

    if (firstPlateY > 0) {
        ctx.fillStyle = rgbCss(pageBg)
        ctx.fillRect(0, 0, cols * cell, firstPlateY)
    }

    const highlight = palette.tones[palette.tones.length - 1]
    const lifted = []

    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const index = row * cols + col
            const glowT = glowStrengthAt(glows, index, now)
            const rgb = mixRgb(restRgb(display, index), accent, glowT)

            if (platform.has(index)) {
                lifted.push({ col, row, rgb })
                continue
            }

            paintFace(ctx, rgb, col, row, highlight, cell)
        }
    }

    for (const plate of lifted) {
        paintFace(
            ctx,
            plate.rgb,
            plate.col,
            plate.row,
            highlight,
            cell,
            PLATFORM_LIFT,
            true,
            palette.gutter,
        )
    }
}

function glowStrengthAt(glows, index, now) {
    const startedAt = glows.get(index)

    if (startedAt == null) {
        return 0
    }

    return strikeStrength(now - startedAt)
}

function toGridPoint(x, y, originX, originY) {
    return {
        x: x - originX,
        y: y - originY,
    }
}

function readRingRadius(stage) {
    const ring = stage.querySelector('[data-home-pointer-ring]')

    if (ring instanceof HTMLElement && ring.offsetWidth > 0) {
        return ring.offsetWidth / 2
    }

    const vmax = Math.max(window.innerWidth || 0, window.innerHeight || 0)

    return 0.09 * vmax
}

function prefersReducedMotion() {
    try {
        return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches)
    } catch {
        return false
    }
}

export function bootPointerTexture(root = document) {
    const stage = root.querySelector('[data-home-pointer-stage]')
    const canvas = stage?.querySelector('[data-home-pointer-texture]')
    const idle = {
        applyRingBorder() {},
        gather() {},
        disperse() {},
        restoreColors() {},
        rest() {},
        strike() {},
        clearBorderVisits() {},
        destroy() {},
    }

    if (!(stage instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
        return idle
    }

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) {
        return idle
    }

    let cells = new Uint8Array(0)
    let display = new Float32Array(0)
    let cols = 0
    let rows = 0
    let cell = TARGET_CELL_SIZE
    let originX = 0
    let originY = 0
    let platform = new Set()
    const glows = new Map()
    const flock = createMosaicFlock()
    const reduceMotion = prefersReducedMotion()
    let raf = 0
    let lastTime = 0
    let idleTimer = 0
    let lastGather = null
    let palette = mosaicPalette()
    const accent = readAccentRgb()

    function pruneGlows(now) {
        for (const [index, startedAt] of glows) {
            if (now - startedAt >= STRIKE_FADE_MS) {
                glows.delete(index)
            }
        }
    }

    function platformFromFlock() {
        if (flock.formed && flock.following) {
            const center = flock.centroid()

            return new Set(collectDiskCells(cols, rows, center.x, center.y, flock.radius, cell))
        }

        return flock.occupiedCells(cellIndexAt)
    }

    function paint() {
        const now = performance.now()
        pruneGlows(now)
        paintDisplay(
            ctx,
            display,
            cols,
            rows,
            glows,
            now,
            accent,
            palette,
            cell,
            platform,
            mosaicClipTop(originY, cell),
        )
    }

    function clearIdleTimer() {
        if (idleTimer) {
            window.clearInterval(idleTimer)
            idleTimer = 0
        }
    }

    function stopTick() {
        if (raf) {
            window.cancelAnimationFrame(raf)
        }

        raf = 0
        lastTime = 0
    }

    function armIdleWander() {
        if (reduceMotion || idleTimer || lastGather) {
            return
        }

        idleTimer = window.setInterval(() => {
            if (flock.following) {
                return
            }

            if (flock.wander(IDLE_WANDER_COUNT) > 0) {
                startTick()
            }
        }, IDLE_WANDER_MS)
    }

    function tick(time) {
        const dt = lastTime === 0 ? 1 / 60 : (time - lastTime) / 1000
        lastTime = time
        const moving = reduceMotion ? false : flock.step(dt)
        platform = platformFromFlock()
        paint()

        if (moving || glows.size > 0) {
            raf = window.requestAnimationFrame(tick)
            return
        }

        stopTick()
    }

    function startTick() {
        if (raf) {
            return
        }

        lastTime = 0
        raf = window.requestAnimationFrame(tick)
    }

    function restoreAll() {
        fillRgbFromTones(cells, display, palette.tones)
    }

    function syncFlock() {
        const clipTop = mosaicClipTop(originY, cell)
        flock.sync({
            cols,
            rows,
            cell,
            firstRow: mosaicFirstVisibleRow(clipTop, cell),
            radius: lastGather?.radius || readRingRadius(stage),
        })

        if (lastGather && !reduceMotion) {
            const local = toGridPoint(lastGather.x, lastGather.y, originX, originY)
            flock.follow(local.x, local.y, lastGather.radius)
        }

        platform = platformFromFlock()
    }

    function layout() {
        const next = mosaicLayoutForStage(stage)
        const dpr = window.devicePixelRatio || 1
        palette = mosaicPalette(readPageBgRgb())

        if (next.cols !== cols || next.rows !== rows) {
            cols = next.cols
            rows = next.rows
            cells = fillCells(cols, rows)
            display = new Float32Array(cols * rows * 3)
            glows.clear()
        }

        cell = next.cell
        originX = next.originX
        originY = next.originY

        fillRgbFromTones(cells, display, palette.tones)

        canvas.width = Math.round(cols * cell * dpr)
        canvas.height = Math.round(rows * cell * dpr)
        canvas.style.width = `${cols * cell}px`
        canvas.style.height = `${rows * cell}px`
        canvas.style.left = `${originX}px`
        canvas.style.top = `${originY}px`
        const clipTop = mosaicClipTop(originY, cell)
        canvas.style.clipPath = clipTop > 0 ? `inset(${clipTop}px 0 0 0)` : 'none'
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        syncFlock()
        paint()
        armIdleWander()
    }

    function gather(cx, cy, radius) {
        if (reduceMotion || cols === 0 || rows === 0 || !(radius > 0)) {
            return
        }

        lastGather = { x: cx, y: cy, radius }
        clearIdleTimer()
        const local = toGridPoint(cx, cy, originX, originY)
        flock.follow(local.x, local.y, radius)
        startTick()
    }

    function disperse() {
        lastGather = null
        flock.disperse()
        startTick()
        armIdleWander()
    }

    function restoreColors() {
        restoreAll()
        platform = platformFromFlock()
        paint()
    }

    function rest() {
        disperse()
    }

    function strike(x, y) {
        const local = toGridPoint(x, y, originX, originY)
        const index = cellIndexAt(local.x, local.y, cols, rows, cell)

        if (index < 0) {
            return
        }

        glows.set(index, performance.now())
        paint()
        startTick()
    }

    layout()

    const observer = new ResizeObserver(layout)
    observer.observe(stage)
    const card = stage.querySelector('[data-lead-mosaic-card]')
    const column = stage.querySelector('.public-column')
    const guide = document.querySelector('[data-mosaic-guide]')

    if (card instanceof HTMLElement) {
        observer.observe(card)
    }

    if (column instanceof HTMLElement) {
        observer.observe(column)
    }

    if (guide instanceof HTMLElement) {
        observer.observe(guide)
    }

    return {
        applyRingBorder: gather,
        gather,
        disperse,
        restoreColors,
        rest,
        strike,
        clearBorderVisits: rest,
        destroy() {
            observer.disconnect()
            clearIdleTimer()
            stopTick()
        },
    }
}
