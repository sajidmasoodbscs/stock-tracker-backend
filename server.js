const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const cron = require("node-cron");
const firebaseadmin = require("firebase-admin");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: process.env.USER_EMAIL,
        pass: process.env.USER_PASSWORD,
    },
});

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

firebaseadmin.initializeApp({
    credential: firebaseadmin.credential.cert(serviceAccount),
    databaseURL: "https://stock-tracker-4b6fe.firebaseio.com"
});
const db = firebaseadmin.firestore();


const app = express();

app.use(cors());
app.use(express.json());




app.get('/api/stock', async (req, res) => {
    const symbol = req.query.symbol || "AAPL";
    const API_KEY = process.env.WS_ODDS_API_KEY;

    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(toDate.getDate() - 7);

    try {
        const response = await axios.get(`https://www.wallstreetoddsapi.com/api/historicstockprices`, {
            params: {
                symbol: symbol,
                from: fromDate.toISOString().split('T')[0],
                to: toDate.toISOString().split('T')[0],
                fields: 'symbol,date,open,high,low,close,volume',
                apikey: API_KEY,
                format: 'json'
            }
        });

        console.log("API Response:", JSON.stringify(response.data, null, 2));

        if (!response.data?.response) {
            throw new Error('Invalid API response structure');
        }

        const chartData = response.data.response.map(item => ({
            date: item.date,
            price: item.close,
            open: item.open,
            high: item.high,
            low: item.low,
            volume: item.volume
        }));
        console.log("response data", chartData)

        res.json(chartData);
    } catch (error) {
        console.error("API Error:", error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to fetch stock data',
            details: error.response?.data || error.message
        });
    }
});


app.get('/api/intraday', async (req, res) => {
    const {
        symbol = 'AAPL',
        interval = '15min',
        startDate,
        endDate
    } = req.query;

    const API_KEY = process.env.WS_ODDS_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        const toDate = endDate ? new Date(endDate) : new Date();
        const fromDate = startDate ? new Date(startDate) : new Date();
        fromDate.setDate(toDate.getDate() - 1);

        const response = await axios.get('https://www.wallstreetoddsapi.com/api/intraday', {
            params: {
                symbol: symbol.toUpperCase(),
                interval,
                from: fromDate.toISOString().split('T')[0],
                to: toDate.toISOString().split('T')[0],
                apikey: API_KEY,
                format: 'json',
                fields: 'timestamp,open,high,low,close,volume'
            },
            timeout: 10000
        });
        console.log("response", response);
        if (!response.data?.response || !Array.isArray(response.data.response)) {
            throw new Error('Invalid API response structure');
        }

        const intradayData = response.data.response
            .filter(item => item.timestamp && item.close)
            .map(item => ({
                time: new Date(item.timestamp).toISOString(),
                timestamp: item.timestamp,
                open: parseFloat(item.open),
                high: parseFloat(item.high),
                low: parseFloat(item.low),
                price: parseFloat(item.close),
                volume: parseInt(item.volume)
            }))
            .sort((a, b) => a.timestamp - b.timestamp);

        res.json(intradayData);

    } catch (error) {
        console.error('Intraday API Error:', {
            message: error.message,
            response: error.response?.data,
            stack: error.stack
        });

        res.status(500).json({
            error: 'Failed to fetch intraday data',
            details: error.response?.data || error.message
        });
    }
});

const MAJOR_INDICES = [
    { symbol: 'AAPL', name: 'AAPL' },
    { symbol: 'TSLA', name: 'TSLA' },
    { symbol: 'AMZN', name: 'AMZN' },
    { symbol: 'NFLX', name: 'NFLX' },
    { symbol: 'AKAM', name: 'AKAM' },
    { symbol: 'ZYBT', name: 'ZYBT' },
    { symbol: 'STRL', name: 'STRL' },
    { symbol: 'BLOK', name: 'BLOK' },
];

app.get('/api/indiceswallstreet', async (req, res) => {
    const API_KEY = process.env.WS_ODDS_API_KEY;

    try {
        const response = await axios.get('https://www.wallstreetoddsapi.com/api/livestockprices', {
            params: {
                apikey: API_KEY,
                fields: 'symbol,price,percentChange,priceExtended,percentChangeExtended,open,high,low,volume',
                format: 'json',
                // symbols: 'allsymbols',
                symbols: MAJOR_INDICES.map(i => i.symbol).join(','),
            },
            timeout: 10000
        });

        // console.log(JSON.stringify(response.data, null, 2));

        const indicesData = MAJOR_INDICES.map(index => {
            const apiData = response.data.response.find(item => item.symbol === index.symbol) || {};
            return {
                name: index.name,
                symbol: index.symbol,
                price: apiData.price ? Number(apiData.price) : null,
                changePercent: apiData.percentchange ? Number(apiData.percentchange) : null,
                priceExtended: apiData.priceextended ? Number(apiData.priceextended) : null,
                percentChangeExtended: apiData.percentchangeextended ? Number(apiData.percentchangeextended) : null,
                open: apiData.open ? Number(apiData.open) : null,
                high: apiData.high ? Number(apiData.high) : null,
                low: apiData.low ? Number(apiData.low) : null,
                volume: apiData.volume ? Number(apiData.volume) : null,
            };
        });

        res.json({
            success: true,
            data: indicesData
        });

    } catch (error) {
        console.error('Indices API Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch indices data'
        });
    }
});

app.get('/api/historical', async (req, res) => {

    const symbol = req.query.symbol || "AAPL";
    const API_KEY = process.env.WS_ODDS_API_KEY;

    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(toDate.getDate() - 7);

    try {

        const response = await axios.get('https://www.wallstreetoddsapi.com/api/historicstockprices', {
            params: {
                symbol: symbol,
                from: fromDate.toISOString().split('T')[0],
                to: toDate.toISOString().split('T')[0],
                fields: 'date,open,high,low,close,volume',
                apikey: API_KEY,
                format: 'json',
            },
            timeout: 10000
        });

        const historicalData = response.data.response.map(item => ({
            date: item.date,
            open: Number(item.open),
            high: Number(item.high),
            low: Number(item.low),
            close: Number(item.close),
            volume: Number(item.volume)
        }));

        console.log("historicalData", historicalData)

        res.json({
            success: true,
            data: historicalData
        });

    } catch (error) {
        console.log("error is below", error)
        console.error('Historical API Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch historical data'
        });
    }
});


app.post("/api/alerts", async (req, res) => {
    try {
        const { userId, email, indexSymbol, threshold, condition } = req.body;

        console.log("alert set call recived", req.body)


        const alertRef = await db.collection("alerts").add({
            userId,
            email,
            indexSymbol,
            threshold: parseFloat(threshold),
            condition,
            isTriggered: false,
            createdAt: firebaseadmin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({ id: alertRef.id });
    } catch (error) {
        console.log("Error in alert api call", error)
        res.status(500).json({ error: error.message });
    }
});



const runCronJob = async () => {
    console.log("Cron job started");

    try {
        const API_KEY = process.env.WS_ODDS_API_KEY;
        const response = await axios.get('https://www.wallstreetoddsapi.com/api/livestockprices', {
            params: {
                apikey: API_KEY,
                fields: 'symbol,price',
                format: 'json',
                symbols: 'allsymbols',
            },
            timeout: 10000
        });

        const priceMap = new Map(
            response.data.response.map(item => [item.symbol, item.price])
        );

        const alertsSnapshot = await db.collection('alerts').get();

        console.log("alertsSnapshot",alertsSnapshot);

        const processingPromises = [];

        alertsSnapshot.forEach(doc => {
            const alert = doc.data();
            processingPromises.push(
                processAlert(alert, priceMap, doc.ref)
            );
        });

        await Promise.all(processingPromises);

        console.log(`Processed ${alertsSnapshot.size} alerts`);
    } catch (error) {
        console.error('Cron job failed:', error);
    }
};

console.log("Server started, running initial cron job");
runCronJob();

const job = cron.schedule('*/5 * * * *', async () => {
    await runCronJob();
}, {
    scheduled: true
});

// const job = cron.schedule('0 0 * * *', async () => {
//     await runCronJob();
// }, {
//     scheduled: true
// });


async function processAlert(alert, priceMap, ref) {
    try {
        const currentPrice = priceMap.get(alert.indexSymbol);

        if (typeof currentPrice !== 'number') {
            console.warn(`No price data for ${alert.indexSymbol}`);
            return;
        }

        const conditionMet = checkCondition(
            currentPrice,
            alert.threshold,
            alert.condition
        );

        if (conditionMet) {
            await sendAlertEmail(alert, currentPrice);
        }
    } catch (error) {
        console.error(`Failed to process alert ${ref.id}:`, error);
    }
}

function checkCondition(currentPrice, threshold, condition) {
    const PRICE_BUFFER = 0.0001;
    return condition === 'above'
        ? currentPrice > threshold + PRICE_BUFFER
        : currentPrice < threshold - PRICE_BUFFER;
}

async function sendAlertEmail(alert, currentPrice) {
    const mailOptions = {
        to: alert.email,
        subject: `Alert: ${alert.indexSymbol} ${alert.condition} ${alert.threshold}`,
        html: `
      <h2>Price Alert Triggered!</h2>
      <p>${alert.indexSymbol}: $${currentPrice.toFixed(2)}</p>
      <p>Your threshold: $${alert.threshold} (${alert.condition})</p>
    `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${alert.email}`);
}

async function updateLastTriggered(ref) {
    await ref.update({
        lastTriggered: admin.firestore.FieldValue.serverTimestamp()
    });
}


const port = process.env.PORT || 4000;

app.listen(port, '0.0.0.0', () => {
    console.log(`> Ready on port ${port}`);
});
