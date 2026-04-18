"use client";

import { useActionState } from "react";

import type { DeleteEventActionState } from "@/app/admin/actions";

type EventDangerZoneProps = {
  action: (
    state: DeleteEventActionState,
    formData: FormData,
  ) => Promise<DeleteEventActionState>;
};

const initialState: DeleteEventActionState = {};

export function EventDangerZone({ action }: EventDangerZoneProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <section className="admin-card space-y-5 px-6 py-6">
      <div>
        <p className="editorial-label">Danger Zone</p>
        <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em] text-white">
          Delete event
        </h2>
      </div>
      <p className="text-sm leading-7 text-white/58">
        This removes the event record, uploaded originals, generated derivatives,
        and photo metadata.
      </p>
      <form
        action={formAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              "Delete this event and all of its photos? This cannot be undone.",
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <button
          type="submit"
          disabled={pending}
          className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm text-red-100 disabled:opacity-40"
        >
          {pending ? "Deleting..." : "Delete event"}
        </button>
      </form>
      {state.error ? (
        <p className="admin-note-error">{state.error}</p>
      ) : null}
    </section>
  );
}
