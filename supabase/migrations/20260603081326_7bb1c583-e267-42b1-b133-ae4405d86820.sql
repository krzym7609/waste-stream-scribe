CREATE TABLE public.duty_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  shift_type public.shift_type NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  start_note TEXT,
  end_note TEXT,
  outside_window BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tylko jedna otwarta sesja w danym momencie
CREATE UNIQUE INDEX duty_sessions_one_open ON public.duty_sessions ((1)) WHERE ended_at IS NULL;
CREATE INDEX duty_sessions_user_idx ON public.duty_sessions (user_id, started_at DESC);
CREATE INDEX duty_sessions_started_idx ON public.duty_sessions (started_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.duty_sessions TO authenticated;
GRANT ALL ON public.duty_sessions TO service_role;

ALTER TABLE public.duty_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Zalogowani widzą dyżury"
  ON public.duty_sessions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Pracownik otwiera własny dyżur"
  ON public.duty_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'kierownik') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Pracownik zamyka własny dyżur"
  ON public.duty_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'kierownik') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'kierownik') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER duty_sessions_touch
  BEFORE UPDATE ON public.duty_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.duty_sessions;
ALTER TABLE public.duty_sessions REPLICA IDENTITY FULL;