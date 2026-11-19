# AGENTS.md

> Карта проекта для AI-агентов. Обновляйте при значительных изменениях структуры.

## Обзор проекта

Плагин для Orca ADE, встраивающий workflow AI Factory: быстрые команды `/aif-*` для агента текущего workspace и отображение статуса `.ai-factory/` в status bar и боковой панели. Подробности — в `.ai-factory/DESCRIPTION.md`.

## Технологический стек

- **Язык программирования:** TypeScript (без шага сборки)
- **Платформа:** Orca plugin API (`trusted-worker`: Node worker + HTML-панель)
- **База данных:** нет (`orca.storage` / `orca.settings`)
- **ORM:** нет

## Структура проекта

```
orca-aif/
├── orca-plugin.json             # Манифест плагина (команды, панель, status bar, настройки, capabilities)
├── package.json                 # Только dev-скрипты: typecheck/test/check/validate; зависимостей нет
├── tsconfig.json                # extends ./.orca/types/tsconfig.json
├── LICENSE                      # MIT
├── assets/icon.png              # Иконка плагина 256×256
├── panel/                       # HTML-панель: index.html + panel.css (переменные --orca-*)
├── src/
│   ├── worker.ts                # Точка входа worker: связывание сервисов, команды, события, запросы панели
│   ├── protocol.ts              # Контракт worker ↔ панель
│   ├── core/                    # Чистая логика: config, plans (поиск плана), roadmap, status, commands, i18n
│   ├── worker/                  # Адаптеры и сервисы: orcaHost, workspaceFs, watcher, statusService, commandService, settings, log
│   ├── ui/                      # Скрипты панели: main, state, view, dom (мини-VDOM), i18n
│   └── types/node.d.ts          # Локальные типы API Node (без node_modules в папке плагина)
├── test/fixtures/               # Фикстуры планов и roadmap для тестов core
├── .ai-factory/                 # Контекст AI Factory (DESCRIPTION, ARCHITECTURE, ROADMAP, plans/, references/, rules/)
├── .claude/                     # aif-* skills, orca-plugin-authoring, субагенты
├── .mcp.json                    # MCP-серверы (chromeDevtools, playwright)
└── .orca/                       # Генерируется `orca plugin types` и `shot` — не редактировать, в .gitignore
```

## Ключевые точки входа

| Файл | Назначение |
|------|------------|
| `orca-plugin.json` | Манифест плагина: команды, панель, status bar, настройки, capabilities |
| `src/worker.ts` | Точка входа worker: `export default function activate(orca)` |
| `src/protocol.ts` | Типизированный контракт worker ↔ панель |
| `panel/index.html` | Точка входа HTML-панели (загружает `src/ui/main.ts`) |
| `src/core/plans.ts` | Поиск активного плана (как `/aif-implement`) и разбор планов |
| `.ai-factory/config.yaml` | Настройки AI Factory для этого репозитория |

## Документация

| Документ | Путь | Описание |
|----------|------|----------|
| README | README.md | Лендинг плагина: установка, возможности |
| Начало работы | `docs/getting-started.md` | Требования, установка, первый запуск |
| Использование | `docs/usage.md` | Status bar, панель, команды, отправка агенту |
| Настройки | `docs/configuration.md` | Настройки плагина и пути config.yaml |
| Доступ и безопасность | `docs/permissions.md` | Разрешения и защитные меры |
| Разработка | `docs/development.md` | Архитектура, тесты, dev-цикл, публикация |
| Гайд по плагинам Orca | `.claude/skills/orca-plugin-authoring/SKILL.md` | Официальный гайд; справочники через `orca skills get` |

## Файлы AI-контекста

| Файл | Назначение |
|------|------------|
| AGENTS.md | Карта структуры проекта для агентов |
| .ai-factory/DESCRIPTION.md | Спецификация проекта и стек |
| .ai-factory/ARCHITECTURE.md | Архитектурные решения и правила зависимостей |
| .ai-factory/rules/base.md | Соглашения по коду |
| CLAUDE.md | Отсутствует |

## Правила для агентов

- Не объединяйте shell-команды через `&&` — выполняйте их по одной.
  - Неправильно: `git checkout main && git pull`
  - Правильно: сначала `git checkout main`, затем `git pull origin main`
- Для любых изменений плагина используйте skill `orca-plugin-authoring`; команды `orca plugin ...` вызывайте с `--json`.
- Никогда не передавайте `--approve` без явного согласия пользователя на конкретный плагин и список доступа.
- Не редактируйте и не коммитьте `.orca/` (генерируемые типы и скриншоты).
- Не устанавливайте npm-пакеты в корень: `node_modules/` ломает загрузку плагина в Orca. Проверка типов — `npm run typecheck`, тесты — `npm test`.
