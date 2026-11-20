import { readFileSync } from 'node:fs'
import { assert, test } from 'orca/testing'
import { parseRoadmap } from './roadmap.ts'

test('milestones with em dash, hyphen and no bold', () => {
  const text = readFileSync(new URL('../../test/fixtures/roadmap/partial.md', import.meta.url), 'utf8')
  const roadmap = parseRoadmap(text, '.ai-factory/ROADMAP.md')
  assert.equal(roadmap.total, 3)
  assert.equal(roadmap.done, 1)
  assert.deepEqual(roadmap.milestones[0], { name: 'Auth', description: 'login and sessions', done: true })
  assert.deepEqual(roadmap.milestones[1], { name: 'Billing', description: 'invoices', done: false })
  assert.equal(roadmap.milestones[2].name, 'Plain milestone without bold')
  assert.equal(roadmap.next?.name, 'Billing')
})

test('an empty roadmap has no next milestone', () => {
  const roadmap = parseRoadmap('# Project Roadmap\n', 'r.md')
  assert.equal(roadmap.total, 0)
  assert.equal(roadmap.next, null)
})

test('a real ROADMAP.md (snapshot of this repository)', () => {
  const text = readFileSync(new URL('../../test/fixtures/sample-project/ROADMAP.md', import.meta.url), 'utf8')
  const roadmap = parseRoadmap(text, '.ai-factory/ROADMAP.md')
  assert.equal(roadmap.total, 10)
  assert.equal(roadmap.next?.name, roadmap.milestones.find((m) => !m.done)?.name)
})
