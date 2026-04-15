"use client";

import { useActionState } from "react";

import type { AuthActionState } from "@/app/admin/actions";

type AuthFormProps = {
  title: string;
  description: string;
  action: (
    state: AuthActionState,
    formData: FormData,
  ) => Promise<AuthActionState>;
  includeDisplayName?: boolean;
  submitLabel: string;
};

const initialState: AuthActionState = {};

export function AuthForm({
  title,
  description,
  action,
  includeDisplayName = false,
  submitLabel,
}: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="admin-card mx-auto w-full max-w-lg space-y-6 px-6 py-8 sm:px-8">
      <div className="space-y-3">
        <p className="editorial-label">Admin</p>
        <h1 className="font-serif text-4xl tracking-[-0.03em] text-white">
          {title}
        </h1>
        <p className="text-sm leading-7 text-white/58">{description}</p>
      </div>

      <div className="space-y-4">
        {includeDisplayName ? (
          <label className="block space-y-2">
            <span className="text-sm text-white/68">Display name</span>
            <input
              name="displayName"
              className="admin-input"
              placeholder="Studio Admin"
              required
            />
          </label>
        ) : null}

        <label className="block space-y-2">
          <span className="text-sm text-white/68">Email</span>
          <input
            name="email"
            type="email"
            className="admin-input"
            placeholder="admin@example.com"
            required
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-white/68">Password</span>
          <input
            name="password"
            type="password"
            minLength={8}
            className="admin-input"
            placeholder="••••••••"
            required
          />
        </label>
      </div>

      {state.error ? (
        <p className="rounded-2xl border border-[#c5965c]/30 bg-[#c5965c]/10 px-4 py-3 text-sm text-[#f3d1aa]">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-white px-5 py-3 text-sm font-medium text-black disabled:opacity-60"
      >
        {pending ? "Working..." : submitLabel}
      </button>
    </form>
  );
}
