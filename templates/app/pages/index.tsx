import { Form, Link, useForm } from "@ilha/void";
import { atom, watch } from "ilha";

import { FILTERS, MAX_TEXT } from "./_checklist.ts";
import type { Filter, Task } from "./_checklist.ts";
import type { Props } from "./index.server.ts";

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  active: "Active",
  done: "Done",
};

function ItemRow({ item }: { item: Task }) {
  const toggle = useForm("/" as string, { intent: "toggle", id: item.id });
  const edit = useForm("/" as string, { intent: "edit", id: item.id, text: item.text });
  const remove = useForm("/" as string, { intent: "remove", id: item.id });
  // Per-row edit mode. Save closes the form right away (optimistic): when
  // validation fails the 422 errors stay on the form, so reopening Edit
  // shows them next to the input.
  const editing = atom(false);
  return (
    <li class="list-row items-center gap-2">
      <Form form={toggle}>
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
        <Form form={edit} class="list-col-grow">
          <div class="join w-full">
            <input
              name="text"
              aria-label={`Edit ${item.text}`}
              maxlength={MAX_TEXT}
              value={edit.data.text}
              oninput={(event) => edit.setData("text", event.currentTarget.value)}
              class="input join-item grow"
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
        <span class={`list-col-grow break-words ${item.done ? "opacity-60 line-through" : ""}`}>
          {item.text}
        </span>
      )}
      {editing() ? null : (
        <button
          type="button"
          onclick={() => editing.set(true)}
          aria-label={`Edit ${item.text}`}
          class="btn btn-ghost"
        >
          Edit
        </button>
      )}
      <Form form={remove}>
        <button
          type="submit"
          disabled={remove.pending}
          aria-label={`Remove ${item.text}`}
          class="btn btn-ghost"
        >
          Remove
        </button>
      </Form>
    </li>
  );
}

export default function Home({ items, filter, counts }: Props) {
  const add = useForm("/" as string, { intent: "add", text: "" });
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
  const remaining = counts.active;
  return (
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body gap-4">
        <div class="flex items-center justify-between gap-2">
          <h1 class="card-title text-2xl">Checklist</h1>
          <span class="badge badge-primary" role="status">
            {remaining ? `${remaining} left` : "All done"}
          </span>
        </div>
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
        <fieldset disabled={!mounted()} class="fieldset gap-4 p-0">
          {items.length ? (
            <ul class="list rounded-box bg-base-200">
              {items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            <div role="status" class="alert alert-soft">
              {filter === "active"
                ? "Nothing left to do. Add the next thing below."
                : filter === "done"
                  ? "Nothing completed yet. Tick something off above."
                  : "Nothing here yet. Add the first item below."}
            </div>
          )}
          <Form form={add} class="join w-full">
            <input
              name="text"
              aria-label="New item"
              placeholder="Add an item"
              maxlength={MAX_TEXT}
              value={add.data.text}
              oninput={(event) => add.setData("text", event.currentTarget.value)}
              class="input join-item grow"
            />
            <button type="submit" disabled={add.pending} class="btn btn-primary join-item">
              {add.pending ? "Adding…" : "Add"}
            </button>
          </Form>
          {add.errors.text ? <p class="text-error">{add.errors.text}</p> : null}
        </fieldset>
      </div>
    </div>
  );
}
