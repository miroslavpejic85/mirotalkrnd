# MiroTalk RND

_Meet someone random. Talk instantly._

Random 1-on-1 video chat built with Node.js, Socket.IO, and WebRTC.

## ✨ What it does

- Random peer matching
- Video/audio chat over WebRTC
- Next match + end session
- Mic/camera toggle + hide self preview
- Device selection
- Virtual background support (blur and image)
- Queue, capacity, and anti-spam limits
- Mobile-friendly UI

## 🚀 Quick start

```bash
cd mirotalkrnd
cp .env.template .env
npm install
npm start
```

Then open: `http://localhost:4010`

> In production, use HTTPS for camera/microphone permissions.

## 🐳 Docker

```bash
cp .env.template .env
cp docker-compose.template.yml docker-compose.yml
docker compose pull
docker compose up -d
```

Then open: `http://localhost:<PORT>` (default `4010`).

## 🛠️ Installer script (Ubuntu)

```bash
sudo ./install.sh
```

The installer supports:

- Docker setup (with official image `mirotalk/rnd:latest` or local build)
- Local Node.js setup

## ⚙️ Configuration (`.env`)

Edit `.env` for your needs use [.env.template](.env.template) as reference, then restart the server.

## Scripts

- `npm start` — start server
- `npm run dev` — run with watch mode

## License

This project is licensed under the GNU Affero General Public License v3.0.
See [LICENSE](./LICENSE).

## More

See [README-METRICS.md](./docs/README-METRICS.md).

---

🌐 Explore the full MiroTalk suite (SFU, P2P, BRO, C2C, WEB, CME, ADM) → [MiroTalk Overview](https://docs.mirotalk.com/sites/overview/)

Built with ❤️ by [Miroslav](https://www.linkedin.com/in/miroslav-pejic-976a07101/) and the open-source community.
