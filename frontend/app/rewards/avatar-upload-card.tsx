"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ImageUploader from "@/components/image-uploader";

export default function AvatarUploadCard({
  initialUrl,
  firstName,
  email,
}: {
  initialUrl: string | null;
  firstName: string | null;
  email: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(initialUrl);

  return (
    <section className="glass-card p-6">
      <p className="text-sm uppercase tracking-wide text-white/60">Your profile</p>
      <div className="mt-4 flex items-center gap-4">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-16 w-16 rounded-full border border-white/10 object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-aurora to-ember text-lg font-bold">
            {(firstName?.[0] ?? email?.[0] ?? "F").toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{firstName ?? "Fan"}</p>
          <p className="truncate text-xs text-white/60">{email ?? ""}</p>
        </div>
      </div>
      <div className="mt-4">
        <ImageUploader
          bucket="avatars"
          name="avatar_url_unused"
          initialUrl={url}
          label={url ? "Change avatar" : "Upload avatar"}
          onUploaded={(newUrl) => {
            setUrl(newUrl);
            // Revalidate layout so the header chip picks up the new avatar.
            router.refresh();
          }}
        />
      </div>
    </section>
  );
}
