
-- 1) equipment.status
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sprawne'
  CHECK (status IN ('sprawne','awaria','serwis'));

-- 2) Trigger: equipment -> awaria => notyfikacja kierownika
CREATE OR REPLACE FUNCTION public.notify_equipment_breakdown()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'awaria' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.shift_notifications (recipient_role, kind, title, body)
    VALUES (
      'kierownik',
      'equipment_breakdown',
      'Awaria urządzenia: ' || NEW.name,
      COALESCE('Lokalizacja: ' || NEW.location, '') ||
      CASE WHEN NEW.code IS NOT NULL THEN ' (kod ' || NEW.code || ')' ELSE '' END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_equipment_breakdown ON public.equipment;
CREATE TRIGGER trg_equipment_breakdown
AFTER INSERT OR UPDATE OF status ON public.equipment
FOR EACH ROW EXECUTE FUNCTION public.notify_equipment_breakdown();

-- 3) Trigger: koniec zmiany bez kompletnego raportu => notyfikacja kierownika
CREATE OR REPLACE FUNCTION public.notify_missing_shift_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_ok boolean;
  v_username text;
BEGIN
  IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN
    SELECT (energia_end IS NOT NULL) INTO v_report_ok
    FROM public.shift_reports WHERE duty_session_id = NEW.id LIMIT 1;

    IF v_report_ok IS DISTINCT FROM TRUE THEN
      SELECT COALESCE(first_name || ' ' || last_name, username) INTO v_username
      FROM public.profiles WHERE id = NEW.user_id;

      INSERT INTO public.shift_notifications (recipient_role, kind, title, body, related_session_id)
      VALUES (
        'kierownik',
        'missing_shift_report',
        'Brak raportu zmianowego',
        'Operator ' || COALESCE(v_username,'(?)') || ' zakończył zmianę ' || NEW.shift_type
          || ' bez wypełnionego raportu zmianowego.',
        NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_missing_shift_report ON public.duty_sessions;
CREATE TRIGGER trg_missing_shift_report
AFTER UPDATE OF ended_at ON public.duty_sessions
FOR EACH ROW EXECUTE FUNCTION public.notify_missing_shift_report();

-- 4) Funkcja: powiadom o zadaniach zalegających > 24h (dedup w obrębie doby)
CREATE OR REPLACE FUNCTION public.notify_overdue_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.schedule_executions
  WHERE status = 'pending'
    AND scheduled_date < CURRENT_DATE - INTERVAL '1 day';

  IF v_count > 0 AND NOT EXISTS (
    SELECT 1 FROM public.shift_notifications
    WHERE kind = 'overdue_tasks'
      AND created_at >= now() - INTERVAL '20 hours'
  ) THEN
    INSERT INTO public.shift_notifications (recipient_role, kind, title, body)
    VALUES (
      'kierownik',
      'overdue_tasks',
      'Zaległe zadania checklisty (' || v_count || ')',
      'Liczba zadań zalegających ponad 24h: ' || v_count || '. Sprawdź harmonogram.'
    );
  END IF;
END;
$$;

-- 5) Cron — codziennie 06:10 (po nocnej zmianie)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-overdue-tasks-daily') THEN
    PERFORM cron.unschedule('notify-overdue-tasks-daily');
  END IF;
END$$;

SELECT cron.schedule(
  'notify-overdue-tasks-daily',
  '10 6 * * *',
  $cmd$ SELECT public.notify_overdue_tasks(); $cmd$
);

-- 6) Realtime dla powiadomień
ALTER TABLE public.shift_notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='shift_notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_notifications';
  END IF;
END$$;
