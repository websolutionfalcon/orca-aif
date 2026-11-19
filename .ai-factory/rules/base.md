# Базовые правила проекта

> Кода пока нет: правила заданы по выбранному стеку (TypeScript Orca-плагин, worker + HTML-панель) и соглашениям шаблонов Orca. Уточните после появления кода.

## Соглашения об именовании

- Файлы: `camelCase.ts` для модулей (`src/core/plans.ts`), тесты рядом — `*.test.ts`
- Переменные: `camelCase`; константы модуля — `UPPER_SNAKE_CASE` (`STATUS_BAR_ITEM`)
- Функции: `camelCase`, глаголы для действий (`readPlan`, `sendCommand`), существительные для чистых вычислений (`progressOf`)
- Типы и интерфейсы: `PascalCase` (`AifStatus`, `PlanTask`)
- Идентификаторы Orca: команды `aif.<action>` (`aif.implement`), панели и status bar items — короткие kebab/camel id; id плагина не начинается с `orca-`
- Ключи protocol (`PluginRequests`, `PluginPanelEvents`): `<область>.<действие>` (`status.get`, `command.run`, `status.changed`)

## Структура модулей

- `orca-plugin.json` — манифест в корне
- `src/worker.ts` — точка входа worker (`export default function activate(orca)`), только связывание
- `src/protocol.ts` — единый контракт worker ↔ панель
- `src/core/` — чистая логика разбора `.ai-factory/` без импорта Orca API
- `src/worker/` — адаптеры Orca host API, файловой системы, опроса
- `src/ui/` и `panel/` — HTML-панель: разметка, стили, скрипты; не импортирует worker-код, кроме типов из `protocol.ts`
- `.orca/` — генерируемые типы и скриншоты: никогда не редактировать и не коммитить
- Импорты из `orca/worker` — только `import type`

## Обработка ошибок

- Ответы worker на запросы панели — `{ ok: true, ... } | { ok: false, error: string }`; исключения не уходят в панель
- Ошибки фоновых задач перехватываются и пишутся в `orca.log`, worker продолжает работу
- Отсутствующий или нечитаемый артефакт AI Factory — нормальное состояние (`missing` / `invalid`), а не исключение
- Перед вызовом метода новее `engines.orca` — проверка `orca.host.has(method)`

## Порядок выполнения (Control Flow)

- Prefer flat, readable control flow over deeply nested conditionals. Use guard clauses, early `return`/`continue`, small named helper methods, or explicit classification logic when they make the code easier to follow. Handle edge cases and irrelevant branches early so the main path stays visible.

## Логирование

- Только `orca.log(message)` в worker (виден в `orca plugin logs`); никаких `console.log` в коммитах
- Уровень подробности — настройкой плагина; содержимое файлов пользователя и тексты prompt не логировать целиком

## Тесты и проверка

- `orca plugin test . --json` после изменений; `npx tsc -p .` для проверки типов (Orca не проверяет типы при загрузке)
- `orca plugin check . --json` и `orca plugin validate . --json` перед завершением задачи
- Логику `src/core/` покрывать тестами на фикстурах `.ai-factory/`
