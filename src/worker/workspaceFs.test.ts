import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, assert, beforeEach, describe, test } from 'orca/testing'
import { createLogger } from './log.ts'
import { createWatcher } from './watcher.ts'
import {
  fingerprintWorkspace,
  isRemote,
  MAX_FILE_BYTES,
  readWorkspace,
  resolveWorkspace,
  WorkspaceReader
} from './workspaceFs.ts'

let root = ''
let logs: string[] = []
const log = () => createLogger({ log: (message: string) => logs.push(message) }, () => 'debug')
const write = async (rel: string, text: string): Promise<void> => {
  await mkdir(join(root, rel, '..'), { recursive: true })
  await writeFile(join(root, rel), text)
}
const ref = () => ({ id: 'w1', name: 'repo', branch: 'feature/auth', path: root, hostId: 'local' })

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'aif-ws-'))
  logs = []
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('resolveWorkspace', () => {
  const list = [
    { id: 'a', kind: 'worktree' as const, name: 'repo', path: '/r', branch: 'main', hostId: 'local' },
    { id: 'b', kind: 'worktree' as const, name: 'remote', path: '/s', branch: 'main', hostId: 'ssh:box' }
  ]
  test('by id, by name and branch, or unmatched', () => {
    assert.equal(resolveWorkspace({ workspaceId: 'a', branch: 'main', displayName: 'x', terminals: [] }, list)?.matchedBy, 'id')
    const byName = resolveWorkspace({ branch: 'main', displayName: 'repo', terminals: [] }, list)
    assert.deepEqual([byName?.matchedBy, byName?.ref.path], ['name', '/r'])
    const none = resolveWorkspace({ workspaceId: 'zzz', branch: 'dev', displayName: 'q', terminals: [] }, list)
    assert.deepEqual([none?.matchedBy, none?.ref.path], ['none', null])
    assert.equal(resolveWorkspace(null, list), null)
  })
  test('remote hosts', () => {
    assert.equal(isRemote({ id: 'b', name: 'x', branch: null, path: '/s', hostId: 'ssh:box' }), true)
    assert.equal(isRemote({ id: 'a', name: 'x', branch: null, path: '/r', hostId: null }), false)
  })
})

describe('readWorkspace', () => {
  test('not installed', async () => {
    const input = await readWorkspace(ref(), log())
    assert.equal(input.installed, false)
    assert.equal(input.discovery.reason, 'none')
  })

  test('branch plan, roadmap, artifacts and install file', async () => {
    await write('.ai-factory/config.yaml', 'language:\n  artifacts: ru\n')
    await write('.ai-factory/DESCRIPTION.md', '# D')
    await write('.ai-factory/ROADMAP.md', '- [ ] **One** — x\n')
    await write('.ai-factory/plans/feature-auth.md', '# Auth\n- [x] Task 1: a\n- [ ] Task 2: b\n')
    await write('.ai-factory/plans/other.md', '# Other')
    await write('.ai-factory/plans/bundle/index.md', '<!-- aif:plan-mode:ultra -->\n- [ ] Task 1: x\n')
    await write('.ai-factory.json', '{"agents":[{"id":"codex"}]}')
    const input = await readWorkspace(ref(), log())
    assert.equal(input.installed, true)
    assert.deepEqual(input.discovery.plan, { path: '.ai-factory/plans/feature-auth.md', kind: 'full' })
    assert.match(input.planText ?? '', /Task 2/)
    assert.match(input.roadmapText ?? '', /One/)
    assert.equal(input.artifacts.find((a) => a.key === 'description')?.exists, true)
    assert.equal(input.artifacts.find((a) => a.key === 'architecture')?.exists, false)
    assert.match(input.installJson ?? '', /codex/)
    assert.ok(logs.some((line) => line.startsWith('DEBUG [aif:fs] plan discovery')))
  })

  test('config path outside the workspace is refused with a warning', async () => {
    await write('.ai-factory/config.yaml', 'paths:\n  roadmap: ../../etc/ROADMAP.md\n')
    const input = await readWorkspace(ref(), log())
    assert.equal(input.config.paths.roadmap, '.ai-factory/ROADMAP.md')
    assert.ok(logs.some((line) => line.startsWith('WARN [aif:config]')))
  })

  test('a symlink leaving the workspace is not followed', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'aif-out-'))
    try {
      await writeFile(join(outside, 'secret.md'), '- [ ] Task 1: secret\n')
      await mkdir(join(root, '.ai-factory'), { recursive: true })
      await symlink(join(outside, 'secret.md'), join(root, '.ai-factory', 'PLAN.md'))
      const reader = new WorkspaceReader(root, log())
      assert.equal(await reader.readText('.ai-factory/PLAN.md'), null)
      assert.ok(reader.warnings.some((w) => w.includes('links outside')))
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  test('files over the size limit are skipped', async () => {
    await write('.ai-factory/ROADMAP.md', 'x'.repeat(MAX_FILE_BYTES + 1))
    const reader = new WorkspaceReader(root, log())
    assert.equal(await reader.readText('.ai-factory/ROADMAP.md'), null)
    assert.equal(reader.warnings.length, 1)
  })
})

test('fingerprint changes when a plan changes, watcher fires once', async () => {
  await write('.ai-factory/plans/feature-auth.md', '- [ ] Task 1: a\n')
  const first = await fingerprintWorkspace(root, log())
  await new Promise((done) => setTimeout(done, 20))
  await write('.ai-factory/plans/feature-auth.md', '- [x] Task 1: a\n')
  assert.notEqual(await fingerprintWorkspace(root, log()), first)

  let changes = 0
  let value = 'a'
  const watcher = createWatcher({ intervalMs: 60_000, debounceMs: 0, fingerprint: async () => value, onChange: () => changes++, log: log() })
  await watcher.poll()
  value = 'b'
  await watcher.poll()
  await watcher.poll()
  watcher.stop()
  assert.equal(changes, 1)
})

test('reads AI Factory skills from the agents skills folders', async () => {
  await write('.ai-factory.json', '{"agents":[{"id":"claude","skillsDir":".claude/skills"},{"id":"codex","skillsDir":".agents/skills"}]}')
  await write('.claude/skills/aif-plan/SKILL.md', '---\nname: aif-plan\ndescription: Plan things.\n---\n')
  await write('.claude/skills/orca-cli/SKILL.md', '---\nname: orca-cli\ndescription: Not AI Factory.\n---\n')
  await write('.agents/skills/aif-plan/SKILL.md', '---\nname: aif-plan\ndescription: Duplicate for Codex.\n---\n')
  await write('.agents/skills/aif-commit/SKILL.md', '---\nname: aif-commit\ndescription: Commit.\n---\n')
  const input = await readWorkspace(ref(), log())
  assert.deepEqual(input.skills?.map((skill) => [skill.name, skill.path]), [
    ['aif-commit', '.agents/skills/aif-commit/SKILL.md'],
    ['aif-plan', '.claude/skills/aif-plan/SKILL.md']
  ])
})
