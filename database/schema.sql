-- ============================================================
-- RideFlow Ride-Hailing System — MySQL Schema
-- Source of Truth: All backend APIs and frontend calls derive from this
-- ============================================================

DROP TABLE IF EXISTS ratings;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS rides;
DROP TABLE IF EXISTS drivers;
DROP TABLE IF EXISTS promo_codes;
DROP TABLE IF EXISTS users;

-- 1. Users Table (Riders, Drivers, Admins)
CREATE TABLE users (
  id int NOT NULL AUTO_INCREMENT,
  name varchar(100) NOT NULL,
  email varchar(100) NOT NULL,
  password varchar(255) NOT NULL,
  phone varchar(20) DEFAULT NULL,
  role enum('rider','driver','admin') NOT NULL DEFAULT 'rider',
  profile_pic varchar(255) DEFAULT NULL,
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2. Promo Codes Table
CREATE TABLE promo_codes (
  id int NOT NULL AUTO_INCREMENT,
  code varchar(50) NOT NULL,
  discount_percent int NOT NULL,
  max_uses int DEFAULT '100',
  used_count int DEFAULT '0',
  expires_at timestamp NULL DEFAULT NULL,
  is_active tinyint(1) DEFAULT '1',
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Drivers Table (Extended profile for users with 'driver' role)
CREATE TABLE drivers (
  id int NOT NULL AUTO_INCREMENT,
  user_id int NOT NULL,
  license_number varchar(50) DEFAULT NULL,
  is_online tinyint(1) DEFAULT '0',
  is_verified tinyint(1) DEFAULT '0',
  avg_rating decimal(3,2) DEFAULT '5.00',
  total_earnings decimal(10,2) DEFAULT '0.00',
  flagged tinyint(1) DEFAULT '0',
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY user_id (user_id),
  CONSTRAINT drivers_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Vehicles Table (Linked to drivers)
CREATE TABLE vehicles (
  id int NOT NULL AUTO_INCREMENT,
  driver_id int NOT NULL,
  make varchar(50) NOT NULL,
  model varchar(50) NOT NULL,
  plate_number varchar(20) NOT NULL,
  color varchar(30) DEFAULT NULL,
  vehicle_type enum('economy','premium','xl') DEFAULT 'economy',
  is_verified tinyint(1) DEFAULT '0',
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY plate_number (plate_number),
  KEY driver_id (driver_id),
  CONSTRAINT vehicles_ibfk_1 FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 5. Rides Table (Core ride lifecycle)
CREATE TABLE rides (
  id int NOT NULL AUTO_INCREMENT,
  rider_id int NOT NULL,
  driver_id int DEFAULT NULL,
  pickup_location varchar(255) NOT NULL,
  dropoff_location varchar(255) NOT NULL,
  status enum('requested','accepted','en_route','in_progress','completed','cancelled') NOT NULL DEFAULT 'requested',
  distance_km decimal(8,2) DEFAULT NULL,
  duration_minutes int DEFAULT NULL,
  fare decimal(10,2) DEFAULT NULL,
  surge_multiplier decimal(3,2) DEFAULT '1.00',
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY rider_id (rider_id),
  KEY driver_id (driver_id),
  CONSTRAINT rides_ibfk_1 FOREIGN KEY (rider_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT rides_ibfk_2 FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 6. Payments Table (Billing and transactions)
CREATE TABLE payments (
  id int NOT NULL AUTO_INCREMENT,
  ride_id int NOT NULL,
  amount decimal(10,2) NOT NULL,
  payment_method enum('cash','card','wallet') DEFAULT 'cash',
  status enum('pending','completed','refunded') DEFAULT 'pending',
  promo_code varchar(50) DEFAULT NULL,
  discount_amount decimal(10,2) DEFAULT '0.00',
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ride_id (ride_id),
  CONSTRAINT payments_ibfk_1 FOREIGN KEY (ride_id) REFERENCES rides (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 7. Ratings Table (Feedback for completed rides)
CREATE TABLE ratings (
  id int NOT NULL AUTO_INCREMENT,
  ride_id int NOT NULL,
  rider_id int NOT NULL,
  driver_id int NOT NULL,
  rating decimal(2,1) NOT NULL,
  comment text,
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ride_id (ride_id),
  KEY rider_id (rider_id),
  KEY driver_id (driver_id),
  CONSTRAINT ratings_ibfk_1 FOREIGN KEY (ride_id) REFERENCES rides (id) ON DELETE CASCADE,
  CONSTRAINT ratings_ibfk_2 FOREIGN KEY (rider_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT ratings_ibfk_3 FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE RESTRICT,
  CONSTRAINT ratings_chk_1 CHECK ((rating between 1.0 and 5.0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Optional: Insert a default admin account
INSERT IGNORE INTO users (name, email, password, phone, role) 
VALUES ('System Admin', 'admin@rideflow.com', '$2b$10$YourHashedPasswordHere', '1234567890', 'admin');

-- Optional: Seed default promo codes
INSERT IGNORE INTO promo_codes (code, discount_percent) VALUES ('RIDE10', 10), ('FIRST20', 20), ('SAVE15', 15);
