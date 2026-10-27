// The home page: a polished branded landing for the app as it stands. It
// shows the brand mark, name, and description, plus a neutral "nothing
// here yet" state that looks fine to a real end user who opens the link
// before the app is built. No demo feature, no fake data, and no notes
// aimed at agents or developers — those live in AGENTS.md.
import { BrandMark } from "./layout.tsx";
import { appBrand } from "./_brand.ts";

export default function Home() {
  return (
    <div class="flex flex-col gap-5">
      <section class="card bg-base-100 shadow-sm">
        <div class="card-body items-center gap-3 py-10 text-center sm:py-14">
          <BrandMark />
          <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{appBrand.name}</h1>
          <p class="max-w-sm opacity-70">{appBrand.description}</p>
        </div>
      </section>
      <section aria-label="Coming soon" class="card bg-base-100 shadow-sm">
        <div class="card-body items-center gap-2 py-8 text-center">
          <p role="status" class="text-lg font-medium">
            Nothing here yet
          </p>
          <p class="max-w-xs text-sm opacity-70">
            This app is just getting started — check back soon to see what it becomes.
          </p>
        </div>
      </section>
    </div>
  );
}
