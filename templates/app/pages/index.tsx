import { Form, Link, useForm } from "@ilha/void";
import { atom, batch, watch } from "ilha";

import { FILTERS, MAX_TEXT } from "./_checklist.ts";
import type { Filter, Task } from "./_checklist.ts";
import type { Props } from "./index.server.ts";

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  active: "Active",
  done: "Done",
};

// Starter ideas for an empty list. Tapping one fills the input below — a
// progressive enhancement over the form, which posts to the server and works
// with no JavaScript at all.
const SUGGESTIONS = ["Buy milk", "Water the plants", "Read 20 pages"];

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-5 w-5"
    >
      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-5 w-5"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-16 w-16 text-primary"
    >
      <path d="M24 4c.8 9.6 5.6 15 15.2 16-9.6 1.6-14.4 7.2-15.2 16-.8-8.8-5.6-14.4-15.2-16C18.4 19 23.2 13.6 24 4Z" />
      <path d="M36 32c.4 4 2.4 6.4 6.4 6.8-4 .4-6 2.8-6.4 6.8-.4-4-2.4-6.4-6.4-6.8 4-.4 6-2.8 6.4-6.8Z" />
    </svg>
  );
}

function ItemRow({ item }: { item: Task }) {
  const toggle = useForm("/" as string, { intent: "toggle", id: item.id });
  const edit = useForm("/" as string, { intent: "edit", id: item.id, text: item.text });
  const remove = useForm("/" as string, { intent: "remove", id: item.id });
  // Per-row edit mode. Save closes the form right away (optimistic): when
  // validation fails the 422 errors stay on the form, so reopening Edit
  // shows them next to the input.
  const editing = atom(false);
  return (
    <li class="list-row items-center gap-1">
      <Form form={toggle}>
        {/* 44px tap target; the box itself is the toggle. */}
        <label class="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={item.done}
            disabled={toggle.pending}
            aria-label={item.done ? `Mark ${item.text} as not done` : `Mark ${item.text} as done`}
            onchange={(event) => event.currentTarget.form?.requestSubmit()}
            class="checkbox checkbox-primary"
          />
        </label>
      </Form>
      {editing() ? (
        <Form form={edit} class="list-col-grow min-w-0">
          <div class="join w-full">
            <input
              name="text"
              aria-label={`Edit ${item.text}`}
              maxlength={MAX_TEXT}
              value={edit.data.text}
              oninput={(event) => edit.setData("text", event.currentTarget.value)}
              class="input join-item min-w-0 grow"
            />
            <button
              type="submit"
              disabled={edit.pending}
              onclick={() => editing.set(false)}
              class="btn btn-primary join-item"
            >
              {edit.pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onclick={() => editing.set(false)}
              class="btn btn-ghost join-item"
            >
              Cancel
            </button>
          </div>
          {edit.errors.text ? <p class="text-error mt-1">{edit.errors.text}</p> : null}
        </Form>
      ) : (
        <span
          class={`list-col-grow min-w-0 break-words ${item.done ? "opacity-60 line-through" : ""}`}
        >
          {item.text}
        </span>
      )}
      {editing() ? null : (
        <button
          type="button"
          onclick={() => editing.set(true)}
          aria-label={`Edit ${item.text}`}
          title="Edit"
          class="btn btn-ghost btn-square min-h-11 min-w-11"
        >
          <PencilIcon />
        </button>
      )}
      <Form form={remove}>
        <button
          type="submit"
          disabled={remove.pending}
          aria-label={`Remove ${item.text}`}
          title="Remove"
          class="btn btn-ghost btn-square min-h-11 min-w-11"
        >
          <TrashIcon />
        </button>
      </Form>
    </li>
  );
}
// The progress fill: ilha's morph leaves `value` to live state on anything
// but a real input (only `morphInput` resyncs it), so an in-place update
// would keep the value it mounted with and never paint the fill. A keyed
// component remounts on every count change instead, painting fresh markup
// with the right value each time.
function Progress({ done, total }: { done: number; total: number }) {
  return (
    <progress
      class="progress progress-primary w-full"
      value={done}
      max={total}
      aria-label={`${done} of ${total} done`}
    />
  );
}

export default function Home({ items, filter, counts }: Props) {
  const add = useForm("/" as string, { intent: "add", text: "" });
  // A successful add leaves the typed text in the box (form state survives
  // the prop refresh), so clear it once per success. Validation failures
  // never set `wasSuccessful`, so the text stays for fixing. This is
  // `setData`, not `reset`: success snapshots the data as the new baseline,
  // so `reset` would restore the just-submitted text. `cleared` makes the
  // clear one-shot: `wasSuccessful` stays set until the next submit, and a
  // render in between must not wipe text typed for that submit. Without JS
  // the server redirect already returns an empty input, so this only runs
  // hydrated.
  const cleared = atom(false);
  if (add.pending && cleared()) {
    cleared.set(false);
  }
  if (add.wasSuccessful && !cleared() && add.data.text !== "") {
    batch(() => {
      cleared.set(true);
      add.setData("text", "");
    });
  }
  // The forms are server-rendered, but their handlers exist only after the
  // client hydrates: a click before that would be lost. Controls stay
  // disabled until then.
  const mounted = atom(false);
  watch.once(() => {
    if (typeof window === "undefined") {
      return;
    }
    mounted.set(true);
  });
  const total = counts.all;
  const done = counts.done;
  // The pill reports progress, never a false celebration: nothing when the
  // list is empty, "All done" only with ≥1 item and zero left.
  const pill = total === 0 ? null : done === total ? "All done" : `${done} of ${total} done`;

  function suggest(text: string) {
    add.setData("text", text);
    if (typeof document !== "undefined") {
      document.getElementById("new-item")?.focus();
    }
  }

  return (
    <div class="flex flex-col gap-5">
      <section class="card bg-base-100 shadow-sm">
        <div class="card-body gap-4">
          <div class="flex items-center justify-between gap-2">
            <h1 class="card-title text-2xl sm:text-3xl">Checklist</h1>
            {pill ? (
              <span role="status" class="badge badge-primary shrink-0">
                {pill}
              </span>
            ) : null}
          </div>
          {/* Progress in the brand accent. Hidden until the first item —
            an empty list has nothing to measure. Keyed by count (see
            `Progress`): each change remounts with a fresh `value`. */}
          {total ? <Progress key={`${done}/${total}`} done={done} total={total} /> : null}
          {/* Filter tabs are plain links with a query param, so filtering
            works without JavaScript: the loader reads `?filter=` and the
            server renders the matching rows. */}
          <nav aria-label="Filter tasks" class="join w-full">
            {FILTERS.map((value) => (
              <Link
                key={value}
                href={value === "all" ? "/" : `/?filter=${value}`}
                aria-current={filter === value ? "page" : undefined}
                class={`btn join-item flex-1 ${filter === value ? "btn-primary" : "btn-ghost"}`}
              >
                {FILTER_LABEL[value]} (
                {value === "all" ? counts.all : value === "active" ? counts.active : counts.done})
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <section aria-label="Tasks" class="card bg-base-100 shadow-sm">
        <div class="card-body gap-4">
          <fieldset disabled={!mounted()} class="fieldset gap-4 p-0">
            {items.length ? (
              <ul class="list rounded-box bg-base-200">
                {items.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </ul>
            ) : filter === "all" ? (
              <div role="status" class="flex flex-col items-center gap-3 py-8 text-center">
                <SparkIcon />
                <p class="text-lg font-medium">A fresh list</p>
                <p class="max-w-xs text-sm opacity-70">
                  Add the first thing below — or start from one of these.
                </p>
                <div class="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((text) => (
                    <button
                      key={text}
                      type="button"
                      onclick={() => suggest(text)}
                      class="btn btn-soft btn-sm min-h-11"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div role="status" class="alert alert-soft">
                {filter === "active"
                  ? "Nothing left to do. Enjoy the clear list — or add the next thing below."
                  : "Nothing completed yet. Tick something off and it shows up here."}
              </div>
            )}
            <Form form={add} class="join w-full">
              <input
                id="new-item"
                name="text"
                aria-label="New item"
                placeholder="Add an item"
                maxlength={MAX_TEXT}
                value={add.data.text}
                oninput={(event) => add.setData("text", event.currentTarget.value)}
                class="input join-item min-w-0 grow"
              />
              <button type="submit" disabled={add.pending} class="btn btn-primary join-item">
                {add.pending ? "Adding…" : "Add"}
              </button>
            </Form>
            {add.errors.text ? <p class="text-error">{add.errors.text}</p> : null}
          </fieldset>
        </div>
      </section>
    </div>
  );
}
