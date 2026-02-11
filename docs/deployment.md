## 🔧 Step 1 — Update Server

```bash
sudo dnf update -y
```

---

## 📦 Step 2 — Install Git

```bash
sudo dnf install git -y

# Verify
git --version
```

---

## 🟢 Step 3 — Install Node.js (LTS)

```bash
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
sudo dnf install nodejs -y
```

Verify:

```bash
node -v
npm -v
```

---

## ⚙️ Step 4 — Install PM2 Globally

```bash
sudo npm install -g pm2

# Verify
pm2 -v
```

---

## 📥 Step 5 — Clone Your Repository

```bash
git clone https://github.com/DurgaPydahSoft/STATIONARY-MANAGEMENT.git
```

Go inside project:

```bash
cd STATIONARY-MANAGEMENT
```

---

## 📂 Step 6 — Install Dependencies

```bash
npm install
```

(If package-lock exists it will auto install exact versions)

---

## 🔐 Step 7 — Create Environment File

```bash
nano .env
```

Add your variables (example):

```env
PORT=5000
MONGO_URI=your_mongodb_connection
JWT_SECRET=your_secret
```

Save:

```
CTRL + O → Enter → CTRL + X
```

---

## ▶️ Step 8 — Start App with PM2

(Your PM2 name =  **backend** )

```bash
pm2 start server.js --name backend
```

If your entry file is different (app.js / index.js), use that instead.

Check running:

```bash
pm2 list
```

Logs:

```bash
pm2 logs backend
```

---

## 🔁 Step 9 — Enable Auto Start on Reboot

```bash
pm2 startup
```

Run the command it gives (copy-paste).

Then:

```bash
pm2 save
```

---

## 🌐 Step 10 — Open Ports in Lightsail

Go to:

**Lightsail → Instance → Networking → Firewall**

Add:

| Type   | Port                    |
| ------ | ----------------------- |
| HTTP   | 80                      |
| HTTPS  | 443                     |
| Custom | 5000 (or your app port) |

---

## 🧭 Step 11 — Install NGINX

```bash
sudo dnf install nginx -y

sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## ⚙️ Step 12 — Configure Reverse Proxy

```bash
sudo nano /etc/nginx/conf.d/backend.conf
```

Paste:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Test:

```bash
sudo nginx -t
```

Restart:

```bash
sudo systemctl restart nginx
```

---

## 🔒 Step 13 — Install Certbot (SSL)

```bash
sudo dnf install certbot python3-certbot-nginx -y
```

Generate certificate:

```bash
sudo certbot --nginx -d yourdomain.com
```

Follow prompts:

* Enter email
* Accept terms
* Choose redirect to HTTPS

---

## 🔁 Step 14 — Test Auto Renewal

```bash
sudo certbot renew --dry-run
```

---

# ✅ Final Check

```bash
pm2 list
sudo systemctl status nginx
```

Visit:

```
http://yourdomain.com
https://yourdomain.com
```

---

# 📌 Summary (Your Config)

* Repo → STATIONARY-MANAGEMENT
* PM2 Name → backend
* App Port → 5000 (change if needed)
* Reverse Proxy → NGINX
* SSL → Certbot

--- next steps to do ----

Update Server Name
sudo nano /etc/nginx/conf.d/backend.conf

Change:

server_name 3.6.13.51;

➡️ To:

server_name api.yourdomain.com;

Restart:

sudo systemctl restart nginx
🔒 Then Enable SSL
sudo certbot --nginx -d api.yourdomain.com
