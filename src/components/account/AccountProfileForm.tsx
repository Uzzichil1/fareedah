"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/validation/auth";
import { updateProfile } from "@/app/account/actions";
import { Input, Label, FieldError } from "@/components/ui/inputs";
import { Button } from "@/components/ui/Button";

export function AccountProfileForm({ initialName }: { initialName: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, formState: { errors } } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: initialName },
  });

  function onSubmit(values: UpdateProfileInput) {
    setServerError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateProfile(values);
      if (result?.error) {
        setServerError(result.error);
      } else {
        setSaved(true);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="name">Display name</Label>
        <Input id="name" {...register("name")} placeholder="Your name" />
        <FieldError>{errors.name?.message}</FieldError>
      </div>
      {serverError && <FieldError>{serverError}</FieldError>}
      {saved && !serverError ? (
        <p className="text-sm text-sage">Saved.</p>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}
