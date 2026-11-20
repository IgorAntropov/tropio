ALTER TABLE draft_commands DROP CONSTRAINT draft_commands_action_check;

ALTER TABLE draft_commands ADD CHECK (
    action IN ('trip.create', 'trip.update', 'trip.archive', 'day.create', 'day.update', 'route.bind')
);
