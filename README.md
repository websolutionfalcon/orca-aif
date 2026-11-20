<p align="center"><img src="assets/icon.png" width="96" alt="AI Factory for Orca"></p>

# AI Factory для Orca

> Workflow [AI Factory](https://github.com/lee-to/ai-factory) прямо в [Orca ADE](https://orca.dev): быстрые команды `/aif-*` и живой статус плана.

Плагин читает `.ai-factory/` текущего workspace и показывает прогресс активного плана в status bar и в боковой панели. Команды AI Factory он отправляет агенту workspace в один клик. Свои файлы проекта плагин никогда не меняет.

## Быстрый старт

```bash
# из GitHub (Orca покажет запрашиваемый доступ и попросит подтверждение)
orca plugin install websolutionfalcon/orca-aif

# или из локальной папки для разработки
orca plugin dev load /path/to/orca-aif
```

Откройте в Orca workspace, где настроен AI Factory (`/aif`): в status bar появится `AIF 3/8`.

## Возможности

- **Статус в status bar** — `AIF 3/8` (в работе), `AIF ✓ 8/8` (готово), `AIF ?` (несколько планов), `AIF !` (ошибка); подсказка с прогрессом roadmap.
- **Боковая панель** — активный план по фазам, следующая задача, roadmap, наличие артефактов; файлы открываются в редакторе Orca.
- **Быстрые команды** — `/aif-plan`, `/aif-implement`, `/aif-verify`, `/aif-review`, `/aif-commit`, `/aif-fix` и др. из палитры команд.
- **Точно как AI Factory** — активный план ищется тем же алгоритмом, что у `/aif-implement`: по ветке, fast/full/ultra/fix, `sequential`-нумерация, пути из `config.yaml`.
- **Claude и Codex** — префикс `/` или `$` выбирается по агенту; если агента нет, плагин запустит его с нужной командой.
- **Живое обновление** — реакция на смену workspace и статус агента, опрос `.ai-factory/` раз в несколько секунд, уведомление о завершении плана.

## Пример

```
Status bar:   ▷ AIF 15/16

Палитра → «AI Factory: Show status»:
AI Factory — Workspace: orca-aif (Branch: feature/orca-aif-plugin)
Plan: План реализации: плагин AI Factory для Orca (full) — 15/16 tasks
Next: Task 16: Проверка в живом Orca
Roadmap: 8/10 milestones · Next: Индикатор в status bar
```

В панели кнопка `/aif-plan` с полем `full add search API` отправит в терминал агента
`/aif-plan full add search API`; для Codex — `$aif-plan full add search API`.

---

## Документация

| Руководство | Описание |
|-------------|----------|
| [Начало работы](docs/getting-started.md) | Требования, установка, первый запуск |
| [Использование](docs/usage.md) | Status bar, панель, команды, отправка агенту |
| [Настройки](docs/configuration.md) | Настройки плагина и пути из `config.yaml` |
| [Доступ и безопасность](docs/permissions.md) | Какие разрешения нужны и зачем |
| [Разработка](docs/development.md) | Архитектура, тесты, dev-цикл |

## Лицензия

[MIT](LICENSE)
