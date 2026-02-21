import fetch from 'node-fetch';

const url = 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv';

async function testCSV() {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/csv',
    },
  });

  const text = await response.text();
  const lines = text.split('\n').slice(0, 10);

  console.log('First 10 lines of CSV:');
  lines.forEach((line, i) => {
    console.log(`${i}: ${line.substring(0, 150)}`);
  });
}

testCSV().catch(console.error);
