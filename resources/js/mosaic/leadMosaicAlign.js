export const CELL_GAP = 1
export const TARGET_CELL_SIZE = 8

export function mosaicTileCount(width, gap = CELL_GAP, cell = TARGET_CELL_SIZE) {
    return Math.max(1, Math.round((Math.max(width, gap) - gap) / cell))
}

export function mosaicCellSize(width, tiles, gap = CELL_GAP) {
    const count = Math.max(1, tiles)

    return (Math.max(width, gap) - gap) / count
}

export function mosaicOrigin(firstPlate, cell) {
    if (!(cell > 0)) {
        return 0
    }

    const k = Math.ceil(firstPlate / cell)

    return firstPlate - k * cell
}

export function mosaicTopGapInset(origin, cell = TARGET_CELL_SIZE, gap = CELL_GAP) {
    if (!(cell > 0)) {
        return 0
    }

    const face = cell - gap
    const into = ((0 - origin) % cell + cell) % cell

    if (into >= face) {
        return 0
    }

    return face - into
}

export function mosaicClipTop(originY, cell = TARGET_CELL_SIZE, gap = CELL_GAP) {
    return Math.max(0, -originY) + mosaicTopGapInset(originY, cell, gap)
}

export function mosaicFirstVisibleRow(clipTop, cell = TARGET_CELL_SIZE) {
    if (!(cell > 0)) {
        return 0
    }

    return Math.ceil(clipTop / cell)
}

export function mosaicGrid(stageWidth, stageHeight, originX, originY, cell) {
    if (!(cell > 0)) {
        return { cols: 1, rows: 1 }
    }

    return {
        cols: Math.max(1, Math.ceil((stageWidth - originX) / cell)),
        rows: Math.max(1, Math.ceil((stageHeight - originY) / cell)),
    }
}

function boxEdge(css, key) {
    return parseFloat(css[key]) || 0
}

function measureBox(stageRect, el) {
    const rect = el.getBoundingClientRect()

    return {
        left: rect.left - stageRect.left,
        top: rect.top - stageRect.top,
        width: rect.width,
        height: rect.height,
    }
}

export function measureMosaicGuide(stage) {
    const stageRect = stage.getBoundingClientRect()
    const root = stage.getRootNode()
    const doc = root instanceof Document ? root : document
    const guide = doc.querySelector('[data-mosaic-guide]')

    if (guide instanceof HTMLElement) {
        return measureBox(stageRect, guide)
    }

    const card = stage.querySelector('[data-lead-mosaic-card]')

    if (card instanceof HTMLElement) {
        return measureBox(stageRect, card)
    }

    const column = stage.querySelector('.public-column')

    if (column instanceof HTMLElement) {
        const colRect = column.getBoundingClientRect()
        const css = getComputedStyle(column)
        const padLeft = boxEdge(css, 'paddingLeft')
        const padRight = boxEdge(css, 'paddingRight')
        const padTop = boxEdge(css, 'paddingTop')

        return {
            left: colRect.left - stageRect.left + padLeft,
            top: colRect.top - stageRect.top + padTop,
            width: Math.max(0, colRect.width - padLeft - padRight),
            height: Math.max(0, colRect.height - padTop - boxEdge(css, 'paddingBottom')),
        }
    }

    return {
        left: 0,
        top: 0,
        width: stage.clientWidth,
        height: stage.clientHeight,
    }
}

export function mosaicLayout(guide, stageWidth, stageHeight, tiles, gap = CELL_GAP) {
    const count = Math.max(1, tiles ?? mosaicTileCount(guide.width, gap))
    const cell = mosaicCellSize(guide.width, count, gap)

    if (!(cell > 0)) {
        return {
            cell: TARGET_CELL_SIZE,
            originX: 0,
            originY: 0,
            cols: 1,
            rows: 1,
            tiles: count,
            guide,
        }
    }

    const originX = mosaicOrigin(guide.left + gap, cell)
    const originY = mosaicOrigin(guide.top + gap, cell)
    const { cols, rows } = mosaicGrid(stageWidth, stageHeight, originX, originY, cell)

    return { cell, originX, originY, cols, rows, tiles: count, guide }
}

export function mosaicLayoutForStage(stage) {
    const guide = measureMosaicGuide(stage)

    return mosaicLayout(
        guide,
        stage.clientWidth,
        stage.clientHeight,
        mosaicTileCount(guide.width),
    )
}
