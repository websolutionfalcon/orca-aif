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

Код плагина ещё не создан (стартовый шаблон: `orca plugin create . --template worker-panel`, панель переводится на HTML). Сейчас в репозитории только контекст AI Factory:

```
orca-aif/
├── .ai-factory/                 # Контекст AI Factory
│   ├── config.yaml              # Настройки AI Factory (язык ru, git-ветки)
│   ├── DESCRIPTION.md           # Спецификация проекта
│   ├── ARCHITECTURE.md          # Архитектура (Layered) и правила зависимостей
│   └── rules/base.md            # Базовые правила кода
├── .ai-factory.json             # Состояние установки AI Factory (managed)
├── .claude/
│   ├── skills/                  # aif-* skills + orca-plugin-authoring
│   └── agents/                  # Субагенты AI Factory
├── .mcp.json                    # MCP-серверы (chromeDevtools, playwright)
└── AGENTS.md                    # Этот файл
```

Целевая структура плагина — в `.ai-factory/ARCHITECTURE.md`.

## Ключевые точки входа

| Файл | Назначение |
|------|------------|
| `orca-plugin.json` (план) | Манифест плагина: команды, панель, status bar, настройки, capabilities |
| `src/worker.ts` (план) | Точка входа worker: `export default function activate(orca)` |
| `src/protocol.ts` (план) | Типизированный контракт worker ↔ панель |
| `panel/index.html` (план) | Точка входа HTML-панели |
| `.ai-factory/config.yaml` | Настройки AI Factory для этого репозитория |

## Документация

| Документ | Путь | Описание |
|----------|------|----------|
| README | README.md | Пока отсутствует; будет создан через `/aif-docs` |
| Гайд по плагинам Orca | `.claude/skills/orca-plugin-authoring/SKILL.md` | Официальный гайд; справочники: `orca skills get orca-plugin-authoring --reference references/<file>.md` |

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
