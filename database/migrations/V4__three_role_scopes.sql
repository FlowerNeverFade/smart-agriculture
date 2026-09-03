-- Keep existing demo data aligned with the three-role account contract.
-- The old operator account is retained as a farmer account by this
-- non-destructive migration; the login UI no longer exposes the old role.
UPDATE user_account
SET role_code = 'FARMER', plot_ids = 'plot-a01,plot-a02'
WHERE UPPER(TRIM(role_code)) IN ('FIELD_OPERATOR', 'OPERATOR')
   OR (LOWER(username) = 'operator' AND UPPER(TRIM(role_code)) = 'FARMER');

UPDATE user_account
SET role_code = 'FARMER', plot_ids = 'plot-a01,plot-a02'
WHERE LOWER(username) = 'farmer';

UPDATE user_account
SET role_code = 'FARM_ADMIN', plot_ids = 'plot-a01,plot-a02,plot-b01'
WHERE LOWER(username) = 'admin';

UPDATE user_account
SET role_code = 'SYSTEM_ADMIN', plot_ids = '*'
WHERE LOWER(username) = 'sysadmin';
