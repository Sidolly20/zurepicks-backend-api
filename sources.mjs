import express from 'express';
import cors from 'cors';
// If your bsd script is in the same folder, you can import it if needed:
// import { bsdFill } from './bsd.mjs';

const app = express();
app.use(cors());
app.use(express.json());

// 1. Your match pool (In production, this can load from your generated JSON file or cache)
function getActiveMatches() {
    return [
        { home: "Arsenal", away: "Burnley", market: "Home Win", odds: 1.35 },
        { home: "Real Madrid", away: "Elche", market: "Home Win", odds: 1.40 },
        { home: "Bayern Munich", away: "Bochum", market: "Over 2.5 Goals", odds: 1.55 },
        { home: "PSG", away: "Angers", market: "Home Win & Over 1.5", odds: 1.45 },
        { home: "Man City", away: "Luton", market: "Over 2.5 Goals", odds: 1.50 }
    ];
}

// 2. The 2.00 - 3.00 Odds Capping Engine
function buildTargetSlip(targetMin = 2.00, targetMax = 3.00) {
    const matches = getActiveMatches();
    let slipLegs = [];
    let totalOdds = 1.0;
    
    for (let match of matches) {
        if (totalOdds * match.odds <= targetMax + 0.2) {
            slipLegs.push(match);
            totalOdds *= match.odds;
        }
        if (totalOdds >= targetMin && totalOdds <= targetMax) {
            break; // Lock it in once we hit the sweet spot
        }
    }
    
    return {
        success: true,
        oddsRange: "2-3 Odds Banker",
        legs: slipLegs,
        totalOdds: Number(totalOdds.toFixed(2))
    };
}

// 3. AI Chat Endpoint (Called by your frontend button)
app.get('/api/ai-chat/get-safe-odds', (req, res) => {
    const slip = buildTargetSlip(2.00, 3.00);
    res.json(slip);
});

// 4. Server Listener
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`ZurePicks backend running smoothly on port ${PORT}`);
});
