/**
 * Lean Agile Terminology Dictionary - French (English)
 * Optimized for clarity and international understanding
 */
export const LEAN_TERMS = {
    // Core Lean Concepts
    FLOW: "Flux (Flow)",
    BATCH_SIZE: "Taille de Lot (Batch Size)",
    LEAD_TIME: "Délai de Livraison (Lead Time)",
    CYCLE_TIME: "Temps de Cycle (Cycle Time)",
    THROUGHPUT: "Débit (Throughput)",
    WASTE: "Gaspillage (Waste/Muda)",
    VALUE_STREAM: "Flux de Valeur (Value Stream)",
    CONTINUOUS_IMPROVEMENT: "Amélioration Continue (Continuous Improvement/Kaizen)",

    // Production Concepts
    BOTTLENECK: "Goulot d'Étranglement (Bottleneck)",
    WORK_IN_PROGRESS: "Travail en Cours (Work in Progress/WIP)",
    QUEUE_TIME: "Temps d'Attente (Queue Time)",
    PROCESSING_TIME: "Temps de Traitement (Processing Time)",
    EFFICIENCY: "Efficacité (Efficiency)",
    PRODUCTIVITY: "Productivité (Productivity)",

    // Metrics and Measurements
    PERFORMANCE: "Performance",
    METRICS: "Métriques (Metrics)",
    KEY_PERFORMANCE_INDICATOR: "Indicateur Clé de Performance (Key Performance Indicator/KPI)",
    VELOCITY: "Vélocité (Velocity)",
    CADENCE: "Cadence",

    // Process Improvement
    OPTIMIZATION: "Optimisation (Optimization)",
    STANDARDIZATION: "Standardisation (Standardization)",
    VISUAL_MANAGEMENT: "Management Visuel (Visual Management)",
    PULL_SYSTEM: "Système en Flux Tiré (Pull System)",
    PUSH_SYSTEM: "Système en Flux Poussé (Push System)",

    // Team and Collaboration
    COLLABORATION: "Collaboration (Collaboration)",
    TEAMWORK: "Travail d'Équipe (Teamwork)",
    SYNCHRONIZATION: "Synchronisation (Synchronization)",
    COMMUNICATION: "Communication",
    COORDINATION: "Coordination",

    // Quality and Control
    QUALITY: "Qualité (Quality)",
    DEFECT: "Défaut (Defect)",
    ERROR: "Erreur (Error)",
    INSPECTION: "Inspection",
    VALIDATION: "Validation",

    // Game-Specific Terms
    SIMULATION: "Simulation",
    ROUND: "Manche (Round)",
    ROUNDS: "Manches (Rounds)",
    PLAYER: "Joueur (Player)",
    STATION: "Station",
    PRODUCTION_LINE: "Chaîne de Production (Production Line)",
    COINS_PROCESSED: "Pièces Traitées (Coins Processed)",
    COMPLETION_RATE: "Taux de Finalisation (Completion Rate)",

    // Time-Based Measurements
    TOTAL_TIME: "Temps Total (Total Time)",
    AVERAGE_TIME: "Temps Moyen (Average Time)",
    BEST_TIME: "Meilleur Temps (Best Time)",
    ELAPSED_TIME: "Temps Écoulé (Elapsed Time)",
    DURATION: "Durée (Duration)",

    // Results and Analysis
    INSIGHTS: "Enseignements (Insights)",
    ANALYSIS: "Analyse (Analysis)",
    COMPARISON: "Comparaison (Comparison)",
    TRENDS: "Tendances (Trends)",
    IMPROVEMENT_OPPORTUNITIES: "Opportunités d'Amélioration (Improvement Opportunities)",
};

/**
 * UI Text Replacements for Bilingual Display
 * Optimized for readability and space efficiency
 */
export const UI_REPLACEMENTS = {
    // Headers and Titles
    "Flow": LEAN_TERMS.FLOW,
    "Batch Size": LEAN_TERMS.BATCH_SIZE,
    "Lead Time": LEAN_TERMS.LEAD_TIME,
    "Cycle Time": LEAN_TERMS.CYCLE_TIME,
    "Waste": LEAN_TERMS.WASTE,
    "Continuous Improvement": LEAN_TERMS.CONTINUOUS_IMPROVEMENT,

    // Metrics
    "Efficiency": LEAN_TERMS.EFFICIENCY,
    "Performance": LEAN_TERMS.PERFORMANCE,
    "Throughput": LEAN_TERMS.THROUGHPUT,
    "Productivity": LEAN_TERMS.PRODUCTIVITY,

    // Process Terms
    "Bottleneck": LEAN_TERMS.BOTTLENECK,
    "Queue Time": LEAN_TERMS.QUEUE_TIME,
    "Processing Time": LEAN_TERMS.PROCESSING_TIME,
    "Work in Progress": LEAN_TERMS.WORK_IN_PROGRESS,

    // Analysis Terms
    "Insights": LEAN_TERMS.INSIGHTS,
    "Analysis": LEAN_TERMS.ANALYSIS,
    "Optimization": LEAN_TERMS.OPTIMIZATION,
    "Improvement": LEAN_TERMS.CONTINUOUS_IMPROVEMENT,
};

/**
 * Enhanced French localization with bilingual Lean terms
 */
export const ENHANCED_FRENCH_LOCALE = {
    title: 'Penny Game',
    subtitle: `${LEAN_TERMS.SIMULATION} Lean - Mesure du ${LEAN_TERMS.FLOW} et du ${LEAN_TERMS.LEAD_TIME}`,
    players: 'Joueurs (Players)',
    playerCount: 'Nombre de Joueurs (Player Count)',
    round: 'Manche (Round)',
    roundChoice: 'Choix de la Manche (Round Choice)',

    // Enhanced round options with Lean terminology
    roundOptions: [
        {
            number: 'Manche 1 (Round 1)',
            title: `${LEAN_TERMS.BATCH_SIZE} de 20`,
            description: `Passer TOUTES les 20 pièces d\'un coup - ${LEAN_TERMS.PUSH_SYSTEM}`,
        },
        {
            number: 'Manche 2 (Round 2)',
            title: `${LEAN_TERMS.BATCH_SIZE} de 1`,
            description: `Passer les pièces une par une - ${LEAN_TERMS.PULL_SYSTEM}`,
        },
    ],

    configTitle: 'Configuration Actuelle (Current Configuration)',
    configInfo: `5 joueurs - ${LEAN_TERMS.BATCH_SIZE} de 1 (passage une par une)`,
    start: 'Démarrer la Manche (Start Round)',
    reset: 'Réinitialiser (Reset)',
    resultsTitle: 'Résultats de la Simulation (Simulation Results)',
    leanTitle: `${LEAN_TERMS.INSIGHTS.split(' ')[0]} Lean (Lean ${LEAN_TERMS.INSIGHTS.split(' ')[1]})`,

    // Enhanced insights with bilingual terminology
    insights: [
        `${LEAN_TERMS.BATCH_SIZE}: Observer l'impact de la ${LEAN_TERMS.BATCH_SIZE} sur le ${LEAN_TERMS.CYCLE_TIME}`,
        `${LEAN_TERMS.FLOW}: Analyser les ${LEAN_TERMS.BOTTLENECK} et les ${LEAN_TERMS.QUEUE_TIME}`,
        `${LEAN_TERMS.LEAD_TIME}: Comparer le temps individuel vs. temps total du processus`,
        `${LEAN_TERMS.CONTINUOUS_IMPROVEMENT}: Discuter des ${LEAN_TERMS.OPTIMIZATION}s possibles`,
    ],

    // Game mechanics with Lean terms
    gameTerms: {
        efficiency: `${LEAN_TERMS.EFFICIENCY} (pièces/min)`,
        throughput: `${LEAN_TERMS.THROUGHPUT}`,
        cycleTime: `${LEAN_TERMS.CYCLE_TIME}`,
        leadTime: `${LEAN_TERMS.LEAD_TIME}`,
        waste: `${LEAN_TERMS.WASTE}`,
        bottleneck: `${LEAN_TERMS.BOTTLENECK}`,
        flow: `${LEAN_TERMS.FLOW}`,
        valueStream: `${LEAN_TERMS.VALUE_STREAM}`,
        workInProgress: `${LEAN_TERMS.WORK_IN_PROGRESS}`,
        queueTime: `${LEAN_TERMS.QUEUE_TIME}`,
    }
};

/**
 * Utility function to apply bilingual terms to HTML content
 * Optimized for performance and readability
 */
export function applyBilingualTerms(element) {
    if (!element) return;

    // Get all text nodes and replace Lean terms
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    const textNodes = [];
    let node;

    // Collect text nodes first to avoid live NodeList issues
    while (node = walker.nextNode()) {
        textNodes.push(node);
    }

    // Apply replacements efficiently
    textNodes.forEach(textNode => {
        let content = textNode.textContent;
        let modified = false;

        // Replace UI terms with bilingual versions
        Object.entries(UI_REPLACEMENTS).forEach(([english, bilingual]) => {
            const regex = new RegExp(`\\b${english}\\b`, 'gi');
            if (regex.test(content)) {
                content = content.replace(regex, bilingual);
                modified = true;
            }
        });

        if (modified) {
            textNode.textContent = content;
        }
    });
}

/**
 * Enhanced insight generation with bilingual terminology
 * For use in results and analysis sections
 */
export function generateBilingualInsights(gameData) {
    const insights = [];

    if (!gameData) {
        return [
            `${LEAN_TERMS.BATCH_SIZE}: Tester différentes tailles de lots pour observer leur impact`,
            `${LEAN_TERMS.FLOW}: Identifier les ${LEAN_TERMS.BOTTLENECK} dans votre processus`,
            `${LEAN_TERMS.LEAD_TIME}: Mesurer le délai entre le début et la fin du processus`,
            `${LEAN_TERMS.CONTINUOUS_IMPROVEMENT}: Chercher constamment des opportunités d'amélioration`,
        ];
    }

    const { batchSizeImpact, totalTime, averageTime, playerCount } = gameData;

    // Batch Size Analysis
    if (batchSizeImpact && Object.keys(batchSizeImpact).length > 1) {
        const batchSizes = Object.keys(batchSizeImpact).map(Number).sort((a, b) => a - b);
        const smallBatch = batchSizeImpact[batchSizes[0]];
        const largeBatch = batchSizeImpact[batchSizes[batchSizes.length - 1]];

        if (smallBatch.avgTime < largeBatch.avgTime) {
            const improvement = ((largeBatch.avgTime - smallBatch.avgTime) / largeBatch.avgTime * 100).toFixed(0);
            insights.push(
                `${LEAN_TERMS.BATCH_SIZE}: Les petits lots réduisent le ${LEAN_TERMS.CYCLE_TIME} de ${improvement}% - réduction du ${LEAN_TERMS.WASTE}`
            );
        }

        insights.push(
            `${LEAN_TERMS.FLOW}: Les petits lots permettent un meilleur ${LEAN_TERMS.FLOW} et réduisent les ${LEAN_TERMS.BOTTLENECK}`
        );
    }

    // Lead Time Analysis
    if (totalTime && averageTime) {
        const waitTime = totalTime - averageTime;
        if (waitTime > averageTime * 0.5) {
            insights.push(
                `${LEAN_TERMS.LEAD_TIME}: Important ${LEAN_TERMS.QUEUE_TIME} détecté - optimiser le ${LEAN_TERMS.FLOW} pour réduire le ${LEAN_TERMS.WASTE}`
            );
        }
    }

    // Team Performance
    if (playerCount > 2) {
        insights.push(
            `${LEAN_TERMS.COLLABORATION}: Plus de joueurs nécessite une meilleure ${LEAN_TERMS.SYNCHRONIZATION} et ${LEAN_TERMS.COMMUNICATION}`
        );
    }

    // Continuous Improvement
    insights.push(
        `${LEAN_TERMS.CONTINUOUS_IMPROVEMENT}: Chaque itération est une opportunité d'${LEAN_TERMS.OPTIMIZATION} du processus`
    );

    return insights;
}

/**
 * Enhanced DOM utility for updating specific elements with bilingual terms
 * Optimized for common game elements
 */
export function updateElementWithBilingualTerm(elementId, term, value = '') {
    const element = document.getElementById(elementId);
    if (!element || !LEAN_TERMS[term]) return;

    const bilingualTerm = LEAN_TERMS[term];

    // Handle different types of updates
    if (element.tagName === 'LABEL' || element.classList.contains('stat-label')) {
        element.textContent = bilingualTerm;
    } else if (element.classList.contains('section-title') || element.tagName.startsWith('H')) {
        element.innerHTML = `${element.innerHTML.split('(')[0].trim()} - ${bilingualTerm}`;
    } else {
        element.textContent = value ? `${bilingualTerm}: ${value}` : bilingualTerm;
    }
}

/**
 * Batch update function for efficiency
 * Updates multiple elements at once
 */
export function updateMultipleElementsWithBilingualTerms(updates) {
    updates.forEach(({ elementId, term, value }) => {
        updateElementWithBilingualTerm(elementId, term, value);
    });
}

/**
 * CSS class generator for bilingual styling
 * Helps maintain consistent styling for bilingual content
 */
export function getBilingualCSSClasses() {
    return `
        .bilingual-term {
            font-weight: 600;
            color: #2c3e50;
        }
        
        .bilingual-term .english {
            color: #7f8c8d;
            font-size: 0.9em;
            font-style: italic;
        }
        
        .lean-insight .bilingual-term {
            color: #27ae60;
            font-weight: 700;
        }
        
        .stat-label.bilingual {
            font-size: 0.85em;
            line-height: 1.2;
        }
        
        @media screen and (max-width: 768px) {
            .bilingual-term {
                font-size: 0.9em;
            }
            
            .stat-label.bilingual {
                font-size: 0.8em;
            }
        }
    `;
}

/**
 * Auto-initialization function
 * Call this to automatically apply bilingual terms to the entire page
 */
export function initializeBilingualTerms() {
    // Apply to document body
    applyBilingualTerms(document.body);

    // Add CSS styles
    const style = document.createElement('style');
    style.textContent = getBilingualCSSClasses();
    document.head.appendChild(style);

    // Set up mutation observer for dynamic content
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        applyBilingualTerms(node);
                    }
                });
            }
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log('✅ Bilingual Lean terminology initialized');
}

// Export everything for maximum flexibility
export default {
    LEAN_TERMS,
    UI_REPLACEMENTS,
    ENHANCED_FRENCH_LOCALE,
    applyBilingualTerms,
    generateBilingualInsights,
    updateElementWithBilingualTerm,
    updateMultipleElementsWithBilingualTerms,
    getBilingualCSSClasses,
    initializeBilingualTerms
};
