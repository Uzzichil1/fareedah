"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { storefrontSchema, type StorefrontInput } from "@/lib/validation/storefront";
import { createStorefront } from "@/app/sell/actions";

export function StorefrontForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, formState: { errors } } =
    useForm<StorefrontInput>({ resolver: zodResolver(storefrontSchema) });

  function onSubmit(values: StorefrontInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await createStorefront(values);
      if (result?.error) setServerError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <input {...register("name")} placeholder="Storefront name" className="border p-2 rounded" />
      {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      <textarea {...register("bio")} placeholder="Short bio (optional)" className="border p-2 rounded" rows={3} />
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <button disabled={pending} className="bg-pink-600 text-white p-2 rounded">
        {pending ? "Creating…" : "Open my storefront"}
      </button>
    </form>
  );
}
