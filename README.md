# 🏨 Hotel Management System

A web-based Hotel Management System for managing hotel rooms, guest bookings, check-in/check-out, billing, staff accounts, and audit logs.

## 🚀 Features

- **Authentication and Authorization:** Role-based access for Admin, Receptionist, and Housekeeping.
- **Room Management:** Manage hotel rooms and view their current status.
- **Bookings and Check-In/Check-Out:** Create reservations and track guest stays.
- **Billing:** Generate and download PDF invoices.
- **Staff Management:** Manage employee accounts and roles.
- **Audit Logging:** Track user actions for security and accountability.

## 🛠️ Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** SQLite with `better-sqlite3`
- **Frontend:** HTML, CSS, JavaScript
- **Security:** `bcrypt`, `express-session`
- **PDF Generation:** `pdfkit`

## ⚙️ Installation and Setup

### 1. Clone the repository

```bash
git clone https://github.com/wagnew-nigussie/hotel-managments.git
cd hotel-managments
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the application

Check the `scripts` section in `package.json` for the correct start command. Commonly, it is:

```bash
npm start
```

If `npm start` is not defined, use the start command specified in your `package.json`.

### 4. Open the application

Open your browser and visit the local address displayed in the terminal, commonly:

```text
http://localhost:3000
```

## 🔐 Security

- Do not commit passwords, session secrets, or other sensitive credentials.
- Configure environment variables as required by the project.

## 📄 License

No license has been specified yet.
