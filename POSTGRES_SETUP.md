# PostgreSQL Setup Guide

This project has been updated to use PostgreSQL instead of DynamoDB. Follow these steps to set up the database.

## Prerequisites
- PostgreSQL installed and running
- Node.js 16+ installed

## Database Setup

### 1. Create Database
```sql
CREATE DATABASE Sankyaan;
```

### 2. Create the `hdfc_portfolio` Table

Connect to the `Sankyaan` database and run:

```sql
CREATE TABLE hdfc_portfolio (
  id SERIAL PRIMARY KEY,
  ticker VARCHAR(10) NOT NULL,
  company_name VARCHAR(255),
  current_price DECIMAL(15, 2),
  free_float_value DECIMAL(15, 2),
  free_float_percentage DECIMAL(5, 2),
  fund_id VARCHAR(50),
  fund_name VARCHAR(255),
  portfolio_percentage DECIMAL(5, 2),
  aum DECIMAL(15, 2),
  holding_value DECIMAL(15, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ticker, fund_id)
);

CREATE INDEX idx_ticker ON hdfc_portfolio(ticker);
CREATE INDEX idx_fund_id ON hdfc_portfolio(fund_id);
```

### 3. Insert Sample Data

```sql
-- Example data for INFY (Infosys Limited)
INSERT INTO hdfc_portfolio 
(ticker, company_name, current_price, free_float_value, free_float_percentage, 
 fund_id, fund_name, portfolio_percentage, aum, holding_value)
VALUES
('INFY', 'Infosys Limited', 1820.50, 640, 98.1, 
 'MOTILAL_IT', 'Motilal Oswal IT Fund', 8.50, 15000, 1275),
('INFY', 'Infosys Limited', 1820.50, 640, 98.1,
 'QUANT_IT', 'Quant IT Fund', 12.30, 8500, 1045.5),
('INFY', 'Infosys Limited', 1820.50, 640, 98.1,
 'NIPPON_INDIA_IT', 'Nippon India IT Fund', 10.65, 12000, 1278);

-- Example data for TCS (Tata Consultancy Services)
INSERT INTO hdfc_portfolio
(ticker, company_name, current_price, free_float_value, free_float_percentage,
 fund_id, fund_name, portfolio_percentage, aum, holding_value)
VALUES
('TCS', 'Tata Consultancy Services', 3850.25, 920, 74.5,
 'MOTILAL_IT', 'Motilal Oswal IT Fund', 16.80, 15000, 2520),
('TCS', 'Tata Consultancy Services', 3850.25, 920, 74.5,
 'QUANT_IT', 'Quant IT Fund', 18.90, 8500, 1605.5),
('TCS', 'Tata Consultancy Services', 3850.25, 920, 74.5,
 'SBI_BLUECHIP', 'SBI Bluechip Fund', 9.45, 28000, 2646);
```

## Backend Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment Variables

Update `backend/.env` with your PostgreSQL credentials:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=Sankyaan
DB_USER=postgres
DB_PASSWORD=Sankyaan
PORT=5000
```

### 3. Start the Backend Server
```bash
npm run dev
```

The server will run on `http://localhost:5000`

## API Endpoints

### Search for a Stock
```bash
GET /api/search?ticker=INFY
```

Response:
```json
{
  "ticker": "INFY",
  "companyName": "Infosys Limited",
  "price": 1820.50,
  "freeFloatValue": 640,
  "freeFloatPercentage": 98.1,
  "funds": [
    {
      "fundId": "MOTILAL_IT",
      "fundName": "Motilal Oswal IT Fund",
      "portfolioPercentage": 8.50,
      "assetsUnderManagement": 15000,
      "estimatedValue": "0.13",
      "estimatedFreeFloatPercentage": 0.198
    }
  ],
  "totalMFPercentageOfFreeFloat": 0.456
}
```

## Troubleshooting

### Connection Error
- Ensure PostgreSQL is running: `pg_isready -h localhost -p 5432`
- Check credentials in `.env`
- Verify database exists: `psql -U postgres -l | grep Sankyaan`

### Table Not Found
- Verify the table is created: `psql -U postgres -d Sankyaan -c "\dt"`
- Re-run the CREATE TABLE and INSERT statements

### Port Already in Use
- Change `PORT` in `.env` file to an available port
