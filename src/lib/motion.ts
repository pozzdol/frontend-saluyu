import { animate, stagger, utils, type JSAnimation } from "animejs"
import { useLayoutEffect, useRef } from "preact/hooks"

// Motion here only shows what changed: a number or a bar moves from what it showed before to
// what it shows now. With reduced motion every value lands at once.
export const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches

// tween eases a number from `from` to `to`, handing each frame to `frame`. The last frame is
// always exactly `to`.
export function tween(from: number, to: number, frame: (n: number) => void, opts: { duration?: number; delay?: number } = {}): JSAnimation | null {
  if (calm() || from === to) return frame(to), null
  const o = { v: from }
  return animate(o, { v: to, duration: opts.duration ?? 900, delay: opts.delay ?? 0, ease: "outExpo", onUpdate: () => frame(o.v) })
}

// useTween keeps an element in step with `value`, moving from the value it showed before
// (0 on first render). The element is drawn only by `frame`, never by JSX children.
export function useTween<T extends Element>(value: number, frame: (el: T, n: number) => void, opts?: { duration?: number; delay?: number }) {
  const ref = useRef<T>(null)
  const prev = useRef(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const from = prev.current
    prev.current = value
    const a = tween(from, value, (n) => frame(el, n), opts)
    return () => void (a?.pause(), frame(el, value))
  }, [value])
  return ref
}

// useCount counts text up or down to `value`. `step` rounds the numbers in between (100 sen =
// whole rupiah), so no stray decimals flicker past; the final text is always format(value).
export function useCount<T extends HTMLElement>(value: number, format: (n: number) => string, step?: number) {
  return useTween<T>(value, (el, n) => {
    el.textContent = format(n === value || !step ? n : Math.round(n / step) * step)
  })
}

// rise lifts hidden elements into place one after another.
const hidden = { opacity: 0, y: 24 }
const rise = (els: Element[], start = 0) => animate(els, { opacity: 1, y: 0, duration: 800, delay: stagger(90, { start }), ease: "outExpo" })

// useEntrance lifts each [data-enter] element inside the returned root into place when the
// root first appears, and again whenever `key` changes (a form moving to its next step).
export function useEntrance<T extends HTMLElement>(key?: unknown) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || calm()) return
    const els = [...root.querySelectorAll("[data-enter]")]
    utils.set(els, hidden)
    const a = rise(els)
    return () => void a.revert()
  }, [key])
  return ref
}

// useReveal fades in, once, each [data-reveal] element inside the returned root, and the
// children of each [data-stagger] element one after another, as they scroll into view.
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || calm() || !("IntersectionObserver" in window)) return
    const groups = [...root.querySelectorAll<HTMLElement>("[data-reveal], [data-stagger]")]
    const items = (g: Element) => (g.hasAttribute("data-stagger") ? [...g.children] : [g])
    groups.forEach((g) => utils.set(items(g), hidden))
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        io.unobserve(e.target)
        rise(items(e.target))
      }
    }, { rootMargin: "0px 0px -10% 0px" })
    groups.forEach((g) => io.observe(g))
    return () => io.disconnect()
  }, [])
  return ref
}
