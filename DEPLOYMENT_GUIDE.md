# Sankyaan Deployment Guide

## Quick Start - Beta Launch with Vercel + Railway

This guide will help you deploy Sankyaan to production using:
- **Frontend**: Vercel (Free tier)
- **Backend + Database**: Railway (Free tier - $5/month credit)
- **Custom Domain**: sankyaan.com

---

## Prerequisites

1. **GitHub Account** - To host your code repository
2. **Vercel Account** - Sign up at https://vercel.com (use GitHub login)
3. **Railway Account** - Sign up at https://railway.app (use GitHub login)
4. **Domain** - sankyaan.com (you should own this domain)
5. **FMP API Key** - Get from https://financialmodelingprep.com

---

## Step 1: Push Code to GitHub

```bash
# Create a new repository on GitHub named 'sankyaan'
# Then run:
cd /c/Users/ashri/OneDrive/Sankyaan
git remote add origin https://github.com/YOUR_USERNAME/sankyaan.git
git branch -M main
git push -u origin main
```

---

## Step 2: Deploy Backend to Railway

1. **Go to Railway**: https://railway.app/new
2. **Create New Project** → **Deploy from GitHub repo**
3. **Select** your `sankyaan` repository
4. **Add PostgreSQL Database**:
   - Click "New" → "Database" → "Add PostgreSQL"
   - Railway will automatically provide database credentials

5. **Configure Backend Service**:
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`

6. **Set Environment Variables**:
   ```
   DB_HOST=${{Postgres.PGHOST}}
   DB_PORT=${{Postgres.PGPORT}}
   DB_NAME=${{Postgres.PGDATABASE}}
   DB_USER=${{Postgres.PGUSER}}
   DB_PASSWORD=${{Postgres.PGPASSWORD}}
   PORT=5000
   FMP_API_KEY=your_fmp_api_key_here
   ```

7. **Generate Domain**: Click "Generate Domain" to get a public URL
   - You'll get something like: `https://sankyaan-backend-production.up.railway.app`
   - **Save this URL** - you'll need it for frontend deployment

8. **Import Database** (see Step 5 below)

---

## Step 3: Deploy Frontend to Vercel

1. **Go to Vercel**: https://vercel.com/new
2. **Import Git Repository**: Select your `sankyaan` repo
3. **Configure Project**:
   - Framework Preset: **Vite**
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`

4. **Set Environment Variables**:
   ```
   VITE_API_URL=https://your-railway-backend-url.up.railway.app/api
   ```
   (Replace with your actual Railway backend URL from Step 2)

5. **Deploy**: Click "Deploy"
   - Vercel will build and deploy your frontend
   - You'll get a URL like: `https://sankyaan.vercel.app`

---

## Step 4: Configure Custom Domain (sankyaan.com)

### On Vercel (for Frontend):

1. **Go to Project Settings** → **Domains**
2. **Add Domain**: `sankyaan.com`
3. **Add Domain**: `www.sankyaan.com` (redirect to main)
4. **Configure DNS** at your domain registrar:

   Add these records:
   ```
   Type: A
   Name: @
   Value: 76.76.21.21

   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   ```

5. **Wait for DNS propagation** (5-30 minutes)
6. **Vercel auto-generates SSL certificate** (HTTPS)

### For Backend (Optional - use subdomain):

If you want `api.sankyaan.com` for backend:

1. In Railway, generate a custom domain
2. Add CNAME record:
   ```
   Type: CNAME
   Name: api
   Value: your-railway-app.up.railway.app
   ```

---

## Step 5: Database Migration

Export your local database and import to Railway:

### Export Local Database:

```bash
pg_dump -h localhost -U postgres -d Sankyaan -F c -f sankyaan_backup.dump
```

### Import to Railway:

1. **Get Railway Database Connection String**:
   - In Railway, click on PostgreSQL service
   - Copy "PostgreSQL Connection URL"

2. **Import Database**:
   ```bash
   pg_restore -h railway-host -U postgres -d railway-db -F c sankyaan_backup.dump
   ```

   Or use Railway's built-in restore:
   - Railway Dashboard → PostgreSQL → Data → Import

---

## Step 6: Test Production Deployment

1. **Visit**: https://sankyaan.com (after DNS propagation)
2. **Test Features**:
   - [ ] Search for a mutual fund
   - [ ] View portfolio analysis
   - [ ] View stock detail page
   - [ ] Check portfolio forensic scores
   - [ ] Verify FMP API integration (corporate events)

3. **Check Logs**:
   - **Backend**: Railway Dashboard → Deployments → Logs
   - **Frontend**: Vercel Dashboard → Deployments → Build Logs

---

## Post-Deployment Checklist

- [ ] SSL Certificate active (HTTPS working)
- [ ] Custom domain pointing correctly
- [ ] All API calls working
- [ ] Database connected and populated
- [ ] FMP API key working
- [ ] Error monitoring set up (optional: Sentry)
- [ ] Analytics set up (optional: Google Analytics)

---

## Costs

**Free Tier**:
- Vercel: Free (unlimited deployments, 100GB bandwidth/month)
- Railway: $5 free credit/month (~500 hours of usage)

**Estimated Monthly Cost**: $0-10/month for beta launch

---

## Troubleshooting

### Frontend can't connect to backend:
- Check VITE_API_URL in Vercel environment variables
- Ensure Railway backend is deployed and running
- Check CORS settings in backend

### Database connection errors:
- Verify Railway database credentials in environment variables
- Check if database was properly imported
- Review Railway logs for connection errors

### Custom domain not working:
- Wait 30 minutes for DNS propagation
- Verify DNS records are correct
- Check Vercel domain settings

---

## Support

For issues:
1. Check Railway logs
2. Check Vercel deployment logs
3. Review browser console for frontend errors
4. Contact support if needed

---

## Security Notes

- **Never commit .env files** to git
- Use environment variables for all sensitive data
- FMP API key should only be in Railway environment variables
- Database credentials managed by Railway

---

Good luck with your beta launch! 🚀
