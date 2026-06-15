"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validation/auth";
import { changePassword } from "@/app/account/actions";
import { Input, Label, FieldError } from "@/components/ui/inputs";
import { Button } from "@/components/ui/Button";

export function ChangePasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  });

  function onSubmit(values: ChangePasswordInput) {
    setServerError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await changePassword(values);
      if (result?.error) {
        setServerError(result.error);
      } else {
        setSuccess(true);
        reset();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          {...register("currentPassword")}
        />
        <FieldError>{errors.currentPassword?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          {...register("newPassword")}
        />
        <FieldError>{errors.newPassword?.message}</FieldError>
      </div>
      {serverError && <FieldError>{serverError}</FieldError>}
      {success && !serverError ? (
        <p className="text-sm text-sage">Password updated.</p>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Updating…" : "Change password"}
      </Button>
    </form>
  );
}
