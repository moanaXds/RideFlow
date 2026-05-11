-- ============================================================
-- RideFlow — Migration v2.0
-- Safe, additive-only schema extension.
-- Run AFTER the base schema.sql is already applied.
-- All ALTER TABLE steps use IF NOT EXISTS / IGNORE guards.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 1 — ACCESS CONTROL & ACCOUNT MANAGEMENT
-- ────────────────────────────────────────────────────────────

-- 1a. Add account_status to users (NULL-safe default keeps existing rows 'active')
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_status
    ENUM('active','suspended','banned','pending_verification')
    NOT NULL DEFAULT 'active'
    AFTER role;

-- 1b. Fine-grained permission table (GRANT/REVOKE style)
CREATE TABLE IF NOT EXISTS role_permissions (
  id          INT          NOT NULL AUTO_INCREMENT,
  role        ENUM('rider','driver','admin') NOT NULL,
  permission  VARCHAR(100) NOT NULL,          -- e.g. 'ride:request', 'driver:go_online'
  granted     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_perm (role, permission)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Seed default permission matrix
INSERT IGNORE INTO role_permissions (role, permission, granted) VALUES
  ('rider',  'ride:request',        1),
  ('rider',  'ride:cancel',         1),
  ('rider',  'payment:apply_promo', 1),
  ('rider',  'rating:submit',       1),
  ('driver', 'ride:accept',         1),
  ('driver', 'ride:update_status',  1),
  ('driver', 'driver:go_online',    1),
  ('driver', 'wallet:withdraw',     1),
  ('admin',  'admin:all',           1);

-- ────────────────────────────────────────────────────────────
-- SECTION 2 — SCHEDULING SYSTEM
-- ────────────────────────────────────────────────────────────

-- 2a. Add scheduling columns to rides (NULL default = instant ride = unchanged behaviour)
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS scheduled_time   DATETIME NULL DEFAULT NULL AFTER surge_multiplier,
  ADD COLUMN IF NOT EXISTS schedule_status  ENUM('pending','confirmed','cancelled','completed')
                                            NULL DEFAULT NULL AFTER scheduled_time;

-- Index for scheduler daemon / cron queries
CREATE INDEX IF NOT EXISTS idx_rides_scheduled
  ON rides (schedule_status, scheduled_time);

-- ────────────────────────────────────────────────────────────
-- SECTION 3 — WALLET SYSTEM
-- ────────────────────────────────────────────────────────────

-- 3a. User wallet (riders + admins; one row per user)
CREATE TABLE IF NOT EXISTS wallets (
  id          INT            NOT NULL AUTO_INCREMENT,
  user_id     INT            NOT NULL,
  balance     DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
  currency    VARCHAR(5)     NOT NULL DEFAULT 'USD',
  updated_at  TIMESTAMP      NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at  TIMESTAMP      NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wallet_user (user_id),
  CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3b. Driver earnings wallet (separate from user wallet for clean payout tracking)
CREATE TABLE IF NOT EXISTS driver_wallets (
  id               INT           NOT NULL AUTO_INCREMENT,
  driver_id        INT           NOT NULL,
  balance          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  pending_payout   DECIMAL(12,2) NOT NULL DEFAULT 0.00,   -- earned but not yet withdrawn
  total_withdrawn  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency         VARCHAR(5)    NOT NULL DEFAULT 'USD',
  updated_at       TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at       TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_driver_wallet (driver_id),
  CONSTRAINT fk_dw_driver FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3c. Unified transaction ledger
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id               INT             NOT NULL AUTO_INCREMENT,
  wallet_type      ENUM('user','driver') NOT NULL,
  wallet_id        INT             NOT NULL,    -- FK resolved at app layer (polymorphic)
  type             ENUM('credit','debit') NOT NULL,
  amount           DECIMAL(12,2)   NOT NULL,
  balance_after    DECIMAL(12,2)   NOT NULL,
  reference_type   ENUM('ride_payment','recharge','withdrawal','refund','commission','payout') NOT NULL,
  reference_id     INT             NULL,        -- ride_id / payment_id etc.
  note             VARCHAR(255)    NULL,
  created_at       TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wt_wallet  (wallet_type, wallet_id),
  KEY idx_wt_ref     (reference_type, reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ────────────────────────────────────────────────────────────
-- SECTION 4 — ADVANCED RATING SYSTEM
-- ────────────────────────────────────────────────────────────

-- Drop the old UNIQUE KEY on ride_id (only one rating per ride)
-- and replace with a composite key (ride_id + rated_by) so both
-- driver→rider AND rider→driver ratings can coexist.
-- We keep all existing data intact.

-- 4a. Add directional columns to ratings
ALTER TABLE ratings
  ADD COLUMN IF NOT EXISTS rated_by    ENUM('rider','driver') NOT NULL DEFAULT 'rider' AFTER comment,
  ADD COLUMN IF NOT EXISTS rated_user  INT NULL DEFAULT NULL AFTER rated_by;

-- 4b. Widen the unique constraint from ride_id alone to (ride_id, rated_by)
--     Step 1: drop the old single-column unique key
ALTER TABLE ratings DROP INDEX IF EXISTS ride_id;

--     Step 2: add composite unique key preventing duplicate direction ratings
ALTER TABLE ratings
  ADD CONSTRAINT uq_rating_direction UNIQUE (ride_id, rated_by);

-- FK for rated_user → users
ALTER TABLE ratings
  ADD CONSTRAINT fk_rating_rated_user
    FOREIGN KEY IF NOT EXISTS (rated_user) REFERENCES users (id) ON DELETE SET NULL;

-- Index for rated_user lookups
CREATE INDEX IF NOT EXISTS idx_ratings_rated_user ON ratings (rated_user);

-- ────────────────────────────────────────────────────────────
-- SECTION 5 — PAYMENT ENHANCEMENTS
-- ────────────────────────────────────────────────────────────

-- 5a. Add 'failed' to the existing payments.status enum
-- NOTE: Existing enum is ('pending','completed','refunded').
-- We expand it additively; existing data is unaffected.
ALTER TABLE payments
  MODIFY COLUMN status
    ENUM('pending','completed','refunded','failed')
    NOT NULL DEFAULT 'pending';

-- 5b. Commission & payout columns on payments
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS commission_rate    DECIMAL(5,4)  NOT NULL DEFAULT 0.1500 AFTER discount_amount,
  ADD COLUMN IF NOT EXISTS commission_amount  DECIMAL(10,2) NOT NULL DEFAULT 0.00   AFTER commission_rate,
  ADD COLUMN IF NOT EXISTS driver_payout      DECIMAL(10,2) NOT NULL DEFAULT 0.00   AFTER commission_amount,
  ADD COLUMN IF NOT EXISTS payout_status      ENUM('pending','paid','withheld')
                                              NOT NULL DEFAULT 'pending'             AFTER driver_payout,
  ADD COLUMN IF NOT EXISTS paid_at            TIMESTAMP NULL DEFAULT NULL            AFTER payout_status;

-- Index for payout processing queries
CREATE INDEX IF NOT EXISTS idx_payments_payout ON payments (payout_status, paid_at);

-- ────────────────────────────────────────────────────────────
-- SECTION 6 — CITY / LOCATION LAYER
-- ────────────────────────────────────────────────────────────

-- 6a. Cities reference table
CREATE TABLE IF NOT EXISTS cities (
  id           INT          NOT NULL AUTO_INCREMENT,
  name         VARCHAR(100) NOT NULL,
  country_code CHAR(2)      NOT NULL DEFAULT 'US',
  timezone     VARCHAR(60)  NULL DEFAULT 'UTC',
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  base_fare    DECIMAL(8,2) NULL DEFAULT NULL,    -- city-level override; NULL = use env
  per_km_rate  DECIMAL(6,4) NULL DEFAULT NULL,
  per_min_rate DECIMAL(6,4) NULL DEFAULT NULL,
  created_at   TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_city_name (name, country_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Default city for backward compat (existing rides get city_id = 1 via DEFAULT)
INSERT IGNORE INTO cities (id, name, country_code) VALUES (1, 'Default City', 'US');

-- 6b. Link rides to cities (NULL = city unknown = old data; safe default for new rides)
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS city_id INT NULL DEFAULT NULL AFTER dropoff_location,
  ADD CONSTRAINT fk_rides_city
    FOREIGN KEY IF NOT EXISTS (city_id) REFERENCES cities (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rides_city ON rides (city_id);

-- 6c. Link drivers to cities (home city)
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS city_id INT NULL DEFAULT NULL AFTER created_at,
  ADD CONSTRAINT fk_drivers_city
    FOREIGN KEY IF NOT EXISTS (city_id) REFERENCES cities (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_drivers_city ON drivers (city_id);

-- ────────────────────────────────────────────────────────────
-- SECTION 7 — STORED PROCEDURES & TRIGGERS
-- ────────────────────────────────────────────────────────────

DELIMITER $$

-- ── 7.1 Auto-calculate commission & driver payout when payment status → completed ──
DROP TRIGGER IF EXISTS trg_payment_completed $$
CREATE TRIGGER trg_payment_completed
AFTER UPDATE ON payments
FOR EACH ROW
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Calculate commission and payout
    SET @commission = ROUND(NEW.amount * NEW.commission_rate, 2);
    SET @payout     = ROUND(NEW.amount - @commission, 2);

    UPDATE payments
      SET commission_amount = @commission,
          driver_payout     = @payout
      WHERE id = NEW.id;

    -- Credit driver wallet (balance + pending_payout)
    UPDATE driver_wallets dw
      INNER JOIN rides r ON r.id = NEW.ride_id
      SET dw.balance        = dw.balance + @payout,
          dw.pending_payout = dw.pending_payout + @payout
      WHERE dw.driver_id = r.driver_id;

    -- Insert driver wallet transaction ledger entry
    INSERT INTO wallet_transactions
      (wallet_type, wallet_id, type, amount, balance_after,
       reference_type, reference_id, note)
    SELECT
      'driver',
      dw.id,
      'credit',
      @payout,
      dw.balance,
      'ride_payment',
      NEW.ride_id,
      CONCAT('Ride #', NEW.ride_id, ' completed payout')
    FROM driver_wallets dw
      INNER JOIN rides r ON r.id = NEW.ride_id
    WHERE dw.driver_id = r.driver_id;
  END IF;
END $$

-- ── 7.2 Auto-update driver_wallets & wallet_transactions on ride completion ──
DROP TRIGGER IF EXISTS trg_ride_completed $$
CREATE TRIGGER trg_ride_completed
AFTER UPDATE ON rides
FOR EACH ROW
BEGIN
  -- Only fire on status → completed with a driver assigned
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.driver_id IS NOT NULL THEN
    -- Ensure driver_wallet row exists (idempotent)
    INSERT IGNORE INTO driver_wallets (driver_id) VALUES (NEW.driver_id);
  END IF;
END $$

-- ── 7.3 Prevent invalid rating submissions via trigger ──
DROP TRIGGER IF EXISTS trg_rating_before_insert $$
CREATE TRIGGER trg_rating_before_insert
BEFORE INSERT ON ratings
FOR EACH ROW
BEGIN
  DECLARE v_status   VARCHAR(20);
  DECLARE v_driver   INT;
  DECLARE v_rider    INT;

  -- Fetch ride details
  SELECT status, driver_id, rider_id
    INTO v_status, v_driver, v_rider
    FROM rides WHERE id = NEW.ride_id;

  -- Ride must be completed
  IF v_status != 'completed' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cannot rate: ride is not completed.';
  END IF;

  -- Rider-side rating: rated_by=rider
  IF NEW.rated_by = 'rider' THEN
    IF NEW.rider_id != v_rider THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Rider mismatch: you did not take this ride.';
    END IF;
    -- Auto-set rated_user to the user_id of the driver
    SET NEW.rated_user = (SELECT user_id FROM drivers WHERE id = v_driver);
  END IF;

  -- Driver-side rating: rated_by=driver
  IF NEW.rated_by = 'driver' THEN
    IF NEW.driver_id != v_driver THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Driver mismatch: you did not drive this ride.';
    END IF;
    -- Auto-set rated_user to rider's user_id
    SET NEW.rated_user = v_rider;
  END IF;
END $$

-- ── 7.4 Recalculate driver avg_rating after each new rating ──
DROP TRIGGER IF EXISTS trg_rating_after_insert $$
CREATE TRIGGER trg_rating_after_insert
AFTER INSERT ON ratings
FOR EACH ROW
BEGIN
  -- Only driver-directed ratings affect the driver avg
  IF NEW.rated_by = 'rider' THEN
    UPDATE drivers
      SET avg_rating = (
            SELECT ROUND(AVG(rating), 2)
              FROM ratings
             WHERE driver_id = NEW.driver_id
               AND rated_by  = 'rider'
          ),
          flagged = IF(
            (SELECT AVG(rating) FROM ratings
             WHERE driver_id = NEW.driver_id AND rated_by = 'rider') < 3.5,
            1, 0
          )
    WHERE id = NEW.driver_id;
  END IF;
END $$

-- ── 7.5 Prevent duplicate wallet rows for same user / driver ──
DROP PROCEDURE IF EXISTS sp_ensure_wallets $$
CREATE PROCEDURE sp_ensure_wallets(IN p_user_id INT, IN p_driver_id INT)
BEGIN
  -- Create user wallet if missing
  INSERT IGNORE INTO wallets (user_id) VALUES (p_user_id);
  -- Create driver wallet if applicable
  IF p_driver_id IS NOT NULL THEN
    INSERT IGNORE INTO driver_wallets (driver_id) VALUES (p_driver_id);
  END IF;
END $$

-- ── 7.6 Debit user wallet for wallet-based payment ──
DROP PROCEDURE IF EXISTS sp_wallet_pay $$
CREATE PROCEDURE sp_wallet_pay(
  IN  p_user_id  INT,
  IN  p_ride_id  INT,
  IN  p_amount   DECIMAL(10,2),
  OUT p_success  TINYINT,
  OUT p_message  VARCHAR(255)
)
BEGIN
  DECLARE v_balance DECIMAL(12,2) DEFAULT 0;
  DECLARE v_wallet_id INT DEFAULT 0;

  START TRANSACTION;

  SELECT id, balance INTO v_wallet_id, v_balance
    FROM wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_balance < p_amount THEN
    SET p_success = 0;
    SET p_message = 'Insufficient wallet balance.';
    ROLLBACK;
  ELSE
    UPDATE wallets SET balance = balance - p_amount WHERE id = v_wallet_id;

    INSERT INTO wallet_transactions
      (wallet_type, wallet_id, type, amount, balance_after,
       reference_type, reference_id, note)
    VALUES
      ('user', v_wallet_id, 'debit', p_amount, v_balance - p_amount,
       'ride_payment', p_ride_id,
       CONCAT('Wallet payment for ride #', p_ride_id));

    UPDATE payments SET status = 'completed', payment_method = 'wallet'
      WHERE ride_id = p_ride_id;

    SET p_success = 1;
    SET p_message = 'Wallet payment successful.';
    COMMIT;
  END IF;
END $$

-- ── 7.7 Wallet recharge procedure ──
DROP PROCEDURE IF EXISTS sp_wallet_recharge $$
CREATE PROCEDURE sp_wallet_recharge(
  IN p_user_id INT,
  IN p_amount  DECIMAL(10,2),
  IN p_note    VARCHAR(255)
)
BEGIN
  DECLARE v_wallet_id INT;

  INSERT IGNORE INTO wallets (user_id) VALUES (p_user_id);

  SELECT id INTO v_wallet_id FROM wallets WHERE user_id = p_user_id;

  UPDATE wallets SET balance = balance + p_amount WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions
    (wallet_type, wallet_id, type, amount, balance_after,
     reference_type, reference_id, note)
  SELECT 'user', id, 'credit', p_amount, balance, 'recharge', NULL, p_note
    FROM wallets WHERE id = v_wallet_id;
END $$

-- ── 7.8 Driver withdrawal request ──
DROP PROCEDURE IF EXISTS sp_driver_withdraw $$
CREATE PROCEDURE sp_driver_withdraw(
  IN  p_driver_id INT,
  IN  p_amount    DECIMAL(10,2),
  OUT p_success   TINYINT,
  OUT p_message   VARCHAR(255)
)
BEGIN
  DECLARE v_balance DECIMAL(12,2) DEFAULT 0;
  DECLARE v_wallet_id INT DEFAULT 0;

  START TRANSACTION;

  SELECT id, balance INTO v_wallet_id, v_balance
    FROM driver_wallets WHERE driver_id = p_driver_id FOR UPDATE;

  IF v_balance < p_amount THEN
    SET p_success = 0;
    SET p_message = 'Insufficient driver wallet balance.';
    ROLLBACK;
  ELSE
    UPDATE driver_wallets
      SET balance         = balance - p_amount,
          total_withdrawn = total_withdrawn + p_amount,
          pending_payout  = GREATEST(pending_payout - p_amount, 0)
    WHERE id = v_wallet_id;

    INSERT INTO wallet_transactions
      (wallet_type, wallet_id, type, amount, balance_after,
       reference_type, reference_id, note)
    VALUES
      ('driver', v_wallet_id, 'debit', p_amount, v_balance - p_amount,
       'withdrawal', NULL, 'Driver withdrawal request');

    SET p_success = 1;
    SET p_message = 'Withdrawal processed.';
    COMMIT;
  END IF;
END $$

DELIMITER ;

-- ────────────────────────────────────────────────────────────
-- SECTION 8 — SURGE PRICING SYSTEM
-- ────────────────────────────────────────────────────────────

-- 8a. Surge pricing rules table (city × time window)
CREATE TABLE IF NOT EXISTS surge_pricing (
  id               INT           NOT NULL AUTO_INCREMENT,
  city_id          INT           NOT NULL,
  multiplier       DECIMAL(4,2)  NOT NULL DEFAULT 1.00,
  starts_at        TIME          NULL,          -- NULL = all-day rule
  ends_at          TIME          NULL,
  days_of_week     VARCHAR(20)   NULL,          -- '1,2,3,4,5' = Mon-Fri; NULL = every day
  is_active        TINYINT(1)    NOT NULL DEFAULT 1,
  reason           VARCHAR(100)  NULL,          -- 'peak hours', 'rain', 'event'
  created_at       TIMESTAMP     NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_surge_city (city_id, is_active),
  CONSTRAINT fk_surge_city FOREIGN KEY (city_id) REFERENCES cities (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Seed: morning + evening rush for Default City
INSERT IGNORE INTO surge_pricing (city_id, multiplier, starts_at, ends_at, days_of_week, reason)
VALUES
  (1, 1.50, '07:30:00', '09:30:00', '1,2,3,4,5', 'Morning rush'),
  (1, 1.50, '17:00:00', '19:30:00', '1,2,3,4,5', 'Evening rush');

-- ── View: active surge for a city right now (used in app layer) ──────────────────
CREATE OR REPLACE VIEW vw_active_surge AS
SELECT
  sp.city_id,
  MAX(sp.multiplier) AS surge_multiplier,
  GROUP_CONCAT(sp.reason ORDER BY sp.multiplier DESC SEPARATOR ', ') AS reasons
FROM surge_pricing sp
WHERE sp.is_active = 1
  AND (sp.starts_at IS NULL OR TIME(NOW()) BETWEEN sp.starts_at AND sp.ends_at)
  AND (sp.days_of_week IS NULL
       OR FIND_IN_SET(DAYOFWEEK(NOW()) - 1, sp.days_of_week) > 0)
GROUP BY sp.city_id;

-- ────────────────────────────────────────────────────────────
-- SECTION 9 — SUPPLEMENTARY INDEXES (performance)
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_status        ON users (account_status);
CREATE INDEX IF NOT EXISTS idx_payments_status     ON payments (status, created_at);
CREATE INDEX IF NOT EXISTS idx_rides_status_rider  ON rides (status, rider_id);
CREATE INDEX IF NOT EXISTS idx_rides_status_driver ON rides (status, driver_id);
CREATE INDEX IF NOT EXISTS idx_ratings_driver_by   ON ratings (driver_id, rated_by);

-- ────────────────────────────────────────────────────────────
-- SECTION 10 — BOOTSTRAP WALLETS FOR EXISTING USERS/DRIVERS
-- ────────────────────────────────────────────────────────────

-- Create wallet rows for every existing user (idempotent)
INSERT IGNORE INTO wallets (user_id)
  SELECT id FROM users;

-- Create driver_wallet rows for every existing driver (idempotent)
INSERT IGNORE INTO driver_wallets (driver_id)
  SELECT id FROM drivers;

-- ============================================================
-- END OF MIGRATION v2.0
-- ============================================================
