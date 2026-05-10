# RideFlow — Full-Stack Ride-Hailing System

## Project Structure

```
ITERATION 3/
├── database/
│   └── schema.sql              ← MySQL schema (source of truth)
├── backend/
│   ├── config/db.js            ← MySQL connection pool
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── rideController.js
│   │   ├── driverController.js
│   │   ├── paymentController.js
│   │   ├── ratingController.js
│   │   └── adminController.js
│   ├── middleware/
│   │   ├── auth.js             ← JWT verify
│   │   └── roleCheck.js        ← RBAC (rider/driver/admin)
│   ├── routes/
│   │   ├── auth.js
│   │   ├── rides.js
│   │   ├── driver.js
│   │   ├── payments.js
│   │   ├── ratings.js
│   │   └── admin.js
│   ├── server.js
│   ├── package.json
│   └── .env
└── frontend/
    ├── index.html              ← Sign In / Register
    ├── rider.html              ← Rider Dashboard
    ├── driver.html             ← Driver Dashboard
    ├── admin.html              ← Admin Control Center
    ├── css/style.css
    └── js/api.js
```

---

## Setup Instructions

### 1. MySQL Setup

Open MySQL and run the schema:
```bash
mysql -u root -p < database/schema.sql
```

Or manually in MySQL Workbench / terminal:
```sql
SOURCE /path/to/database/schema.sql;
```

### 2. Configure Environment

Edit `backend/.env`:
```
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=rideflow
JWT_SECRET=rideflow_jwt_super_secret_2024
JWT_EXPIRES_IN=7d
```

### 3. Install & Run Backend
```bash
cd backend
npm install
npm run dev       # development (nodemon)
# OR
npm start         # production
```

### 4. Access the App

| Page | URL |
|------|-----|
| Sign In / Register | http://localhost:5000 |
| Rider Dashboard | http://localhost:5000/rider |
| Driver Dashboard | http://localhost:5000/driver |
| Admin Panel | http://localhost:5000/admin |

---

## Default Admin Credentials

| Field | Value |
|-------|-------|
| Email | `admin@rideflow.com` |
| Password | `password` |

---

## API Reference

### Auth (`/api/auth`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | — | Register rider or driver |
| POST | `/login` | — | Login, receive JWT |
| GET | `/profile` | ✓ | Get current user profile |

### Rides (`/api/rides`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/request` | rider | Create ride request + auto-assign driver |
| GET | `/history` | ✓ | Role-aware ride history |
| GET | `/active` | ✓ | Get current active ride |
| PATCH | `/:id/status` | ✓ | Update ride status |
| POST | `/:id/cancel` | rider | Cancel a ride |

### Driver (`/api/driver`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/pending-rides` | driver | Available ride requests |
| POST | `/rides/:id/accept` | driver | Accept a ride |
| POST | `/rides/:id/reject` | driver | Pass on a ride |
| PATCH | `/availability` | driver | Toggle online/offline |
| GET | `/earnings` | driver | Earnings breakdown |
| POST | `/vehicle` | driver | Register vehicle |
| PATCH | `/rides/:id/status` | driver | Update ride status |

### Payments (`/api/payments`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/history` | rider | Payment history |
| GET | `/ride/:ride_id` | ✓ | Payment for specific ride |
| POST | `/apply-promo` | ✓ | Apply promo code |
| POST | `/:id/complete` | ✓ | Mark payment complete |

### Ratings (`/api/ratings`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | rider | Submit ride rating |
| GET | `/driver/:driver_id` | ✓ | Driver's rating history |

### Admin (`/api/admin`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/analytics` | admin | Platform statistics |
| GET | `/users` | admin | List users (filterable) |
| GET | `/drivers` | admin | List all drivers |
| PATCH | `/drivers/:id/verify` | admin | Verify/unverify driver |
| PATCH | `/vehicles/:id/verify` | admin | Verify/unverify vehicle |
| PATCH | `/drivers/:id/flag` | admin | Flag/unflag driver |
| GET | `/rides` | admin | All rides (filterable) |

---

## Ride Lifecycle

```
requested → accepted → en_route → in_progress → completed
                                              ↘ cancelled (any stage)
```

- **requested**: Ride created, searching for driver
- **accepted**: Driver assigned and confirmed
- **en_route**: Driver heading to pickup
- **in_progress**: Rider onboard
- **completed**: Ride done → payment finalized + rating unlocked

## Fare Formula

```
fare = (BASE_FARE + distance_km × 1.20 + duration_min × 0.25) × surge_multiplier
```

- Base: $2.50
- Per km: $1.20
- Per minute: $0.25
- Surge: 1.0x default (configurable)

## Business Rules

- Only **online + verified** drivers with **verified vehicles** are auto-assigned
- Drivers below **3.5 avg rating** are automatically **flagged**
- Every completed ride creates a **payment record**
- Every completed ride allows exactly **one rating**
- Promo codes reduce fare; usage is tracked and capped
# RideFlow
