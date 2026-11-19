[← Использование](usage.md) · [Back to README](../README.md) · [Доступ и безопасность →](permissions.md)

# Настройки

## Настройки плагина

Orca → Settings → Plugins → **AI Factory**. Изменения применяются сразу, без перезапуска.

| Ключ | Тип | По умолчанию | Описание |
|------|-----|--------------|----------|
| `defaultAgent` | string | `claude` | Агент, которого Orca запускает, если в workspace агента нет (`claude`, `codex`, …). Допустимы `A-Z a-z 0-9 . _ -`, до 64 символов |
| `sendMode` | enum | `agent-or-launch` | `agent-or-launch` — в запущенного агента, иначе запустить; `always-launch` — всегда новый агент |
| `commandPrefix` | enum | `auto` | `auto` — `$` для Codex, `/` для остальных; `/` или `$` — всегда этот префикс |
| `panelCommands` | string | `plan, implement, verify, review, commit, fix, roadmap, explore` | Кнопки панели по порядку, через запятую; принимаются `plan`, `aif-plan`, `/aif-plan`, а `aif` означает `setup`. Неизвестные игнорируются, пустой список возвращает значение по умолчанию |
| `pollIntervalSec` | integer 1–60 | `3` | Как часто проверять изменения в `.ai-factory/` |
| `notifyOnPlanDone` | boolean | `true` | Уведомление, когда в активном плане отмечена последняя задача |
| `logLevel` | enum | `info` | `debug` / `info` / `warn` / `error` — подробность `orca plugin logs` |

Некорректные значения не ломают плагин: подставляется значение по умолчанию.

Доступные id команд: `setup`, `warmup`, `explore`, `roadmap`, `plan`, `improve`, `implement`, `verify`, `review`, `commit`, `fix`, `docs`.

## Что плагин читает из `.ai-factory/config.yaml`

Плагин уважает перемещённые артефакты проекта. Значения по умолчанию совпадают с AI Factory.

| Ключ | По умолчанию | Используется для |
|------|--------------|------------------|
| `paths.plans` | `.ai-factory/plans/` | Поиск full/ultra-планов |
| `paths.plan` | `.ai-factory/PLAN.md` | Fast-план |
| `paths.fix_plan` | `.ai-factory/FIX_PLAN.md` | Fix-план |
| `paths.roadmap` | `.ai-factory/ROADMAP.md` | Roadmap |
| `paths.archive` | `.ai-factory/archive/` | Исключение архива из поиска |
| `paths.description`, `paths.architecture`, `paths.rules_file`, `paths.rules` | `.ai-factory/…` | Блок «Контекст» |
| `workflow.plan_id_format` | `slug` | `sequential` включает поиск `NNNN_<stem>` |
| `git.enabled` | `true` | `false` отключает поиск плана по ветке |

Правила разбора:

- Пути нормализуются: `\` → `/`, ведущий `./` убирается.
- Абсолютные пути и пути с `..` отклоняются (WARN, значение по умолчанию).
- Symlink, ведущий за пределы workspace, не читается.
- Файлы больше 1 MiB пропускаются с предупреждением.
- Логируется каждое предупреждение один раз за работу worker.

## Язык

| Где | Как выбирается |
|-----|----------------|
| Панель | По языку интерфейса Orca (`orca.locale`): русский или английский |
| Подсказка status bar и сводка | По языку системы |

## Логи

```bash
orca plugin logs <plugin-key>
```

Формат: `LEVEL [aif:<область>] сообщение {json}`. Содержимое файлов и текст аргументов команд не логируются — только пути, id, количества и длины.

## See Also

- [Использование](usage.md) — как настройки влияют на отправку команд
- [Доступ и безопасность](permissions.md) — что плагин может и чего не делает
- [Разработка](development.md) — где в коде настройки и разбор `config.yaml`
