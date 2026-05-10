"use client";

import { useRef } from "react";
import ImageUploader from "@/components/image-uploader";
import { updateOfferImageAction } from "./actions";

/**
 * Inline image editor for an existing offer row in /admin/offers.
 *
 * Wraps ImageUploader in its own form and auto-submits when the upload
 * completes. After upload, the server action saves the new image_url to
 * the offers row and revalidates the admin + marketplace pages.
 */
export default function OfferImageEditor({
  offerId,
  initialUrl,
}: {
  offerId: string;
  initialUrl: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={updateOfferImageAction}
      className="inline-block"
    >
      <input type="hidden" name="id" value={offerId} />
      <ImageUploader
        bucket="community-uploads"
        name="image_url"
        initialUrl={initialUrl}
        label={initialUrl ? "Replace image" : "Add image"}
        onUploaded={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}
