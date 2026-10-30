import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({ status: "healthy", timestamp: new Date() });
});

// ==========================================
// DIVERSE MULTI-MARKET FIXTURE POOL (TODAY & TOMORROW)
// ==========================================
const getSiteFixtures = (targetDay = 'today') => {
    const todayObj = new Date();
    const tomorrowObj = new Date();
    tomorrowObj.setDate(todayObj.getDate() + 1);

    const todayStr = todayObj.toISOString().split('T')[0];
    const tomorrowStr = tomorrowObj.toISOString().split('T')[0];
    const activeDate = targetDay === 'tomorrow' ? tomorrowStr : todayStr;

    return [
        { id: "f1", date: activeDate, league: "Norway · Eliteserien", home: "Bodø/Glimt", away: "Viking FK", market: "Over 2.5 Goals", odds: 1.31, winChance: 85 },
        { id: "f2", date: activeDate, league: "Spain · La Liga", home: "Levante UD", away: "Atlético Madrid", market: "Over 1.5 Goals", odds: 1.15, winChance: 90 },
        { id: "f3", date: activeDate, league: "USA · MLS", home: "FC Cincinnati", away: "Philadelphia Union", market: "Over 2.5 Goals", odds: 1.33, winChance: 82 },
        { id: "f4", date: activeDate, league: "Brazil · Serie A", home: "Corinthians", away: "Mirassol", market: "Over 1.5 Goals", odds: 1.32, winChance: 88 },
        { id: "f5", date: activeDate, league: "Japan · J1 League", home: "Kyoto Sanga FC", away: "Shimizu S-Pulse", market: "Double Chance (1X)", odds: 1.28, winChance: 86 },
        { id: "f6", date: activeDate, league: "Turkey · Super Lig", home: "Erzurumspor FK", away: "Çorum FK", market: "Both Teams to Score", odds: 1.72, winChance: 78 },
        { id: "f7", date: activeDate, league: "Switzerland · Super League", home: "Grasshopper Club", away: "FC Vaduz", market: "Both Teams to Score", odds: 1.34, winChance: 81 },
        { id: "f8", date: activeDate, league: "Austria · Bundesliga", home: "LASK", away: "WSG Tirol", market: "Over 2.5 Goals", odds: 1.36, winChance: 80 },
        { id: "f9", date: activeDate, league: "Netherlands · Eredivisie", home: "Feyenoord", away: "Fortuna Sittard", market: "Home Win", odds: 1.16, winChance: 89 }
    ];
};

function buildDiverseSlip(targetMin, targetMax, dayType) {
    const fixtures = getSiteFixtures(dayType);
    let slipLegs = [];
    let totalOdds = 1.0;
    
    // Sort by highest percentage confidence
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

app.get('/api/ai-chat/get-2-odds', (req, res) => {
    const day = req.query.day || 'today';
    res.json(buildDiverseSlip(2.00, 2.50, day));
});

app.get('/api/ai-chat/get-3-odds', (req, res) => {
    const day = req.query.day || 'today';
    res.json(buildDiverseSlip(3.00, 3.80, day));
});

app.get('/api/matches', (req, res) => {
    res.json({ fixtures: getSiteFixtures('today') });
});

app.use((req, res) => {
    res.status(404).json({ error: "API route not found." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
