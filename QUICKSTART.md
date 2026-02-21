# Quick Start Guide

## 🎬 Get Running in 5 Minutes

### Step 1: Install Dependencies
```bash
npm install --workspaces
```

### Step 2: Start Backend (Terminal 1)
```bash
npm run dev --workspace=backend
```

You should see:
```
✅ Server running on http://localhost:5000
📊 Try: http://localhost:5000/api/search?ticker=AAPL
```

### Step 3: Start Frontend (Terminal 2)
```bash
npm run dev --workspace=frontend
```

You should see:
```
  VITE v5.0.0  ready in xxx ms

  ➜  Local:   http://localhost:3000/
```

### Step 4: Open in Browser
Go to `http://localhost:3000` and search for:
- `AAPL` - Apple Inc.
- `GOOGL` - Alphabet Inc.
- `MSFT` - Microsoft Corporation
- `INFY` - Infosys Limited
- `TCS` - Tata Consultancy Services

---

## 🧪 Test the API Directly

### Test endpoint in browser or curl:
```bash
curl http://localhost:5000/api/search?ticker=AAPL
```

### Expected response:
```json
{
  "ticker": "AAPL",
  "companyName": "Apple Inc.",
  "price": 195.45,
  "freeFloatValue": 2850,
  "funds": [
    {
      "fundId": "VANGUARD_INDEX",
      "fundName": "Vanguard S&P 500 ETF",
      "portfolioPercentage": 7.25,
      "estimatedValue": "27.59",
      "estimatedFreeFloatPercentage": 1.08
    }
    // ... more funds
  ],
  "totalMFPercentageOfFreeFloat": 45.34
}
```

---

## 📊 Understanding the Display

### Stock Info Card
- **Current Price**: Market price per share
- **Free Float**: Total value of freely tradeable shares
- **MF Holdings**: Total % of free float held by mutual funds

### Mutual Fund Cards
Each fund shows:
1. **Fund Name & Code**: Fund identifier
2. **Portfolio Allocation**: % of this fund's total portfolio in this stock
3. **Free Float Ownership**: Estimated % of stock's free float held by this fund
4. **Holdings Value**: Estimated value in millions

---

## 🔧 Configuration

### Backend (.env)
Copy `.env.example` to `.env`:
```bash
cd backend
cp .env.example .env
```

Edit `.env` with your AWS credentials for production DynamoDB:
```env
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
```

### Frontend (.env)
Copy `.env.example` to `.env`:
```bash
cd frontend
cp .env.example .env
```

---

## 📱 Data Available

### US Stocks
| Ticker | Company |
|--------|---------|
| AAPL | Apple Inc. |
| GOOGL | Alphabet Inc. |
| MSFT | Microsoft Corporation |

### Indian Stocks
| Ticker | Company |
|--------|---------|
| INFY | Infosys Limited |
| TCS | Tata Consultancy Services |

---

## 🐛 Troubleshooting

### Port already in use
```bash
# Kill process on port 5000
npx kill-port 5000

# Kill process on port 3000
npx kill-port 3000
```

### CORS errors
- Ensure backend is running on port 5000
- Frontend proxy is configured in vite.config.js

### Stock not found
- Only demo stocks listed above are available
- Edit `backend/src/data.js` to add more stocks

---

## 🚀 Next Steps

1. **Add Real Data**: Update `backend/src/data.js` with real fund holdings
2. **Connect to DynamoDB**: Remove mock data, use AWS SDK (see [DYNAMODB_SETUP.md](DYNAMODB_SETUP.md))
3. **Deploy**: Follow deployment guide in [README.md](README.md)
4. **Add Features**: Historical analysis, fund comparison, alerts

---

## 📚 Project Structure

```
Sankyaan/
├── frontend/               # React + Vite
│   ├── src/
│   │   ├── App.jsx        # Main component
│   │   ├── App.css        # Styles
│   │   └── main.jsx       # Entry point
│   ├── index.html
│   └── vite.config.js
│
├── backend/               # Express API
│   ├── src/
│   │   ├── index.js       # Server entry
│   │   ├── services.js    # Business logic
│   │   └── data.js        # Mock data
│   └── package.json
│
├── README.md              # Full documentation
├── DYNAMODB_SETUP.md      # Database setup
└── package.json           # Workspace config
```

---

## 💡 Quick Tips

- **Modify fund data**: Edit `backend/src/data.js` (mockFunds)
- **Change port**: Set `PORT=8000` in backend/.env
- **Frontend API URL**: Change `VITE_API_URL` in frontend/.env
- **Add new stocks**: Add entries to `mockStocks` in data.js

---

Happy analyzing! 🎉
