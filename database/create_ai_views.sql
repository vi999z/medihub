-- Create views for AI chat functionality

-- Summary view with overall inventory statistics
CREATE OR REPLACE VIEW summary_view AS
SELECT 
  COUNT(DISTINCT m.id) as total_medicines,
  COUNT(DISTINCT b.id) as total_batches,
  SUM(b.quantity_remaining) as total_stock,
  COUNT(CASE WHEN b.status = 'active' AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as expiring_soon,
  COUNT(CASE WHEN b.quantity_remaining <= m.reorder_level THEN 1 END) as low_stock_count,
  COUNT(CASE WHEN b.status = 'expired' THEN 1 END) as expired_count
FROM medicines m
LEFT JOIN batches b ON m.id = b.medicine_id;

-- Low stock view for medicines below reorder level
CREATE OR REPLACE VIEW low_stock_view AS
SELECT 
  m.id,
  m.name,
  m.generic_name,
  m.category,
  m.strength,
  m.dosage_form,
  m.reorder_level,
  COALESCE(SUM(b.quantity_remaining), 0) as total_quantity,
  m.unit
FROM medicines m
LEFT JOIN batches b ON m.id = b.medicine_id AND b.status = 'active'
GROUP BY m.id, m.name, m.generic_name, m.category, m.strength, m.dosage_form, m.reorder_level, m.unit
HAVING total_quantity <= m.reorder_level OR total_quantity = 0
ORDER BY total_quantity ASC;

-- Sales trend view for transaction analysis
CREATE OR REPLACE VIEW sales_trend_view AS
SELECT 
  DATE(st.created_at) as date,
  COUNT(st.id) as transaction_count,
  SUM(CASE WHEN st.transaction_type = 'sale' THEN ABS(st.quantity) ELSE 0 END) as items_sold,
  SUM(CASE WHEN st.transaction_type = 'stock_in' THEN st.quantity ELSE 0 END) as stock_added
FROM stock_transactions st
WHERE st.transaction_type IN ('sale', 'stock_in')
  AND st.created_at >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
GROUP BY DATE(st.created_at)
ORDER BY date DESC;
