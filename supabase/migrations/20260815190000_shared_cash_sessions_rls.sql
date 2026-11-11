-- The store now shares a single cash drawer across every user/device instead of
-- one session per user. The old per-user RLS policies hid open sessions (and
-- blocked closing them) from anyone but the original opener or an admin.
DROP POLICY IF EXISTS "read_cash_sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "update_own_cash_session" ON public.cash_sessions;

CREATE POLICY "read_cash_sessions" ON public.cash_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "update_cash_sessions" ON public.cash_sessions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- insert_own_cash_session stays as-is: whoever opens the drawer still
-- records themselves as the opener (user_id = auth.uid()).
