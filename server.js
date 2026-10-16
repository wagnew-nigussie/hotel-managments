require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// --- REDIRECT ROOT URL TO LOGIN ---
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// --- AUDIT LOG HELPER ---
function logAudit(userId, action, details) {
  try {
    db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(userId || null, action, details);
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

// --- AUTH MIDDLEWARES ---
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
    }
    next();
  };
}

// --- AUTH ENDPOINTS ---
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  req.session.user = { id: user.id, username: user.username, role: user.role };
  logAudit(user.id, 'LOGIN', `User ${user.username} logged in.`);
  res.json({ message: 'Login successful', user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.session.user) logAudit(req.session.user.id, 'LOGOUT', `User logged out.`);
  req.session.destroy(() => res.json({ message: 'Logged out successfully.' }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  res.json(req.session.user);
});

// --- ROOMS API ---
app.get('/api/rooms', isAuthenticated, (req, res) => {
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY room_number ASC').all();
  res.json(rooms);
});

app.patch('/api/rooms/:id/status', isAuthenticated, requireRole(['Admin', 'Receptionist', 'Housekeeping']), (req, res) => {
  const { status } = req.body;
  const validStatuses = ['clean', 'dirty', 'occupied', 'maintenance'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid room status.' });

  db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run(status, req.params.id);
  logAudit(req.session.user.id, 'UPDATE_ROOM_STATUS', `Room ID ${req.params.id} status changed to ${status}`);
  res.json({ message: 'Room status updated successfully.' });
});

// --- GUESTS API ---
app.get('/api/guests', isAuthenticated, requireRole(['Admin', 'Receptionist']), (req, res) => {
  const guests = db.prepare('SELECT * FROM guests ORDER BY name ASC').all();
  res.json(guests);
});

// --- BOOKINGS API & OVERLAP VALIDATION ---
app.get('/api/bookings', isAuthenticated, requireRole(['Admin', 'Receptionist']), (req, res) => {
  const bookings = db.prepare(`
    SELECT b.*, r.room_number, r.type as room_type, g.name as guest_name, g.phone, g.id_number
    FROM bookings b
    JOIN rooms r ON b.room_id = r.id
    JOIN guests g ON b.guest_id = g.id
    ORDER BY b.created_at DESC
  `).all();
  res.json(bookings);
});

app.post('/api/bookings', isAuthenticated, requireRole(['Admin', 'Receptionist']), (req, res) => {
  const { roomId, name, phone, idNumber, checkIn, checkOut } = req.body;
  
  if (!roomId || !name || !phone || !idNumber || !checkIn || !checkOut) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  if (new Date(checkOut) <= new Date(checkIn)) {
    return res.status(400).json({ error: 'Checkout date must be after check-in date.' });
  }

  // Check overlap rule: newStart < existingEnd AND newEnd > existingStart
  const overlapping = db.prepare(`
    SELECT * FROM bookings 
    WHERE room_id = ? 
      AND status IN ('booked', 'checked-in')
      AND ? < check_out_date 
      AND ? > check_in_date
  `).all(roomId, checkIn, checkOut);

  if (overlapping.length > 0) {
    return res.status(400).json({ error: 'Room is already booked for these dates (Overlapping booking).' });
  }

  const createBookingTx = db.transaction(() => {
    let guest = db.prepare('SELECT id FROM guests WHERE id_number = ?').get(idNumber);
    let guestId;
    if (!guest) {
      const info = db.prepare('INSERT INTO guests (name, phone, id_number) VALUES (?, ?, ?)').run(name, phone, idNumber);
      guestId = info.lastInsertRowid;
    } else {
      guestId = guest.id;
      db.prepare('UPDATE guests SET name = ?, phone = ? WHERE id = ?').run(name, phone, guestId);
    }

    const bookingInfo = db.prepare(`
      INSERT INTO bookings (room_id, guest_id, check_in_date, check_out_date, status)
      VALUES (?, ?, ?, ?, 'booked')
    `).run(roomId, guestId, checkIn, checkOut);
    const bookingId = bookingInfo.lastInsertRowid;

    const room = db.prepare('SELECT price_per_night FROM rooms WHERE id = ?').get(roomId);
    const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)) || 1;
    const roomCharges = room.price_per_night * nights;
    const tax = roomCharges * 0.15;
    const total = roomCharges + tax;

    db.prepare(`
      INSERT INTO bills (booking_id, room_charges, extras, tax_percent, discount, total_amount, balance_due, status)
      VALUES (?, ?, 0, 15.0, 0, ?, ?, 'unpaid')
    `).run(bookingId, roomCharges, total, total);

    return bookingId;
  });

  try {
    const bookingId = createBookingTx();
    logAudit(req.session.user.id, 'CREATE_BOOKING', `Created booking ID ${bookingId}`);
    res.json({ message: 'Booking created successfully.', bookingId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CHECK-IN / CHECK-OUT API ---
app.post('/api/bookings/:id/checkin', isAuthenticated, requireRole(['Admin', 'Receptionist']), (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });

  const tx = db.transaction(() => {
    db.prepare("UPDATE bookings SET status = 'checked-in' WHERE id = ?").run(booking.id);
    db.prepare("UPDATE rooms SET status = 'occupied' WHERE id = ?").run(booking.room_id);
  });
  tx();
  logAudit(req.session.user.id, 'CHECK_IN', `Checked in booking ID ${booking.id}`);
  res.json({ message: 'Guest checked in successfully.' });
});

app.post('/api/bookings/:id/checkout', isAuthenticated, requireRole(['Admin', 'Receptionist']), (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });

  const bill = db.prepare('SELECT * FROM bills WHERE booking_id = ?').get(booking.id);
  if (bill && bill.balance_due > 0 && req.session.user.role !== 'Admin') {
    return res.status(400).json({ error: 'Cannot check out: Balance is not fully paid.' });
  }

  const tx = db.transaction(() => {
    db.prepare("UPDATE bookings SET status = 'checked-out' WHERE id = ?").run(booking.id);
    db.prepare("UPDATE rooms SET status = 'dirty' WHERE id = ?").run(booking.room_id);
  });
  tx();
  logAudit(req.session.user.id, 'CHECK_OUT', `Checked out booking ID ${booking.id}`);
  res.json({ message: 'Guest checked out successfully. Room marked as dirty.' });
});

// --- BILLING & PAYMENTS API ---
app.get('/api/bills', isAuthenticated, requireRole(['Admin', 'Receptionist']), (req, res) => {
  const bills = db.prepare(`
    SELECT b.*, bk.id as booking_id, g.name as guest_name, r.room_number
    FROM bills b
    JOIN bookings bk ON b.booking_id = bk.id
    JOIN guests g ON bk.guest_id = g.id
    JOIN rooms r ON bk.room_id = r.id
    ORDER BY b.id DESC
  `).all();
  res.json(bills);
});

app.post('/api/bills/:id/extras', isAuthenticated, requireRole(['Admin', 'Receptionist']), (req, res) => {
  const { extrasAmount } = req.body;
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'Bill not found.' });

  const newExtras = bill.extras + parseFloat(extrasAmount);
  const subtotal = bill.room_charges + newExtras - bill.discount;
  const tax = subtotal * (bill.tax_percent / 100);
  const total = subtotal + tax;

  db.prepare('UPDATE bills SET extras = ?, total_amount = ?, balance_due = ? WHERE id = ?')
    .run(newExtras, total, total - (bill.total_amount - bill.balance_due), bill.id);

  res.json({ message: 'Extras added successfully.' });
});

app.post('/api/bills/:id/pay', isAuthenticated, requireRole(['Admin', 'Receptionist']), (req, res) => {
  const { amount, method } = req.body;
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'Bill not found.' });

  const payAmount = parseFloat(amount);
  if (payAmount <= 0) return res.status(400).json({ error: 'Invalid payment amount.' });

  const payTx = db.transaction(() => {
    db.prepare('INSERT INTO payments (bill_id, amount, payment_method) VALUES (?, ?, ?)').run(bill.id, payAmount, method);
    const newBalance = Math.max(0, bill.balance_due - payAmount);
    const newStatus = newBalance === 0 ? 'paid' : 'partial';
    db.prepare('UPDATE bills SET balance_due = ?, status = ? WHERE id = ?').run(newBalance, newStatus, bill.id);
  });

  payTx();
  logAudit(req.session.user.id, 'PAYMENT', `Paid ${payAmount} via ${method} for bill ID ${bill.id}`);
  res.json({ message: 'Payment recorded successfully.' });
});

// PDF Invoice Download
app.get('/api/bills/:id/pdf', isAuthenticated, (req, res) => {
  const billData = db.prepare(`
    SELECT b.*, bk.check_in_date, bk.check_out_date, g.name as guest_name, g.phone, r.room_number, r.type as room_type
    FROM bills b
    JOIN bookings bk ON b.booking_id = bk.id
    JOIN guests g ON bk.guest_id = g.id
    JOIN rooms r ON bk.room_id = r.id
    WHERE b.id = ?
  `).get(req.params.id);

  if (!billData) return res.status(404).json({ error: 'Bill not found.' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${billData.id}.pdf`);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(22).text('GRAND HOTEL INVOICE', { align: 'center' });
  doc.fontSize(10).text('30 Luxury Rooms & Suites | Tel: +251 900000000', { align: 'center' });
  doc.moveDown();

  doc.fontSize(12).text(`Invoice ID: INV-${billData.id}`);
  doc.text(`Guest Name: ${billData.guest_name}`);
  doc.text(`Phone: ${billData.phone}`);
  doc.text(`Room Number: ${billData.room_number} (${billData.room_type})`);
  doc.text(`Check-In: ${billData.check_in_date} | Check-Out: ${billData.check_out_date}`);
  doc.moveDown();

  doc.text('------------------------------------------------------------------------------------------');
  doc.text(`Room Charges: $${billData.room_charges.toFixed(2)}`);
  doc.text(`Extras (Food/Laundry): $${billData.extras.toFixed(2)}`);
  doc.text(`Tax (${billData.tax_percent}%): $${(billData.total_amount - billData.room_charges - billData.extras).toFixed(2)}`);
  doc.text(`Discount: -$${billData.discount.toFixed(2)}`);
  doc.text('------------------------------------------------------------------------------------------');
  doc.fontSize(14).text(`Total Amount: $${billData.total_amount.toFixed(2)}`, { bold: true });
  doc.text(`Balance Due: $${billData.balance_due.toFixed(2)}`);
  doc.text(`Status: ${billData.status.toUpperCase()}`);
  doc.moveDown(2);
  doc.fontSize(10).text('Thank you for staying with us!', { align: 'center' });

  doc.end();
});

// --- REPORTS API ---
app.get('/api/reports', isAuthenticated, requireRole(['Admin']), (req, res) => {
  const totalRooms = db.prepare('SELECT COUNT(*) as count FROM rooms').get().count;
  const occupiedRooms = db.prepare("SELECT COUNT(*) as count FROM rooms WHERE status = 'occupied'").get().count;
  const occupancyRate = ((occupiedRooms / totalRooms) * 100).toFixed(1);

  const dailyRevenue = db.prepare("SELECT SUM(amount) as revenue FROM payments WHERE DATE(paid_at) = DATE('now')").get().revenue || 0;
  const monthlyRevenue = db.prepare("SELECT SUM(amount) as revenue FROM payments WHERE strftime('%Y-%m', paid_at) = strftime('%Y-%m', 'now')").get().revenue || 0;

  const summary = db.prepare('SELECT status, COUNT(*) as count FROM bookings GROUP BY status').all();

  res.json({ totalRooms, occupiedRooms, occupancyRate, dailyRevenue, monthlyRevenue, summary });
});

// --- STAFF API ---
app.get('/api/staff', isAuthenticated, requireRole(['Admin']), (req, res) => {
  const staff = db.prepare('SELECT id, username, role, created_at FROM users').all();
  res.json(staff);
});

app.post('/api/staff', isAuthenticated, requireRole(['Admin']), (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: 'All fields required.' });

  const hashed = bcrypt.hashSync(password, 10);
  try {
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hashed, role);
    logAudit(req.session.user.id, 'CREATE_STAFF', `Created staff account ${username}`);
    res.json({ message: 'Staff user created successfully.' });
  } catch (err) {
    res.status(400).json({ error: 'Username already exists.' });
  }
});

// --- AUDIT LOGS API ---
app.get('/api/audit-logs', isAuthenticated, requireRole(['Admin']), (req, res) => {
  const logs = db.prepare(`
    SELECT a.*, u.username 
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.timestamp DESC LIMIT 100
  `).all();
  res.json(logs);
});

app.listen(PORT, () => {
  console.log(`Hotel Management Server running at http://localhost:${PORT}`);
});