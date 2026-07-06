
ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'ideia'
  CHECK (categoria IN ('bug', 'ideia', 'duvida', 'melhoria'));
