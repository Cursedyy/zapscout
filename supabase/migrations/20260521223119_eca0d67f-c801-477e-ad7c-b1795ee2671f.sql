ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS token_acesso TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS kiwify_order_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS senha_definida BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_profiles_token_acesso ON public.profiles(token_acesso) WHERE token_acesso IS NOT NULL;