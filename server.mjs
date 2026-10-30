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
// 2. LIVE DATE-AWARE FIXTURE POOL (TODAY & TOMORROW)
// ==========================================
const getSiteFixtures = (targetDay = 'today') => {
    const todayObj = new Date();
    const tomorrowObj = new Date();
    tomorrowObj.setDate(todayObj.getDate() + 1);

    const todayStr = todayObj.toISOString().split('T')[0];
    const tomorrowStr = tomorrowObj.toISOString().split('T')[0];
    
    const activeDate = targetDay === 'tomorrow' ? tomorrowStr : todayStr;

    return [
        { id: "f1", date: activeDate, league: "Spain · La Liga", home: "Villarreal", away: "Espanyol", market: "Home Win", odds: 1.41, winChance: 67 },
        { id: "f2", date: activeDate, league: "France · Ligue 1", home: "Le Havre", away: "Paris Saint-Germain", market: "Away Win", odds: 1.25, winChance: 76 },
        { id: "f3", date: activeDate, league: "Colombia · Primera A", home: "América de Cali", away: "Fortaleza FC", market: "Home Win", odds: 1.48, winChance: 62 },
        { id: "f4", date: activeDate, league: "Turkey · Super Lig", home: "Konyaspor", away: "Galatasaray", market: "Away Win", odds: 1.54, winChance: 61 },
        { id: "f5", date: activeDate, league: "Belgium · Pro League", home: "SV Zulte Waregem", away: "Club Brugge KV", market: "Away Win", odds: 1.45, winChance: 64 },
        { id: "f6", date: activeDate, league: "Bulgaria · Parva Liga", home: "FC CSKA 1948 Sofia", away: "FK Spartak Varna", market: "Home Win", odds: 1.39, winChance: 65 },
        { id: "f7", date: activeDate, league: "Romania · Superliga", home: "FC Rapid București", away: "FK Csíkszereda", market: "Home Win", odds: 1.26, winChance: 73 },
        { id: "f8", date: activeDate, league: "France · Ligue 2", home: "Nantes", away: "Clermont Foot", market: "Home Win", odds: 1.44, winChance: 63 }
    ];
};

function buildDateAwareSlip(targetMin, targetMax, dayType) {
    const fixtures = getSiteFixtures(dayType);
    let slipLegs = [];
    let totalOdds = 1.0;
    
    // Sort by highest win odds probability
    const sorted = [...fixtures].sort((a, b) => b.winChance - a.winChance);
    
    for (let match of sorted) {
        if (slipLegs.length >= 5) break;
        slipLegs.push(match);
        totalOdds *= match.odds;
        
        if (slipLegs.length >= 3 && totalOdds >= targetMin) {
            break;
        }
    }

    if (totalOdds < targetMin && sorted.length >= 3) {
        slipLegs = sorted.slice(0, 3);
        totalOdds = slipLegs.reduce((acc, m) => acc * m.odds, 1.0);
    }

    const dayLabel = dayType === 'tomorrow' ? 'Tomorrow’s' : 'Today’s';

    return {
        success: true,
        dateQuery: dayType,
        oddsRange: `${dayLabel} ${targetMin === 2.0 ? '2+ Odds Banker' : '3+ Odds Banker'}`,
        legs: slipLegs,
        totalOdds: Number(totalOdds.toFixed(2))
    };
}

// Endpoints supporting ?day=today or ?day=tomorrow
app.get('/api/ai-chat/get-2-odds', (req, res) => {
    const day = req.query.day || 'today';
    res.json(buildDateAwareSlip(2.00, 2.50, day));
});

app.get('/api/ai-chat/get-3-odds', (req, res) => {
    const day = req.query.day || 'today';
    res.json(buildDateAwareSlip(3.00, 3.80, day));
});


// ==========================================
// 3. EXISTING SITE ROUTES
// ==========================================
app.get('/api/matches', (req, res) => {
    const { date } = req.query;
    res.json({ message: "Matches endpoint active", date, fixtures: getSiteFixtures('today') });
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

app.use((req, res) => {
    res.status(404).json({ error: "API route not found." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
