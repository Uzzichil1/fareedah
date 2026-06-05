"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
import { signupAction } from "@/app/actions/auth";
import { Input, Label, FieldError } from "@/components/ui/inputs";
import { Button } from "@/components/ui/Button";

export function SignupForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  function onSubmit(values: SignupInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await signupAction(values);
      if (result?.error) setServerError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} placeholder="Your name" />
        <FieldError>{errors.name?.message}</FieldError>
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register("email")} placeholder="you@example.com" />
        <FieldError>{errors.email?.message}</FieldError>
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" {...register("password")} type="password" placeholder="••••••••" />
        <FieldError>{errors.password?.message}</FieldError>
      </div>

      {serverError && <FieldError>{serverError}</FieldError>}

      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Creating account…" : "Sign up"}
      </Button>
    </form>
  );
}
