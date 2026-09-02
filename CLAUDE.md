# Vehicle Service Center — Senavi Auto Care

Full-stack vehicle service center management system. Monorepo with separate `backend/` (Express + MongoDB) and `frontend/` (React + Vite) directories. No root-level package.json — run npm commands inside each directory.

## Quick Start

```bash
# Backend (port 5000)
cd backend && npm install && npm run dev

# Frontend (port 5173)
cd frontend && npm install && npm run dev
```

Backend requires a `.env` file in `backend/` with `PORT`, `MONGO_URI`, and `JWT_SECRET`.

## Tech Stack

| Layer      | Technology                                      |
| ---------- | ----------------------------------------------- |
| Backend    | Node.js (ES Modules), Express 5.2, Mongoose 9.0 |
| Database   | MongoDB Atlas                                   |
| Frontend   | React 18.2, React Router 6.30, Vite 5.4        |
| Auth       | JWT (7-day expiry) + bcryptjs, RBAC (OWNER/OPERATOR) |
| HTTP       | Axios with Bearer token interceptor             |
| State      | React Context API (AuthContext)                  |
| PWA        | vite-plugin-pwa (service workers, manifest)     |
| Tests      | Node.js built-in test runner (`node --test`)    |
| Linting    | ESLint (frontend only)                          |

## Project Structure

```
backend/
├── src/
│   ├── server.js              # Entry point — loads env, connects DB, starts server
│   ├── app.js                 # Express app, CORS, route mounting, error handlers
│   ├── config/db.js           # Mongoose connection
│   ├── routes/                # 32 route files (one per resource)
│   ├── controllers/           # 33 controller files (business logic)
│   ├── models/                # 39 Mongoose models
│   ├── middlewares/
│   │   ├── authMiddleware.js  # JWT protect, requireOwner, requireSalesAccess, requirePayrollAccess
│   │   └── errorMiddleware.js # Global error handler + 404
│   ├── services/              # Business logic (salesService.js)
│   └── utils/                 # Helpers: jwt, accessControl, payrollEngine, discounts, etc.
└── test/                      # 8 unit test files for utils/services

frontend/
├── src/
│   ├── main.jsx               # React root with BrowserRouter + AuthProvider
│   ├── App.jsx                # 40+ route definitions
│   ├── pages/                 # Full page components (JobCards, Customers, Staff, etc.)
│   ├── components/            # Reusable UI components
│   ├── layouts/               # AppLayout, DashboardLayout, Sidebar
│   ├── routes/                # ProtectedRoute, OwnerRoute wrappers
│   ├── context/AuthContext.jsx # Global auth state, login/logout, permissions
│   ├── services/api.js        # Axios instance (baseURL: localhost:5000/api)
│   ├── hooks/                 # Custom hooks (useLocalStorageState)
│   └── utils/                 # Billing, inventory, discount, reporting helpers
└── public/                    # PWA icons
```

## Conventions

### Naming
- **Models:** PascalCase files and exports (`JobCard.js`)
- **Controllers:** camelCase files (`jobCardController.js`)
- **Routes:** camelCase files (`jobCardRoutes.js`)
- **API endpoints:** kebab-case (`/api/job-cards`, `/api/inventory-categories`)
- **Variables:** camelCase throughout

### API Patterns
- All endpoints under `/api/{resource}` — no versioning
- RESTful: GET list/detail, POST create, PUT/PATCH update, DELETE remove
- Auth via `Authorization: Bearer {token}` header
- Frontend stores token in localStorage key `ksc_token`

### Auth & Permissions
- Two roles: `OWNER` (full access) and `OPERATOR` (permission-gated)
- Permissions are merged from Role model + user-specific overrides
- 15 permission flags: `markAttendance`, `approveLeave`, `runPayroll`, `viewReports`, `manageEmployees`, `manageRoles`, `manageInventory`, `manageJobCards`, `manageCustomers`, `manageInvoices`, `manageVehicles`, `manageServices`, `viewDashboard`, `manageSalaryConfig`, `approvePayroll`
- Frontend uses `PATH_PERMISSION_MAP` in OwnerRoute to gate routes by permission

### Frontend Routing
- All authenticated pages wrapped in `ProtectedRoute` (redirects to `/login`)
- Admin pages additionally wrapped in `OwnerRoute` (checks permission map)
- Layout: `AppLayout` → `DashboardLayout` (top bar + collapsible sidebar)

### Validation
- Backend: Mongoose schema constraints + controller-level checks
- No external validation library (joi, zod)

## Business Domains

1. **Service Operations** — Job cards, vehicles, service types, tasks, labor tracking
2. **Inventory & Parts** — Items, categories, dealers, purchases
3. **Financials** — Invoices, sales (POS), purchases, loyalty/discount programs
4. **HR & Payroll** — Staff, attendance, leaves, advances, salary configs, payroll runs, payslips, worklogs
5. **Admin** — Roles, permissions, settings, work calendars, audit logs, reports

## Running Tests

```bash
cd backend && npm test
```

Tests cover utility/service logic only (payroll calculations, discounts, labor totals, attendance reports). No frontend tests. No integration or E2E tests.

## Build for Production

```bash
cd frontend && npm run build   # outputs to frontend/dist/
cd backend && npm start         # runs server without nodemon
```

No Docker or CI/CD configuration exists.
