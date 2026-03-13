# Mutual Fund Stock Analyzer

A lean, cloud-friendly prototype that helps investors discover which mutual funds hold their favorite stocks, with detailed portfolio allocation and free float ownership metrics.

## 🎯 Features

- **Stock Search**: Search for any stock ticker (US stocks and Indian stocks supported)
- **Fund Holdings**: See which mutual funds hold the stock
- **Portfolio Allocation**: View what percentage of each fund's portfolio is allocated to the stock
- **Free Float Analysis**: Understand what estimated percentage of the stock's free float is held by mutual funds
- **Cloud-Ready**: Built for AWS DynamoDB with serverless-friendly architecture

## 🏗️ Architecture

### Frontend
- **React 18** with Vite for fast development
- Responsive UI with gradient design
- Real-time search with loading states
- Results displayed in interactive cards

### Backend
- **Express.js** API server
- RESTful endpoints for stock search and fund data
- Business logic for calculating fund allocations
- CORS-enabled for cross-origin requests

### Database
- **AWS DynamoDB** (configured, mock data included)
- Two main tables: `stocks` and `mutual_funds`
- Designed for serverless scalability

## 📋 Supported Stocks (Demo Data)

- **US Stocks**: AAPL, GOOGL, MSFT
- **Indian Stocks**: INFY, TCS

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- npm or yarn
- AWS credentials (for production DynamoDB usage)

### Installation

1. **Install dependencies**
```bash
npm install --workspaces
```

2. **Start the backend server**
```bash
npm run dev --workspace=backend
```

The server will start on `http://localhost:5000`

3. **In a new terminal, start the frontend**
```bash
npm run dev --workspace=frontend
```

The frontend will be available at `http://localhost:3000`

4. **Search for a stock**
- Enter a ticker symbol (e.g., AAPL, GOOGL, INFY)
- View mutual fund holdings and their portfolio allocations
- See estimated percentage of free float held by each fund

## 📊 API Endpoints

### Search Stock
```
GET /api/search?ticker=AAPL
```

**Response:**
```json
{
  "ticker": "AAPL",
  "companyName": "Apple Inc.",
  "price": 195.45,
  "freeFloatValue": 2850,
  "freeFloatPercentage": 96.5,
  "funds": [
    {
      "fundId": "VANGUARD_INDEX",
      "fundName": "Vanguard S&P 500 ETF",
      "portfolioPercentage": 7.25,
      "estimatedValue": "27.59",
      "estimatedFreeFloatPercentage": 1.08
    }
  ],
  "totalMFPercentageOfFreeFloat": 45.34
}
```

## 🔐 Environment Configuration

### Backend (.env)
```env
PORT=5000
AWS_REGION=us-east-1
DYNAMODB_STOCKS_TABLE=stocks
DYNAMODB_FUNDS_TABLE=mutual_funds
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:5000/api
```

## 🗄️ DynamoDB Schema

### Stocks Table
```
Table: stocks
Partition Key: ticker (String)
Attributes:
  - companyName (String)
  - price (Number)
  - freeFloatValue (Number) - in billions
  - freeFloatPercentage (Number)
  - lastUpdated (String - ISO timestamp)
```

### Mutual Funds Table
```
Table: mutual_funds
Partition Key: fundId (String)
Attributes:
  - fundName (String)
  - assetsUnderManagement (Number) - in millions
  - holdings (List of Maps)
    - ticker (String)
    - portfolioPercentage (Number)
    - quantity (Number)
  - lastUpdated (String - ISO timestamp)
```

## 📈 Key Calculations

### Portfolio Percentage
- Shows what % of the fund's total AUM is invested in this specific stock

### Free Float Percentage
- Calculated as: (Portfolio Value in Fund / Stock's Free Float Value) × 100
- Estimates what % of the stock's free float is held by this mutual fund

### Total MF Free Float Percentage
- Sum of all fund's estimated free float percentages
- Shows total estimated % of free float held by mutual funds in aggregate

## 🛠️ Development

### Project Structure
```
.
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── index.js         (Express server)
│   │   ├── services.js      (Business logic)
│   │   ├── data.js          (Mock data)
│   │   └── dynamodb.js      (DynamoDB utilities)
│   └── package.json
└── package.json (root)
```

### Available Scripts

**Frontend:**
- `npm run dev --workspace=frontend` - Start dev server
- `npm run build --workspace=frontend` - Build for production

**Backend:**
- `npm run dev --workspace=backend` - Start with auto-reload
- `npm start --workspace=backend` - Start production server

## 🚀 Deployment

### Frontend (AWS S3 + CloudFront)
```bash
npm run build --workspace=frontend
# Upload build/ folder to S3 and configure CloudFront
```

### Backend (AWS Lambda + API Gateway)
The Express server can be wrapped with serverless framework for AWS Lambda deployment:
```bash
# Install serverless framework
npm install -g serverless
# Configure and deploy
serverless deploy
```

### Database (AWS DynamoDB)
Tables are pre-defined and auto-scaling can be enabled:
- Read capacity: 10 units (auto-scale to 100)
- Write capacity: 5 units (auto-scale to 40)

## 📝 Notes

- Mock data is included for testing. Replace with real DynamoDB integration in production.
- Current implementation includes demo stock data for 5 major stocks.
- API calculates all percentages on-the-fly for real-time accuracy.
- CORS is enabled for cross-origin requests from frontend.

## 🤝 Future Enhancements

- [ ] Real-time stock price integration (Alpha Vantage, Yahoo Finance API)
- [ ] Historical trend analysis
- [ ] Fund comparison tool
- [ ] Portfolio analysis for investors
- [ ] Real DynamoDB integration with data sync
- [ ] Authentication and user portfolios
- [ ] Advanced filtering and sorting

## 📄 License

MIT License - Free to use and modify

---

Built with ❤️ for cloud-native applications
