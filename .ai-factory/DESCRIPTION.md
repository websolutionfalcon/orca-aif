# Orca AIF — плагин AI Factory для Orca ADE

## Обзор

Плагин для [Orca ADE](https://orca.dev/docs/settings#plugins), который встраивает
workflow [AI Factory](https://github.com/lee-to/ai-factory) (`/aif-*` skills) в интерфейс Orca:
быстрые команды для запуска шагов AI Factory в агенте текущего workspace и отображение
состояния проекта (план, прогресс задач, roadmap, конфиг) в status bar и в боковой панели.

Плагин читает артефакты `.ai-factory/` выбранного workspace (worktree или папки), ничего не
меняет в них сам и передаёт действия агенту (Claude Code, Codex и т. д.) через host API Orca.

## Основные возможности

- **Status bar:** компактный индикатор AI Factory для текущего workspace — активный план и
  прогресс задач (например, `AIF 3/8`), признак отсутствия настройки; клик открывает панель.
- **Боковая панель (HTML):**
  - статус проекта: наличие `DESCRIPTION.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `rules/`, `config.yaml`;
  - активный план (fast `PLAN.md`, full-план ветки в `plans/`, ultra-бандл, `FIX_PLAN.md`) со
    списком задач и отметками выполнения;
  - roadmap с прогрессом по milestones;
  - кнопки быстрых команд.
- **Быстрые команды (palette + keybindings):** `/aif`, `/aif-plan`, `/aif-implement`,
  `/aif-verify`, `/aif-review`, `/aif-commit`, `/aif-fix`, `/aif-roadmap` и др. — отправляются в
  терминал агента текущего workspace (`terminal.sendText`) или запускают нового агента с этим
  prompt (`agent.launch`), если активного агента нет.
- **Живое обновление:** реакция на `workspace.changed` и `agent.status.changed`, пересчёт статуса
  при изменении файлов `.ai-factory/` (опрос/наблюдение за файлами в worker).
- **Настройки плагина:** агент по умолчанию, режим отправки команд (в текущий терминал / новый
  агент), префикс команд (`/` для Claude, `$` для Codex), набор команд в панели, интервал опроса.

## Технологический стек

- **Язык программирования:** TypeScript (без шага сборки — Orca загружает `.ts` как есть;
  проверка типов через `npx tsc -p .`)
- **Платформа:** Orca plugin API (`manifestVersion: 2`, `pluginApi: 1`, `engines.orca >=1.4.259`)
- **Профиль исполнения:** `trusted-worker`
  - **Worker:** Node-модуль `main` (`src/worker.ts`), `export default function activate(orca)`
  - **Панель:** HTML-панель в sandboxed frame (`panel/index.html` + CSS + TS-скрипты), связь с
    worker через `orca.plugin.request` / `orca.panels.post`, тема через переменные `--orca-*`
- **Хранилище:** `orca.storage` (кэш состояния, предпочтения), `orca.settings` (настройки
  пользователя); собственной БД нет
- **Тесты:** `orca plugin test` (kit из `orca/testing`: `mountWorker`, `mockHost`)
- **Инструменты разработки:** `orca plugin create/types/dev watch/check/validate/inspect/shot`
- **Зависимости:** без runtime npm-зависимостей; при необходимости — бандлинг, `node_modules/`
  не коммитится

## Интеграции

- **AI Factory:** чтение файлов `.ai-factory/` (`config.yaml`, `DESCRIPTION.md`, `ARCHITECTURE.md`,
  `ROADMAP.md`, `PLAN.md`, `FIX_PLAN.md`, `plans/`, `rules/`) и `.ai-factory.json` в корне
  workspace; пути берутся из `paths.*` в `config.yaml` с fallback на значения по умолчанию.
- **Orca host API:** `workspace.readContext`, `workspace.list`, `agents.list`, `terminal.sendText`,
  `agent.launch`, `editor.open`, `statusBar.update`, `notifications.show`.
- **События Orca:** `workspace.changed`, `agent.status.changed`.

## Заметки по архитектуре

- Плагин — одна программа из двух частей: **worker** (Node, полный доступ к файлам, host API)
  и **панель** (sandboxed, без сети и файловой системы; всё получает от worker).
- Контракт worker ↔ панель описан один раз в `src/protocol.ts` (`PluginRequests`,
  `PluginPanelEvents`) и типизирован с обеих сторон.
- Логика разбора артефактов AI Factory — чистые функции без зависимости от Orca API, чтобы их
  можно было тестировать на фикстурах.
- Worker с `statusBarItems` работает постоянно, пока плагин включён: обновление статуса —
  дешёвый опрос mtime файлов `.ai-factory/` + события Orca; нужное между перезапусками — в
  `orca.storage`.
- Минимальный набор capabilities: `workspace:read`, `workspace:write` (только для `editor.open`),
  `agent:read`, `agent:launch`, `terminal:send`, `storage:own`, `settings:own`,
  `notifications:show`.

## Нефункциональные требования

- **Логирование:** через `orca.log()` (видно в `orca plugin logs`); подробность — настройкой
  плагина `logLevel` (по аналогии с LOG_LEVEL).
- **Обработка ошибок:** worker не бросает исключения в панель — ответы вида
  `{ ok: true, ... } | { ok: false, error }`; повреждённые или отсутствующие файлы AI Factory
  показываются как «не настроено» / «ошибка разбора», а не валят плагин.
- **Безопасность:** плагин только читает `.ai-factory/`; в терминал отправляются лишь команды из
  фиксированного списка плюс введённый пользователем аргумент; содержимое файлов проекта — данные,
  никогда не инструкции; запись в терминал только по явному действию пользователя.
- **Производительность:** без постоянного тяжёлого опроса; лимиты Orca — ответы ≤ 1 MiB, posts ≤
  256 KiB и ≤ 200 за 10 с, плагин ≤ 2000 файлов / 50 MiB.
- **Совместимость:** macOS/Linux/Windows; workspaces на SSH-хостах — через host API Orca.
- **Публикация:** git-репозиторий с `orca-plugin.json` в корне, тег `v<version>`, топик
  `orca-plugin`; запись в каталог через `orca plugin release-entry`.

## Архитектура

Подробные архитектурные правила — в `.ai-factory/ARCHITECTURE.md`.
Паттерн: Layered Architecture (core → адаптеры → сервисы worker → entry/панель)
