-- The achievement-based "completed" state is retired (ARCHITECTURE.md §7): stored ones become "finished"
-- The check still allows it: the previous deployment may write it until this one is live, and reads map it
update backlog_overrides set state = 'finished' where state = 'completed';
