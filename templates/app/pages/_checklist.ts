// The checklist demo's shared rules: one place for the task shape, the
// filter tabs, and text validation. The server module and `bun test` both
// import this; it touches no bindings, so it stays trivially testable.
export interface Task {
  id: number;
  text: string;
  done: boolean;
}

export type Filter = "all" | "active" | "done";

export const FILTERS: readonly Filter[] = ["all", "active", "done"];

export function parseFilter(value: unknown): Filter {
  return value === "active" || value === "done" ? value : "all";
}

export const MAX_TEXT = 200;

// Server-side text rule, mirrored by `maxlength` on the inputs. Returns the
// inline error message, or null when the text is fine.
export function checklistError(text: string): string | null {
  const value = text.trim();
  if (!value) {
    return "Write something first.";
  }
  if ([...value].length > MAX_TEXT) {
    return `Keep it under ${MAX_TEXT} characters.`;
  }
  return null;
}
