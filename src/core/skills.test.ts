import { assert, test } from 'orca/testing'
import { DEFAULT_SKILL_DIRS, isAifSkill, parseSkillFile, skillDirsOf } from './skills.ts'

test('plain, quoted and argument-hint fields', () => {
  const skill = parseSkillFile(
    '---\nname: aif-plan\ndescription: Plan a feature. Use for "plan".\nargument-hint: "[fast | full] <description>"\nallowed-tools: Read\n---\n# Body\n',
    '.claude/skills/aif-plan/SKILL.md'
  )
  assert.deepEqual(skill, {
    name: 'aif-plan',
    description: 'Plan a feature. Use for "plan".',
    argumentHint: '[fast | full] <description>',
    path: '.claude/skills/aif-plan/SKILL.md'
  })
})

test('folded block descriptions and CRLF', () => {
  const skill = parseSkillFile('---\r\nname: aif-x\r\ndescription: >-\r\n  First line,\r\n  second line.\r\n---\r\n', 'p')
  assert.equal(skill?.description, 'First line, second line.')
  assert.equal(skill?.argumentHint, null)
})

test('no frontmatter or no name', () => {
  assert.equal(parseSkillFile('# just markdown', 'p'), null)
  assert.equal(parseSkillFile('---\ndescription: x\n---\n', 'p'), null)
})

test('long descriptions are capped', () => {
  const skill = parseSkillFile(`---\nname: aif-x\ndescription: ${'word '.repeat(300)}\n---\n`, 'p')
  assert.ok((skill?.description.length ?? 0) <= 600)
})

test('aif skills only', () => {
  assert.equal(isAifSkill('aif'), true)
  assert.equal(isAifSkill('aif-plan'), true)
  assert.equal(isAifSkill('aifx'), false)
  assert.equal(isAifSkill('orca-cli'), false)
})

test('skills folders from .ai-factory.json, safe and de-duplicated', () => {
  assert.deepEqual(skillDirsOf('{"agents":[{"skillsDir":".claude/skills/"},{"skillsDir":"./.agents/skills"},{"skillsDir":".claude/skills"},{"skillsDir":"../x"}]}'), ['.claude/skills', '.agents/skills'])
  assert.deepEqual(skillDirsOf(null), DEFAULT_SKILL_DIRS)
  assert.deepEqual(skillDirsOf('{"agents":[]}'), DEFAULT_SKILL_DIRS)
})
