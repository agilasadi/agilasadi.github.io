const LARGE_QUERY = '(min-width: 1024px)'
const FADE_PX = 64

function mediaMatches(query) {
    try {
        return window.matchMedia(query).matches
    } catch {
        return false
    }
}

function clamp01(value) {
    return Math.min(1, Math.max(0, value))
}

function columnForViewport(root) {
    if (mediaMatches(LARGE_QUERY)) {
        return root.querySelector('[data-page-shadow-column]')
    }

    return root.querySelector('[data-mosaic-guide]') || root.querySelector('.page-front')
}

function place(el, left, width) {
    el.style.left = left
    el.style.width = width
}

export function bootPageShadows(root = document) {
    const top = root.querySelector('.page-shadow-top')
    const bottom = root.querySelector('.page-shadow-bottom')

    if (!top || !bottom) {
        return
    }

    const fade = Math.max(top.offsetHeight, bottom.offsetHeight, FADE_PX)
    let ticking = false

    function layout() {
        ticking = false
        const column = columnForViewport(root)

        if (!column) {
            top.style.opacity = '0'
            bottom.style.opacity = '0'
            return
        }

        const rect = column.getBoundingClientRect()
        const left = `${Math.round(rect.left)}px`
        const width = `${Math.round(rect.width)}px`

        place(top, left, width)
        place(bottom, left, width)

        const scrolling = root.scrollingElement || root.documentElement
        const maxScroll = scrolling.scrollHeight - window.innerHeight
        const y = window.scrollY

        if (!(maxScroll > 1)) {
            top.style.opacity = '0'
            bottom.style.opacity = '0'
            return
        }

        top.style.opacity = String(clamp01(y / fade))
        bottom.style.opacity = String(clamp01((maxScroll - y) / fade))
    }

    function requestLayout() {
        if (ticking) {
            return
        }

        ticking = true
        requestAnimationFrame(layout)
    }

    layout()
    window.addEventListener('scroll', requestLayout, { passive: true })
    window.addEventListener('resize', requestLayout)
    window.matchMedia(LARGE_QUERY).addEventListener('change', requestLayout)

    const observer = new ResizeObserver(requestLayout)
    const largeColumn = root.querySelector('[data-page-shadow-column]')
    const smallColumn = root.querySelector('[data-mosaic-guide]') || root.querySelector('.page-front')

    if (largeColumn) {
        observer.observe(largeColumn)
    }

    if (smallColumn && smallColumn !== largeColumn) {
        observer.observe(smallColumn)
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bootPageShadows())
} else {
    bootPageShadows()
}
