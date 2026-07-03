# KAIROS Frontend

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4

Point-of-Action Web App for the KAIROS Industrial Operational Intelligence Platform.

## Local Development

The frontend runs inside Docker — no local Node required.

```bash
# From the repo root
make dev                    # starts all services including kairos-frontend
```

UI available at **http://localhost:3000**

To work on the frontend only:
```bash
docker compose up -d kairos-frontend
```

Hot-reload is active — edits to `src/` and `public/` apply instantly without rebuilding the image.

## Documentation

- **[docs/FRONTEND.md](../docs/FRONTEND.md)** — full reference: routes, components, API wiring, auth flow, fixture data, design tokens
- **[DESIGN.md](./DESIGN.md)** — design system: Paper theme, colour tokens, typography, component conventions, Refero borrow map

## Test Users

Seed with `docker exec kairos-backend-api python scripts/seed_users.py`

| Email | Password | Role |
|-------|----------|------|
| `admin@kairos.local` | `KairosAdmin123!` | admin |
| `engineer@kairos.local` | `KairosEngineer123!` | engineer |
| `field_worker@kairos.local` | `KairosField123!` | field_worker |
