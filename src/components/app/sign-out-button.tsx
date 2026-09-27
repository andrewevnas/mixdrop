"use client";

import { Button } from "@/components/ui/button";
import { signOut } from "@/server/auth/actions";

/**
 * The uploader's resume state (file names, paths, small file contents) lives in this browser.
 * Clear it on sign-out so the next person on a shared computer can't see it.
 */
function clearUploadResumeState() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("uppyState:")) localStorage.removeItem(key);
    }
    indexedDB.deleteDatabase("uppy-blobs");
  } catch {
    // Storage may be unavailable (private mode); nothing to clear then.
  }
}

export function SignOutButton() {
  return (
    <form action={signOut} onSubmit={clearUploadResumeState}>
      <Button type="submit" variant="outline" size="sm">
        Sign out
      </Button>
    </form>
  );
}
