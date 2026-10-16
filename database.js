const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const db = new Database(path.join(__dirname, 'hotel.db'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('Admin', 'Receptionist', 'Housekeeping')) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_number TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    price_per_night REAL NOT NULL,
    floor INTEGER NOT NULL,
    status TEXT CHECK(status IN ('clean', 'dirty', 'occupied', 'maintenance')) DEFAULT 'clean',
    amenities TEXT
  );

  CREATE TABLE IF NOT EXISTS guests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    id_number TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    guest_id INTEGER NOT NULL,
    check_in_date TEXT NOT NULL,
    check_out_date TEXT NOT NULL,
    status TEXT CHECK(status IN ('booked', 'checked-in', 'checked-out', 'cancelled')) DEFAULT 'booked',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(room_id) REFERENCES rooms(id),
    FOREIGN KEY(guest_id) REFERENCES guests(id)
  );

  CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER UNIQUE NOT NULL,
    room_charges REAL NOT NULL,
    extras REAL DEFAULT 0,
    tax_percent REAL DEFAULT 15.0,
    discount REAL DEFAULT 0,
    total_amount REAL NOT NULL,
    balance_due REAL NOT NULL,
    status TEXT CHECK(status IN ('unpaid', 'partial', 'paid')) DEFAULT 'unpaid',
    FOREIGN KEY(booking_id) REFERENCES bookings(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT CHECK(payment_method IN ('cash', 'card', 'telebirr')) NOT NULL,
    paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(bill_id) REFERENCES bills(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Seed Admin User and 30 Rooms if empty
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
if (userCount === 0) {
  const hashedPassword = bcrypt.hashSync('Admin@123', 10);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hashedPassword, 'Admin');
  
  // Seed staff examples
  const staffPass = bcrypt.hashSync('Staff@123', 10);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('reception', staffPass, 'Receptionist');
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('cleaner', staffPass, 'Housekeeping');

  // Seed 30 Rooms across 3 floors
  const types = ['Single', 'Double', 'Suite', 'Deluxe'];
  const insertRoom = db.prepare('INSERT INTO rooms (room_number, type, price_per_night, floor, status, amenities) VALUES (?, ?, ?, ?, ?, ?)');
  
  const seedRooms = db.transaction(() => {
    let roomNum = 101;
    for (let i = 1; i <= 30; i++) {
      const floor = Math.floor(i / 10) + 1;
      const type = types[(i - 1) % types.length];
      const price = type === 'Single' ? 50 : type === 'Double' ? 80 : type === 'Suite' ? 150 : 110;
      const amenities = 'WiFi, TV, AC, Hot Shower';
      insertRoom.run(`${roomNum}`, type, price, floor, 'clean', amenities);
      roomNum++;
      if (roomNum % 10 === 0) roomNum += 71; // e.g. 101-110, then 201-210, 301-310
    }
  });
  seedRooms();
  console.log('Database seeded successfully with 30 rooms and initial users.');
}

module.exports = db;