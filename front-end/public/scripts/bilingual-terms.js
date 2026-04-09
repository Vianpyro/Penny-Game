/**
 * Bilingual Lean terminology for the Penny Game.
 */

export const LEAN_TERMS = {
    BATCH_SIZE: 'Taille de lot (Batch Size)',
    LEAD_TIME: 'Lead Time',
    THROUGHPUT: 'Débit (Throughput)',
    FLOW: 'Flux (Flow)',
    WIP: 'En-cours (WIP)',
    TOTAL_TIME: 'Temps total',
    AVERAGE_TIME: 'Temps moyen',
    BEST_TIME: 'Meilleur temps',
    CYCLE_TIME: 'Temps de cycle (Cycle Time)',
}

export function generateBilingualInsights(data) {
    const insights = []
    const { batchSizeImpact, totalTime, averageTime, playerCount } = data

    const sizes = Object.keys(batchSizeImpact || {}).map(Number).sort((a, b) => b - a)

    if (sizes.length >= 2) {
        const large = batchSizeImpact[sizes[0]]
        const small = batchSizeImpact[sizes[sizes.length - 1]]
        if (large.avgTime > 0 && small.avgTime > 0) {
            const improvement = Math.round((1 - small.avgTime / large.avgTime) * 100)
            if (improvement > 0) {
                insights.push(`📉 Réduire la ${LEAN_TERMS.BATCH_SIZE} de ${sizes[0]} à ${sizes[sizes.length - 1]} a amélioré le temps de ${improvement}%`)
            }
        }
        if (large.avgLeadTime > 0 && small.avgLeadTime > 0) {
            const ltImprovement = Math.round((1 - small.avgLeadTime / large.avgLeadTime) * 100)
            if (ltImprovement > 0) {
                insights.push(`⏱️ Le ${LEAN_TERMS.LEAD_TIME} a diminué de ${ltImprovement}% avec des lots plus petits`)
            }
        }
    }

    if (playerCount >= 3) {
        insights.push(`👥 Avec ${playerCount} joueurs, le travail en parallèle optimise le ${LEAN_TERMS.FLOW}`)
    }

    insights.push(`💡 En Lean, réduire la taille des lots (${LEAN_TERMS.BATCH_SIZE}) diminue le ${LEAN_TERMS.LEAD_TIME} et améliore le ${LEAN_TERMS.THROUGHPUT}`)

    if (sizes.length >= 2) {
        insights.push(`🔄 Cet exercice illustre le concept de ${LEAN_TERMS.FLOW} continu vs production par lots`)
    }

    return insights
}
