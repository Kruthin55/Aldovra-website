# Auth email templates

Paste into Supabase Dashboard → Authentication → Emails → Templates.

| File | Template | Subject |
|---|---|---|
| confirm-signup.html | Confirm signup | Verify your Aldovra email |
| reset-password.html | Reset password | Reset your Aldovra password |

They use the Supabase variables `{{ .ConfirmationURL }}`, `{{ .Email }}` and `{{ .Data.full_name }}`.
