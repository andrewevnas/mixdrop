# Mixdrop architecture (prototype)

## Components
- Web app: Next.js monolith (UI + route handlers/server actions). Hosted on Vercel.
- DB: Postgres (Supabase). Auth: Supabase Auth (email + Google). Roles via `profiles.role`.
- Storage: Cloudflare R2, private bucket. Keys: `orders/{orderId}/{kind}/{fileId}/{sanitisedName}`.
- Uploads: browser → R2 directly via presigned S3 multipart (Uppy). App only signs + records.
- Worker: container with ffmpeg + audiowaveform. Jobs: transcode preview, measure LUFS/true peak,
  build waveform peaks, deadline checks, cleanup of abandoned drafts, retention deletes.
- Payments: Stripe Checkout (platform charge) + Connect Express accounts for engineers;
  separate charges & transfers so funds are released on approval.
- Email: Resend. In-app notifications table (poll every 30s; realtime later).

## Data model (Drizzle)
- profiles(id=auth uid, role: client|engineer, display_name, created_at)
- engineer_profiles(user_id, slug, bio, genres[], stripe_account_id, payouts_enabled)
- services(id, engineer_id, name, type: mix|master|mix_master, price_pence, currency,
  turnaround_days, revisions_included, max_stems, active)
- portfolio_items(id, engineer_id, title, artist, before_key?, after_key, preview_key, permission_confirmed)
- orders(id, client_id, engineer_id, service_id, status, song_title, artist_name, brief_json,
  price_pence, revision_count, due_at, accepted_at, delivered_at, approved_at, created_at)
- order_events(id, order_id, actor_id|null, from_status, to_status, note, created_at)
- files(id, order_id, uploader_id, kind: stems|project|reference|demo|delivery, r2_key,
  relative_path, original_name, size_bytes, mime, sha256, status: pending|complete|failed, created_at)
- deliveries(id, order_id, version, label, master_file_id, preview_key, peaks_key,
  lufs_integrated, true_peak_db, created_at)
- revision_requests(id, order_id, delivery_id, general_note, created_at)
- revision_comments(id, revision_request_id, timestamp_sec, text)
- payments(id, order_id, stripe_checkout_id, stripe_payment_intent, amount_pence,
  status, transfer_id, refund_id)
- stripe_events(id = stripe event id, processed_at)   -- idempotency
- reviews(id, order_id unique, rating 1-5, text)
- notifications(id, user_id, type, order_id, read_at, created_at)

## Build phases (each ends with a "done" check)
0. Scaffold: repo, lint/typecheck/test scripts, local pre-push checks, env example.
   DONE: `pnpm typecheck && pnpm test` pass on an empty app (enforced by the pre-push hook).
1. Auth + roles. DONE: sign up as client or engineer; each lands on its own dashboard;
   engineer routes 403 for clients.
2. Engineer profile + services (public page /e/{slug}). DONE: logged-out visitor sees
   an engineer's services and prices.
3. Orders + state machine (no payment yet, no files). DONE: all transitions in
   docs/order-state-machine.md unit-tested; progress bar renders from order_events.
4. Client uploads. DONE: a 5 GB folder (Pro Tools session with Audio Files/) uploads,
   survives a page refresh/resume, and the engineer downloads it with folder structure intact.
5. Deliveries + player. DONE: engineer uploads WAV; client streams preview with waveform,
   switches between v1/v2, leaves timestamped revision comments the engineer sees as markers.
6. Payments. DONE (Stripe test mode): checkout → webhook marks paid; approve → transfer;
   late → refund; replayed webhook causes no duplicate effect.
7. Notifications + deadlines. DONE: every transition emails the other party; overdue job
   flags refund_eligible correctly in a test with a mocked clock.
8. Hardening. DONE: security-reviewer run on full codebase with no HIGH findings;
   IDOR tests for every data function; retention job deletes stems N days after completion.

## Later (scoped, not built)
Stream test simulator (uses stored LUFS), reviews, messaging, watermarking, virus scanning,
engineer analytics, multiple engineers per order (mix + master split).
