// Run: node --experimental-strip-types src/lib/keypad.test.ts
import assert from "node:assert/strict"
import { press, show, toSenDigits, type Key } from "./keypad.ts"

const typed = (keys: Key[]) => keys.reduce(press, "")
assert.equal(typed(["2", "5", "000"]), "25000")
assert.equal(typed(["0", "0", "7"]), "7") // no leading zeros
assert.equal(typed(["000"]), "")
assert.equal(typed(["1", "2", "back"]), "1")
assert.equal(typed(["back"]), "")
assert.equal(press("9999999999999", "1"), "9999999999999") // full: key ignored
assert.equal(press("99999999999", "000"), "99999999999")
assert.equal(show("25000"), "25.000")
assert.equal(show(""), "0")
assert.equal(toSenDigits("25000"), 2500000)
console.log("keypad ok")
