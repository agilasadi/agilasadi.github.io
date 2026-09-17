import { bootPointerRing } from './pointerRing.js'
import { bootPointerTexture } from './pointerTexture.js'

function boot() {
    const texture = bootPointerTexture()
    bootPointerRing(document, {
        onPosition: texture.gather,
        onLeave: texture.disperse,
        onStrike: texture.strike,
    })
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
} else {
    boot()
}
