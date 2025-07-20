const t = {
    title: 'Penny Game',
    subtitle: 'Lean Simulation - Measuring Flow and Lead Time',
    players: 'Players',
    playerCount: 'Number of Players',
    round: 'Round',
    roundChoice: 'Choose Round',
    roundOptions: [
        {
            number: 'Round 1',
            title: 'Batch of 20',
            description: 'Pass ALL 20 coins at once',
        },
        {
            number: 'Round 2',
            title: 'Batch of 1',
            description: 'Pass coins one by one',
        },
    ],
    configTitle: 'Current Configuration',
    configInfo: '5 players - Batch of 1 (one by one)',
    start: 'Start Round',
    reset: 'Reset',
    resultsTitle: 'Simulation Results',
    leanTitle: 'Lean Insights',
    insights: [
        'Batch Size: Observe the impact of batch size on cycle time',
        'Flow: Analyze bottlenecks and waiting times',
        'Lead Time: Compare individual time vs. total process time',
        'Continuous Improvement: Discuss possible optimizations',
    ],
}

export default t
