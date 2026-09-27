"use client";

import { useActionState } from "react";

import { Field, FormMessage } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EngineerProfile } from "@/db/schema";
import type { FormState } from "@/server/auth/actions";
import { saveEngineerProfile } from "@/server/engineers/actions";

export function ProfileForm({ profile }: { profile: EngineerProfile | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveEngineerProfile, {});
  return (
    <form action={action} className="grid max-w-xl gap-4">
      <Field
        name="slug"
        label="Public URL: mixdrop…/e/"
        defaultValue={profile?.slug}
        placeholder="your-name"
        required
        minLength={3}
        maxLength={40}
        errors={state.fieldErrors?.slug}
      />
      <div className="grid gap-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" name="bio" rows={5} maxLength={2000} defaultValue={profile?.bio} />
        {state.fieldErrors?.bio?.map((e) => (
          <p key={e} className="text-destructive text-sm">{e}</p>
        ))}
      </div>
      <Field
        name="genres"
        label="Genres (comma-separated)"
        defaultValue={profile?.genres.join(", ")}
        placeholder="hip-hop, r&b, pop"
        errors={state.fieldErrors?.genres}
      />
      <FormMessage error={state.error} message={state.message} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
