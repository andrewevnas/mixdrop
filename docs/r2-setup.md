# R2 setup (dev)

1. **Bucket**: Cloudflare dashboard → R2 → Create bucket (e.g. `mixdrop-dev`). Keep it private (no public access, no custom domain).
2. **Token**: R2 → Manage API tokens → Create API token → *Object Read & Write*, restricted to that one bucket.
3. **Env**: put `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` in `.env.local` (never commit).
4. **CORS** (bucket → Settings → CORS policy). The browser talks to R2 directly with presigned URLs:
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000"],
       "AllowedMethods": ["GET", "HEAD", "PUT", "POST", "DELETE"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   POST (create/complete multipart) and DELETE (abort) are sent by the browser too. Add the
   production origin when deploying. `ETag` must be exposed or multipart completion fails.
5. **Lifecycle rule** (bucket → Settings → Object lifecycle rules): *Abort incomplete multipart uploads
   after 1 day*. Abandoned uploads otherwise keep their parts (and cost) forever.
6. **Check**: `pnpm r2:check` runs the exact presigned multipart flow the uploader uses and cleans up.
   Then `pnpm e2e` (upload/refresh/resume/download on a small session) and `pnpm e2e:big` (5 GB).
