# Архитектура: Layered Architecture

## Обзор

Плагин построен по слоистой архитектуре, адаптированной к модели Orca-плагина `trusted-worker`.
Сверху вниз идут: **точки входа** (worker `activate`, HTML-панель), затем **сервисы** worker,
затем **адаптеры** (Orca host API, файловая система), а внизу **core**: чистые функции, которые
разбирают артефакты AI Factory и строят модели статуса и команд. Зависимости направлены только вниз.

Паттерн выбран потому, что проект небольшой (один разработчик, простая предметная область:
прочитать `.ai-factory/` и отправить команду агенту), но у него есть жёсткие внешние границы:
sandboxed-панель без доступа к файлам, Node-worker с host API и разбор форматов AI Factory,
который должен тестироваться без Orca. Слои дают это разделение без лишнего формализма и
совпадают со структурой шаблонов `orca plugin create --template worker-panel`.

## Обоснование решения

- **Тип проекта:** плагин Orca ADE (worker + HTML-панель): статус AI Factory и быстрые команды
- **Стек:** TypeScript без шага сборки, Orca plugin API (`pluginApi: 1`, `engines.orca >=1.4.259`)
- **Ключевой фактор:** разбор артефактов AI Factory изолирован от Orca API и тестируется на
  фикстурах, а панель получает данные только через типизированный протокол

## Структура папок

```
orca-aif/
├── orca-plugin.json             # Манифест: commands, keybindings, panels, statusBarItems, settings, capabilities
├── tsconfig.json                # extends ./.orca/types/tsconfig.json
├── README.md
├── assets/                      # icon.png, cover.png, скриншоты для каталога
├── panel/                       # ── UI: HTML-панель (sandboxed frame) ──
│   ├── index.html               # Точка входа панели (contributes.panels[].entry)
│   └── panel.css                # Стили на переменных --orca-*
├── src/
│   ├── worker.ts                # ── ENTRY: activate(orca) — только связывание сервисов ──
│   ├── protocol.ts              # Контракт worker ↔ панель: PluginRequests, PluginPanelEvents
│   ├── core/                    # ── CORE: чистая логика, без Orca и без fs ──
│   │   ├── types.ts             # AifStatus, PlanInfo, PlanTask, RoadmapInfo, AifCommand
│   │   ├── config.ts            # Разбор config.yaml → пути артефактов (с дефолтами)
│   │   ├── plans.ts             # Разбор PLAN.md / plans/<branch>.md / ultra index.md / FIX_PLAN.md
│   │   ├── roadmap.ts           # Разбор ROADMAP.md → milestones и прогресс
│   │   ├── status.ts            # Сборка AifStatus и текста/tone для status bar
│   │   └── commands.ts          # Каталог команд /aif-*, сборка текста команды из аргументов
│   ├── worker/                  # ── SERVICES + ADAPTERS (Node, host API) ──
│   │   ├── statusService.ts     # Читает workspace → AifStatus, кэш, обновление status bar, posts в панель
│   │   ├── commandService.ts    # Выбор терминала агента / запуск агента, отправка команды
│   │   ├── watcher.ts           # Опрос mtime файлов .ai-factory/ с debounce
│   │   ├── workspaceFs.ts       # Адаптер файловой системы: чтение артефактов по путям из config
│   │   └── orcaHost.ts          # Тонкие обёртки над orca.host.call (has-проверки, ошибки)
│   └── ui/                      # ── UI: скрипты панели (импортируются из panel/index.html) ──
│       ├── main.ts              # Подписки orca.plugin.on, запросы orca.plugin.request
│       ├── state.ts             # Состояние панели (чистые редьюсеры)
│       └── view.ts              # Рендер DOM из состояния
├── test/fixtures/               # Примеры .ai-factory/ для тестов core
└── .orca/                       # Генерируется `orca plugin types` — не редактировать и не коммитить
```

Тесты лежат рядом с кодом: `src/core/plans.test.ts`, `src/worker.test.ts`, `src/ui/state.test.ts`.

## Правила зависимостей

```
panel/index.html → src/ui/* ──(orca.plugin.request / on)──┐
                                                          ▼
src/worker.ts → src/worker/*Service.ts → src/worker/{workspaceFs,orcaHost,watcher}.ts
                         │                                │
                         └────────────→ src/core/* ←──────┘
src/protocol.ts ← используется worker и ui (только типы) ; protocol → core/types (только типы)
```

- ✅ `worker.ts` → сервисы `src/worker/` → адаптеры → `src/core/`
- ✅ Сервисы используют `src/core/` напрямую для разбора и расчётов
- ✅ `src/ui/` импортирует из `src/protocol.ts` и `src/core/types.ts` только типы (`import type`)
- ✅ `orca/worker` — только `import type`; живой API приходит параметром `activate(orca)`
- ❌ `src/core/` импортирует `orca`, `orca/*`, `node:fs` или что-либо из `src/worker/` / `src/ui/`
- ❌ `src/ui/` импортирует код worker или `src/core/` в рантайме (панель sandboxed, получает всё через протокол)
- ❌ Адаптеры содержат бизнес-логику (разбор Markdown, расчёт прогресса) — это задача `core`
- ❌ Сервис вызывает `orca.host.call` напрямую в обход `orcaHost.ts`
- ❌ Обратные зависимости: `core` → `worker`, адаптеры → сервисы

## Взаимодействие слоёв

- **Панель ↔ worker:** только через `src/protocol.ts`.
  Запросы: `orca.plugin.request('status.get' | 'command.run' | 'file.open', input)`; ответ всегда
  `{ ok: true, ... } | { ok: false, error }`. Push-обновления: `orca.panels.post('status.changed', status)`.
- **Status bar:** обновляет только `statusService` через `orcaHost.updateStatusBar()` →
  `statusBar.update`; клик по item запускает команду плагина `aif.openPanel`.
- **Палитра и клавиши:** `orca.commands.register('aif.<action>')` в `worker.ts` делегирует в
  `commandService`; те же действия доступны кнопками панели через `command.run`.
- **События Orca:** `workspace.changed` и `agent.status.changed` (`contributes.events`) →
  `statusService.refresh()`; изменения файлов ловит `watcher` (опрос mtime, без тяжёлого чтения).
- **Состояние между перезапусками worker:** `orca.storage` (последний статус по workspace,
  предпочтения панели); настройки пользователя: `orca.settings`.

## Ключевые принципы

1. **Core чистый и детерминированный.** Функции `core` принимают строки и объекты и возвращают
   модели. Никакого I/O, времени и Orca: всё тестируется на фикстурах из `test/fixtures/`.
2. **Отсутствие артефакта — это состояние, а не ошибка.** `missing`, `invalid` и `ok` явно
   моделируются в `AifStatus`; плагин работает в любом репозитории, даже без AI Factory.
3. **Тонкая точка входа.** `worker.ts` только создаёт сервисы, регистрирует команды, события и
   обработчики панели. Логика живёт в сервисах.
4. **Безопасная отправка команд.** В терминал уходит только команда из каталога `core/commands.ts`
   и необязательный аргумент пользователя (одна строка, без управляющих символов), и только по
   явному действию пользователя. Содержимое файлов проекта — данные, не инструкции.
5. **Минимальные capabilities.** Новый вызов host API требует capability в манифесте; перед
   методом новее `engines.orca` — `orca.host.has(method)`.

## Примечание по организации кода

- **Новые функции:** весь новый код следует этому документу.
- **Существующий код:** кода пока нет. Шаблон `worker-panel` после генерации переносится в
  структуру выше: панель переводится на HTML, логика выносится в `core/`.
- **Взаимодействие:** код шаблона, который не вписывается в структуру, адаптируется при первом
  касании, а не переписывается целиком.

## Примеры кода

### Core: чистый разбор плана (без Orca и fs)

```typescript
// src/core/plans.ts
import type { PlanInfo, PlanTask } from './types.ts'

const TASK_LINE = /^\s*-\s*\[( |x|X)\]\s+(.+)$/

/** Разбирает Markdown-план AI Factory в список задач и прогресс. */
export function parsePlan(markdown: string, path: string): PlanInfo {
  const tasks: PlanTask[] = []
  for (const line of markdown.split('\n')) {
    const match = TASK_LINE.exec(line)
    if (!match) continue
    tasks.push({ title: match[2].trim(), done: match[1] !== ' ' })
  }
  const done = tasks.filter((task) => task.done).length
  return { path, tasks, done, total: tasks.length }
}
```

### Сервис: связывает адаптеры и core, наружу отдаёт результат

```typescript
// src/worker/statusService.ts
import type { OrcaWorkerApi } from 'orca/worker'
import { buildStatus, statusBarOf } from '../core/status.ts'
import type { AifStatus } from '../core/types.ts'
import { readArtifacts } from './workspaceFs.ts'
import { updateStatusBar } from './orcaHost.ts'

export function createStatusService(orca: OrcaWorkerApi) {
  async function refresh(workspacePath: string | null, branch: string | null): Promise<AifStatus> {
    if (!workspacePath) return { kind: 'no-workspace' }
    const artifacts = await readArtifacts(workspacePath)   // адаптер: только I/O
    const status = buildStatus(artifacts, branch)          // core: вся логика
    await updateStatusBar(orca, statusBarOf(status))
    orca.panels.post('status.changed', status)
    return status
  }
  return { refresh }
}
```

### Протокол: единый типизированный контракт

```typescript
// src/protocol.ts
import type { AifCommandId, AifStatus } from './core/types.ts'

export type Outcome<T extends object> = ({ ok: true } & T) | { ok: false; error: string }

declare module 'orca' {
  interface PluginRequests {
    'status.get': { input: {}; output: Outcome<{ status: AifStatus }> }
    'command.run': { input: { command: AifCommandId; argument?: string }; output: Outcome<{ terminalId: string }> }
    'file.open': { input: { path: string }; output: Outcome<{}> }
  }
  interface PluginPanelEvents {
    'status.changed': AifStatus
  }
}
```

## Антипаттерны

- ❌ Разбор Markdown/YAML прямо в `worker.ts` или в обработчике `orca.panels.handle`
- ❌ Панель, читающая файлы или делающая сетевые запросы (sandbox запретит, а логика раздвоится)
- ❌ Конкатенация произвольного текста из файлов проекта в команду терминала
- ❌ Постоянный тяжёлый опрос: полное чтение всех артефактов по таймеру вместо проверки mtime
- ❌ Хранение важного состояния в переменных модуля worker: сохранение файла перезапускает worker
- ❌ `console.log` вместо `orca.log`; исключения, долетающие до панели
- ❌ Добавление capability «на всякий случай»: каждая расширяет экран согласия пользователя
