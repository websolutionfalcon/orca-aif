// Texts the worker shows (status bar tooltip, `aif.summary`). English and Russian; the panel has
// its own dictionary in src/ui/i18n.ts.
const EN = {
  name: 'AI Factory',
  noWorkspace: 'No workspace is focused.',
  remote: 'Remote workspace: AI Factory files are not read on remote hosts. Commands still work.',
  notInstalled: 'AI Factory is not set up in this workspace. Run /aif to set it up.',
  error: 'Could not read AI Factory files',
  ambiguous: 'Several plans match; pick one with /aif-implement @<path>.',
  noPlan: 'No active plan. Start one with /aif-plan.',
  plan: 'Plan',
  tasks: 'tasks',
  roadmap: 'Roadmap',
  milestones: 'milestones',
  next: 'Next',
  done: 'All tasks are done.',
  workspace: 'Workspace',
  branch: 'Branch'
}

type Dictionary = typeof EN

const RU: Dictionary = {
  name: 'AI Factory',
  noWorkspace: 'Нет активного workspace.',
  remote: 'Удалённый workspace: файлы AI Factory на удалённых хостах не читаются. Команды работают.',
  notInstalled: 'AI Factory не настроен в этом workspace. Запустите /aif.',
  error: 'Не удалось прочитать файлы AI Factory',
  ambiguous: 'Подходит несколько планов; выберите через /aif-implement @<путь>.',
  noPlan: 'Нет активного плана. Начните с /aif-plan.',
  plan: 'План',
  tasks: 'задач',
  roadmap: 'Roadmap',
  milestones: 'milestones',
  next: 'Далее',
  done: 'Все задачи выполнены.',
  workspace: 'Workspace',
  branch: 'Ветка'
}

export type TextKey = keyof Dictionary

/** Picks the dictionary for a BCP 47 locale; anything but Russian falls back to English. */
export function texts(locale: string | undefined): Dictionary {
  return locale?.toLowerCase().startsWith('ru') ? RU : EN
}
