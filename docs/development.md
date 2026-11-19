[← Доступ и безопасность](permissions.md) · [Back to README](../README.md)

# Разработка

## Стек

| Что | Как |
|-----|-----|
| Язык | TypeScript без шага сборки: Orca транспилирует `.ts` при загрузке |
| Платформа | Orca plugin API: `manifestVersion: 2`, `pluginApi: 1`, `engines.orca >=1.4.259` |
| Worker | `src/worker.ts`, `export default function activate(orca)` |
| Панель | HTML (`panel/index.html`) + скрипты `src/ui/*.ts`, связь через `src/protocol.ts` |
| Тесты | `orca plugin test` (`node:test` + `orca/testing`) |
| Зависимости | Нет ни runtime-, ни dev-зависимостей |

## Архитектура

Слоистая: зависимости направлены только вниз. Подробно — в [`.ai-factory/ARCHITECTURE.md`](../.ai-factory/ARCHITECTURE.md).

```
panel/index.html → src/ui/*  ──plugin.request / panels.post──┐
                                                             ▼
src/worker.ts → src/worker/*Service.ts → src/worker/{workspaceFs, orcaHost, watcher}
                         └────────────→ src/core/* (чистые функции) ←────┘
```

| Каталог | Содержимое |
|---------|-----------|
| `src/core/` | `config` (пути), `plans` (поиск и разбор планов), `roadmap`, `status` (модель, status bar, сводка), `commands` (каталог, префикс, санитизация), `i18n` |
| `src/worker/` | `orcaHost` (обёртки host API), `workspaceFs` (чтение с защитой путей, fingerprint), `watcher` (опрос), `statusService`, `commandService`, `settings`, `log` |
| `src/ui/` | `main` (связка с Orca), `state` (редьюсеры), `view` (виртуальное дерево), `dom` (мини-VDOM), `i18n` |
| `src/types/node.d.ts` | Локальные типы используемых API Node |
| `test/fixtures/` | Фикстуры планов и roadmap |

## Почему в репозитории нет `node_modules`

Orca загружает папку плагина целиком. Symlink'и (например, `node_modules/.bin`) и больше 2000 файлов он отклоняет. Поэтому:

- `package.json` содержит только скрипты;
- TypeScript запускается через `npx` из кэша вне папки;
- нужные API Node описаны в `src/types/node.d.ts`. Если используете новый API Node, добавьте его сигнатуру туда.

## Команды

| Команда | Что делает |
|---------|-----------|
| `npm run typecheck` | `npx -y -p typescript@5.9.3 tsc -p .`: Orca типы не проверяет |
| `npm test` | `orca plugin test . --json` — все `*.test.ts` |
| `npm run check` | `orca plugin check . --json` — валидация и запуск worker |
| `npm run validate` | `orca plugin validate . --json` — манифест |
| `orca plugin types .` | Обновить `.orca/types` после обновления Orca |
| `orca plugin inspect . --json` | Доступ и хэш содержимого перед публикацией |

## Dev-цикл

```bash
orca plugin dev load . --json                 # exit 3 → покажет доступ и fingerprint
orca plugin dev load . --approve <fingerprint>
orca plugin dev reload . --json               # после правок
orca plugin logs local.ai-factory
orca plugin shot local.ai-factory --panel aif --out .orca/shots/panel.png
orca plugin shot local.ai-factory --status-bar --out .orca/shots/bar.png
orca plugin dev request . status.get          # вызвать обработчик worker как панель
orca plugin dev emit . workspace.changed --data '{"context":null}'
```

`.orca/` (типы и скриншоты) генерируется и находится в `.gitignore`.

## Тесты

| Файл | Что покрывает |
|------|---------------|
| `src/core/*.test.ts` | Разбор `config.yaml`, планов, ultra, roadmap, статуса, команд; включая собственный `.ai-factory/` репозитория |
| `src/worker/workspaceFs.test.ts` | Чтение во временной папке, выход за пределы workspace, symlink, лимит размера, watcher |
| `src/worker/statusService.test.ts` | Переходы состояний, кэш, уведомление, сериализация обновлений |
| `src/worker/commandService.test.ts` | Все комбинации «агент × аргумент × источник» |
| `src/worker/edgeCases.test.ts` | Битый config, пустые планы, маркеры, Windows-пути, CRLF, смена ветки, однократные WARN |
| `src/worker.test.ts` | Worker целиком через `mountWorker` и `mockHost` |
| `src/ui/*.test.ts` | Редьюсеры и рендер каждого состояния |

HTML-панель не рендерится ни `mount`, ни `orca plugin check`: они работают только с components-панелями. Поэтому `view` — чистая функция, которая возвращает виртуальное дерево, и проверяется напрямую.

## Соглашения

- Ответы worker панели — `Outcome`: `{ ok: true, … } | { ok: false, error }`. Исключения в панель не уходят.
- Логи — только через `createLogger` (`orca.log`). Повторяющиеся предупреждения — через `warnOnce`. Опрос изменений логов не пишет.
- Новый вызов host API → нужное разрешение в манифесте и `orca.host.has()` для методов новее `engines.orca`.
- Правила кода — [`.ai-factory/rules/base.md`](../.ai-factory/rules/base.md).

## Публикация

1. `orca plugin validate . --json` → exit `0`; `orca plugin inspect . --json` — проверить доступ.
2. Поднять `version` в `orca-plugin.json` и `VERSION` в `src/worker.ts`; закоммитить, создать тег `v<version>` и запушить.
3. Добавить репозиторию GitHub-топик `orca-plugin`; для каталога — вывод `orca plugin release-entry . --json`.

## See Also

- [Доступ и безопасность](permissions.md) — защитные меры, которые нельзя ослаблять
- [Настройки](configuration.md) — разбор настроек и `config.yaml`
- [Использование](usage.md) — поведение, которое покрывают тесты
