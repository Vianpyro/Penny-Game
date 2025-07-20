const t = {
    title: '🪙 Penny Game',
    subtitle: 'Simulation Lean - Mesure du Flow et du Lead Time',
    players: 'Joueurs',
    playerCount: 'Nombre de Joueurs',
    round: 'Manche',
    roundChoice: 'Choix de la Manche',
    roundOptions: [
        {
            number: 'Manche 1',
            title: 'Batch de 20',
            description: "Passer TOUTES les 20 pièces d'un coup",
        },
        {
            number: 'Manche 2',
            title: 'Batch de 1',
            description: 'Passer les pièces une par une',
        },
    ],
    configTitle: 'Configuration Actuelle',
    configInfo: '5 joueurs - Batch de 1 (passage une par une)',
    start: 'Démarrer la Manche',
    reset: 'Réinitialiser',
    resultsTitle: '📊 Résultats de la Simulation',
    leanTitle: '💡 Enseignements Lean',
    insights: [
        "Batch Size: Observer l'impact de la taille des lots sur le temps de cycle",
        "Flow: Analyser les goulots d'étranglement et les temps d'attente",
        'Lead Time: Comparer le temps individuel vs. temps total du processus',
        'Amélioration Continue: Discuter des optimisations possibles',
    ],
}

export default t
