import { bootPointerRing } from './pointerRing.js'
import { bootPointerTexture } from './pointerTexture.js'

function boot() {
    const texture = bootPointerTexture()
    bootPointerRing(document, {
        onPosition: texture.gather,
        onLeave: texture.disperse,
        onStrike: texture.strike,
    })

    texture.setEnabled(true)

    const toggle = document.querySelector('[data-dots-toggle]')

    if (toggle) {
        toggle.addEventListener('pointerdown', (event) => event.stopPropagation())
        toggle.addEventListener('click', () => {
            const next = toggle.getAttribute('aria-checked') !== 'true'
            const rect = toggle.getBoundingClientRect()
            toggle.setAttribute('aria-checked', String(next))
            texture.setEnabled(next, {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            })
        })
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
} else {
    boot()
}
