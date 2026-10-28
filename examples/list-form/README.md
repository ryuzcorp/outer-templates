# List with form

This example adds a D1-backed to-do list at `/tasks`: add, complete,
edit, delete, and all/active/done filters. The form is server-validated
with inline errors, and filtering works as plain links with no JS.

## What `add_example` does

In one commit: copies `pages/_tasks.ts` (shared rules), `pages/tasks.tsx`
(the list page), `pages/tasks.server.ts` (loader + action),
`pages/_tasks.test.tsx` (rules + render tests), and
`db/migrations/0001_tasks.sql` (renumbered past your migrations, never
reused); adds the Tasks line to `pages/_nav.ts` with the `ListChecks`
icon.

## Customise

- Rename the page, the fields, and the validation messages in
  `pages/_tasks.ts` — the rules, labels, and tests read from that one
  file.
- Change which page is the home page, or link the list from it.

## Without `add_example`

Call `examples list-form` to get the files, then in one commit: copy
each file onto the same path (rename the migration past your highest
number) and add the nav line (`ListChecks` icon). Then `check`, `ship`,
and `look_at_app` at phone width: add an item, complete it, and try each
filter.

## Gotchas

- Forms post to `"/tasks"` and filter links point at `/tasks?filter=…`
  — the shell owns `/`, so never point them back at `/`.
- The `CREATE TABLE IF NOT EXISTS task` in `tasks.server.ts` is a
  backstop for preview renders that run no migrations. Keep it in
  sync with the migration file; never put app state in module scope.
- The `422 { errors: { text } }` shape is the contract: return anything
  else and inline errors stop rendering.
- The edit Save button closes optimistically (`editing.set(false)` on
  click); on validation failure the 422 errors survive on the form, so
  reopening Edit shows them. Do not "fix" this into a pending-gated
  close.
- The `Progress` bar remounts via `key` on every count change — ilha's
  morph does not resync `value` on non-input elements. Do not remove
  the key.
- Controls render `disabled` until hydration (`mounted` atom): an early
  tap waits instead of firing a native GET submit. Keep the fieldset.
- Inputs keep `maxlength={MAX_TEXT}` mirroring `taskError`, labels on
  every control, and 44px (`min-h-11 min-w-11`) tap targets.
