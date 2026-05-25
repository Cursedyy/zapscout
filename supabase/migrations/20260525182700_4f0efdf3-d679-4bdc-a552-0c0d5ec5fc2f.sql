CREATE TABLE IF NOT EXISTS public.suporte_tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('problema', 'sugestao')),
    assunto text NOT NULL,
    descricao text NOT NULL,
    status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'respondido', 'fechado')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suporte_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tickets"
ON public.suporte_tickets FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own tickets"
ON public.suporte_tickets FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own tickets"
ON public.suporte_tickets FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_suporte_tickets_updated_at ON public.suporte_tickets;
CREATE TRIGGER set_suporte_tickets_updated_at
    BEFORE UPDATE ON public.suporte_tickets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();