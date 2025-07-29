# Backend IDOL - User Authentication API

A comprehensive user authentication backend API built with Cloudflare Workers, featuring user registration, login, profile management, and admin capabilities. The system uses PostgreSQL via Cloudflare Hyperdrive for data persistence.

## 🚀 Features

- **User Authentication System** - Registration, login, profile management with 2FA support
- **Admin Management** - Separate admin authentication and user management capabilities
- **Database Integration** - PostgreSQL via Cloudflare Hyperdrive
- **CORS Support** - Configured for all frontend requests
- **API Documentation** - Complete Swagger/OpenAPI documentation

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install/)
- [Neon PostgreSQL Database](https://neon.tech/) account
- [Cloudflare Account](https://dash.cloudflare.com/) with Workers enabled

## 🛠️ First-Time Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Neon PostgreSQL Database

1. **Create a Neon account** at [neon.tech](https://neon.tech)
2. **Create a new project** in your Neon dashboard
3. **Get your connection string** from the project settings
4. **Run the database schema** using the connection string:

```bash
# Using psql (if you have it installed)
psql "your-neon-connection-string" -f schema.sql

# Or using Neon's SQL editor in the dashboard
# Copy and paste the contents of schema.sql
```

### 3. Configure Cloudflare Hyperdrive

1. **Create a Hyperdrive database binding**:
   ```bash
   wrangler hyperdrive create user-auth-db
   ```

2. **Add your Neon connection string**:
   ```bash
   wrangler hyperdrive update user-auth-db --connection-string "your-neon-connection-string"
   ```

3. **Update wrangler.jsonc** to include the Hyperdrive binding:
   ```json
   {
     "name": "user-auth-backend-worker",
     "main": "index.js",
     "compatibility_date": "2024-01-01",
     "hyperdrive": [
       {
         "binding": "HYPERDRIVE",
         "id": "your-hyperdrive-id"
       }
     ]
   }
   ```

### 4. Environment Configuration

Create a `.dev.vars` file for local development:
```bash
# .dev.vars
DB_URL=your-neon-connection-string
```

### 5. Start Local Development

```bash
npm run dev
```

Your API will be available at `http://localhost:8787`

## 📚 API Endpoints

### Authentication APIs

#### User Authentication
- **`POST /api/auth/register`** - Register a new user
- **`POST /api/auth/login`** - User login (with optional 2FA)
- **`GET /api/auth/me`** - Get current user profile
- **`PUT /api/auth/profile`** - Update user profile
- **`POST /api/auth/change-password`** - Change user password
- **`POST /api/auth/logout`** - User logout

#### Admin Authentication
- **`POST /api/auth/admin/register`** - Register a new admin
- **`POST /api/auth/admin/login`** - Admin login (with optional 2FA)

### Admin Management APIs
- **`GET /api/admin/users`** - Get all users (admin only)
- **`GET /api/admin/users/:id`** - Get specific user (admin only)
- **`PUT /api/admin/users/:id/status`** - Update user status (admin only)
- **`DELETE /api/admin/users/:id`** - Delete user (admin only)

### Documentation APIs
- **`GET /api/docs`** - Swagger UI documentation
- **`GET /api/swagger.json`** - OpenAPI specification

## 🔐 Authentication

### User Registration Example
```bash
curl -X POST http://localhost:8787/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "password123",
    "two_fa_enabled": true
  }'
```

### Admin Registration Example
```bash
curl -X POST http://localhost:8787/api/auth/admin/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123",
    "two_fa_enabled": true
  }'
```

### Login Example
```bash
curl -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123",
    "twoFACode": "123456"
  }'
```

## 🔧 Database Schema

### Users Table
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    wallet VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    verified BOOLEAN NOT NULL DEFAULT false,
    credits INTEGER NOT NULL DEFAULT 0,
    joined_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    two_fa_enabled BOOLEAN NOT NULL DEFAULT false,
    two_fa_code VARCHAR(6),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Admins Table
```sql
CREATE TABLE admins (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    two_fa_code VARCHAR(6),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## 🚀 Deployment

### Deploy to Cloudflare Workers

```bash
# Deploy to production
npm run deploy

# Or using wrangler directly
wrangler deploy
```

### Environment Variables for Production

Set these in your Cloudflare Workers dashboard:
- `DB_URL` - Your Neon PostgreSQL connection string

## 📖 API Documentation

### Interactive Documentation
Visit `http://localhost:8787/api/docs` to access the interactive Swagger UI documentation.

### OpenAPI Specification
The complete API specification is available at `http://localhost:8787/api/swagger.json`

## 🔒 Security Features

- **Password Hashing** - SHA-256 hashing for all passwords
- **Token-based Authentication** - JWT-like tokens for session management
- **2FA Support** - Optional two-factor authentication for users and admins
- **CORS Protection** - Configured for secure cross-origin requests
- **Admin Authorization** - Separate admin authentication system

## 🛠️ Development

### Project Structure
```
backend-idol/
├── index.js              # Main worker entry point
├── user.js               # User authentication and admin APIs
├── schema.sql            # Database schema
├── swagger.json          # API documentation
├── wrangler.jsonc        # Wrangler configuration
├── package.json          # Project dependencies
└── README.md             # This file
```

### Available Scripts
```bash
npm run dev      # Start local development server
npm run deploy   # Deploy to Cloudflare Workers
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For issues and questions:
1. Check the API documentation at `/api/docs`
2. Review the database schema in `schema.sql`
3. Check the Cloudflare Workers logs in your dashboard 