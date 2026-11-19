# Справочник: артефакты и команды AI Factory

> Source: https://github.com/lee-to/ai-factory (ветка `2.x`, commit `647f47cd0fe64b1968e335dda1ce7ca4a46fe379`):
> `docs/plan-files.md`, `docs/config-reference.md`, `docs/workflow.md`, `docs/skills.md`, `docs/getting-started.md`.
> Дополнительно (точные форматы, которых нет в docs): установленные skills AI Factory 2.21.0 —
> `.claude/skills/aif-roadmap/SKILL.md`, `.claude/skills/aif-implement/references/IMPLEMENT-DISCOVERY.md`,
> `.claude/skills/aif-plan/SKILL.md` (Step 1.2.a), `.claude/skills/aif-plan/references/ULTRA-FORMAT.md`.
> Created: 2026-11-19
> Updated: 2026-11-19

## Обзор

AI Factory (MIT, lee-to) — набор skills и CLI для spec-driven разработки с AI-агентами. Всё состояние
проекта хранится в markdown/YAML-файлах внутри `.ai-factory/` (пути настраиваются в `config.yaml`) и
в `.ai-factory.json` в корне. Skills вызываются агентом как `/aif-*` (Claude Code и другие slash-runtimes)
или `$aif-*` (Codex CLI / Codex app).

Для плагина Orca важно: статус можно полностью вывести из файлов — прогресс плана это чекбоксы
`- [ ]` / `- [x]` в секции `## Tasks`, прогресс roadmap это чекбоксы в `## Milestones`. Поиск
активного плана зависит от текущей git-ветки и `config.yaml`.

## Основные понятия

- **`.ai-factory.json`** — файл установки в корне проекта (managed CLI): `version`, `agents[]` с `id`
  (`claude`, `codex`, …), `skillsDir`, `installedSkills`, `agentsDir`, `mcp`, `extensions`. Признак того,
  что AI Factory установлен, и источник списка доступных skills и агентов.
- **`.ai-factory/config.yaml`** — настройки: `language`, `paths`, `workflow`, `git`, `rules`, `warmup`,
  `writing`. Все секции опциональны, при отсутствии действуют значения по умолчанию.
- **Fast-план** — один файл `paths.plan` (по умолчанию `.ai-factory/PLAN.md`), без ветки.
- **Full-план** — `paths.plans/<stem>.md`; при `git.create_branches: true` создаётся ветка
  `<git.branch_prefix><slug>`, а `stem` = имя ветки с заменой `/` → `-`.
- **Ultra-бандл** — директория `paths.plans/<stem>/` с `index.md` (манифест и единственный источник
  прогресса) и `phase-NN-<slug>.md`. Распознаётся строго по маркеру `<!-- aif:plan-mode:ultra -->`
  в `index.md` (ровно один раз).
- **Fix-план** — `paths.fix_plan` (по умолчанию `.ai-factory/FIX_PLAN.md`), принадлежит `/aif-fix`.
- **Roadmap** — `paths.roadmap` (по умолчанию `.ai-factory/ROADMAP.md`): высокоуровневые milestones.
- **Archive** — `paths.archive/plans/` и `paths.archive/roadmap/`; архивные планы исключены из поиска.
- **Patches** — `paths.patches/YYYY-MM-DD-HH.mm.md`, создаются `/aif-fix`, их потребляет `/aif-evolve`.

## Раскладка файлов (значения по умолчанию)

| Ключ `paths.*` | По умолчанию | Владелец |
|---|---|---|
| `description` | `.ai-factory/DESCRIPTION.md` | `/aif` |
| `architecture` | `.ai-factory/ARCHITECTURE.md` | `/aif-architecture` |
| `docs` | `docs/` | `/aif-docs` |
| `roadmap` | `.ai-factory/ROADMAP.md` | `/aif-roadmap` (`/aif-implement` может отмечать done) |
| `research` | `.ai-factory/RESEARCH.md` | `/aif-explore` |
| `rules_file` | `.ai-factory/RULES.md` | `/aif-rules` |
| `plan` | `.ai-factory/PLAN.md` | `/aif-plan` (fast) |
| `plans` | `.ai-factory/plans/` | `/aif-plan` (full/ultra), `/aif-improve` |
| `fix_plan` | `.ai-factory/FIX_PLAN.md` | `/aif-fix` |
| `security` | `.ai-factory/SECURITY.md` | `/aif-security-checklist` |
| `references` | `.ai-factory/references/` | `/aif-reference` |
| `patches` | `.ai-factory/patches/` | `/aif-fix` |
| `evolutions` | `.ai-factory/evolutions/` | `/aif-evolve` |
| `evolution` | `.ai-factory/evolution/` | `/aif-loop` |
| `specs` | `.ai-factory/specs/` | `/aif-plan`, `/aif-verify` |
| `rules` | `.ai-factory/rules/` | `/aif-rules` |
| `qa` | `.ai-factory/qa/` | `/aif-qa`, `/aif-qa-check` (подпапка `<branch-slug>/`) |
| `archive` | `.ai-factory/archive/` | `/aif-archive` |

Фиксированные пути вне схемы: `.ai-factory/skill-context/*` (`/aif-evolve`), `.ai-factory.json`.

## Конфигурация (`config.yaml`) — ключи, важные для статуса

| Ключ | По умолчанию | Значения | Влияние на статус/поиск |
|---|---|---|---|
| `language.ui` | `en` | `en, ru, de, fr, es, zh, ja, ko, pt, it` | язык общения агента |
| `language.artifacts` | `en` | то же | язык заголовков в артефактах (заголовки секций могут быть локализованы!) |
| `language.technical_terms` | `keep` | `keep`, `translate`, `mixed` | — |
| `workflow.plan_mode` | `ask` | `ask, fast, full, ultra` | режим `/aif-plan` по умолчанию |
| `workflow.plan_id_format` | `slug` | `slug`, `sequential` (`timestamp`, `uuid` зарезервированы и ведут себя как `slug`) | имя файла плана: `<stem>.md` или `<NNNN>_<stem>.md` |
| `workflow.plan_structure` | `classic` | `classic`, `task-based` | `## Commit Plan` отдельно или commit-задачи в списке |
| `workflow.explore_mode` | `regular` | `regular`, `ultra` | — |
| `workflow.improve_check` | `false` | boolean | — |
| `workflow.fix_mode` | `ask` | `ask, now, plan` | — |
| `workflow.fix_patch` | `true` | boolean | — |
| `workflow.verify_mode` | `normal` | `strict, normal, lenient` | — |
| `git.enabled` | `true` (автодетект `.git`) | boolean | без git нет поиска по ветке |
| `git.base_branch` | `main` | строка | — |
| `git.create_branches` | `true` | boolean | `false` → `stem` = slug описания, поиск по ветке не сработает |
| `git.branch_prefix` | `feature/` | строка | префикс веток full-планов |
| `git.skip_push_after_commit` | `false` | boolean | — |
| `rules.base` | `.ai-factory/rules/base.md` | путь | — |
| `rules.<area>` | нет | путь | area-правила (`/aif-rules area:<name>`) |

Некорректные значения → `WARN [config]` и откат к значениям по умолчанию. `config.yaml` пишут только
`/aif` (managed-ключи) и `/aif-rules` (`rules.<area>`); остальные skills только читают его.

## Форматы артефактов

### Full / fast план (single-file)

```markdown
# Implementation Plan: User Authentication

Branch: feature/user-authentication
Created: 2024-01-15

## Original Request
Add user authentication with OAuth

## Settings
- Testing: no
- Logging: verbose
- Docs: yes          # /aif-implement shows mandatory docs checkpoint, then routes through /aif-docs

## Research Context (optional)
Source: `.ai-factory/RESEARCH.md` (Active Summary, Updated: YYYY-MM-DD HH:MM, SHA256: <active-summary-sha256>)
Goal: Add OAuth + email login
Constraints: Must support existing session middleware
Decisions: Use JWT for API auth
Open questions: Do we need refresh tokens?

## Commit Plan
- **Commit 1** (tasks 1-3): "feat: add user model and types"
- **Commit 2** (tasks 4-6): "feat: implement auth service"

## Tasks

### Phase 1: Setup
- [ ] Task 1: Create User model
- [ ] Task 2: Add auth types

### Phase 2: Implementation
- [x] Task 3: Implement registration
- [ ] Task 4: Implement login
```

- Задача: `- [ ] Task N: <title>` / `- [x] Task N: <title>`; может заканчиваться `(depends on 1,2)`.
- Фазы: необязательные подзаголовки `### Phase N: <name>` внутри `## Tasks`.
- `## Commit Plan` есть только в `classic`. В `task-based` commit-задача помечается отдельной строкой-комментарием
  непосредственно над ней (комментарий сам не является задачей):

```markdown
- [ ] Task 2: Add auth types
<!-- aif:task-kind:commit -->
- [ ] Task 3: Commit changes with message "feat: add user model" (depends on 1,2)
```

- Необязательная секция `## Roadmap Linkage`: одна строка `Milestone:` и по одной строке `Also completes:`
  на каждый дополнительный milestone (имена в кавычках, запятые внутри имён сохраняются).
- Архивированный full-план получает в YAML frontmatter `archived: YYYY-MM-DD`.
- Заголовки и метки в примерах структурные: при `language.artifacts != en` текст секций может быть
  локализован; машинные маркеры (`<!-- aif:... -->`) не локализуются никогда.

### Ultra-бандл

```text
.ai-factory/plans/feature-billing-ledger/
├── index.md
├── phase-01-ledger-domain.md
├── phase-02-persistence-migration.md
└── phase-03-service-integration.md
```

Секции `index.md`: `## Original Request`, `## Settings`, `## Roadmap Linkage (optional)`,
`## Research Context (optional)`, `## Requirements Reconciliation`, `## Architecture and Decisions`,
`## Phase Index`, `## Cross-Phase Dependencies`, `## Tasks`, `## Commit Plan`, `## Definition of Done`.

```markdown
- [ ] Task 1: [deliverable] ([details](phase-01-foundation.md#task-1-deliverable))
- [ ] Task 3: [deliverable] ([details](phase-02-integration.md#task-3-deliverable)) (depends on 1, 2)
```

- Маркер `<!-- aif:plan-mode:ultra -->` — ровно один в `index.md`; архивный бандл получает
  `<!-- aif:archived:YYYY-MM-DD -->` сразу после маркера.
- Чекбоксы только в `index.md`; phase-файлы содержат `## Objective`, `## Files to Change`,
  `## Task N: ...` и т. д., но без чекбоксов.
- Принадлежность phase-файлов определяют упорядоченные ссылки в `## Phase Index`; файлы вне индекса — orphans.

### ROADMAP.md

```markdown
# Project Roadmap

> <project vision — one-liner>

## Milestones

- [ ] **Name** — short description
- [ ] **Name** — short description
- [x] **Name** — short description

## Completed

| Milestone | Date |
|-----------|------|
| Name | YYYY-MM-DD |
```

- Milestone: `- [ ] **<Name>** — <description>`; рекомендуется 5–15 штук, в порядке зависимостей.
- Каждый отмеченный milestone получает строку с датой в таблице `## Completed`.
- `/aif-archive --roadmap` переносит закрытые milestones в `paths.archive/roadmap/` (датированные снимки).

### RESEARCH.md

- `## Active Summary (input for /aif-plan)` — между `<!-- aif:active-summary:start -->` и
  `<!-- aif:active-summary:end -->`; `## Sessions` — история, только дописывается.
- Ultra-исследование: `<parent of paths.research>/research/<english-topic-slug>/INDEX.md` с маркером
  `<!-- aif:research-mode:ultra -->`.

### Patch (`paths.patches/YYYY-MM-DD-HH.mm.md`)

Заголовок `# <проблема>`, затем `**Date:**`, `**Files:**`, `**Severity:**`, секции `## Problem`,
`## Root Cause`, `## Solution`, `## Prevention`, `## Tags`.

### Метаданные артефактов (необязательный frontmatter)

Поля `id` (обязательное), `type`, `status` (`draft, proposed, accepted, active, in_progress, done,
deprecated, obsolete, superseded`), `owners`/`owner`, `depends_on`, `affects`, `implements`, `verifies`,
`documents`, `supersedes`. Проверка: `ai-factory audit-artifacts [--strict] [--json]`.

## Поиск активного плана (как `/aif-implement`)

Приоритет: явный `@path` → full/ultra по ветке → единственный именованный артефакт → fast-план → fix-план.

```
1. Branch-based full/ultra artifact:
   a. Compute <branch-stem> by replacing "/" with "-".
   b. For workflow.plan_id_format=sequential, glob both:
        <paths.plans>/[0-9][0-9][0-9][0-9]_<branch-stem>.md
        <paths.plans>/[0-9][0-9][0-9][0-9]_<branch-stem>/index.md
      Read every directory candidate and retain it only when `index.md` contains
      exactly one <!-- aif:plan-mode:ultra -->. Choose the highest numeric prefix
      across valid artifacts. If multiple valid candidates exist, emit
      WARN [aif-implement] and name the chosen artifact; if both shapes share
      the highest prefix, prefer ultra.
   c. If no valid sequential candidate exists, or sequential mode is inactive,
      check:
        <paths.plans>/<branch-stem>/index.md
        <paths.plans>/<branch-stem>.md
      Read the directory entrypoint before selection and ignore it unless it
      contains exactly one <!-- aif:plan-mode:ultra -->. If both valid shapes
      exist, emit WARN and prefer the ultra entrypoint.
2. If no branch artifact resolves, count active named artifacts as:
     - each root <paths.plans>/*.md file except resolved paths.plan and paths.fix_plan
     - each direct child <paths.plans>/*/index.md containing <!-- aif:plan-mode:ultra -->
   Exactly one total → use it. More than one → ask the user to choose or use
   @<path>; do not count phase files as independent plans.
3. No named artifact → paths.plan.
4. No regular plan → paths.fix_plan, then redirect to /aif-fix and STOP.
```

- Поиск идёт только в `paths.plans`; `paths.archive/plans` исключён.
- Правило stem в `/aif-plan` (Step 1.2.a): Handoff → `HANDOFF_BRANCH_NAME` с `/`→`-`; git + create_branches →
  `branch_name = <git.branch_prefix><slug>`, stem = `branch_name` с `/`→`-` (например `feature-user-authentication`);
  иначе stem = slug описания (ветки нет, потребители берут единственный план).

## Команды (skills) и аргументы

Префикс: `/aif-*` (Claude Code, Universal и прочие slash-runtimes) или `$aif-*` (Codex CLI / Codex app).
Агент → директория skills: Claude Code `.claude/skills/`, Codex `.agents/skills/` или `.codex/skills/`,
Universal/Antigravity/Codex app `.agents/skills/`.

**Workflow**

| Команда | Назначение |
|---|---|
| `/aif-warmup` | загрузить контекст проекта в начале сессии |
| `/aif-explore [regular\|ultra] [topic or plan name]` | исследование до планирования → `RESEARCH.md` |
| `/aif-grounded <question or task>` | строго проверенный ответ, без изменений |
| `/aif-roadmap [check \| vision or requirements]` | создать/обновить roadmap; `check` — авто-отметка выполненного |
| `/aif-roadmap-next [fast \| full \| ultra]` | рекомендовать следующий объём из roadmap (read-only) |
| `/aif-plan [fast\|full\|ultra] <description>` | создать план; `--list`, `--cleanup <branch>`, `--parallel` |
| `/aif-plan-overview [@path \| plan-name \| --archived]` | read-only обзор плана |
| `/aif-improve [--list] [+check\|--no-check] [@plan-file-or-directory] [prompt]` | доработать план |
| `/aif-implement` | выполнить план (см. варианты ниже) |
| `/aif-verify [--strict]` | проверить полноту реализации |
| `/aif-fix [--fix-now \| --plan-first] [--patch \| --no-patch] [bug description]` | исправить баг + patch |
| `/aif-loop [new\|resume\|status\|stop\|list\|history\|clean] [task or alias]` | итеративный цикл качества |
| `/aif-evolve [skill-name\|"all"] [--global]` | улучшить skills по patches |
| `/aif-swarm [start <goal> \| status \| pause \| resume \| cancel \| inspect \| logs] [run-id]` | параллельная реализация |

```
/aif-implement        # Continue from where you left off
/aif-implement --list # Show available plans only (no execution)
/aif-implement @my-custom-plan.md # Execute using an explicit plan file
/aif-implement @.ai-factory/plans/feature-billing # Execute an ultra bundle
/aif-implement 5      # Start from task #5
/aif-implement status # Check progress
/aif-implement --without-plan add GET /healthz returning {"status":"ok"} # Inline one-shot task, no plan file
```

**Утилиты**

| Команда | Назначение |
|---|---|
| `/aif` | настройка контекста проекта |
| `/aif-architecture [explicit\|structured\|microservices\|layers]` | `ARCHITECTURE.md` |
| `/aif-docs [--web]` | README и `docs/` |
| `/aif-rules [rule text]` / `/aif-rules-check [git ref]` | правила / проверка правил |
| `/aif-commit` | conventional commit |
| `/aif-review [PR number or URL] [+check]` | code review |
| `/aif-archive [list \| --roadmap \| --all \| <plan-name>]` | архивировать планы и roadmap |
| `/aif-reference <url\|path> [...] [--name <ref-name>] [--update]` | справочник знаний |
| `/aif-security-checklist [category]` | аудит безопасности |
| `/aif-qa [...]` / `/aif-qa-check [human \| agent] [<branch>]` | QA-артефакты / проверка |
| `/aif-ci [github\|gitlab] [--enhance]`, `/aif-dockerize [--audit]`, `/aif-build-automation [makefile\|taskfile\|justfile\|mage]` | инфраструктура |

CLI: `ai-factory init [--agents claude,codex] [--mcp playwright,github] [--skills ...]`, `ai-factory update`,
`ai-factory upgrade`, `ai-factory audit-artifacts`.

## Рекомендации для плагина

1. **Читать `config.yaml` первым** и брать пути из `paths.*` с fallback на значения по умолчанию: проекты
   могут перемещать артефакты.
2. **Искать план тем же алгоритмом, что `/aif-implement`**, иначе плагин покажет не тот план, который
   выполнит агент.
3. **Распознавать ultra только по маркеру** `<!-- aif:plan-mode:ultra -->` (ровно один), а не по имени
   директории или локализованной метке `Mode`.
4. **Считать прогресс по чекбоксам**: в single-file плане — в `## Tasks`, в ultra — только в `index.md`.
   Commit-задачи (`<!-- aif:task-kind:commit -->` над строкой) можно показывать отдельно.
5. **Не полагаться на английские заголовки**: при `language.artifacts != en` секции могут называться иначе.
   Надёжнее искать строки-чекбоксы по шаблону и использовать маркеры.
6. **Плагин только читает**: все файлы принадлежат конкретным командам (см. таблицу владельцев).
7. **Префикс команды выбирать по агенту**: `/` для Claude Code и slash-runtimes, `$` для Codex
   (`.ai-factory.json` → `agents[].id`).

## Частые ошибки

- Принять фазу (`### Phase N`) или phase-файл за отдельный план. Phase-файлы не считаются планами.
- Учесть архивные планы: `paths.archive/plans` исключён из поиска; архивный full-план имеет
  `archived:` во frontmatter.
- Посчитать `PLAN.md` или `FIX_PLAN.md` «именованным» планом при подсчёте корневых `*.md` в `plans/`
  (они исключаются, даже если `paths.plan` указывает внутрь `plans/`).
- Без git или при `create_branches: false` поиск по ветке не работает: остаётся единственный именованный
  план или fast-план.
- `FIX_PLAN.md` не выполняется через `/aif-implement`: он перенаправляет в `/aif-fix`.

## Заметки о версиях

- `ultra` — новый режим, строго opt-in; обновление не мигрирует старые планы.
- `workflow.plan_id_format: timestamp|uuid` зарезервированы и пока ведут себя как `slug`.
- Справочник составлен по ветке `2.x` (commit `647f47c`) и skills 2.21.0. При обновлении AI Factory
  выполните `/aif-reference --update --name ai-factory-artifacts`.
