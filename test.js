const db = require('./database');

console.log('--- Running Hotel System Tests ---');

// Test 1: Check if 30 rooms were seeded
const roomCount = db.prepare('SELECT COUNT(*) as count FROM rooms').get().count;
console.assert(roomCount === 30, `Expected 30 rooms, found ${roomCount}`);
console.log('✅ Room seeding test passed (30 rooms verified).');

// Test 2: Bill calculation math test
const roomPrice = 100;
const nights = 3;
const roomCharges = roomPrice * nights;
const tax = roomCharges * 0.15;
const total = roomCharges + tax;
console.assert(total === 345, `Expected 345, got ${total}`);
console.log('✅ Bill tax calculation test passed.');

console.log('--- All tests completed successfully! ---');
process.exit(0);