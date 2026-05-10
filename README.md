# RideFlow — Full-Stack Ride-Hailing System

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0+-blue.svg)](https://www.mysql.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 📋 Overview

RideFlow is a comprehensive full-stack ride-hailing platform developed as part of a Database Laboratory course project. This iteration (Iteration 3) implements a complete ride-sharing system with role-based access control, real-time ride management, payment processing, and administrative oversight.

The system supports three primary user roles:
- **Riders**: Request and track rides
- **Drivers**: Accept rides and manage availability
- **Administrators**: Monitor platform analytics and manage users

## ✨ Features

- 🔐 **Secure Authentication**: JWT-based authentication with role-based access control
- 🚗 **Real-time Ride Management**: Automated driver assignment and ride status tracking
- 💳 **Payment Integration**: Fare calculation with promo code support
- ⭐ **Rating System**: Driver and rider feedback mechanism
- 📊 **Admin Dashboard**: Comprehensive analytics and user management
- 🗄️ **MySQL Database**: Robust relational database design with proper normalization
- 🌐 **Responsive Frontend**: Clean, intuitive user interfaces for all roles

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL 8.0+
- **Authentication**: JSON Web Tokens (JWT)
- **Security**: bcrypt for password hashing

### Frontend
- **HTML5**: Semantic markup
- **CSS3**: Responsive design
- **Vanilla JavaScript**: Client-side logic and API integration

### Database
- **Schema**: Relational design with foreign keys and constraints
- **Connection**: MySQL connection pooling for performance

## 📁 Project Structure

```
ITERATION 3/
├── database/
│   └── schema.sql              # MySQL database schema
├── backend/
│   ├── config/
│   │   └── db.js               # Database connection configuration
│   ├── controllers/
│   │   ├── authController.js   # Authentication logic
│   │   ├── rideController.js   # Ride management
│   │   ├── driverController.js # Driver operations
│   │   ├── paymentController.js# Payment processing
│   │   ├── ratingController.js # Rating system
│   │   └── adminController.js  # Administrative functions
│   ├── middleware/
│   │   ├── auth.js             # JWT authentication middleware
│   │   └── roleCheck.js        # Role-based access control
│   ├── routes/
│   │   ├── auth.js             # Authentication endpoints
│   │   ├── rides.js            # Ride-related API routes
│   │   ├── driver.js           # Driver management routes
│   │   ├── payments.js         # Payment API routes
│   │   ├── ratings.js          # Rating system routes
│   │   └── admin.js            # Admin control routes
│   ├── server.js               # Main application server
│   ├── package.json            # Node.js dependencies
│   └── dump.js                 # Database seeding script
└── frontend/
    ├── index.html              # Landing page (Sign In/Register)
    ├── rider.html              # Rider dashboard
    ├── driver.html             # Driver dashboard
    ├── admin.html              # Admin control panel
    ├── css/
    │   └── style.css           # Application stylesheets
    └── js/
        └── api.js              # Frontend API client
```

## 🚀 Installation & Setup

### Prerequisites

- **Node.js** (v18 or higher)
- **MySQL Server** (v8.0 or higher)
- **Git** (for cloning the repository)

### 1. Database Setup

1. Start your MySQL server
2. Create a new database named `rideflow`
3. Execute the schema file:

```bash
mysql -u root -p rideflow < database/schema.sql
```

### 2. Environment Configuration

Create a `.env` file in the `backend/` directory:

```env
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=rideflow
JWT_SECRET=rideflow_jwt_super_secret_2024
JWT_EXPIRES_IN=7d
```

### 3. Backend Installation

```bash
cd backend
npm install
npm run dev       # Development mode with auto-reload
# OR
npm start         # Production mode
```

### 4. Access the Application

The application will be available at `http://localhost:5000` with the following pages:

| User Role | URL | Description |
|-----------|-----|-------------|
| Public | `http://localhost:5000` | Sign In / Registration |
| Rider | `http://localhost:5000/rider` | Rider Dashboard |
| Driver | `http://localhost:5000/driver` | Driver Dashboard |
| Admin | `http://localhost:5000/admin` | Admin Control Panel |

## 🔑 Default Credentials

### Admin Account
- **Email**: `admin@rideflow.com`
- **Password**: `password`

## 📚 API Reference

### Authentication Endpoints (`/api/auth`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/register` | ❌ | Register new rider or driver account |
| POST | `/login` | ❌ | Authenticate user and receive JWT token |
| GET | `/profile` | ✅ | Retrieve current user profile information |

### Ride Management (`/api/rides`)

| Method | Endpoint | Auth Required | Role | Description |
|--------|----------|---------------|------|-------------|
| POST | `/request` | ✅ | Rider | Create new ride request with automatic driver assignment |
| GET | `/history` | ✅ | Any | Retrieve ride history (filtered by user role) |
| GET | `/active` | ✅ | Any | Get details of current active ride |
| PATCH | `/:id/status` | ✅ | Any | Update ride status |
| POST | `/:id/cancel` | ✅ | Rider | Cancel an existing ride |

### Driver Operations (`/api/driver`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/pending-rides` | ✅ | Get list of available ride requests |
| POST | `/rides/:id/accept` | ✅ | Accept a ride request |
| POST | `/rides/:id/reject` | ✅ | Reject a ride request |
| PATCH | `/availability` | ✅ | Toggle online/offline status |
| GET | `/earnings` | ✅ | View earnings breakdown |
| POST | `/vehicle` | ✅ | Register or update vehicle information |
| PATCH | `/rides/:id/status` | ✅ | Update status of assigned ride |

### Payment System (`/api/payments`)

| Method | Endpoint | Auth Required | Role | Description |
|--------|----------|---------------|------|-------------|
| GET | `/history` | ✅ | Rider | View payment history |
| GET | `/ride/:ride_id` | ✅ | Any | Get payment details for specific ride |
| POST | `/apply-promo` | ✅ | Any | Apply promotional code to reduce fare |
| POST | `/:id/complete` | ✅ | Any | Mark payment as completed |

### Rating System (`/api/ratings`)

| Method | Endpoint | Auth Required | Role | Description |
|--------|----------|---------------|------|-------------|
| POST | `/` | ✅ | Rider | Submit rating for completed ride |
| GET | `/driver/:driver_id` | ✅ | Any | View driver's rating history |

### Administrative Functions (`/api/admin`)

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/analytics` | ✅ | Platform-wide statistics and metrics |
| GET | `/users` | ✅ | List all users with filtering options |
| GET | `/drivers` | ✅ | Comprehensive driver listing |
| PATCH | `/drivers/:id/verify` | ✅ | Verify or unverify driver account |
| PATCH | `/vehicles/:id/verify` | ✅ | Verify or unverify vehicle registration |
| PATCH | `/drivers/:id/flag` | ✅ | Flag or unflag driver for violations |
| GET | `/rides` | ✅ | View all rides with filtering capabilities |

## 🔄 Ride Lifecycle

The ride management system follows a structured state machine:

```
requested → accepted → en_route → in_progress → completed
                                              ↘ cancelled (at any stage)
```

### State Descriptions
- **requested**: Ride has been created, system is searching for available driver
- **accepted**: Driver has been assigned and confirmed the ride
- **en_route**: Driver is traveling to pickup location
- **in_progress**: Rider is onboard, trip is active
- **completed**: Ride finished, payment processed, rating available

## 💰 Fare Calculation

The fare is calculated using the following formula:

```
fare = (BASE_FARE + distance_km × 1.20 + duration_min × 0.25) × surge_multiplier
```

### Pricing Components
- **Base Fare**: $2.50 (fixed)
- **Per Kilometer**: $1.20
- **Per Minute**: $0.25
- **Surge Multiplier**: 1.0x (default, configurable based on demand)

## 📋 Business Rules

- **Driver Assignment**: Only online, verified drivers with verified vehicles are eligible for automatic assignment
- **Quality Control**: Drivers with average rating below 3.5 are automatically flagged for review
- **Payment Processing**: Every completed ride generates a corresponding payment record
- **Feedback System**: Each completed ride allows exactly one rating submission
- **Promotional Codes**: Usage is tracked with configurable caps and expiration

## 🤝 Contributing

This project was developed as part of an academic database laboratory course. For educational purposes only.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

Developed as part of Database Laboratory coursework.

---

*RideFlow - Connecting Riders and Drivers Efficiently*
