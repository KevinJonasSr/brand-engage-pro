# Member email go-live

Brand campaigns (`broadcastBrandEmail`), event reminders, and the weekly digest stay off until `EMAIL_SENDING_ENABLED` is exactly `1`. A Mandrill key alone does not send. `MAILCHIMP_BROADCAST_ENABLED` is not read.

This is the ops checklist. It names env vars and DNS records. It does not contain keys or member data.

## Env vars

Set these on the production service, then redeploy. Do not change them from this repo.

| Name | Required to send |
|---|---|
| `EMAIL_SENDING_ENABLED` | Exactly `1`. Any other value, including `true`, stays off. |
| `BEP_MAILING_ADDRESS` | One-line physical mailing address for the footer. |
| `MAILCHIMP_TRANSACTIONAL_API_KEY` | Mailchimp Transactional (Mandrill) key. |
| `BEP_EMAIL_FROM` | Optional. Default `hello@brandengagepro.com`. Must be `@brandengagepro.com` or a subdomain of it. |
| `BEP_EMAIL_REPLY_TO` | Optional. Default `support@brandengagepro.com`. |
| `BEP_EMAIL_ALLOWLIST` | Optional test rail. Comma-separated member emails. See the test send below. Unset means the real audience. |
| `NEXT_PUBLIC_APP_URL` | Keep `https://www.brandengagepro.com`. Preview and apex hosts are not used in links. |
| `CRON_SECRET` | Already required. The digest and reminder routes reject calls without it. |

## DNS for brandengagepro.com

Add the sending domain in Mandrill (Settings → Domains), then publish:

| Type | Host | Value |
|---|---|---|
| CNAME | `mte1._domainkey` | `dkim1.mandrillapp.com` |
| CNAME | `mte2._domainkey` | `dkim2.mandrillapp.com` |
| TXT | `_dmarc` | `v=DMARC1; p=none` at minimum. If a DMARC record already exists, keep the stricter policy and do not add a second one. |
| TXT | `@` (the domain) | The `mandrill_verify.<key>` value shown on that domain in Mandrill. It is unique per account. Do not invent it. |

SPF: add `include:spf.mandrillapp.com` to the existing SPF TXT record. Do not publish a second SPF record.

Optional, for SPF alignment: CNAME a subdomain such as `bounce` to `mandrillapp.com`, then add that host under Mandrill → Settings → Tracking & Return Path Domains. DKIM alone is enough for Mandrill's DMARC check.

Mailchimp Marketing (audience) DKIM is a different system and does not authenticate Mandrill.

In Mandrill, Test DNS Settings until the domain shows verified, DKIM valid, and DMARC valid. Mail from an unverified domain is rejected as `unsigned`.

## Safe test send (internal addresses only)

Do this before removing the allowlist. SMS is not covered by the allowlist and still sends when Twilio is configured.

1. Confirm the internal address already belongs to a member who is not suspended and has email opt-in. For a brand broadcast or manual reminder, that member must follow the brand or have an RSVP.
2. In the same deploy, set `EMAIL_SENDING_ENABLED=1`, `BEP_MAILING_ADDRESS`, `MAILCHIMP_TRANSACTIONAL_API_KEY`, and `BEP_EMAIL_ALLOWLIST` to that address only.
3. Weekly digest, one recipient (the address must be on the allowlist). Nothing is sent if the param is missing, invalid, or not listed:

```bash
curl -sS "https://www.brandengagepro.com/api/cron/weekly-member-digest?testEmail=YOU@brandengagepro.com" \
  -H "Authorization: Bearer $CRON_SECRET"
```

The digest only sends when that member has points, a comment, an RSVP, or a reaction in the past 7 days. A visit streak alone does not qualify. If `sent` is 0, use a brand broadcast instead.

4. Or send from Admin → Broadcast, channel Email, on a brand that internal member follows. Only allowlisted addresses are mailed.
5. A manual "Send reminder now" also stays inside the allowlist and does not use up the scheduled 24h or 1h reminder.
6. Read the message: From `hello@brandengagepro.com` (or `BEP_EMAIL_FROM`), Reply-To support, the physical address, and an unsubscribe link that opens the confirm page. Do not click the link unless you mean to opt that member out.

Scheduled 24h and 1h reminder email does not go out while `BEP_EMAIL_ALLOWLIST` is set. When you remove it, an event still inside its reminder window gets the email once. Reminders whose window has already passed are not sent late. SMS for those reminders is not replayed.

## Turning it on for members

Remove `BEP_EMAIL_ALLOWLIST` and redeploy. The Sunday 23:00 UTC digest then emails every opted-in, non-suspended member who had weekly activity. Reminder email follows the 24h and 1h windows.

Do not curl the digest without `testEmail` while the flag is on and the allowlist is empty. That is a real send.
