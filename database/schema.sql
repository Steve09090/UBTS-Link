CREATE DATABASE IF NOT EXISTS ubts_link
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE ubts_link;

CREATE TABLE facility (
  facility_id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  facility_type ENUM('hospital','blood_bank','ubts_hub') NOT NULL,
  district VARCHAR(100) NOT NULL,
  verified_status BOOLEAN NOT NULL DEFAULT FALSE,
  regional_hub_id VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_facility_hub FOREIGN KEY (regional_hub_id) REFERENCES facility(facility_id),
  INDEX idx_facility_district (district),
  INDEX idx_facility_verified (verified_status)
);

CREATE TABLE staff (
  staff_id VARCHAR(36) PRIMARY KEY,
  facility_id VARCHAR(36) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  role ENUM('hospital_officer','clinician','hub_staff','system_admin') NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  verified_status BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_staff_facility FOREIGN KEY (facility_id) REFERENCES facility(facility_id),
  INDEX idx_staff_facility (facility_id),
  INDEX idx_staff_role (role)
);

CREATE TABLE blood_unit (
  unit_id VARCHAR(36) PRIMARY KEY,
  facility_id VARCHAR(36) NOT NULL,
  barcode VARCHAR(128) NOT NULL UNIQUE,
  blood_type ENUM('O+','O-','A+','A-','B+','B-','AB+','AB-') NOT NULL,
  component ENUM('whole_blood','red_cells','platelets','plasma') NOT NULL,
  collection_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  viral_test_status ENUM('pending','negative','positive') NOT NULL,
  status ENUM('in_stock','quarantined','in_transit','dispensed','expired') NOT NULL DEFAULT 'quarantined',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_unit_facility FOREIGN KEY (facility_id) REFERENCES facility(facility_id),
  CONSTRAINT chk_unit_dates CHECK (expiry_date > collection_date),
  INDEX idx_inventory_lookup (facility_id,blood_type,status,expiry_date),
  INDEX idx_unit_expiry (expiry_date)
);

CREATE TABLE requisition_request (
  request_id VARCHAR(36) PRIMARY KEY,
  facility_id VARCHAR(36) NOT NULL,
  staff_id VARCHAR(36) NULL,
  blood_type ENUM('O+','O-','A+','A-','B+','B-','AB+','AB-') NOT NULL,
  units_requested SMALLINT UNSIGNED NOT NULL,
  urgency ENUM('routine','urgent','emergency') NOT NULL DEFAULT 'routine',
  status ENUM('awaiting_facility_review','awaiting_hub_review','approved','rejected','dispatched','fulfilled') NOT NULL,
  automated BOOLEAN NOT NULL DEFAULT FALSE,
  request_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  hub_decision_at TIMESTAMP NULL,
  CONSTRAINT fk_request_facility FOREIGN KEY (facility_id) REFERENCES facility(facility_id),
  CONSTRAINT fk_request_staff FOREIGN KEY (staff_id) REFERENCES staff(staff_id),
  CONSTRAINT chk_request_quantity CHECK (units_requested > 0),
  INDEX idx_request_queue (status,request_time),
  INDEX idx_request_facility (facility_id,request_time)
);

CREATE TABLE requisition_granted (
  fulfillment_id VARCHAR(36) PRIMARY KEY,
  request_id VARCHAR(36) NOT NULL UNIQUE,
  facility_id VARCHAR(36) NOT NULL,
  status ENUM('approved','dispatched','received','cancelled') NOT NULL,
  dispatch_time TIMESTAMP NULL,
  receiving_time TIMESTAMP NULL,
  CONSTRAINT fk_fulfillment_request FOREIGN KEY (request_id) REFERENCES requisition_request(request_id),
  CONSTRAINT fk_fulfillment_facility FOREIGN KEY (facility_id) REFERENCES facility(facility_id),
  INDEX idx_fulfillment_status (status)
);

CREATE TABLE fulfillment_unit (
  fulfillment_id VARCHAR(36) NOT NULL,
  unit_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (fulfillment_id,unit_id),
  UNIQUE KEY uq_fulfillment_unit (unit_id),
  CONSTRAINT fk_fulfillment_unit_grant FOREIGN KEY (fulfillment_id) REFERENCES requisition_granted(fulfillment_id),
  CONSTRAINT fk_fulfillment_unit_unit FOREIGN KEY (unit_id) REFERENCES blood_unit(unit_id)
);

CREATE TABLE scan_event (
  scan_id VARCHAR(36) PRIMARY KEY,
  unit_id VARCHAR(36) NOT NULL,
  facility_id VARCHAR(36) NOT NULL,
  fulfillment_id VARCHAR(36) NULL,
  staff_id VARCHAR(36) NULL,
  event_type ENUM('intake','dispense','expire','transfer') NOT NULL,
  event_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_scan_unit FOREIGN KEY (unit_id) REFERENCES blood_unit(unit_id),
  CONSTRAINT fk_scan_facility FOREIGN KEY (facility_id) REFERENCES facility(facility_id),
  CONSTRAINT fk_scan_fulfillment FOREIGN KEY (fulfillment_id) REFERENCES requisition_granted(fulfillment_id),
  CONSTRAINT fk_scan_staff FOREIGN KEY (staff_id) REFERENCES staff(staff_id),
  INDEX idx_scan_facility_time (facility_id,event_timestamp),
  INDEX idx_scan_unit_time (unit_id,event_timestamp)
);

CREATE TABLE alert (
  alert_id VARCHAR(36) PRIMARY KEY,
  facility_id VARCHAR(36) NOT NULL,
  request_id VARCHAR(36) NULL,
  alert_type ENUM('low_stock','expiry','requisition') NOT NULL,
  title VARCHAR(180) NOT NULL,
  detail VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  CONSTRAINT fk_alert_facility FOREIGN KEY (facility_id) REFERENCES facility(facility_id),
  CONSTRAINT fk_alert_request FOREIGN KEY (request_id) REFERENCES requisition_request(request_id),
  INDEX idx_alert_facility_active (facility_id,resolved_at,created_at)
);