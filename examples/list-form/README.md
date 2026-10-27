# List with form

This example adds a D1-backed to-do list at `/tasks`: add, complete,
edit, delete, and all/active/done filters. The form is server-validated
with inline errors, and filtering works as plain links with no JS.

## Steps

1. Call `examples list-form` to get the files, then copy each one onto
   your app at the same path in one `commit` (or `stage` them):
   - `pages/_tasks.ts` — shared rules (task shape, filter parsing, text
     validation). No bindings, so tests import it directly.
   - `pages/tasks.tsx` — the list page at `/tasks` with its own `h1`.
   - `pages/tasks.server.ts` — `loader` (reads D1) plus `action`
     (add/toggle/edit/remove). Validation failures answer `422 {errors}`,
     which the forms render inline.
   - `pages/_tasks.test.tsx` — rules plus render tests.
   - `db/migrations/0001_tasks.sql` — the `task` table. Outer applies it
     when it deploys; never edit it afterwards, add a new migration.
2. If your app already has numbered migrations in `db/migrations/`,
   rename the copied file to the next free number (e.g. `0003_tasks.sql`)
   in the same commit. If the folder holds only `.gitkeep`, keep the name.
3. Add the nav line to `pages/_nav.ts` in the same commit, with the
   `ListChecks` icon:
   `import { House, ListChecks, Settings } from "lucide";`
   `{ href: "/tasks", label: "Tasks", icon: ListChecks },`
   Any icon name from https://lucide.dev/icons works — just import it.
4. Run `check` before shipping (`stage` → `check` → `ship`, or one
   `commit`), then verify with `look_at_app` at phone width: add an item,
   complete it, and try each filter.

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
