[Back to README](../README.md) · [Использование →](usage.md)

# Начало работы

## Требования

| Что | Версия | Зачем |
|-----|--------|-------|
| Orca ADE | `>=1.4.259` | `engines.orca` в `orca-plugin.json` |
| Включённые плагины | Settings → Plugins → «Turn on plugins» | Иначе `plugin_system_disabled` |
| AI Factory в проекте | любая с `.ai-factory/` | Без него индикатор скрыт, в панели — кнопка `/aif` |
| Агент | Claude Code, Codex или другой slash-агент | Получатель команд |

## Установка

### Из GitHub

```bash
orca plugin install websolutionfalcon/orca-aif
```

Без версии Orca ставит последний тег `vX.Y.Z`, иначе — ветку по умолчанию. Плагин запускает код, поэтому первая попытка завершится `approval_required` (exit `3`) со списком доступа и готовой командой:

```bash
orca plugin install websolutionfalcon/orca-aif --approve <fingerprint>
```

Подтверждайте, только если согласны с доступом из [Доступ и безопасность](permissions.md). То же можно сделать в Orca: Settings → Plugins (`Cmd-Shift-X` / `Ctrl-Shift-X`).

### Из локальной папки (разработка)

```bash
git clone https://github.com/websolutionfalcon/orca-aif.git
orca plugin dev load ./orca-aif            # покажет доступ и fingerprint
orca plugin dev load ./orca-aif --approve <fingerprint>
```

Правки кода в dev-папке подхватываются без повторного согласия. Новый доступ, новые команды или клавиши требуют нового подтверждения.

## Первый запуск

1. Откройте в Orca workspace с `.ai-factory/` (если его нет — выполните в агенте `/aif`).
2. В status bar появится индикатор: `AIF` (нет плана) или `AIF 3/8` (план в работе).
3. Откройте правую боковую панель и вкладку **AI Factory** (иконка ракеты) — или команду палитры «AI Factory: Show or hide the right sidebar».
4. Нажмите кнопку команды, например `/aif-implement`: она уйдёт в терминал агента workspace, а если агента нет — Orca запустит его с этой командой.

## Проверка

```bash
orca plugin list --json            # local.ai-factory / <owner>.ai-factory включён
orca plugin logs <plugin-key>      # INFO [aif:worker] activated v0.2.1
```

Ожидаемые строки лога после активации:

```
INFO [aif:worker] activated v0.2.1 {"locale":"en-US"}
INFO [aif:status] no-workspace -> in-progress {"reason":"activate"}
INFO [aif:watch] watching workspace {"workspace":"…","intervalSec":3}
```

## Если что-то не так

| Симптом | Причина и решение |
|---------|-------------------|
| Индикатора нет | В workspace нет `.ai-factory/` и `.ai-factory.json` — индикатор скрыт намеренно |
| `AIF ?` | Подходит несколько планов; укажите нужный: `/aif-implement @<путь>` |
| `AIF !` | Не удалось прочитать файлы workspace — подробности в подсказке и в логе |
| Статус «удалённый workspace» | Файлы на SSH-хостах не читаются; команды работают |
| `plugin_system_disabled` | Включите плагины в Settings → Plugins |

## See Also

- [Использование](usage.md) — что показывает плагин и как отправлять команды
- [Настройки](configuration.md) — агент по умолчанию, префикс, интервал опроса
- [Доступ и безопасность](permissions.md) — что именно вы подтверждаете
