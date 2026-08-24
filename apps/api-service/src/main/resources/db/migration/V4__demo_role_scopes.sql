-- Keep the built-in demo accounts aligned with the role-first dashboard.
-- The Java seed runs only when the demo farm is first created, so existing
-- deployments need an idempotent migration for their stored scopes.
UPDATE user_account
SET plot_ids = 'plot-a01,plot-a02'
WHERE username = 'farmer';

UPDATE user_account
SET plot_ids = 'plot-a01,plot-b01'
WHERE username = 'operator';

UPDATE user_account
SET plot_ids = 'plot-a01,plot-a02,plot-b01'
WHERE username = 'admin';

UPDATE user_account
SET plot_ids = '*'
WHERE username = 'sysadmin';
