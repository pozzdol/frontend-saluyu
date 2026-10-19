// Run with: node --experimental-strip-types src/lib/utils.test.ts
import assert from "node:assert/strict"
import { fmtIDR, nextPeriodStart, toSen } from "./utils.ts"

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

const nb = (s: string) => s.replace(/\s/g, " ") // Intl puts a no-break space after "Rp"
assert.equal(nb(fmtIDR(57659310)), "Rp 576.593,10")
assert.equal(nb(fmtIDR(57659300)), "Rp 576.593")
assert.equal(nb(fmtIDR(-1500)), "-Rp 15")
console.log("fmtIDR ok")

const cfg = (period_mode: string, period_start_day = 25, period_weekday = 1) => ({ period_mode, period_start_day, period_weekday })
assert.equal(nextPeriodStart("2026-10-19", cfg("payday")), "2026-10-25")
assert.equal(nextPeriodStart("2026-10-25", cfg("payday")), "2026-11-25")
assert.equal(nextPeriodStart("2026-02-10", cfg("payday", 31)), "2026-02-28")
assert.equal(nextPeriodStart("2026-12-31", cfg("payday", 31)), "2027-01-31")
assert.equal(nextPeriodStart("2026-10-19", cfg("calendar_month")), "2026-11-01")
assert.equal(nextPeriodStart("2026-10-29", cfg("last_workday")), "2026-10-30") // 31 Oct 2026 is a Saturday
assert.equal(nextPeriodStart("2026-10-30", cfg("last_workday")), "2026-11-30")
assert.equal(nextPeriodStart("2026-10-19", cfg("weekly", 25, 1)), "2026-10-26") // a Monday
assert.equal(nextPeriodStart("2026-10-21", cfg("weekly", 25, 1)), "2026-10-26")
console.log("nextPeriodStart ok")
