# Nexa OS — Multi-Tenant CRM Backend

Backend Node.js + Express untuk Nexa OS.

> ⚠️ Ini adalah development build yang berjalan lokal.
> Belum untuk production sampai ada hosting Node.js.

## Setup

1. Copy `.env.example` ke `.env` dan isi dengan kredensial kamu:
```bash
cp .env.example .env
```

2. Install dependensi:
```bash
npm install
```

3. Jalankan development server:
```bash
npm run dev
```

Server akan berjalan di `http://localhost:3000`

## Struktur Folder

```
nexa-os/
├── src/
│   ├── app.js              # Express app setup
│   ├── server.js           # Entry point
│   ├── config/
│   │   └── database.js     # MySQL connection pool
│   └── modules/
│       └── admin/          # Nexa Control Centre API
│           ├── admin.routes.js
│           ├── admin.controller.js
│           └── admin.service.js
├── .env.example
└── package.json
```

## API Endpoints

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| GET | `/` | Health check |
| GET | `/api/admin/overview` | Dashboard overview |
| GET | `/api/admin/tenants` | Daftar tenant |
| GET | `/api/admin/health` | System health |
