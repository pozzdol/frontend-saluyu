// Run with: node --experimental-strip-types src/lib/utils.test.ts
import assert from "node:assert/strict"
import { toSen } from "./utils.ts"

assert.equal(toSen("25000"), 2500000)
assert.equal(toSen("25.000"), 2500000)
assert.equal(toSen("1.250.000"), 125000000)
assert.equal(toSen("10826012,92"), 1082601292)
assert.equal(toSen("10.826.012,92"), 1082601292)
assert.equal(toSen("10826012.92"), 1082601292)
assert.equal(toSen("Rp 9.000"), 900000)
assert.equal(toSen("0,5"), 50)
assert.ok(Number.isNaN(toSen("abc")))
console.log("toSen ok")
