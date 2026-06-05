"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { storefrontSchema, type StorefrontInput } from "@/lib/validation/storefront";
import { createStorefront } from "@/app/sell/actions";
import { Input, Textarea, Label, FieldError } from "@/components/ui/inputs";
import { Button } from "@/components/ui/Button";

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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="name">Storefront name</Label>
        <Input id="name" {...register("name")} placeholder="e.g. Olive & Fern" />
        <FieldError>{errors.name?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" {...register("bio")} placeholder="A line about your little shop (optional)" rows={3} />
      </div>
      {serverError && <FieldError>{serverError}</FieldError>}
      <Button type="submit" disabled={pending} className="mt-1">
        {pending ? "Creating…" : "Open my storefront"}
      </Button>
    </form>
  );
}
