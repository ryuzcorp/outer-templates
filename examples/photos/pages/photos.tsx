// The photos page: an upload card plus a newest-first feed. The feed shows
// the newest upload first; an empty feed invites the first upload.
import { Form, useForm } from "@ilha/void";

import type { Props } from "./photos.server.ts";

type Photo = Props["photos"][number];

function PhotoCard({ photo }: { photo: Photo }) {
  const caption = photo.caption === "" ? "A photo shared in this app" : photo.caption;
  return (
    <figure class="card bg-base-100 shadow-sm">
      <img
        src={`/photos/${photo.key}`}
        alt={caption}
        class="aspect-video w-full rounded-t-2xl object-cover"
        loading="lazy"
      />
      <figcaption class="card-body gap-1 py-3">
        <p class="break-words text-sm">{caption}</p>
        <p class="text-xs opacity-70">{photo.created_at}</p>
      </figcaption>
    </figure>
  );
}

export default function PhotosPage({ photos, storageReady }: Props) {
  const form = useForm("/photos", { caption: "", photo: null as File | null });

  function onFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    form.setData("photo", input.files?.[0] ?? null);
  }

  return (
    <div class="flex flex-col gap-5">
      <section aria-label="Upload a photo" class="card bg-base-100 shadow-sm">
        <div class="card-body gap-4">
          <h1 class="text-2xl font-bold tracking-tight">Photos</h1>
          <p class="text-sm opacity-70">Share a photo with everyone who opens this app.</p>
          {storageReady ? null : (
            <div role="alert" class="alert alert-error alert-soft">
              <span>
                Photo storage is not set up yet. The app owner needs to add the R2 binding, then
                redeploy.
              </span>
            </div>
          )}
          <Form form={form} enctype="multipart/form-data" class="flex flex-col gap-3">
            <div class="fieldset gap-1">
              <label class="fieldset-legend" for="photo-caption">
                Caption
              </label>
              <input
                id="photo-caption"
                name="caption"
                type="text"
                maxlength={280}
                placeholder="Say something about this photo"
                autocomplete="off"
                value={form.data.caption as string}
                oninput={(event) =>
                  form.setData("caption", (event.currentTarget as HTMLInputElement).value)
                }
                class="input w-full"
              />
            </div>
            <div class="fieldset gap-1">
              <label class="fieldset-legend" for="photo-file">
                Image
              </label>
              <input
                id="photo-file"
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                onchange={onFileChange}
                class="file-input w-full"
              />
              {form.errors.photo ? <p class="text-sm text-error">{form.errors.photo}</p> : null}
            </div>
            {form.error ? (
              <div role="alert" class="alert alert-error alert-soft">
                <span>{form.error.message}</span>
              </div>
            ) : null}
            <button type="submit" disabled={form.pending} class="btn btn-primary min-h-11 w-full">
              {form.pending ? "Uploading…" : "Upload photo"}
            </button>
          </Form>
        </div>
      </section>
      <section aria-label="Photo feed" class="flex flex-col gap-4">
        {photos.length === 0 ? (
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body items-center gap-2 py-8 text-center">
              <p role="status" class="text-lg font-medium">
                No photos yet
              </p>
              <p class="max-w-xs text-sm opacity-70">
                Be the first to share one — pick an image above and tap Upload photo.
              </p>
            </div>
          </div>
        ) : (
          photos.map((photo) => <PhotoCard key={photo.key} photo={photo} />)
        )}
      </section>
    </div>
  );
}
