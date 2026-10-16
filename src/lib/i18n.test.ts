// Run: node --experimental-strip-types src/lib/i18n.test.ts
import assert from "node:assert/strict"
import { en } from "../i18n/en.ts"
import { id } from "../i18n/id.ts"

// Every key and every {var} in one language must exist in the other.
function walk(a: object, b: object, path: string) {
  const ka = Object.keys(a).sort()
  assert.deepEqual(ka, Object.keys(b).sort(), `keys differ at ${path || "root"}`)
  for (const k of ka) {
    const va = (a as Record<string, unknown>)[k]
    const vb = (b as Record<string, unknown>)[k]
    if (typeof va === "object") walk(va as object, vb as object, `${path}${k}.`)
    else {
      const vars = (s: unknown) => String(s).match(/\{\w+\}/g)?.sort() ?? []
      assert.deepEqual(vars(va), vars(vb), `vars differ at ${path}${k}`)
    }
  }
}
walk(id, en, "")
console.log("i18n ok")
