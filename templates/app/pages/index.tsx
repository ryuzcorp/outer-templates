import { Form, useForm } from "@ilha/void";
import { atom, watch } from "ilha";

import type { Item, Props } from "./index.server.ts";

function ItemRow({ item }: { item: Item }) {
  const remove = useForm("/" as string, { intent: "remove", id: item.id });
  return (
    <li class="list-row items-center">
      <span class="list-col-grow">{item.text}</span>
      <Form form={remove}>
        <button
          type="submit"
          disabled={remove.pending}
          aria-label={`Remove ${item.text}`}
          class="btn btn-ghost btn-sm"
        >
          Remove
        </button>
      </Form>
    </li>
  );
}

export default function Home({ items }: Props) {
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
  return (
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body gap-4">
        <div class="flex items-center justify-between gap-2">
          <h1 class="card-title text-2xl">My list</h1>
          <span class="badge badge-neutral">{items.length}</span>
        </div>
        <fieldset disabled={!mounted()} class="fieldset gap-4 p-0">
          {items.length ? (
            <ul class="list rounded-box bg-base-200">
              {items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            <div role="status" class="alert alert-soft">
              Nothing here yet. Add the first item below.
            </div>
          )}
          <Form form={add} class="join w-full">
            <input
              name="text"
              aria-label="New item"
              placeholder="Add an item"
              maxlength={200}
              value={add.data.text}
              oninput={(event) => add.setData("text", event.currentTarget.value)}
              class="input join-item grow"
            />
            <button type="submit" disabled={add.pending} class="btn btn-primary join-item">
              Add
            </button>
          </Form>
          {add.errors.text ? <p class="text-error">{add.errors.text}</p> : null}
        </fieldset>
      </div>
    </div>
  );
}
