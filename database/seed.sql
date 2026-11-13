-- Campus Marketplace — demo data
-- Both demo accounts use the password: password123
-- Run after schema.sql. Uses ON CONFLICT so it is safe to re-run for users/categories.

INSERT INTO categories (name) VALUES
  ('Books'),
  ('Calculators'),
  ('Lab Gear'),
  ('Hostel Essentials'),
  ('Stationery'),
  ('Clothing'),
  ('Electronics'),
  ('Sports & Hobbies')
ON CONFLICT (name) DO NOTHING;

INSERT INTO users (name, email, phone, password_hash) VALUES
  ('Aarav Sharma', 'aarav@campus.edu', '98765 43210',
   '$2b$10$KWDns1SAoLWoGsqNeFZc8.HN4.vzg857c8aPIijTBuaI/vmdjJoN6'),
  ('Priya Nair',   'priya@campus.edu', '91234 56789',
   '$2b$10$KWDns1SAoLWoGsqNeFZc8.HN4.vzg857c8aPIijTBuaI/vmdjJoN6')
ON CONFLICT (email) DO NOTHING;

-- Products: look up seller and category by natural keys so ids never need hard-coding.
INSERT INTO products (seller_id, category_id, title, description, price, item_condition, status, created_at)
SELECT u.id, c.id, p.title, p.description, p.price, p.item_condition, p.status, NOW() - p.age
FROM (VALUES
  ('aarav@campus.edu', 'Books', 'H.C. Verma — Concepts of Physics (Vol 1 & 2)',
   'Both volumes, a few pencil marks in the mechanics chapters. Perfect for first-year physics.',
   450, 'Good', 'available', INTERVAL '2 days'),
  ('aarav@campus.edu', 'Calculators', 'Casio fx-991ES Plus scientific calculator',
   'Allowed in university exams. Works perfectly, comes with the hard cover.',
   650, 'Like new', 'available', INTERVAL '1 day'),
  ('priya@campus.edu', 'Lab Gear', 'White lab coat (size M) + safety goggles',
   'Used for one semester of chemistry lab. Washed, no stains.',
   300, 'Good', 'available', INTERVAL '3 days'),
  ('priya@campus.edu', 'Hostel Essentials', 'Prestige electric kettle 1.5 L',
   'Great for Maggi and chai at 2 a.m. Auto shut-off works.',
   500, 'Good', 'available', INTERVAL '5 hours'),
  ('aarav@campus.edu', 'Hostel Essentials', 'Single bed mattress (3 x 6 ft) + pillow',
   'Foam mattress, 4 inches thick. Moving out of the hostel, must go this week.',
   1200, 'Fair', 'available', INTERVAL '6 days'),
  ('priya@campus.edu', 'Stationery', 'Engineering drawing kit — mini drafter, set squares, compass',
   'Complete ED kit with the drafter and a sheet holder. Used for one semester.',
   350, 'Good', 'available', INTERVAL '4 days'),
  ('aarav@campus.edu', 'Electronics', 'Arduino Uno starter kit with sensors',
   'Breadboard, jumper wires, LEDs, ultrasonic + DHT11 sensors, servo. Everything in the box.',
   900, 'Like new', 'available', INTERVAL '12 hours'),
  ('priya@campus.edu', 'Clothing', 'College fest hoodie (size L), navy blue',
   'Official fest merch from last year, worn twice.',
   400, 'Like new', 'available', INTERVAL '7 days'),
  ('aarav@campus.edu', 'Books', 'RD Sharma Class 12 Mathematics + GATE previous papers',
   'Good for brushing up maths and starting GATE prep.',
   250, 'Fair', 'sold', INTERVAL '9 days'),
  ('priya@campus.edu', 'Electronics', 'boAt Rockerz 450 Bluetooth headphones',
   'Battery still lasts about 12 hours. Minor scratch on the left cup.',
   800, 'Good', 'available', INTERVAL '2 hours'),
  ('aarav@campus.edu', 'Sports & Hobbies', 'Yonex badminton racket + 3 shuttles',
   'Light racket, string tension fine. Good for the evening games at the sports complex.',
   550, 'Good', 'available', INTERVAL '8 days'),
  ('priya@campus.edu', 'Calculators', 'Casio fx-82MS basic scientific calculator',
   'Simple and reliable. Battery replaced last month.',
   300, 'Good', 'sold', INTERVAL '10 days')
) AS p(seller_email, category, title, description, price, item_condition, status, age)
JOIN users u      ON u.email = p.seller_email
JOIN categories c ON c.name  = p.category
WHERE NOT EXISTS (SELECT 1 FROM products);   -- only seed products into an empty table

-- Priya saved Aarav's calculator.
INSERT INTO wishlist (user_id, product_id)
SELECT u.id, p.id
FROM users u, products p
WHERE u.email = 'priya@campus.edu' AND p.title LIKE 'Casio fx-991ES%'
ON CONFLICT DO NOTHING;

-- Aarav saved Priya's kettle.
INSERT INTO wishlist (user_id, product_id)
SELECT u.id, p.id
FROM users u, products p
WHERE u.email = 'aarav@campus.edu' AND p.title LIKE 'Prestige electric kettle%'
ON CONFLICT DO NOTHING;

-- A sample conversation about the calculator (Priya asks, Aarav replies).
INSERT INTO messages (product_id, sender_id, receiver_id, body, created_at)
SELECT p.id, s.id, r.id, m.body, NOW() - m.age
FROM (VALUES
  ('priya@campus.edu', 'aarav@campus.edu',
   'Hi! Is the fx-991ES still available? Can you do ₹600?', INTERVAL '20 hours'),
  ('aarav@campus.edu', 'priya@campus.edu',
   'Yes, still available. ₹600 works — can meet at the library gate after 5 pm.', INTERVAL '19 hours'),
  ('priya@campus.edu', 'aarav@campus.edu',
   'Perfect, see you there tomorrow!', INTERVAL '18 hours')
) AS m(sender_email, receiver_email, body, age)
JOIN users s    ON s.email = m.sender_email
JOIN users r    ON r.email = m.receiver_email
JOIN products p ON p.title LIKE 'Casio fx-991ES%'
WHERE NOT EXISTS (SELECT 1 FROM messages);
