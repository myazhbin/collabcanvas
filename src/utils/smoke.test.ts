import { describe, expect, it } from 'vitest'

/**
 * Proves the Vitest harness runs. Real coverage starts in PR 3 (`authMachine`)
 * and PR 5–8 (the four Tier 1 files).
 */
describe('test harness', () => {
  it('runs', () => {
    expect(true).toBe(true)
  })
})
