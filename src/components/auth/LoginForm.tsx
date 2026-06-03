"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { loginAction } from "@/app/actions/auth";

export function LoginForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  function onSubmit(values: LoginInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await loginAction(values);
      if (result?.error) setServerError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <input {...register("email")} placeholder="Email" className="border p-2 rounded" />
      {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}

      <input
        {...register("password")}
        type="password"
        placeholder="Password"
        className="border p-2 rounded"
      />
      {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      <button disabled={pending} className="bg-pink-600 text-white p-2 rounded">
        {pending ? "Signing in…" : "Log in"}
      </button>
    </form>
  );
}
