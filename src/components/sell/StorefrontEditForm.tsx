"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { storefrontSchema, type StorefrontInput } from "@/lib/validation/storefront";
import { editStorefront } from "@/app/sell/actions";
import { Input, Textarea, Label, FieldError } from "@/components/ui/inputs";
import { Button } from "@/components/ui/Button";
import { SingleImageUploader } from "@/components/sell/SingleImageUploader";

export function StorefrontEditForm({
  initial,
}: {
  initial: { name: string; bio: string | null; avatarUrl: string | null; bannerUrl: string | null };
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl);
  const [bannerUrl, setBannerUrl] = useState<string | null>(initial.bannerUrl);

  // Name/bio reuse the create schema's rules. Image urls live in plain state.
  const { register, handleSubmit, formState: { errors } } = useForm<StorefrontInput>({
    resolver: zodResolver(storefrontSchema),
    defaultValues: { name: initial.name, bio: initial.bio ?? "" },
  });

  function onSubmit(values: StorefrontInput) {
    setServerError(null);
    startTransition(async () => {
      // Coerce nulls to "" — the edit schema accepts "" (no image) but not null.
      const result = await editStorefront({
        name: values.name,
        bio: values.bio ?? "",
        avatarUrl: avatarUrl ?? "",
        bannerUrl: bannerUrl ?? "",
      });
      if (result?.error) setServerError(result.error);
      // On success the action redirects to /sell.
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <div>
        <Label htmlFor="name">Storefront name</Label>
        <Input id="name" {...register("name")} placeholder="e.g. Olive & Fern" />
        <FieldError>{errors.name?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" {...register("bio")} placeholder="A line about your little shop (optional)" rows={3} />
        <FieldError>{errors.bio?.message}</FieldError>
      </div>

      <SingleImageUploader
        label="Avatar"
        shape="avatar"
        value={avatarUrl}
        onChange={setAvatarUrl}
      />
      <SingleImageUploader
        label="Banner"
        shape="banner"
        value={bannerUrl}
        onChange={setBannerUrl}
      />

      {serverError && <FieldError>{serverError}</FieldError>}
      <Button type="submit" disabled={pending} className="mt-1">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
