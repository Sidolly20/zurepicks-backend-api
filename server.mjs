import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({ status: "healthy", timestamp: new Date() });
});

// ==========================================
// DISTINCT TODAY & TOMORROW FIXTURE POOLS
// ==========================================
const getSiteFixtures = (targetDay = 'today') => {
    const todayObj = new Date();
    const tomorrowObj = new Date();
    tomorrowObj.setDate(todayObj.getDate() + 1);

    const todayStr = todayObj.toISOString().split('T')[0];
    const tomorrowStr = tomorrowObj.toISOString().split('T')[0];

    if (targetDay === 'tomorrow') {
        return [
            { id: "tm1", date: tomorrowStr, league: "Spain · La Liga", home: "Real Madrid", away: "Real Valladolid", market: "Home Win", odds: 1.37, winChance: 89 },
            { id: "tm2", date: tomorrowStr, league: "Italy · Serie A", home: "Inter Milan", away: "Monza", market: "Home Win", odds: 1.28, winChance: 91 },
            { id: "tm3", date: tomorrowStr, league: "Germany · Bundesliga", home: "Bayern Munich", away: "VfL Bochum", market: "Over 2.5 Goals", odds: 1.24, winChance: 93 },
            { id: "tm4", date: tomorrowStr, league: "England · Premier League", home: "Arsenal", away: "Everton", market: "Home Win", odds: 1.32, winChance: 88 },
            { id: "tm5", date: tomorrowStr, league: "France · Ligue 1", home: "AS Monaco", away: "Stade Brestois", market: "Both Teams to Score", odds: 1.58, winChance: 82 },
            { id: "tm6", date: tomorrowStr, league: "Portugal · Primeira Liga", home: "FC Porto", away: "Boavista", market: "Home Win", odds: 1.29, winChance: 90 }
        ];
    } else {
        return [
            { id: "td1", date: todayStr, league: "Norway · Eliteserien", home: "Bodø/Glimt", away: "Viking FK", market: "Over 2.5 Goals", odds: 1.31, winChance: 85 },
            { id: "td2", date: todayStr, league: "Spain · La Liga", home: "Levante UD", away: "Atlético Madrid", market: "Over 1.5 Goals", odds: 1.15, winChance: 90 },
            { id: "td3", date: todayStr, league: "USA · MLS", home: "FC Cincinnati", away: "Philadelphia Union", market: "Over 2.5 Goals", odds: 1.33, winChance: 82 },
            { id: "td4", date: todayStr, league: "Brazil · Serie A", home: "Corinthians", away: "Mirassol", market: "Over 1.5 Goals", odds: 1.32, winChance: 88 },
            { id: "td5", date: todayStr, league: "Japan · J1 League", home: "Kyoto Sanga FC", away: "Shimizu S-Pulse", market: "Double Chance (1X)", odds: 1.28, winChance: 86 },
            { id: "td6", date: todayStr, league: "Turkey · Super Lig", home: "Erzurumspor FK", away: "Çorum FK", market: "Both Teams to Score", odds: 1.72, winChance: 78 }
        ];
    }
};

function buildDiverseSlip(targetMin, targetMax, dayType) {
    const fixtures = getSiteFixtures(dayType);
    let slipLegs = [];
    let totalOdds = 1.0;
    
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
