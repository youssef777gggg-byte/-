# Pizza House

A database-driven full-stack pizza restaurant application built with Node.js, the built-in SQLite driver, and a responsive vanilla JavaScript UI.

## Run

```bash
cp .env.example .env # optional: export ADMIN_REGISTRATION_CODE instead
export ADMIN_REGISTRATION_CODE='your-secret-bootstrap-code'
npm start
```

Open `http://localhost:3000`. The database is created at `data/pizza-house.db`. On a fresh database, visit `/admin/bootstrap` to create the one and only administrator. The registration code is accepted only by the server and is hashed in the database.

## Security notes

* Passwords use Node's `scrypt` with a unique random salt and timing-safe verification.
* Session tokens are random, stored only as SHA-256 hashes in SQLite, and delivered as `HttpOnly`, `SameSite=Lax` cookies.
* All prices, product availability, coupon eligibility, and order totals are calculated on the server.
* Admin endpoints verify the authenticated role in the backend.
