import express from 'express';
import cors from 'cors';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ==========================================
// 1. HEALTH CHECK ROUTE
// ==========================================
app.get('/api/health', (req, res) => {
    res.json({ status: "healthy", timestamp: new Date() });
});

// ==========================================
// 2. NEW: 2-3 ODDS BANKER ENGINE & API ROUTE
// ==========================================
const allFixtures = [
    { home: "Arsenal", away: "Burnley", market: "Home Win", odds: 1.35 },
    { home: "Real Madrid", away: "Elche", market: "Home Win", odds: 1.40 },
    { home: "Bayern Munich", away: "Bochum", market: "Over 2.5 Goals", odds: 1.55 },
    { home: "PSG", away: "Angers", market: "Home Win & Over 1.5", odds: 1.45 },
    { home: "Man City", away: "Luton", market: "Over 2.5 Goals", odds: 1.50 }
];

function buildTargetSlip(targetMin = 2.00, targetMax = 3.00) {
    let slipLegs = [];
    let totalOdds = 1.0;
    
    for (let match of allFixtures) {
        if (totalOdds * match.odds <= targetMax + 0.2) {
            slipLegs.push(match);
            totalOdds *= match.odds;
        }
        if (totalOdds >= targetMin && totalOdds <= targetMax) {
            break; 
        }
    }
    
    return {
        success: true,
        oddsRange: "2-3 Odds Banker",
        legs: slipLegs,
        totalOdds: Number(totalOdds.toFixed(2))
    };
}

// Registering the new endpoint
app.get('/api/ai-chat/get-safe-odds', (req, res) => {
    const slip = buildTargetSlip(2.00, 3.00);
    res.json(slip);
});


// ==========================================
// 3. YOUR EXISTING MATCH & PREDICTION ROUTES 
// (Paste your existing route handlers for matches/predictions here if they weren't imported from elsewhere)
// ==========================================
app.get('/api/matches', (req, res) => {
    const { date } = req.query;
    res.json({ message: "Matches endpoint active", date, fixtures: allFixtures });
});

app.get('/api/matches/range', (req, res) => {
    const { from, to } = req.query;
    res.json({ message: "Matches range endpoint active", from, to });
});

app.get('/api/predictions', (req, res) => {
    const { date } = req.query;
    res.json({ message: "Predictions endpoint active", date });
});

app.get('/api/history', (req, res) => {
    res.json({ message: "History endpoint active" });
});

app.get('/api/track-record', (req, res) => {
    res.json({ message: "Track record endpoint active" });
});

app.post('/api/refresh', (req, res) => {
    res.json({ success: true, message: "Data refresh triggered" });
});

app.get('/api/refresh-status', (req, res) => {
    res.json({ status: "idle" });
});


// ==========================================
// 4. FALLBACK CATCH-ALL FOR UNKNOWN ROUTES
// ==========================================
app.use((req, res) => {
    res.status(404).json({
        error: "API route not found.",
        routes: [
            "GET /api/health", 
            "GET /api/ai-chat/get-safe-odds",
            "GET /api/matches?date=YYYY-MM-DD", 
            "GET /api/matches/range?from=YYYY-MM-DD&to=YYYY-MM-DD", 
            "GET /api/predictions?date=YYYY-MM-DD", 
            "GET /api/history", 
            "GET /api/track-record", 
            "POST /api/refresh", 
            "GET /api/refresh-status"
        ]
    });
});


// ==========================================
// 5. SERVER LISTENER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
