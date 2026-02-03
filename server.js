const express = require('express');
const fs = require('fs');
const app = express();
const PORT = 3000;
const LOG_FILE = 'agent_audit_log.jsonl';

app.use(express.static('public'));

app.get('/api/stats', (req, res) => {
    // Handle case where log file doesn't exist yet
    if (!fs.existsSync(LOG_FILE)) {
        return res.json({ 
            logs: [], 
            stats: { totalActions: 0, errors: 0, mood: 'WAITING' } 
        });
    }

    // Read and parse log file
    const fileContent = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = fileContent.trim().split('\n');
    
    // Parse each line as JSON
    const logs = lines.map(line => {
        try { return JSON.parse(line); } 
        catch (e) { return null; }
    }).filter(entry => entry !== null);

    // Define 'sentiments' and calculate the score
    const sentiments = logs.filter(l => l.type === 'ANALYTICS_SENTIMENT');
    const positive = sentiments.filter(l => l.content === 'POSITIVE').length;
    const negative = sentiments.filter(l => l.content === 'NEGATIVE').length;
    
    let currentMood = 'NEUTRAL';
    if (positive > negative) currentMood = 'POSITIVE';
    if (negative > positive) currentMood = 'NEGATIVE';

    // Count errors
    const errorCount = logs.filter(l => l.type === 'ERROR' || l.type === 'CRITICAL').length;

    // Send data to frontend
    res.json({
        logs: logs.reverse().slice(0, 50), 
        stats: {
            totalActions: logs.length,
            errors: errorCount,
            mood: currentMood
        }
    });
});

app.listen(PORT, () => {
    console.log(`\n📊 DASHBOARD ONLINE: http://localhost:${PORT}`);
});