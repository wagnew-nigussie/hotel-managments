# 🏨 Hotel Management System

A web-based Hotel Management System designed to manage room bookings, guest check-ins/check-outs, billing, staff administrative controls, and audit logs. Built with Node.js, Express, and SQLite.

---

## 🚀 Features

* **Authentication & Authorization**: Secure login with role-based access control (Admin, Receptionist, Housekeeping).
* **Room Management**: View, add, and manage 30+ hotel rooms and their real-time statuses.
* **Bookings & Check-Ins**: Create guest reservations with overlap validation and track active stays.
* **Automated Billing**: Generate and download PDF invoices for guest billing using `pdfkit`.
* **Staff Management**: Admin dashboard to manage employee accounts and roles.
* **Audit Logging**: Real-time logging of user actions for security and tracking.

---

## 🛠️ Tech Stack

* **Backend**: Node.js, Express.js
* **Database**: SQLite (`better-sqlite3`)
* **Security**: `bcrypt` (password hashing), `express-session` (session management)
* **PDF Generation**: `pdfkit`
* **Frontend**: HTML5, CSS3, JavaScript (Vanilla JS)

---

## ⚙️ Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/wagnew-nigussie/hotel-managments.git](https://github.com/wagnew-nigussie/hotel-managments.git)
   cd hotel-managments
