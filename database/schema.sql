
USE medihub;

-- 1. Users (pharmacist & admin)
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'pharmacist') NOT NULL DEFAULT 'pharmacist',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Suppliers
CREATE TABLE suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  contact_person VARCHAR(100),
  phone VARCHAR(30),
  email VARCHAR(100),
  address VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Medicines (the catalog, not the physical stock)
CREATE TABLE medicines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  generic_name VARCHAR(150),
  category VARCHAR(80),           -- e.g. Antibiotic, Analgesic, Antihistamine
  dosage_form VARCHAR(50),        -- e.g. Tablet, Syrup, Capsule
  strength VARCHAR(50),           -- e.g. 500mg
  unit VARCHAR(30) NOT NULL,      -- e.g. box, bottle, piece
  reorder_level INT DEFAULT 10,   -- threshold for low-stock alerts
  requires_prescription BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Batches (each physical lot of a medicine — THIS is where expiry lives)
CREATE TABLE batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  medicine_id INT NOT NULL,
  supplier_id INT,
  batch_number VARCHAR(80) NOT NULL,
  quantity_received INT NOT NULL,
  quantity_remaining INT NOT NULL,
  cost_price DECIMAL(10,2),
  selling_price DECIMAL(10,2),
  manufacture_date DATE,
  expiry_date DATE NOT NULL,
  date_received DATE NOT NULL DEFAULT (CURRENT_DATE),
  status ENUM('active', 'expired', 'depleted', 'recalled') DEFAULT 'active',
  FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  INDEX idx_expiry (expiry_date),
  INDEX idx_medicine (medicine_id)
);

-- 5. Stock transactions (every movement — in, out, adjustment, disposal)
CREATE TABLE stock_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT NOT NULL,
  user_id INT NOT NULL,
  transaction_type ENUM('stock_in', 'sale', 'adjustment', 'disposal', 'return') NOT NULL,
  quantity INT NOT NULL,          -- positive or negative depending on type
  reason VARCHAR(255),            -- e.g. "sold to walk-in", "expired disposal"
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_batch (batch_id),
  INDEX idx_created (created_at)
);

-- 6. Notifications (system + AI generated alerts)
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('low_stock', 'near_expiry', 'expired', 'ai_risk_flag', 'ai_reorder_suggestion') NOT NULL,
  reference_id INT,               -- medicine_id or batch_id depending on type
  message VARCHAR(255) NOT NULL,
  severity ENUM('info', 'warning', 'critical') DEFAULT 'info',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Audit logs (regulatory traceability — who did what)
CREATE TABLE audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(100) NOT NULL,   -- e.g. "created_batch", "deleted_medicine", "login"
  details TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 8. AI conversation persistence
CREATE TABLE ai_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
  messages_json LONGTEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_conv (user_id, updated_at)
);

-- 9. AI model persistence (stores trained TensorFlow.js weights for expiry risk model)
CREATE TABLE ai_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  model_name VARCHAR(50) NOT NULL UNIQUE,
  weights_json LONGTEXT NOT NULL,
  feature_stats_json TEXT NOT NULL,
  training_samples INT DEFAULT 0,
  training_loss FLOAT,
  training_accuracy FLOAT,
  trained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
