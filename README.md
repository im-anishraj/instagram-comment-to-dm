<div align="center">

<h1>📩 instagram-comment-to-dm</h1>

<p>
  <strong>Open-source Instagram comment → auto DM automation.</strong><br/>
  Someone comments a keyword on your post. They instantly get a DM. That's it.
</p>

<p>
  <a href="https://visitor-badge.laobi.icu/badge?page_id=im-anishraj.instagram-comment-to-dm">
  <img src="https://visitor-badge.laobi.icu/badge?page_id=im-anishraj.instagram-comment-to-dm" />
</a>
    <img src="https://img.shields.io/github/stars/im-anishraj/instagram-comment-to-dm?style=flat-square&color=6366F1" alt="Stars"/>
  </a>
  <a href="https://github.com/im-anishraj/instagram-comment-to-dm/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"/>
  </a>
  <a href="https://github.com/im-anishraj/instagram-comment-to-dm/issues">
    <img src="https://img.shields.io/github/issues/im-anishraj/instagram-comment-to-dm?style=flat-square" alt="Issues"/>
  </a>
  <img src="https://img.shields.io/badge/Meta%20Graph%20API-v19%2B-blue?style=flat-square" alt="Meta Graph API"/>
  <img src="https://img.shields.io/badge/Next.js-14-black?style=flat-square" alt="Next.js 14"/>
</p>

<p>
  <a href="#-demo">Demo</a> ·
  <a href="#-features">Features</a> ·
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-how-it-works">How It Works</a> ·
  <a href="#-deployment">Deploy</a> ·
  <a href="#-contributing">Contributing</a>
</p>

</div>

---

## What Is This?

**instagram-comment-to-dm** is a self-hostable, open-source alternative to ManyChat's comment automation feature.

When someone comments a specific keyword (like "LINK", "PRICE", or "INFO") on your Instagram post, this tool automatically sends them a DM — instantly, 24/7, without you touching anything.

It uses only the **official Meta Graph API** (no scraping, no unofficial bots, no ToS violations).

```
User comments "LINK" on your post
        ↓
Webhook fires → keyword matched
        ↓
DM sent via Meta Messaging API
        ↓
User gets your message in their inbox
```

---

## ✨ Features

- 🔑 **Keyword triggers** — Set any word(s) to trigger a DM (case-insensitive)
- 💬 **Personalised DMs** — Use `{username}` merge tags in your message
- 🚦 **Rate limit safe** — Built-in queue caps at 190 DMs/hour (Meta's limit)
- 🔁 **Deduplication** — Never sends the same user the same DM twice
- 🔒 **Official API only** — Meta Graph API v19+, no account ban risk
- 📊 **Dashboard** — See which automations are firing and how many DMs sent
- 🔄 **Token auto-refresh** — Never lose access due to expired Instagram tokens
- 🐳 **Self-hostable** — Run it on your own server with Docker
- 🆓 **Free & open source** — MIT license, fork and modify freely
- 🏢 **Multi-tenant ready** — SaaS architecture supports multiple Instagram accounts

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Instagram **Business or Creator** account
- Facebook Page linked to your Instagram
- Meta Developer App (free to create at [developers.facebook.com](https://developers.facebook.com))
- PostgreSQL database
- Redis instance

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/instagram-comment-to-dm.git
cd instagram-comment-to-dm
npm install
```

### 2. Start Local Services

```bash
docker-compose up -d   # starts Postgres + Redis
```

### 3. Set Up Environment

```bash
cp .env.example .env
# Fill in your Meta App credentials (see Environment Variables section)
```

### 4. Run Database Migrations

```bash
npx prisma migrate dev
```

### 5. Start the App

```bash
npm run dev
```

App runs at `http://localhost:3000`.

---

## 🏗️ How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                         FLOW OVERVIEW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Instagram Post                                                 │
│       │                                                         │
│  User comments "LINK"                                           │
│       │                                                         │
│       ▼                                                         │
│  Meta Webhook ──► POST /api/webhook                             │
│                        │                                        │
│               Signature verified                                │
│                        │                                        │
│               Job added to BullMQ queue                         │
│                        │                                        │
│               ┌─────────────────┐                              │
│               │   DM Worker     │                              │
│               │                 │                              │
│               │ 1. Match keyword│                              │
│               │ 2. Check dedup  │                              │
│               │ 3. Check rate   │                              │
│               │    limit        │                              │
│               │ 4. Send DM via  │                              │
│               │    Graph API    │                              │
│               │ 5. Log result   │                              │
│               └─────────────────┘                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | PostgreSQL + Prisma ORM |
| Queue | BullMQ + Redis |
| Auth | NextAuth.js v5 |
| Instagram API | Meta Graph API v19+ |
| Deployment | Vercel + Railway |

---

## ⚙️ Environment Variables

```bash
# Meta / Instagram
INSTAGRAM_APP_ID=               # From Meta Developer Dashboard
INSTAGRAM_APP_SECRET=           # From Meta Developer Dashboard
FACEBOOK_APP_SECRET=            # Same as above
WEBHOOK_VERIFY_TOKEN=           # Any random string you choose

# Database
DATABASE_URL=                   # postgresql://user:pass@host:5432/instrareply

# Redis
REDIS_URL=                      # redis://localhost:6379

# Auth
NEXTAUTH_SECRET=                # Random 32+ char string (openssl rand -base64 32)
NEXTAUTH_URL=                   # https://yourdomain.com

# Security
ENCRYPTION_KEY=                 # 32-byte hex for AES-256 token encryption
```

See [`.env.example`](.env.example) for the full reference.

---

## 📦 Deployment

### One-Click (Vercel + Railway)

Full step-by-step guide in [`DEPLOYMENT.md`](DEPLOYMENT.md).

**TL;DR:**
1. Deploy Postgres + Redis on [Railway](https://railway.app) (free tier works)
2. Deploy app on [Vercel](https://vercel.com) (free tier works)
3. Add your env vars
4. Register your webhook URL in Meta Developer Dashboard
5. Done

### Self-Host with Docker

```bash
docker-compose -f docker-compose.prod.yml up -d
```

---

## 🔐 Meta App Review

To use this with accounts other than your own (public SaaS), you need Meta App Review approval for `instagram_business_manage_messages`.

A complete App Review submission guide with use case description, screen recording script, and compliance statements is included in [`META_APP_REVIEW.md`](META_APP_REVIEW.md).

For **your own account only**: development mode is sufficient — no review needed.

---

## ⚠️ Important Limitations

| Limitation | Detail |
|---|---|
| Account type | Must be Business or Creator account |
| Rate limit | 200 DMs per hour, hard cap by Meta |
| 24-hour window | Can only DM within 24h of a user's interaction |
| App Review | Required before serving other accounts (7–30 days) |
| Official API only | Any Selenium/unofficial method risks permanent ban |

---

## 🤝 Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
# Fork the repo, then:
git checkout -b feature/your-feature
git commit -m "feat: add your feature"
git push origin feature/your-feature
# Open a Pull Request
```

**Good first issues:** look for the `good first issue` label.

---

## 📄 License

MIT — see [LICENSE](LICENSE). Use it, fork it, sell it. Just keep the license file.

---

## 🙋 FAQ

**Is this against Instagram's Terms of Service?**
No. This uses only the official Meta Graph API with approved permissions. It's the same API ManyChat uses.

**Do I need to pay Meta?**
No. The Graph API is free. You pay only for your server hosting (Railway/Vercel free tiers work fine to start).

**What happens when Meta changes their API?**
The codebase targets Graph API v19+. Meta maintains backward compatibility for 2 years. Watch this repo for updates.

**Can I use this for client accounts?**
Yes, after passing Meta App Review. Before that, only for your own linked account.

**Isn't ManyChat easier?**
Yes. ManyChat is the right choice if you don't want to self-host. This project is for developers who want control, no monthly fees, or want to build their own SaaS on top.

---

<div align="center">
  <p>If this saved you money on ManyChat, consider giving it a ⭐</p>
</div>
