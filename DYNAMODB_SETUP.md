# DynamoDB Table Setup Guide

This guide provides the schema and setup instructions for DynamoDB tables used in the Mutual Fund Stock Analyzer.

## Prerequisites
- AWS Account with DynamoDB access
- AWS CLI configured with credentials

## Table 1: Stocks

### Create via AWS Console

1. Go to DynamoDB → Create Table
2. Table name: `stocks`
3. Partition key: `ticker` (String)
4. Billing mode: Pay-per-request (for development) or Provisioned
5. If Provisioned:
   - Read: 10 units (enable auto-scaling)
   - Write: 5 units (enable auto-scaling)

### Create via AWS CLI

```bash
aws dynamodb create-table \
  --table-name stocks \
  --attribute-definitions \
    AttributeName=ticker,AttributeType=S \
  --key-schema \
    AttributeName=ticker,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

### Schema

| Attribute | Type | Description |
|-----------|------|-------------|
| ticker | String (PK) | Stock ticker symbol (e.g., "AAPL") |
| companyName | String | Full company name |
| price | Number | Current stock price in USD |
| freeFloatValue | Number | Free float market cap in billions USD |
| freeFloatPercentage | Number | Percentage of shares in free float |
| lastUpdated | String | ISO 8601 timestamp of last update |

### Sample Item

```json
{
  "ticker": "AAPL",
  "companyName": "Apple Inc.",
  "price": 195.45,
  "freeFloatValue": 2850,
  "freeFloatPercentage": 96.5,
  "lastUpdated": "2024-01-18T10:30:00Z"
}
```

---

## Table 2: Mutual Funds

### Create via AWS Console

1. Go to DynamoDB → Create Table
2. Table name: `mutual_funds`
3. Partition key: `fundId` (String)
4. Optional Global Secondary Index:
   - Index name: `fundName-index`
   - Partition key: `fundName`
5. Billing mode: Pay-per-request

### Create via AWS CLI

```bash
aws dynamodb create-table \
  --table-name mutual_funds \
  --attribute-definitions \
    AttributeName=fundId,AttributeType=S \
    AttributeName=fundName,AttributeType=S \
  --key-schema \
    AttributeName=fundId,KeyType=HASH \
  --global-secondary-indexes \
    IndexName=fundName-index,Keys={AttributeName=fundName,KeyType=HASH},Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=10,WriteCapacityUnits=5} \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

### Schema

| Attribute | Type | Description |
|-----------|------|-------------|
| fundId | String (PK) | Unique fund identifier |
| fundName | String | Fund display name |
| assetsUnderManagement | Number | Total AUM in millions USD |
| holdings | List | Array of stock holdings |
| lastUpdated | String | ISO 8601 timestamp |

### Holdings Structure (nested in holdings list)

| Field | Type | Description |
|-------|------|-------------|
| ticker | String | Stock ticker symbol |
| portfolioPercentage | Number | % of fund's AUM allocated to this stock |
| quantity | Number | Number of shares held |
| acquisitionPrice | Number | Average cost per share |

### Sample Item

```json
{
  "fundId": "VANGUARD_INDEX",
  "fundName": "Vanguard S&P 500 ETF",
  "assetsUnderManagement": 380000,
  "holdings": [
    {
      "ticker": "AAPL",
      "portfolioPercentage": 7.25,
      "quantity": 25000000,
      "acquisitionPrice": 150.00
    },
    {
      "ticker": "MSFT",
      "portfolioPercentage": 6.95,
      "quantity": 8000000,
      "acquisitionPrice": 300.00
    }
  ],
  "lastUpdated": "2024-01-18T10:30:00Z"
}
```

---

## Querying Examples

### Get a specific stock
```bash
aws dynamodb get-item \
  --table-name stocks \
  --key '{"ticker": {"S": "AAPL"}}' \
  --region us-east-1
```

### Get a specific fund
```bash
aws dynamodb get-item \
  --table-name mutual_funds \
  --key '{"fundId": {"S": "VANGUARD_INDEX"}}' \
  --region us-east-1
```

### Scan all funds (get all holdings)
```bash
aws dynamodb scan \
  --table-name mutual_funds \
  --region us-east-1
```

### Query funds by name (using GSI)
```bash
aws dynamodb query \
  --table-name mutual_funds \
  --index-name fundName-index \
  --key-condition-expression "fundName = :name" \
  --expression-attribute-values '{":name": {"S": "Vanguard S&P 500 ETF"}}' \
  --region us-east-1
```

---

## Data Population Script

To load initial data, use Node.js with AWS SDK:

```javascript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, put } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

async function populateData() {
  // Populate stocks
  const stocks = [
    {
      ticker: "AAPL",
      companyName: "Apple Inc.",
      price: 195.45,
      freeFloatValue: 2850,
      freeFloatPercentage: 96.5,
      lastUpdated: new Date().toISOString()
    }
    // ... more stocks
  ];

  for (const stock of stocks) {
    await docClient.send(new put({
      TableName: "stocks",
      Item: stock
    }));
  }

  console.log("Data population complete!");
}

populateData().catch(console.error);
```

---

## Best Practices

1. **Use On-Demand Billing** for development/testing
2. **Enable Point-in-Time Recovery** for production
3. **Set up CloudWatch alarms** for read/write throttling
4. **Use batch operations** for bulk inserts (BatchWriteItem)
5. **Index frequently queried attributes** (like fundName)
6. **Implement TTL** if you need automatic data expiration
7. **Use DynamoDB Streams** for real-time updates

---

## Monitoring

Enable CloudWatch metrics:
1. Go to DynamoDB Table → Metrics
2. Monitor: ConsumedReadCapacityUnits, ConsumedWriteCapacityUnits
3. Set alarms if usage exceeds thresholds

---

## Cost Estimation

**On-Demand Pricing (us-east-1):**
- Reads: $1.25 per million read requests
- Writes: $6.25 per million write requests
- Storage: $0.25 per GB-month

**Example:** 1M API calls/month with avg 2KB item = ~$10/month
